import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as periods from '../src/idmp/features/analysis/drillPeriods.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { useAnalysisPeriod } = await import('../src/idmp/features/analysis/useAnalysisPeriod.js')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/features/analysis/IndicatorDrillAnalysis.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'indicator-drill-period-test', inlineTemplate: true }).content
const vueBindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, specifiers]) => specifiers.split(',').map(specifier => {
    const [imported, local = imported] = specifier.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Explorer = vue.defineComponent({
  name: 'DrillExplorer', props: ['resultId', 'pathResultIds', 'startLevel', 'startParentKeys', 'startPathCode', 'startFilters', 'period'],
  setup(props, { expose }) {
    const childLevel = vue.ref('ROOT')
    expose({ getReportSnapshot: () => ({ loading: false, section: { title: props.period, rows: [[props.resultId]] } }) })
    return () => vue.h('button', { class: 'explorer', onClick: () => { childLevel.value = 'DEPT' } }, `${props.resultId}:${childLevel.value}`)
  }
})
const State = vue.defineComponent({ props: ['title', 'description'], setup: props => () => vue.h('div', { class: 'state' }, `${props.title} ${props.description || ''}`) })
const Group = vue.defineComponent({ name: 'ElRadioGroup', props: ['modelValue'], emits: ['update:modelValue', 'change'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Select = vue.defineComponent({ name: 'ElSelect', props: ['modelValue', 'disabled'], emits: ['update:modelValue', 'change'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
function component(fetchIndicatorAnalysis) {
  return Function('vue', 'dependencies', `const { StatePanel, DrillExplorer, fetchIndicatorAnalysis, useAnalysisPeriod, DRILL_GRANULARITIES, drillPeriodAnchor, drillPeriodKey, drillPeriodOptions } = dependencies;\n${vueBindings}\n${code}`)(vue, {
    StatePanel: State, DrillExplorer: Explorer, fetchIndicatorAnalysis, useAnalysisPeriod, ...periods
  })
}
function create(fetcher, props = {}) {
  return mount(component(fetcher), {
    props: { indicatorId: 'indicator-A', indicatorVersionId: 'version-A', enabled: true, configuredPaths: [{ pathCode: 'CUSTOM_DEPT' }], ...props },
    global: { components: { ElRadioGroup: Group, ElSelect: Select }, stubs: { ElRadioButton: true, ElOption: true, ElButton: true } }
  })
}
function point(start, end, resultId) { return { periodStart: `${start}T00:00:00`, periodEnd: `${end}T00:00:00`, resultId } }
const march = point('2026-03-01', '2026-04-01', 'march')
const april = point('2026-04-01', '2026-05-01', 'april')
function response(points) {
  const latest = points.at(-1)
  return { trend: points, overview: latest, dimensionComparison: [{ ...latest, dimensions: { out_dept_code: 'A' } }] }
}
async function change(wrapper, type, value) {
  const control = wrapper.findComponent(type)
  control.vm.$emit('update:modelValue', value)
  await vue.nextTick()
  control.vm.$emit('change', value)
  await flushPromises()
}
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('loads lazily, selects newest monthly result, and forwards the PDF snapshot', async () => {
  const requests = []
  const wrapper = create(async (id, params) => { requests.push({ id, params }); return response([march, april]) }, { enabled: false })
  assert.equal(requests.length, 0)
  await wrapper.setProps({ enabled: true })
  await flushPromises()
  assert.equal(wrapper.findComponent(Select).props('modelValue'), '2026-04-01/2026-05-01')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  assert.deepEqual(requests[0].params, { granularity: 'MONTHLY', indicatorVersionId: 'version-A' })
  assert.equal(wrapper.vm.getReportSnapshot().section.title, '2026年4月')
  await wrapper.setProps({ enabled: false })
  await wrapper.setProps({ enabled: true })
  assert.equal(requests.length, 1)
  wrapper.unmount()
})

test('older month fetches its exact period and changing month resets the drill hierarchy', async () => {
  const requests = []
  const wrapper = create(async (id, params) => { requests.push(params); return response(params.periodStart ? [march] : [march, april]) })
  await flushPromises()
  await wrapper.find('.explorer').trigger('click')
  assert.match(wrapper.text(), /april:DEPT/)
  await change(wrapper, Select, '2026-03-01/2026-04-01')
  assert.match(wrapper.text(), /march:ROOT/)
  assert.deepEqual(requests[1], { granularity: 'MONTHLY', periodStart: '2026-03-01', periodEnd: '2026-03-31', indicatorVersionId: 'version-A' })
  await change(wrapper, Select, '2026-04-01/2026-05-01')
  await change(wrapper, Select, '2026-03-01/2026-04-01')
  assert.equal(requests.length, 2, 'visited periods are reused')
  wrapper.unmount()
})

test('quarter/year use separate formal results; an empty year never retains monthly data', async () => {
  const quarter = point('2026-01-01', '2026-04-01', 'quarter')
  const wrapper = create(async (_, params) => params.granularity === 'YEARLY' ? {} : response(params.granularity === 'QUARTERLY' ? [quarter] : [april]))
  await flushPromises()
  await change(wrapper, Group, 'QUARTERLY')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'quarter')
  await change(wrapper, Group, 'YEARLY')
  assert.match(wrapper.text(), /暂无年度正式结果/)
  assert.equal(wrapper.findComponent(Explorer).exists(), false)
  await change(wrapper, Group, 'MONTHLY')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  wrapper.unmount()
})

test('department filters reach period and drill requests and invalidate cached results', async () => {
  const requests = []
  const wrapper = create(async (_, params) => { requests.push(params); return response([march, april]) }, { filters: { OUT_DEPT_CODE: ['15'] } })
  await flushPromises()
  assert.deepEqual(requests[0]['filter.OUT_DEPT_CODE'], ['15'])
  assert.deepEqual(wrapper.findComponent(Explorer).props('startFilters'), { OUT_DEPT_CODE: ['15'] })
  await wrapper.vm.focusResult({ period: april, granularity: 'MONTHLY', resultId: 'old-department-result', pathCode: 'CUSTOM_DEPT', currentLevel: 'DEPT', parentKeys: { OUT_DEPT_CODE: '15' }, filters: { OUT_DEPT_CODE: '15' } })
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'old-department-result')
  await wrapper.setProps({ filters: { OUT_DEPT_CODE: ['16'] } })
  await flushPromises()
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1]['filter.OUT_DEPT_CODE'], ['16'])
  assert.deepEqual(wrapper.findComponent(Explorer).props('startFilters'), { OUT_DEPT_CODE: ['16'] })
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  wrapper.unmount()
})

test('slow quarterly response cannot overwrite a newer annual selection', async () => {
  const slow = deferred()
  const annual = point('2025-01-01', '2026-01-01', 'year')
  const wrapper = create(async (_, params) => params.granularity === 'QUARTERLY' ? slow.promise : response(params.granularity === 'YEARLY' ? [annual] : [april]))
  await flushPromises()
  await change(wrapper, Group, 'QUARTERLY')
  assert.equal(wrapper.findComponent(Explorer).exists(), false)
  await change(wrapper, Group, 'YEARLY')
  slow.resolve(response([point('2026-01-01', '2026-04-01', 'quarter')]))
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'year')
  wrapper.unmount()
})

test('switching indicator/version clears selections and prevents stale responses and cache leaking', async () => {
  const slow = deferred()
  const calls = []
  const wrapper = create(async (id, params) => { calls.push({ id, params }); return id === 'indicator-A' ? slow.promise : response([march]) })
  await wrapper.setProps({ indicatorId: 'indicator-B', indicatorVersionId: 'version-B' })
  await flushPromises()
  slow.resolve(response([april]))
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'march')
  await wrapper.setProps({ indicatorVersionId: 'version-C' })
  await flushPromises()
  assert.equal(calls.at(-1).params.indicatorVersionId, 'version-C')
  assert.equal(calls.length, 3)
  wrapper.unmount()
})

test('failed period read removes previous data and supports retry', async () => {
  let fail = true
  const wrapper = create(async (_, params) => {
    if (params.granularity === 'YEARLY' && fail) throw new Error('连接暂不可用')
    return response([april])
  })
  await flushPromises()
  await change(wrapper, Group, 'YEARLY')
  assert.match(wrapper.text(), /连接暂不可用/)
  assert.equal(wrapper.findComponent(Explorer).exists(), false)
  fail = false
  await change(wrapper, Group, 'MONTHLY')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  wrapper.unmount()
})

test('unrelated analysis period changes do not reset a selected drill period', async () => {
  const calls = []
  const wrapper = create(async (_, params) => { calls.push(params); return response(params.periodStart ? [march] : [march, april]) })
  await flushPromises()
  await change(wrapper, Select, '2026-03-01/2026-04-01')
  await wrapper.setProps({ initialPeriod: april, initialGranularity: 'QUARTERLY' })
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'march')
  assert.equal(calls.length, 2)
  wrapper.unmount()
})

test('a slow previous month response cannot restore the old result after selecting the latest month', async () => {
  const slow = deferred()
  const wrapper = create(async (_, params) => params.periodStart ? slow.promise : response([march, april]))
  await flushPromises()
  await change(wrapper, Select, '2026-03-01/2026-04-01')
  assert.equal(wrapper.findComponent(Explorer).exists(), false)
  await change(wrapper, Select, '2026-04-01/2026-05-01')
  slow.resolve(response([march]))
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  wrapper.unmount()
})

test('honors initial drill context only on entry, then removes old parent filters after changing period', async () => {
  const wrapper = create(async (_, params) => response(params.periodStart ? [march] : [march, april]), {
    initialPeriod: march, initialResultId: 'march-root', startLevel: 'DEPT', startParentKeys: { dept: 'A' }
  })
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'march-root')
  assert.equal(wrapper.findComponent(Explorer).props('startLevel'), 'DEPT')
  await change(wrapper, Select, '2026-04-01/2026-05-01')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  assert.deepEqual(wrapper.findComponent(Explorer).props('startParentKeys'), {})
  wrapper.unmount()
})

