import test from 'node:test'
import assert from 'node:assert/strict'
import { applyWidgetBackgroundMode, applyWidgetStylePreset, applyWidgetVisualStyle, chartColorKey, chartColorTargets, chartPaletteLabels, createWidgetGradient, parseWidgetGradientColors, resetWidgetVisualStyle, resolveWidgetBackgroundMode, resolveWidgetVisualStyle } from '../src/idmp/features/dashboard/visualStyle.js'
import { createPersistableDashboardSnapshot, normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'

const widget = (chartKind, style = {}) => ({ id: `${chartKind}-1`, type: 'chart', chartKind, config: { style } })

test('palette labels describe the visualization rather than anonymous series', () => {
  assert.deepEqual(chartPaletteLabels(widget('bar'), 1), ['柱形颜色'])
  assert.deepEqual(chartPaletteLabels(widget('bar'), 2), ['柱形颜色 1', '柱形颜色 2'])
  assert.deepEqual(chartPaletteLabels(widget('line'), 1), ['折线颜色'])
  assert.deepEqual(chartPaletteLabels(widget('pie'), 2), ['分类颜色 1', '分类颜色 2'])
  assert.deepEqual(chartPaletteLabels(widget('scatter'), 1), ['散点颜色'])
  assert.deepEqual(chartPaletteLabels(widget('heatmap'), 2), ['数值色阶 1', '数值色阶 2'])
  assert.deepEqual(chartPaletteLabels(widget('map'), 2), ['区域色阶 1', '区域色阶 2'])
  assert.ok(chartPaletteLabels({ type: 'kpi' }, 2).every(label => !label.includes('系列')))
  assert.ok(chartPaletteLabels({ type: 'metric-group' }, 2).every(label => !label.includes('系列')))
})

test('bar colors target actual categories and retain their stable dimension keys', () => {
  const bar = widget('bar', { colorOverrides: { [chartColorKey('category', { department: '外科' })]: '#e67e22' } })
  const model = { categories: ['内科', '外科', '儿科'], dimensionTuples: [{ department: '内科' }, { department: '外科' }, { department: '儿科' }], series: [{ name: '出院人数', values: [12, 18, 9] }] }
  assert.deepEqual(chartColorTargets(bar, model), [
    { key: chartColorKey('category', { department: '内科' }), label: '内科' },
    { key: chartColorKey('category', { department: '外科' }), label: '外科' },
    { key: chartColorKey('category', { department: '儿科' }), label: '儿科' }
  ])
  const option = applyWidgetVisualStyle(bar, { xAxis: { type: 'category', data: model.categories }, yAxis: { type: 'value' }, series: [{ name: '出院人数', type: 'bar', data: model.series[0].values.map((value, index) => ({ value, id: chartColorKey('category', model.dimensionTuples[index]) })) }] })
  assert.equal(option.series[0].data.length, 3)
  assert.equal(option.series[0].data[1].itemStyle.color, '#e67e22')
  assert.notEqual(option.series[0].data[0].itemStyle.color, '#e67e22')
})

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

test('minimal donut keeps a visible band when its inner radius is 70 percent', () => {
  const option = applyWidgetVisualStyle({ type: 'chart', chartKind: 'pie', config: { style: { pie: { donut: true, innerRadius: 70, showLabel: false } } } }, { series: [{ type: 'pie', data: [{ name: 'A', value: 3 }, { name: 'B', value: 2 }] }] })
  assert.deepEqual(option.series[0].radius, ['70%', '82%'])
  assert.equal(option.series[0].label.show, false)
  assert.equal(option.series[0].data.length, 2)
})

test('x axis rotation has explicit and deterministic auto presentation without changing data', () => {
  const data = [12, 14, 18]
  const explicit = applyWidgetVisualStyle(widget('bar', { common: { xAxisLabelRotation: 45 } }), { grid: { bottom: 28 }, xAxis: { type: 'category', data: ['一月', '二月', '三月'] }, series: [{ type: 'bar', data }] })
  assert.equal(explicit.xAxis.axisLabel.rotate, 45)
  assert.equal(explicit.grid.bottom, 28)
  assert.equal(explicit.grid.containLabel, true)
  assert.equal(explicit.xAxis.axisLabel.width, 88)
  assert.equal(explicit.xAxis.axisLabel.overflow, 'truncate')
  assert.equal(explicit.xAxis.axisLabel.hideOverlap, true)
  assert.deepEqual(explicit.series[0].data.map(item => item.value), data)
  const shortAuto = applyWidgetVisualStyle(widget('line'), { xAxis: { type: 'category', data: ['一月', '二月'] }, series: [{ type: 'line', data }] })
  const denseAuto = applyWidgetVisualStyle(widget('line'), { xAxis: { type: 'category', data: ['呼吸内科一组', '呼吸内科二组', '心血管内科一组', '心血管内科二组', '神经内科一组', '神经内科二组', '消化内科一组'] }, series: [{ type: 'line', data }] })
  assert.equal(shortAuto.xAxis.axisLabel.rotate, 0)
  assert.equal(denseAuto.xAxis.axisLabel.rotate, 45)
  for (const rotate of [0, 30, 45, 60, 90]) {
    const result = applyWidgetVisualStyle(widget('bar', { common: { xAxisLabelRotation: rotate } }), { xAxis: { data: ['一月'] }, series: [{ type: 'bar', data }] })
    assert.equal(result.xAxis.axisLabel.rotate, rotate)
  }
})

test('rotated labels do not reserve a second bottom band or affect horizontal bars', () => {
  const data = [12, 14, 18]
  const steep = applyWidgetVisualStyle(widget('line', { common: { xAxisLabelRotation: 90 } }), {
    grid: { top: 38, bottom: 28 },
    xAxis: { type: 'category', data: ['呼吸内科长期随访组', '心血管内科长期随访组'] },
    series: [{ type: 'line', data }]
  })
  assert.equal(steep.grid.bottom, 28)
  assert.equal(steep.xAxis.axisLabel.width, 64)

  const bottomLegend = applyWidgetVisualStyle(widget('line', { common: { xAxisLabelRotation: 45, legendPosition: 'bottom' } }), {
    grid: { bottom: 28 }, legend: {}, xAxis: { type: 'category', data: ['一月', '二月'] }, series: [{ type: 'line', data }]
  })
  assert.equal(bottomLegend.grid.bottom, 36)

  const horizontal = applyWidgetVisualStyle(widget('bar', {
    common: { xAxisLabelRotation: 60 },
    bar: { orientation: 'horizontal' }
  }), {
    grid: { left: 42, bottom: 28 },
    xAxis: { type: 'category', data: ['呼吸内科长期随访组'] },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data }]
  })
  assert.equal(horizontal.grid.bottom, 28)
  assert.equal(horizontal.grid.left, 82)
  assert.equal(horizontal.xAxis.type, 'value')
  assert.equal(horizontal.yAxis.axisLabel.rotate, 0)
})

