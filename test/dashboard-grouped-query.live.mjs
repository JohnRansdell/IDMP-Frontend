import assert from 'node:assert/strict'
import { api, get, sql, check, run, save, finish, close } from './comprehensive-client.mjs'

const dashboard = '1189225114584501123'
const specs = [
  { name: '住院死亡率', widget: 'dashboard-widget-1790681712300-4', version: '102027642467600364', field: '出院科室', doctor: '主治医生',
    table: 'vmq_basicinformationba', period: 'out_date', numerator: "SUM(out_status='4')", denominator: 'COUNT(*)', code: 'out_dept_code' },
  { name: '入院四十八小时转科比例', widget: 'dashboard-widget-1791798674947-4', version: '102027642461313071', field: 'OUT_DEPT_CODE', doctor: 'ATTENDING_DOCTOR',
    table: 'vmq_basicinformationzy b LEFT JOIN vmq_inpatienttransferdetail t ON b.in_hospital_id=t.in_hospital_id', period: 'b.in_date',
    numerator: 'COUNT(DISTINCT CASE WHEN t.in_dept_date>=b.in_date AND TIMESTAMPDIFF(HOUR,b.in_date,t.in_dept_date)<=48 THEN b.in_hospital_id END)', denominator: 'COUNT(DISTINCT b.in_hospital_id)', code: 'b.out_dept_code' },
  { name: '住院中药费用比例', widget: 'dashboard-widget-1791875881995-2', version: '102027642462358159', field: '科室', doctor: '医生',
    table: 'vmq_basicinformationba', period: 'out_date', numerator: 'SUM(chinese_patent_drugs_cost)+SUM(chinese_herbal_cost)', denominator: 'SUM(drug_cost)', code: 'out_dept_code' }
]
const analyst = (await api('POST', '/auth/login', { username: '300112', password: 'test2026' }, { token: '' })).accessToken
for (const spec of specs) for (const [start, end] of [['2026-01-01', '2026-04-01'], ['2026-02-01', '2026-05-01'], ['2026-03-01', '2026-04-01']]) {
  await run(`${spec.name}${start}至${end}源表核对`, async () => {
    const payload = { periodStart: start, periodEnd: end, granularity: 'CUSTOM', widgetCodes: [spec.widget], filters: {} }
    const before = performance.now()
    const result = (await api('POST', `/analysis/dashboards/${dashboard}/query`, payload)).widgets[spec.widget]
    const coldMs = Math.round(performance.now() - before)
    assert.equal(result.status, 'READY', result.message)
    const source = await sql('SOURCE', `SELECT ${spec.code},${spec.numerator},${spec.denominator} FROM ${spec.table} WHERE ${spec.period}>='${start}' AND ${spec.period}<'${end}' GROUP BY ${spec.code}`, ['code', 'n', 'd'])
    const codeOf = row => String(row[spec.field] ?? row[spec.field.toLowerCase()] ?? '__UNASSIGNED__')
    const actual = new Map(result.rows.map(row => [codeOf(row), row]))
    const mismatches = source.flatMap(expected => {
      const found = actual.get(expected.code ?? '__UNASSIGNED__')
      return !found || !close(found.numeratorValue ?? 0, expected.n ?? 0, 0.011) || !close(found.denominatorValue ?? 0, expected.d ?? 0, 0.011)
        || Number(expected.d) !== 0 && !close(found.value, Number(expected.n || 0) / Number(expected.d), 1e-7) ? [{ expected, found }] : []
    })
    check(`${spec.name}${start}所有科室与源表一致`, !mismatches.length && actual.size === source.length && actual.size === result.rows.length, mismatches)
    check(`${spec.name}${start}从源计算并保持整段区间`, result.rows.every(row => row.aggregationMethod === 'SOURCE_QUERY' && row.periodStart.startsWith(start) && row.periodEnd.startsWith(end)))
    const warmStart = performance.now()
    const repeated = (await api('POST', `/analysis/dashboards/${dashboard}/query`, payload)).widgets[spec.widget]
    const warmMs = Math.round(performance.now() - warmStart)
    check(`${spec.name}${start}重复查询数值不变`, JSON.stringify(result.rows) === JSON.stringify(repeated.rows), { coldMs, warmMs })
    const scoped = (await api('POST', `/analysis/dashboards/${dashboard}/query`, payload, { token: analyst })).widgets[spec.widget]
    check(`${spec.name}${start}科室用户缓存不串号`, scoped.status === 'READY' && scoped.rows.length === 1 && codeOf(scoped.rows[0]) === '15', { status: scoped.status, message: scoped.message })
    const targets = await get(`/analysis/indicator-versions/${spec.version}/grouping-targets`)
    const target = targets.find(item => item.pathCode && item.fields.includes(spec.doctor))
    const row = result.rows.find(item => codeOf(item) === '15')
    const request = { context: row.queryContext, pathCode: target.pathCode, currentLevel: target.levelCode,
      parentKeys: { [spec.field]: '15' }, pageNum: 1, pageSize: 200 }
    const drill = await api('POST', `/analysis/indicator-versions/${spec.version}/query-drill`, request, { token: analyst })
    check(`${spec.name}${start}即时医生下钻区间与科室一致`, drill.context.periodStart.startsWith(start) && drill.context.periodEnd.startsWith(end)
      && drill.records.every(item => String(item.dimensions[spec.field]) === '15'), { count: drill.records.length })
    const doctorField = spec.field === 'OUT_DEPT_CODE' ? 'b.AttendingDoctor' : 'attending_doctor'
    const doctorSource = await sql('SOURCE', `SELECT ${doctorField},${spec.numerator},${spec.denominator} FROM ${spec.table} WHERE ${spec.period}>='${start}' AND ${spec.period}<'${end}' AND ${spec.code}='15' GROUP BY ${doctorField}`, ['code', 'n', 'd'])
    const doctorRows = new Map(drill.records.map(row => [String(row.dimensions[spec.doctor] || '__UNASSIGNED__'), row]))
    const doctorMismatches = doctorSource.filter(expected => {
      const found = doctorRows.get(expected.code || '__UNASSIGNED__')
      return !found || !close(found.numeratorValue ?? 0, expected.n ?? 0, 0.011) || !close(found.denominatorValue ?? 0, expected.d ?? 0, 0.011)
        || Number(expected.d) !== 0 && !close(found.indicatorValue, Number(expected.n || 0) / Number(expected.d), 1e-7)
    })
    check(`${spec.name}${start}每位医生与源表独立核对`, doctorMismatches.length === 0 && doctorRows.size === doctorSource.length, doctorMismatches)
    const denied = await api('POST', `/analysis/indicator-versions/${spec.version}/query-drill`, { ...request, parentKeys: { [spec.field]: '16' } }, { token: analyst, allowError: true })
    check(`${spec.name}${start}篡改科室被拒绝`, [400, 403].includes(denied.http), { status: denied.http, message: denied.message })
    await save(`${spec.name}-${start}-${end}`, { result, source, mismatches, scoped, drill, doctorSource, doctorMismatches, coldMs, warmMs })
  })
}
await run('自定义区间趋势逐月计算', async () => {
  const id = 'dashboard-widget-1790681716574-5'
  const result = (await api('POST', `/analysis/dashboards/${dashboard}/query`, { periodStart: '2026-01-01', periodEnd: '2026-04-01', granularity: 'CUSTOM', widgetCodes: [id] })).widgets[id]
  assert.equal(result.status, 'READY', result.message)
  const expected = await sql('SOURCE', "SELECT DATE_FORMAT(out_date,'%Y-%m'),SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-04-01' GROUP BY DATE_FORMAT(out_date,'%Y-%m')", ['month', 'n', 'd'])
  check('趋势每月独立计算而非整段结果重复', result.rows.length === 3 && expected.every(item => {
    const row = result.rows.find(row => row.periodStart.startsWith(item.month))
    return row && close(row.numeratorValue, item.n) && close(row.denominatorValue, item.d)
  }))
})
await finish('完整分组即时查询验收', { persistState: false })
