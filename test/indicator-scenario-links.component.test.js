import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { appendScenarioIndicator } from '../src/idmp/features/indicator/editorWorkflow.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/IndicatorScenarioLinks.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ scenarioId, draftId, savedVersionId, drafts, error, bind, loadVersions, search })\n</script>'))
const compiled = compileScript(descriptor, { id: 'indicator-scenario-links-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Button = vue.defineComponent({ props: ['disabled'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled }, slots.default?.()) })
const Select = vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Row = vue.defineComponent({ props: ['row'], setup: (props, { slots }) => {
  vue.provide('row', props.row)
  return () => vue.h('div', slots.default?.())
} })
const Table = vue.defineComponent({ props: ['data'], setup: (props, { slots }) => () => vue.h('div', (props.data || []).map(row => vue.h(Row, { row }, slots))) })
const Column = vue.defineComponent({ setup: (_, { slots }) => {
  const row = vue.inject('row')
  return () => vue.h('div', slots.default?.({ row }))
} })

const INDICATOR_VERSION = '102027642463173253'
const EXISTING_VERSION = '102027642458358230'
function create({ rows = [], fetchRows, props = {}, api = {} } = {}) {
  const navigations = [], writes = []
  const existing = { indicatorVersionId: EXISTING_VERSION, displayOrder: 3, required: false,
    periodType: 'QUARTERLY', dimensionGrain: ['科室'], organizationScopeDsl: { nodeType: 'TRUE' } }
  const deps = {
    useRouter: () => ({ push: value => navigations.push(value) }), appendScenarioIndicator,
    fetchAllIndicatorScenarios: fetchRows || (async () => rows),
    fetchAllScenarios: async () => [{ id: '801', name: '质量安全' }],
    fetchScenarioVersions: async () => [{ id: '802', publicationStatus: 'DRAFT' }, { id: '803', publicationStatus: 'PUBLISHED' }],
    fetchScenarioVersion: async () => ({ version: { publicationStatus: 'DRAFT', resourceVersion: 2, indicators: [existing] } }),
    replaceScenarioIndicators: async (id, payload) => { writes.push({ id, payload }) },
    ...api
  }
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(component, { props: { indicatorId: '102027642463173248', versionId: INDICATOR_VERSION, published: true, ...props },
    global: { components: { ElButton: Button, ElSelect: Select, ElTable: Table, ElTableColumn: Column }, stubs: {
      ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>' },
      ElOption: true, ElForm: { template: '<form><slot/></form>' },
      ElFormItem: { template: '<div><slot/></div>' }, ElAlert: true
    }, directives: { loading() {} } } })
  return { wrapper, navigations, writes, existing }
}
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)

test('published indicators join a selected scenario draft while preserving every existing binding', async () => {
  const { wrapper, navigations, writes, existing } = create()
  await flushPromises()
  wrapper.vm.scenarioId = '801'
  await wrapper.vm.loadVersions()
  assert.deepEqual(wrapper.vm.drafts.map(row => row.id), ['802'])
  wrapper.vm.draftId = '802'
  await vue.nextTick()
  await button(wrapper, '加入场景草稿').trigger('click')
  await flushPromises()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].id, '802')
  assert.equal(writes[0].payload.resourceVersion, 2)
  assert.deepEqual(writes[0].payload.indicators[0], existing)
  assert.equal(writes[0].payload.indicators[1].indicatorVersionId, INDICATOR_VERSION)
  assert.equal(wrapper.vm.savedVersionId, '802')
  await button(wrapper, '进入场景编辑').trigger('click')
  assert.deepEqual(navigations[0], { name: 'ScenarioEditor', params: { scenarioId: '801' },
    query: { versionId: '802' } })
  wrapper.unmount()
})

test('a draft-only indicator cannot be linked to a scenario', async () => {
  const { wrapper, writes } = create({ props: { published: false } })
  await flushPromises()
  assert.equal(button(wrapper, '加入场景草稿'), undefined)
  wrapper.vm.draftId = '802'
  await wrapper.vm.bind()
  assert.equal(writes.length, 0)
  wrapper.unmount()
})

test('late results from another indicator do not overwrite the current associations', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper } = create({ fetchRows: id => id === '102027642463173248' ? pending : Promise.resolve([{ id: 'new' }]) })
  await wrapper.setProps({ indicatorId: 'new-indicator' })
  await flushPromises()
  resolve([{ id: 'old' }])
  await flushPromises()
  assert.deepEqual(wrapper.findComponent(Table).props('data'), [{ id: 'new' }])
  wrapper.unmount()
})

test('association navigation uses the actual scenario version', async () => {
  const { wrapper, navigations } = create({ rows: [{ id: '801', scenarioVersionId: '802', name: '质量安全',
    references: [{ indicatorVersionId: '102027642463173253', indicatorVersionNo: '1' }] }] })
  await flushPromises()
  await button(wrapper, '查看或配置覆盖').trigger('click')
  assert.deepEqual(navigations[0], { name: 'ScenarioEditor', params: { scenarioId: '801' },
    query: { versionId: '802' } })
  wrapper.unmount()
})

test('a scenario published after selection is never modified', async () => {
  const { wrapper, writes } = create({ api: {
    fetchScenarioVersion: async () => ({ version: { publicationStatus: 'PUBLISHED' } })
  } })
  await flushPromises()
  wrapper.vm.draftId = '802'
  await wrapper.vm.bind()
  assert.equal(writes.length, 0)
  assert.match(wrapper.vm.error, /已不是草稿/)
  wrapper.unmount()
})

test('concurrent binding is blocked and failures allow explicit retry', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  let attempts = 0
  const { wrapper } = create({ api: { replaceScenarioIndicators: async () => {
    attempts++
    await pending
    throw new Error('版本冲突')
  } } })
  await flushPromises()
  wrapper.vm.draftId = '802'
  const request = wrapper.vm.bind()
  await flushPromises()
  await wrapper.vm.bind()
  assert.equal(attempts, 1)
  release()
  await request
  assert.match(wrapper.vm.error, /版本冲突/)
  assert.equal(wrapper.vm.savedVersionId, '')
  await wrapper.vm.bind()
  assert.equal(attempts, 2)
  wrapper.unmount()
})

test('changing indicator context before draft lookup completes prevents an obsolete write', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const { wrapper, writes } = create({ api: { fetchScenarioVersion: () => pending } })
  await flushPromises()
  wrapper.vm.draftId = '802'
  const request = wrapper.vm.bind()
  await wrapper.setProps({ versionId: 'another-version' })
  release({ version: { publicationStatus: 'DRAFT', resourceVersion: 2, indicators: [] } })
  await request
  assert.equal(writes.length, 0)
  assert.equal(wrapper.vm.savedVersionId, '')
  wrapper.unmount()
})
