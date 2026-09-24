import test from 'node:test'
import assert from 'node:assert/strict'
import { applyChartPresentationPreset, applyWidgetVisualStyle, chartPresentationPresets } from '../src/idmp/features/dashboard/visualStyle.js'

const widget = (chartKind, style = {}, config = {}) => ({ id: `${chartKind}-1`, type: 'chart', chartKind, config: { style, ...config } })
test('chart presentation presets materialize existing style fields without data configuration', () => {
  assert.equal(chartPresentationPresets('bar').length, 4); assert.equal(chartPresentationPresets('line').length, 4); assert.equal(chartPresentationPresets('pie').length, 4)
  const source = widget('bar', { palettePreset: 'warm' }, { dataBinding: { dataset: 'd', measures: [{ field: 'value', aggregation: 'sum' }], sort: [{ field: 'value', direction: 'desc' }] }, interaction: { clickAction: 'cross-filter' } })
  const style = applyChartPresentationPreset(source, 'ranking')
  assert.equal(style.bar.orientation, 'horizontal'); assert.equal(style.palettePreset, 'warm'); assert.deepEqual(source.config.dataBinding.sort, [{ field: 'value', direction: 'desc' }]); assert.equal(source.config.interaction.clickAction, 'cross-filter')
  assert.equal(applyChartPresentationPreset(widget('line'), 'area').line.area, true); assert.equal(applyChartPresentationPreset(widget('pie'), 'minimal-donut').pie.innerRadius, 70)
})
test('ranking presentation swaps only chart axes and preserves data and tooltip', () => {
  const data = [56, 49, 46]; const option = applyWidgetVisualStyle(widget('bar', { bar: { orientation: 'horizontal', borderRadius: 7 } }), { tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: ['A', 'B', 'C'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', data }] })
  assert.equal(option.xAxis.type, 'value'); assert.equal(option.yAxis.type, 'category'); assert.deepEqual(option.yAxis.data, ['A', 'B', 'C']); assert.deepEqual(option.series[0].data, data); assert.equal(option.tooltip.trigger, 'axis')
})

test('advanced visualization presets materialize every supported visual style only', () => {
  const expected = { scatter: ['standard', 'emphasis', 'minimal'], radar: ['standard', 'filled', 'comparison'], funnel: ['standard', 'compact', 'label-analysis'], gauge: ['standard', 'progress', 'minimal'], heatmap: ['standard', 'soft', 'contrast'], map: ['standard', 'soft', 'contrast'] }
  for (const [kind, ids] of Object.entries(expected)) {
    assert.deepEqual(chartPresentationPresets(kind).map(item => item.id), ids)
    for (const id of ids) {
      const source = widget(kind, { palettePreset: 'blueTeal' }, { dataBinding: { dataset: 'acceptance', measures: [{ field: 'value', aggregation: 'sum' }], filters: [] }, interaction: { clickAction: 'cross-filter', drill: { enabled: true } } })
      const style = applyChartPresentationPreset(source, id)
      assert.equal(style.palettePreset, 'blueTeal')
      assert.deepEqual(source.config.dataBinding.filters, [])
      assert.equal(source.config.interaction.clickAction, 'cross-filter')
      assert.equal(source.config.interaction.drill.enabled, true)
    }
  }
  assert.equal(applyChartPresentationPreset(widget('radar'), 'filled').radar.area, true)
  assert.equal(applyChartPresentationPreset(widget('gauge'), 'minimal').gauge.showPointer, false)
  assert.equal(applyChartPresentationPreset(widget('heatmap'), 'contrast').heatmap.colorScale, 'coolWarm')
})
