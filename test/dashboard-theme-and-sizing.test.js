import test from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD_PALETTE, createDashboardChartTheme } from '../src/idmp/features/dashboard/chartTheme.js'
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

test('size tier changes with the measured container dimensions', () => {
  assert.equal(getDashboardWidgetSizeTier(120, 240), 'micro')
  assert.equal(getDashboardWidgetSizeTier(240, 170), 'compact')
  assert.equal(getDashboardWidgetSizeTier(420, 260), 'standard')
  assert.equal(getDashboardWidgetSizeTier(800, 460), 'expanded')
})
