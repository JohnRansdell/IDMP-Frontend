import test from 'node:test'
import assert from 'node:assert/strict'
import { createQualitySafetyDemoSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'
import { canRestoreQualitySafetyDemo, createQualitySafetyDemoRestoreResult } from '../src/idmp/features/dashboard/qualitySafetyDemoRestore.js'
import { createDashboardEditingSnapshot } from '../src/idmp/features/dashboard/editSession.js'

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

test('editor starts from the visible demo schema without loading or saving a different layout', () => {
  const viewer = createQualitySafetyDemoSchema({ id: 'quality-overview-quality-safety', sceneCode: 'quality-safety' })
  const original = JSON.stringify(viewer)
  const editor = createDashboardEditingSnapshot(viewer, () => { throw new Error('must not reload a different layout') })
  assert.deepEqual(editor, viewer)
  assert.notStrictEqual(editor, viewer)
  assert.equal(editor.widgets.length, 5)
  assert.deepEqual(editor.globalFilters.find(filter => filter.id === 'disease').dependsOn, ['department'])
  editor.widgets[0].title = '编辑中的标题'
  assert.equal(JSON.stringify(viewer), original)
})

test('editor still loads a fallback schema when no viewer schema exists', () => {
  const fallback = createQualitySafetyDemoSchema({ id: 'quality-overview-quality-safety', sceneCode: 'quality-safety' })
  let reads = 0
  const editor = createDashboardEditingSnapshot(null, () => { reads += 1; return fallback })
  assert.equal(reads, 1)
  assert.deepEqual(editor, fallback)
  assert.notStrictEqual(editor, fallback)
})
