import assert from 'node:assert/strict'
import { api, get, state, rows, check, run, sql, close, save, finish } from './comprehensive-client.mjs'
import { projectedDrillNavigation } from '../src/idmp/features/dashboard/backendChartDrill.js'

const boardId = state.boardId || '1189225114584501123'
const specs = [
  { name: '住院死亡率', widget: 'dashboard-widget-1790681712300-4', indicatorId: '102027642460761108', versionId: '102027642460761114',
    sql: (start, end) => `SELECT out_dept_code,SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' GROUP BY out_dept_code` },
  { name: '入院四十八小时转科比例', widget: 'dashboard-widget-1791798674947-4', indicatorId: '102027642461313070', versionId: '102027642461313071',
    sql: (start, end) => `SELECT b.out_dept_code,COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='${start}' AND b.in_date<'${end}' GROUP BY b.out_dept_code` },
  { name: '住院中药费用比例', widget: 'dashboard-widget-1791875881995-2', indicatorId: '102027642462358147', versionId: '102027642462358159',
    sql: (start, end) => `SELECT out_dept_code,SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' GROUP BY out_dept_code` }
]
const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
for (const spec of specs) for (const month of [1, 2, 3]) await run(`${spec.name}${month}月数值闭环`, async () => {
  const start = `2026-0${month}-01`, end = `2026-0${month + 1}-01`
  const source = await sql('SOURCE', spec.sql(start, end), ['code', 'numerator', 'denominator'])
  const payload = { periodStart: start, periodEnd: end, granularity: 'MONTHLY', responseFormat: 'FULL', widgetCodes: [spec.widget] }
  const result = (await api('POST', `/analysis/dashboards/${boardId}/query`, payload)).widgets[spec.widget]
  assert.equal(result.status, 'READY', result.message)
  const actual = new Map()
  for (const row of result.rows) {
    const code = String(row.OUT_DEPT_CODE ?? row.out_dept_code ?? row['科室'] ?? row.drillContext?.parentKeys?.OUT_DEPT_CODE ?? row.drillContext?.parentKeys?.['科室'])
    const existing = actual.get(code) || { n: 0, d: 0, count: 0 }
    existing.n += Number(row.numeratorValue || 0); existing.d += Number(row.denominatorValue || 0); existing.count++
    actual.set(code, existing)
  }
  const differences = []
  const splitBranches = spec.name === '入院四十八小时转科比例' && month === 1
  const namedSource = splitBranches ? await sql('SOURCE', `SELECT b.out_dept_code,b.out_dept_name,COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='${start}' AND b.in_date<'${end}' GROUP BY b.out_dept_code,b.out_dept_name`, ['code', 'name', 'numerator', 'denominator']) : []
  for (const expected of source) {
    const found = actual.get(String(expected.code))
    if ((!splitBranches || found?.count === 1) && (!found || !close(found.n, expected.numerator, 0.011) || !close(found.d, expected.denominator, 0.011))) differences.push({ expected, found })
  }
  if (splitBranches) for (const row of result.rows) {
    const expected = namedSource.find(item => item.code === row.out_dept_code && item.name === row.OUT_DEPT_NAME)
    if (!expected || !close(row.numeratorValue, expected.numerator) || !close(row.denominatorValue, expected.denominator)) differences.push({ row, expected })
  }
  check(`${spec.name}${month}月所有科室分子分母逐项等于源表`, differences.length === 0, differences)
  check(`${spec.name}${month}月冻结粒度无重复且不丢成员`, actual.size === source.length && (splitBranches ? result.rows.length === namedSource.length && new Set(result.rows.map(row => JSON.stringify([row.out_dept_code, row.OUT_DEPT_NAME]))).size === namedSource.length : [...actual.values()].every(item => item.count === 1)), { expected: source.length, actual: actual.size, historicalBranches: splitBranches, duplicate: [...actual.entries()].filter(([, x]) => x.count !== 1) })
  check(`${spec.name}${month}月百分比数值无提前舍入`, result.rows.every(row => Number(row.denominatorValue) === 0 ? row.value == null || Number(row.value) === 0 : close(row.value, Number(row.numeratorValue) / Number(row.denominatorValue))), result.rows.filter(row => Number(row.denominatorValue) > 0 && !close(row.value, Number(row.numeratorValue) / Number(row.denominatorValue))))
  const scoped = (await api('POST', `/analysis/dashboards/${boardId}/query`, payload, { token: analyst })).widgets[spec.widget]
  assert.equal(scoped.status, 'READY', scoped.message)
  const truth = source.find(item => item.code === '15')
  check(`${spec.name}${month}月本科室数值等于源表而非全院`, scoped.rows.length === 1 && close(scoped.rows[0].numeratorValue, truth.numerator, 0.011) && close(scoped.rows[0].denominatorValue, truth.denominator, 0.011), { rows: scoped.rows, truth })
  const row = scoped.rows[0], entry = row.drillContext
  if (entry) {
    const detail = await get(`/meta/drill-path-versions/${entry.drillPathVersionId}`)
    const path = { ...detail.path, levels: detail.levels.map(level => ({ ...level, dimensionFieldCode: level.dimensionSemanticFieldCode, memberKeyFieldCode: level.memberKeySemanticFieldCode, displayFieldCode: level.displaySemanticFieldCode })) }
    const navigation = projectedDrillNavigation(row, path, entry)
    const query = { ...entry, pathCode: path.pathCode, ...navigation.initialNavigation, filters: navigation.filters, pageNum: 1, pageSize: 100 }
    const drill = await api('POST', `/analysis/results/${entry.resultId}/drill/search`, query, { token: analyst })
    check(`${spec.name}${month}月下钻汇总保持指标口径`, close(drill.summary.numeratorValue, row.numeratorValue) && close(drill.summary.denominatorValue, row.denominatorValue) && close(drill.summary.indicatorValue, row.value), { summary: drill.summary, row })
    check(`${spec.name}${month}月医生下钻没有跨科室`, drill.records.every(record => Object.entries(record.dimensions).filter(([key]) => /^(OUT_DEPT_CODE|科室)$/i.test(key)).every(([, value]) => String(value) === '15')), drill.records.slice(0, 2))
    const adminSame = await api('POST', `/analysis/results/${entry.resultId}/drill/search`, query)
    check(`${spec.name}${month}月管理员同上下文与本科室结果一致`, JSON.stringify(drill) === JSON.stringify(adminSame))
    await save(`${spec.name}${month}月下钻`, { query, drill, adminSame })
  }
  const analysis = await get(`/analysis/indicators/${spec.indicatorId}/analysis?indicatorVersionId=${spec.versionId}&granularity=MONTHLY&periodStart=${start}&periodEnd=${start}&sections=TREND`)
  check(`${spec.name}${month}月趋势不强制加载同比环比`, analysis.comparisonAvailability?.status !== 'ERROR' && (analysis.trend || analysis.trends || analysis.trendAnalysis || analysis.overview != null), { keys: Object.keys(analysis), errors: analysis.errors })
  await save(`${spec.name}${month}月源表对账`, { source, result, scoped, differences, analysis })
})
await finish('数值源表对账', { persistState: false })
