import test from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD_BREAKPOINTS, dashboardBreakpointForWidth, deriveResponsiveLayout, responsiveColumns } from '../src/idmp/features/dashboard/responsiveLayout.js'
import { getWidgetResponsivePresentationCapability } from '../src/idmp/features/dashboard/widgetCapabilities.js'

const widgets = [
  { id: 'trend', type: 'chart', chartKind: 'line', layout: { x: 8, y: 3, w: 16, h: 8 } },
  { id: 'kpi-2', type: 'kpi', layout: { x: 6, y: 0, w: 6, h: 3 } },
  { id: 'table', type: 'chart', chartKind: 'table', layout: { x: 0, y: 12, w: 24, h: 8 } },
  { id: 'kpi-1', type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 } },
  { id: 'heatmap', type: 'chart', chartKind: 'heatmap', layout: { x: 0, y: 20, w: 24, h: 8 } }
]
const noOverlap = layout => layout.every((item, index) => layout.slice(index + 1).every(other => !(item.layout.x < other.layout.x + other.layout.w && item.layout.x + item.layout.w > other.layout.x && item.layout.y < other.layout.y + other.layout.h && item.layout.y + item.layout.h > other.layout.y)))

test('breakpoint contract covers the width matrix centrally', () => {
  assert.equal(DASHBOARD_BREAKPOINTS.mobile, 768)
  assert.deepEqual([1920, 1440, 1366].map(dashboardBreakpointForWidth), ['desktop', 'desktop', 'desktop'])
  assert.deepEqual([1024, 768].map(dashboardBreakpointForWidth), ['tablet', 'tablet'])
  assert.equal(dashboardBreakpointForWidth(375), 'mobile')
  assert.deepEqual(['desktop', 'tablet', 'mobile'].map(responsiveColumns), [24, 2, 1])
})

test('responsive derivation is deterministic, bounded and preserves desktop geometry', () => {
  const desktop = deriveResponsiveLayout(widgets, 'desktop')
  const tablet = deriveResponsiveLayout(widgets, 'tablet')
  const mobile = deriveResponsiveLayout(widgets, 'mobile')
  assert.deepEqual(desktop.map(item => item.layout), widgets.map(item => item.layout))
  assert.deepEqual(tablet, deriveResponsiveLayout(widgets, 'tablet'))
  for (const [layout, columns] of [[tablet, 2], [mobile, 1]]) {
    assert.equal(noOverlap(layout), true)
    assert.equal(layout.every(item => Number.isInteger(item.layout.x) && Number.isInteger(item.layout.y) && item.layout.x >= 0 && item.layout.w > 0 && item.layout.x + item.layout.w <= columns), true)
  }
})

test('mobile reading order is desktop y then x, in one readable column', () => {
  const mobile = deriveResponsiveLayout(widgets, 'mobile')
  assert.deepEqual(mobile.map(item => item.id), ['kpi-1', 'kpi-2', 'trend', 'table', 'heatmap'])
  assert.equal(mobile.every(item => item.layout.x === 0 && item.layout.w === 1), true)
  assert.equal(mobile.find(item => item.id === 'trend').layout.h >= 8, true)
  assert.equal(mobile.find(item => item.id === 'table').layout.h >= 9, true)
  assert.equal(mobile.find(item => item.id === 'heatmap').layout.h >= 9, true)
})

test('empty and single KPI dashboards remain valid', () => {
  assert.deepEqual(deriveResponsiveLayout([], 'mobile'), [])
  assert.deepEqual(deriveResponsiveLayout([{ id: 'one', type: 'kpi', layout: { x: 12, y: 4, w: 6, h: 3 } }], 'mobile')[0].layout, { x: 0, y: 0, w: 1, h: 3 })
})

test('mobile presentation capability is viewer-only and keeps chart/table content readable', () => {
  assert.equal(getWidgetResponsivePresentationCapability({ type: 'chart', chartKind: 'line' }).mobileMinH, 8)
  assert.equal(getWidgetResponsivePresentationCapability({ type: 'chart', chartKind: 'gauge' }).compact, 'square-chart')
  assert.equal(getWidgetResponsivePresentationCapability({ type: 'chart', chartKind: 'table' }).compact, 'horizontal-scroll')
})
