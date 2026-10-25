import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { analysisReportContext, formalReportGranularity } from '../src/idmp/features/analysis/reportPeriod.js'
import { buildIndicatorAnalysisPeriodContext, buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

test('dashboard links retain formal aggregation but never send CUSTOM as trend granularity', () => {
  for (const [start, end, granularity] of [['2026-01-01', '2026-04-01', 'CUSTOM'], ['2026-02-01', '2026-05-01', 'CUSTOM'], ['2024-02-01', '2024-03-01', 'MONTHLY'], ['2026-01-01', '2027-01-01', 'YEARLY']]) {
    const route = buildIndicatorAnalysisRouteQuery({ indicatorId: '1' }, { periodStart: start, periodEnd: end, granularity })
    const context = analysisReportContext(route)
    assert.equal(context.mode, 'FORMAL')
    assert.notEqual(context.granularity, 'CUSTOM')
    assert.equal(context.summaryGranularity, granularity)
    assert.equal(new Date(`${context.range[1]}T00:00:00Z`).getTime() + 86400000, new Date(`${end}T00:00:00Z`).getTime())
    assert.equal(route.trendEnd, context.range[1])
  }
})

test('fixed component inclusive dates are not shifted twice', () => {
  const route = buildIndicatorAnalysisRouteQuery({ indicatorId: '1' }, buildIndicatorAnalysisPeriodContext('', {
    periodMode: 'INDEPENDENT', periodStart: '2026-01-01', periodEnd: '2026-03-31', granularity: 'QUARTERLY'
  }))
  assert.equal(route.periodEnd, '2026-03-31')
  assert.equal(route.summaryGranularity, 'QUARTERLY')
})

test('old CUSTOM links recover exclusive dates without changing ordinary manual report dates', () => {
  assert.deepEqual(analysisReportContext({ granularity: 'CUSTOM', periodStart: '2026-01-01', periodEnd: '2026-04-01' }), {
    mode: 'FORMAL', granularity: 'MONTHLY', summaryGranularity: 'CUSTOM', range: ['2026-01-01', '2026-03-31']
  })
  assert.equal(analysisReportContext({ granularity: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-04-01' }).range[1], '2026-04-01')
  assert.equal(formalReportGranularity(['2026-01-01', '2026-02-28'], 'MONTHLY'), 'CUSTOM')
  assert.equal(formalReportGranularity(['2026-01-01', '2026-03-31'], 'CUSTOM'), 'CUSTOM')
  assert.equal(formalReportGranularity(['2026-01-01', '2026-03-31'], 'QUARTERLY'), 'QUARTERLY')
})

test('formal queries use the range endpoint and do not fall back to a different monthly value on failure', async () => {
  const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
  assert.match(source, /fetchIndicatorRangeSummary\(String\(selectedBackendIndicator/)
  assert.match(source, /rangeSummary\.value = \{ \.\.\.result, executionMode: 'FORMAL_RESULTS' \}/)
  assert.match(source, /if \(rangeSummaryLoading\.value \|\| rangeSummaryErrorMessage\.value\) return/)
})
