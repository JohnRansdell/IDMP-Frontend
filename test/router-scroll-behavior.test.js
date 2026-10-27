import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollBehavior } from '../src/router/scrollBehavior.js'

test('factor continuation lets the loaded editor position its workflow', () => {
  const from = { path: '/factor/edit/new' }
  assert.equal(scrollBehavior({ path: '/factor/edit/123', hash: '#factor-workflow' }, from), false)
  assert.deepEqual(scrollBehavior({ path: '/factor/edit/123', hash: '' }, from), { top: 0 })
})

test('result lineage navigation locates the batch overview below the fixed topbar', () => {
  const from = { path: '/analysis', query: {} }
  assert.equal(scrollBehavior({ path: '/calc', hash: '#batch-overview', query: { batchId: '102027642463167129' } }, from), false)
  assert.deepEqual(scrollBehavior({ path: '/calc', query: { batchId: '102027642463167129' } }, from), { top: 0 })
  assert.deepEqual(scrollBehavior({ path: '/calc', hash: '#unknown', query: {} }, from), { top: 0 })
})

test('keeps position when analysis filters change for the same indicator version', () => {
  const from = { path: '/analysis', query: { indicator: 'A', indicatorVersionId: '1' } }
  const to = { path: '/analysis', query: { indicator: 'A', indicatorVersionId: '1', trendStart: '2026-03-01' } }
  assert.equal(scrollBehavior(to, from), false)
})

test('scrolls to top for another indicator or page', () => {
  const from = { path: '/analysis', query: { indicator: 'A', indicatorVersionId: '1' } }
  assert.deepEqual(scrollBehavior({ path: '/analysis', query: { indicator: 'B', indicatorVersionId: '1' } }, from), { top: 0 })
  assert.deepEqual(scrollBehavior({ path: '/analysis', query: { indicator: 'A', indicatorVersionId: '2' } }, from), { top: 0 })
  assert.deepEqual(scrollBehavior({ path: '/dashboard', query: {} }, from), { top: 0 })
})
