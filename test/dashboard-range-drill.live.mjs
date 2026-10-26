import assert from 'node:assert/strict'
import { api, get, sql, check, close, run, save, finish } from './comprehensive-client.mjs'
import { projectedDrillNavigation } from '../src/idmp/features/dashboard/backendChartDrill.js'

const specs = [
  { name: '住院死亡率', widget: 'dashboard-widget-1790681712300-4', source: (start, end, dept, group = true) => `SELECT ${group ? 'attending_doctor' : "'科室汇总'"},SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' AND out_dept_code='${dept}' ${group ? 'GROUP BY attending_doctor' : ''}` },
  { name: '入院四十八小时转科比例', widget: 'dashboard-widget-1791798674947-4', source: (start, end, dept, group = true) => `SELECT ${group ? 'b.AttendingDoctor' : "'科室汇总'"},COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END),COUNT(DISTINCT b.in_hospital_id) FROM vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id WHERE b.in_date>='${start}' AND b.in_date<'${end}' AND b.out_dept_code='${dept}' ${group ? 'GROUP BY b.AttendingDoctor' : ''}` },
  { name: '住院中药费用比例', widget: 'dashboard-widget-1791875881995-2', source: (start, end, dept, group = true) => `SELECT ${group ? 'attending_doctor' : "'科室汇总'"},SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost),SUM(drug_cost) FROM vmq_basicinformationba WHERE out_date>='${start}' AND out_date<'${end}' AND out_dept_code='${dept}' ${group ? 'GROUP BY attending_doctor' : ''}` }
]
const periods = [
  { name: '一月', start: '2026-01-01', end: '2026-02-01', granularity: 'MONTHLY' },
  { name: '一至三月', start: '2026-01-01', end: '2026-04-01', granularity: 'CUSTOM' },
  { name: '二至四月', start: '2026-02-01', end: '2026-05-01', granularity: 'CUSTOM' }
]
const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
const sourceCache = new Map()
for (const spec of specs) for (const period of periods) for (const role of [{ name: '管理员', dept: '16' }, { name: '本科室用户', dept: '15', token: analyst }]) await run(`${spec.name}${period.name}${role.name}`, async () => {
  const label = `${spec.name}${period.name}${role.name}`
  const data = (await api('POST', '/analysis/dashboards/1189225114584501123/query', { periodStart: period.start, periodEnd: period.end, granularity: period.granularity, responseFormat: 'FULL', widgetCodes: [spec.widget] }, role)).widgets[spec.widget]
  assert.equal(data.status, 'READY', data.message)
  const row = data.rows.find(r => String(r.out_dept_code ?? r.OUT_DEPT_CODE ?? r['科室']) === role.dept)
  assert.ok(row?.drillContext, '缺少所选科室或下钻上下文')
  const entry = row.drillContext
  const detail = await get(`/meta/drill-path-versions/${entry.drillPathVersionId}`, role)
  const path = { ...detail.path, levels: detail.levels.map(level => ({ ...level, dimensionFieldCode: level.dimensionSemanticFieldCode, memberKeyFieldCode: level.memberKeySemanticFieldCode, displayFieldCode: level.displaySemanticFieldCode })) }
  const navigation = projectedDrillNavigation(row, path, entry)
  const query = { ...entry, pathCode: path.pathCode, ...navigation.initialNavigation, filters: navigation.filters, pageNum: 1, pageSize: 100 }
  const drill = await api('POST', `/analysis/results/${entry.resultId}/drill/search`, query, role)
  check(`${label}上下钻周期完全一致`, drill.context.periodStart.slice(0, 10) === period.start && drill.context.periodEnd.slice(0, 10) === period.end, drill.context)
  // Standard drill summary describes its persisted anchor; range drill summary describes the scoped aggregate.
  if (period.granularity === 'CUSTOM') check(`${label}科室汇总没有切成单月`, close(drill.summary.numeratorValue, row.numeratorValue, 0.011) && close(drill.summary.denominatorValue, row.denominatorValue, 0.011) && close(drill.summary.indicatorValue, row.value), { row, summary: drill.summary })
  const truth = new Map()
  const parentTruth = { numerator: 0, denominator: 0 }
  // Match the published calculation's month-rollup contract, including DISTINCT factors.
  for (let month = Number(period.start.slice(5, 7)); month < Number(period.end.slice(5, 7)); month++) {
    const start = `2026-${String(month).padStart(2, '0')}-01`, end = `2026-${String(month + 1).padStart(2, '0')}-01`
    const key = `${spec.name}:${role.dept}:${month}`
    if (!sourceCache.has(key)) sourceCache.set(key, await sql('SOURCE', spec.source(start, end, role.dept), ['doctor', 'numerator', 'denominator']))
    if (!sourceCache.has(`${key}:科室`)) sourceCache.set(`${key}:科室`, await sql('SOURCE', spec.source(start, end, role.dept, false), ['doctor', 'numerator', 'denominator']))
    const parent = sourceCache.get(`${key}:科室`)[0]
    parentTruth.numerator += Number(parent.numerator); parentTruth.denominator += Number(parent.denominator)
    for (const record of sourceCache.get(key)) {
      const doctor = record.doctor?.trim() || '__UNASSIGNED__'
      const total = truth.get(doctor) || { numerator: 0, denominator: 0 }
      total.numerator += Number(record.numerator); total.denominator += Number(record.denominator)
      truth.set(doctor, total)
    }
  }
  const differences = drill.records.flatMap(record => {
    const expected = truth.get(record.dimensionKey)
    return expected && close(record.numeratorValue, expected.numerator, 0.011) && close(record.denominatorValue, expected.denominator, 0.011) && close(record.indicatorValue, expected.numerator / expected.denominator) ? [] : [{ actual: record, expected }]
  })
  check(`${label}每位医生分子分母与源表月度重算一致`, differences.length === 0 && drill.records.length === truth.size, { differences, expectedCount: truth.size, actualCount: drill.records.length })
  check(`${label}顶层科室结果与源表一致`, close(row.numeratorValue, parentTruth.numerator, 0.011) && close(row.denominatorValue, parentTruth.denominator, 0.011), { row, parentTruth })
  check(`${label}医生记录范围与周期正确`, drill.records.every(record => record.periodStart.slice(0, 10) === period.start && record.periodEnd.slice(0, 10) === period.end && Object.entries(record.dimensions).filter(([key]) => /^(OUT_DEPT_CODE|科室)$/i.test(key)).every(([, value]) => String(value) === role.dept)), drill.records.slice(0, 1))
  if (role.token) {
    check(`${label}顶层只返回本科室`, data.rows.length === 1)
    const parentField = Object.keys(query.parentKeys).find(key => /^(OUT_DEPT_CODE|科室)$/i.test(key))
    const other = await api('POST', `/analysis/results/${entry.resultId}/drill/search`, { ...query, parentKeys: { ...query.parentKeys, [parentField]: '16' } }, { ...role, allowError: true })
    check(`${label}篡改科室不能读取其他科室`, [400, 403, 409, 422].includes(other.http) || (other.http === 200 && other.data?.records?.length === 0 && other.data?.summary?.indicatorValue == null), { http: other.http, message: other.message, data: other.data })
  }
  await save(`${label}区间下钻对账`, { query, row, drill, source: Object.fromEntries(truth), parentTruth, differences })
})
await finish('区间下钻真实数值验收', { persistState: false })