test('department ranking entry restores its period and parent context after a previous drill selection', async () => {
  const wrapper = create(async (_, params) => response(params.periodStart ? [march] : [march, april]))
  await flushPromises()
  await change(wrapper, Select, '2026-03-01/2026-04-01')
  await wrapper.setProps({ initialPeriod: april, startLevel: 'ATTENDING_DOCTOR', startParentKeys: { OUT_DEPT_CODE: 'A' } })
  wrapper.vm.focusInitialResult()
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  assert.equal(wrapper.findComponent(Explorer).props('startLevel'), 'ATTENDING_DOCTOR')
  assert.deepEqual(wrapper.findComponent(Explorer).props('startParentKeys'), { OUT_DEPT_CODE: 'A' })
  wrapper.unmount()
})

test('ranking can open a different granularity and exact department without changing the original analysis props', async () => {
  const quarter = point('2026-01-01', '2026-04-01', 'quarter')
  const wrapper = create(async (_, params) => response(params.granularity === 'QUARTERLY' ? [quarter] : [april]))
  await flushPromises()
  await wrapper.vm.focusResult({ period: quarter, granularity: 'QUARTERLY', resultId: 'quarter-department', pathCode: 'CUSTOM_DEPT', currentLevel: 'DEPT', parentKeys: { OUT_DEPT_CODE: '14' }, filters: { OUT_DEPT_CODE: '14' } })
  await flushPromises()
  assert.equal(wrapper.findComponent(Group).props('modelValue'), 'QUARTERLY')
  const explorer = wrapper.findComponent(Explorer)
  assert.equal(explorer.props('resultId'), 'quarter-department')
  assert.equal(explorer.props('startPathCode'), 'CUSTOM_DEPT')
  assert.equal(explorer.props('startLevel'), 'DEPT')
  assert.deepEqual(explorer.props('startParentKeys'), { OUT_DEPT_CODE: '14' })
  assert.deepEqual(explorer.props('startFilters'), { OUT_DEPT_CODE: '14' })
  assert.equal(explorer.props('pathResultIds').CUSTOM_DEPT, 'quarter-department')
  await change(wrapper, Group, 'MONTHLY')
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  assert.deepEqual(wrapper.findComponent(Explorer).props('startParentKeys'), {})
  wrapper.unmount()
})

