import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPublishedIndicatorAnalysisQuery, buildPublishedIndicatorTrendPreviewQuery, createPublishedDashboardPeriodOptions, dateRangeForMonths, resolvePublishedDashboardPeriod, resolvePublishedDashboardPeriodRange, schemaPublishedIndicatorSourceCodes } from '../src/idmp/features/dashboard/publishedIndicatorRuntime.js'
import { dashboardDetailToSchema } from '../src/idmp/api/adapters/dashboard.js'

test('published dashboard widgets query their persisted indicator version for the selected month', () => {
  assert.deepEqual(buildPublishedIndicatorAnalysisQuery({ analysisIndicatorVersionId: '102027642460303757' }, '2025-12'), {
    indicatorVersionId: '102027642460303757', granularity: 'MONTHLY', periodStart: '2025-12-01', periodEnd: '2026-01-01'
  })
})

test('only saved published indicator widgets are hydrated on viewer startup', () => {
  assert.deepEqual(schemaPublishedIndicatorSourceCodes({ widgets: [
    { sourceCode: 'catalog-indicator-102027642460303750' },
    { sourceCode: 'MORTALITY_INPATIENT' },
    { sourceCode: 'catalog-indicator-102027642460303750' }
  ] }), ['catalog-indicator-102027642460303750'])
})

test('published dashboard widgets support a bounded inclusive month range', () => {
  assert.deepEqual(dateRangeForMonths(['2025-09', '2026-04']), {
    periodStart: '2025-09-01', periodEnd: '2026-05-01'
  })
  assert.deepEqual(buildPublishedIndicatorAnalysisQuery({ analysisIndicatorVersionId: '102027642460303757' }, ['2025-09', '2026-04']), {
    indicatorVersionId: '102027642460303757', granularity: 'MONTHLY', periodStart: '2025-09-01', periodEnd: '2026-05-01'
  })
})

test('line previews retain the selected bounded period range', () => {
  const query = { periodStart: '2025-12-01', periodEnd: '2026-01-01', granularity: 'MONTHLY', filters: {} }
  assert.deepEqual(buildPublishedIndicatorTrendPreviewQuery({ type: 'chart', chartKind: 'line', config: {} }, query), query)
  assert.deepEqual(buildPublishedIndicatorTrendPreviewQuery({
    type: 'chart', chartKind: 'line', config: { backendQuery: { periodMode: 'FIXED' } }
  }, query), query)
  assert.deepEqual(buildPublishedIndicatorTrendPreviewQuery({ type: 'chart', chartKind: 'bar', config: {} }, query), query)
})

test('formal dashboard periods expose bounded common months and never resolve to an unbounded query', () => {
  const options = createPublishedDashboardPeriodOptions([
    [
      { periodStart: '2026-04-01T00:00:00', periodType: 'MONTHLY' },
      { periodStart: '2026-01-01T00:00:00', periodType: 'QUARTERLY' },
      { periodStart: '2025-12-01T00:00:00', periodType: 'MONTHLY' }
    ],
    [
      { periodStart: '2026-04-01T00:00:00', periodType: 'MONTHLY' },
      { periodStart: '2025-12-01T00:00:00', periodType: 'MONTHLY' }
    ]
  ])
  assert.deepEqual(options.map(option => option.value), ['2026-04', '2025-12'])
  assert.equal(resolvePublishedDashboardPeriod('', options), '2026-04')
  assert.equal(resolvePublishedDashboardPeriod('2025-12', options), '2025-12')
  assert.equal(resolvePublishedDashboardPeriod('', []), '2025-12')
  assert.deepEqual(resolvePublishedDashboardPeriodRange([], options), ['2026-04', '2026-04'])
  assert.deepEqual(resolvePublishedDashboardPeriodRange(['2025-12', '2026-04'], options), ['2025-12', '2026-04'])
  assert.deepEqual(resolvePublishedDashboardPeriodRange(['2026-03', '2026-04'], options), ['2026-04', '2026-04'])
})

test('backend KPI_CARD widgets render as interactive KPI widgets', () => {
  const schema = dashboardDetailToSchema({
    dashboard: { id: 'quality-board', name: '质量安全看板', type: 'CUSTOM' },
    version: {
      layout: { columns: 24 },
      widgets: [{ code: 'mortality-card', title: '住院死亡率', type: 'KPI_CARD', dataSourceCode: 'MORTALITY', indicatorVersionId: '102027642460761114', position: {} }]
    }
  })
  assert.equal(schema.widgets[0].type, 'kpi')
  assert.equal(schema.widgets[0].visualType, 'kpi')
  assert.equal(schema.widgets[0].config.analysisIndicatorVersionId, '102027642460761114')
})
