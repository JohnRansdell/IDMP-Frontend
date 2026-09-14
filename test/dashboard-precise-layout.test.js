import test from 'node:test'
import assert from 'node:assert/strict'
import { gridWidthToPercentage, percentageToGridWidth, validatePreciseLayout } from '../src/idmp/features/dashboard/preciseLayout.js'
const widgets = [{ id: 'kpi', type: 'kpi', config: {}, layout: { x: 0, y: 0, w: 6, h: 3 } }, { id: 'chart', type: 'chart', chartKind: 'line', config: {}, layout: { x: 8, y: 0, w: 8, h: 6 } }]
test('precise layout accepts integer-normalized valid grid geometry and rejects bad mutations', () => {
  assert.deepEqual(validatePreciseLayout(widgets, 'kpi', { x: '0', y: '4', w: '6.2', h: '3' }).layout, { x: 0, y: 4, w: 6, h: 3 })
  for (const draft of [{ x: -1, y: 0, w: 6, h: 3 }, { x: 20, y: 0, w: 6, h: 3 }, { x: 0, y: 0, w: 2, h: 1 }, { x: 9, y: 0, w: 6, h: 3 }]) assert.equal(validatePreciseLayout(widgets, 'kpi', draft).ok, false)
  assert.equal(validatePreciseLayout([{ ...widgets[0], config: { locked: true } }], 'kpi', { x: 0, y: 4, w: 6, h: 3 }).ok, false)
})
test('percentage conversion is deterministic and persists only grid units', () => {
  assert.deepEqual([100, 50, 25, 33].map((percent) => percentageToGridWidth(percent)), [24, 12, 6, 8])
  assert.equal(gridWidthToPercentage(6), 25)
})
