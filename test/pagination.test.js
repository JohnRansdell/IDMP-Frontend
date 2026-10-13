import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages } from '../src/idmp/api/pagination.js'

test('loads every backend page, preserving filters and opaque resource IDs', async () => {
  const requests = []
  const records = Array.from({ length: 1203 }, (_, index) => ({ id: String(102027642463173248n + BigInt(index)) }))
  const result = await fetchAllPages(async params => {
    requests.push(params)
    return { records: records.slice((params.page - 1) * params.size, params.page * params.size),
      total: String(records.length), pageNum: params.page, pageSize: params.size }
  }, { publicationStatus: 'PUBLISHED', page: 99 })
  assert.deepEqual(result, records)
  assert.deepEqual(requests.map(item => item.page), [1, 2, 3])
  assert.ok(requests.every(item => item.publicationStatus === 'PUBLISHED' && item.size === 500))
})

test('uses the server page size when the requested size is capped', async () => {
  const result = await fetchAllPages(async ({ page }) => ({ records: [page], total: '3', pageSize: 1 }))
  assert.deepEqual(result, [1, 2, 3])
})

test('accepts legacy full lists and empty pages', async () => {
  assert.deepEqual(await fetchAllPages(async () => [{ id: '1' }]), [{ id: '1' }])
  assert.deepEqual(await fetchAllPages(async () => ({ records: [], total: '0' })), [])
  assert.deepEqual(await fetchAllPages(async ({ page }) => ({ items: page === 1 ? [1, 2] : [3], size: 2 })), [1, 2, 3])
})

test('does not report a partial or failed list as complete', async () => {
  await assert.rejects(fetchAllPages(async () => ({ records: [], total: '2' })), /尚未加载完整/)
  await assert.rejects(fetchAllPages(async ({ page }) => {
    if (page === 2) throw new Error('network failure')
    return { records: [1], total: '2', pageSize: 1 }
  }), /network failure/)
})
