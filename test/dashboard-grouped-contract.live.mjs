import assert from 'node:assert/strict'
import { api, get, sql, check, close, run, save, finish } from './comprehensive-client.mjs'

const configuration = await get('/analysis/dashboards/1189225114584501123')
const original = configuration.version.widgets.find(widget => widget.code === 'dashboard-widget-1790681712300-4')
async function preview(dimensions, filters = [], scope = {}, start = '2026-01-01', end = '2026-04-01') {
  return api('POST', '/analysis/dashboard-query/preview', {
    widget: { ...original, fieldBindings: { ...original.fieldBindings, groupingTarget: 'BASE',
      dimensions: dimensions.map(field => ({ field, label: field })), filters } },
    periodStart: start, periodEnd: end, granularity: 'CUSTOM', filters: scope
  })
}
await run('完整组合粒度与部分维度校验', async () => {
  const partial = await preview(['主诊断'])
  check('拒绝将组合粒度拆成主诊断子集', partial.status === 'ERROR' && partial.message.includes('完整组合粒度'), partial)
  const complete = await preview(['出院科室', '主诊断', '主治医生'], [], { 出院科室: ['15'] })
  assert.equal(complete.status, 'READY', complete.message)
  const columns = await sql('SOURCE', "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME='vmq_basicinformationba' AND (COLUMN_NAME LIKE '%diag%' OR COLUMN_NAME LIKE '%icd%')", ['name'])
  await save('完整组合粒度', { complete, columns })
  check('完整三维分组保留每个元组', complete.rows.every(row => ['出院科室', '主诊断', '主治医生'].every(field => Object.hasOwn(row, field)))
    && new Set(complete.rows.map(row => JSON.stringify(row.resultDimensions))).size === complete.rows.length)
  const source = await sql('SOURCE', "SELECT out_dept_code,main_diagnostic,attending_doctor,SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-04-01' AND out_dept_code='15' GROUP BY out_dept_code,main_diagnostic,attending_doctor", ['dept', 'diagnosis', 'doctor', 'n', 'd'])
  const key = values => JSON.stringify(values.map(value => value ?? '__UNASSIGNED__'))
  const actual = new Map(complete.rows.map(row => [key([row.出院科室, row.主诊断, row.主治医生]), row]))
  const mismatches = source.filter(expected => {
    const row = actual.get(key([expected.dept, expected.diagnosis, expected.doctor]))
    return !row || !close(row.numeratorValue, expected.n) || !close(row.denominatorValue, expected.d)
  })
  check('三维组合每一行与源表一致', source.length === complete.rows.length && !mismatches.length, mismatches)
  check('即时查询保留目标格式及达标状态', complete.rows.every(row => row.targetValue === 0.003 && row.targetDisplayValue === '0.30%' && row.achievementStatus))
})
for (const [operator, values, sqlCondition] of [
  ['notEquals', ['15'], "out_dept_code<>'15'"],
  ['isNotEmpty', [], "out_dept_code IS NOT NULL AND CAST(out_dept_code AS CHAR)<>''"],
  ['in', ['15', '16'], "out_dept_code IN ('15','16')"]
]) await run(`真实组件筛选${operator}`, async () => {
  const result = await preview(['出院科室'], [{ field: '出院科室', operator, value: values.length === 1 ? values[0] : values }])
  assert.equal(result.status, 'READY', result.message)
  const expected = await sql('SOURCE', `SELECT out_dept_code,SUM(out_status='4'),COUNT(*) FROM vmq_basicinformationba WHERE out_date>='2026-01-01' AND out_date<'2026-04-01' AND ${sqlCondition} GROUP BY out_dept_code`, ['code', 'n', 'd'])
  check(`${operator}聚合前筛选数值一致`, expected.length === result.rows.length && expected.every(item => {
    const row = result.rows.find(row => String(row.出院科室) === item.code)
    return row && close(row.numeratorValue, item.n) && close(row.denominatorValue, item.d)
  }), { count: result.rows.length, expected: expected.length })
})
await run('没有源数据的区间不提示重新计算', async () => {
  const result = await preview(['出院科室'], [], {}, '2035-01-01', '2035-02-01')
  check('无数据明确返回空状态', result.status === 'EMPTY' && !result.message.includes('计算'), result)
})
await run('正式月度结果保留同区间即时下钻上下文', async () => {
  const result = (await api('POST', '/analysis/dashboards/1189225114584501123/query', {
    periodStart: '2026-01-01', periodEnd: '2026-02-01', granularity: 'MONTHLY', widgetCodes: [original.code]
  })).widgets[original.code]
  assert.equal(result.status, 'READY', result.message)
  check('正式结果的每行下钻范围一致', result.rows.every(row => row.queryContext?.periodStart === '2026-01-01' && row.queryContext.periodEnd === '2026-02-01'))
})
await finish('完整分组边界验收', { persistState: false })