test('style preset applies a visible solid card scheme without activating gradients or images', () => {
  const applied = applyWidgetStylePreset({ backgroundAssetKey: 'deep-blue', backgroundImage: 'https://example.test/old.png', customNote: 'kept', kpi: { trendColor: '#000000' } }, 'blueTeal')
  assert.equal(applied.background, '#f2f9fb')
  assert.equal(applied.backgroundMode, 'solid')
  assert.equal(applied.palettePreset, 'blueTeal')
  assert.equal(applied.themePreset, 'blueTeal')
  assert.equal(applied.themeAccent, undefined)
  assert.equal(applied.kpi.valueColor, '#12616d')
  assert.equal(applied.backgroundImage, undefined)
  assert.equal(applied.backgroundAssetKey, undefined)
  assert.equal(applied.customNote, 'kept')
  assert.equal(Object.hasOwn(applied, 'stylePreset'), false)
  const schema = normalizeDashboardSchema({ version: 1, id: 'preset', widgets: [{ id: 'kpi', type: 'kpi', config: { style: applied } }] })
  const persisted = JSON.parse(JSON.stringify(createPersistableDashboardSnapshot(schema)))
  assert.equal(persisted.widgets[0].config.style.palettePreset, 'blueTeal')
  assert.equal(persisted.widgets[0].config.style.backgroundGradient, undefined)
  assert.equal(persisted.widgets[0].config.style.backgroundAssetKey, undefined)
})

test('switching a legacy gradient theme back to clinical restores the default white surface', () => {
  const legacy = { background: '#f2f9fb', backgroundGradient: 'linear-gradient(135deg,#f8fcff 0%,#edf9f7 100%)', kpi: { valueColor: '#12616d' } }
  const clinical = applyWidgetStylePreset(legacy, 'clinical')
  const appliedByInspector = { ...legacy, ...clinical }
  assert.equal(appliedByInspector.background, '#ffffff')
  assert.equal(appliedByInspector.backgroundGradient, undefined)
  assert.equal(resolveWidgetBackgroundMode(appliedByInspector), 'solid')
  assert.equal(appliedByInspector.kpi.valueColor, '#153b5d')
})

