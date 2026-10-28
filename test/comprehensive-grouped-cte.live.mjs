import assert from 'node:assert/strict'
import { api, get, rows, state, sql, close, check, run, save, checkpoint, poll, finish } from './comprehensive-client.mjs'
const query = `WITH admissions AS (
  SELECT b.in_hospital_id,b.in_date,b.out_dept_code FROM vmq_basicinformationzy b
  WHERE b.in_date>='2026-01-01' AND b.in_date<'2026-02-01'
), transferred AS (
  SELECT DISTINCT b.in_hospital_id FROM admissions b
  JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id
  WHERE t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48
), totals AS (SELECT COUNT(DISTINCT in_hospital_id) AS total FROM admissions),
transfers AS (SELECT COUNT(DISTINCT in_hospital_id) AS total FROM transferred)
SELECT ROUND(COALESCE(t.total,0)*1.000000000000/NULLIF(a.total,0),6) AS 转科比例
FROM totals a CROSS JOIN transfers t`
const fields = { 科室: 'b.out_dept_code', 医生: 'b.AttendingDoctor', 入院诊断: 'b.in_icd10', 性别: 'b.sex' }
const physical = { 科室: 'out_dept_code', 医生: 'AttendingDoctor', 入院诊断: 'in_icd10', 性别: 'sex' }
const path = (suffix, name, dimensions) => ({ pathCode: `CUSTOM_CTE_${suffix}_${state.tag.replace(/\D/g, '')}`, pathName: name, maxLevel: `LEVEL_${dimensions.length}`, levels: [{ levelCode: 'ROOT', levelName: '全院' }, ...dimensions.map((dimensionFieldCode, i) => ({ levelCode: `LEVEL_${i + 1}`, levelName: dimensionFieldCode, dimensionFieldCode }))] })
for (const [label, start, end] of [['一月', '2026-01-01', '2026-02-01'], ['二月', '2026-02-01', '2026-03-01'], ['三月', '2026-03-01', '2026-04-01']]) await run(`${label}多层明细查询组织路径与三条自定义路径并存`, async () => {
  const previous = state.groupedCteSessions?.findLast(item => item.period === start)
  let session = previous ? await get(`/sql-imports/${previous.id}`) : null
  if (!session || session.status === 'ABANDONED') session = await api('POST', '/sql-imports', { sql: query, definitionType: 'SQL', tableMappings: {} }, { headers: { 'Idempotency-Key': `${state.tag}-grouped-${start}-${Date.now()}` } })
  state.groupedCteSessions ||= []
  if (!state.groupedCteSessions.some(item => item.id === session.importId)) state.groupedCteSessions.push({ id: session.importId, period: start })
  const ledger = state.groupedCteSessions.find(item => item.id === session.importId)
  await checkpoint()
  try {
    const paths = [
      { pathCode: 'ORGANIZATION', pathName: '出院科室主治医生组织路径', maxLevel: 'ATTENDING_DOCTOR', levels: [{ levelCode: 'HOSPITAL', levelName: '医院' }, { levelCode: 'DEPARTMENT', levelName: '科室', dimensionFieldCode: '科室' }, { levelCode: 'ATTENDING_DOCTOR', levelName: '医生', dimensionFieldCode: '医生' }] },
      path('SEX', '患者性别到科室', ['性别', '科室']),
      path('DIAGNOSIS', '入院诊断到科室', ['入院诊断', '科室']),
      path('DOCTOR', '科室到主治医生', ['科室', '医生'])
    ]
    if (session.status === 'AWAITING_METADATA') {
      const metadata = { scope: 'FACTORS_AND_INDICATOR', category: 'QUALITY', indicatorName: '真实业务验收按性别诊断科室医生分析四十八小时转科比例', formula: { source: 'SQL_FINAL_SELECT' }, dimensionGrain: ['科室', '入院诊断', '性别'], drillPaths: paths, factors: session.preview.factors.map((factor, i) => ({ key: factor.key, name: `真实业务验收四十八小时转科${i ? '入院总人数' : '转科人数'}多维统计量`, calculationMode: 'TEMPORAL', timeField: 'b.in_date', dimensionBindings: fields })) }
      session = await api('PUT', `/sql-imports/${session.importId}/metadata`, metadata)
      await api('POST', `/sql-imports/${session.importId}/trial`, { periodStart: `${start}T00:00:00`, periodEnd: `${end}T00:00:00` })
    }
    session = await poll(`/sql-imports/${session.importId}`, ['TRIAL_SUCCEEDED', 'SUCCEEDED'], 240000)
    ledger.resources = session.resources; await checkpoint()
    const indicator = session.resources.find(r => r.type === 'INDICATOR')
    const version = await get(`/indicator-versions/${indicator.versionId}`)
    await save('复杂多层查询指标版本', version)
    check('组合粒度与组织及三条自定义路径都保留', version.dimensionGrain.length === 3 && version.drillConfig.drillPaths.length === 4, version.drillConfig)
    const trial = await get(`/indicator-versions/${indicator.versionId}/trials/${indicator.trial.task.batchId}/results?size=100`)
    check('所有多维试算目标均可执行', trial.targets.length >= 8 && trial.targets.every(target => target.targetStatus === 'READY'), trial.targets.map(t => ({ code: t.targetCode, status: t.targetStatus, grain: t.grain })))
    await save('复杂多层查询试算目标', trial)
    {
      const accepted = indicator.trial.task
      await poll(`/async-tasks/${accepted.taskId}`, ['SUCCEEDED'], 240000)
      const first = await get(`/indicator-versions/${indicator.versionId}/trials/${accepted.batchId}/results?page=1&size=1000`)
      const all = new Map(first.targets.map(target => [target.targetCode, { ...target, allRows: rows(target.results) }]))
      const pages = Math.max(...first.targets.map(target => Number(target.results.pages)))
      for (let page = 2; page <= pages; page++) {
        const response = await get(`/indicator-versions/${indicator.versionId}/trials/${accepted.batchId}/results?page=${page}&size=1000`)
        for (const target of response.targets) all.get(target.targetCode).allRows.push(...rows(target.results))
      }
      for (const target of all.values()) {
        const grain = target.grain
        const columns = grain.map(field => `b.${physical[field]}`)
        const source = await sql('SOURCE', `SELECT ${columns.length ? columns.join(',') + ',' : ''}COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='${start}' AND b.in_date<'${end}'${columns.length ? ' GROUP BY ' + columns.join(',') : ''}`, [...grain, 'n', 'd'])
        const result = target.allRows
        const key = row => JSON.stringify(grain.map(field => row[field] ?? row.dimensions?.[field] ?? null))
        const expected = new Map(source.map(row => [key(row), row]))
        const mismatch = result.filter(row => {
          const value = expected.get(key(row))
          return !value || !close(row.numeratorValue, value.n) || !close(row.denominatorValue, value.d) || (Number(value.d) > 0 && !close(row.resultValue, Number(value.n) / Number(value.d)))
        })
        check(`${label}${grain.join('、')}分组无遗漏重复`, result.length === source.length && new Set(result.map(key)).size === source.length, { expected: source.length, actual: result.length })
        check(`${label}${grain.join('、')}逐组去重统计与源表一致`, mismatch.length === 0, mismatch.slice(0, 3))
        await save(`复杂多层查询${label}${target.targetCode.replaceAll(':', '_')}`, { source, result, mismatch })
      }
    }
  } finally {
    const current = await get(`/sql-imports/${session.importId}`)
    ledger.resources = current.resources; await checkpoint()
    if (current.status !== 'SUCCEEDED') {
      await api('POST', `/sql-imports/${session.importId}/abandon`, { reason: '真实复杂分组验收完成，仅清理本次试算资源' })
      const cleaned = await poll(`/sql-imports/${session.importId}`, ['ABANDONED'])
      check('复杂试算资源已清理且未发布历史回补', cleaned.status === 'ABANDONED' && cleaned.resources.every(resource => !resource.id || ['DELETED', 'SKIPPED', 'NOT_CREATED', 'RETAINED'].includes(resource.cleanup)), cleaned.resources)
    }
  }
})
await finish('复杂多层查询分组与自定义路径')
