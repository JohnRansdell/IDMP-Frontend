import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { canonicalDrillRootResultId } from '../src/idmp/api/adapters/drill.js'
import { formatResultNumber, formatResultValue } from '../src/idmp/features/shared/resultPresentation.js'
import { assertDrillResponseContext, buildDrillRequest, drillMemberField, nextDrillNavigation } from '../src/idmp/features/analysis/drillContext.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { createRequestScope } = await import('../src/idmp/features/analysis/useLatestResult.js')
const { isDepartmentLevel, namedDrillRecord } = await import('../src/idmp/features/dashboard/dimensionNames.js')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/features/analysis/DrillExplorer.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'drill-explorer-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Select = vue.defineComponent({ props: ['modelValue'], emits: ['update:modelValue'],
  setup: (props, { slots }) => () => vue.h('div', { 'data-path': props.modelValue }, slots.default?.()) })
const Button = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('button', slots.default?.()) })

function create(fetchResultFactors = async () => ({ context: {}, factors: [] }), props = {}, drillResponse = {}, interactive = false) {
  const requests = []
  const component = Function('vue', 'deps', `const { createRequestScope, useRoute, useRouter, StatePanel, FactorTraceTree, searchResultDrill, fetchResultFactors, limitDrillNextLevels, isStatusRecord, getStatusLabel, fetchDepartmentNames, isDepartmentLevel, namedDrillRecord, canonicalDrillRootResultId, assertDrillResponseContext, buildDrillRequest, drillMemberField, nextDrillNavigation, formatResultNumber, formatResultValue } = deps;\n${bindings}\n${code}`)(vue, {
    createRequestScope, formatResultNumber, formatResultValue,
    canonicalDrillRootResultId, assertDrillResponseContext, buildDrillRequest, drillMemberField, nextDrillNavigation,
    useRoute: () => ({ query: {} }), useRouter: () => ({ push() {}, replace() {} }),
    StatePanel: vue.defineComponent({ props: ['title'], setup: props => () => vue.h('div', props.title) }),
    FactorTraceTree: vue.defineComponent({ setup: () => () => vue.h('div', 'trace-tree') }),
    searchResultDrill: async (id, payload, options) => {
      requests.push({ id, payload, signal: options.signal })
      const response = typeof drillResponse === 'function' ? await drillResponse(id, payload) : drillResponse
      return { context: {}, breadcrumb: [], summary: {}, columns: [], records: [], nextLevels: [], pageInfo: {}, ...response }
    },
    fetchResultFactors, limitDrillNextLevels: levels => levels, isStatusRecord: () => false, getStatusLabel: value => value,
    fetchDepartmentNames: async () => new Map(), isDepartmentLevel, namedDrillRecord
  })
  const wrapper = mount(component, {
    props: { resultId: 'dept-result', startPathCode: 'CUSTOM_DEPT', startLevel: 'DEPT',
      startParentKeys: { OUT_DEPT_CODE: '17' }, startFilters: { OUT_DEPT_CODE: '17' },
      configuredPaths: [{ pathCode: 'CUSTOM_DEPT', pathName: '科室下钻', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DEPT' }] }], embedded: true, ...props },
    global: { components: { ElSelect: Select, ElButton: Button },
      stubs: { ElOption: true, ElTable: interactive ? vue.defineComponent({ props: ['data'], setup(props, { slots }) {
        vue.provide('testRows', vue.computed(() => props.data))
        return () => vue.h('div', slots.default?.())
      } }) : true, ElTableColumn: interactive ? vue.defineComponent({ setup(_, { slots }) {
        const rows = vue.inject('testRows')
        return () => vue.h('div', rows.value.flatMap(row => slots.default?.({ row }) || []))
      } }) : true, ElPagination: true }, directives: { loading() {} } }
  })
  return { wrapper, requests }
}
function button(wrapper, text) { return wrapper.findAll('button').find(item => item.text() === text) }

test('organization clicks use each selected result anchor and restore the hospital when navigating back', async () => {
  const { wrapper, requests } = create(undefined, {
    resultId: 'hospital-result', snapshotId: 'hospital-snapshot', startPathCode: 'ORGANIZATION', startLevel: 'HOSPITAL', startParentKeys: {}, startFilters: {},
    configuredPaths: [{ pathCode: 'ORGANIZATION', levels: [{ levelCode: 'HOSPITAL' },
      { levelCode: 'DEPARTMENT', memberKeyFieldCode: '科室' }, { levelCode: 'ATTENDING_DOCTOR', memberKeyFieldCode: '医生' }] }]
  }, (id, payload) => ({ context: { currentLevel: payload.currentLevel },
    nextLevels: payload.currentLevel === 'HOSPITAL' ? ['DEPARTMENT'] : payload.currentLevel === 'DEPARTMENT' ? ['ATTENDING_DOCTOR'] : [],
    breadcrumb: payload.currentLevel === 'ATTENDING_DOCTOR' ? [{ level: 'HOSPITAL', label: '医院' }, { level: 'DEPARTMENT', key: '15', label: '科室' }] : [],
    pageInfo: { total: 1 }, records: [{ resultId: payload.currentLevel === 'HOSPITAL' ? 'hospital-result' : 'selected-department-result',
      snapshotId: payload.currentLevel === 'HOSPITAL' ? 'hospital-snapshot' : 'department-snapshot', dimensionKey: '15' }]
  }), true)
  await flushPromises()
  await button(wrapper, '查看下一级').trigger('click')
  await flushPromises()
  assert.equal(requests.at(-1).payload.currentLevel, 'DEPARTMENT')
  assert.deepEqual(requests.at(-1).payload.parentKeys, {})
  await button(wrapper, '查看下一级').trigger('click')
  await flushPromises()
  assert.equal(requests.at(-1).id, 'selected-department-result')
  assert.equal(requests.at(-1).payload.snapshotId, 'department-snapshot')
  assert.deepEqual(requests.at(-1).payload.parentKeys, { 科室: '15' })
  wrapper.findComponent({ name: 'ElPagination' }).vm.$emit('current-change', 2)
  await flushPromises()
  assert.equal(requests.at(-1).id, 'selected-department-result')
  await wrapper.find('.drill-breadcrumb__item').trigger('click')
  await flushPromises()
  assert.equal(requests.at(-1).id, 'hospital-result')
  assert.equal(requests.at(-1).payload.currentLevel, 'HOSPITAL')
  assert.deepEqual(requests.at(-1).payload.parentKeys, {})
  await wrapper.setProps({ resultId: 'new-month-result', startLevel: 'ATTENDING_DOCTOR', startParentKeys: { 科室: '15' } })
  await flushPromises()
  assert.equal(requests.at(-1).id, 'new-month-result')
  wrapper.unmount()
})

test('an unbound hospital root is a configured summary, not a missing hospital member', async () => {
  const { wrapper } = create(undefined, { resultId: 'root', startLevel: 'HOSPITAL', startPathCode: 'ORGANIZATION',
    configuredPaths: [{ pathCode: 'ORGANIZATION', levels: [{ levelCode: 'HOSPITAL', levelName: '医院' }] }]
  }, { context: { currentLevel: 'HOSPITAL' }, columns: [{ field: 'dimensionName', label: '医院' }],
    records: [{ levelCode: 'HOSPITAL', dimensionKey: '__UNASSIGNED__', dimensionName: '未维护医院' }],
    breadcrumb: [{ level: 'HOSPITAL', key: '__UNASSIGNED__', label: '未维护医院' }] })
  await flushPromises()
  assert.deepEqual(wrapper.vm.getReportSnapshot().section.rows, [['医院']])
  assert.equal(wrapper.find('.drill-breadcrumb__item').text(), '医院')
  wrapper.unmount()
})

test('a configured custom disease root opens its business level using the selected result', async () => {
  const { wrapper, requests } = create(undefined, { startPathCode: 'CUSTOM_DISEASE', startLevel: 'ROOT', startParentKeys: {}, startFilters: {},
    configuredPaths: [{ pathCode: 'CUSTOM_DISEASE', levels: [{ levelCode: 'ROOT', levelName: '全部病种' },
      { levelCode: 'DIAGNOSIS', memberKeyFieldCode: '病种' }] }]
  }, (id, payload) => ({ context: { currentLevel: payload.currentLevel }, nextLevels: payload.currentLevel === 'ROOT' ? ['DIAGNOSIS'] : [],
    records: [{ resultId: '病种根结果', dimensionKey: 'ROOT' }], pageInfo: { total: 1 } }), true)
  await flushPromises()
  await button(wrapper, '查看下一级').trigger('click')
  await flushPromises()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].id, '病种根结果')
  assert.equal(requests[1].payload.currentLevel, 'DIAGNOSIS')
  assert.deepEqual(requests[1].payload.parentKeys, {})
  wrapper.unmount()
})

test('equivalent parent objects and tab toggles do not reload an already completed drill', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  await wrapper.setProps({ enabled: false, startParentKeys: { OUT_DEPT_CODE: '17' }, startFilters: { OUT_DEPT_CODE: '17' }, resultPeriod: {} })
  await wrapper.setProps({ enabled: true, startParentKeys: { OUT_DEPT_CODE: '17' }, startFilters: { OUT_DEPT_CODE: '17' }, resultPeriod: {} })
  await flushPromises()
  assert.equal(requests.length, 1)
  wrapper.unmount()
})

