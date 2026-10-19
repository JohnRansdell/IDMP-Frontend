import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { readDashboardCatalog, DASHBOARD_CATALOG_STORAGE_KEY } from '../src/idmp/features/dashboard/catalog.js'
import { getDashboardSchemaStorageKey } from '../src/idmp/features/dashboard/schema.js'

const retired = ['demo-quality-overview', 'demo-operation-overview']
function storage(entries) {
  const values = new Map(entries)
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('retired dashboard seeds are removed without deleting user dashboards or unrelated storage', () => {
  const custom = { id: 'dashboard-custom', name: '我的看板' }
  const saved = storage([
    [DASHBOARD_CATALOG_STORAGE_KEY, JSON.stringify([...retired.map(id => ({ id, name: id })), custom])],
    ...retired.map(id => [getDashboardSchemaStorageKey(id), '{}']),
    [getDashboardSchemaStorageKey(custom.id), '{"user":"layout"}'],
    ['idmp:dashboard-demo-data-version', '3'],
    ['session', 'keep']
  ])
  assert.deepEqual(readDashboardCatalog(saved).map(item => item.id), [custom.id])
  for (const id of retired) assert.equal(saved.getItem(getDashboardSchemaStorageKey(id)), null)
  assert.equal(saved.getItem('idmp:dashboard-demo-data-version'), null)
  assert.equal(saved.getItem(getDashboardSchemaStorageKey(custom.id)), '{"user":"layout"}')
  assert.equal(saved.getItem('session'), 'keep')
  assert.deepEqual(JSON.parse(saved.getItem(DASHBOARD_CATALOG_STORAGE_KEY)), [custom])
  assert.equal(readDashboardCatalog(saved).length, 1, 'cleanup is repeatable')
})

test('retired schema storage is cleaned even when the catalog is malformed', () => {
  const saved = storage([[DASHBOARD_CATALOG_STORAGE_KEY, '{'], ...retired.map(id => [getDashboardSchemaStorageKey(id), '{}'])])
  assert.deepEqual(readDashboardCatalog(saved), [])
  for (const id of retired) assert.equal(saved.getItem(getDashboardSchemaStorageKey(id)), null)
})

test('read-only browser storage still hides retired catalog entries', () => {
  const saved = {
    getItem: () => JSON.stringify(retired.map(id => ({ id, name: id }))),
    setItem: () => { throw new Error('denied') },
    removeItem: () => { throw new Error('denied') }
  }
  assert.deepEqual(readDashboardCatalog(saved), [])
})

test('production pages no longer reference removed datasets, switches or demo-only detail props', async () => {
  const pages = ['Dashboard', 'DashboardManagement', 'IndicatorAnalysis', 'IndicatorManagement', 'IndicatorDetail', 'FactorManagement', 'FactorDetail', 'ScenarioList', 'ScenarioEditor', 'AlertCenter']
  const files = [...pages.map(name => 'views/' + name + '.vue'), 'layout/IdmpLayout.vue', 'components/FactorRuntimeQuery.vue', 'components/FactorDependencyPanel.vue']
  for (const file of files) {
    const source = await readFile(new URL('../src/idmp/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /demoCatalog|demoAlerts|demoFactorDetail|dashboardDemoSources|dashboardDemoResult|DEMO_ENABLED|ensureDashboardDemoData|demoData|isDemoIndicator|isDemoScenario/, file)
  }
  for (const file of ['analysis/demoCatalog.js', 'analysis/demoAlerts.js', 'analysis/demoFactorDetail.js', 'dashboard/demoData.js']) {
    await assert.rejects(access(new URL('../src/idmp/features/' + file, import.meta.url)), { code: 'ENOENT' })
  }
  const environment = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
  assert.doesNotMatch(environment, /VITE_ENABLE_(?:DASHBOARD|ANALYSIS)_DEMO_DATA/)
})
