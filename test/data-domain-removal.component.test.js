import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapter from '../src/idmp/api/adapters/meta.js'
import { toUserMessage } from '../src/idmp/utils/userMessage.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { shallowMount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/DataDomainWorkspace.vue', import.meta.url), 'utf8')
const exposed = 'confirmRemoveTable, selectTable, selectedTableName, sourceFields, mappedFields, physicalTables, fieldError, fieldLoading, removingId, removalError, mappingDialogVisible, valueSetDialogVisible, profileDialogVisible, availableSourceTables, loadSourceTables'
const { descriptor } = parse(source.replace('</script>', `defineExpose({ ${exposed} })\n</script>`))
const compiled = compileScript(descriptor, { id: 'domain-removal', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => { const [original, local = original] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${original};` })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const stubs = Object.fromEntries([...source.matchAll(/<(el-[a-z-]+)/g)].map(([, name]) => [name, true]))
const tables = [{ id: '10', tableName: 'vmq_visits', status: 'PUBLISHED' }, { id: '20', tableName: 'vmq_surgery', status: 'PUBLISHED' }]

async function create(overrides = {}) {
  const calls = { remove: [], error: [], success: [] }
  const deps = Object.fromEntries([...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)].flatMap(([, names, name]) => (names ? names.split(',').map(x => x.trim()) : [name]).map(name => [name, () => []])))
  Object.assign(deps, adapter, { toUserMessage,
    useRoute: () => ({ params: { id: '1' } }), useRouter: () => ({ push() {} }),
    ElMessageBox: { confirm: async () => {} }, ElMessage: { error: msg => calls.error.push(msg), success: msg => calls.success.push(msg), warning() {} },
    fetchDataDomains: async () => [{ id: '1', name: '医疗质量' }], fetchPhysicalTables: async () => tables,
    fetchSourceTables: async () => tables, fetchSourceTableFields: async () => [], fetchPhysicalTableFields: async () => [],
    removePhysicalTable: async (...args) => { calls.remove.push(args) }, defaultTimeFieldOptions: () => [], applySemanticFieldDetails: rows => rows,
    ...overrides
  })
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).filter(name => !['computed', 'onMounted', 'reactive', 'ref', 'watch'].includes(name)).join(',')} } = deps;\n${bindings}\n${body}`)(vue, deps)
  const wrapper = shallowMount(component, { global: { directives: { access: {} }, stubs } })
  await flushPromises()
  return { wrapper, calls }
}

test('取消确认不会移除，失败时保留选中表并显示后端引用原因', async () => {
  const cancelled = await create({ ElMessageBox: { confirm: async () => { throw new Error('cancel') } } })
  await cancelled.wrapper.vm.confirmRemoveTable(tables[0])
  assert.deepEqual(cancelled.calls.remove, [])
  assert.equal(cancelled.wrapper.vm.removingId, '')
  cancelled.wrapper.unmount()
  const reason = '无法移除物理表，请先调整以下引用：物理表关联：医疗质量 / vmq_visits（出院科室） 与 医疗质量 / vmq_departments（科室编码）。调整后可重新移除。'
  const { wrapper, calls } = await create({ removePhysicalTable: async () => { throw new Error(reason) } })
  wrapper.vm.selectTable(tables[0])
  await flushPromises()
  await wrapper.vm.confirmRemoveTable(tables[0])
  assert.equal(wrapper.vm.selectedTableName, 'vmq_visits')
  assert.equal(wrapper.vm.physicalTables.length, 2)
  assert.equal(wrapper.vm.removalError, reason)
  assert.deepEqual(calls.error, [])
  wrapper.unmount()
})

test('旧服务返回自动编码时不泄露编码，下一次成功移除后清空引用提示', async () => {
  let attempt = 0
  const { wrapper } = await create({ removePhysicalTable: async () => {
    if (++attempt === 1) throw new Error('物理表仍被引用：RELATION_AB9397B70C4643528E0166625755A7F4，请调整关联后重试')
  } })
  await wrapper.vm.confirmRemoveTable(tables[0])
  assert.doesNotMatch(wrapper.vm.removalError, /RELATION_|AB9397/)
  assert.match(wrapper.vm.removalError, /仍被引用.*调整关联后重试/)
  await wrapper.vm.confirmRemoveTable(tables[0])
  assert.equal(wrapper.vm.removalError, '')
  wrapper.unmount()
})

test('移除成功清空字段与弹窗，忽略迟到的字段结果，并可重新接入', async () => {
  let resolveFields
  let reads = 0
  const { wrapper, calls } = await create({
    fetchPhysicalTables: async () => ++reads === 1 ? tables : [tables[1]],
    fetchSourceTableFields: () => new Promise(resolve => { resolveFields = resolve })
  })
  wrapper.vm.selectTable(tables[0])
  wrapper.vm.mappingDialogVisible = true
  wrapper.vm.valueSetDialogVisible = true
  wrapper.vm.profileDialogVisible = true
  await wrapper.vm.confirmRemoveTable(tables[0])
  assert.deepEqual(calls.remove, [['1', '10']])
  assert.equal(wrapper.vm.selectedTableName, '')
  assert.equal(wrapper.vm.fieldLoading, false)
  assert.equal(wrapper.vm.mappingDialogVisible, false)
  assert.equal(wrapper.vm.valueSetDialogVisible, false)
  assert.equal(wrapper.vm.profileDialogVisible, false)
  resolveFields([{ columnName: 'out_date' }])
  await flushPromises()
  assert.deepEqual(wrapper.vm.sourceFields, [])
  assert.deepEqual(wrapper.vm.mappedFields, [])
  await wrapper.vm.loadSourceTables()
  assert.deepEqual(wrapper.vm.availableSourceTables.map(table => table.tableName), ['vmq_visits'])
  wrapper.unmount()
})

test('移除其他表保留当前选择，重复点击只提交一次', async () => {
  let resolveRemove
  let count = 0
  const { wrapper } = await create({ removePhysicalTable: () => { count++; return new Promise(resolve => { resolveRemove = resolve }) } })
  wrapper.vm.selectTable(tables[1])
  await flushPromises()
  const pending = wrapper.vm.confirmRemoveTable(tables[0])
  await flushPromises()
  await wrapper.vm.confirmRemoveTable(tables[0])
  assert.equal(count, 1)
  resolveRemove()
  await pending
  assert.equal(wrapper.vm.selectedTableName, 'vmq_surgery')
  wrapper.unmount()
})
