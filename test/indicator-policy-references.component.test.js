import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { POLICY_REFERENCE_ROLES, policyReferenceRoleLabel } from '../src/idmp/api/adapters/mapping.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/IndicatorPolicyReferences.vue', import.meta.url), 'utf8')
// Expose script bindings only in this test compilation, without changing the production component.
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ form, references, error, loading, saving, viewerId, loadReferences, addReference, invalidate })\n</script>'))
const compiled = compileScript(descriptor, { id: 'policy-reference-test', inlineTemplate: true }).content
const vueBindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, specifiers]) => specifiers.split(',').map(specifier => {
    const [imported, local = imported] = specifier.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const State = vue.defineComponent({ props: ['title', 'description'], setup: props => () => vue.h('div', `${props.title} ${props.description || ''}`) })
const Alert = vue.defineComponent({ props: ['title'], setup: props => () => vue.h('div', props.title) })
const Button = vue.defineComponent({ props: ['disabled'], emits: ['click'], setup: (props, { slots, emit }) => () => vue.h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()) })
const Picker = vue.defineComponent({ name: 'PolicyVersionPicker', props: ['modelValue'], emits: ['update:modelValue'], setup: () => () => vue.h('div') })
const Viewer = vue.defineComponent({ name: 'PolicyFileViewer', props: ['versionId'], setup: () => () => vue.h('div') })
function create(overrides = {}, props = {}) {
  const calls = [], messages = []
  const dependencies = {
    POLICY_REFERENCE_ROLES, policyReferenceRoleLabel, PolicyVersionPicker: Picker, PolicyFileViewer: Viewer, StatePanel: State,
    ElMessage: { success: value => messages.push(value), error: value => messages.push(value), warning: value => messages.push(value) },
    ElMessageBox: { confirm: async () => {} },
    fetchPolicyReferences: async id => { calls.push(['get', id]); return [] },
    createPolicyReference: async (id, payload) => calls.push(['create', id, payload]),
    invalidatePolicyReference: async (id, version) => calls.push(['invalidate', id, version]),
    ...overrides
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(dependencies).join(', ')} } = deps;\n${vueBindings}\n${code}`)(vue, dependencies)
  const wrapper = mount(Component, {
    props: { versionId: '100000000000000001', published: true, ...props },
    global: { components: { ElAlert: Alert, ElButton: Button, ElForm: Pass, ElFormItem: Pass, ElSelect: Pass, ElOption: Pass, ElInput: Pass }, stubs: { ElTable: true, ElTableColumn: true } }
  })
  return { wrapper, calls, messages }
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('new and draft versions show restrictions and never write policy references', async () => {
  const { wrapper, calls } = create({}, { versionId: '', published: false })
  await flushPromises()
  assert.match(wrapper.text(), /请先创建并发布/)
  assert.equal(wrapper.findComponent(Picker).exists(), false)
  wrapper.vm.form.policyFileVersionId = 'policy'
  await wrapper.vm.addReference()
  assert.deepEqual(calls, [])
  await wrapper.setProps({ versionId: 'draft' })
  await flushPromises()
  assert.match(wrapper.text(), /当前为未发布版本/)
  assert.equal(wrapper.findComponent(Picker).exists(), false)
  await wrapper.vm.addReference()
  await wrapper.vm.invalidate({ id: 'reference', resourceVersion: 0 })
  assert.deepEqual(calls, [['get', 'draft']])
  wrapper.unmount()
})

test('published version saves exact policy ID, role and citation, then reloads backend data', async () => {
  const row = { id: 'ref', policyFileVersionId: '100000000000000099', policyFileName: '真实政策' }
  let reads = 0
  const { wrapper, calls } = create({ fetchPolicyReferences: async () => ++reads === 1 ? [] : [row] })
  await flushPromises()
  const picker = wrapper.findComponent(Picker)
  picker.vm.$emit('update:modelValue', row.policyFileVersionId)
  await vue.nextTick()
  Object.assign(wrapper.vm.form, { relationRole: 'DEFINITION', citationLocation: '第三章', citationText: '定义原文' })
  await wrapper.vm.addReference()
  assert.deepEqual(calls, [['create', '100000000000000001', { policyFileVersionId: row.policyFileVersionId, relationRole: 'DEFINITION', citationLocation: '第三章', citationText: '定义原文' }]])
  assert.deepEqual(wrapper.vm.references, [row])
  assert.equal(wrapper.vm.form.policyFileVersionId, '')
  assert.equal(reads, 2)
  wrapper.unmount()
})

test('failed create preserves form and allows retry without duplicate in-flight submission', async () => {
  const pending = deferred()
  let writes = 0
  const { wrapper } = create({ createPolicyReference: async () => { writes++; await pending.promise; throw new Error('保存失败') } })
  await flushPromises()
  wrapper.vm.form.policyFileVersionId = 'policy'
  const save = wrapper.vm.addReference()
  await wrapper.vm.addReference()
  assert.equal(writes, 1)
  pending.resolve()
  await save
  assert.equal(wrapper.vm.form.policyFileVersionId, 'policy')
  assert.equal(wrapper.vm.saving, false)
  wrapper.unmount()
})

test('invalidate uses reference resourceVersion; cancel sends no write', async () => {
  let cancel = true
  const { wrapper, calls } = create({ ElMessageBox: { confirm: async () => { if (cancel) throw 'cancel' } } })
  await flushPromises()
  await wrapper.vm.invalidate({ id: 'ref', resourceVersion: 7 })
  assert.deepEqual(calls, [['get', '100000000000000001']])
  cancel = false
  await wrapper.vm.invalidate({ id: 'ref', resourceVersion: 7 })
  assert.deepEqual(calls.slice(1), [['invalidate', 'ref', 7], ['get', '100000000000000001']])
  wrapper.unmount()
})

test('load failure is visible and refresh recovers from backend', async () => {
  let failing = true
  const { wrapper } = create({ fetchPolicyReferences: async () => { if (failing) throw new Error('网络中断'); return [{ id: 'real' }] } })
  await flushPromises()
  assert.match(wrapper.text(), /政策引用读取失败.*网络中断/)
  failing = false
  await wrapper.findAll('button').find(button => button.text() === '刷新引用').trigger('click')
  await flushPromises()
  assert.equal(wrapper.vm.error, '')
  assert.deepEqual(wrapper.vm.references, [{ id: 'real' }])
  wrapper.unmount()
})

test('switching versions clears form and preview and ignores stale reads and writes', async () => {
  const oldRead = deferred(), oldWrite = deferred()
  const { wrapper } = create({ fetchPolicyReferences: id => id === 'old' ? oldRead.promise : Promise.resolve([{ id: 'new-reference' }]), createPolicyReference: () => oldWrite.promise }, { versionId: 'old' })
  wrapper.vm.form.policyFileVersionId = 'old-policy'
  wrapper.vm.viewerId = 'old-preview'
  const save = wrapper.vm.addReference()
  await wrapper.setProps({ versionId: 'new' })
  await flushPromises()
  wrapper.vm.form.policyFileVersionId = 'new-policy'
  oldRead.resolve([{ id: 'old-reference' }]); oldWrite.resolve()
  await save; await flushPromises()
  assert.deepEqual(wrapper.vm.references, [{ id: 'new-reference' }])
  assert.equal(wrapper.vm.form.policyFileVersionId, 'new-policy')
  assert.equal(wrapper.findComponent(Viewer).props('versionId'), '')
  wrapper.unmount()
})

test('publishing current draft enables real policy selection and reloads references', async () => {
  const { wrapper, calls } = create({}, { published: false })
  await flushPromises()
  assert.equal(wrapper.findComponent(Picker).exists(), false)
  await wrapper.setProps({ published: true })
  await flushPromises()
  assert.equal(wrapper.findComponent(Picker).exists(), true)
  assert.equal(calls.length, 2)
  wrapper.unmount()
})
