import test from 'node:test'
import assert from 'node:assert/strict'
import { findLocalScene, shouldConfirmDashboardSceneSwitch } from '../src/idmp/features/dashboard/sceneRegistry.js'

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