test('ranking and drill maintain independent period selections and requests', async () => {
  const calls = []
  const Harness = vue.defineComponent({
    setup(_, { expose }) {
      const props = vue.reactive({ indicatorId: 'A', indicatorVersionId: 'V1', enabled: true })
      const fetcher = async (_, params) => { calls.push(params); return response(params.periodStart ? [march] : [march, april]) }
      const rank = useAnalysisPeriod(props, fetcher)
      const drill = useAnalysisPeriod(props, fetcher)
      expose({ rank, drill })
      return () => null
    }
  })
  const wrapper = mount(Harness)
  await flushPromises()
  wrapper.vm.rank.selectedPeriod.value = '2026-03-01/2026-04-01'
  await wrapper.vm.rank.loadSelectedPeriod()
  assert.equal(wrapper.vm.rank.analysis.value.overview.resultId, 'march')
  assert.equal(wrapper.vm.drill.analysis.value.overview.resultId, 'april')
  assert.equal(wrapper.vm.drill.selectedPeriod.value, '2026-04-01/2026-05-01')
  assert.equal(calls.length, 3)
  wrapper.unmount()
})

test('retry preserves a failed old-period selection instead of switching to the latest result', async () => {
  let fail = true
  const Harness = vue.defineComponent({
    setup(_, { expose }) {
      const state = useAnalysisPeriod({ indicatorId: 'A', enabled: true }, async (_, params) => {
        if (params.periodStart && fail) throw new Error('连接暂不可用')
        return response(params.periodStart ? [march] : [march, april])
      })
      expose({ state })
      return () => null
    }
  })
  const wrapper = mount(Harness)
  await flushPromises()
  wrapper.vm.state.selectedPeriod.value = '2026-03-01/2026-04-01'
  await wrapper.vm.state.loadSelectedPeriod()
  assert.equal(wrapper.vm.state.analysis.value, null)
  assert.equal(wrapper.vm.state.errorMessage.value, '连接暂不可用')
  fail = false
  await wrapper.vm.state.retryPeriod()
  assert.equal(wrapper.vm.state.analysis.value.overview.resultId, 'march')
  assert.equal(wrapper.vm.state.selectedPeriod.value, '2026-03-01/2026-04-01')
  wrapper.unmount()
})

