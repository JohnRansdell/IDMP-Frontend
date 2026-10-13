import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/features/analysis/DrillExplorer.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'drill-explorer-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Select = vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'],
  setup: (props, { slots }) => () => vue.h('div', { 'data-path': props.modelValue }, slots.default?.()) })
const Button = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) })

function create(fetchResultFactors = async () => ({ context: {}, factors: [] }), props = {}) {
  const requests = []
  const component = Function('vue', 'deps', `const { useRoute, useRouter, StatePanel, FactorTraceTree, searchResultDrill, fetchResultFactors, limitDrillNextLevels, isStatusRecord, getStatusLabel } = deps;\n${bindings}\n${code}`)(vue, {
    useRoute: () => ({ query: {} }), useRouter: () => ({ push() {}, replace() {} }),
    StatePanel: vue.defineComponent({ props: ['title'], setup: props => () => vue.h('div', props.title) }),
    FactorTraceTree: vue.defineComponent({ setup: () => () => vue.h('div', 'trace-tree') }),
    searchResultDrill: async (id, payload) => {
      requests.push({ id, payload })
      return { context: {}, breadcrumb: [], summary: {}, columns: [], records: [], nextLevels: [], pageInfo: {} }
    },
    fetchResultFactors, limitDrillNextLevels: levels => levels, isStatusRecord: () => false, getStatusLabel: value => value
  })
  const wrapper = mount(component, {
    props: { resultId: 'dept-result', startPathCode: 'CUSTOM_DEPT', startLevel: 'DEPT',
      startParentKeys: { OUT_DEPT_CODE: '17' }, startFilters: { OUT_DEPT_CODE: '17' },
      configuredPaths: [{ pathCode: 'CUSTOM_DEPT', pathName: '科室下钻', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DEPT' }] }], embedded: true, ...props },
    global: { components: { ElSelect: Select, ElButton: Button },
      stubs: { ElOption: true, ElTable: true, ElTableColumn: true }, directives: { loading() {} } }
  })
  return { wrapper, requests }
}
function button(wrapper, text) { return wrapper.findAll('button').find(item => item.text() === text) }

test('factor tracing is a separate command, not a drill path option', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  assert.ok(!wrapper.findAll('el-option-stub').some(option => ['FACTOR_TRACE', 'TIME', 'SCENARIO'].includes(option.attributes('value'))))
  await button(wrapper, '查看因子追溯').trigger('click')
  await flushPromises()
  assert.equal(wrapper.findComponent(Select).props('modelValue'), 'CUSTOM_DEPT')
  assert.equal(requests.length, 1)
  assert.ok(wrapper.find('section[aria-label="因子结果追溯"]').exists())
  assert.ok(button(wrapper, '返回下钻'))
  await button(wrapper, '返回下钻').trigger('click')
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.deepEqual(requests[1], requests[0], 'return preserves the result, level, parent keys and filters')
  wrapper.unmount()
})

test('returning to drill prevents a pending trace response from reopening the trace panel', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper } = create(() => pending)
  await flushPromises()
  await button(wrapper, '查看因子追溯').trigger('click')
  await button(wrapper, '返回下钻').trigger('click')
  resolve({ context: {}, factors: [] })
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.ok(button(wrapper, '查看因子追溯'))
  wrapper.unmount()
})

test('choosing another drill path exits trace mode without leaving an internal value in the selector', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  await button(wrapper, '查看因子追溯').trigger('click')
  await flushPromises()
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'DISEASE')
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.equal(requests.at(-1).payload.currentLevel, 'ALL_SINGLE_DISEASE')
  assert.ok(button(wrapper, '查看因子追溯'))
  wrapper.unmount()
})
