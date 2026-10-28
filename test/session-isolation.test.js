import test from 'node:test'
import assert from 'node:assert/strict'
import { requestJson, requestPdf, requestFile, setAccessToken, getAccessToken, setSessionRecoveryHandler } from '../src/idmp/api/request.js'
import { createDepartmentDictionaryLoader } from '../src/idmp/features/shared/departmentDictionary.js'
import { setStorageUser, userStorage } from '../src/idmp/auth/userStorage.js'
import { createLocalDashboard, readDashboardCatalog } from '../src/idmp/features/dashboard/catalog.js'
import { dashboardFilterLabel } from '../src/idmp/features/dashboard/departmentFilters.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) }
}

test('late responses never cross accounts, clear new credentials or replay writes', async () => {
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage }
  globalThis.localStorage = memoryStorage()
  globalThis.sessionStorage = memoryStorage()
  let refreshes = 0
  setSessionRecoveryHandler(async () => { refreshes++; return true })
  try {
    for (const run of [
      () => requestJson('/auth/me'),
      () => requestJson('/analysis/warning-rules', { method: 'POST', body: '{}' }),
      () => requestPdf('/report', {}),
      () => requestFile('/policies/example/file')
    ]) for (const status of [200, 401]) {
      setAccessToken('account-a')
      let release, calls = 0
      globalThis.fetch = () => { calls++; return new Promise(resolve => { release = resolve }) }
      const pending = run()
      setAccessToken('account-b')
      release(new Response(JSON.stringify({ code: 'OK', data: { owner: 'a' } }), { status }))
      await assert.rejects(pending, { name: 'AbortError', code: 'SESSION_CHANGED' })
      assert.equal(getAccessToken(), 'account-b')
      assert.equal(calls, 1)
    }
    assert.equal(refreshes, 0)
  } finally { Object.assign(globalThis, saved); setSessionRecoveryHandler(null) }
})

test('same-account refresh can retry without permitting an account switch', async () => {
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage }
  globalThis.localStorage = memoryStorage(); globalThis.sessionStorage = memoryStorage()
  try {
    setAccessToken('expired')
    setSessionRecoveryHandler(async () => { setAccessToken('renewed', { preserveSession: true }); return true })
    let calls = 0
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'OK', data: 'current' }), { status: ++calls === 1 ? 401 : 200 })
    assert.equal(await requestJson('/indicators'), 'current')
    assert.equal(calls, 2)
  } finally { Object.assign(globalThis, saved); setSessionRecoveryHandler(null) }
})

test('downloads started before switching discard a body that finishes later', async () => {
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage }
  globalThis.localStorage = memoryStorage(); globalThis.sessionStorage = memoryStorage()
  try {
    for (const run of [() => requestPdf('/report', {}), () => requestFile('/policy/file')]) {
      setAccessToken('account-a')
      let release, started
      const reading = new Promise(resolve => { started = resolve })
      globalThis.fetch = async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'application/pdf' }), blob: () => {
        started()
        return new Promise(resolve => { release = resolve })
      } })
      const pending = run()
      await reading
      setAccessToken('account-b')
      release(new Blob(['%PDF-1.7']))
      await assert.rejects(pending, { code: 'SESSION_CHANGED' })
      assert.equal(getAccessToken(), 'account-b')
    }
  } finally { Object.assign(globalThis, saved) }
})

test('dictionary separates both switching directions and rejects late old pages', async () => {
  let scope = 'admin', release
  const records = { admin: [{ code: '15', name: '骨科' }, { code: '16', name: '内科' }], doctor: [{ code: '15', name: '骨科' }], empty: [] }
  const load = createDepartmentDictionaryLoader(async ({ page }) => ({ pageNum: page, total: records[scope].length, records: records[scope] }), { scopeKey: () => scope })
  for (const [account, size] of [['admin', 2], ['doctor', 1], ['admin', 2], ['empty', 0]]) {
    scope = account; assert.equal((await load()).length, size)
  }
  scope = 'admin'
  const delayed = createDepartmentDictionaryLoader(({ page }) => scope === 'admin'
    ? new Promise(resolve => { release = resolve })
    : Promise.resolve({ pageNum: page, total: 1, records: records.doctor }), { scopeKey: () => scope })
  const old = delayed()
  scope = 'doctor'
  assert.equal((await delayed()).length, 1)
  release({ pageNum: 1, total: 2, records: records.admin })
  await assert.rejects(old, { name: 'AbortError' })
  assert.equal((await delayed()).length, 1)
})

test('personal dashboards, editor drafts and periods are isolated without deleting unowned data', () => {
  const raw = memoryStorage()
  const keys = ['idmp:indicator-editor-form:42', 'idmp:analysis-period:indicator:42', 'idmp:dashboard-layout-templates:v1']
  raw.setItem(keys[0], 'legacy-unowned')
  setStorageUser({ id: '1' })
  const a = userStorage('local', raw)
  assert.equal(a.getItem(keys[0]), null)
  keys.forEach(key => a.setItem(key, 'account-a'))
  createLocalDashboard({ name: '个人草稿', scope: 'personal' }, { storage: a, id: 'private' })
  setStorageUser({ id: '2' })
  const b = userStorage('local', raw)
  keys.forEach(key => assert.equal(b.getItem(key), null))
  assert.deepEqual(readDashboardCatalog(b), [])
  assert.throws(() => a.setItem(keys[0], 'late-a'), { name: 'AbortError' })
  b.setItem(keys[0], 'account-b')
  setStorageUser(null)
  setStorageUser({ id: '1' })
  assert.throws(() => a.setItem(keys[0], 'old-session'), { name: 'AbortError' })
  const restored = userStorage('local', raw)
  keys.forEach(key => assert.equal(restored.getItem(key), 'account-a'))
  assert.equal(readDashboardCatalog(restored)[0].name, '个人草稿')
  assert.equal(raw.getItem(keys[0]), 'legacy-unowned')
  setStorageUser(null)
})

test('dashboard department label changes without changing the field binding', () => {
  const definition = { label: '出院科室', field: 'OUT_DEPT_CODE' }
  assert.equal(dashboardFilterLabel(definition), '科室')
  assert.equal(dashboardFilterLabel({ label: '科室名称', field: 'OUT_DEPT_NAME' }), '科室')
  assert.equal(dashboardFilterLabel({ label: '入院科室', field: 'IN_DEPT_CODE' }), '入院科室')
  assert.equal(definition.field, 'OUT_DEPT_CODE')
})