test('a missing ranking period never silently opens another period in drill', async () => {
  const wrapper = create(async () => response([april]))
  await flushPromises()
  await wrapper.vm.focusResult({ period: march, granularity: 'MONTHLY', resultId: 'march-dept', pathCode: 'CUSTOM_DEPT', currentLevel: 'DEPT', parentKeys: {} })
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).exists(), false)
  assert.match(wrapper.text(), /该周期暂无可下钻结果/)
  wrapper.unmount()
})

test('analysis page keeps temporal and static drill component refs separate', async () => {
  const page = await readFile(new URL('../src/idmp/views/IndicatorAnalysis.vue', import.meta.url), 'utf8')
  assert.match(page, /<IndicatorDrillAnalysis\s+[^>]*ref="drillExplorerRef"/)
  assert.match(page, /<DrillExplorer\s+[^>]*ref="staticDrillExplorerRef"/)
  assert.equal((page.match(/ref="drillExplorerRef"/g) || []).length, 1)
})

test('switching away cancels unfinished requests and resumes the same initial period and parent scope', async () => {
  const pending = deferred(), requests = []
  const wrapper = create(async (_, params, options) => {
    requests.push({ params, signal: options.signal })
    if (params.periodStart && requests.length === 2) return pending.promise
    return response(params.periodStart ? [march] : [march, april])
  }, { initialPeriod: march, startLevel: 'DEPT', startParentKeys: { OUT_DEPT_CODE: '16' } })
  await flushPromises()
  assert.equal(requests.length, 2)
  await wrapper.setProps({ enabled: false })
  assert.equal(requests[1].signal.aborted, true)
  await wrapper.setProps({ enabled: true })
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'march')
  assert.deepEqual(wrapper.findComponent(Explorer).props('startParentKeys'), { OUT_DEPT_CODE: '16' })
  pending.resolve(response([april]))
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'march')
  wrapper.unmount()
  assert.equal(requests.at(-1).signal.aborted, true)
})

test('superseded contexts cancel transport and never cache stale period data', async () => {
  const pending = deferred(), requests = []
  const wrapper = create(async (id, params, options) => {
    requests.push({ id, params, signal: options.signal })
    return requests.length === 1 ? pending.promise : response([april])
  })
  await wrapper.setProps({ indicatorId: 'indicator-B', indicatorVersionId: 'version-B', filters: { OUT_DEPT_CODE: ['16'] } })
  await flushPromises()
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests[1].id, 'indicator-B')
  assert.deepEqual(requests[1].params['filter.OUT_DEPT_CODE'], ['16'])
  pending.resolve(response([march]))
  await flushPromises()
  assert.equal(wrapper.findComponent(Explorer).props('resultId'), 'april')
  await wrapper.setProps({ enabled: false })
  await wrapper.setProps({ enabled: true })
  assert.equal(requests.length, 2, 'completed data is reused when revisiting a tab')
  wrapper.unmount()
})
