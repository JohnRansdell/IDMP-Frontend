import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { shallowMount, flushPromises } = await import('@vue/test-utils')
const { createRequestScope } = await import('../src/idmp/features/analysis/useLatestResult.js')
const source = await readFile(new URL('../src/idmp/views/IndicatorManagement.vue', import.meta.url), 'utf8')
const exposed = 'backendIndicatorRows, openAnalysis, canOpenAnalysis, filters, applyFilters, resetFilters, currentPage, pageSize, total, categories, loadError, tableLoading, viewMode, loadBackendIndicators'
const { descriptor } = parse(source.replace('</script>', `defineExpose({ ${exposed} })\n</script>`))
const compiled = compileScript(descriptor, { id: 'indicator-catalog-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local}=vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^[ \t]*import .*$/gm, '').replace('export default', 'return')
const indicator = (id, extra = {}) => ({ id, code: `指标_${id}`, name: '住院死亡率', status: 'PUBLISHED', ...extra })
const page = (records, total = records.length) => ({ records, total, pageNum: 1, pageSize: 9 })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

async function catalog(records = [], { fetch, categories = async () => ['医疗质量', '运营效率'] } = {}) {
  const navigations = [], requests = []
  const deps = {
    useRouter: () => ({ push: route => navigations.push(route) }), createRequestScope,
    fetchIndicators: (params, options) => { requests.push({ params, options }); return fetch ? fetch(params, options) : Promise.resolve(page(records)) },
    fetchIndicatorCategories: categories,
    deleteIndicator() {}, fetchIndicatorDeletionImpact() {}, getStatusLabel: value => value,
    ...Object.fromEntries(['Grid', 'Menu', 'Plus', 'RefreshLeft', 'Search', 'Upload'].map(name => [name, {}])),
    ...Object.fromEntries(['PageHeader', 'StatePanel', 'StatusBadge', 'ResourceDeleteDialog'].map(name => [name, vue.defineComponent({ render: () => null })]))
  }
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} }=deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = shallowMount(component, { global: {
    stubs: Object.fromEntries(['ElButton', 'ElButtonGroup', 'ElInput', 'ElFormItem', 'ElOption', 'ElSelect',
      'ElForm', 'ElTableColumn', 'ElTooltip', 'ElTable', 'ElPagination'].map(name => [name, true])),
    directives: { access() {}, loading() {}, queryEnter() {} }
  } })
  await flushPromises()
  return { wrapper, navigations, requests }
}

test('catalog uses the published version returned for each current-page indicator and navigates to that exact version', async () => {
  const { wrapper, navigations, requests } = await catalog([
    indicator('1', { latestPublishedVersionId: '1_10', latestPublishedVersionNo: 10, scenarioCount: 3, category: '医疗质量' }),
    indicator('2', { status: 'DRAFT' }),
    indicator('3', { status: 'DISABLED', latestPublishedVersionId: '3_7', latestPublishedVersionNo: 7 })
  ])
  const [published, draft, disabled] = wrapper.vm.backendIndicatorRows
  assert.equal(requests.length, 1)
  assert.equal(published.version, 'V10')
  assert.equal(published.scenes, 3)
  assert.equal(published.category, '医疗质量')
  assert.equal(draft.version, '未发布')
  assert.equal(wrapper.vm.canOpenAnalysis(draft), false)
  assert.equal(wrapper.vm.canOpenAnalysis(disabled), false)
  wrapper.vm.openAnalysis(published)
  wrapper.vm.openAnalysis(draft)
  assert.deepEqual(navigations, [{ name: 'IndicatorAnalysis', query: {
    indicator: '1', indicatorVersionId: '1_10', indicatorName: '住院死亡率'
  } }])
  wrapper.unmount()
})

