import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapters from '../src/idmp/api/adapters/scenario.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/views/ScenarioEditor.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'scenario-editor-entry-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Button = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) })
const Select = vue.defineComponent({ props: ['modelValue', 'multiple', 'disabled'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Tabs = vue.defineComponent({ props: ['modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Table = vue.defineComponent({ props: ['data'], setup: () => () => vue.h('div') })
const CURRENT_ID = '102027642463173253'
const OLD_ID = '102027642458358230'
const copy = value => JSON.parse(JSON.stringify(value))

function create({ published = false, tab = 'indicators', link = true } = {}) {
  const writes = []
  const detail = { scenario: { id: '801', name: '质量安全' }, version: { id: '802', scenarioId: '801',
    publicationStatus: published ? 'PUBLISHED' : 'DRAFT', defaultPeriodType: 'MONTHLY', resourceVersion: 2,
    indicators: [{ indicatorVersionId: OLD_ID, periodType: 'QUARTERLY', organizationScopeDsl: { nodeType: 'TRUE' }, dimensionGrain: ['科室'] }], overrides: [] } }
  const route = vue.reactive({ params: { scenarioId: '801' }, query: { tab, indicatorVersionId: CURRENT_ID, ...(link ? { linkIndicator: '1' } : {}) } })
  const api = {
    fetchAllIndicatorVersions: async () => [{ id: CURRENT_ID, versionNo: 1 }, { id: OLD_ID, versionNo: 2 }],
    fetchScenarioVersions: async () => [{ id: '802', publicationStatus: detail.version.publicationStatus }],
    fetchScenarioVersion: async () => copy(detail),
    createScenarioVersion: async () => { detail.version.id = '803'; detail.version.publicationStatus = 'DRAFT'; return copy(detail) },
    updateScenarioVersion: async (id, payload) => { writes.push({ kind: 'version', id, payload }); return copy(detail) },
    replaceScenarioIndicators: async (id, payload) => { writes.push({ kind: 'indicators', id, payload }); detail.version.indicators = payload.indicators; return copy(detail) },
    replaceScenarioOverrides: async (id, payload) => { writes.push({ kind: 'overrides', id, payload }); detail.version.overrides = payload.overrides; return copy(detail) },
    fetchScenarioMergedPreview: async () => ({}), publishScenarioVersion: async () => ({}), validateScenarioVersion: async () => ({ valid: true })
  }
  const component = Function('vue', 'deps', `const { useRoute, useRouter, ElMessageBox, ElMessage, PageHeader, ${Object.keys(api).join(',')}, ${Object.keys(adapters).join(',')} } = deps;\n${bindings}\n${code}`)(vue, {
    ...api, ...adapters, useRoute: () => route, useRouter: () => ({ push() {}, replace: async value => { route.query = value.query } }),
    ElMessage: { error: message => { throw new Error(message) }, warning() {}, success() {} }, ElMessageBox: {},
    PageHeader: vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.actions?.()) })
  })
  const wrapper = mount(component, { global: { components: { ElButton: Button, ElSelect: Select, ElTabs: Tabs, ElTable: Table },
    stubs: { ElTabPane: { template: '<div><slot/></div>' }, ElForm: { template: '<div><slot/></div>' }, ElFormItem: { template: '<div><slot/></div>' },
      ElInput: true, ElOption: true, ElDatePicker: true, ElAlert: true, ElEmpty: true, ElCollapse: true, ElCollapseItem: true,
      ElSwitch: true, ElInputNumber: true, ElTableColumn: true }, directives: { loading() {} } } })
  return { wrapper, writes }
}
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)
const selectedIds = wrapper => wrapper.findAllComponents(Select).find(item => item.props('multiple') !== undefined).props('modelValue')

test('indicator entry preselects an existing draft without dropping other bindings', async () => {
  const { wrapper, writes } = create()
  await flushPromises()
  assert.equal(wrapper.findComponent(Tabs).props('modelValue'), 'indicators')
  assert.deepEqual(selectedIds(wrapper), [OLD_ID, CURRENT_ID])
  await button(wrapper, '保存草稿').trigger('click')
  await flushPromises()
  const payload = writes.find(item => item.kind === 'indicators').payload
  assert.equal(payload.indicators.length, 2)
  assert.equal(payload.indicators[0].periodType, 'QUARTERLY')
  assert.deepEqual(payload.indicators[0].dimensionGrain, ['科室'])
  assert.deepEqual(payload.indicators[0].organizationScopeDsl, { nodeType: 'TRUE' })
  wrapper.unmount()
})

test('published scenarios remain read-only until an editable draft is created', async () => {
  const { wrapper, writes } = create({ published: true })
  await flushPromises()
  assert.deepEqual(selectedIds(wrapper), [OLD_ID])
  assert.equal(writes.length, 0)
  await button(wrapper, '编辑场景').trigger('click')
  await flushPromises()
  assert.deepEqual(selectedIds(wrapper), [OLD_ID, CURRENT_ID])
  assert.equal(writes.length, 0, 'opening an editor does not silently save associations')
  wrapper.unmount()
})

test('override entry defaults new overrides to the bound indicator only', async () => {
  const { wrapper, writes } = create({ tab: 'overrides' })
  await flushPromises()
  assert.equal(wrapper.findComponent(Tabs).props('modelValue'), 'overrides')
  await button(wrapper, '新增覆盖').trigger('click')
  await button(wrapper, '保存草稿').trigger('click')
  await flushPromises()
  assert.equal(writes.find(item => item.kind === 'overrides').payload.overrides[0].indicatorVersionId, CURRENT_ID)
  wrapper.unmount()
})
