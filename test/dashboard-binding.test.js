import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { createFieldCatalog, createWidgetBindingDatasets, numericValue } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { aggregateValues, compileWidgetData, validateWidgetBinding, hasDataBinding, bindingChartOption } from '../src/idmp/features/dashboard/bindingEngine.js'
import { normalizeDashboardSchema, createPersistableDashboardSnapshot, updateDashboardWidget } from '../src/idmp/features/dashboard/schema.js'
import { persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'
import { createDashboardChartOption } from '../src/idmp/features/dashboard/visualization.js'
import { dashboardAcceptanceRows } from '../src/idmp/features/dashboard/acceptanceData.js'

const rows = [
  { month: '1月', departmentName: '内科', value: 2, numerator: 4 },
  { month: '1月', departmentName: '外科', value: 6, numerator: 12 },
  { month: '2月', departmentName: '内科', value: 4, numerator: 8 },
  { month: '2月', departmentName: '外科', value: 8, numerator: 16 }
]
const dataset = { id: 'trend', rows, fields: createFieldCatalog(rows, { month: { dataType: 'date', semanticType: 'time', granularities: ['raw'] } }) }
const binding = () => ({ dataset: 'trend', dimensions: [{ field: 'month' }], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] })
test('field catalog classifies scalar fields and omits runtime objects', () => {
  const fields = createFieldCatalog([{ name: '内科', value: 0, date: '2026-01-01', enabled: true, runtime: {} }])
  assert.deepEqual(fields.map(field => [field.id, field.dataType, field.semanticType]), [['name','string','dimension'], ['value','number','measure'], ['date','date','time'], ['enabled','boolean','dimension']])
  assert.equal(numericValue(''), null); assert.equal(numericValue(null), null); assert.equal(numericValue('0.8%'), null); assert.equal(numericValue('2.5'), 2.5)
})
test('adapter never joins monthly rows with department snapshots or borrows summary trends', () => {
  const result = { summaryCards: { deathNum: 2 }, monthlyTrend: [{ month: 1, value: 300 }], departmentRanking: [{ deptName: '内科', value: 5 }] }
  const sources = createWidgetBindingDatasets({ code: 'dashboard-summary-deathNum', name: '死亡人数', trendData: [999] }, { result })
  assert.deepEqual(sources[0].rows, [{ value: 2 }]); assert.deepEqual(sources[1].rows, result.monthlyTrend)
  assert.equal(sources[1].fields.some(field => field.id === 'deptName'), false)
  assert.equal(createWidgetBindingDatasets(null).length, 0)
})
test('explicit acceptance dataset exposes clinical dimensions and independent measures', () => {
  const source = { code: 'demo-quality', name: '质量指标', currentValue: 1, trendData: [], departmentData: [], pieData: [] }
  const acceptance = createWidgetBindingDatasets(source, { demo: true }).find(item => item.id === 'acceptance')
  assert.deepEqual(acceptance.rows, dashboardAcceptanceRows)
  assert.deepEqual(['date', 'department', 'medicalGroup', 'doctor', 'disease', 'scene', 'indicatorCategory', 'indicatorValue', 'numerator', 'denominator', 'targetValue', 'yoy', 'mom'].every(id => acceptance.fields.some(field => field.id === id)), true)
  const lineBinding = { dataset: 'acceptance', dimensions: [{ field: 'month' }, { field: 'department' }], measures: [{ field: 'indicatorValue', aggregation: 'avg', axis: 'left' }, { field: 'targetValue', aggregation: 'avg', axis: 'right' }], series: [{ field: 'disease' }], sort: [] }
  const compiled = compileWidgetData('line', lineBinding, acceptance)
  assert.equal(compiled.status, 'ready')
  assert.ok(compiled.series.some(series => series.field === 'targetValue'))
})
test('all explicit aggregations exclude invalid numbers and preserve zero', () => {
  for (const [kind, value] of Object.entries({ sum: 6, avg: 2, max: 4, min: 0, count: 3 })) assert.equal(aggregateValues([0, '2', 4, null, undefined, NaN, Infinity, 'bad'], kind), value)
  assert.equal(aggregateValues([0], 'direct'), 0)
  assert.equal(aggregateValues([null], 'avg'), null)
  assert.throws(() => aggregateValues([2, 2], 'direct'), /多行/)
})
test('department grouping and aggregation produce correct values', () => {
  const config = binding(); config.dimensions = [{ field: 'departmentName' }]
  assert.deepEqual(compileWidgetData('bar', config, dataset).series[0].values, [3, 7])
})
test('series splitting and multiple measures align categories with null gaps', () => {
  const config = binding(); config.series = [{ field: 'departmentName' }]; config.measures.push({ field: 'numerator', aggregation: 'sum' })
  const result = compileWidgetData('line', config, { ...dataset, rows: rows.slice(0, 3) })
  assert.equal(result.series.length, 4)
  assert.deepEqual(result.series.map(item => item.values), [[2, 4], [4, 8], [6, null], [12, null]])
})
test('dimension numeric-aware sort and post-aggregation measure sort support both directions', () => {
  const config = binding(); config.sort = [{ field: 'value', direction: 'desc' }]
  assert.deepEqual(compileWidgetData('bar', config, dataset).categories, ['2月', '1月'])
  config.sort = [{ field: 'month', direction: 'asc' }]
  assert.deepEqual(compileWidgetData('line', config, dataset).categories, ['1月', '2月'])
})
test('capabilities reject wrong types, duplicate slots, unsupported granularity and malformed binding', () => {
  assert.equal(validateWidgetBinding('line', binding(), dataset.fields).valid, true)
  assert.equal(validateWidgetBinding('pie', { ...binding(), measures: [...binding().measures, { field: 'numerator', aggregation: 'sum' }] }, dataset.fields).valid, false)
  assert.equal(validateWidgetBinding('kpi', binding(), dataset.fields).valid, false)
  assert.equal(validateWidgetBinding('bar', { ...binding(), dimensions: [] }, dataset.fields).valid, false)
  assert.equal(validateWidgetBinding('bar', { ...binding(), measures: [{ field: 'departmentName', aggregation: 'sum' }] }, dataset.fields).valid, false)
  assert.equal(validateWidgetBinding('line', { ...binding(), dimensions: [{ field: 'month', granularity: 'year' }] }, dataset.fields).valid, false)
  for (const bad of [null, {}, { ...binding(), measures: [null] }, { ...binding(), sort: [null] }]) assert.equal(compileWidgetData('line', bad, dataset).status, 'invalid')
})
test('empty rows, missing dimensions/measures and illegal numbers do not crash', () => {
  for (const values of [[], [null], [{ value: 2 }], [{ month: '1月' }], [{ month: '1月', value: 'bad' }]]) assert.equal(compileWidgetData('line', binding(), { ...dataset, rows: values }).status, 'empty')
  const config = binding(); config.measures[0].aggregation = 'direct'
  assert.equal(compileWidgetData('line', config, dataset).status, 'invalid')
})
test('KPI, pie and ranking return renderer-independent models', () => {
  const config = binding(); config.dimensions = []
  assert.equal(compileWidgetData('kpi', config, dataset).value, 5)
  for (const type of ['pie', 'ranking']) assert.deepEqual(compileWidgetData(type, binding(), dataset).items, [{ name: '1月', value: 4 }, { name: '2月', value: 6 }])
  assert.equal(bindingChartOption('pie', compileWidgetData('pie', binding(), dataset)).series[0].type, 'pie')
})

