import { api, check, checks, finish, poll, rows, save, run, pause } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const code = `TIME_CANDIDATE_${Date.now()}`
const table = 'vmq_basicinformationba'
const fixtures = { domainId: null, factors: [], indicators: [], importId: null }
const period = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-02-01T00:00:00' }
try {
  const options = rows(await api('GET', `/meta/source-tables/${table}/time-fields`))
  const text = options.find(field => field.columnName === 'out_date')
  check('unmarked-text-time-is-a-candidate', text?.columnType === 'varchar(32)' && text.requiresConfirmation && text.sampledValueCount <= 100, text)
  check('native-time-is-also-a-candidate', options.some(field => field.columnName === 'create_date' && !field.requiresConfirmation))
  const sqlImport = await api('POST', '/sql-imports', { sql: `SELECT COUNT(*) AS ${code}_value FROM ${table}`, definitionType: 'SQL' })
  fixtures.importId = sqlImport.importId; await save('fixtures', fixtures)
  const preview = await poll(`/sql-imports/${sqlImport.importId}`, ['AWAITING_METADATA'])
  const sqlCandidates = preview.preview?.factors?.[0]?.timeFieldOptions || []
  check('sql-and-ordinary-factor-share-candidates', options.every(field => sqlCandidates.some(option => option.columnName === field.columnName)), { options, sqlCandidates })
  const truth = (await db('SOURCE', `SELECT JSON_OBJECT('value',COUNT(*)) FROM ${table} WHERE out_date >= '2026-01-01' AND out_date < '2026-02-01'`))[0]
  const domain = await api('POST', '/meta/data-domains', { code, name: `普通因子时间候选验收 ${code}` })
  fixtures.domainId = domain.id; await save('fixtures', fixtures)
  await api('POST', `/meta/data-domains/${domain.id}/physical-tables`, { tableName: table })
  const fieldsPath = `/meta/data-domains/${domain.id}/physical-tables/${table}/semantic-fields`
  const fields = rows(await api('GET', fieldsPath))
  const selected = fields.find(field => field.sourceFieldName.toLowerCase() === 'out_date')
  const native = fields.find(field => field.sourceFieldName.toLowerCase() === 'create_date')
  const primary = fields.find(field => field.sourceFieldName.toLowerCase() === 'in_hospital_id')
  check('selected-field-remains-unmarked-string', selected?.dataType === 'STRING', selected)
  await api('PATCH', `/meta/data-domains/${domain.id}/physical-tables/${table}/default-time-field`, { semanticFieldCode: native.code })
  let detail = await api('GET', `/meta/data-domains/${domain.id}`)
  await api('PATCH', `/meta/data-domains/${domain.id}`, { resourceVersion: detail.resourceVersion, name: domain.name,
    primaryKeySemanticFieldId: primary.id, defaultTimeSemanticFieldId: native.id })
  const valid = await api('POST', `/meta/data-domains/${domain.id}/validate`)
  check('test-domain-valid', valid.valid, valid)
  detail = await api('GET', `/meta/data-domains/${domain.id}`)
  await api('POST', `/meta/data-domains/${domain.id}/publish`, { resourceVersion: detail.resourceVersion })
  const dsl = { schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: 'TEMPORAL', periodColumn: 'out_date',
    primaryDomain: { domainCode: code, tableName: table }, filters: { nodeType: 'TRUE' }, aggregation: { function: 'COUNT' },
    groupBy: [], parameters: [], output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO' }
  const factor = await api('POST', '/factors', { code: `${code}_F`, name: `未标注文本时间因子 ${code}`, dsl })
  fixtures.factors.push(factor.id); await save('fixtures', fixtures)
  const fv = factor.draftVersionId
  const compiled = await api('POST', `/factor-versions/${fv}/compile`)
  check('ordinary-factor-compiles-text-period', ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)
  const artifact = await api('GET', `/compile-artifacts/${compiled.artifactId}`)
  const binding = artifact.logicalPlan?.periodBinding
  check('period-conversion-is-frozen-not-default', binding?.physicalColumn === 'out_date' && binding?.typeConversion?.format === 'ISO', binding)
  check('domain-mapping-not-modified', rows(await api('GET', fieldsPath)).find(field => field.id === selected.id)?.dataType === 'STRING')
  const recommendation = await api('GET', `/factor-versions/${fv}/trial-period-recommendation`)
  check('converted-period-availability', recommendation.availabilityStatus === 'AVAILABLE', recommendation)
  const trial = await api('POST', `/factor-versions/${fv}/trial`, period)
  await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 120000)
  const result = await api('GET', `/factor-versions/${fv}/trials/${trial.batchId}/results`)
  const values = rows(result.results || result)
  check('factor-count-matches-source', values.length === 1 && Number(values[0].valueDecimal ?? values[0].value) === Number(truth.value), { truth, values })
  await api('POST', `/factor-versions/${fv}/publish`)
  const indicator = await api('POST', '/indicators', { code: `${code}_I`, name: `文本时间年月日验收 ${code}`, category: 'QUALITY' })
  fixtures.indicators.push(indicator.id); await save('fixtures', fixtures)
  const version = await api('POST', `/indicators/${indicator.id}/versions`, { calculationMode: 'TEMPORAL', dimensionGrain: [], drillPaths: [],
    formula: { schemaVersion: '1.0', astType: 'INDICATOR_FORMULA', root: { nodeType: 'FACTOR_REF', nodeId: 'root', factorVersionId: fv },
      display: { format: 'NUMBER', scale: 0, multiplier: '1', roundingMode: 'HALF_UP' } } })
  const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
  check('indicator-compile', ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)
  const indicatorTrial = await api('POST', `/indicator-versions/${version.id}/trial`, period)
  await poll(`/async-tasks/${indicatorTrial.taskId}`, ['SUCCEEDED'], 180000)
  const targets = await db('PLATFORM', `SELECT JSON_OBJECT('level',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillLevelCode')),'status',status) FROM job_calc_target WHERE batch_id=${indicatorTrial.batchId}`)
  check('four-time-targets-complete', ['YEAR', 'QUARTER', 'MONTH', 'DAY'].every(level => targets.some(target => target.level === level && target.status === 'READY')), targets)
  const sums = await db('PLATFORM', `SELECT JSON_OBJECT('level',MAX(JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.drillLevelCode'))),'value',SUM(r.result_value)) FROM job_calc_target t JOIN rsl_indicator_result r ON r.calc_target_id=t.id AND r.result_set_id=t.result_set_id WHERE t.batch_id=${indicatorTrial.batchId} AND JSON_UNQUOTE(JSON_EXTRACT(t.payload_json,'$.drillPathCode'))='TIME' GROUP BY t.id`)
  check('all-four-grains-match-source', sums.length === 4 && sums.every(row => Number(row.value) === Number(truth.value)), { truth, sums })
  await save('artifact', artifact)
} catch (error) { check('live-lifecycle', false, error.message) }
finally {
  if (fixtures.importId) await run('abandon-test-import', () => api('POST', `/sql-imports/${fixtures.importId}/abandon`, { reason: '时间候选验收完成，清理测试解析会话' }))
  for (const type of ['indicators', 'factors']) for (const id of fixtures[type]) await run(`cleanup-${id}`, async () => {
    let impact
    for (let i = 0; i < 30; i++) { impact = await api('GET', `/${type}/${id}/deletion-impact`); if (impact.deletable) break; await pause(1000) }
    if (!impact.deletable) throw new Error('验收资源仍被使用，保留资源等待处理')
    const detail = await api('GET', `/${type}/${id}`)
    await api('DELETE', `/${type}/${id}`, { resourceVersion: detail.resourceVersion, deleteReason: '时间候选验收完成，回收独立测试资源' })
  })
  if (fixtures.domainId) await run('disable-test-domain', async () => {
    const detail = await api('GET', `/meta/data-domains/${fixtures.domainId}`)
    if (detail.code !== code) throw new Error('数据域不是本次创建的验收资源，停止清理')
    await api('POST', `/meta/data-domains/${fixtures.domainId}/disable`, { resourceVersion: detail.resourceVersion, force: true })
  })
  await save('fixtures', fixtures)
  await finish()
  if (checks.some(item => !item.passed)) process.exitCode = 1
}
