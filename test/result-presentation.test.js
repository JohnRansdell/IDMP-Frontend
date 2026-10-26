import test from 'node:test'
import assert from 'node:assert/strict'
import { resultNumber, resultChartNumber, formatResultNumber, formatResultValue } from '../src/idmp/features/shared/resultPresentation.js'
import { normalizeResultMetrics, drillResultMetrics } from '../src/idmp/api/adapters/result.js'
import { bindingChartOption, compileWidgetData, formatDashboardKpiMetric, formatDashboardTableMetric } from '../src/idmp/features/dashboard/bindingEngine.js'
import { applyIndicatorAnalysisToSource } from '../src/idmp/features/dashboard/visualization.js'
import { backendChartValue } from '../src/idmp/features/dashboard/backendChartDrill.js'

test('missing or invalid values never fabricate zeros; genuine zero remains numeric', () => {
  for (const value of [null, undefined, '', ' ', false, true, NaN, Infinity, 'NaN', 'Infinity', [], {}, '0x10']) {
    assert.equal(resultNumber(value), null)
    assert.equal(resultChartNumber(value, { unit: '%' }), null)
    assert.equal(formatResultValue(value, { unit: '%' }), '-')
    assert.equal(formatResultNumber(value), '-')
    assert.deepEqual(formatDashboardKpiMetric(value, { unit: 'PERCENT' }), { value: '—', unit: '' })
    assert.equal(formatDashboardTableMetric(value, { unit: '%' }), '—')
  }
  for (const value of [0, '0', '-0', '0e-10']) {
    assert.equal(Math.abs(resultChartNumber(value)), 0)
    assert.equal(formatResultValue(value, { unit: '%' }), '0.00%')
  }
})

test('raw ratios and legacy percentage-point datasets are explicit, never double scaled', () => {
  assert.equal(formatResultValue(1 / 429, { unit: '%' }), '0.23%')
  assert.equal(formatResultValue(1 / 429, { unit: 'PERCENT' }), '0.23%')
  assert.equal(formatDashboardTableMetric(100 / 429, { unit: '%' }), '0.23%')
  assert.equal(formatDashboardTableMetric(1 / 429, { unit: 'PERCENT' }), '0.23%')
  assert.equal(formatDashboardTableMetric(10, { unit: '%', aggregation: 'count' }), '10')
  assert.equal(formatDashboardTableMetric('0015', { semanticType: 'dimension' }), '0015')
  assert.equal(formatResultValue(0.002, { unit: '%', displayValue: '0.2000%' }), '0.2000%')
  assert.equal(formatResultValue(20, { displayValue: 0 }), '0')
})

test('formula display follows backend multiplier, scale and every rounding mode', () => {
  for (const [roundingMode, positive, negative] of [
    ['HALF_UP', '1.3', '-1.3'], ['HALF_DOWN', '1.2', '-1.2'], ['HALF_EVEN', '1.2', '-1.2'],
    ['UP', '1.3', '-1.3'], ['DOWN', '1.2', '-1.2'], ['CEILING', '1.3', '-1.2'], ['FLOOR', '1.2', '-1.3']
  ]) {
    const display = { format: 'NUMBER', multiplier: '10', scale: 1, roundingMode }
    assert.equal(formatResultValue('0.125', { display }), positive)
    assert.equal(formatResultValue('-0.125', { display }), negative)
    assert.equal(resultChartNumber('0.125', { display }), 1.25)
  }
  assert.equal(formatResultValue('0.003', { unit: '%', display: { format: 'PERCENT', multiplier: '100', scale: 3 } }), '0.300%')
  assert.equal(formatResultValue('0.3', { unit: '%', display: { format: 'PERCENT' } }), '0.30%')
  assert.equal(formatResultValue('1.235', { display: { format: 'CURRENCY', scale: 2 } }), '1.24')
  assert.equal(formatResultValue('1.235', { display: { scale: 2, roundingMode: 'UNNECESSARY' } }), '-')
  assert.equal(formatResultValue('1.230', { display: { scale: 2, roundingMode: 'UNNECESSARY' } }), '1.23')
  assert.equal(formatResultValue('1.235', { displayValue: '后端正式展示值', display: { scale: 2, roundingMode: 'UNNECESSARY' } }), '后端正式展示值')
})

