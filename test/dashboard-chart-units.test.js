import assert from 'node:assert/strict'
import test from 'node:test'
import { bindingChartOption, compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { applyWidgetVisualStyle } from '../src/idmp/features/dashboard/visualStyle.js'

function fixture(unit = 'PERCENT', kind = 'line', extra = []) {
  const binding = { dimensions: [{ field: 'month' }], measures: [{ field: 'value', aggregation: 'direct' }, ...extra], series: [], sort: [] }
  const dataset = { rowMode: 'PROJECTED', fields: [{ id: 'month', label: '月份', semanticType: 'time' },
    { id: 'value', label: '指标值', semanticType: 'measure', unit },
    { id: 'amount', label: '费用', semanticType: 'measure', unit: 'YUAN' }],
  rows: [{ month: '2026-01', value: 1 / 429, amount: 123456.78 }] }
  const model = compileWidgetData(kind, binding, dataset)
  assert.equal(model.status, 'ready')
  return { model, dataset, option: bindingChartOption(kind, model) }
}

test('percentage chart axes, tooltips and labels agree with tables without changing numeric data', () => {
  for (const kind of ['bar', 'line']) {
    const { option, dataset } = fixture('PERCENT', kind)
    assert.equal(option.yAxis.axisLabel.formatter(1 / 429), '0.23%')
    assert.equal(option.series[0].tooltip.valueFormatter(1 / 429), '0.23%')
    assert.equal(option.series[0].label.formatter({ value: 1 / 429 }), '0.23%')
    assert.equal(kind === 'bar' ? option.series[0].data[0].value : option.series[0].data[0], 1 / 429)
    assert.equal(dataset.rows[0].value, 1 / 429)
  }
})

test('legacy scaled percentages are not multiplied twice and missing values remain missing', () => {
  const { option } = fixture('%')
  const format = option.series[0].tooltip.valueFormatter
  assert.equal(format(100 / 429), '0.23%')
  assert.equal(format(0), '0.00%')
  assert.equal(format(null), '—')
  assert.equal(format(-0.23), '-0.23%')
})

test('dual axes format ratio and money independently, retaining the right-axis binding', () => {
  const { option } = fixture('PERCENT', 'line', [{ field: 'amount', aggregation: 'direct', axis: 'right' }])
  assert.equal(option.yAxis[0].axisLabel.formatter(0.04), '4.00%')
  assert.equal(option.yAxis[1].axisLabel, undefined)
  assert.equal(option.series[0].tooltip.valueFormatter(0.04), '4.00%')
  assert.equal(option.series[1].tooltip.valueFormatter(123456.78), '123,456.78')
  assert.equal(option.series[1].yAxisIndex, 1)
  assert.equal(option.series[1].data[0], 123456.78)
})

test('mixed units on one axis do not fabricate a shared percentage scale', () => {
  const { option } = fixture('PERCENT', 'bar', [{ field: 'amount', aggregation: 'direct' }])
  assert.equal(option.yAxis.axisLabel, undefined)
  assert.equal(option.series[0].tooltip.valueFormatter(0.04), '4.00%')
  assert.equal(option.series[1].tooltip.valueFormatter(123), '123')
})

test('count aggregation does not inherit its source percentage unit', () => {
  const binding = { dimensions: [{ field: 'department' }], measures: [{ field: 'value', aggregation: 'count' }], series: [], sort: [] }
  const model = compileWidgetData('bar', binding, { fields: [{ id: 'department', semanticType: 'dimension' }, { id: 'value', semanticType: 'measure', unit: 'PERCENT' }], rows: [{ department: '内科', value: 0.2 }, { department: '内科', value: 0.3 }] })
  const option = bindingChartOption('bar', model)
  assert.equal(option.yAxis.axisLabel, undefined)
  assert.equal(option.series[0].tooltip.valueFormatter(2), '2')
})

test('horizontal styling retains percentage ticks and data labels', () => {
  const { option } = fixture('PERCENT', 'bar')
  const styled = applyWidgetVisualStyle({ chartKind: 'bar', config: { style: { bar: { orientation: 'horizontal' } } } }, option)
  assert.equal(styled.xAxis.axisLabel.formatter(0.01), '1.00%')
  assert.equal(styled.series[0].label.formatter({ value: 0.01 }), '1.00%')
})

test('pie tooltip displays the metric rate, without altering the slice values', () => {
  const model = { status: 'ready', series: [{ unit: 'PERCENT', values: [1 / 429] }], items: [{ name: '内科', value: 1 / 429 }], dimensionTuples: [{ dept: '16' }] }
  const option = bindingChartOption('pie', model)
  assert.equal(option.tooltip.valueFormatter(1 / 429), '0.23%')
  assert.equal(option.series[0].data[0].value, 1 / 429)
  assert.deepEqual(option.series[0].data[0].dimensionValues, { dept: '16' })
})
