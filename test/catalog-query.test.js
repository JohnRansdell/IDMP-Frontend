import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { useCatalogQuery } from '../src/idmp/features/catalog/useCatalogQuery.js'

const result = (records = [], total = records.length) => ({ records, total: String(total) })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('catalog sends submitted filters to backend and preserves server order, totals and applied filters across pages', async () => {
  const calls = []
  const query = useCatalogQuery(async params => { calls.push(params); return result([{ id: 3 }, { id: 1 }], 30) }, { keyword: '', status: '' }, 9)
  Object.assign(query.filters, { keyword: '死亡手术', status: 'PUBLISHED' })
  query.page.value = 3
  await query.search()
  assert.deepEqual(calls.at(-1), { keyword: '死亡手术', status: 'PUBLISHED', page: 1, size: 9 })
  assert.deepEqual(query.rows.value.map(row => row.id), [3, 1])
  assert.equal(query.total.value, 30)
  query.filters.keyword = '尚未提交的文本'
  query.page.value = 2
  await query.load()
  assert.equal(calls.at(-1).keyword, '死亡手术')
  assert.equal(calls.at(-1).page, 2)
  query.size.value = 20
  await query.resize()
  assert.equal(calls.at(-1).page, 1)
  assert.equal(calls.at(-1).size, 20)
  await query.reset()
  assert.equal(calls.at(-1).keyword, '')
  assert.equal(calls.at(-1).status, '')
})

test('catalog cancels previous request and ignores late replies even when transport ignores abort', async () => {
  const old = deferred(), recent = deferred(), calls = []
  const query = useCatalogQuery((params, options) => { calls.push(options); return params.keyword === '旧查询' ? old.promise : recent.promise }, { keyword: '' })
  query.filters.keyword = '旧查询'
  const a = query.search()
  query.filters.keyword = '新查询'
  const b = query.search()
  assert.equal(calls[0].signal.aborted, true)
  recent.resolve(result([{ id: '新' }], 5)); await b
  old.resolve(result([{ id: '旧' }], 999)); await a
  assert.equal(query.rows.value[0].id, '新')
  assert.equal(query.total.value, 5)
  assert.equal(query.loading.value, false)
})

test('catalog retains table while loading and preserves actionable backend errors through recovery', async () => {
  let response = Promise.resolve(result([{ id: 1 }], 1))
  const query = useCatalogQuery(() => response)
  await query.load()
  const wait = deferred(); response = wait.promise
  const pending = query.load()
  assert.equal(query.hasLoaded.value, true)
  assert.equal(query.rows.value.length, 1)
  wait.reject(new Error('搜索内容不能超过200个字符'))
  await pending
  assert.equal(query.error.value.message, '搜索内容不能超过200个字符')
  response = Promise.resolve(result([]))
  await query.load()
  assert.equal(query.error.value, null)
  assert.equal(query.total.value, 0)
})

test('catalog returns to last available page after deletion without mixing response pages', async () => {
  const pages = []
  const query = useCatalogQuery(async params => { pages.push(params.page); return result(params.page === 1 ? [{ id: 1 }] : [], 1) }, {}, 9)
  query.page.value = 2
  await query.load()
  assert.deepEqual(pages, [2, 1])
  assert.equal(query.page.value, 1)
  assert.equal(query.rows.value[0].id, 1)
  assert.equal(query.loading.value, false)
})

test('leaving catalog aborts pending request and prevents its response changing state', async () => {
  const scope = effectScope(), wait = deferred()
  let signal
  const query = scope.run(() => useCatalogQuery((params, options) => { signal = options.signal; return wait.promise }))
  const pending = query.load()
  scope.stop()
  assert.equal(signal.aborted, true)
  wait.resolve(result([{ id: 1 }], 7)); await pending
  assert.equal(query.total.value, 0)
  assert.deepEqual(query.rows.value, [])
})
