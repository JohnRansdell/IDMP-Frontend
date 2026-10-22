import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardComparisonPeriods, dashboardPeriodLabel, defaultDashboardPeriod, enforceDashboardResultPeriod, resolveDashboardPeriod } from '../src/idmp/features/dashboard/statisticalPeriod.js'
import { buildRemoteWidgetQuery } from '../src/idmp/features/dashboard/remoteQuery.js'
import { widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { widgetEmptyGuidance } from '../src/idmp/features/dashboard/widgetGuidance.js'
import { metricItemModel } from '../src/idmp/features/dashboard/metricItemModel.js'

const monthly = month => resolveDashboardPeriod({ type: 'MONTHLY', month })
const row = (period, value = .4) => ({ ...period, value, periodStart: `${period.periodStart}T00:00:00`, periodEnd: `${period.periodEnd}T00:00:00` })
const comparable = { status: 'COMPARABLE', relativeChangePercent: 25 }

test('dashboard defaults to a single latest month, not a multi-month range with a last-month total', () => {
  const selected = defaultDashboardPeriod([{ value: '2026-03' }, { value: '2026-05' }])
  assert.deepEqual(resolveDashboardPeriod(selected), { periodStart: '2026-05-01', periodEnd: '2026-06-01', granularity: 'MONTHLY', selectionType: 'MONTHLY' })
})

test('month, quarter and year resolve to exact half-open calendar periods', () => {
  assert.equal(monthly('2024-02').periodEnd, '2024-03-01')
  assert.deepEqual(resolveDashboardPeriod({ type: 'QUARTERLY', year: 2026, quarter: 2 }), { periodStart: '2026-04-01', periodEnd: '2026-07-01', granularity: 'QUARTERLY', selectionType: 'QUARTERLY' })
  assert.equal(resolveDashboardPeriod({ type: 'YEARLY', year: 2026 }).periodEnd, '2027-01-01')
  for (const selection of [{ type: 'MONTHLY', month: '2026-13' }, { type: 'QUARTERLY', year: 2026, quarter: 5 }, { type: 'CUSTOM', startDate: '2026-02-30', endDate: '2026-03-01' }, { type: 'CUSTOM', startDate: '2026-05-01', endDate: '2026-04-01' }]) assert.equal(resolveDashboardPeriod(selection), null)
})

test('custom ranges are never rounded to a calendar quarter or assigned monthly aggregation', () => {
  const period = resolveDashboardPeriod({ type: 'CUSTOM', startDate: '2026-03-01', endDate: '2026-05-31' })
  assert.equal(period.granularity, null)
  assert.equal(dashboardPeriodLabel(period), '2026-03-01 ~ 2026-05-31')
  const exact = resolveDashboardPeriod({ type: 'CUSTOM', startDate: '2026-04-01', endDate: '2026-06-30' })
  assert.equal(exact.granularity, 'QUARTERLY')
  assert.equal(dashboardComparisonPeriods(exact).showMom, false)
})

test('quarterly comparisons use the previous quarter across years; annual comparison is not duplicated', () => {
  const firstQuarter = resolveDashboardPeriod({ type: 'QUARTERLY', year: 2026, quarter: 1 })
  assert.deepEqual(dashboardComparisonPeriods(firstQuarter), { showMom: true, yoyPeriod: '2025年第1季度', momPeriod: '2025年第4季度' })
  assert.deepEqual(dashboardComparisonPeriods(resolveDashboardPeriod({ type: 'YEARLY', year: 2026 })), { showMom: false, yoyPeriod: '2025年', momPeriod: '2025年' })
})

test('inherited queries use the chosen granularity, independent widgets retain their own period', () => {
  const period = resolveDashboardPeriod({ type: 'QUARTERLY', year: 2026, quarter: 2 })
  assert.equal(buildRemoteWidgetQuery({ id: 'kpi' }, period).query.granularity, 'QUARTERLY')
  const own = buildRemoteWidgetQuery({ id: 'own', config: { backendQuery: { periodMode: 'INDEPENDENT', periodStart: '2026-05-01', periodEnd: '2026-05-31', granularity: 'MONTHLY' } } }, period).query
  assert.equal(own.granularity, 'MONTHLY')
  assert.equal(own.periodStart, '2026-05-01')
  assert.equal(own.periodEnd, '2026-06-01')
})

test('last month returned for a requested quarter is rejected along with its result identity and comparisons', () => {
  const quarter = resolveDashboardPeriod({ type: 'QUARTERLY', year: 2026, quarter: 2 })
  const response = { status: 'READY', rows: [row(monthly('2026-06'))], resultId: '123', snapshotId: '456', drillContext: { resultId: '123' }, timeComparison: { yearOverYear: comparable } }
  const result = enforceDashboardResultPeriod(response, quarter)
  assert.equal(result.status, 'NO_ACTIVE_RESULT')
  assert.deepEqual(result.rows, [])
  assert.equal(result.drillContext, null)
  assert.equal(result.resultId, null)
  assert.equal(result.timeComparison, null)
  assert.equal(response.rows.length, 1)
  const dataset = widgetResultToDataset(result)
  assert.match(widgetEmptyGuidance({ status: 'empty' }, dataset).title, /暂无完整结果/)
})

test('arbitrary multi-month totals never average or sum the monthly result rows', () => {
  const range = resolveDashboardPeriod({ type: 'CUSTOM', startDate: '2026-03-01', endDate: '2026-05-31' })
  const result = enforceDashboardResultPeriod({ status: 'READY', rows: [row(monthly('2026-03'), .1), row(monthly('2026-04'), .3), row(monthly('2026-05'), .9)] }, range)
  assert.deepEqual(result.rows, [])
  assert.equal(result.periodContext.showMom, false)
})

test('exact period dimensional rows remain unchanged without averaging', () => {
  const quarter = resolveDashboardPeriod({ type: 'QUARTERLY', year: 2026, quarter: 2 })
  const a = { ...row(quarter, .15), department: 'A' }, b = { ...row(quarter, .9), department: 'B' }
  const result = enforceDashboardResultPeriod({ status: 'READY', rows: [a, b, row(monthly('2026-06'))] }, quarter)
  assert.deepEqual(result.rows, [a, b])
})

test('comparison percentages require exact current and baseline periods, not just numeric fields', () => {
  const period = monthly('2026-05')
  const response = { status: 'READY', rows: [row(period)], timeComparison: { current: row(period), previousPeriod: row(monthly('2026-04')), samePeriodLastYear: row(monthly('2025-05')), periodOverPeriod: comparable, yearOverYear: comparable } }
  let result = enforceDashboardResultPeriod(response, period)
  let dataset = widgetResultToDataset(result)
  assert.equal(dataset.comparison.mom, 25)
  assert.equal(dataset.comparison.yoy, 25)
  assert.equal(dataset.comparison.momPeriod, '2026年4月')
  result = enforceDashboardResultPeriod({ ...response, timeComparison: { ...response.timeComparison, samePeriodLastYear: row(monthly('2025-04')) } }, period)
  dataset = widgetResultToDataset(result)
  assert.equal(dataset.comparison.yoy, null)
  assert.equal(dataset.comparison.mom, 25)
  result = enforceDashboardResultPeriod({ ...response, timeComparison: { ...response.timeComparison, current: row(monthly('2026-04')) } }, period)
  assert.equal(widgetResultToDataset(result).comparison.mom, null)
})

test('annual results retain year-on-year and suppress the duplicate previous-period comparison', () => {
  const current = resolveDashboardPeriod({ type: 'YEARLY', year: 2026 }), previous = resolveDashboardPeriod({ type: 'YEARLY', year: 2025 })
  const dataset = widgetResultToDataset(enforceDashboardResultPeriod({ status: 'READY', rows: [row(current)], timeComparison: { current: row(current), previousPeriod: row(previous), samePeriodLastYear: row(previous), periodOverPeriod: comparable, yearOverYear: comparable } }, current))
  assert.equal(dataset.comparison.yoy, 25)
  assert.equal(dataset.comparison.mom, null)
  assert.equal(dataset.comparison.showMom, false)
})

test('monthly trends retain contained periods without inventing a range total or accepting partial-month results', () => {
  const query = { periodStart: '2026-03-15', periodEnd: '2026-06-01', granularity: 'MONTHLY' }
  const result = enforceDashboardResultPeriod({ status: 'READY', rows: [row(monthly('2026-03')), row(monthly('2026-04')), row(monthly('2026-05')), row(monthly('2026-06'))] }, query, { timeSeries: true, selectionType: 'CUSTOM' })
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].value, .4)
  assert.equal(result.timeComparison, null)
})

test('request errors remain errors instead of being presented as missing results', () => {
  const failed = { status: 'ERROR', message: '连接失败', rows: [] }
  assert.equal(enforceDashboardResultPeriod(failed, monthly('2026-05')), failed)
})

test('metric-group cards use the formal period comparisons rather than stale source defaults', () => {
  const current = monthly('2026-05')
  const fields = [{ code: 'value', role: 'MEASURE', dataType: 'NUMBER', aggregations: ['direct'] }]
  const source = widgetResultToDataset(enforceDashboardResultPeriod({ status: 'READY', rows: [row(current)] }, current), fields)
  const item = { id: 'item', sourceCode: 'test', dataBinding: { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] } }
  const model = metricItemModel({ id: 'group', config: {} }, item, () => ({ yoy: 99, mom: 88 }), () => [source], { definitions: [], values: {} })
  assert.equal(model.yoy, null)
  assert.equal(model.mom, null)
  assert.equal(model.periodLabel, '2026年5月')
})
