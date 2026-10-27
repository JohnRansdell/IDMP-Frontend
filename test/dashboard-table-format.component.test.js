import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const engine = await import('../src/idmp/features/dashboard/bindingEngine.js')
const theme = await import('../src/idmp/features/dashboard/chartTheme.js')
const style = await import('../src/idmp/features/dashboard/visualStyle.js')
const background = await import('../src/idmp/features/dashboard/backgroundAssets.js')
const query = await import('../src/idmp/features/dashboard/queryAdapter.js')
const guidance = await import('../src/idmp/features/dashboard/widgetGuidance.js')
const drill = await import('../src/idmp/features/dashboard/drillDown.js')
const Empty = vue.defineComponent({ render: () => null })
const IdmpChart = vue.defineComponent({
  props: ['option'],
  setup: (props, { slots }) => () => vue.h('div', { class: 'chart-stub' }, [
    vue.h('pre', { class: 'numeric-chart-data' }, JSON.stringify(props.option)), slots.table?.()
  ])
})
const dependencies = { ...engine, ...theme, ...style, ...background, ...query, ...guidance, ...drill, IdmpChart, BackendChartDrill: Empty, KpiPresentation: Empty }
const { descriptor } = parse(await readFile(new URL('../src/idmp/features/dashboard/components/BindingWidget.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'table-format-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [original, local = original] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${original};`
  })).join('\n')
const BindingWidget = Function('vue', 'deps', `const { ${Object.keys(dependencies).join(',')} } = deps;\n${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, dependencies)

const field = (id, unit = '', semanticType = 'measure') => ({ id, label: id, unit, semanticType, dataType: semanticType === 'measure' ? 'number' : 'string' })
const dataset = () => ({
  id: 'backend', rowMode: 'PROJECTED',
  fields: [field('department', '', 'dimension'), field('value', 'PERCENT'), field('numeratorValue', 'PERSON_TIME'), field('denominatorValue', 'PERSON_TIME'), field('displayValue', 'PERCENT')],
  rows: [{ department: '0016', value: 1 / 429, numeratorValue: 1, denominatorValue: 429, displayValue: '0.23%' }]
})
const widget = (kind, extra = {}) => ({ id: 'percentage', type: 'chart', chartKind: kind, config: {
  dataBinding: { dataset: 'backend', dimensions: [{ field: 'department' }],
    measures: ['value', 'numeratorValue', 'denominatorValue'].map(field => ({ field, aggregation: 'direct' })), series: [], sort: [] }, ...extra
} })
const create = (definition, source = dataset()) => mount(BindingWidget, {
  props: { widget: definition, title: 'Mortality' },
  global: { provide: { dashboardBindingDatasets: () => [source] } }
})
const cells = wrapper => wrapper.findAll('tbody tr').map(row => row.findAll('td').map(cell => cell.text()))

test('chart data table formats each series without changing chart numeric values', () => {
  const source = dataset()
  const wrapper = create(widget('bar'), source)
  assert.deepEqual(cells(wrapper), [['未知科室（0016）', '0.23%', '1', '429']])
  const option = JSON.parse(wrapper.get('.numeric-chart-data').text())
  assert.equal(option.series[0].data[0], 1 / 429)
  assert.equal(option.series[1].data[0], 1)
  assert.equal(source.rows[0].value, 1 / 429)
  wrapper.unmount()
})

test('bound table and raw configured columns share percentage formatting', () => {
  for (const extra of [{}, { tableColumns: ['department', 'value', 'numeratorValue', 'denominatorValue', 'displayValue'] }]) {
    const wrapper = create(widget('table', extra))
    assert.deepEqual(cells(wrapper), [[extra.tableColumns ? '0016' : '未知科室（0016）', '0.23%', '1', '429', ...(extra.tableColumns ? ['0.23%'] : [])]])
    wrapper.unmount()
  }
})

test('already scaled percent, zero and missing values retain their distinct meanings', () => {
  const source = dataset()
  source.fields.find(field => field.id === 'value').unit = '%'
  source.rows = [
    { department: 'one', value: 100 / 429 },
    { department: 'zero', value: 0 },
    { department: 'missing', value: null }
  ]
  const definition = widget('table')
  definition.config.dataBinding.measures = [{ field: 'value', aggregation: 'direct' }]
  const wrapper = create(definition, source)
  assert.deepEqual(cells(wrapper), [['未知科室（one）', '0.23%'], ['未知科室（zero）', '0.00%'], ['未知科室（missing）', '—']])
  wrapper.unmount()
})

test('counting percentage-valued rows produces a count, not a percentage', () => {
  const source = dataset()
  delete source.rowMode
  source.rows.push({ ...source.rows[0] })
  const definition = widget('table')
  definition.config.dataBinding.measures = [{ field: 'value', aggregation: 'count' }]
  const wrapper = create(definition, source)
  assert.deepEqual(cells(wrapper), [['未知科室（0016）', '2']])
  wrapper.unmount()
})

test('unique formal rows retain backend precision in every table while numeric chart data stays unchanged', () => {
  for (const kind of ['bar', 'table']) for (const extra of [{}, { tableColumns: ['department', 'value', 'numeratorValue', 'denominatorValue'] }]) {
    const source = dataset()
    source.rows[0].displayValue = '0.233100%'
    const wrapper = create(widget(kind, extra), source)
    assert.equal(cells(wrapper)[0][1], '0.233100%')
    assert.equal(cells(wrapper)[0][2], '1')
    assert.equal(cells(wrapper)[0][3], '429')
    assert.equal(source.rows[0].value, 1 / 429)
    wrapper.unmount()
  }
})
