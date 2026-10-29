import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { createAnalysisProfile, createOverviewPresentation } from '../src/idmp/features/analysis/overviewPresentation.js'
import { createAnalysisTrendPresentation } from '../src/idmp/features/analysis/trendPresentation.js'
import { DRILL_GRANULARITIES } from '../src/idmp/features/analysis/drillPeriods.js'
import { periodOptions } from '../src/idmp/features/analysis/indicatorProfiles.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { createDepartmentRankRows, departmentDrillContext } = await import('../src/idmp/features/analysis/departmentRanking.js')
const { mount } = await import('@vue/test-utils')
const slot = name => vue.defineComponent({ name, setup: (_, { slots }) => () => vue.h('div', [slots.title?.(), slots.default?.()]) })
const Control = vue.defineComponent({ props: ['modelValue', 'disabled', 'loading', 'remoteMethod'], emits: ['update:modelValue', 'change'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled }, slots.default?.()) })
const Badge = vue.defineComponent({ props: ['label'], setup: props => () => vue.h('span', props.label) })
const State = vue.defineComponent({ props: ['title', 'description'], setup: (props, { slots }) => () => vue.h('section', { class: 'state' }, [props.title, props.description, slots.actions?.()]) })
const Chart = vue.defineComponent({ props: ['option', 'loading', 'error', 'empty', 'updatedAt'], setup: (_, { slots }) => () => vue.h('section', [slots.actions?.(), slots.table?.()]) })
const Table = vue.defineComponent({ props: ['data'], setup(props, { slots }) {
  vue.provide('rows', vue.computed(() => props.data))
  return () => vue.h('div', slots.default?.())
} })
const Column = vue.defineComponent({ props: ['prop'], setup(props, { slots }) {
  const rows = vue.inject('rows')
  return () => vue.h('div', rows.value.map(row => slots.default?.({ row }) || row[props.prop]))
} })
const global = { components: {
  ElButton: Button, ElRadioGroup: Control, ElDatePicker: Control, ElSelect: Control,
  ElTable: Table, ElTableColumn: Column,
  ElCollapse: slot('ElCollapse'), ElCollapseItem: slot('ElCollapseItem'), ElTooltip: slot('ElTooltip'),
  ElOption: slot('ElOption'), ElRadioButton: slot('ElRadioButton'), ElTag: slot('ElTag')
} }
async function compile(name) {
  const source = await readFile(new URL(`../src/idmp/features/analysis/${name}.vue`, import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const code = compileScript(descriptor, { id: name, inlineTemplate: true }).content
  const bindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, list]) => list.split(',').map(item => {
    const [imported, local = imported] = item.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
  return Function('vue', 'StatusBadge', 'StatePanel', 'IdmpChart', 'DRILL_GRANULARITIES', 'analysisPeriodOptions',
    `${bindings}\n${code.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, Badge, State, Chart, DRILL_GRANULARITIES, periodOptions)
}
const Overview = await compile('AnalysisOverview')
const Trend = await compile('AnalysisTrend')
const Ranking = await compile('AnalysisDepartmentRanking')
const display = { format: 'PERCENT', multiplier: '100', scale: 2, roundingMode: 'HALF_UP' }
const profile = createAnalysisProfile({ name: '住院死亡率' }, { targetValue: '0.003' }, display)
const overview = (overrides = {}) => createOverviewPresentation({
  selected: true, unit: '%', display,
  report: {}, formal: { analysis: { dataAvailable: true }, overview: { value: 1 / 429, numerator: 1, denominator: 429, qualityStatus: 'PASSED' }, periodLabel: '2026年1月', dimensionCount: 24, hasDrill: true },
  ...overrides
})
const trend = analysis => createAnalysisTrendPresentation({ analysis, profile, display, granularity: 'MONTHLY' })
const trendProps = (overrides = {}) => ({ model: trend({ dataAvailable: true, trend: [{ periodStart: '2026-01-01', value: 1 / 429 }] }), months: ['2026-01', '2026-01'], period: '月度', grain: {}, expanded: [], indicatorName: '住院死亡率', ...overrides })
const rankProps = overrides => ({ rankTableData: [], granularity: 'MONTHLY', selectedPeriod: '', ...overrides })
const button = (wrapper, label) => wrapper.findAll('button').find(item => item.text() === label)

test('overview preserves nonzero percentages, zero and unavailable values without changing input', () => {
  for (const [value, expected] of [[1 / 429, '0.23%'], [0, '0.00%'], [null, '-']]) {
    const model = overview({ formal: { analysis: { dataAvailable: true }, overview: { value }, dimensionCount: 0 } })
    const before = structuredClone(model)
    const wrapper = mount(Overview, { props: { model, targetLabel: profile.targetLabel }, global })
    assert.equal(wrapper.find('.primary-metric > strong').text(), expected)
    assert.ok(wrapper.text().includes('目标值：0.30%'))
    assert.deepEqual(model, before)
    wrapper.unmount()
  }
})

test('overview dirty, loading and failed queries never expose an old result', () => {
  for (const [report, expected] of [[{ dirty: true }, '待查询'], [{ loading: true }, '查询中'], [{ error: '读取失败' }, '查询失败']]) {
    const wrapper = mount(Overview, { props: { model: overview({ report }) }, global })
    assert.equal(wrapper.find('.primary-metric > strong').text(), '-')
    assert.ok(wrapper.text().includes(expected))
    assert.ok(!wrapper.text().includes('0.23%'))
    wrapper.unmount()
  }
})

test('published formula-null result retains its period and explains the outcome without inventing a cause', () => {
  const model = overview({ formal: { analysis: { dataAvailable: true },
    overview: { value: null, outcomeStatus: 'NOT_CALCULABLE' }, periodLabel: '2026年3月',
    availability: { status: 'NOT_CALCULABLE', message: '指标公式返回空值' } } })
  const wrapper = mount(Overview, { props: { model }, global })
  assert.equal(wrapper.find('.primary-metric > strong').text(), '-')
  assert.ok(wrapper.text().includes('该统计周期无法计算指标值'))
  assert.ok(wrapper.text().includes('2026年3月'))
  assert.ok(wrapper.text().includes('指标公式返回空值'))
  assert.ok(!wrapper.text().includes('分母为零'))
  assert.ok(!wrapper.text().includes('暂无正式结果'))
  wrapper.unmount()
})

test('trend preserves null gaps and valid zero months rather than dropping or joining them', () => {
  const model = trend({ dataAvailable: true, trend: [
    { periodStart: '2026-01-01', value: 0.23, outcomeStatus: 'CALCULATED' },
    { periodStart: '2026-02-01', value: null, outcomeStatus: 'NOT_CALCULABLE' },
    { periodStart: '2026-03-01', value: 0, outcomeStatus: 'CALCULATED' }
  ] })
  assert.deepEqual(model.option.series[0].data, [23, null, 0])
  assert.notEqual(model.option.series[0].connectNulls, true)
  assert.deepEqual(model.rows.map(row => row.actualDisplay), ['23.00%', '无法计算', '0.00%'])
  assert.deepEqual(model.trend.labels, ['2026-01', '2026-02', '2026-03'])
  const wrapper = mount(Trend, { props: trendProps({ model }), global })
  assert.ok(wrapper.text().includes('1 个周期的指标公式返回空值'))
  assert.ok(wrapper.text().includes('无法计算'))
  wrapper.unmount()
})

test('overview without requested members does not claim missing dimension results and uses API operands', () => {
  const model = overview({ formal: { analysis: { dataAvailable: true },
    overview: { value: 0, numeratorValue: 0, denominatorValue: 429 }, dimensionCount: null, hasDrill: true } })
  assert.equal(model.summaries.find(item => item.label === '分子').value, '0')
  assert.equal(model.summaries.find(item => item.label === '分母').value, '429')
  assert.equal(model.summaries.find(item => item.label === '维度分析').value, '已配置')
  assert.ok(!JSON.stringify(model).includes('本期暂无结果'))
})

test('overview formal, instant and static labels reflect the actual result source', () => {
  for (const executionMode of ['AD_HOC_SOURCE', 'FORMAL_RESULTS']) {
    const model = overview({ report: { result: { status: 'READY', value: 0.0052, numeratorValue: 13, denominatorValue: 2490, executionMode }, resultPeriodLabel: '2026年2月至4月', modeLabel: executionMode === 'AD_HOC_SOURCE' ? '即时计算' : '正式结果汇总' } })
    const wrapper = mount(Overview, { props: { model }, global })
    assert.ok(wrapper.text().includes('0.52%'))
    assert.ok(wrapper.text().includes('2,490'))
    assert.ok(wrapper.text().includes(executionMode === 'AD_HOC_SOURCE' ? '源数据即时计算' : '正式结果复用'))
    wrapper.unmount()
  }
  const model = overview({ formal: { analysis: { dataAvailable: true }, overview: { displayValue: '940,333.88' }, periodLabel: '静态结果' } })
  const wrapper = mount(Overview, { props: { model }, global })
  assert.ok(wrapper.text().includes('静态结果'))
  assert.ok(wrapper.text().includes('940,333.88'))
  wrapper.unmount()
})

test('trend chart and table share the same precision and target presentation', () => {
  const props = trendProps()
  const wrapper = mount(Trend, { props, global })
  const option = wrapper.findComponent(Chart).props('option')
  assert.equal(option.series[0].data[0], 1 / 429 * 100)
  assert.equal(option.series[0].animation, false)
  assert.equal(option.series[0].markLine.data[0].yAxis, 0.3)
  assert.equal(wrapper.find('tbody td').text(), '0.23%')
  assert.equal(wrapper.findAll('thead th').length, 2, 'no invented peer values')
  wrapper.unmount()
})

test('trend month, period and independent grain controls emit without mutating props', async () => {
  const grain = Object.freeze({ OUT_DEPT_CODE: '16', IN_ICD10: 'J18' })
  const wrapper = mount(Trend, { props: trendProps({ grain, grainFields: [{ code: 'OUT_DEPT_CODE', label: '科室', options: [{ value: '16', label: '呼吸科' }] }] }), global })
  const controls = wrapper.findAllComponents(Control)
  controls[0].vm.$emit('update:modelValue', ['2026-02', '2026-04'])
  controls[1].vm.$emit('update:modelValue', '季度')
  controls[1].vm.$emit('change', '季度')
  controls[2].vm.$emit('update:modelValue', '15')
  controls[2].props('remoteMethod')('呼吸')
  await vue.nextTick()
  assert.deepEqual(wrapper.emitted('update:months')[0][0], ['2026-02', '2026-04'])
  assert.deepEqual(wrapper.emitted('update:period')[0], ['季度'])
  assert.equal(wrapper.emitted('change-period').length, 1)
  assert.deepEqual(wrapper.emitted('update:grain')[0][0], { OUT_DEPT_CODE: '15', IN_ICD10: 'J18' })
  assert.equal(grain.OUT_DEPT_CODE, '16')
  assert.deepEqual(wrapper.emitted('search-grain')[0], [{ code: 'OUT_DEPT_CODE', search: '呼吸' }])
  await button(wrapper, '应用筛选').trigger('click')
  await button(wrapper, '清空筛选').trigger('click')
  assert.equal(wrapper.emitted('apply').length, 1)
  assert.equal(wrapper.emitted('clear-grain').length, 1)
  wrapper.unmount()
})

test('trend loading, failure and empty state preserve retry and clear actions; static hides dates', async () => {
  const wrapper = mount(Trend, { props: trendProps({ model: trend(null), hasRange: true, canClearRange: true }), global })
  assert.ok(wrapper.find('.trend-empty-guidance').exists())
  await button(wrapper, '查看全部已有周期').trigger('click')
  assert.equal(wrapper.emitted('clear-range').length, 1)
  await wrapper.setProps({ trendLoading: true })
  assert.equal(wrapper.findComponent(Chart).props('loading'), true)
  assert.equal(wrapper.find('.trend-empty-guidance').exists(), false)
  await wrapper.setProps({ trendLoading: false, trendErrorMessage: '服务暂不可用' })
  assert.equal(wrapper.findComponent(Chart).props('error'), '服务暂不可用')
  await button(wrapper, '重试').trigger('click')
  assert.equal(wrapper.emitted('retry').length, 1)
  await wrapper.setProps({ staticMode: true })
  assert.equal(wrapper.find('.trend-controls').exists(), false)
  wrapper.unmount()
})

test('ranking orders raw values without rounding, retains zero and drill provenance', async () => {
  const paths = [{ pathCode: 'ORGANIZATION', levels: [{ levelCode: 'OUT_DEPT', memberKeyFieldCode: 'OUT_DEPT_CODE' }, { levelCode: 'DOCTOR', memberKeyFieldCode: 'ATTENDING_DOCTOR' }] }]
  const comparisons = [
    { departmentCode: '15', departmentName: '消化科', value: 0, numeratorValue: 0, denominatorValue: 679 },
    { departmentCode: '16', departmentName: '呼吸科', value: 1 / 429, numeratorValue: 1, denominatorValue: 429, resultId: '102027642460761108', snapshotId: '快照甲', indicatorVersionId: '版本甲', periodStart: '2026-01-01', periodEnd: '2026-02-01' },
    { departmentCode: '17', departmentName: '重症科', value: 0.00234, numeratorValue: 1, denominatorValue: 427 }
  ]
  const before = structuredClone(comparisons)
  const rows = createDepartmentRankRows({ comparisons, paths, granularity: 'MONTHLY', unit: '%', display })
  assert.deepEqual(rows.map(row => row.departmentCode), ['17', '16', '15'])
  assert.equal(rows[1].rate, '0.23%')
  assert.equal(rows[2].rate, '0.00%')
  assert.deepEqual(rows[1].drillContext, departmentDrillContext(comparisons[1], paths, 'MONTHLY'))
  assert.deepEqual(comparisons, before)
  const wrapper = mount(Ranking, { props: rankProps({ rankTableData: rows }), global })
  await wrapper.findAll('.action-link')[1].trigger('click')
  assert.deepEqual(wrapper.emitted('drill')[0][0], rows[1])
  assert.ok(wrapper.text().includes('呼吸科'))
  assert.ok(wrapper.text().includes('429'))
  wrapper.unmount()
})

test('ranking period controls emit granularity and exact period separately', async () => {
  const wrapper = mount(Ranking, { props: rankProps({ showPeriodControls: true, rankPeriodOptions: [{ value: '2026-01-01/2026-04-01', label: '2026年一季度' }] }), global })
  const [group, select] = wrapper.findAllComponents(Control)
  group.vm.$emit('update:modelValue', 'QUARTERLY')
  group.vm.$emit('change', 'QUARTERLY')
  select.vm.$emit('update:modelValue', '2026-01-01/2026-04-01')
  select.vm.$emit('change', '2026-01-01/2026-04-01')
  await vue.nextTick()
  assert.deepEqual(wrapper.emitted('update:granularity')[0], ['QUARTERLY'])
  assert.deepEqual(wrapper.emitted('update:selectedPeriod')[0], ['2026-01-01/2026-04-01'])
  assert.equal(wrapper.emitted('change-granularity').length, 1)
  assert.equal(wrapper.emitted('change-period').length, 1)
  wrapper.unmount()
})

test('ranking loading, error and no-period states do not show stale rows', async () => {
  const wrapper = mount(Ranking, { props: rankProps({ rankLoading: true }), global })
  assert.ok(wrapper.text().includes('正在读取科室排名'))
  assert.equal(wrapper.findComponent(Table).exists(), false)
  await wrapper.setProps({ rankLoading: false, rankErrorMessage: '请稍后重试' })
  assert.ok(wrapper.text().includes('科室排名加载失败'))
  await button(wrapper, '重试').trigger('click')
  assert.equal(wrapper.emitted('retry').length, 1)
  await wrapper.setProps({ rankErrorMessage: '', rankInitialized: true, rankGranularityLabel: '年度' })
  assert.ok(wrapper.text().includes('暂无年度可用结果'))
  assert.equal(wrapper.find('.rank-period-toolbar').exists(), false)
  wrapper.unmount()
})
