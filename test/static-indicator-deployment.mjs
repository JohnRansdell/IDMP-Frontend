import { api, check, checks, finish, poll, pause, run, save } from './system-test-client.mjs'
import { db } from './system-db.mjs'

const fixtures = { factors: [], indicators: [] }
const prefix = 'STATIC_FIX_' + Date.now()
try {
  for (const mode of ['STATIC', 'TEMPORAL']) await run(mode + '-deployed-regression', async () => {
    const temporal = mode === 'TEMPORAL'
    const period = temporal ? { periodStart: '2026-01-01T00:00:00', periodEnd: '2026-01-02T00:00:00' } : {}
    const filter = { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: '3' }
    const dsl = {
      schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: mode,
      primaryDomain: { domainCode: 'DASHBOARD_SURGERY_QUALITY_20260922', tableName: 'vmq_surgeryinfo', sourceAlias: 'base' },
      aggregation: { function: 'COUNT' },
      filters: temporal ? { nodeType: 'AND', children: [filter, { nodeType: 'PREDICATE', fieldCode: 'SurgeryStartTime', operator: 'BETWEEN', parameter: 'period' }] } : filter,
      groupBy: [], parameters: [], output: { valueType: 'DECIMAL', precision: 20, scale: 0, grain: [] }, missingRowPolicy: 'ZERO',
    }
    const factor = await api('POST', '/factors', { code: prefix + '_' + mode + '_F', name: '静态时间目标修复验收因子 ' + prefix + ' ' + mode, category: 'QUALITY', dsl })
    fixtures.factors.push(factor.id)
    await save('fixtures', fixtures)
    const compilation = await api('POST', `/factor-versions/${factor.draftVersionId}/compile`)
    if (!check(mode + '-factor-valid', compilation.status === 'VALID', compilation)) throw new Error('因子编译失败')
    const factorTrial = await api('POST', `/factor-versions/${factor.draftVersionId}/trial`, period)
    await poll(`/async-tasks/${factorTrial.taskId}`, ['SUCCEEDED'], 90000)
    await api('POST', `/factor-versions/${factor.draftVersionId}/publish`)
    const indicator = await api('POST', '/indicators', { code: prefix + '_' + mode + '_I', name: '静态时间目标修复验收指标 ' + prefix + ' ' + mode, category: 'QUALITY' })
    fixtures.indicators.push(indicator.id)
    await save('fixtures', fixtures)
    const version = await api('POST', `/indicators/${indicator.id}/versions`, {
      calculationMode: mode, dimensionGrain: [], drillPaths: [],
      formula: { schemaVersion: '1.0', astType: 'INDICATOR_FORMULA', root: { nodeType: 'FACTOR_REF', nodeId: 'root', factorVersionId: factor.draftVersionId }, display: { format: 'NUMBER', scale: 0, multiplier: '1', roundingMode: 'HALF_UP' } },
    })
    const compiled = await api('POST', `/indicator-versions/${version.id}/formula/compile`, { resourceVersion: version.version })
    if (!check(mode + '-indicator-valid', compiled.status === 'VALID', compiled)) throw new Error('指标编译失败')
    const trial = await api('POST', `/indicator-versions/${version.id}/trial`, period)
    await poll(`/async-tasks/${trial.taskId}`, ['SUCCEEDED'], 90000)
    const trialResults = await api('GET', `/indicator-versions/${version.id}/trials/${trial.batchId}/results`)
    await save(mode + '-trial', { factor, indicator, version, trial, trialResults })
    check(mode + '-trial-succeeded', true)
    const targets = await db('PLATFORM', `SELECT JSON_OBJECT('path',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillPathCode')),'level',JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.drillLevelCode'))) FROM job_calc_target WHERE batch_id=${trial.batchId}`)
    await save(mode + '-targets', targets)
    const timeTargets = targets.filter(target => target.path === 'TIME').map(target => target.level).sort()
    check(mode + '-time-targets', temporal ? JSON.stringify(timeTargets) === JSON.stringify(['DAY', 'MONTH', 'QUARTER', 'YEAR']) : timeTargets.length === 0, targets)
    if (!temporal) {
      await api('POST', `/indicator-versions/${version.id}/publish`)
      check('STATIC-published', (await api('GET', `/indicators/${indicator.id}`)).status === 'PUBLISHED')
      const batch = await api('POST', '/calc/batches', { ownerType: 'INDICATOR', ownerVersionId: version.id, batchType: 'FULL', periodType: 'STATIC' }, { headers: { 'X-Idempotency-Key': prefix + '_FORMAL' } })
      await poll(`/async-tasks/${batch.taskId}`, ['SUCCEEDED'], 90000)
      const analysis = await api('GET', `/analysis/indicators/${indicator.id}/analysis?indicatorVersionId=${version.id}&granularity=STATIC`)
      const truth = (await db('SOURCE', "SELECT JSON_OBJECT('value',COUNT(*)) FROM vmq_surgeryinfo WHERE surgery_level='3'"))[0]
      await save('STATIC-formal', { analysis, truth, batch })
      check('STATIC-source-value', Number(analysis.overview?.value) === Number(truth.value), { actual: analysis.overview?.value, truth })
    }
  })
} finally {
  for (const type of ['indicators', 'factors']) for (const id of fixtures[type]) await run('cleanup-' + id, async () => {
    let impact
    for (let attempt = 0; attempt < 45; attempt++) {
      impact = await api('GET', `/${type}/${id}/deletion-impact`)
      if (impact.deletable) break
      await pause(1000)
    }
    if (!impact.deletable) throw new Error(JSON.stringify(impact))
    const detail = await api('GET', `/${type}/${id}`)
    await api('DELETE', `/${type}/${id}`, { resourceVersion: detail.resourceVersion, deleteReason: '静态时间目标修复部署验收结束' })
    check('recycled-' + id, true)
  })
  await save('fixtures', fixtures)
  await finish()
  if (checks.some(check => !check.passed)) process.exitCode = 1
}
