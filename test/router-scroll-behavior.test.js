import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollBehavior } from '../src/router/scrollBehavior.js'

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
