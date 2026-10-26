import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccess, canVisit, firstAccessiblePath, matchesPath } from '../src/idmp/auth/permissions.js'
import { createAuthenticationGuard } from '../src/idmp/auth/navigation.js'
import { readFileSync } from 'node:fs'
import { ACTION_GRANTS, PAGE_ACCESS, resolveAccessGrant } from '../src/idmp/auth/accessPolicy.js'
import { createAccessDirective } from '../src/idmp/auth/accessDirective.js'
import { reactive } from 'vue'

const session = (rules = [], roles = ['CUSTOM'], deniedPaths = []) => ({ roles, apiRules: rules.map(([action, resourcePattern]) => ({ action, resourcePattern: '/api/v1' + resourcePattern })), deniedPaths })
test('the platform brand link uses the authorized home while the medical viewer stays isolated', () => {
  const layout = readFileSync(new URL('../src/idmp/layout/IdmpLayout.vue', import.meta.url), 'utf8')
  assert.match(layout, /:to="medicalViewer \? '\/dashboard\?medical=1' : accessibleHome\(\)"/)
  assert.equal(firstAccessiblePath(session([['GET', '/indicators']], ['SCHEDULER'])), '/indicator')
  assert.equal(firstAccessiblePath(session([['GET', '/analysis/dashboards']], ['DEPARTMENT_ANALYST'])), '/dashboard')
  assert.equal(firstAccessiblePath(session()), '/forbidden')
})
test('Ant paths distinguish a child wildcard from recursive paths, including an empty suffix', () => {
  assert.equal(matchesPath('/api/v1/meta/policy-files/**', '/api/v1/meta/policy-files'), true)
  assert.equal(matchesPath('/api/v1/indicators/*', '/api/v1/indicators/12'), true)
  assert.equal(matchesPath('/api/v1/indicators/*', '/api/v1/indicators/12/delete'), false)
  assert.equal(matchesPath('/api/v1/a.1', '/api/v1/ax1'), false)
})
test('permissions are method-specific and are not inferred from a role name or obsolete permission code', () => {
  const reader = session([['GET', '/indicators'], ['GET', '/factors'], ['GET', '/analysis/indicators/*/analysis']])
  assert.equal(canVisit(reader, '/indicator'), true)
  assert.equal(canVisit(reader, '/factor/view/12'), true)
  assert.equal(canVisit(reader, '/indicator/edit/new'), false)
  assert.equal(canVisit(reader, '/system'), false)
  assert.equal(canAccess(reader, 'POST', '/indicators'), false)
  assert.equal(canVisit({ roles: ['QUALITY_ADMIN'], permissions: ['META_INDICATOR_EDIT'] }, '/indicator/edit/new'), false)
})
test('all seven built-in role fixtures show only granted pages and actions', () => {
  const fixtures = [
    ['SYSTEM_ADMIN', [], '/system', true],
    ['DATA_ADMIN', [['GET', '/meta/source-tables'], ['GET', '/indicators']], '/data/sources', true],
    ['INDICATOR_ADMIN', [['GET', '/indicators'], ['POST', '/indicators']], '/indicator/edit/new', true],
    ['QUALITY_ADMIN', [['GET', '/analysis/warnings']], '/alerts', true],
    ['SCHEDULER', [['GET', '/indicators']], '/calc', false],
    ['DEPARTMENT_ANALYST', [['GET', '/analysis/dashboards']], '/dashboard/manage', false],
    ['AUDITOR', [['GET', '/analysis/warnings']], '/indicator/edit/new', false]
  ]
  for (const [role, rules, path, expected] of fixtures) assert.equal(canVisit(session(rules, [role]), path), expected, role)
})
test('scope restrictions override broad API grants and dashboard edit cannot bypass route authorization', () => {
  const scoped = session([['*', '/**']], ['CUSTOM'], ['/api/v1/calc/**'])
  assert.equal(canVisit(scoped, '/calc'), false)
  const reader = session([['GET', '/analysis/dashboards']])
  assert.equal(canVisit(reader, { path: '/dashboard', query: { edit: '1' } }), false)
  assert.equal(canVisit(reader, '/dashboard'), true)
})
test('login chooses an accessible home and zero-grant sessions cannot cause redirect loops', async () => {
  const user = session([['GET', '/meta/source-tables']])
  const guard = createAuthenticationGuard({ ensureSession: async () => true, isMedicalDashboard: () => false,
    canNavigate: target => canVisit(user, target), accessibleHome: () => firstAccessiblePath(user) })
  assert.equal(await guard({ path: '/login', query: {} }), '/data/sources')
  assert.deepEqual(await guard({ path: '/system', query: {} }), { path: '/data/sources', replace: true })
  assert.equal(firstAccessiblePath(session()), '/forbidden')
  assert.equal(canVisit(session(), '/forbidden'), true)
})

