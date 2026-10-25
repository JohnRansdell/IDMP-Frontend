import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { analysisReportContext, formalReportGranularity, analysisFilterParams, analysisRouteKey, shiftReportDate } from '../src/idmp/features/analysis/reportPeriod.js'
import { reportOverview, reportProvenance } from '../src/idmp/features/analysis/reportResult.js'
import { normalizeIndicatorRangeSummaryParams, collectFormulaFactorVersionIds, createIndicatorDataExplanation } from '../src/idmp/api/adapters/indicator.js'
import { buildIndicatorAnalysisPeriodContext, buildIndicatorAnalysisRouteQuery } from '../src/idmp/features/dashboard/analysisNavigation.js'

test('dashboard custom ranges use instant summary while month quarter year use formal results', () => {
  for (const [start, end, granularity] of [['2026-01-01', '2026-04-01', 'CUSTOM'], ['2026-02-01', '2026-05-01', 'CUSTOM'], ['2024-02-01', '2024-03-01', 'MONTHLY'], ['2026-01-01', '2027-01-01', 'YEARLY']]) {
    const route = buildIndicatorAnalysisRouteQuery({ indicatorId: '1' }, { periodStart: start, periodEnd: end, granularity })
    const context = analysisReportContext(route)
    assert.equal(context.mode, granularity === 'CUSTOM' ? 'INSTANT' : 'FORMAL')
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
    mode: 'INSTANT', granularity: 'MONTHLY', summaryGranularity: 'CUSTOM', range: ['2026-01-01', '2026-03-31']
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
  assert.match(source, /get filters\(\) \{ return rankPeriodProps\.value\.filters \}/)
  assert.match(source, /loadDepartmentComparisons\(data, paths, searchResultDrill, analysisFilters\(params\)\)/)
})

test('normal entry defaults to formal and right-open monthly dates become inclusive exactly once', () => {
  assert.equal(analysisReportContext({}).mode, 'FORMAL')
  assert.equal(analysisReportContext({ summaryMode: 'INSTANT' }).mode, 'FORMAL')
  assert.equal(analysisReportContext({ summaryMode: 'FORMAL', summaryGranularity: 'CUSTOM' }).mode, 'INSTANT')
  for (const [end, inclusive] of [['2026-02-01', '2026-01-31'], ['2024-03-01', '2024-02-29'], ['2027-01-01', '2026-12-31']]) {
    assert.equal(shiftReportDate(end, -1), inclusive)
    assert.equal(shiftReportDate(inclusive, 1), end)
  }
})

test('department and disease filters survive dashboard route and range request serialization', () => {
  for (const filters of [{ OUT_DEPT_CODE: ['15'] }, { OUT_DEPT_CODE: ['15', '16'] }, { IN_ICD10: ['J18'], scenarioVersionId: ['123'] }]) {
    const route = buildIndicatorAnalysisRouteQuery({ indicatorId: '1' }, {
      periodStart: '2026-01-01', periodEnd: '2026-04-01', granularity: 'CUSTOM', filters
    })
    const params = normalizeIndicatorRangeSummaryParams({ ...route, ...analysisFilterParams(route) })
    for (const [field, value] of Object.entries(filters)) assert.deepEqual(params[`filter.${field}`], value)
  }
})

test('route identity changes for dates, versions, mode and filters but not key order', () => {
  const base = { indicator: '1', indicatorVersionId: '2', periodStart: '2026-01-01', periodEnd: '2026-03-31' }
  const key = analysisRouteKey(base)
  for (const update of [{ indicatorVersionId: '3' }, { periodEnd: '2026-04-30' }, { summaryMode: 'INSTANT' }, { 'filter.OUT_DEPT_CODE': ['15'] }])
    assert.notEqual(analysisRouteKey({ ...base, ...update }), key)
  assert.equal(analysisRouteKey(Object.fromEntries(Object.entries(base).reverse())), key)
})

test('summary explanation and provenance cannot borrow a monthly result or an instant result source', () => {
  const monthly = { resultId: 'old-month', snapshotId: 'old-snapshot', numerator: 76, denominator: 15395 }
  const summary = { numeratorValue: 208, denominatorValue: 42245, sourceResultIds: ['jan', 'feb', 'mar'], sourceSnapshotIds: ['snapshot'] }
  assert.equal(reportOverview(summary, monthly).numerator, 208)
  assert.equal(reportOverview(summary, monthly).denominator, 42245)
  assert.deepEqual(reportOverview(summary, monthly, true), {})
  assert.deepEqual(reportProvenance(summary, monthly), [['正式结果来源 ID', 'jan、feb、mar'], ['正式快照来源 ID', 'snapshot']])
  assert.deepEqual(reportProvenance({ executionMode: 'AD_HOC_SOURCE' }, monthly), [['正式结果来源 ID', '-'], ['正式快照来源 ID', '-']])
  assert.equal(reportOverview(null, monthly), monthly)
})

test('formula explanations preserve subtraction, constants, functions and unary branches', () => {
  const factor = id => ({ nodeType: 'FACTOR_REF', factorVersionId: id })
  const subtract = { nodeType: 'BINARY', operator: 'SUB', left: factor('1'), right: factor('2') }
  const ratio = { nodeType: 'BINARY', operator: 'DIV', left: subtract, right: factor('3') }
  const rounded = { nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, arguments: [ratio] }
  const negative = { nodeType: 'UNARY', operator: 'NEGATE', operand: factor('4') }
  const condition = { nodeType: 'CONDITION', condition: { nodeType: 'CONST', value: true }, whenTrue: rounded, whenFalse: negative }
  assert.deepEqual(collectFormulaFactorVersionIds(condition), ['1', '2', '3', '4'])
  const explain = root => createIndicatorDataExplanation({ version: { formula: { root } }, factorVersions: { '1': { name: '入院' }, '2': { name: '排除' }, '3': { name: '总量' } } })
  assert.equal(explain(ratio).formulaText, '((入院 − 排除) ÷ 总量)')
  assert.equal(explain(rounded).formulaText, 'ROUND(((入院 − 排除) ÷ 总量), 2)')
  assert.equal(explain({ nodeType: 'BINARY', operator: 'MUL', left: factor('1'), right: { nodeType: 'CONST', value: '100' } }).formulaText, '(入院 × 100)')
})
