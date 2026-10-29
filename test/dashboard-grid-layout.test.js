import test from 'node:test'
import assert from 'node:assert/strict'
import { getWidgetGridConstraints, serializeGridLayout } from '../src/idmp/features/dashboard/gridLayout.js'
import { getDashboardGridGeometry, normalizeWidgetSelectionId } from '../src/idmp/features/dashboard/widgetCapabilities.js'
import { compareDashboardGridMembership } from '../src/idmp/features/dashboard/gridMembership.js'

const membership = (schema, grid) => compareDashboardGridMembership({ widgets: schema.map(id => ({ id })) }, grid.map(id => ({ id })))
test('membership exact match is order independent', () => assert.equal(membership(['A', 'B', 'C'], ['C', 'A', 'B']).valid, true))
test('membership reports missing GridStack nodes', () => assert.deepEqual(membership(['A', 'B', 'C'], ['A', 'C']).missingInGrid, ['B']))
test('membership reports extra GridStack nodes', () => assert.deepEqual(membership(['A', 'B'], ['A', 'B', 'C']).extraInGrid, ['C']))
test('membership rejects equal counts with different ids', () => {
  const result = membership(['A', 'B'], ['A', 'C'])
  assert.equal(result.valid, false); assert.deepEqual(result.missingInGrid, ['B']); assert.deepEqual(result.extraInGrid, ['C'])
})
test('membership normalizes number/string identity including zero', () => assert.equal(membership([1, 0], ['1', '0']).valid, true))
test('membership accepts an empty dashboard', () => assert.equal(membership([], []).valid, true))
test('membership rejects duplicate ids on either side', () => {
  assert.deepEqual(membership(['A', 'A'], ['A']).duplicateSchemaIds, ['A'])
  const result = membership(['A'], ['A', 'A']); assert.equal(result.valid, false); assert.deepEqual(result.duplicateGridIds, ['A'])
})
test('membership rejects undefined, null and empty ids rather than filtering them out', () => {
  const result = membership([undefined], [null, ''])
  assert.equal(result.valid, false); assert.deepEqual(result.invalidSchemaIdIndexes, [0]); assert.deepEqual(result.invalidGridIdIndexes, [0, 1])
})
test('layout serializer normalizes valid numeric ids', () => assert.equal(serializeGridLayout([{ id: 123 }])[0].id, '123'))



test('grid serialization keeps only layout units', () => {
  assert.deepEqual(serializeGridLayout([{ id: 'a', x: 1.4, y: -2, w: 0, h: 3.7, content: '<div />' }]), [{ id: 'a', x: 1, y: 0, w: 1, h: 4 }])
})

test('grid serialization restores dimensions omitted at GridStack minimum constraints', () => {
  assert.deepEqual(serializeGridLayout([{ id: 'kpi', x: 1, y: 2, minW: 3, minH: 2 }]), [{ id: 'kpi', x: 1, y: 2, w: 3, h: 2 }])
})


test('every widget permits the one-by-one grid minimum', () => {
  assert.deepEqual(getWidgetGridConstraints('kpi'), { minW: 1, minH: 1 })
  assert.deepEqual(getWidgetGridConstraints({ type: 'chart', chartKind: 'line' }), { minW: 1, minH: 1 })
  assert.deepEqual(getWidgetGridConstraints({ type: 'chart', chartKind: 'bar' }), { minW: 1, minH: 1 })
  assert.deepEqual(getWidgetGridConstraints({ type: 'chart', chartKind: 'pie' }), { minW: 1, minH: 1 })
  assert.deepEqual(getWidgetGridConstraints('warnings'), { minW: 1, minH: 1 })
  assert.deepEqual(getWidgetGridConstraints('ranking'), { minW: 1, minH: 1 })
})

test('a persistent widget lock converts to GridStack move and resize constraints', () => {
  assert.deepEqual(getWidgetGridConstraints({ type: 'chart', config: { locked: true } }), { minW: 1, minH: 1, noMove: true, noResize: true })
  assert.deepEqual(getWidgetGridConstraints({ type: 'chart', config: { locked: false } }), { minW: 1, minH: 1 })
})

test('dashboard grid geometry follows the real GridStack columns, row height and margin', () => {
  assert.deepEqual(getDashboardGridGeometry(24, 50, 60, 8, 16), { columns: 24, cellWidth: 50, cellHeight: 60, margin: 8, rows: 16 })
  assert.deepEqual(getDashboardGridGeometry(12, 100.5, 64, 6, 9.2), { columns: 12, cellWidth: 100.5, cellHeight: 64, margin: 6, rows: 10 })
})

test('widget selection ids use the canonical string identity', () => {
  assert.equal(normalizeWidgetSelectionId('kpi-1'), 'kpi-1')
  assert.equal(normalizeWidgetSelectionId(42), '42')
  assert.equal(normalizeWidgetSelectionId(null), '')
})
