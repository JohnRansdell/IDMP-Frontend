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
async function create(type, read) {
  const source = await readFile(new URL('../src/idmp/views/ResourceRecycleBin.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source.replace('</script>', 'defineExpose({ page, size, filters, records, total, load, applyFilters, restore, loading })\n</script>'))
  const compiled = compileScript(descriptor, { id: 'recycle', inlineTemplate: true }).content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
  const calls = [], writes = [], errors = []
  const list = async body => { calls.push({ ...body }); return read(body) }
  const restore = async (...args) => writes.push(args)
  const deps = {
    useRoute: () => ({ meta: { resourceType: type } }), useRouter: () => ({ back() {} }), PageHeader: Pass,
    getStatusLabel: value => value, formatApiError: error => error.message,
    ElMessage: { success() {}, error: message => errors.push(message) }, ElMessageBox: { confirm: async () => {} },
    fetchFactorRecycleBin: list, fetchIndicatorRecycleBin: list, fetchFactorRecycleDetail: async () => ({}), fetchIndicatorRecycleDetail: async () => ({}),
    restoreFactor: restore, restoreIndicator: restore
  }
  const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps; ${bindings}\n${code}`)(vue, deps)
  const components = Object.fromEntries(['ElButton', 'ElTable', 'ElTableColumn', 'ElForm', 'ElFormItem', 'ElInput', 'ElPagination', 'ElDrawer', 'ElDescriptions', 'ElDescriptionsItem'].map(key => [key, Pass]))
  components.ElTableColumn = vue.defineComponent({ setup: () => () => vue.h('span') })
  const wrapper = mount(Component, { global: { components, directives: { queryEnter() {}, loading() {} } } })
  await flushPromises()
  return { wrapper, calls, writes, errors }
}

for (const type of ['FACTOR', 'INDICATOR']) {
  test(`${type} recycle search and page-size changes start from page one`, async () => {
    const { wrapper, calls } = await create(type, () => ({ records: [], total: 80 }))
    wrapper.vm.page = 3; wrapper.vm.filters.name = '老年患者费用'; await wrapper.vm.applyFilters()
    assert.equal(calls.at(-1).page, 1); assert.equal(calls.at(-1).name, '老年患者费用')
    wrapper.vm.page = 3; wrapper.vm.size = 50; await wrapper.vm.applyFilters()
    assert.equal(calls.at(-1).page, 1); assert.equal(calls.at(-1).size, 50)
    wrapper.unmount()
  })
  test(`${type} restoring the last record reloads the remaining last page`, async () => {
    const { wrapper, calls, writes } = await create(type, ({ page }) => ({ records: page === 1 ? [{ resourceId: '11' }] : [], total: 20 }))
    wrapper.vm.page = 2
    await wrapper.vm.restore({ resourceId: '12', resourceName: '老年患者费用', resourceVersion: 5 })
    assert.deepEqual(writes, [['12', 5]])
    assert.deepEqual(calls.slice(-2).map(c => c.page), [2, 1])
    assert.equal(wrapper.vm.page, 1); assert.deepEqual(wrapper.vm.records, [{ resourceId: '11' }])
    assert.equal(wrapper.vm.loading, false)
    wrapper.unmount()
  })
}

test('late previous search cannot replace current recycle records or loading state', async () => {
  let finish
  const { wrapper } = await create('INDICATOR', ({ name }) => name === '旧条件' ? new Promise(resolve => { finish = resolve }) : { records: [{ resourceName: name }], total: 1 })
  wrapper.vm.filters.name = '旧条件'; const old = wrapper.vm.applyFilters()
  wrapper.vm.filters.name = '新条件'; await wrapper.vm.applyFilters()
  finish({ records: [{ resourceName: '旧条件' }], total: 99 }); await old
  assert.deepEqual(wrapper.vm.records, [{ resourceName: '新条件' }]); assert.equal(wrapper.vm.total, 1)
  assert.equal(wrapper.vm.loading, false)
  wrapper.unmount()
})
