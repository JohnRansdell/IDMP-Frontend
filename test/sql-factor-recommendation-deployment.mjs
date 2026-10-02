import { api, check, checks, finish, poll, run, save } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const fixtures = []
const prefix = `SQL_RECOMMEND_${Date.now()}`
const sourceScope = "FROM vmq_basicinformationzy b JOIN vmq_inpatienttransferdetail t ON b.In_Hospital_ID=t.In_Hospital_ID WHERE t.In_Dept_Date >= b.In_Date AND TIMESTAMPDIFF(HOUR,b.In_Date,t.In_Dept_Date)<=48"

async function verifyRecommendation(versionId, scope, column) {
  const recommendation = await api('GET', `/factor-versions/${versionId}/trial-period-recommendation`)
  await save(`recommendation-${versionId}`, recommendation)
  check(`${versionId}-available`, recommendation.availabilityStatus === 'AVAILABLE', recommendation)
  const range = (await db('SOURCE', `SELECT JSON_OBJECT('earliest',MIN(DATE(${column})),'latest',MAX(DATE(${column}))) ${scope}`))[0]
  check(`${versionId}-exact-source-range`, recommendation.earliestDataDate === range.earliest && recommendation.latestDataDate === range.latest, { range, recommendation })
  const daily = await db('SOURCE', `SELECT JSON_OBJECT('date',data_date,'count',source_count) FROM (SELECT DATE(${column}) data_date,COUNT(*) source_count ${scope} AND ${column} >= DATE_SUB('${range.latest}',INTERVAL 30 DAY) AND ${column} < DATE_ADD('${range.latest}',INTERVAL 1 DAY) GROUP BY DATE(${column})) daily ORDER BY data_date DESC`)
  let expected = 0
  for (const day of daily) { if (expected > 0 && expected + day.count > 1000) break; expected += day.count; if (expected > 1000) break }
  const selected = (await db('SOURCE', `SELECT JSON_OBJECT('count',COUNT(*)) ${scope} AND ${column}>='${recommendation.recommendedPeriodStart}' AND ${column}<'${recommendation.recommendedPeriodEnd}'`))[0]
  check(`${versionId}-exact-workload`, recommendation.estimatedMatchedRecordCount === expected && selected.count === expected, { expected, selected, daily })
  await save(`source-${versionId}`, { range, daily, selected })
  return recommendation
}

try {
  await run('existing-sql-factor', () => verifyRecommendation('102027642461312819', sourceScope, 'b.In_Date'))
  for (const mode of ['SQL', 'ORDINARY']) await run(`${mode}-lifecycle`, async () => {
    const scope = mode === 'SQL' ? sourceScope : "FROM vmq_surgeryinfo s WHERE s.surgery_level='3'"
    const column = mode === 'SQL' ? 'b.In_Date' : 's.SurgeryStartTime'
    const dsl = mode === 'SQL' ? {
      schemaVersion: '1.0', dslType: 'FACTOR', definitionType: 'SQL', calculationMode: 'TEMPORAL',
      sqlTemplate: `SELECT COUNT(DISTINCT b.In_Hospital_ID) AS factor_value ${scope} [[AND b.name LIKE CONCAT('%', {{patientName}}, '%')]] AND b.In_Date >= :periodStart AND b.In_Date < :periodEnd`,
      periodColumn: column, parameters: [{ code: 'patientName', type: 'STRING', required: false, parameterMode: 'TEMPORARY' }],
      output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO'
    } : {
      schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: 'TEMPORAL',
      primaryDomain: { domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', sourceAlias: 's' },
      periodColumn: column, filters: { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: '3' },
      aggregation: { function: 'COUNT' }, groupBy: [], parameters: [], output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO'
    }
    const factor = await api('POST', '/factors', { code: `${prefix}_${mode}`, name: `SQL因子推荐周期验收 ${prefix} ${mode}`, category: 'QUALITY', dsl })
    fixtures.push(factor.id); await save('fixtures', fixtures)
    const compiled = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`)
    if (!check(`${mode}-compiled`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)) throw new Error('编译失败')
    const recommendation = await verifyRecommendation(factor.draftVersionId, scope, column)
    const period = { periodStart: recommendation.recommendedPeriodStart, periodEnd: recommendation.recommendedPeriodEnd }
    const trial = await api('POST', `/factor-versions/${factor.draftVersionId}/trial`, period)
    await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 90000)
    const result = await api('GET', `/factor-versions/${factor.draftVersionId}/trials/${trial.batchId}/results`)
    const records = result.results?.records || result.records || []
    const truth = (await db('SOURCE', `SELECT JSON_OBJECT('value',${mode === 'SQL' ? 'COUNT(DISTINCT b.In_Hospital_ID)' : 'COUNT(*)'}) ${scope} AND ${column}>='${period.periodStart}' AND ${column}<'${period.periodEnd}'`))[0]
    check(`${mode}-recommended-period-trial-exact`, records.length === 1 && Number(records[0].valueDecimal ?? records[0].value) === truth.value, { truth, records })
    await api('POST', `/factor-versions/${factor.draftVersionId}/publish`)
    check(`${mode}-published`, (await api('GET', `/factor-versions/${factor.draftVersionId}`)).status === 'PUBLISHED')
    await save(`${mode}-trial`, { trial, result, truth })
  })
} finally {
  for (const id of fixtures) await run(`cleanup-${id}`, async () => {
    const detail = await api('GET', `/factors/${id}`)
    const impact = await api('GET', `/factors/${id}/deletion-impact`)
    if (!impact.deletable) throw new Error(JSON.stringify(impact))
    await api('DELETE', `/factors/${id}`, { resourceVersion: detail.resourceVersion, deleteReason: 'SQL因子推荐周期验收结束' })
    check(`recycled-${id}`, true)
  })
  await finish()
  if (checks.some(item => !item.passed)) process.exitCode = 1
}
