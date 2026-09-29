import test from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD_PALETTE, MINT_MEDICAL_PALETTE, createDashboardChartTheme } from '../src/idmp/features/dashboard/chartTheme.js'
import { getDashboardWidgetSizeTier } from '../src/idmp/features/dashboard/widgetSizing.js'

test('Clinical Light uses the system blue as its primary chart color and preserves green for success semantics', () => {
  assert.equal(DASHBOARD_PALETTE[0], '#1261a6')
  assert.notEqual(DASHBOARD_PALETTE[0], '#247a4d')
  const option = createDashboardChartTheme({ xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [] })
  assert.equal(option.media.at(-1).query.maxWidth, 420)
  assert.equal(option.media.at(-1).option.legend.type, 'scroll')
})

test('dark chart surfaces use readable defaults without overriding explicit colors', () => {
  const dark = createDashboardChartTheme({ title: { textStyle: { color: '#facc15' } }, legend: { textStyle: { color: '#f0abfc' } }, xAxis: { axisLabel: { color: '#86efac' } }, yAxis: { nameTextStyle: { color: '#93c5fd' } } }, 'dark')
  assert.equal(dark.textStyle.color, '#f8fbff')
  assert.equal(dark.legend.textStyle.color, '#f0abfc')
  assert.equal(dark.xAxis.axisLabel.color, '#86efac')
  assert.equal(dark.yAxis.nameTextStyle.color, '#93c5fd')
  assert.equal(dark.yAxis.axisLabel.color, '#d9e9f5')
})

test('mint medical theme changes only presentation defaults and retains chart data', () => {
  const source = { series: [{ type: 'line', data: [12, 18] }], xAxis: { type: 'category', data: ['1', '2'] }, yAxis: { type: 'value' } }
  const themed = createDashboardChartTheme(source, 'light', 'mint-medical')
  assert.deepEqual(themed.color, MINT_MEDICAL_PALETTE)
  assert.deepEqual(themed.series[0].data, [12, 18])
  assert.deepEqual(themed.xAxis.data, ['1', '2'])
})

test('chart theme reserves independent space for legends, axes and bottom scales', () => {
  const topLegend = createDashboardChartTheme({ legend: { top: 0 }, grid: { top: 20, bottom: 20 }, xAxis: { type: 'category', data: ['一', '二'] }, yAxis: { type: 'value' }, series: [{ name: '趋势', type: 'line', data: [1, 2] }] })
  assert.ok(topLegend.grid.top >= 44)
  assert.equal(topLegend.grid.containLabel, true)
  const bottomLegend = createDashboardChartTheme({ legend: { bottom: 0 }, grid: { bottom: 20 }, xAxis: { type: 'category', data: ['一'] }, yAxis: { type: 'value' }, series: [{ name: '数量', type: 'bar', data: [1] }] })
  assert.ok(bottomLegend.grid.bottom >= 52)
  const heatmap = createDashboardChartTheme({ grid: { bottom: 20 }, visualMap: { bottom: 0 }, xAxis: { type: 'category' }, yAxis: { type: 'category' }, series: [{ type: 'heatmap', data: [] }] })
  assert.ok(heatmap.grid.bottom >= 54)
  assert.equal(heatmap.media.find(item => item.query.maxHeight === 220).option.visualMap.show, false)
})

test('size tier changes with the measured container dimensions', () => {
  assert.equal(getDashboardWidgetSizeTier(120, 240), 'micro')
  assert.equal(getDashboardWidgetSizeTier(240, 170), 'compact')
  assert.equal(getDashboardWidgetSizeTier(420, 260), 'standard')
  assert.equal(getDashboardWidgetSizeTier(800, 460), 'expanded')
})