test('each declared landing page works as the only authorized homepage', async () => {
  // System administration intentionally remains administrator-only, regardless of custom grants.
  for (const rule of PAGE_ACCESS.filter(rule => rule.homePath && rule.homePath !== '/system')) {
    const user = session([ACTION_GRANTS[rule.action]])
    assert.equal(canVisit(user, rule.homePath), true, rule.homePath)
    assert.equal(firstAccessiblePath(user), rule.homePath, rule.homePath)
    const guard = createAuthenticationGuard({ ensureSession: async () => true, isMedicalDashboard: () => false,
      canNavigate: target => canVisit(user, target), accessibleHome: () => firstAccessiblePath(user) })
    assert.equal(await guard({ path: '/login', query: {} }), rule.homePath)
    assert.deepEqual(await guard({ path: '/unavailable', query: {} }), { path: rule.homePath, replace: true })
  }
})

test('homepage selection preserves priority and excludes denied or write-only pages', () => {
  assert.equal(firstAccessiblePath(session([['GET', '/indicators'], ['GET', '/scenarios']])), '/indicator')
  assert.equal(firstAccessiblePath(session([['GET', '/scenarios']], ['CUSTOM'], ['/api/v1/scenarios'])), '/forbidden')
  assert.equal(firstAccessiblePath(session([['POST', '/factors'], ['PUT', '/indicators/*']])), '/forbidden')
})

test('create and edit routes enforce distinct methods and the selected resource', () => {
  for (const [resource, method] of [['factor', 'PATCH'], ['indicator', 'PUT']]) {
    const collection = `/${resource}s`
    const creator = session([['POST', collection]])
    const editor = session([[method, `${collection}/42`]])
    const reader = session([['GET', `${collection}/**`]])
    for (const path of [`/${resource}/edit`, `/${resource}/edit/`, `/${resource}/edit/new`]) {
      assert.equal(canVisit(creator, path), true, path)
      assert.equal(canVisit(editor, path), false, path)
    }
    assert.equal(canVisit(editor, `/${resource}/edit/42`), true)
    assert.equal(canVisit(editor, `/${resource}/edit/43`), false)
    assert.equal(canVisit(creator, `/${resource}/edit/42`), false)
    assert.equal(canVisit(reader, `/${resource}/edit/42`), false)
    const denied = session([[method, `${collection}/*`]], ['CUSTOM'], [`/api/v1${collection}/42`])
    assert.equal(canVisit(denied, `/${resource}/edit/42`), false)
    assert.equal(canVisit(denied, `/${resource}/edit/43`), true)
    assert.equal(canAccess(editor, ...resolveAccessGrant({ action: `${resource}.edit`, resourceId: '42' })), true)
  }
  assert.equal(resolveAccessGrant({ action: 'factor.edit' }), null)
  assert.equal(resolveAccessGrant({ action: 'unknown', resourceId: '42' }), null)
})

test('resource-bound buttons follow both row changes and live grant changes, then dispose', () => {
  const user = reactive(session([['PATCH', '/factors/42']]))
  const directive = createAccessDirective((...grant) => canAccess(user, ...grant))
  const styles = new Map()
  const el = { hidden: false, style: { setProperty: (key, value) => styles.set(key, value), removeProperty: key => styles.delete(key) } }
  directive.beforeMount(el, { value: { action: 'factor.edit', resourceId: '42' } })
  assert.equal(el.hidden, false)
  directive.updated(el, { value: { action: 'factor.edit', resourceId: '43' } })
  assert.equal(el.hidden, true)
  assert.equal(styles.get('display'), 'none')
  user.apiRules = [{ action: 'PATCH', resourcePattern: '/api/v1/factors/43' }]
  assert.equal(el.hidden, false)
  assert.equal(styles.has('display'), false)
  directive.updated(el, { value: 'unknown.action' })
  assert.equal(el.hidden, true)
  directive.beforeUnmount(el)
  user.roles = ['SYSTEM_ADMIN']
  assert.equal(el.hidden, true)
})
