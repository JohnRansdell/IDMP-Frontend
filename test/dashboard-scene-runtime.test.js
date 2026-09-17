import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findLocalScene, shouldConfirmDashboardSceneSwitch } from '../src/idmp/features/dashboard/sceneRegistry.js'
import { dashboardDemoPolicy, shouldUseDashboardDemoFallback } from '../src/idmp/features/dashboard/demoPolicy.js'

test('viewer scene changes never receive a dirty-dialog guard', () => {
  assert.equal(shouldConfirmDashboardSceneSwitch({ isEditing: false, dirty: false }), false)
  assert.equal(shouldConfirmDashboardSceneSwitch({ isEditing: false, dirty: true }), false)
  assert.equal(shouldConfirmDashboardSceneSwitch({ isEditing: true, dirty: false }), false)
  assert.equal(shouldConfirmDashboardSceneSwitch({ isEditing: true, dirty: true }), true)
})

test('the shell and dashboard share registry scene codes rather than data-filter values', () => {
  assert.equal(findLocalScene('performance').dashboardId, 'quality-overview-performance')
  assert.equal(findLocalScene('quality-safety').name, '质量安全')
})

test('deployment preview skips aggregate Dashboard requests but keeps published indicator data available', () => {
  assert.deepEqual(dashboardDemoPolicy({ previewMode: '1' }), {
    skipDashboardBootstrap: true, loadPublishedIndicators: true, useDemoOnFailure: true, persistDefaultSchema: false
  })
  assert.equal(dashboardDemoPolicy({ previewMode: 'true' }).skipDashboardBootstrap, false)
})

test('turning preview off restores production requests and no demo fallback', () => {
  assert.deepEqual(dashboardDemoPolicy({ previewMode: '0' }), {
    skipDashboardBootstrap: false, loadPublishedIndicators: true, useDemoOnFailure: false, persistDefaultSchema: true
  })
  assert.equal(dashboardDemoPolicy({ development: true }).useDemoOnFailure, true)
  assert.equal(dashboardDemoPolicy({ test: true }).useDemoOnFailure, true)
  assert.equal(dashboardDemoPolicy({ explicit: true }).useDemoOnFailure, true)
})

test('a missing published dashboard uses the clearly-labeled demo, while other production failures remain errors', () => {
  const production = dashboardDemoPolicy({ previewMode: '0' })
  assert.equal(shouldUseDashboardDemoFallback({ status: 404, path: '/analysis/dashboards/quality-overview' }, production), true)
  assert.equal(shouldUseDashboardDemoFallback({ status: 500, path: '/analysis/dashboards/quality-overview' }, production), false)
  assert.equal(shouldUseDashboardDemoFallback({ status: 0 }, production), false)
})

test('dashboard source catalog is initialized before the eager filter watcher reads binding datasets', () => {
  const script = readFileSync(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  const catalog = script.indexOf('const availableIndicatorSources = computed(')
  const datasets = script.indexOf('const bindingDatasets = computed(')
  const watcher = script.indexOf('watch([globalFilterDefinitions, filterRuntimeValues, dependentFilterOptions]')
  assert.ok(catalog !== -1 && datasets !== -1 && watcher !== -1)
  assert.ok(catalog < datasets && datasets < watcher)
})
