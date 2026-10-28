import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { policyReferenceRoleLabel } from '../src/idmp/api/adapters/mapping.js'
const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const controllerSource = await readFile(new URL('../src/idmp/features/indicator/useIndicatorPolicySources.js', import.meta.url), 'utf8')
const controllerCode = controllerSource.replace(/^import .*$/gm, '').replace('export function useIndicatorPolicySources', 'function useIndicatorPolicySources')
const source = await readFile(new URL('../src/idmp/components/IndicatorPolicySources.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('defineExpose({ validateSources, syncPendingSources, copySourcesToDraft })', 'defineExpose({ validateSources, syncPendingSources, copySourcesToDraft, references, error, options, selectSources, loadReferences, saving, edit, invalidate })'))
const compiled = compileScript(descriptor, { id: 'sources-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => { const [imported, local = imported] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${imported};` })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Input = vue.defineComponent({ props: ['modelValue', 'disabled', 'type'], emits: ['update:modelValue'], setup: (props, { emit }) => () => vue.h(props.type === 'textarea' ? 'textarea' : 'input', { value: props.modelValue, disabled: props.disabled, onInput: event => emit('update:modelValue', event.target.value) }) })
const pending = id => ({ policyFileVersionId: id, policyFileId: 'file', policyFileName: `政策${id}`, versionNo: '1', citationLocation: '', citationText: '' })
function create(overrides = {}, props = {}) {
  const writes = [], states = [], messages = []
  const deps = {
    policyReferenceRoleLabel, PolicyFileViewer: Pass,
    ElMessageBox: { confirm: async () => {} }, ElMessage: Object.fromEntries(['success', 'warning', 'error'].map(key => [key, message => messages.push(message)])),
    fetchPolicyReferences: async () => [], fetchPublishedPolicyVersions: async () => ({ records: [] }),
    fetchPolicyVersion: async id => ({ id, publicationStatus: 'PUBLISHED', policyFileId: 'file' }),
    fetchPolicy: async () => ({ policyFile: { name: '真实政策', documentNumber: '医发2026号' } }),
    createPolicyReference: async (id, payload) => writes.push([id, payload]), invalidatePolicyReference: async () => {}, ...overrides
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\nconst { computed, onBeforeUnmount, reactive, ref, watch } = vue;\n${controllerCode}\n${bindings}\n${code}`)(vue, deps)
  let wrapper
  wrapper = mount(Component, { props: { modelValue: [], versionId: '', published: false, ...props, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }), onState: state => states.push(state) }, global: { components: { ElAlert: Pass, ElButton: Pass, ElSelect: Pass, ElOption: Pass, ElInput: Input }, stubs: { ElTable: true, ElTableColumn: true }, directives: { loading() {} } } })
  return { wrapper, writes, states, messages }
}
test('source is required but empty basis fields are valid, and drafts never write references', async () => {
  const { wrapper, writes, states } = create()
  await flushPromises()
  await assert.rejects(wrapper.vm.validateSources(), /至少一份/)
  await wrapper.setProps({ modelValue: [pending('900000000000000001')] })
  assert.equal(await wrapper.vm.validateSources(), true)
  assert.equal(states.at(-1).count, 1)
  await assert.rejects(wrapper.vm.syncPendingSources(), /先发布/)
  assert.deepEqual(writes, [])
  wrapper.unmount()
})

test('inline saved basis preserves citations without exposing resource codes when names are absent', async () => {
  const { wrapper } = create({ fetchPolicyReferences: async () => [{
    id: 'reference', relationRole: 'SOURCE', policyFileVersionId: 'hidden-version-id',
    policyFileId: 'file', policyFileCode: 'HIDDEN_POLICY_CODE', policyVersionNo: '2026',
    citationLocation: '第三章第二条', citationText: '核对患者范围与统计口径'
  }] }, { published: true, versionId: 'version' })
  await flushPromises()
  const saved = wrapper.find('.saved-source')
  assert.match(saved.text(), /未命名政策文件/)
  assert.match(saved.text(), /第三章第二条/)
  assert.match(saved.text(), /核对患者范围与统计口径/)
  assert.doesNotMatch(saved.text(), /HIDDEN_POLICY_CODE|hidden-version-id/)
  assert.equal(saved.find('details').element.open, false)
  assert.equal(saved.find('textarea').exists(), false)
  wrapper.unmount()
})
test('published sources use SOURCE role with optional blank citation and deduplicate on retry', async () => {
  const existing = { id: 'refA', relationRole: 'SOURCE', policyFileVersionId: 'A', policyFileId: 'file' }
  const { wrapper, writes } = create({ fetchPolicyReferences: async () => [existing] }, { published: true, versionId: 'version', modelValue: [pending('A'), pending('B')] })
  await flushPromises()
  await wrapper.vm.syncPendingSources()
  assert.deepEqual(writes, [['version', { policyFileVersionId: 'B', relationRole: 'SOURCE', citationLocation: '', citationText: '' }]])
  assert.deepEqual(wrapper.props('modelValue'), [])
  wrapper.unmount()
})
test('partial source save retains only failed pending entries for retry', async () => {
  let fail = true
  const active = []
  const { wrapper, writes } = create({ fetchPolicyReferences: async () => [...active], createPolicyReference: async (id, payload) => {
    if (payload.policyFileVersionId === 'B' && fail) throw new Error('服务暂不可用')
    writes.push(payload.policyFileVersionId); active.push({ ...payload, relationRole: 'SOURCE' })
  } }, { published: true, versionId: 'version', modelValue: [pending('A'), pending('B')] })
  await flushPromises()
  await assert.rejects(wrapper.vm.syncPendingSources(), /服务暂不可用/)
  assert.deepEqual(wrapper.props('modelValue').map(row => row.policyFileVersionId), ['B'])
  assert.match(wrapper.vm.error, /指标已发布/)
  fail = false
  await wrapper.vm.syncPendingSources()
  assert.deepEqual(writes, ['A', 'B'])
  assert.deepEqual(wrapper.props('modelValue'), [])
  wrapper.unmount()
})
test('stale policy versions and failed source reads block publication validation', async () => {
  const { wrapper } = create({ fetchPolicyVersion: async () => ({ publicationStatus: 'ARCHIVED' }) }, { modelValue: [pending('A')] })
  await flushPromises()
  await assert.rejects(wrapper.vm.validateSources(), /不可用/)
  wrapper.unmount()
  const failed = create({ fetchPolicyReferences: async () => { throw new Error('来源读取失败') } }, { versionId: 'version' })
  await flushPromises()
  await assert.rejects(failed.wrapper.vm.validateSources(), /来源读取失败/)
  failed.wrapper.unmount()
})
test('policy document number is read automatically without requiring basis text', async () => {
  const { wrapper } = create()
  wrapper.vm.options = [{ id: 'A', policyFileId: 'file', policyFileName: '真实政策', versionNo: '2026' }]
  await wrapper.vm.selectSources(['A'])
  await flushPromises()
  assert.equal(wrapper.props('modelValue')[0].documentNumber, '医发2026号')
  assert.equal(wrapper.props('modelValue')[0].citationText, '')
  wrapper.unmount()
})
test('two basis edits within the same render cycle are both retained', async () => {
  const { wrapper } = create({}, { modelValue: [pending('A')] })
  await flushPromises()
  const row = wrapper.props('modelValue')[0]
  wrapper.vm.edit(row, 'citationLocation', '第三章')
  wrapper.vm.edit(row, 'citationText', '引用原文')
  await flushPromises()
  assert.equal(wrapper.props('modelValue')[0].citationLocation, '第三章')
  assert.equal(wrapper.props('modelValue')[0].citationText, '引用原文')
  wrapper.unmount()
})
test('late metadata reads cannot resurrect a source already saved to the backend', async () => {
  let release
  const metadata = new Promise(resolve => { release = resolve })
  const { wrapper } = create({ fetchPolicy: () => metadata }, { versionId: 'version', published: true, modelValue: [pending('A')] })
  await vue.nextTick()
  await wrapper.vm.syncPendingSources()
  release({ policyFile: { documentNumber: '晚到的文号' } })
  await flushPromises()
  assert.deepEqual(wrapper.props('modelValue'), [])
  wrapper.unmount()
})
test('published indicators must retain at least one source', async () => {
  let invalidations = 0
  const row = { id: 'ref', relationRole: 'SOURCE', policyFileVersionId: 'A' }
  const { wrapper, messages } = create({ fetchPolicyReferences: async () => [row], invalidatePolicyReference: async () => { invalidations++ } }, { versionId: 'version', published: true })
  await flushPromises()
  await wrapper.vm.invalidate(row)
  assert.equal(invalidations, 0)
  assert.match(messages.at(-1), /至少需要保留一份/)
  wrapper.unmount()
})


test('removing a source confirms loss of optional basis and clears edits before reselecting', async () => {
  let cancel = true, confirmations = 0
  const { wrapper } = create({ ElMessageBox: { confirm: async () => { confirmations++; if (cancel) throw 'cancel' } } }, { modelValue: [pending('A')] })
  await flushPromises()
  wrapper.vm.edit(wrapper.props('modelValue')[0], 'citationText', '需要保留的依据')
  await flushPromises()
  await wrapper.vm.selectSources([])
  assert.equal(wrapper.props('modelValue')[0].citationText, '需要保留的依据')
  cancel = false
  await wrapper.vm.selectSources([])
  await flushPromises()
  assert.deepEqual(wrapper.props('modelValue'), [])
  wrapper.vm.options = [{ id: 'A', policyFileId: 'file', policyFileName: '政策A', versionNo: '1' }]
  await wrapper.vm.selectSources(['A'])
  await flushPromises()
  assert.equal(wrapper.props('modelValue')[0].citationText, '')
  assert.equal(confirmations, 2)
  wrapper.unmount()
})

test('confirmation from an old indicator version cannot remove a new version source', async () => {
  let confirm
  const { wrapper } = create({ ElMessageBox: { confirm: () => new Promise(resolve => { confirm = resolve }) } }, { versionId: 'old', modelValue: [{ ...pending('A'), citationText: '旧依据' }] })
  await flushPromises()
  const removing = wrapper.vm.selectSources([])
  await wrapper.setProps({ versionId: 'new', modelValue: [pending('B')] })
  confirm()
  await removing
  await flushPromises()
  assert.deepEqual(wrapper.props('modelValue').map(row => row.policyFileVersionId), ['B'])
  wrapper.unmount()
})


test('inline optional basis starts collapsed, edits both fields and publishes the exact source version', async () => {
  const { wrapper, writes } = create({}, { modelValue: [pending('A')] })
  await flushPromises()
  assert.equal(wrapper.get('.pending-source details').element.open, false)
  const fields = wrapper.findAllComponents(Input)
  fields[0].vm.$emit('update:modelValue', '第三章第二条')
  fields[1].vm.$emit('update:modelValue', '完整依据原文')
  await flushPromises()
  assert.match(wrapper.get('.pending-source summary').text(), /已补充依据/)
  await wrapper.setProps({ versionId: 'version', published: true })
  await flushPromises()
  await wrapper.vm.syncPendingSources()
  assert.deepEqual(writes, [['version', { policyFileVersionId: 'A', relationRole: 'SOURCE', citationLocation: '第三章第二条', citationText: '完整依据原文' }]])
  wrapper.unmount()
})

test('saved source and other legacy references retain read-only basis and copy source annotations to a new draft', async () => {
  const rows = [
    { id: 'source', relationRole: 'SOURCE', policyFileVersionId: 'A', policyFileName: '来源政策', citationLocation: '第一条', citationText: '已保存来源依据' },
    { id: 'basis', relationRole: 'BASIS', policyFileVersionId: 'B', policyFileName: '历史依据政策', citationLocation: '第二条', citationText: '历史补充依据' }
  ]
  const { wrapper } = create({ fetchPolicyReferences: async () => rows }, { versionId: 'version', published: true })
  await flushPromises()
  assert.equal(wrapper.findAll('.saved-source').length, 2)
  assert.match(wrapper.text(), /已保存来源依据/)
  assert.match(wrapper.text(), /历史补充依据/)
  assert.equal(wrapper.findAllComponents(Input).length, 0)
  const copied = wrapper.vm.copySourcesToDraft()
  assert.equal(copied[0].policyFileVersionId, 'A')
  assert.equal(copied[0].citationText, '已保存来源依据')
  assert.equal(copied[0].citationLocation, '第一条')
  wrapper.unmount()
})
