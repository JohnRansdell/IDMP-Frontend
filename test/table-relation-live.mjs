import { api, check, checks, finish, poll, rows, save, run, pause } from './system-test-client.mjs'
import { db } from './system-db.mjs'
import { tableRelationPayload } from '../src/idmp/utils/tableRelation.js'
import { buildFactorDsl } from '../src/idmp/utils/dslBuilder.js'

const code = `INLINE_JOIN_${Date.now()}`
const fixtures = { relationId: null, factorId: null }
const source = { physicalTableBindingId: '102027642460323816', domainId: '102027642460323815', domainCode: 'JOIN_TRANSFER_20260910103944', tableName: 'vmq_inpatienttransferdetail' }
const target = { id: '102027642460323700', domainId: '102027642460323699', tableName: 'vmq_basicinformationzy' }
const period = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-01-02T00:00:00' }
function relationFields(fields) { return fields.map(field => ({ ...field, semanticFieldCode: field.code, relationDataType: field.dataType })) }

try {
  const left = rows(await api('GET', `/meta/data-domains/${source.domainId}/physical-tables/${source.tableName}/semantic-fields`))
  const right = rows(await api('GET', `/meta/data-domains/${target.domainId}/physical-tables/${target.tableName}/semantic-fields`))
  const leftKey = left.find(field => field.sourceFieldName.toLowerCase() === 'in_hospital_id')
  const rightKey = right.find(field => field.sourceFieldName.toLowerCase() === 'in_hospital_id')
  const payload = tableRelationPayload(source, target, { joinType: 'INNER', cardinality: 'MANY_TO_ONE', keys: [{ left: leftKey.code, right: rightKey.code }] }, relationFields(left), relationFields(right))
  let relation = await api('POST', '/meta/physical-table-relations', { code, ...payload })
  fixtures.relationId = relation.id; await save('fixtures', fixtures)
  check('关系草稿创建', relation.status === 'DRAFT', relation)
  const validation = await api('POST', `/meta/physical-table-relations/${relation.id}/validate`)
  check('跨数据域关联校验', validation.valid, validation)
  if (!validation.valid) throw new Error('关系校验失败')
  relation = await api('GET', `/meta/physical-table-relations/${relation.id}`)
  relation = await api('POST', `/meta/physical-table-relations/${relation.id}/publish`, { resourceVersion: relation.resourceVersion })
  check('关系发布可用', relation.status === 'PUBLISHED' && relation.enableStatus === 'ENABLED', relation)
  check('关联键持久化', relation.leftKeySpec.fieldCodes[0] === leftKey.code && relation.rightKeySpec.fieldCodes[0] === rightKey.code)
  check('已发布关系列表可查', rows(await api('GET', `/meta/physical-table-relations?physicalTableBindingId=${source.physicalTableBindingId}&status=PUBLISHED&enableStatus=ENABLED`)).some(item => item.id === relation.id))
  const dsl = buildFactorDsl({ domainCode: source.domainCode, tableName: source.tableName, sourceAlias: 'base',
    joins: [{ relationId: relation.id, fromAlias: 'base', sourceAlias: 'join1' }], aggregation: 'COUNT', periodColumn: 'in_dept_date', filters: { nodeType: 'TRUE' } })
  const factor = await api('POST', '/factors', { code: `${code}_F`, name: `关联区域直接配置验收 ${code}`, dsl })
  fixtures.factorId = factor.id; await save('fixtures', fixtures)
  const versionId = factor.draftVersionId
  const compilation = await api('POST', `/factor-versions/${versionId}/compile`)
  check('新关联因子编译', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  if (!['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status)) throw new Error('因子编译失败')
  const trial = await api('POST', `/factor-versions/${versionId}/trial`, period)
  await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 120000)
  const result = await api('GET', `/factor-versions/${versionId}/trials/${trial.batchId}/results`)
  const values = rows(result.results || result)
  const truth = (await db('SOURCE', "SELECT JSON_OBJECT('value',COUNT(*)) FROM vmq_inpatienttransferdetail t JOIN vmq_basicinformationzy b ON t.in_hospital_id=b.in_hospital_id WHERE t.in_dept_date>='2026-01-01' AND t.in_dept_date<'2026-01-02'"))[0]
  check('试算与源库JOIN结果一致', values.length === 1 && Number(values[0].valueDecimal ?? values[0].value) === Number(truth.value), { values, truth })
  check('真实数据非空', Number(truth.value) > 0, truth)
  const saved = await api('GET', `/factor-versions/${versionId}`)
  check('因子关联引用回显', saved.dsl?.joins?.[0]?.relationId === relation.id, saved.dsl)
  await save('trial', { trial, result, truth })
} catch (failure) { check('真实关联流程', false, failure.message) }
finally {
  if (fixtures.factorId) await run('清理测试因子', async () => {
    let impact
    for (let i = 0; i < 30; i++) {
      impact = await api('GET', `/factors/${fixtures.factorId}/deletion-impact`)
      if (impact.deletable) break
      await pause(1000)
    }
    if (!impact.deletable) throw new Error('测试因子仍在执行，保留资源等待处理')
    const factor = await api('GET', `/factors/${fixtures.factorId}`)
    if (factor.code !== `${code}_F`) throw new Error('测试资源身份不匹配，停止清理')
    await api('DELETE', `/factors/${fixtures.factorId}`, { resourceVersion: factor.resourceVersion, deleteReason: '关联配置验收结束，回收本次测试资源' })
    check('测试因子已回收', true)
  })
  if (fixtures.relationId) await run('停用测试关系', async () => {
    const relation = await api('GET', `/meta/physical-table-relations/${fixtures.relationId}`)
    if (relation.code !== code) throw new Error('测试关系身份不匹配，停止清理')
    const disabled = await api('POST', `/meta/physical-table-relations/${fixtures.relationId}/disable`, { resourceVersion: relation.resourceVersion })
    check('测试关系已停用', disabled.enableStatus === 'DISABLED', disabled)
  })
  await finish()
  if (checks.some(item => !item.passed)) process.exitCode = 1
}
