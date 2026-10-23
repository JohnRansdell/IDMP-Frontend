import test from 'node:test'
import assert from 'node:assert/strict'
import { scalarParameter, signedDashboardParameters, safeMedicalRedirect, dashboardIntegrationUrl } from '../src/idmp/auth/medicalSso.js'
import { getAccessToken, setAccessToken, setMedicalAccessToken, clearAccessToken, isMedicalSession, requestJson } from '../src/idmp/api/request.js'

test('medical link accepts exactly the three identity parameters and signature', () => {
  const values = { dashboardID: '0002', doctorNo: '1001', deptCode: '4101', sign: 'a'.repeat(64) }
  assert.deepEqual(signedDashboardParameters(values), values)
  assert.equal(signedDashboardParameters({}), null)
  for (const bad of [{ ...values, doctorNo: ['1001', '2002'] }, { ...values, deptCode: '' }, { ...values, sign: 'md5' }, { dashboardID: '0002' }])
    assert.throws(() => signedDashboardParameters(bad))
  assert.throws(() => scalarParameter({ token: ['one', 'two'] }, 'token'))
})

test('SSO redirect is limited to local dashboard routes', () => {
  assert.equal(safeMedicalRedirect(''), '/medical-dashboard')
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
  globalThis.fetch = async (_, options) => ({ ok: true, text: async () => JSON.stringify({ code: 'OK', data: { token: options.headers.Authorization, number: ++requests } }) })
  try {
    setAccessToken('admin')
    await requestJson('/test-sso-cache')
    setMedicalAccessToken('doctor')
    assert.equal(isMedicalSession(), true)
    assert.equal(getAccessToken(), 'doctor')
    assert.equal(globalThis.localStorage.getItem('idmp_access_token'), 'admin')
    assert.equal((await requestJson('/test-sso-cache')).token, 'Bearer doctor')
    clearAccessToken()
    assert.equal(getAccessToken(), '')
    assert.equal(isMedicalSession(), true)
    assert.equal(globalThis.localStorage.getItem('idmp_access_token'), 'admin')
    setAccessToken('admin')
    assert.equal(isMedicalSession(), false)
    assert.equal(getAccessToken(), 'admin')
  } finally { Object.assign(globalThis, original) }
})
