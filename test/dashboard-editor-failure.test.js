import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createDashboardEditingSnapshot } from '../src/idmp/features/dashboard/editSession.js'

const source = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
const start = source.slice(source.indexOf('async function startDashboardEdit()'), source.indexOf('function finishDashboardEdit()'))
function editor(overrides = {}) {
  const messages = [], previews = [], ref = value => ({ value })
  const schema = { widgets: [{ id: 'bad', config: { fixedVersion: 'v1' } }, { id: 'good' }] }
  const deps = {
    canEditCurrentDashboard: ref(true), dashboardEditLoading: ref(false), dashboardDeleting: ref(false), isEditing: ref(false), activeDashboardId: ref('board'),
    isRemoteDashboard: () => true, isLocalDashboard: () => false, route: { name: 'Dashboard' }, dashboardSchema: ref(schema),
    fetchDashboardDefinition: async () => ({ version: { id: 'draft' } }), fetchDashboardVersions: async () => [],
    dashboardDetailMeta: () => ({ dashboardId: 'board', workingVersionId: 'draft' }), selectDashboardVersion: detail => detail.version,
    remoteDashboardMeta: ref(null), remoteDashboardIsMock: ref(false), dashboardDefinition: ref(null),
    isMockDashboardDetail: () => false, dashboardDetailToSchema: () => schema, dashboardDetailToEditableSchema: () => schema,
    applyDefaultDashboardBindings: value => value, remoteFieldCatalog: ref({}), indicatorCatalogError: ref('下钻层级缺少字段编码'),
    loadPublishedIndicatorCatalog: async () => true, designerWidgets: ref(schema.widgets),
    canQueryBoundDashboardWidget: () => true, getWidgetSource: () => ({}),
    previewRemoteWidget: async widget => { previews.push(widget.id); if (widget.id === 'bad') throw new Error('预览失败') },
    mapWithConcurrency: async (items, limit, work) => Promise.all(items.map(work)),
    ElMessage: Object.fromEntries(['warning', 'error', 'info'].map(key => [key, value => messages.push([key, value])])), ...overrides
  }
  deps.beginDashboardEdit ||= value => { deps.isEditing.value = true; deps.opened = value; return true }
  return { deps, schema, messages, previews, run: Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; ${start}; return startDashboardEdit`)(deps) }
}

test('preview failures keep the draft and allow healthy components to load', async () => {
  const state = editor()
  await state.run()
  assert.equal(state.deps.isEditing.value, true)
  assert.equal(state.deps.opened, state.schema)
  assert.deepEqual(state.schema.widgets[0].config, { fixedVersion: 'v1' })
  assert.deepEqual(state.previews.sort(), ['bad', 'good'])
  assert.equal(state.messages.some(([type]) => type === 'error'), false)
  assert.match(state.messages[0][1], /预览失败/)
})

test('catalog failures are reported after opening the draft without discarding configuration', async () => {
  const state = editor({ loadPublishedIndicatorCatalog: async () => false })
  await state.run()
  assert.equal(state.deps.opened, state.schema)
  assert.deepEqual(state.previews, [])
  assert.match(state.messages[0][1], /草稿已打开.*下钻层级缺少字段编码/)
  assert.equal(state.deps.dashboardEditLoading.value, false)
})

test('draft read failures remain errors and do not open or overwrite the editor', async () => {
  const state = editor({ fetchDashboardDefinition: async () => { throw new Error('读取失败') } })
  await state.run()
  assert.equal(state.deps.isEditing.value, false)
  assert.equal(state.deps.opened, undefined)
  assert.deepEqual(state.previews, [])
  assert.deepEqual(state.messages, [['error', '读取看板草稿失败：读取失败']])
})

function snapshotEditor(fail) {
  const ref = value => ({ value }), calls = [], errors = []
  const schema = { widgets: [{ id: 'original' }] }
  if (fail) { schema.widgets[0].config = {}; schema.widgets[0].config.self = schema.widgets[0].config }
  const deps = {
    dashboardSchema: ref(schema), editingDashboardSchema: ref({ widgets: [{ id: 'previous' }] }),
    activeWidgetId: ref('original'), designerDrawerOpen: ref(true), dashboardDirty: ref(true), saveState: ref('unsaved'), lastSavedAt: ref('before'), isEditing: ref(false), designerImmersive: ref(false),
    loadDesignerSchema: value => value,
    createDashboardEditingSnapshot,
    loadPublishedIndicatorCatalog: () => { calls.push('catalog') }, resetDashboardHistory: value => calls.push(value),
    ElMessage: { error: message => errors.push(message) }
  }
  const body = source.slice(source.indexOf('function beginDashboardEdit('), source.indexOf('async function startDashboardEdit()'))
  const run = Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; ${body}; return beginDashboardEdit`)(deps)
  return { deps, run, calls, errors }
}

test('snapshot failures preserve the complete editor state and cannot create a blank replacement', () => {
  const state = snapshotEditor(true)
  const keys = ['dashboardSchema', 'editingDashboardSchema', 'activeWidgetId', 'designerDrawerOpen', 'dashboardDirty', 'saveState', 'lastSavedAt', 'isEditing', 'designerImmersive']
  const before = structuredClone(Object.fromEntries(keys.map(key => [key, state.deps[key].value])))
  assert.equal(state.run(), false)
  assert.deepEqual(Object.fromEntries(keys.map(key => [key, state.deps[key].value])), before)
  assert.deepEqual(state.calls, [])
  assert.match(state.errors[0], /无法进入看板编辑.*原看板配置已保留/)
})

test('valid snapshots enter editing with an independent copy and reset history', () => {
  const state = snapshotEditor(false)
  assert.equal(state.run(), true)
  assert.equal(state.deps.isEditing.value, true)
  assert.notEqual(state.deps.editingDashboardSchema.value, state.deps.dashboardSchema.value)
  assert.deepEqual(state.deps.editingDashboardSchema.value, state.deps.dashboardSchema.value)
  assert.equal(state.calls[1], state.deps.editingDashboardSchema.value)
})

test('failed entry stops remote metadata loading and preview for ordinary and historical drafts', async () => {
  for (const mock of [false, true]) {
    let catalogReads = 0
    const state = editor({ beginDashboardEdit: () => false, isMockDashboardDetail: () => mock,
      loadPublishedIndicatorCatalog: async () => { catalogReads++; return true } })
    await state.run()
    assert.equal(state.deps.isEditing.value, false)
    assert.equal(catalogReads, 0)
    assert.deepEqual(state.previews, [])
    assert.deepEqual(state.messages, [])
  }
})
