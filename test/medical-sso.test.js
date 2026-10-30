import test from 'node:test'
import assert from 'node:assert/strict'
import { scalarParameter, signedDashboardParameters, safeMedicalRedirect, dashboardIntegrationUrl, resolveSsoEntry } from '../src/idmp/auth/medicalSso.js'
import { getAccessToken, setAccessToken, setMedicalAccessToken, clearAccessToken, isMedicalSession, isMedicalDashboardSession, requestJson } from '../src/idmp/api/request.js'

test('平台免登只提交工号姓名及签名信息，不要求外部用户标识和科室', () => {
  const query = { doctorNo: '300112', displayName: '杜琴', timestamp: '1793318400', nonce: '0123456789abcdef', sign: 'a'.repeat(64) }
  assert.deepEqual(resolveSsoEntry(query), { entry: 'PLATFORM', payload: { ...query, timestamp: 1793318400 }, target: '/dashboard' })
  for (const bad of [{ ...query, timestamp: ['1', '2'] }, { ...query, timestamp: 'NaN' }, { ...query, sign: '' },
    { ...query, nonce: 'short' }, { ...query, token: 'legacy' }, { ...query, doctorNo: 'a\nb' },
    { ...query, displayName: '' }, { ...query, redirect: 'https://evil.example' }, { token: 'legacy' }])
    assert.throws(() => resolveSsoEntry(bad))
})

test('看板免登入口保持原有凭证，不与平台签名混用', () => {
  const signed = { dashboardID: '0002', doctorNo: '1001', deptCode: '4101', sign: 'a'.repeat(64) }
  assert.deepEqual(resolveSsoEntry({ token: 'external', ...signed }), {
    entry: 'DASHBOARD', payload: { token: 'external' }, target: { path: '/medical-dashboard', query: signed }
  })
  assert.equal(resolveSsoEntry({ token: 'external', redirect: '/medical-dashboard?id=2' }).entry, 'DASHBOARD')
  assert.throws(() => resolveSsoEntry({ token: 'external', ...signed, nonce: '0123456789abcdef' }))
})

test('medical link accepts exactly the three identity parameters and signature', () => {
  const values = { dashboardID: '0002', doctorNo: '1001', deptCode: '4101', sign: 'a'.repeat(64) }
  assert.deepEqual(signedDashboardParameters(values), values)
  assert.equal(signedDashboardParameters({}), null)
  for (const bad of [{ ...values, doctorNo: ['1001', '2002'] }, { ...values, deptCode: '' }, { ...values, sign: 'md5' }, { dashboardID: '0002' }])
    assert.throws(() => signedDashboardParameters(bad))
  assert.throws(() => scalarParameter({ token: ['one', 'two'] }, 'token'))
})

test('SSO redirect is limited to local dashboard routes', () => {
  assert.equal(safeMedicalRedirect(''), '/dashboard')
  assert.equal(safeMedicalRedirect('/dashboard?dashboardID=0002'), '/dashboard?dashboardID=0002')
  for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '/factor', '/dashboard?token=secret', '/dashboard?id=1&id=2', '/dashboard\n'])
    assert.throws(() => safeMedicalRedirect(bad), bad)
})

test('integration URL preserves application subdirectory and string dashboard IDs', () => {
  assert.equal(dashboardIntegrationUrl('https://hospital.example', '/idmp/', '0002'), 'https://hospital.example/idmp/dashboard?dashboardID=0002')
})

test('medical login is tab-local, isolated from administrator token and query caches', async () => {
  const original = { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, fetch: globalThis.fetch }
  const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage()
  let requests = 0
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/login')) assert.equal(options.credentials, 'include')
    else if (isMedicalSession()) assert.equal(options.credentials, 'omit')
    return { ok: true, text: async () => JSON.stringify({ code: 'OK', data: { token: options.headers.Authorization, number: ++requests } }) }
  }
  try {
    setAccessToken('admin')
    await requestJson('/test-sso-cache')
    setMedicalAccessToken('doctor')
    assert.equal(isMedicalSession(), true)
    assert.equal(isMedicalDashboardSession(), true)
    assert.equal(getAccessToken(), 'doctor')
    assert.equal(globalThis.localStorage.getItem('idmp_access_token'), 'admin')
    assert.equal((await requestJson('/test-sso-cache')).token, 'Bearer doctor')
    setMedicalAccessToken('platform-doctor', 'PLATFORM')
    assert.equal(isMedicalSession(), true)
    assert.equal(isMedicalDashboardSession(), false)
    assert.equal(getAccessToken(), 'platform-doctor')
    assert.equal((await requestJson('/test-platform-sso')).token, 'Bearer platform-doctor')
    await requestJson('/auth/login', { method: 'POST', body: '{}' })
    clearAccessToken()
    assert.equal(getAccessToken(), '')
    assert.equal(isMedicalSession(), true)
    assert.equal(globalThis.localStorage.getItem('idmp_access_token'), 'admin')
    setAccessToken('admin')
    assert.equal(isMedicalSession(), false)
    assert.equal(getAccessToken(), 'admin')
  } finally { Object.assign(globalThis, original) }
})
