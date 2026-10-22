import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { computed, shallowRef, isReactive } from 'vue'
import { dashboardFilterCatalog, deriveDependentFilterOptions } from '../src/idmp/features/dashboard/queryAdapter.js'

const dashboard = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
const between = (start, end) => dashboard.slice(dashboard.indexOf(start), dashboard.indexOf(end, dashboard.indexOf(start)))

test('refreshing the published source catalog loads metadata without hydrating indicator analysis', async () => {
  const catalogIndicatorSources = shallowRef([{ code: 'same', indicatorVersionId: 'v1' }, { code: 'updated', indicatorVersionId: 'old' }])
  const remoteFieldCatalog = shallowRef({ same: ['cached'], updated: ['stale'] })
  const remoteSourcePeriodOptions = shallowRef({ same: ['2026-03'], updated: ['2026-02'] })
  const selectedDataCode = shallowRef('same'), indicatorCatalogLoading = shallowRef(false), indicatorCatalogError = shallowRef('')
  const sources = [{ code: 'same', indicatorVersionId: 'v1' }, { code: 'updated', indicatorVersionId: 'new' }]
  let catalogCalls = 0
  const dependencies = { catalogIndicatorSources, remoteFieldCatalog, remoteSourcePeriodOptions, selectedDataCode, indicatorCatalogLoading, indicatorCatalogError,
    fetchDashboardDataSources: async () => { catalogCalls++; return sources }, fetchCompleteIndicatorCatalog: async () => [],
    currentPublishedDashboardDataSources: value => value, sortDashboardDataSourcesByIndicatorCreatedAt: value => value, dashboardDataSourceToFrontend: value => value }
  const load = Function(...Object.keys(dependencies), `let indicatorCatalogRequest = null; ${between('async function loadPublishedIndicatorCatalog()', 'async function ensureRemoteDataSourceFields(')}; return loadPublishedIndicatorCatalog`)(...Object.values(dependencies))
  assert.deepEqual(await Promise.all([load(), load()]), [true, true])
  assert.equal(catalogCalls, 1)
  assert.equal(indicatorCatalogLoading.value, false)
  assert.equal(indicatorCatalogError.value, '')
  assert.deepEqual(catalogIndicatorSources.value, sources)
  assert.deepEqual(remoteFieldCatalog.value, { same: ['cached'] })
  assert.deepEqual(remoteSourcePeriodOptions.value, { same: ['2026-03'] })
  assert.equal(selectedDataCode.value, 'same')
})

test('formal sources never enter local analysis dataset construction or deep row watchers', () => {
  const formal = { code: 'formal', origin: 'dashboard-data-source', indicatorVersionId: 'v1',
    get analysisComparisonRows() { assert.fail('the viewer must not scan full analysis rows') } }
  const legacy = { code: 'legacy', origin: 'indicator-catalog', analysisComparisonRows: [{ value: 1 }] }
  const availableIndicatorSources = shallowRef([formal, legacy]), dashboardQueryResult = shallowRef(null)
  const calls = []
  const createWidgetBindingDatasets = source => { calls.push(source.code); return source.analysisComparisonRows }
  const datasets = Function('computed', 'availableIndicatorSources', 'dashboardQueryResult', 'createWidgetBindingDatasets',
    `${between('const bindingDatasets = computed(', 'function getBindingDatasets(')}; return bindingDatasets`)(computed, availableIndicatorSources, dashboardQueryResult, createWidgetBindingDatasets)
  assert.deepEqual([...datasets.value.keys()], ['legacy'])
  assert.deepEqual(calls, ['legacy'])
  const key = Function('computed', 'availableIndicatorSources',
    `${between('const filterSourceCatalogKey = computed(', 'watch([globalFilterDefinitions, period,')}; return filterSourceCatalogKey`)(computed, availableIndicatorSources)
  const before = key.value
  availableIndicatorSources.value = [formal, { ...legacy, analysisComparisonRows: [{ value: 9 }] }]
  assert.equal(key.value, before)
  availableIndicatorSources.value = [{ code: formal.code, origin: formal.origin, indicatorVersionId: 'v2' }]
  assert.notEqual(key.value, before)
  assert.ok(!dashboard.includes('JSON.stringify(availableIndicatorSources.value)'))
  for (const name of ['indicatorDataSources', 'catalogIndicatorSources', 'dashboardQueryResult']) {
    const declaration = dashboard.match(new RegExp(`const ${name} = shallowRef\\([^\\n]+`))?.[0]
    assert.ok(declaration, `${name} must keep result rows out of deep reactivity`)
    const state = Function('shallowRef', `${declaration}; return ${name}`)(shallowRef)
    state.value = [{ rows: [{ value: 1 }] }]
    assert.equal(isReactive(state.value[0].rows[0]), false)
  }
})

test('period refresh hydrates only legacy sources; formal previews use widget queries', async () => {
  const sources = [{ code: 'formal', origin: 'dashboard-data-source' }, { code: 'legacy', origin: 'indicator-catalog' }]
  const hydrated = []
  const dependencies = { isEditing: shallowRef(false), dashboardSchema: shallowRef({ widgets: sources.map(source => ({ sourceCode: source.code })) }),
    editingDashboardSchema: shallowRef(null), catalogIndicatorSources: shallowRef(sources), metricGroupSourceCodes: () => [],
    schemaPublishedIndicatorSourceCodes: () => [], hydrateIndicatorSource: async source => { hydrated.push(source.code) } }
  const refresh = Function(...Object.keys(dependencies), `${between('async function refreshSchemaPublishedIndicatorSources()', 'let dashboardSwitchPromise')}; return refreshSchemaPublishedIndicatorSources`)(...Object.values(dependencies))
  await refresh()
  assert.deepEqual(hydrated, ['legacy'])
})

test('filter catalogs and dependent options preserve order, scalar identity and conflicts with large duplicate datasets', () => {
  const values = [false, 0, '0', true, 'a', '', null, undefined, NaN, Infinity, {}, ...Array.from({ length: 10000 }, (_, i) => `D${i}`)]
  const rows = values.map(member => ({ member }))
  const field = { id: 'member', label: 'Member', dataType: 'string', filterable: true }
  const dataset = { fields: [field], rows }
  const expected = [false, 0, '0', true, 'a', ...values.slice(11)]
  const catalog = dashboardFilterCatalog([dataset, dataset])
  assert.deepEqual(catalog[0].options, expected)
  assert.deepEqual(Object.keys(catalog[0]), [...Object.keys(field), 'options'])
  const definition = { id: 'member', field: 'member', dataType: 'string' }
  assert.deepEqual(deriveDependentFilterOptions([dataset, dataset], [definition]).get('member'), expected)
  assert.deepEqual(dashboardFilterCatalog([dataset, { fields: [{ ...field, dataType: 'number' }], rows: [] }]), [])
  assert.deepEqual(dashboardFilterCatalog([{ fields: [field], rows: [] }])[0].options, [])
})