test('aliases preserve explicit nulls, IDs, status and periods without aggregation', () => {
  const input = Object.freeze({ resultId: '9007199254740999', periodStart: '2026-01-01', periodEnd: '2026-02-01',
    status: 'VALUE_NOT_CALCULABLE', indicatorValue: null, numerator: 0, denominator: 0, unit: 'PERCENT' })
  const result = normalizeResultMetrics(input)
  assert.equal(result.value, null)
  assert.equal(result.numeratorValue, 0)
  assert.equal(result.denominatorValue, 0)
  for (const key of Object.keys(input)) assert.equal(result[key], input[key])
  assert.equal(normalizeResultMetrics({ value: null, indicatorValue: 20 }).value, null)
  assert.equal(normalizeResultMetrics({ numeratorValue: null, numerator: 20 }).numeratorValue, null)
  assert.equal(drillResultMetrics({ indicatorValue: null, value: 20 }).indicatorValue, null)
  assert.equal(drillResultMetrics({ value: 0 }).displayValue, null)
})

test('chart coordinates retain unrounded precision and missing trend/factor values', () => {
  const raw = 1 / 429
  const source = applyIndicatorAnalysisToSource({ unit: '%' }, { dataAvailable: true, overview: { value: raw },
    trend: [{ value: raw }, { value: null }, { value: 0 }] })
  assert.equal(source.currentValue, '0.23%')
  assert.ok(Math.abs(source.trendData[0] - raw * 100) < 1e-12)
  assert.notEqual(source.trendData[0], 0.23)
  assert.deepEqual(source.trendData.slice(1), [null, 0])
  assert.equal(source.analysisCurrentRows[0].numeratorValue, null)
  assert.equal(source.analysisCurrentRows[0].denominatorValue, null)
  const row = { indicatorValue: raw, displayValue: '0.23%', numerator: 1, denominator: 429 }
  assert.ok(Math.abs(backendChartValue(row, 'bar', '%') - raw * 100) < 1e-12)
  assert.equal(backendChartValue(row, 'pie', '%'), raw)
  assert.equal(backendChartValue(row, 'pie', '%', 'numerator'), 1)
  assert.equal(backendChartValue(row, 'pie', '%', 'denominator'), 429)
  assert.equal(backendChartValue({ indicatorValue: null, displayValue: '0.00%' }, 'bar', '%'), null)
})

test('formal display values follow sorting and missing-row filtering, never leaking into aggregates', () => {
  const dataset = { serverCalculated: true,
    fields: [{ id: 'dept', semanticType: 'dimension' }, { id: 'value', semanticType: 'measure', unit: 'PERCENT' }],
    rows: [{ dept: '内科', value: 0.125, displayValue: '12.500%' }, { dept: '外科', value: null }, { dept: '急诊科', value: 0.35, displayValue: '35.000%' }] }
  const binding = { dimensions: [{ field: 'dept' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [{ field: 'value', direction: 'desc' }] }
  for (const kind of ['bar', 'line', 'pie']) {
    const model = compileWidgetData(kind, binding, dataset)
    const option = bindingChartOption(kind, model)
    assert.equal(model.series[0].values[0], 0.35)
    assert.equal(model.series[0].displayValues[0], '35.000%')
    const tooltip = kind === 'pie' ? option.tooltip : option.series[0].tooltip
    assert.equal(tooltip.valueFormatter(0.35, 0), '35.000%')
    if (kind !== 'pie') assert.equal(option.series[0].label.formatter({ value: 0.35, dataIndex: 0 }), '35.000%')
  }
  const model = compileWidgetData('line', { ...binding, measures: [{ field: 'value', aggregation: 'sum' }] }, { ...dataset, serverCalculated: false })
  assert.equal(model.series[0].displayValues, undefined)
})
