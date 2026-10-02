import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardDetailToSchema, schemaToDashboardPayload, schemaToMockDashboardPayload } from '../src/idmp/api/adapters/dashboard.js'
import { normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { applyWidgetLayoutToCanvas, drawnRectangleToGridLayout, gridWidthToPercentage, percentageToGridWidth, validatePreciseLayout } from '../src/idmp/features/dashboard/preciseLayout.js'
const widgets = [{ id: 'kpi', type: 'kpi', config: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }, { id: 'chart', type: 'chart', chartKind: 'line', config: {}, layout: { x: 8, y: 0, w: 8, h: 6 } }]
test('precise layout accepts integer-normalized valid grid geometry and rejects bad mutations', () => {
  assert.deepEqual(validatePreciseLayout(widgets, 'kpi', { x: '0', y: '4', w: '6.2', h: '3' }).layout, { x: 0, y: 4, w: 6, h: 3 })
  assert.equal(validatePreciseLayout(widgets, 'kpi', { x: 0, y: 0, w: 2, h: 1 }).ok, true)
  for (const draft of [{ x: -1, y: 0, w: 6, h: 3 }, { x: 20, y: 0, w: 6, h: 3 }, { x: 0, y: 0, w: 0, h: 1 }, { x: 9, y: 0, w: 6, h: 3 }]) assert.equal(validatePreciseLayout(widgets, 'kpi', draft).ok, false)
  assert.equal(validatePreciseLayout([{ ...widgets[0], config: { locked: true } }], 'kpi', { x: 0, y: 4, w: 6, h: 3 }).ok, false)
})
test('percentage conversion is deterministic and persists only grid units', () => {
  assert.deepEqual([100, 50, 25, 33].map((percent) => percentageToGridWidth(percent)), [24, 12, 6, 8])
  assert.equal(gridWidthToPercentage(6), 25)
  assert.equal(percentageToGridWidth(50, 12), 6)
  assert.equal(gridWidthToPercentage(6, 12), 50)
  assert.equal(validatePreciseLayout(widgets, 'kpi', { x: 9, y: 0, w: 6, h: 3 }, 12).ok, false)
})

test('precise layout waits for the canvas to settle before reading its final coordinates', async () => {
  let finishLayout
  const canvas = { applyLayout: () => new Promise(resolve => { finishLayout = resolve }) }
  const result = applyWidgetLayoutToCanvas(canvas, widgets)
  const settled = [{ id: 'kpi', x: 9, y: 0, w: 6, h: 3 }]
  finishLayout(settled)
  assert.deepEqual(await result, settled)
})

test('drawn placement snaps forward and reverse rectangles to the same grid cells', () => {
  const geometry = { columns: 24, rows: 16, cellWidth: 50, cellHeight: 60 }
  const start = { x: 305, y: 125 }, end = { x: 595, y: 355 }
  assert.deepEqual(drawnRectangleToGridLayout(start, end, geometry), { x: 6, y: 2, w: 6, h: 4 })
  assert.deepEqual(drawnRectangleToGridLayout(end, start, geometry), { x: 6, y: 2, w: 6, h: 4 })
  assert.deepEqual(drawnRectangleToGridLayout({ x: -50, y: -20 }, { x: 1300, y: 1100 }, geometry), { x: 0, y: 0, w: 24, h: 16 })
  assert.deepEqual(drawnRectangleToGridLayout({ x: 1200, y: 960 }, { x: 1200, y: 960 }, geometry), { x: 23, y: 15, w: 1, h: 1 })
})

test('drawn placement respects minimum sizes and the existing lock and collision rules', () => {
  const geometry = { columns: 24, rows: 16, cellWidth: 50, cellHeight: 60 }
  assert.deepEqual(drawnRectangleToGridLayout({ x: 1150, y: 900 }, { x: 1160, y: 910 }, geometry, { minW: 3, minH: 2 }), { x: 21, y: 14, w: 3, h: 2 })
  const collision = drawnRectangleToGridLayout({ x: 400, y: 0 }, { x: 700, y: 180 }, geometry)
  assert.equal(validatePreciseLayout(widgets, 'kpi', collision).ok, false)
  const locked = [{ ...widgets[0], config: { locked: true } }]
  assert.equal(validatePreciseLayout(locked, 'kpi', { x: 3, y: 4, w: 6, h: 3 }).ok, false)
  assert.equal(drawnRectangleToGridLayout({ x: 0, y: 0 }, { x: 10, y: 10 }, { ...geometry, cellWidth: 0 }), null)
})

test('drawn placements preserve empty rows through live and mock backend payload round trips', () => {
  const layout = drawnRectangleToGridLayout({ x: 100, y: 360 }, { x: 400, y: 540 }, { columns: 24, rows: 16, cellWidth: 50, cellHeight: 60 })
  const schema = normalizeDashboardSchema({ version: 1, id: 'placement', layout: { engine: 'gridstack', columns: 24, float: true }, widgets: [{ ...widgets[0], layout }] })
  for (const encode of [schemaToDashboardPayload, schemaToMockDashboardPayload]) {
    const payload = encode(schema)
    const restored = dashboardDetailToSchema({ dashboard: { id: schema.id }, version: payload })
    assert.equal(restored.layout.float, true)
    assert.deepEqual(restored.widgets[0].layout, layout)
  }
})
