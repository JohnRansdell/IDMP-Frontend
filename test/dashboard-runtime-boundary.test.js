import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { createDashboardViewerRuntime, createPlatformDashboardRuntime, createMedicalViewerRuntime } from '../src/idmp/features/dashboard/viewerRuntime.js'
import { useDashboardHistory } from '../src/idmp/features/dashboard/useDashboardHistory.js'

test('medical read failures never fall back to platform APIs, including after mode changes', async () => {
  let medical = true, platformCalls = 0
  const runtime = createDashboardViewerRuntime({ isMedical: () => medical,
    medical: { query: async () => { throw Error('expired ticket') } },
    platform: { query: async () => { platformCalls++; return 'platform' } } })
  await assert.rejects(runtime.query('id', {}), /expired ticket/)
  assert.equal(platformCalls, 0)
  medical = false
  assert.equal(await runtime.query('id', {}), 'platform')
  assert.equal(platformCalls, 1)
})

test('platform viewer loads the pinned published version while editing keeps the working definition', async () => {
  let versionReads = 0
  const detail = { dashboard: { id: 'id', currentPublishedVersionId: 'published' }, version: { id: 'draft' } }
  const runtime = createPlatformDashboardRuntime({ fetchDefinition: async () => detail,
    fetchVersions: async () => { versionReads++; return [{ id: 'published' }] },
    selectVersion: (_, versions) => versions[0] })
  assert.equal((await runtime.load('id')).version.id, 'published')
  assert.equal((await runtime.load('id', { editing: true })).version.id, 'draft')
  assert.equal(versionReads, 1)
})

test('restricted metadata and filter options use the widget identity without calling source management', async () => {
  const calls = []
  const runtime = createMedicalViewerRuntime({ widgetMetadata: id => ({ fields: [id], periods: [] }),
    filterOptions: (id, query) => calls.push([id, query]) }, async () => [])
  assert.deepEqual(await runtime.metadata('source', { id: 'widget' }), { fields: ['widget'], periods: [] })
  runtime.filterOptions('source', { id: 'widget' }, { term: '0' })
  assert.deepEqual(calls, [['widget', { term: '0' }]])
})

test('history batches nested edits, discards redo branches and owns cloned snapshots', async () => {
  const scope = effectScope()
  const schema = ref({ name: 'saved' }), dirty = ref(false), saveState = ref('saved')
  let history
  scope.run(() => { history = useDashboardHistory({ editing: ref(true), schema, dirty, saveState, reconcile: async () => {} }) })
  history.reset(schema.value)
  await history.transaction(async () => {
    schema.value.name = 'first'
    await history.transaction(async () => { schema.value.name = 'second' })
    await nextTick()
  })
  await nextTick()
  assert.equal(history.history.value.length, 2)
  await history.undo(); await nextTick()
  assert.equal(schema.value.name, 'saved')
  assert.equal(dirty.value, false)
  schema.value.name = 'branch'; await nextTick()
  assert.equal(history.canRedo.value, false)
  assert.equal(history.history.value[0].name, 'saved')
  scope.stop()
})

test('evicting the saved snapshot does not mark the oldest retained edit as saved', async () => {
  const scope = effectScope(), schema = ref({ n: 0 }), dirty = ref(false)
  let history
  scope.run(() => { history = useDashboardHistory({ editing: ref(true), schema, dirty,
    saveState: ref('saved'), reconcile: async () => {}, limit: 2 }) })
  history.reset(schema.value)
  schema.value.n = 1; await nextTick()
  schema.value.n = 2; await nextTick()
  await history.undo(); await nextTick()
  assert.equal(schema.value.n, 1)
  assert.equal(dirty.value, true)
  history.reset({ n: 9 })
  assert.equal(history.canUndo.value, false)
  scope.stop()
})
