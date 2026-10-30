import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as vue from 'vue'

const source = (await readFile(new URL('../src/idmp/auth/session.js', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from ['"][^'"]+['"]/g, '').replace(/export /g, '')
  .replace("await import('@/idmp/api/modules/medical')", 'await Promise.resolve({ exchangeSsoCredentials: exchangeSso })')
function createSession(respond, { token = '', cookie = '', medical = false } = {}) {
  const calls = [], events = []
  let entry = ''
  const deps = {
    computed: vue.computed, reactive: vue.reactive, readonly: vue.readonly,
    requestJson: async (path, options) => { calls.push(path); return respond(path, options) },
    getAccessToken: () => token, setAccessToken: value => { token = value; medical = false }, clearAccessToken: () => { token = '' },
    isMedicalSession: () => medical, setMedicalAccessToken: (value, mode) => { medical = true; token = value; entry = mode },
    isMedicalDashboardSession: () => medical && entry === 'DASHBOARD',
    exchangeSso: (value, mode) => { calls.push('/auth/sso/exchange'); return respond('/auth/sso/exchange', { body: JSON.stringify({ ...value, entry: mode }) }) },
    setSessionRecoveryHandler: () => {}, document: { cookie }, window: { dispatchEvent: event => events.push(event.type) },
    setStorageUser: () => {}, invalidateRequestSession: () => {}
  }
  const session = Function(...Object.keys(deps), `${source}; return { sessionState, isAuthenticated, loginWithPassword, loginWithSsoCredentials, logoutSession, refreshSession, restoreSession, ensureAuthenticatedSession, invalidateSession }`)(...Object.values(deps))
  return { ...session, calls, events, token: () => token, entry: () => entry }
}
const login = { accessToken: 'valid', user: { username: 'tester', roles: ['SYSTEM_ADMIN'] }, csrfToken: 'csrf', expiresInSeconds: 1800 }
const me = { user: login.user, roles: login.user.roles, permissions: ['*'] }
const signedLogin = { doctorNo: '300112', displayName: '杜琴', timestamp: 1793318400, nonce: '0123456789abcdef', sign: 'a'.repeat(64) }

test('platform SSO hydrates assigned permissions and menus without password login or refresh', async () => {
  const user = { username: 'sso-user', roles: ['ANALYST'] }
  const session = createSession((path, options) => {
    if (path === '/auth/logout') { assert.equal(options.credentials, 'omit'); return null }
    if (path === '/auth/sso/exchange') {
      assert.deepEqual(JSON.parse(options.body), { ...signedLogin, entry: 'PLATFORM' })
      return { session: { accessToken: 'external-platform', user, permissions: ['indicator:view'], expiresInSeconds: 590 } }
    }
    assert.equal(path, '/auth/me')
    return { user, roles: ['ANALYST'], permissions: ['indicator:view'], menus: [{ path: '/indicator' }], dataScopes: [{ scopeType: 'DEPT' }] }
  })
  await session.loginWithSsoCredentials(signedLogin)
  assert.equal(session.entry(), 'PLATFORM')
  assert.equal(session.isAuthenticated.value, true)
  assert.deepEqual(session.sessionState.roles, ['ANALYST'])
  assert.deepEqual(session.sessionState.menus, [{ path: '/indicator' }])
  assert.deepEqual(session.calls, ['/auth/sso/exchange', '/auth/me'])
  await session.logoutSession()
  assert.equal(session.calls.at(-1), '/auth/logout')
})

test('signed entry keeps dashboard-only mode and does not hydrate ordinary platform permissions', async () => {
  const session = createSession((path, options) => {
    assert.equal(path, '/auth/sso/exchange')
    assert.equal(JSON.parse(options.body).entry, 'DASHBOARD')
    return { session: { accessToken: 'viewer', user: { roles: ['MEDICAL_VIEWER'] }, permissions: ['medical:dashboard:view'] } }
  })
  await session.loginWithSsoCredentials({ token: 'external' }, 'DASHBOARD')
  assert.equal(session.entry(), 'DASHBOARD')
  assert.deepEqual(session.calls, ['/auth/sso/exchange'])
})

test('failed platform identity hydration clears the external credential', async () => {
  const session = createSession(path => {
    if (path === '/auth/sso/exchange') return { session: { accessToken: 'bad-session' } }
    throw Error('identity unavailable')
  })
  await assert.rejects(session.loginWithSsoCredentials(signedLogin), /identity unavailable/)
  assert.equal(session.token(), '')
  assert.equal(session.sessionState.status, 'anonymous')
})

test('cold anonymous navigation does not send business or pointless refresh requests', async () => {
  const session = createSession(() => { throw Error('must not request') })
  assert.equal(await session.ensureAuthenticatedSession(), false)
  assert.equal(await session.ensureAuthenticatedSession(), false)
  assert.deepEqual(session.calls, [])
})
test('a stored token must pass current-user validation before granting access', async () => {
  const session = createSession(path => { assert.equal(path, '/auth/me'); return me }, { token: 'valid' })
  assert.equal(await session.ensureAuthenticatedSession(), true)
  assert.equal(session.isAuthenticated.value, true)
  assert.deepEqual(session.sessionState.roles, ['SYSTEM_ADMIN'])
  await session.ensureAuthenticatedSession()
  assert.equal(session.calls.length, 1)
})
test('a fake token cannot bypass the route guard', async () => {
  const session = createSession(() => { throw Error('unauthorized') }, { token: 'fake' })
  assert.equal(await session.ensureAuthenticatedSession(), false)
  assert.equal(session.token(), '')
  assert.equal(session.sessionState.user, null)
})
test('reload restores a refresh-cookie session and concurrent restorations are deduplicated', async () => {
  const session = createSession(async path => path === '/auth/refresh' ? login : me, { cookie: 'IDMP_REFRESH_CSRF=csrf' })
  assert.deepEqual(await Promise.all([session.restoreSession(), session.restoreSession()]), [true, true])
  assert.deepEqual(session.calls, ['/auth/refresh', '/auth/me'])
})
test('a failed current-user request cannot leave a partially logged-in session', async () => {
  const session = createSession(path => { if (path === '/auth/login') return login; throw Error('user unavailable') })
  await assert.rejects(session.loginWithPassword({}), /user unavailable/)
  assert.equal(session.token(), '')
  assert.equal(session.isAuthenticated.value, false)
})
test('medical expiry never attempts normal refresh or uses administrator identity', async () => {
  const session = createSession(() => { throw Error('must not request') }, { token: 'medical', medical: true })
  assert.equal(await session.refreshSession(), false)
  assert.deepEqual(session.calls, [])
})
test('logout always clears identity and notifies navigation, even if the server is unavailable', async () => {
  const session = createSession(() => { throw Error('network') }, { token: 'valid' })
  await assert.rejects(session.logoutSession())
  assert.equal(session.token(), '')
  assert.equal(session.sessionState.user, null)
  assert.deepEqual(session.events, ['idmp:logout'])
})
test('a pending refresh cannot log the user back in after logout', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const session = createSession(path => path === '/auth/refresh' ? pending : null, { cookie: 'IDMP_REFRESH_CSRF=csrf' })
  const refresh = session.refreshSession()
  await Promise.resolve()
  await session.logoutSession()
  release(login)
  assert.equal(await refresh, false)
  assert.equal(session.token(), '')
  assert.equal(session.sessionState.status, 'anonymous')
})

test('anonymous startup does not permanently disable later refresh after login', async () => {
  const session = createSession(path => path === '/auth/me' ? me : login)
  assert.equal(await session.ensureAuthenticatedSession(), false)
  await session.loginWithPassword({})
  assert.equal(await session.refreshSession(), true)
  assert.ok(session.calls.includes('/auth/refresh'))
})

test('a delayed logout cannot clear a newer login or redirect its page', async () => {
  let release
  const session = createSession(path => {
    if (path === '/auth/logout') return new Promise(resolve => { release = resolve })
    return path === '/auth/me' ? me : login
  }, { token: 'previous' })
  const logout = session.logoutSession()
  await session.loginWithPassword({})
  release(null)
  await logout
  assert.equal(session.token(), 'valid')
  assert.equal(session.isAuthenticated.value, true)
  assert.deepEqual(session.events, [])
})

test('a failed refresh expires a visible session and notifies navigation', async () => {
  const session = createSession(path => {
    if (path === '/auth/refresh') throw Error('expired')
    return path === '/auth/me' ? me : login
  })
  await session.loginWithPassword({})
  assert.equal(await session.refreshSession(), false)
  assert.deepEqual(session.events, ['idmp:unauthorized'])
  assert.equal(session.token(), '')
})
