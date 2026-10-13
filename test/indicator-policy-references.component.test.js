import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { POLICY_REFERENCE_ROLES, policyReferenceRoleLabel } from '../src/idmp/api/adapters/mapping.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/IndicatorPolicyReferences.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'indicator-policy-references-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Button = vue.defineComponent({ props: ['disabled', 'loading'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled || props.loading }, slots.default?.()) })
const Field = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: () => () => vue.h('div') })
const Picker = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: () => () => vue.h('div') })
const Viewer = vue.defineComponent({ props: ['versionId'], emits: ['close'], setup: () => () => vue.h('div') })
const Row = vue.defineComponent({ props: ['row'], setup: (props, { slots }) => { vue.provide('row', props.row); return () => vue.h('div', slots.default?.()) } })
const Table = vue.defineComponent({ props: ['data'], setup: (props, { slots }) => () => vue.h('div', props.data.map(row => vue.h(Row, { row }, slots))) })
const Column = vue.defineComponent({ props: ['prop'], setup: (props, { slots }) => {
  const row = vue.inject('row')
  return () => vue.h('div', slots.default ? slots.default({ row }) : row[props.prop])
} })
const VERSION = '102027642463173253'
const POLICY = '102027642463173261'
const REFERENCE = { id: '102027642463173271', policyFileVersionId: POLICY, policyFileName: '医疗质量政策', policyVersionNo: '3', relationRole: 'DEFINITION', citationLocation: '第二章', citationText: '真实政策原文', resourceVersion: 4 }

function create({ props = {}, rows = [REFERENCE], fetchRows, addReference, invalidateReference, confirm } = {}) {
  const calls = [], messages = []
  let stored = [...rows]
  const deps = {
    Plus: {}, POLICY_REFERENCE_ROLES, policyReferenceRoleLabel,
    PolicyVersionPicker: Picker, PolicyFileViewer: Viewer,
    StatePanel: vue.defineComponent({ props: ['title', 'description'], setup: (p, { slots }) => () => vue.h('div', [p.title, p.description, slots.actions?.()]) }),
    ElMessage: Object.fromEntries(['success', 'error'].map(kind => [kind, message => messages.push({ kind, message })])),
    ElMessageBox: { confirm: confirm || (async () => {}) },
    fetchPolicyReferences: async id => { calls.push({ kind: 'read', id }); return fetchRows ? fetchRows(id) : [...stored] },
    createPolicyReference: async (id, payload) => {
      calls.push({ kind: 'add', id, payload })
      if (addReference) return addReference(id, payload)
      stored.push({ ...REFERENCE, ...payload })
    },
    invalidatePolicyReference: async (id, resourceVersion) => {
      calls.push({ kind: 'invalidate', id, resourceVersion })
      if (invalidateReference) return invalidateReference(id, resourceVersion)
      stored = stored.filter(row => row.id !== id)
    }
  }
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(component, { props: { versionId: VERSION, published: true, ...props }, global: {
    components: { ElButton: Button, ElSelect: Field, ElInput: Field, ElTable: Table, ElTableColumn: Column },
    stubs: { ElForm: { template: '<form><slot/></form>' }, ElFormItem: { template: '<div><slot/></div>' }, ElOption: true, ElAlert: true, ElEmpty: true }
  } })
  return { wrapper, calls, messages }
}
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)

test('editor replaces demo policy rows and checkbox options with the real version-bound component', async () => {
  const source = await readFile(new URL('../src/idmp/views/IndicatorEditor.vue', import.meta.url), 'utf8')
  assert.ok(source.includes('<IndicatorPolicyReferences :version-id="indicatorWorkflow.versionId" :published="indicatorWorkflow.published"'))
  for (const legacy of ['editorPolicyRows', 'policyOptions', 'v-model="form.policies"', 'prop="policies"']) assert.equal(source.includes(legacy), false)
})

test('reads actual references and displays Chinese roles, policy versions and citation text', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  assert.deepEqual(calls, [{ kind: 'read', id: VERSION }])
  for (const text of ['医疗质量政策', '定义依据', '第二章', '真实政策原文']) assert.ok(wrapper.text().includes(text))
  assert.deepEqual(wrapper.findComponent(Table).props('data'), [REFERENCE])
  wrapper.unmount()
})

test('new and draft versions cannot add or invalidate policies', async () => {
  for (const props of [{ versionId: '' }, { published: false }]) {
    const { wrapper, calls } = create({ props })
    await flushPromises()
    assert.equal(wrapper.find('form').exists(), false)
    assert.equal(button(wrapper, '失效'), undefined)
    assert.equal(calls.length, props.versionId === '' ? 0 : 1)
    wrapper.unmount()
  }
})

