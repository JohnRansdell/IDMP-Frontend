import test from 'node:test'
import assert from 'node:assert/strict'
import { createQualitySafetyDemoSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'
import { canRestoreQualitySafetyDemo, createQualitySafetyDemoRestoreResult } from '../src/idmp/features/dashboard/qualitySafetyDemoRestore.js'

test('restore entry is available only while editing the quality safety scene in a demo runtime', () => {
  assert.equal(canRestoreQualitySafetyDemo({ isEditing: true, isDemoRuntime: true, sceneCode: 'quality-safety' }), true)
  assert.equal(canRestoreQualitySafetyDemo({ isEditing: false, isDemoRuntime: true, sceneCode: 'quality-safety' }), false)
  assert.equal(canRestoreQualitySafetyDemo({ isEditing: true, isDemoRuntime: false, sceneCode: 'quality-safety' }), false)
  assert.equal(canRestoreQualitySafetyDemo({ isEditing: true, isDemoRuntime: true, sceneCode: 'performance' }), false)
})

test('restoring replaces only the current quality safety editing schema and marks it dirty for explicit save', () => {
  const restored = createQualitySafetyDemoRestoreResult(createQualitySafetyDemoSchema({ id: 'quality-overview-quality-safety', sceneCode: 'quality-safety' }))
  assert.equal(restored.dirty, true)
  assert.equal(restored.schema.widgets.length, 5)
  assert.equal(restored.schema.globalFilters.length, 2)
  assert.deepEqual(restored.schema.globalFilters.find(item => item.id === 'disease').dependsOn, ['department'])
})
