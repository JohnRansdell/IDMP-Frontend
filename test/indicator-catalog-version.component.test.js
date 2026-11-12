import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { shallowMount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/IndicatorManagement.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ backendIndicatorRows, openAnalysis, canOpenAnalysis })\n</script>'))
const compiled = compileScript(descriptor, { id: 'indicator-catalog-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local}=vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^[ \t]*import .*$/gm, '').replace('export default', 'return')
const indicator = (id, extra = {}) => ({ id, code: `指标_${id}`, name: '住院死亡率', status: 'PUBLISHED', ...extra })
const version = (indicatorId, versionNo, extra = {}) => ({ id: `${indicatorId}_${versionNo}`, indicatorId,
  indicatorCode: `指标_${indicatorId}`, versionNo, status: 'PUBLISHED', ...extra })

async function catalog(indicators, versions) {
  const navigations = []
  const deps = {
    useRouter: () => ({ push: route => navigations.push(route) }),
    fetchAllIndicators: async () => indicators, fetchAllIndicatorVersions: async () => versions,
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
  return { wrapper, navigations }
}

test('catalog chooses the highest published version in any response order and navigates to that exact version', async () => {
  const versions = [version('1', 10), version('1', 2), version('1', 1)]
  for (const ordered of [versions, [...versions].reverse(), [versions[1], versions[0], versions[2]]]) {
    const { wrapper, navigations } = await catalog([indicator('1')], ordered)
    const row = wrapper.vm.backendIndicatorRows[0]
    assert.equal(row.version, 'V10')
    wrapper.vm.openAnalysis(row)
    assert.deepEqual(navigations, [{ name: 'IndicatorAnalysis', query: {
      indicator: '1', indicatorVersionId: '1_10', indicatorName: '住院死亡率'
    } }])
    wrapper.unmount()
  }
})

test('draft versions never replace published versions; draft-only resources have no analysis entry', async () => {
  const { wrapper, navigations } = await catalog([
    indicator('1'), indicator('2', { status: 'DRAFT', version: 99, latestVersionId: 'draft' })
  ], [version('1', 2), version('1', 3, { status: 'DRAFT' }), version('2', 4, { status: 'DRAFT' })])
  const [published, draft] = wrapper.vm.backendIndicatorRows
  assert.equal(published.version, 'V2')
  assert.equal(published.versionId, '1_2')
  assert.equal(draft.version, '未发布')
  assert.equal(draft.versionId, '')
  assert.equal(wrapper.vm.canOpenAnalysis(draft), false)
  wrapper.vm.openAnalysis(draft)
  assert.deepEqual(navigations, [])
  wrapper.unmount()
})

test('catalog keeps master metadata and separates same-name indicators by identity without exposing orphan versions', async () => {
  const { wrapper } = await catalog([
    indicator('1', { category: '医疗质量', description: '当前说明', scenarioCount: 3 }),
    indicator('2', { code: '另一个指标', status: 'DISABLED' })
  ], [version('1', 2, { indicatorName: '旧名称', category: '旧分类', scenarioCount: 0 }),
    version('2', 7, { indicatorCode: '另一个指标' }), version('3', 1)])
  const [first, second] = wrapper.vm.backendIndicatorRows
  assert.equal(wrapper.vm.backendIndicatorRows.length, 2)
  assert.equal(first.name, '住院死亡率')
  assert.equal(first.category, '医疗质量')
  assert.equal(first.description, '当前说明')
  assert.equal(first.scenes, 3)
  assert.equal(first.version, 'V2')
  assert.equal(second.version, 'V7')
  assert.equal(wrapper.vm.canOpenAnalysis(second), false)
  wrapper.unmount()
})
