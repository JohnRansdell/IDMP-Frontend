import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Table = vue.defineComponent({ props: ['data'], setup(props, { slots }) {
  vue.provide('tableRows', vue.computed(() => props.data))
  return () => vue.h('table', slots.default?.())
} })
const Column = vue.defineComponent({ props: ['label', 'prop'], setup(props, { slots }) {
  const rows = vue.inject('tableRows', vue.ref([]))
  return () => vue.h('tbody', [vue.h('tr', props.label), ...rows.value.map((row, index) => vue.h('tr', slots.default?.({ row, $index: index }) || String(row[props.prop] ?? '')))])
} })
const Input = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup(props, { emit }) {
  return () => vue.h('input', { value: props.modelValue, disabled: props.disabled, onInput: event => emit('update:modelValue', event.target.value) })
} })
async function create(view, mode) {
  const source = await readFile(new URL(`../src/idmp/views/${view}.vue`, import.meta.url), 'utf8')
  const exposed = view === 'ValueSetDetail' ? 'items' : 'items, saveItems'
  const { descriptor } = parse(source.replace('</script>', `defineExpose({ ${exposed} })\n</script>`))
  const compiled = compileScript(descriptor, { id: view, inlineTemplate: true }).content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
  const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
  const row = { code: 'SENIOR', label: '老年患者', value: '1', valueStart: '65', valueEnd: '80', sortOrder: 1 }
  const version = { id: '12', versionNo: 1, publicationStatus: 'DRAFT', resourceVersion: 3, matchMode: mode, items: [row] }
  const detail = { valueSet: { id: '11', name: '住院费用年龄分层', matchMode: mode }, version }
  const writes = []
  const deps = {
    useRoute: () => ({ params: { versionId: '12', valueSetId: '11' }, query: {} }), useRouter: () => ({ push() {} }),
    PageHeader: Pass, StatePanel: Pass, StatusBadge: Pass, getStatusLabel: value => value, matchModeLabel: value => value, dataTypeLabel: value => value,
    ElMessage: { success() {}, error() {}, warning() {}, info() {} }, ElMessageBox: { confirm: async () => {} },
    fetchValueSet: async () => detail, fetchValueSetVersion: async () => detail, fetchValueSetItems: async () => [row], fetchValueSetVersions: async () => [version],
    replaceValueSetItems: async (id, body) => { writes.push({ id, body }); return { ...detail, version: { ...version, items: body.items } } }
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps; ${bindings}\n${code}`)(vue, deps)
  const components = Object.fromEntries(['ElButton', 'ElTooltip', 'ElSelect', 'ElOption', 'ElDescriptions', 'ElDescriptionsItem', 'ElForm', 'ElFormItem', 'ElInputNumber', 'ElAlert'].map(key => [key, Pass]))
  const wrapper = mount(Component, { global: { components: { ...components, ElTable: Table, ElTableColumn: Column, ElInput: Input }, directives: { access() {} } } })
  await flushPromises()
  return { wrapper, writes }
}

test('range details display the actual boundaries with inclusive/exclusive labels', async () => {
  const { wrapper } = await create('ValueSetDetail', 'RANGE')
  assert.match(wrapper.text(), /开始值（含）65/)
  assert.match(wrapper.text(), /结束值（不含）80/)
  assert.doesNotMatch(wrapper.text(), /标准值/)
  wrapper.unmount()
})

test('range editor persists both boundary inputs without replacing the item identity', async () => {
  const { wrapper, writes } = await create('ValueSetVersionEditor', 'RANGE')
  await wrapper.get('input[aria-label="开始值（含）"]').setValue('60')
  await wrapper.get('input[aria-label="结束值（不含）"]').setValue('81')
  await wrapper.vm.saveItems()
  assert.equal(writes.length, 1)
  assert.equal(writes[0].body.resourceVersion, 3)
  assert.equal(writes[0].body.items[0].code, 'SENIOR')
  assert.equal(writes[0].body.items[0].valueStart, '60')
  assert.equal(writes[0].body.items[0].valueEnd, '81')
  wrapper.unmount()
})

test('exact and continuous modes never acquire range columns', async () => {
  for (const mode of ['EXACT', 'CONTINUOUS']) {
    const { wrapper } = await create('ValueSetDetail', mode)
    assert.doesNotMatch(wrapper.text(), /开始值（含）|结束值（不含）/)
    if (mode === 'EXACT') assert.match(wrapper.text(), /标准值1/)
    else assert.match(wrapper.text(), /连续值规范/)
    wrapper.unmount()
  }
})
