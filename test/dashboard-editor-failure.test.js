import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

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
  deps.beginDashboardEdit = value => { deps.isEditing.value = true; deps.opened = value }
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