test('advanced binding visualizations compile only their declared data shapes', () => {
  const radar = compileWidgetData('radar', { dataset: 'trend', dimensions: [{ field: 'month' }], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] }, dataset)
  assert.equal(radar.status, 'ready')
  assert.equal(bindingChartOption('radar', radar).series[0].type, 'radar')
  const funnel = compileWidgetData('funnel', { dataset: 'trend', dimensions: [{ field: 'departmentName' }], measures: [{ field: 'value', aggregation: 'sum' }], series: [], sort: [] }, dataset)
  assert.equal(bindingChartOption('funnel', funnel).series[0].type, 'funnel')
  const scatter = compileWidgetData('scatter', { dataset: 'trend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }, { field: 'numerator', aggregation: 'direct' }], series: [], sort: [] }, dataset)
  assert.equal(scatter.status, 'ready')
  assert.equal(bindingChartOption('scatter', scatter).series[0].type, 'scatter')
  assert.equal(validateWidgetBinding('scatter', { dataset: 'trend', dimensions: [], measures: [{ field: 'value', aggregation: 'sum' }], series: [], sort: [] }, dataset.fields).valid, false)
})

test('line and bar bindings support two X dimensions and independent left/right axes', () => {
  const fields = createFieldCatalog([{ department: '内科', month: '2026-01', value: 2, target: 3 }])
  const binding = { dataset: 'x', dimensions: [{ field: 'department' }, { field: 'month' }], measures: [{ field: 'value', aggregation: 'avg', axis: 'left' }, { field: 'target', aggregation: 'avg', axis: 'right' }], series: [], sort: [] }
  assert.deepEqual(validateWidgetBinding('line', binding, fields), { valid: true, errors: [] })
  const model = compileWidgetData('line', binding, { fields, rows: [{ department: '内科', month: '2026-01', value: 2, target: 3 }] })
  assert.deepEqual(model.categories, ['内科 / 2026-01'])
  assert.deepEqual(model.dimensionTuples, [{ department: '内科', month: '2026-01' }])
  assert.deepEqual(bindingChartOption('line', model).yAxis, [{ type: 'value' }, { type: 'value' }])
  assert.deepEqual(bindingChartOption('line', model).series.map(item => item.yAxisIndex), [0, 1])
  assert.equal(validateWidgetBinding('pie', { ...binding, dimensions: [binding.dimensions[0]] }, fields).valid, false)
})
test('reactive binding persistence is lossless and updates never touch geometry or style', () => {
  const schema = reactive(normalizeDashboardSchema({ version: 1, id: 'binding-test', widgets: [{ id: 'a', type: 'chart', chartKind: 'line', config: { style: { borderRadius: 12 } }, layout: { x: 0, y: 0, w: 6, h: 4 } }] }))
  const changed = updateDashboardWidget(schema, 'a', widget => ({ ...widget, config: { ...widget.config, dataBinding: reactive(binding()) } }))
  assert.deepEqual(changed.widgets[0].layout, schema.widgets[0].layout)
  assert.deepEqual(changed.widgets[0].config.style, schema.widgets[0].config.style)
  const storage = new Map(); const local = { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) ?? null }
  persistDashboardSchema(local, 'test', changed)
  const restored = recoverDashboardSchema(local, 'test').schema
  assert.deepEqual(restored.widgets[0].config.dataBinding, binding())
  assert.deepEqual(createPersistableDashboardSnapshot(restored), JSON.parse(JSON.stringify(createPersistableDashboardSnapshot(changed))))
})
test('legacy widgets do not enter binding mode and preset output remains identical', () => {
  const widget = { type: 'chart', preset: 'trend', chartKind: 'line', config: {} }
  const option = { series: [{ type: 'line', data: [1, 2] }] }
  assert.equal(hasDataBinding(widget), false)
  assert.equal(createDashboardChartOption(widget, { trendOption: option }), option)
  assert.equal(hasDataBinding({ config: { dataBinding: null } }), true)
})
