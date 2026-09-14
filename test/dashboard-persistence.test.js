import test from 'node:test'
import assert from 'node:assert/strict'
import { DASHBOARD_RECOVERY_STATUS, persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'
import { normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { handleDashboardBeforeUnload, shouldProtectDashboardNavigation } from '../src/idmp/features/dashboard/navigationProtection.js'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, value), dump: () => Object.fromEntries(values) }
}

test('corrupted storage is diagnosable and is never overwritten during recovery', () => {
  const storage = memoryStorage({ dashboard: '{broken-json' })
  const before = storage.dump().dashboard
  const recovered = recoverDashboardSchema(storage, 'dashboard')
  assert.equal(recovered.status, DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA)
  assert.equal(recovered.raw, before)
  assert.equal(storage.dump().dashboard, before)
})

test('wrong-version storage is rejected before normalization', () => {
  const raw = JSON.stringify({ version: 2, id: 'demo', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [] })
  const recovered = recoverDashboardSchema(memoryStorage({ dashboard: raw }), 'dashboard')
  assert.equal(recovered.status, DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA)
  assert.match(recovered.error.message, /version must be 1/)
})

test('persistence writes plain contract data and verifies the browser-local read back', () => {
  const storage = memoryStorage()
  const schema = normalizeDashboardSchema({ version: 1, id: 'demo', widgets: [{ id: 'a', type: 'kpi', title: '指标', config: { style: { padding: 4 } } }] })
  const persisted = persistDashboardSchema(storage, 'dashboard', schema)
  assert.equal(persisted.widgets[0].title, '指标')
  assert.equal(recoverDashboardSchema(storage, 'dashboard').status, DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA)
})

test('dirty navigation protection only blocks business changes', () => {
  assert.equal(shouldProtectDashboardNavigation(false), false)
  assert.equal(shouldProtectDashboardNavigation(true), true)
  const cleanEvent = { preventDefault() { throw new Error('must not prevent clean unload') } }
  assert.equal(handleDashboardBeforeUnload(cleanEvent, false), false)
  let prevented = false
  const dirtyEvent = { returnValue: undefined, preventDefault() { prevented = true } }
  assert.equal(handleDashboardBeforeUnload(dirtyEvent, true), true)
  assert.equal(prevented, true)
  assert.equal(dirtyEvent.returnValue, '')
})
