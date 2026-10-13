import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/IndicatorScenarioLinks.vue', import.meta.url), 'utf8'))
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

function create({ versions = [{ id: '102027642463173253', versionNo: 1 }], scenarios = [{ id: '801', name: '质量安全' }], rows = [], fetchRows, props = {} } = {}) {
  const navigations = []
  const component = Function('vue', 'deps', `const { useRouter, Plus, StatePanel, fetchAllIndicatorScenarios, fetchAllIndicatorVersions, fetchAllScenarios, getStatusLabel } = deps;\n${bindings}\n${code}`)(vue, {
    useRouter: () => ({ push: value => navigations.push(value) }), Plus: {},
    StatePanel: vue.defineComponent({ props: ['title'], setup: p => () => vue.h('div', p.title) }),
    fetchAllIndicatorScenarios: fetchRows || (async () => rows), fetchAllIndicatorVersions: async () => versions,
    fetchAllScenarios: async () => scenarios, getStatusLabel: value => value
  })
  const wrapper = mount(component, { props: { indicatorId: '102027642463173248', versionId: '102027642463173253', ...props },
    global: { components: { ElButton: Button, ElSelect: Select, ElTable: Table, ElTableColumn: Column }, stubs: {
      ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>' },
      ElOption: true, ElForm: { template: '<form><slot/></form>' },
      ElFormItem: { template: '<div><slot/></div>' }, ElAlert: true
    }, directives: { loading() {} } } })
  return { wrapper, navigations }
}
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)

test('association opens the real scenario editor with a published indicator version', async () => {
  const { wrapper, navigations } = create()
  await flushPromises()
  await button(wrapper, '关联场景').trigger('click')
  await flushPromises()
  const selects = wrapper.findAllComponents(Select)
  assert.equal(selects[0].props('modelValue'), '102027642463173253')
  selects[1].vm.$emit('update:modelValue', '801')
  await flushPromises()
  await button(wrapper, '前往配置').trigger('click')
  assert.deepEqual(navigations[0], { name: 'ScenarioEditor', params: { scenarioId: '801' },
    query: { tab: 'indicators', indicatorVersionId: '102027642463173253', linkIndicator: '1' } })
  wrapper.unmount()
})

test('a draft-only indicator cannot be linked to a scenario', async () => {
  const { wrapper, navigations } = create({ versions: [] })
  await flushPromises()
  await button(wrapper, '关联场景').trigger('click')
  await flushPromises()
  assert.equal(button(wrapper, '前往配置').attributes('disabled'), '')
  assert.equal(navigations.length, 0)
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

test('override navigation uses the actual scenario and bound indicator versions', async () => {
  const { wrapper, navigations } = create({ rows: [{ id: '801', scenarioVersionId: '802', name: '质量安全',
    references: [{ indicatorVersionId: '102027642463173253', indicatorVersionNo: '1' }] }] })
  await flushPromises()
  await button(wrapper, '配置覆盖').trigger('click')
  assert.deepEqual(navigations[0], { name: 'ScenarioEditor', params: { scenarioId: '801' },
    query: { tab: 'overrides', versionId: '802', indicatorVersionId: '102027642463173253' } })
  wrapper.unmount()
})