test('changing result and filters together issues one coherent drill request', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  await wrapper.setProps({ resultId: 'new-result', startParentKeys: { OUT_DEPT_CODE: '16' }, startFilters: { OUT_DEPT_CODE: '16' } })
  await flushPromises()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].id, 'new-result')
  assert.deepEqual(requests[1].payload.filters, { OUT_DEPT_CODE: '16' })
  wrapper.unmount()
})

test('disabled drill waits for activation and cancels unfinished requests on hiding and unmount', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper, requests } = create(undefined, { enabled: false }, () => pending)
  assert.equal(requests.length, 0)
  await wrapper.setProps({ enabled: true })
  assert.equal(requests.length, 1)
  await wrapper.setProps({ enabled: false })
  assert.equal(requests[0].signal.aborted, true)
  resolve({ summary: { indicatorValue: 99 } })
  await flushPromises()
  assert.doesNotMatch(wrapper.text(), /99/)
  await wrapper.setProps({ enabled: true })
  await flushPromises()
  assert.equal(requests.length, 2)
  wrapper.unmount()
  assert.equal(requests[1].signal.aborted, true)
})

test('static drill displays its mode instead of the persisted sentinel period', async () => {
  const { wrapper } = create(undefined, { granularity: 'STATIC' }, {
    context: { periodStart: '1000-01-01T00:00:00', periodEnd: '9999-12-31T23:59:59' }
  })
  await flushPromises()
  assert.match(wrapper.text(), /统计周期：静态结果/)
  assert.doesNotMatch(wrapper.text(), /1000-01-01|9999-12-31/)
  wrapper.unmount()
})

