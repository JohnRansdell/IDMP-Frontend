import test from 'node:test'
import assert from 'node:assert/strict'
import { alignSelectedLayout, clearWidgetSelection, distributeSelectedLayout, nextWidgetSelection } from '../src/idmp/features/dashboard/layoutOperations.js'
const widgets = [
  { id: 'a', layout: { x: 0, y: 0, w: 2, h: 2 } },
  { id: 'b', layout: { x: 5, y: 3, w: 3, h: 2 } },
  { id: 'c', layout: { x: 12, y: 8, w: 2, h: 4 } }
]
test('selection is a single runtime model with additive toggle and clear', () => {
  let selection = nextWidgetSelection({}, 'a'); assert.deepEqual(selection, { ids: ['a'], primaryId: 'a' })
  selection = nextWidgetSelection(selection, 'b', { additive: true }); assert.deepEqual(selection, { ids: ['a', 'b'], primaryId: 'b' })
  selection = nextWidgetSelection(selection, 'a', { additive: true }); assert.deepEqual(selection, { ids: ['b'], primaryId: 'b' })
  assert.deepEqual(clearWidgetSelection(), { ids: [], primaryId: '' })
})
test('alignment uses integer grid geometry and rejects collisions', () => {
  assert.deepEqual(alignSelectedLayout(widgets, ['a', 'c'], 'right').widgets.map(item => item.layout.x), [12, 5, 12])
  const collisionWidgets = [...widgets, { id: 'd', layout: { x: 0, y: 8, w: 2, h: 2 } }]
  assert.equal(alignSelectedLayout(collisionWidgets, ['a', 'c'], 'left').ok, false)
  assert.deepEqual(alignSelectedLayout(widgets, ['a', 'c'], 'top').widgets.map(item => item.layout.y), [0, 3, 0])
})
test('distribution preserves outer boundaries and deterministically allocates integer gaps', () => {
  const result = distributeSelectedLayout(widgets, ['a', 'b', 'c'], 'x')
  assert.equal(result.ok, true)
  assert.deepEqual(result.widgets.map(item => item.layout.x), [0, 6, 12])
})

test('failed distribution is a no-op instead of a false successful history entry', () => {
  const result = distributeSelectedLayout(widgets, ['a', 'b'], 'x')
  assert.equal(result.ok, false)
  assert.equal(result.reason, '至少选择三个组件')
  assert.equal(result.widgets, widgets)
})
