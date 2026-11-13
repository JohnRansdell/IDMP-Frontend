import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { resolveAccessGrant } from '../src/idmp/auth/accessPolicy.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { useCatalogQuery } = await import('../src/idmp/features/catalog/useCatalogQuery.js')
const source = await readFile(new URL('../src/idmp/views/PolicyFileManagement.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ openDetail, removeRelation, relationVersionId, relations, removingRelationId })\n</script>'))
const compiled = compileScript(descriptor, { id: 'policy-file-relations-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, specifiers]) => specifiers.split(',').map(specifier => {
    const [imported, local = imported] = specifier.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled'], emits: ['click'], setup: (props, { slots, emit }) => () => vue.h('button', { disabled: props.disabled, onClick: () => emit('click') }, slots.default?.()) })
const Table = vue.defineComponent({ props: ['data'], setup: (props, { slots }) => { vue.provide('rows', vue.computed(() => props.data)); return () => vue.h('div', slots.default?.()) } })
const Column = vue.defineComponent({ setup: (_, { slots }) => { const rows = vue.inject('rows'); return () => vue.h('div', (rows?.value || []).map(row => slots.default?.({ row }))) } })
const relation = { id: '102027642463697111', sourceVersionId: '1', targetVersionId: '2', resourceVersion: 3, relationType: 'REPLACES' }
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

async function create(overrides = {}, confirm = async () => {}, allowed = true) {
  const calls = [], messages = [], confirmations = []
  let rows = [relation]
  const api = {
    fetchPolicies: async () => ({ records: [], total: 0 }),
    fetchPolicyUploadOptions: async () => ({ extensions: ['txt'], maxBytes: 100 }),
    fetchPolicy: async id => ({ policyFile: { id, name: '医疗质量管理办法' }, versions: [{ id: '1', versionNo: 'V2' }] }),
    fetchPolicyVersion: async id => ({ policyFileId: 'file', versionNo: id === '1' ? 'V2' : 'V1' }),
    fetchPolicyRelations: async id => { calls.push(['list', id]); return rows },
    removePolicyRelation: async (id, version) => { calls.push(['remove', id, version]); rows = [] },
    ...overrides,
  }
  const dependencies = {
    api, useCatalogQuery, useRoute: () => ({ query: {} }),
    ElMessage: Object.fromEntries(['success', 'error', 'warning'].map(type => [type, text => messages.push([type, text])])),
    ElMessageBox: { confirm: async (...args) => { confirmations.push(args); return confirm(...args) } },
    PageHeader: Pass, StatusBadge: Pass, PolicyFileViewer: Pass, PolicyVersionPicker: Pass,
    ...Object.fromEntries(['CircleCheckFilled', 'Document', 'Search', 'Refresh', 'Upload', 'UploadFilled', 'WarningFilled'].map(name => [name, Pass])),
  }
  const Component = Function('vue', 'deps', `const { ${Object.keys(dependencies).join(', ')} } = deps;\n${bindings}\n${code}`)(vue, dependencies)
  const wrapper = mount(Component, { global: {
    components: Object.fromEntries(['ElAlert', 'ElInput', 'ElSelect', 'ElOption', 'ElPagination', 'ElDialog', 'ElDrawer', 'ElForm', 'ElFormItem', 'ElDescriptions', 'ElDescriptionsItem', 'ElIcon', 'ElProgress', 'ElDatePicker'].map(name => [name, Pass]).concat([['ElButton', Button], ['ElTable', Table], ['ElTableColumn', Column]])),
    directives: { loading: {}, queryEnter: {}, access: { mounted(el, binding) { if (binding.value?.action === 'policyRelation.remove' && !allowed) el.remove() } } },
  } })
  await flushPromises()
  await wrapper.vm.openDetail({ id: 'file' })
  await flushPromises()
  return { wrapper, calls, messages, confirmations }
}

test('解除按钮确认文件和方向，提交关系版本号后从后端重查', async () => {
  const { wrapper, calls, messages, confirmations } = await create()
  await wrapper.findAll('button').find(button => button.text() === '解除关联').trigger('click')
  await flushPromises()
  assert.deepEqual(calls, [['list', '1'], ['remove', relation.id, 3], ['list', '1']])
  assert.match(confirmations[0][0], /V2.*V1.*替代.*文件、版本及附件将保留/)
  assert.deepEqual(wrapper.vm.relations, [])
  assert.deepEqual(messages, [['success', '政策文件关系已解除']])
  wrapper.unmount()
})

test('取消确认不会发送解除请求', async () => {
  const { wrapper, calls, messages } = await create({}, async () => { throw 'cancel' })
  await wrapper.vm.removeRelation(wrapper.vm.relations[0])
  assert.deepEqual(calls, [['list', '1']])
  assert.deepEqual(messages, [])
  assert.equal(wrapper.vm.removingRelationId, '')
  wrapper.unmount()
})

test('确认及提交期间阻止重复解除', async () => {
  const pending = defer()
  const { wrapper, calls } = await create({}, () => pending.promise)
  const row = wrapper.vm.relations[0]
  const remove = wrapper.vm.removeRelation(row)
  await wrapper.vm.removeRelation(row)
  assert.equal(wrapper.vm.removingRelationId, relation.id)
  pending.resolve()
  await remove
  assert.equal(calls.filter(call => call[0] === 'remove').length, 1)
  wrapper.unmount()
})

test('后端冲突原样展示，保留原关系并允许重试', async () => {
  const { wrapper, messages } = await create({ removePolicyRelation: async () => { throw new Error('政策文件关系已被修改，请刷新后重试') } })
  await wrapper.vm.removeRelation(wrapper.vm.relations[0])
  assert.equal(wrapper.vm.relations.length, 1)
  assert.deepEqual(messages, [['error', '政策文件关系已被修改，请刷新后重试']])
  assert.equal(wrapper.vm.removingRelationId, '')
  wrapper.unmount()
})

test('确认期间切换政策版本不会提交旧操作', async () => {
  const pending = defer()
  const { wrapper, calls, messages } = await create({}, () => pending.promise)
  const remove = wrapper.vm.removeRelation(wrapper.vm.relations[0])
  wrapper.vm.relationVersionId = 'other'
  pending.resolve()
  await remove
  assert.deepEqual(calls, [['list', '1']])
  assert.deepEqual(messages, [])
  wrapper.unmount()
})

test('提交后切换文件，迟到响应不会刷新或提示当前文件', async () => {
  const pending = defer()
  const { wrapper, messages, calls } = await create({ removePolicyRelation: () => pending.promise })
  const remove = wrapper.vm.removeRelation(wrapper.vm.relations[0])
  await flushPromises()
  await wrapper.vm.openDetail({ id: 'other-file' })
  const reads = calls.length
  pending.resolve()
  await remove
  assert.equal(calls.length, reads)
  assert.deepEqual(messages, [])
  wrapper.unmount()
})

test('离开页面后确认完成不会发送请求', async () => {
  const pending = defer()
  const { wrapper, calls } = await create({}, () => pending.promise)
  const remove = wrapper.vm.removeRelation(wrapper.vm.relations[0])
  wrapper.unmount()
  pending.resolve()
  await remove
  assert.deepEqual(calls, [['list', '1']])
})

test('解除操作遵循独立 API 权限，没有权限时隐藏按钮', async () => {
  assert.deepEqual(resolveAccessGrant({ action: 'policyRelation.remove', resourceId: relation.id }), ['DELETE', `/meta/policy-file-relations/${relation.id}`])
  const { wrapper } = await create({}, async () => {}, false)
  assert.equal(wrapper.findAll('button').some(button => button.text() === '解除关联'), false)
  wrapper.unmount()
})