test('built-in and custom drill requests always send the selected path explicitly', async () => {
  for (const [pathCode, level] of [['ORGANIZATION', 'OUT_DEPT'], ['CUSTOM_DISEASE', 'SINGLE_DISEASE'], ['CUSTOM_DEPT', 'DEPT']]) {
    const { wrapper, requests } = create(undefined, { startPathCode: pathCode, startLevel: level,
      configuredPaths: [{ pathCode, levels: [{ levelCode: level }] }] })
    await flushPromises()
    assert.equal(requests[0].payload.pathCode, pathCode)
    assert.equal(requests[0].payload.currentLevel, level)
    assert.deepEqual(requests[0].payload.filters, { OUT_DEPT_CODE: '17' })
    wrapper.unmount()
  }
})

test('factor tracing is a separate command, not a drill path option', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  assert.ok(!wrapper.findAll('el-option-stub').some(option => ['FACTOR_TRACE', 'TIME', 'DISEASE', 'SCENARIO'].includes(option.attributes('value'))))
  await button(wrapper, '查看因子追溯').trigger('click')
  await flushPromises()
  assert.equal(wrapper.findComponent(Select).props('modelValue'), 'CUSTOM_DEPT')
  assert.equal(requests.length, 1)
  assert.ok(wrapper.find('section[aria-label="因子结果追溯"]').exists())
  assert.ok(button(wrapper, '返回下钻'))
  await button(wrapper, '返回下钻').trigger('click')
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.equal(requests[1].id, requests[0].id)
  assert.deepEqual(requests[1].payload, requests[0].payload, 'return preserves the result, level, parent keys and filters')
  assert.equal(requests[0].signal.aborted, true)
  wrapper.unmount()
})

