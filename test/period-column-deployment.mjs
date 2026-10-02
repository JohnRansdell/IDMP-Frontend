import { api, check, checks, finish, pause, poll, run, save } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const prefix = `PERIOD_COLUMN_${Date.now()}`
const fixtures = { factors: [], indicators: [] }
const period = { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-01-02T00:00:00' }
const filter = { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: '3' }
const standard = {
  schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: 'TEMPORAL',
  primaryDomain: { domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', sourceAlias: 'base' },
  periodColumn: 'SurgeryStartTime', filters: filter, aggregation: { function: 'COUNT' },
  groupBy: [], parameters: [], output: { valueType: 'DECIMAL', scale: 0 }, missingRowPolicy: 'ZERO'
}
const legacy = structuredClone(standard)
delete legacy.periodColumn
legacy.filters = { nodeType: 'AND', children: [filter, { nodeType: 'PREDICATE', fieldCode: 'SurgeryStartTime', operator: 'BETWEEN', parameter: 'period' }] }
const definitions = {
  ROOT: standard,
  QUALIFIED: { ...standard, periodColumn: 'base.SurgeryStartTime' },
  LEGACY: legacy,
  STATIC: { ...standard, calculationMode: 'STATIC', periodColumn: undefined },
  SQL: {
    schemaVersion: '1.0', dslType: 'FACTOR', definitionType: 'SQL', calculationMode: 'TEMPORAL',
    // These are the existing compiler's internal period placeholders, not user business parameters.
    sqlTemplate: "SELECT COUNT(*) AS factor_value FROM vmq_surgeryinfo s WHERE s.surgery_level='3' AND s.SurgeryStartTime >= :periodStart AND s.SurgeryStartTime < :periodEnd",
    periodColumn: 's.SurgeryStartTime', output: { valueType: 'DECIMAL', scale: 0 }, parameters: [], missingRowPolicy: 'ZERO'
  }
}

try {
  const truth = (await db('SOURCE', "SELECT JSON_OBJECT('all',COUNT(*),'period',SUM(SurgeryStartTime >= '2026-01-01' AND SurgeryStartTime < '2026-01-02')) FROM vmq_surgeryinfo WHERE surgery_level='3'"))[0]
  await save('source-truth', truth)
  for (const [name, dsl] of Object.entries(definitions)) await run(`${name}-lifecycle`, async () => {
    const factor = await api('POST', '/factors', { code: `${prefix}_${name}`, name: `统一时间字段验收 ${prefix} ${name}`, category: 'QUALITY', dsl })
    fixtures.factors.push(factor.id); await save('fixtures', fixtures)
    const versionId = factor.draftVersionId
    const compiled = await api('POST', `/factor-versions/${versionId}/compile`)
    if (!check(`${name}-compiled`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compiled.status), compiled)) throw new Error('编译失败')
    const artifact = await api('GET', `/compile-artifacts/${compiled.artifactId}`)
    const binding = artifact.logicalPlan?.periodBinding
    check(`${name}-time-binding`, name === 'STATIC' ? !binding : binding?.physicalTable === 'vmq_surgeryinfo' && binding?.physicalColumn === 'SurgeryStartTime', binding)
    if (name === 'ROOT') {
      const recommendation = await api('GET', `/factor-versions/${versionId}/trial-period-recommendation`)
      check(`${name}-source-range`, recommendation.availabilityStatus === 'AVAILABLE', recommendation)
    }
    const trial = await api('POST', `/factor-versions/${versionId}/trial`, name === 'STATIC' ? {} : period)
    await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 90000)
    const results = await api('GET', `/factor-versions/${versionId}/trials/${trial.batchId}/results`)
    const rows = results.results?.records || results.records || []
    const expected = name === 'STATIC' ? truth.all : truth.period
    check(`${name}-exact-source-value`, rows.length === 1 && Number(rows[0].valueDecimal ?? rows[0].value) === Number(expected), { expected, rows })
    await api('POST', `/factor-versions/${versionId}/publish`)
    check(`${name}-published`, (await api('GET', `/factor-versions/${versionId}`)).status === 'PUBLISHED')
    await save(name, { factor, compiled, artifact, results })
    if (['ROOT', 'SQL'].includes(name)) {
      const indicator = await api('POST', '/indicators', { code: `${prefix}_${name}_I`, name: `统一时间字段指标验收 ${prefix} ${name}`, category: 'QUALITY' })
      fixtures.indicators.push(indicator.id); await save('fixtures', fixtures)
      const version = await api('POST', `/indicators/${indicator.id}/versions`, {
        calculationMode: 'TEMPORAL', dimensionGrain: [], drillPaths: [],
        formula: { schemaVersion: '1.0', astType: 'INDICATOR_FORMULA', root: { nodeType: 'FACTOR_REF', nodeId: 'root', factorVersionId: versionId }, display: { format: 'NUMBER', scale: 0, multiplier: '1', roundingMode: 'HALF_UP' } }
      })
      const compilation = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
      if (!check(`${name}-indicator-compiled`, ['VALID', 'VALID_WITH_WARNINGS'].includes(compilation.status), compilation)) throw new Error('指标编译失败')
      const trial = await api('POST', `/indicator-versions/${version.id}/trial`, period)
      await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 90000)
      const targets = await db('PLATFORM', `SELECT JSON_OBJECT('path',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillPathCode')),'level',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillLevelCode'))) FROM job_calc_target WHERE batch_id=${trial.batchId}`)
      check(`${name}-four-time-targets`, JSON.stringify(targets.filter(t => t.path === 'TIME').map(t => t.level).sort()) === JSON.stringify(['DAY', 'MONTH', 'QUARTER', 'YEAR']), targets)
      await save(`${name}-indicator`, { version, trial, targets, results: await api('GET', `/indicator-versions/${version.id}/trials/${trial.batchId}/results`) })
    }
  })
} finally {
  for (const type of ['indicators', 'factors']) for (const id of fixtures[type]) await run(`cleanup-${id}`, async () => {
    let impact
    for (let i = 0; i < 45; i++) { impact = await api('GET', `/${type}/${id}/deletion-impact`); if (impact.deletable) break; await pause(1000) }
    if (!impact.deletable) throw new Error(JSON.stringify(impact))
    const detail = await api('GET', `/${type}/${id}`)
    await api('DELETE', `/${type}/${id}`, { resourceVersion: detail.resourceVersion, deleteReason: '统一时间字段验收结束' })
    check(`recycled-${id}`, true)
  })
  await save('fixtures', fixtures); await finish()
  if (checks.some(item => !item.passed)) process.exitCode = 1
}
