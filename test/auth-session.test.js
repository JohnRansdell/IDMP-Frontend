import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as vue from 'vue'

const source = (await readFile(new URL('../src/idmp/auth/session.js', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from ['"][^'"]+['"]/g, '').replace(/export /g, '')
function createSession(respond, { token = '', cookie = '', medical = false } = {}) {
  const calls = [], events = []
  const deps = {
    computed: vue.computed, reactive: vue.reactive, readonly: vue.readonly,
    requestJson: async (path, options) => { calls.push(path); return respond(path, options) },
    getAccessToken: () => token, setAccessToken: value => { token = value; medical = false }, clearAccessToken: () => { token = '' },
    isMedicalSession: () => medical, setMedicalAccessToken: value => { medical = true; token = value },
    setSessionRecoveryHandler: () => {}, document: { cookie }, window: { dispatchEvent: event => events.push(event.type) }
  }
  const session = Function(...Object.keys(deps), `${source}; return { sessionState, isAuthenticated, loginWithPassword, logoutSession, refreshSession, restoreSession, ensureAuthenticatedSession, invalidateSession }`)(...Object.values(deps))
  return { ...session, calls, events, token: () => token }
}
const login = { accessToken: 'valid', user: { username: 'tester', roles: ['SYSTEM_ADMIN'] }, csrfToken: 'csrf', expiresInSeconds: 1800 }
const me = { user: login.user, roles: login.user.roles, permissions: ['*'] }

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