test('returning to drill prevents a pending trace response from reopening the trace panel', async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const { wrapper } = create(() => pending)
  await flushPromises()
  await button(wrapper, '查看因子追溯').trigger('click')
  await button(wrapper, '返回下钻').trigger('click')
  resolve({ context: {}, factors: [] })
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.ok(button(wrapper, '查看因子追溯'))
  wrapper.unmount()
})

test('choosing another drill path exits trace mode without leaving an internal value in the selector', async () => {
  const { wrapper, requests } = create(undefined, { configuredPaths: [
    { pathCode: 'CUSTOM_DEPT', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DEPT' }] },
    { pathCode: 'CUSTOM_DISEASE', levels: [{ levelCode: 'ROOT' }, { levelCode: 'SINGLE_DISEASE' }] }
  ] })
  await flushPromises()
  await button(wrapper, '查看因子追溯').trigger('click')
  await flushPromises()
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'CUSTOM_DISEASE')
  await flushPromises()
  assert.equal(wrapper.find('section[aria-label="因子结果追溯"]').exists(), false)
  assert.equal(requests.at(-1).payload.currentLevel, 'ROOT')
  assert.ok(button(wrapper, '查看因子追溯'))
  wrapper.unmount()
})

test('backend pagination and sorting retain drill context and reset pages on context changes', async () => {
  const { wrapper, requests } = create(undefined, {}, { pageInfo: { total: 53 }, records: [{ dimensionKey: '17' }] })
  await flushPromises()
  const pagination = wrapper.findComponent({ name: 'ElPagination' })
  pagination.vm.$emit('current-change', 3)
  await flushPromises()
  assert.equal(requests.at(-1).payload.pageNum, 3)
  assert.deepEqual(requests.at(-1).payload.parentKeys, { OUT_DEPT_CODE: '17' })
  wrapper.findComponent({ name: 'ElTable' }).vm.$emit('sort-change', { prop: 'indicatorValue', order: 'ascending' })
  await flushPromises()
  assert.equal(requests.at(-1).payload.pageNum, 1)
  assert.deepEqual(requests.at(-1).payload.sort, [{ field: 'indicatorValue', direction: 'ASC' }])
  wrapper.findComponent({ name: 'ElPagination' }).vm.$emit('size-change', 50)
  await flushPromises()
  assert.equal(requests.at(-1).payload.pageSize, 50)
  wrapper.findComponent({ name: 'ElPagination' }).vm.$emit('current-change', 2)
  await flushPromises()
  await wrapper.setProps({ resultId: 'new-period-result' })
  await flushPromises()
  assert.equal(requests.at(-1).id, 'new-period-result')
  assert.equal(requests.at(-1).payload.pageNum, 1)
  assert.deepEqual(requests.at(-1).payload.sort, [{ field: 'indicatorValue', direction: 'DESC' }])
  wrapper.unmount()
})

