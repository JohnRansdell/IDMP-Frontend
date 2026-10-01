import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAccessToken, requestJson, setAccessToken } from '../src/idmp/api/request.js'

test('shared query cache reuses reads, invalidates writes, and isolates sessions', async () => {
  const originalFetch = globalThis.fetch
  const originalStorage = globalThis.localStorage
  const values = new Map()
  const calls = []
  globalThis.localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method || 'GET' })
    const data = url.endsWith('/analysis/big')
      ? { rows: 'x'.repeat(1_100_000) }
      : { count: calls.length }
    return { ok: true, text: async () => JSON.stringify({ code: '0', data }) }
  }

  try {
    setAccessToken('first-user')
    const first = await requestJson('/indicators?page=1')
    first.count = 999
    assert.deepEqual(await requestJson('/indicators?page=1'), { count: 1 })
    assert.equal(calls.length, 1)

    await requestJson('/indicators', { method: 'POST', body: '{}' })
    assert.deepEqual(await requestJson('/indicators?page=1'), { count: 3 })
    assert.equal(calls.length, 3)

    setAccessToken('second-user')
    assert.deepEqual(await requestJson('/indicators?page=1'), { count: 4 })
    await requestJson('/async-tasks/123')
    await requestJson('/async-tasks/123')
    assert.equal(calls.length, 6)

    await requestJson('/indicators?page=1', { headers: { 'X-Context': 'A' } })
    await requestJson('/indicators?page=1', { headers: { 'X-Context': 'B' } })
    assert.equal(calls.length, 8)

    const query = { method: 'POST', body: JSON.stringify({ period: '2026-03' }) }
    assert.deepEqual(await requestJson('/analysis/dashboards/one/query', query), { count: 9 })
    assert.deepEqual(await requestJson('/analysis/dashboards/one/query', query), { count: 9 })
    assert.equal(calls.length, 9)
    await requestJson('/analysis/dashboard-data-sources/source/filter-options', { method: 'POST', body: '{}' })
    assert.deepEqual(await requestJson('/analysis/dashboards/one/query', query), { count: 9 })
    assert.equal(calls.length, 10)

    const originalNow = Date.now
    Date.now = () => originalNow() + 31_000
    try {
      assert.deepEqual(await requestJson('/analysis/dashboards/one/query', query), { count: 11 })
    } finally {
      Date.now = originalNow
    }

    await requestJson('/analysis/big')
    await requestJson('/analysis/big')
    assert.equal(calls.length, 13)
  } finally {
    clearAccessToken()
    globalThis.fetch = originalFetch
    globalThis.localStorage = originalStorage
  }
})
