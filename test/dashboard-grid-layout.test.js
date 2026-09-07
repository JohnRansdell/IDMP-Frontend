import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyPixelLayoutToGrid, serializeGridLayout } from '../src/idmp/features/dashboard/gridLayout.js'

test('legacy pixel layout maps full and half design widths to grid columns', () => {
  const result = legacyPixelLayoutToGrid([{ id: 'full', type: 'chart', x: 0, y: 0, w: 1440, h: 480 }, { id: 'half', type: 'chart', x: 720, y: 480, w: 720, h: 480 }], { designWidth: 1440, columns: 24, cellHeight: 60 })
  assert.deepEqual(result.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })), [{ id: 'full', x: 0, y: 0, w: 24, h: 8 }, { id: 'half', x: 12, y: 8, w: 12, h: 8 }])
})

test('legacy migration clamps invalid bounds and resolves collisions', () => {
  const result = legacyPixelLayoutToGrid([{ id: 'a', type: 'kpi', x: -200, y: -20, w: 2000, h: 0 }, { id: 'b', type: 'kpi', x: 0, y: 0, w: 300, h: 200 }, { id: 'b', type: 'kpi', x: 0, y: 0, w: 300, h: 200 }])
  assert.equal(result.length, 2)
  assert.ok(result[0].x >= 0 && result[0].x + result[0].w <= 24)
  assert.ok(result[1].y >= result[0].y + result[0].h || result[1].x >= result[0].x + result[0].w)
})

test('grid serialization keeps only layout units', () => {
  assert.deepEqual(serializeGridLayout([{ id: 'a', x: 1.4, y: -2, w: 0, h: 3.7, content: '<div />' }]), [{ id: 'a', x: 1, y: 0, w: 1, h: 4 }])
})