test('clearing a custom sort requests the backend default order', async () => {
  const { wrapper, requests } = create(undefined, {}, { pageInfo: { total: 53 }, records: [{}] })
  await flushPromises()
  wrapper.findComponent({ name: 'ElTable' }).vm.$emit('sort-change', { prop: 'indicatorValue', order: null })
  await flushPromises()
  assert.deepEqual(requests.at(-1).payload.sort, [])
  wrapper.unmount()
})

test('table requests forward snapshots and strip redundant display names using configured bindings', async () => {
  const { wrapper, requests } = create(undefined, { snapshotId: '快照甲', indicatorVersionId: '版本甲',
    configuredPaths: [{ pathCode: 'CUSTOM_DEPT', levels: [{ levelCode: 'DEPT', memberKeyFieldCode: 'OUT_DEPT_CODE', displayFieldCode: 'OUT_DEPT_NAME' }] }],
    startParentKeys: { OUT_DEPT_CODE: '17', OUT_DEPT_NAME: '旧名称' }, startFilters: { OUT_DEPT_CODE: '17', OUT_DEPT_NAME: '新名称', IN_ICD10: ['J18'] }
  })
  await flushPromises()
  assert.equal(requests[0].payload.snapshotId, '快照甲')
  assert.deepEqual(requests[0].payload.parentKeys, { OUT_DEPT_CODE: '17' })
  assert.deepEqual(requests[0].payload.filters, { OUT_DEPT_CODE: '17', IN_ICD10: ['J18'] })
  wrapper.unmount()
})

test('table rejects responses for another period version or snapshot', async () => {
  for (const [props, context, message] of [
    [{ indicatorVersionId: '版本甲' }, { indicatorVersionId: '版本乙' }, /指标版本不一致/],
    [{ snapshotId: '快照甲' }, { snapshotId: '快照乙' }, /快照不一致/],
    [{ resultPeriod: { periodStart: '2026-01-01', periodEnd: '2026-02-01' } }, { periodStart: '2026-02-01', periodEnd: '2026-03-01' }, /统计周期不一致/]
  ]) {
    const { wrapper } = create(undefined, props, { context, records: [{ dimensionKey: '17', indicatorValue: 0.5 }] })
    await flushPromises()
    const snapshot = wrapper.vm.getReportSnapshot()
    assert.match(snapshot.section.description, message)
    assert.deepEqual(snapshot.section.rows, [])
    wrapper.unmount()
  }
})

test('switching paths never pins the previous path snapshot', async () => {
  const { wrapper, requests } = create(undefined, { snapshotId: '科室快照', configuredPaths: [
    { pathCode: 'CUSTOM_DEPT', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DEPT' }] },
    { pathCode: 'CUSTOM_DISEASE', levels: [{ levelCode: 'ROOT' }, { levelCode: 'SINGLE_DISEASE' }] }
  ] })
  await flushPromises()
  assert.equal(requests.at(-1).payload.snapshotId, '科室快照')
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'CUSTOM_DISEASE')
  await flushPromises()
  assert.equal(requests.at(-1).payload.pathCode, 'CUSTOM_DISEASE')
  assert.equal(requests.at(-1).payload.snapshotId, undefined)
  wrapper.unmount()
})

test('only actual organization and custom paths are selectable, including custom disease paths', async () => {
  const { wrapper, requests } = create(undefined, { startPathCode: 'DISEASE', startLevel: 'SINGLE_DISEASE',
    configuredPaths: [
      { pathCode: 'DISEASE' }, { pathCode: 'TIME' }, { pathCode: 'FACTOR_TRACE' },
      { pathCode: 'ORGANIZATION', levels: [{ levelCode: 'HOSPITAL' }] },
      { pathCode: 'CUSTOM_DISEASE', pathName: '诊断下钻', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DIAGNOSIS' }] }
    ] })
  await flushPromises()
  assert.deepEqual(wrapper.findAll('el-option-stub').map(option => option.attributes('value')), ['ORGANIZATION', 'CUSTOM_DISEASE'])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].payload.pathCode, 'ORGANIZATION')
  assert.equal(requests[0].payload.currentLevel, 'HOSPITAL')
  assert.deepEqual(requests[0].payload.parentKeys, {})
  wrapper.findComponent(Select).vm.$emit('update:modelValue', 'DISEASE')
  await flushPromises()
  assert.equal(requests.length, 1)
  assert.equal(wrapper.findComponent(Select).props('modelValue'), 'ORGANIZATION')
  wrapper.unmount()
})