test('adds to the current version with precise IDs and reloads persisted references', async () => {
  const { wrapper, calls } = create({ rows: [] })
  await flushPromises()
  assert.equal(button(wrapper, '添加政策依据').attributes('disabled'), '')
  wrapper.findComponent(Picker).vm.$emit('update:modelValue', POLICY)
  const fields = wrapper.findAllComponents(Field)
  fields[0].vm.$emit('update:modelValue', 'REFERENCE')
  fields[1].vm.$emit('update:modelValue', '第一条')
  fields[2].vm.$emit('update:modelValue', '政策原文')
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  assert.deepEqual(calls.find(item => item.kind === 'add'), { kind: 'add', id: VERSION,
    payload: { policyFileVersionId: POLICY, relationRole: 'REFERENCE', citationLocation: '第一条', citationText: '政策原文' } })
  assert.equal(calls.filter(item => item.kind === 'read').length, 2)
  assert.equal(wrapper.findComponent(Table).props('data').length, 1)
  assert.equal(wrapper.findComponent(Picker).props('modelValue'), '')
  wrapper.unmount()
})

test('invalidates the exact reference using its optimistic resource version', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  await button(wrapper, '失效').trigger('click')
  await flushPromises()
  assert.deepEqual(calls.find(item => item.kind === 'invalidate'), { kind: 'invalidate', id: REFERENCE.id, resourceVersion: 4 })
  assert.deepEqual(wrapper.findComponent(Table).props('data'), [])
  wrapper.unmount()
})

test('canceling confirmation does not invalidate a reference', async () => {
  const { wrapper, calls, messages } = create({ confirm: async () => { throw 'cancel' } })
  await flushPromises()
  await button(wrapper, '失效').trigger('click')
  await flushPromises()
  assert.equal(calls.some(item => item.kind === 'invalidate'), false)
  assert.deepEqual(messages, [])
  wrapper.unmount()
})

test('view opens the selected policy version and closes without mutating the association', async () => {
  const { wrapper, calls } = create()
  await flushPromises()
  await button(wrapper, '查看').trigger('click')
  assert.equal(wrapper.findComponent(Viewer).props('versionId'), POLICY)
  wrapper.findComponent(Viewer).vm.$emit('close')
  await flushPromises()
  assert.equal(wrapper.findComponent(Viewer).props('versionId'), '')
  assert.equal(calls.length, 1)
  wrapper.unmount()
})

test('failed loads show a retriable error rather than an empty reference list', async () => {
  let fail = true
  const { wrapper } = create({ fetchRows: async () => { if (fail) throw new Error('政策接口暂不可用'); return [REFERENCE] } })
  await flushPromises()
  assert.ok(wrapper.text().includes('政策接口暂不可用'))
  assert.equal(wrapper.findComponent(Table).exists(), false)
  fail = false
  await button(wrapper, '重试').trigger('click')
  await flushPromises()
  assert.deepEqual(wrapper.findComponent(Table).props('data'), [REFERENCE])
  wrapper.unmount()
})

test('failed additions retain selection and citation input', async () => {
  const { wrapper, messages } = create({ addReference: async () => { throw new Error('已经关联此政策文件版本') } })
  await flushPromises()
  wrapper.findComponent(Picker).vm.$emit('update:modelValue', POLICY)
  await flushPromises()
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  assert.equal(wrapper.findComponent(Picker).props('modelValue'), POLICY)
  assert.equal(messages[0].message, '已经关联此政策文件版本')
  wrapper.unmount()
})

test('late responses cannot replace another indicator version references', async () => {
  let resolveOld
  const old = new Promise(resolve => { resolveOld = resolve })
  const { wrapper } = create({ fetchRows: id => id === VERSION ? old : Promise.resolve([]) })
  await wrapper.setProps({ versionId: 'new-version', published: false })
  await flushPromises()
  resolveOld([REFERENCE])
  await flushPromises()
  assert.deepEqual(wrapper.findComponent(Table).props('data'), [])
  wrapper.unmount()
})

test('switching versions during confirmation cannot invalidate the previous version reference', async () => {
  let resolveConfirmation
  const { wrapper, calls } = create({ confirm: () => new Promise(resolve => { resolveConfirmation = resolve }) })
  await flushPromises()
  await button(wrapper, '失效').trigger('click')
  await wrapper.setProps({ versionId: 'new-version' })
  resolveConfirmation()
  await flushPromises()
  assert.equal(calls.some(item => item.kind === 'invalidate'), false)
  wrapper.unmount()
})