test('theme presets remain visibly distinct when applied through the inspector patch path', () => {
  const base = { background: '#ffffff', backgroundMode: 'none' }
  const clinical = { ...base, ...applyWidgetStylePreset(base, 'clinical') }
  const mint = { ...base, ...applyWidgetStylePreset(base, 'mintHospital') }
  const warm = { ...base, ...applyWidgetStylePreset(base, 'warm') }
  assert.notEqual(clinical.kpi.valueColor, mint.kpi.valueColor)
  assert.notEqual(mint.kpi.valueColor, warm.kpi.valueColor)
  assert.notEqual(clinical.palettePreset, warm.palettePreset)
  assert.equal(resolveWidgetBackgroundMode(mint), 'solid')
  assert.equal(resolveWidgetBackgroundMode(warm), 'solid')
})

test('background modes are mutually exclusive while legacy style precedence remains deterministic', () => {
  const legacy = { background: '#fff', backgroundGradient: 'linear-gradient(#fff,#def)', backgroundAssetKey: 'deep-blue', backgroundImage: 'https://example.test/old.png' }
  assert.equal(resolveWidgetBackgroundMode(legacy), 'image')
  const gradient = applyWidgetBackgroundMode(legacy, 'gradient')
  assert.equal(resolveWidgetBackgroundMode(gradient), 'gradient')
  assert.equal(gradient.backgroundAssetKey, undefined)
  const image = applyWidgetBackgroundMode(gradient, 'image')
  assert.equal(image.backgroundGradient, undefined)
  const none = applyWidgetBackgroundMode(image, 'none')
  assert.equal(resolveWidgetBackgroundMode(none), 'none')
  assert.equal(none.background, '#ffffff')
})

test('widget gradient colors round trip through the visual picker contract', () => {
  assert.deepEqual(parseWidgetGradientColors('linear-gradient(135deg,#112233 0%,#aabbcc 100%)'), ['#112233', '#aabbcc'])
  assert.equal(createWidgetGradient(['#123456', '#abcdef']), 'linear-gradient(135deg,#123456 0%,#abcdef 100%)')
  assert.deepEqual(parseWidgetGradientColors('invalid'), ['#f8fcff', '#edf9f7'])
})

test('dashboard and widget visual fields survive the persistence boundary', () => {
  const schema = normalizeDashboardSchema({ version: 1, id: 'backgrounds', appearance: { background: { type: 'image', value: '#ffffff', image: 'https://example.test/background.png', size: 'cover', position: 'top', overlay: 0.35 } }, widgets: [{ id: 'a', type: 'kpi', config: { style: { backgroundGradient: 'linear-gradient(135deg, #fff, #def)', backgroundImage: 'https://example.test/card.png', backgroundSize: 'contain', backgroundPosition: 'bottom', backgroundOverlay: 0.2 } } }] })
  const persisted = createPersistableDashboardSnapshot(schema)
  assert.deepEqual(persisted.appearance.background, { type: 'image', value: '#ffffff', image: 'https://example.test/background.png', assetKey: '', size: 'cover', position: 'top', overlay: 0.35, intensity: 100 })
  assert.equal(persisted.widgets[0].config.style.backgroundImage, 'https://example.test/card.png')
  assert.equal(persisted.widgets[0].config.style.backgroundOverlay, 0.2)
})

test('legacy widgets resolve existing visuals and reset leaves binding layout and interaction intact', () => {
  const legacy = widget('line')
  assert.equal(resolveWidgetVisualStyle(legacy).line.width, 2.5)
  const schema = normalizeDashboardSchema({ version: 1, id: 'style-reset', widgets: [{ id: 'line', type: 'chart', chartKind: 'line', layout: { x: 2, y: 3, w: 12, h: 6 }, config: { style: { background: '#fff', line: { width: 5 }, palettePreset: 'warm', presentationPreset: 'area' }, dataBinding: { dataset: 'dual', dimensions: [{ field: 'month' }], measures: [{ field: 'actualValue', aggregation: 'direct' }], series: [], sort: [] }, interaction: { clickAction: 'cross-filter' } } }] })
  const item = schema.widgets[0]
  const style = resetWidgetVisualStyle(item.config.style)
  assert.equal(style.background, '#ffffff')
  assert.equal(style.backgroundMode, 'none')
  assert.equal(style.line, undefined)
  assert.equal(style.presentationPreset, undefined)
  assert.equal(style.palettePreset, undefined)
  assert.equal(style.kpiVariant, 'standard')
  assert.deepEqual(item.layout, { x: 2, y: 3, w: 12, h: 6 })
  assert.equal(item.config.dataBinding.dataset, 'dual')
  assert.equal(item.config.interaction.clickAction, 'cross-filter')
  const persisted = createPersistableDashboardSnapshot(schema)
  assert.equal(persisted.widgets[0].config.style.line.width, 5)
  assert.equal(persisted.widgets[0].config.style.palettePreset, 'warm')
})
