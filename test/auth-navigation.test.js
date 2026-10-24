import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuthenticationGuard, safeLoginRedirect } from '../src/idmp/auth/navigation.js'

const route = fullPath => ({ path: fullPath.split('?')[0].split('#')[0], fullPath, query: {} })
test('anonymous navigation is blocked before business components mount and preserves the target', async () => {
  const guard = createAuthenticationGuard({ ensureSession: async () => false, isMedicalDashboard: () => false })
  assert.deepEqual(await guard(route('/analysis?indicator=123#trend')), {
    path: '/login', query: { redirect: '/analysis?indicator=123#trend' }, replace: true
  })
  assert.equal(await guard(route('/login')), true)
})

test('valid sessions bypass login and continue to the requested business page', async () => {
  const guard = createAuthenticationGuard({ ensureSession: async () => true, isMedicalDashboard: () => false })
  assert.equal(await guard(route('/indicator')), true)
  assert.equal(await guard({ ...route('/login'), query: { redirect: '/factor?name=abc' } }), '/factor?name=abc')
  assert.equal(await guard(route('/login')), '/dashboard')
})

test('restricted dashboard credentials never enter ordinary business routes', async () => {
  const guard = createAuthenticationGuard({ ensureSession: async () => true, isMedicalDashboard: () => true })
  assert.equal(await guard(route('/auto-login')), true)
  assert.equal(await guard(route('/medical-dashboard')), true)
  assert.equal(await guard(route('/login')), true)
  assert.deepEqual(await guard(route('/factor')), { path: '/dashboard', query: { medical: '1' } })
  assert.equal(await guard({ ...route('/dashboard'), query: { id: '2', medical: '1' } }), true)
  assert.deepEqual(await guard({ ...route('/dashboard'), query: { id: '2', medical: '1', edit: '1' } }), { path: '/dashboard', query: { id: '2', medical: '1' } })
  assert.deepEqual(await guard({ ...route('/dashboard'), query: { dashboardID: '2' } }), { path: '/medical-dashboard', query: { dashboardID: '2' } })
})

test('platform SSO sessions enter normal platform pages instead of the medical catalog', async () => {
  let checks = 0
  const guard = createAuthenticationGuard({ ensureSession: async () => { checks++; return true }, isMedicalDashboard: () => false })
  assert.equal(await guard(route('/dashboard')), true)
  assert.equal(await guard(route('/indicator')), true)
  assert.equal(checks, 2)
  assert.deepEqual(await guard({ ...route('/dashboard'), query: { dashboardID: '2' } }), { path: '/medical-dashboard', query: { dashboardID: '2' } })
})

test('platform SSO can open a signed scoped viewer without gaining platform or editing permissions', async () => {
  let medical = true
  const guard = createAuthenticationGuard({ ensureSession: async () => true, isMedicalDashboard: () => false,
    isMedicalSession: () => medical, canNavigate: () => false, accessibleHome: () => '/forbidden' })
  const viewer = { ...route('/dashboard'), query: { id: '2', medical: '1' } }
  assert.equal(await guard(viewer), true)
  for (const target of [route('/dashboard'), route('/factor'), { ...viewer, query: { ...viewer.query, edit: '1' } }])
    assert.deepEqual(await guard(target), { path: '/forbidden', replace: true })
  medical = false
  assert.deepEqual(await guard(viewer), { path: '/forbidden', replace: true })
})

test('password redirect rejects external, credential-bearing and recursive login destinations', () => {
  for (const target of ['https://evil.test', '//evil.test', '/\\evil', '/login', '/login?redirect=/factor', '/auto-login?token=secret',
    '/medical-dashboard', '/dashboard?sign=secret', '/dashboard?token=secret', '/dashboard?dashboardID=2', '/factor\n', ['/factor']]) {
    assert.equal(safeLoginRedirect(target), '/dashboard', String(target))
  }
  assert.equal(safeLoginRedirect('/analysis?indicator=102027642463192671#trend'), '/analysis?indicator=102027642463192671#trend')
  assert.equal(safeLoginRedirect('/unknown', () => ({ matched: [{ redirect: '/dashboard' }] })), '/dashboard')
})
