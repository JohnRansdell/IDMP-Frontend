import { api, check, checks, finish, poll, rows, run, save, pause } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const code = `FIELD_TYPE_${Date.now()}`
const table = 'vmq_basicinformationba'
const fixtures = { factors: [], indicators: [], domainId: null }
const period = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00' }
try {
  const truth = (await db('SOURCE', `SELECT JSON_OBJECT('total',COUNT(*),'period',SUM(out_date >= '2026-01-01' AND out_date < '2026-02-01'),'first',MIN(DATE(out_date)),'last',MAX(DATE(out_date))) FROM ${table}`))[0]
  await save('source-truth', truth)
  const domain = await api('POST', '/meta/data-domains', { code, name: `字段类型转换验收 ${code}`, description: '独立验收数据域，不修改医院源数据' })
  fixtures.domainId = domain.id
  await save('fixtures', fixtures)
  await api('POST', `/meta/data-domains/${domain.id}/physical-tables`, { tableName: table })
  const mappingPath = `/meta/data-domains/${domain.id}/physical-tables/${table}/semantic-fields`
  let fields = rows(await api('GET', mappingPath))
  const original = fields.find(field => field.sourceFieldName.toLowerCase() === 'out_date')
  check('physical-type-remains-text', original?.dataType === 'STRING', original)
  const spec = { sourceFieldName: 'out_date', code: original.code, name: '出院日期', dataType: 'DATETIME', semanticKind: 'TIME', sensitive: false, conversionFormat: 'yyyy-MM-dd HH:mm:ss' }
  const mapped = await api('POST', mappingPath, spec)
  check('validated-manual-type-saved', mapped.dataType === 'DATETIME' && mapped.sourceDataType.startsWith('varchar') && mapped.conversionFormat === spec.conversionFormat, mapped)
  fields = rows(await api('GET', mappingPath))
  check('effective-type-survives-reload', fields.find(field => field.id === mapped.id)?.dataType === 'DATETIME')
  for (const override of [{ conversionFormat: 'yyyyMMdd' }, { dataType: 'INTEGER', conversionFormat: null }, { conversionFormat: "bad'format" }]) {
    const rejected = await api('POST', mappingPath, { ...spec, ...override }, { allowError: true })
    check('invalid-conversion-rejected', rejected.http === 400 && !rejected.message.includes('SQL'), rejected)
    const unchanged = rows(await api('GET', mappingPath)).find(field => field.id === mapped.id)
    check('rejected-save-retains-config', unchanged?.dataType === 'DATETIME' && unchanged.conversionFormat === spec.conversionFormat, unchanged)
  }
  const configured = await api('PATCH', `/meta/data-domains/${domain.id}/physical-tables/${table}/default-time-field`, { semanticFieldCode: mapped.code })
  check('text-column-can-be-default-time-after-validation', configured.defaultTimeSemanticFieldCode === mapped.code)
  // 重新接入会刷新源类型和字段画像，但不得覆盖显式转换或默认时间设置。
  await api('POST', `/meta/data-domains/${domain.id}/physical-tables`, { tableName: table })
  fields = rows(await api('GET', mappingPath))
  check('metadata-refresh-retains-manual-type', fields.find(field => field.id === mapped.id)?.dataType === 'DATETIME')
  const physical = rows(await api('GET', `/meta/data-domains/${domain.id}/physical-tables`))
  check('metadata-refresh-retains-default-time', physical.find(item => item.tableName === table)?.defaultTimeSemanticFieldCode === mapped.code)
  let detail = await api('GET', `/meta/data-domains/${domain.id}`)
  const primary = fields.find(field => field.sourceFieldName.toLowerCase() === 'in_hospital_id')
  await api('PATCH', `/meta/data-domains/${domain.id}`, { resourceVersion: detail.resourceVersion, name: domain.name, description: domain.description,
    primaryKeySemanticFieldId: primary.id, defaultTimeSemanticFieldId: mapped.id })
  const valid = await api('POST', `/meta/data-domains/${domain.id}/validate`)
  check('domain-validation', valid.valid, valid)
  detail = await api('GET', `/meta/data-domains/${domain.id}`)
  await api('POST', `/meta/data-domains/${domain.id}/publish`, { resourceVersion: detail.resourceVersion })
  const dsl = { schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: 'TEMPORAL',
    primaryDomain: { domainCode: code, tableName: table, sourceAlias: 'base' },
    filters: { nodeType: 'TRUE' }, aggregation: { function: 'COUNT' }, groupBy: [], parameters: [],
    output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO' }
  const factor = await api('POST', '/factors', { code: `${code}_F`, name: `文本时间字段计算验收 ${code}`, category: 'QUALITY', dsl })
  fixtures.factors.push(factor.id); await save('fixtures', fixtures)
  const fv = factor.draftVersionId
  const compiled = await api('POST', `/factor-versions/${fv}/compile`)
  check('factor-compiles-with-default-text-time', ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)
  const artifact = await api('GET', `/compile-artifacts/${compiled.artifactId}`)
  check('conversion-frozen-in-artifact', artifact.logicalPlan?.periodBinding?.typeConversion?.format === spec.conversionFormat
    && artifact.sqlTemplate.includes('IDMP_TYPE_CHECK'), artifact.logicalPlan?.periodBinding)
  await save('artifact', artifact)
  const recommendation = await api('GET', `/factor-versions/${fv}/trial-period-recommendation`)
  await save('recommendation', recommendation)
  check('source-period-recommendation', recommendation.availabilityStatus === 'AVAILABLE', recommendation)
  const trial = await api('POST', `/factor-versions/${fv}/trial`, period)
  await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 120000)
  const result = await api('GET', `/factor-versions/${fv}/trials/${trial.batchId}/results`)
  const values = rows(result.results || result)
  check('factor-period-value-equals-source', values.length === 1 && Number(values[0].valueDecimal ?? values[0].value) === Number(truth.period), { truth, values })
  await api('POST', `/factor-versions/${fv}/publish`)
  const indicator = await api('POST', '/indicators', { code: `${code}_I`, name: `字段转换年月日验收 ${code}`, category: 'QUALITY' })
  fixtures.indicators.push(indicator.id); await save('fixtures', fixtures)
  const version = await api('POST', `/indicators/${indicator.id}/versions`, { calculationMode: 'TEMPORAL', dimensionGrain: [], drillPaths: [],
    formula: { schemaVersion: '1.0', astType: 'INDICATOR_FORMULA', root: { nodeType: 'FACTOR_REF', nodeId: 'root', factorVersionId: fv },
      display: { format: 'NUMBER', scale: 0, multiplier: '1', roundingMode: 'HALF_UP' } } })
  const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
  check('indicator-compile', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  const indicatorTrial = await api('POST', `/indicator-versions/${version.id}/trial`, period)
  await poll(`/async-tasks/${indicatorTrial.taskId}`, ['SUCCEEDED'], 180000)
  const targets = await db('PLATFORM', `SELECT JSON_OBJECT('id',id,'path',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillPathCode')),'level',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillLevelCode')),'status',status) FROM job_calc_target WHERE batch_id=${indicatorTrial.batchId}`)
  check('four-time-grains-completed', ['YEAR', 'QUARTER', 'MONTH', 'DAY'].every(level => targets.some(target => target.path === 'TIME' && target.level === level && target.status === 'READY')), targets)
  const sums = await db('PLATFORM', `SELECT JSON_OBJECT('level',JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.drillLevelCode')),'value',SUM(r.result_value),'rows',COUNT(*)) FROM job_calc_target t JOIN rsl_indicator_result r ON r.calc_target_id=t.id AND r.result_set_id=t.result_set_id WHERE t.batch_id=${indicatorTrial.batchId} AND JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.drillPathCode'))='TIME' GROUP BY JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.drillLevelCode'))`)
  check('every-time-grain-matches-source', sums.length === 4 && sums.every(item => Number(item.value) === Number(truth.period)), { sums, expected: truth.period })
  await save('indicator-trial', { version, indicatorTrial, targets, result: await api('GET', `/indicator-versions/${version.id}/trials/${indicatorTrial.batchId}/results`) })
} catch (error) {
  check('live-lifecycle', false, error.message)
} finally {
  for (const type of ['indicators', 'factors']) for (const id of fixtures[type]) await run(`cleanup-${id}`, async () => {
    let impact
    for (let i = 0; i < 30; i++) { impact = await api('GET', `/${type}/${id}/deletion-impact`); if (impact.deletable) break; await pause(1000) }
    if (!impact.deletable) throw new Error('验收资源仍被使用，保留资源等待处理')
    const detail = await api('GET', `/${type}/${id}`)
    await api('DELETE', `/${type}/${id}`, { resourceVersion: detail.resourceVersion, deleteReason: '字段转换验收完成，回收独立测试资源' })
  })
  if (fixtures.domainId) await run('disable-test-domain', async () => {
    const detail = await api('GET', `/meta/data-domains/${fixtures.domainId}`)
    // 因子已回收，但发布版本的历史引用仍会保留；仅停用本脚本创建的独立数据域。
    if (detail.code !== code) throw new Error('数据域不是本次创建的验收资源，停止清理')
    await api('POST', `/meta/data-domains/${fixtures.domainId}/disable`, { resourceVersion: detail.resourceVersion, force: true })
  })
  await save('fixtures', fixtures)
  await finish()
  if (checks.some(check => !check.passed)) process.exitCode = 1
}