test('removed paths select the remaining configured root once, then stop when no path remains', async () => {
  const { wrapper, requests } = create()
  await flushPromises()
  await wrapper.setProps({ configuredPaths: [{ pathCode: 'ORGANIZATION', levels: [{ levelCode: 'HOSPITAL' }] }] })
  await flushPromises()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].payload.pathCode, 'ORGANIZATION')
  assert.equal(requests[1].payload.currentLevel, 'HOSPITAL')
  await wrapper.setProps({ configuredPaths: [{ pathCode: 'DISEASE' }] })
  await flushPromises()
  assert.equal(requests.length, 2)
  assert.match(wrapper.text(), /未配置下钻路径/)
  assert.equal(wrapper.findComponent(Select).props('modelValue'), '')
  wrapper.unmount()
})

test('asynchronous configuration preserves an explicit entry level and parent scope', async () => {
  const { wrapper, requests } = create(undefined, { configuredPaths: [] })
  await flushPromises()
  assert.equal(requests.length, 0)
  await wrapper.setProps({ configuredPaths: [{ pathCode: 'CUSTOM_DEPT', levels: [{ levelCode: 'ROOT' }, { levelCode: 'DEPT' }] }] })
  await flushPromises()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].payload.currentLevel, 'DEPT')
  assert.deepEqual(requests[0].payload.parentKeys, { OUT_DEPT_CODE: '17' })
  wrapper.unmount()
})

test('no configured path makes no drill request but still allows real factor tracing', async () => {
  for (const configuredPaths of [[], [{ pathCode: 'DISEASE' }, { pathCode: 'TIME' }, { pathCode: 'FACTOR_TRACE' }]]) {
    const traces = []
    const { wrapper, requests } = create(async id => { traces.push(id); return { context: {}, factors: [] } }, { configuredPaths })
    await flushPromises()
    assert.equal(requests.length, 0)
    assert.match(wrapper.text(), /未配置下钻路径/)
    await button(wrapper, '查看因子追溯').trigger('click')
    await flushPromises()
    assert.deepEqual(traces, ['dept-result'])
    assert.ok(wrapper.find('section[aria-label="因子结果追溯"]').exists())
    await button(wrapper, '返回下钻').trigger('click')
    await flushPromises()
    assert.equal(requests.length, 0)
    wrapper.unmount()
  }
})

test('a late response cannot restore a cleared result or overwrite a newer selection', async () => {
  for (const nextId of ['', '新周期结果']) {
    let resolve
    const pending = new Promise(done => { resolve = done })
    const { wrapper } = create(undefined, {}, id => id === 'dept-result' ? pending : {
      columns: [{ field: 'dimensionName', label: '科室' }], records: [{ dimensionKey: '15', dimensionName: '新周期科室' }]
    })
    await flushPromises()
    await wrapper.setProps({ resultId: nextId })
    await flushPromises()
    resolve({ columns: [{ field: 'dimensionName', label: '科室' }], records: [{ dimensionKey: '16', dimensionName: '旧周期科室' }] })
    await flushPromises()
    const snapshot = wrapper.vm.getReportSnapshot()
    assert.equal(snapshot.loading, false)
    assert.deepEqual(snapshot.section.rows, nextId ? [['新周期科室']] : [])
    wrapper.unmount()
  }
})
