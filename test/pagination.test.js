import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages } from '../src/idmp/api/pagination.js'
import { readFile } from 'node:fs/promises'

test('warning indicator selection uses the all-pages API beyond 200 versions', async () => {
  const source = await readFile(new URL('../src/idmp/views/AlertCenter.vue', import.meta.url), 'utf8')
  assert.match(source, /import \{ fetchAllIndicatorVersions \}/)
  assert.match(source, /await fetchAllIndicatorVersions\(\{ publicationStatus: 'PUBLISHED', size: 200 \}\)/)
  for (const total of [201, 401, 601]) {
    const records = Array.from({ length: total }, (_, index) => ({ id: String(index + 1), name: `中文指标${index + 1}` }))
    const result = await fetchAllPages(async ({ page, size }) => ({ records: records.slice((page - 1) * size, page * size), total, pageSize: size, pageNum: page }), { publicationStatus: 'PUBLISHED', size: 200 })
    assert.deepEqual(result, records)
  }
})

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

test('repeated pages fail promptly rather than growing the collected list forever', async () => {
  for (const total of [undefined, 10000]) {
    let calls = 0
    await assert.rejects(fetchAllPages(async () => {
      assert.ok(++calls <= 2, 'a repeated page must not be requested indefinitely')
      return { records: [{ id: '1' }, { id: '2' }], pageSize: 2, ...(total == null ? {} : { total }) }
    }), /分页未推进/)
    assert.equal(calls, 2)
  }
})

test('the server returning the wrong page number is rejected before accumulating data', async () => {
  let calls = 0
  await assert.rejects(fetchAllPages(async () => {
    calls++
    return { records: [{ id: '1' }], pageNum: 1, pageSize: 1, total: 3 }
  }), /分页信息异常/)
  assert.equal(calls, 2)
})
