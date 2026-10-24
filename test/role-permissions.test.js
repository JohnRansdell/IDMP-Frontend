import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccess, canVisit, firstAccessiblePath, matchesPath } from '../src/idmp/auth/permissions.js'
import { createAuthenticationGuard } from '../src/idmp/auth/navigation.js'

const session = (rules = [], roles = ['CUSTOM'], deniedPaths = []) => ({ roles, apiRules: rules.map(([action, resourcePattern]) => ({ action, resourcePattern: '/api/v1' + resourcePattern })), deniedPaths })
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
