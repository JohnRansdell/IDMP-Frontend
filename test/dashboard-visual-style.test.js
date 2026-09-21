import test from 'node:test'
import assert from 'node:assert/strict'
import { applyWidgetVisualStyle, resetWidgetVisualStyle, resolveWidgetVisualStyle } from '../src/idmp/features/dashboard/visualStyle.js'
import { createPersistableDashboardSnapshot, normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'

const widget = (chartKind, style = {}) => ({ id: `${chartKind}-1`, type: 'chart', chartKind, config: { style } })

test('line visual style maps safe schema controls to chart option and preserves data', () => {
  const line = widget('line', { palettePreset: 'custom', colors: ['#e67e22', '#1261a6'], line: { width: 4, type: 'dashed', smooth: true, showSymbol: true, symbol: 'diamond', symbolSize: 10, area: true, areaOpacity: 0.3 } })
  const data = [47.33, 48.83, 50.33]
  const option = applyWidgetVisualStyle(line, { xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'line', data }] })
  assert.deepEqual(option.color, ['#e67e22', '#1261a6'])
  assert.equal(option.series[0].lineStyle.width, 4)
  assert.equal(option.series[0].lineStyle.type, 'dashed')
  assert.equal(option.series[0].smooth, true)
  assert.equal(option.series[0].symbol, 'diamond')
  assert.equal(option.series[0].symbolSize, 10)
  assert.equal(option.series[0].areaStyle.opacity, 0.3)
  assert.equal(option.series[0].data, data)
})

test('bar, pie and map visual styles only alter presentation options', () => {
  const bar = applyWidgetVisualStyle(widget('bar', { palettePreset: 'warm', bar: { opacity: 0.6, borderRadius: 12, width: 'wide' } }), { series: [{ type: 'bar', data: [56, 49, 46] }] })
  assert.equal(bar.series[0].itemStyle.opacity, 0.6)
  assert.deepEqual(bar.series[0].itemStyle.borderRadius, [12, 12, 0, 0])
  assert.equal(bar.series[0].barWidth, '78%')
  const pie = applyWidgetVisualStyle(widget('pie', { pie: { donut: true, innerRadius: 60, showLabel: false, labelPosition: 'inside' } }), { series: [{ type: 'pie', data: [{ name: 'A', value: 1 }] }] })
  assert.deepEqual(pie.series[0].radius, ['60%', '70%'])
  assert.equal(pie.series[0].label.show, false)
  const map = applyWidgetVisualStyle(widget('map', { map: { lowColor: '#dceeff', highColor: '#003b72', borderColor: '#112233', borderWidth: 2, showLabel: false } }), { yAxis: { type: 'category' }, visualMap: { min: 59, max: 82 }, series: [{ type: 'bar', data: [82, 67, 74, 59] }] })
  assert.deepEqual(map.visualMap.inRange.color, ['#dceeff', '#003b72'])
  assert.equal(map.series[0].itemStyle.borderColor, '#112233')
  assert.equal(map.series[0].itemStyle.borderWidth, 2)
  assert.equal(map.yAxis.axisLabel.show, false)
})

test('legacy widgets resolve existing visuals and reset leaves binding layout and interaction intact', () => {
  const legacy = widget('line')
  assert.equal(resolveWidgetVisualStyle(legacy).line.width, 2.5)
  const schema = normalizeDashboardSchema({ version: 1, id: 'style-reset', widgets: [{ id: 'line', type: 'chart', chartKind: 'line', layout: { x: 2, y: 3, w: 12, h: 6 }, config: { style: { background: '#fff', line: { width: 5 }, palettePreset: 'warm' }, dataBinding: { dataset: 'dual', dimensions: [{ field: 'month' }], measures: [{ field: 'actualValue', aggregation: 'direct' }], series: [], sort: [] }, interaction: { clickAction: 'cross-filter' } } }] })
  const item = schema.widgets[0]
  const style = resetWidgetVisualStyle(item.config.style)
  assert.equal(style.background, '#fff')
  assert.equal(style.line, undefined)
  assert.equal(style.palettePreset, undefined)
  assert.deepEqual(item.layout, { x: 2, y: 3, w: 12, h: 6 })
  assert.equal(item.config.dataBinding.dataset, 'dual')
  assert.equal(item.config.interaction.clickAction, 'cross-filter')
  const persisted = createPersistableDashboardSnapshot(schema)
  assert.equal(persisted.widgets[0].config.style.line.width, 5)
  assert.equal(persisted.widgets[0].config.style.palettePreset, 'warm')
})