test('submits raw keywords and all filters to backend, preserves its ranking and total without local substring filtering', async () => {
  const { wrapper, requests } = await catalog([], { fetch: async () => page([
    indicator('3', { name: '手术患者中的死亡率' }), indicator('1', { name: '死亡病例手术占比' })
  ], 27) })
  Object.assign(wrapper.vm.filters, { name: ' 死亡手术 ', category: '医疗质量', status: 'PUBLISHED', attribute: '定量', direction: '↑逐步提高' })
  wrapper.vm.applyFilters()
  await flushPromises()
  assert.deepEqual(requests.at(-1).params, { keyword: ' 死亡手术 ', category: '医疗质量', status: 'PUBLISHED', attribute: '定量', direction: '↑逐步提高', page: 1, size: 9 })
  assert.deepEqual(wrapper.vm.backendIndicatorRows.map(row => row.id), ['3', '1'])
  assert.equal(wrapper.vm.total, 27)
  assert.deepEqual(wrapper.vm.categories, ['医疗质量', '运营效率'])
  wrapper.vm.currentPage = 2
  await flushPromises()
  assert.equal(requests.at(-1).params.page, 2)
  assert.equal(requests.at(-1).params.keyword, ' 死亡手术 ')
  wrapper.vm.filters.name = '未提交的修改'
  wrapper.vm.currentPage = 3
  await flushPromises()
  assert.equal(requests.at(-1).params.keyword, ' 死亡手术 ')
  wrapper.vm.pageSize = 12
  await flushPromises()
  assert.equal(requests.at(-1).params.page, 1)
  assert.equal(requests.at(-1).params.size, 12)
  const count = requests.length
  wrapper.vm.viewMode = 'card'
  await flushPromises()
  assert.equal(requests.length, count)
  wrapper.vm.resetFilters()
  await flushPromises()
  assert.equal(requests.at(-1).params.keyword, '')
  assert.equal(requests.at(-1).params.category, '')
  wrapper.unmount()
})

test('cancels older searches and ignores stale replies even when transport ignores abort', async () => {
  const old = deferred(), recent = deferred()
  const { wrapper, requests } = await catalog([], { fetch: params => params.keyword === '旧查询' ? old.promise : params.keyword === '新查询' ? recent.promise : Promise.resolve(page([])) })
  wrapper.vm.filters.name = '旧查询'
  wrapper.vm.applyFilters()
  wrapper.vm.filters.name = '新查询'
  wrapper.vm.applyFilters()
  assert.equal(requests.at(-2).options.signal.aborted, true)
  recent.resolve(page([indicator('2')], 10))
  await flushPromises()
  old.resolve(page([indicator('1')], 999))
  await flushPromises()
  assert.equal(wrapper.vm.total, 10)
  assert.equal(wrapper.vm.backendIndicatorRows[0].id, '2')
  assert.equal(wrapper.vm.tableLoading, false)
  wrapper.unmount()
  assert.equal(requests.at(-1).options.signal.aborted, true)
})

test('shows query errors and recovers after retry; category option failure does not hide results', async () => {
  let fail = true
  const { wrapper } = await catalog([], { categories: async () => { throw new Error('分类加载失败') }, fetch: async () => {
    if (fail) throw new Error('搜索关键词过多，请缩小查询范围')
    return page([indicator('1')])
  } })
  assert.equal(wrapper.vm.loadError, '搜索关键词过多，请缩小查询范围')
  assert.equal(wrapper.vm.total, 0)
  fail = false
  await wrapper.vm.loadBackendIndicators()
  assert.equal(wrapper.vm.loadError, '')
  assert.equal(wrapper.vm.backendIndicatorRows.length, 1)
  wrapper.unmount()
})

test('keeps the result surface mounted while the next search is pending', async () => {
  const next = deferred()
  const { wrapper } = await catalog([], { fetch: params => params.keyword ? next.promise : Promise.resolve(page([indicator('1')])) })
  wrapper.vm.filters.name = '手术死亡'
  wrapper.vm.applyFilters()
  await vue.nextTick()
  assert.equal(wrapper.vm.tableLoading, true)
  assert.equal(wrapper.find('.table-card').exists(), true)
  assert.equal(wrapper.vm.backendIndicatorRows[0].id, '1')
  next.resolve(page([indicator('2')]))
  await flushPromises()
  assert.equal(wrapper.find('.table-card').exists(), true)
  assert.equal(wrapper.vm.backendIndicatorRows[0].id, '2')
  wrapper.unmount()
})

test('returns to a valid page when deleting the last record on a page', async () => {
  const { wrapper, requests } = await catalog([], { fetch: async params => params.page === 1 ? page([indicator('1')], 9) : page([], 9) })
  wrapper.vm.currentPage = 2
  await flushPromises()
  assert.equal(wrapper.vm.currentPage, 1)
  assert.equal(requests.at(-1).params.page, 1)
  assert.equal(wrapper.vm.total, 9)
  wrapper.unmount()
})
