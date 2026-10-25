import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'
import { buildReportSummaryRequest } from '../src/idmp/features/analysis/reportQuery.js'
import { resolveReportPeriod, analysisReportContext, reportPeriodQuery, analysisFilters } from '../src/idmp/features/analysis/reportPeriod.js'

const source = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')

function page(range, granularity = 'CUSTOM') {
  const state = {
    reportPeriodRange: { value: range }, backendAnalysisGranularity: { value: granularity }, reportFilters: { value: {} },
    indicatorRuntimeParameters: { value: [] }, indicatorRuntimeParameterValues: { value: {} }
  }
  return { ...state, reportQueryPayload: () => buildReportSummaryRequest({
    indicatorId: '11', versionId: '22', range: state.reportPeriodRange.value,
    granularity: state.backendAnalysisGranularity.value, filters: state.reportFilters.value,
    parameters: state.indicatorRuntimeParameters.value.length
      ? buildSqlRuntimeParameterValues(state.indicatorRuntimeParameters.value, state.indicatorRuntimeParameterValues.value) : undefined
  }).payload }
}

test('backend timestamps become date-only picker values and valid query boundaries', () => {
  const view = page([])
  const overview = { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-03-31T00:00:00' }
  view.reportPeriodRange.value = resolveReportPeriod([overview.periodStart, overview.periodEnd], 'CUSTOM').range
  assert.deepEqual(view.reportPeriodRange.value, ['2026-03-01', '2026-03-31'])
  assert.deepEqual(view.reportQueryPayload(), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('query serialization also accepts full timestamps without appending time twice', () => {
  const view = page(['2026-03-01T00:00:00', '2026-03-31T00:00:00'])
  assert.deepEqual(JSON.parse(JSON.stringify(view.reportQueryPayload())), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('date picker input retains inclusive end-day semantics across leap days and years', () => {
  for (const [start, end, next] of [
    ['2024-02-01', '2024-02-29', '2024-03-01'],
    ['2026-12-01', '2026-12-31', '2027-01-01'],
    ['2026-03-01', '2026-03-01', '2026-03-02']
  ]) {
    assert.deepEqual(page([start, end]).reportQueryPayload(), {
      summaryOnly: true, periodStart: `${start}T00:00:00`, periodEnd: `${next}T00:00:00`
    })
  }
})

test('timestamp normalization preserves the calendar date without timezone conversion', () => {
  const view = page(['2026-03-01T00:00:00.000+08:00', '2026-03-31T23:59:59.999+08:00'])
  assert.deepEqual(view.reportQueryPayload(), {
    summaryOnly: true, periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00'
  })
})

test('static queries still omit dates and retain declared runtime parameters', () => {
  const view = page([], 'STATIC')
  assert.deepEqual(view.reportQueryPayload(), { summaryOnly: true })
  view.indicatorRuntimeParameters.value = [{ code: 'deptCode', type: 'STRING' }]
  view.indicatorRuntimeParameterValues.value = { deptCode: '5' }
  assert.deepEqual(view.reportQueryPayload(), { summaryOnly: true, parameters: { deptCode: '5' } })
})

test('instant summary preserves multiple department and diagnosis members', () => {
  const view = page(['2026-02-01', '2026-04-30'])
  view.reportFilters.value = { OUT_DEPT_CODE: ['15', '16'], IN_ICD10: ['J18'] }
  assert.deepEqual(view.reportQueryPayload().filters, view.reportFilters.value)
  assert.doesNotMatch(source, /<label>查询方式<\/label>|带看板筛选的分析仅支持正式结果查询/)
  assert.match(source, /fetchInstant: queryIndicatorSummary/)
})

test('formal request owns its version, inclusive dates and prefixed filters, not runtime parameters', () => {
  for (const [granularity, range] of [
    ['MONTHLY', ['2024-02-01', '2024-02-29']], ['QUARTERLY', ['2026-01-01', '2026-03-31']],
    ['YEARLY', ['2026-01-01', '2026-12-31']]
  ]) {
    const request = buildReportSummaryRequest({ indicatorId: '11', versionId: '22', range, granularity,
      filters: { OUT_DEPT_CODE: ['15', '16'], IN_ICD10: ['J18.900'] }, parameters: { patientName: '张' } })
    assert.equal(request.mode, 'FORMAL')
    assert.equal(request.method, 'GET')
    assert.equal(request.path, '/analysis/indicators/11/range-summary')
    assert.deepEqual(request.params, { indicatorVersionId: '22', periodStart: range[0], periodEnd: range[1], granularity,
      'filter.OUT_DEPT_CODE': ['15', '16'], 'filter.IN_ICD10': ['J18.900'] })
    assert.equal(request.payload, undefined)
  }
})

test('legacy exclusive dates are decoded once then survive route and request round trips', () => {
  const legacy = { granularity: 'CUSTOM', periodStart: '2024-02-01', periodEnd: '2024-03-01', 'filter.OUT_DEPT_CODE': ['15', '16'] }
  const context = analysisReportContext(legacy)
  const route = { ...legacy, ...reportPeriodQuery(context) }
  const restored = analysisReportContext(route)
  assert.deepEqual(restored, context)
  const request = buildReportSummaryRequest({ indicatorId: '11', versionId: '22', range: restored.range,
    granularity: restored.summaryGranularity, filters: analysisFilters(route) })
  assert.equal(request.payload.periodEnd, '2024-03-01T00:00:00')
  assert.equal(request.mode, 'INSTANT')
  assert.deepEqual(request.payload.filters, { OUT_DEPT_CODE: ['15', '16'] })
})

test('incomplete and static periods do not borrow temporal results', () => {
  for (const range of [[], ['2026-01-01'], ['2026-01-01', '']]) {
    assert.equal(buildReportSummaryRequest({ indicatorId: '11', versionId: '22', range, granularity: 'MONTHLY' }), null)
  }
  assert.equal(buildReportSummaryRequest({ range: [], granularity: 'STATIC' }), null)
  const request = buildReportSummaryRequest({ versionId: '22', range: ['1000-01-01', '9999-12-31'], granularity: 'STATIC' })
  assert.equal(request.mode, 'INSTANT')
  assert.deepEqual(request.range, [])
  assert.deepEqual(request.payload, { summaryOnly: true })
})

test('formal selection changed to a multi-month range uses instant, never CUSTOM on the formal endpoint', () => {
  const request = buildReportSummaryRequest({ indicatorId: '11', versionId: '22', range: ['2026-01-01', '2026-03-31'], granularity: 'MONTHLY' })
  assert.equal(request.mode, 'INSTANT')
  assert.equal(request.summaryGranularity, 'CUSTOM')
  assert.equal(request.path, '/analysis/indicator-versions/22/instant-summary')
})
