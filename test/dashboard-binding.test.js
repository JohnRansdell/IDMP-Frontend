import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { createFieldCatalog, createWidgetBindingDatasets, numericValue } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { aggregateValues, compileWidgetData, validateWidgetBinding, hasDataBinding, bindingChartOption, formatDashboardKpiMetric, formatDashboardMetric } from '../src/idmp/features/dashboard/bindingEngine.js'
import { normalizeDashboardSchema, createPersistableDashboardSnapshot, updateDashboardWidget } from '../src/idmp/features/dashboard/schema.js'
import { persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'
import { createDashboardChartOption } from '../src/idmp/features/dashboard/visualization.js'
import { dashboardAcceptanceRows } from '../src/idmp/features/dashboard/acceptanceData.js'
import { applyIndicatorAnalysisToSource, createPublishedIndicatorSources } from '../src/idmp/features/dashboard/visualization.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '../src/idmp/features/dashboard/globalFilterCompatibility.js'
import { createDefaultBinding } from '../src/idmp/features/dashboard/smartDefaultBinding.js'

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
test('production summary source uses its explicit card key while preserving its indicator identity', () => {
  const source = {
    code: 'DEATH_COUNT', indicatorId: '1001', indicatorCode: 'DEATH_COUNT',
    dashboardSummaryKey: 'deathNum', name: '死亡人数'
  }
  const datasets = createWidgetBindingDatasets(source, {
    result: { summaryCards: { deathNum: { value: 12, indicatorId: '1001', indicatorCode: 'DEATH_COUNT' } } }
  })
  const current = datasets.find(item => item.id === 'current')
  assert.deepEqual(current.rows, [{ value: 12 }])
  assert.equal(current.fields.find(field => field.id === 'value').dataType, 'number')
  assert.equal(current.fields.find(field => field.id === 'value').semanticType, 'measure')
  const compiled = compileWidgetData('kpi', {
    dataset: 'current', dimensions: [], measures: [{ field: 'value', aggregation: 'sum' }], series: [], sort: []
  }, current)
  assert.equal(compiled.status, 'ready')
  assert.equal(compiled.value, 12)
})
test('published indicator binding uses only hydrated analysis rows and exposes only real filter fields', () => {
  const catalogSource = createPublishedIndicatorSources(
    [{ id: 'indicator-1', code: 'MORTALITY', name: 'Mortality', unit: '%' }],
    [{ id: 'version-1', indicatorId: 'indicator-1' }]
  )[0]
  assert.deepEqual(createWidgetBindingDatasets(catalogSource, { result: { monthlyTrend: [{ month: '2026-01', value: 99 }] } }), [])

  const hydrated = applyIndicatorAnalysisToSource(catalogSource, {
    dataAvailable: true,
    dimensionComparison: [
      { dimensions: { out_dept_code: 'RESP', out_dept_name: 'Respiratory' }, value: 0.12 }
    ]
  })
  const dataset = createWidgetBindingDatasets(hydrated).find(item => item.id === 'analysis')
  assert.deepEqual(dataset.rows, [{ out_dept_code: 'RESP', out_dept_name: 'Respiratory', value: 12 }])
  assert.equal(compileWidgetData('bar', {
    dataset: 'analysis', dimensions: [{ field: 'out_dept_name' }], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: []
  }, dataset).status, 'ready')

  const widget = { id: 'published-bar', type: 'chart', chartKind: 'bar', config: { dataBinding: { dataset: 'analysis', dimensions: [{ field: 'out_dept_name' }], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] } } }
  const getDatasets = () => [dataset]
  assert.deepEqual(resolveCompatibleGlobalFilterWidgetIds({ id: 'department', field: 'out_dept_name', dataType: 'string' }, [widget], getDatasets), ['published-bar'])
  assert.deepEqual(resolveCompatibleGlobalFilterWidgetIds({ id: 'disease', field: 'disease', dataType: 'string' }, [widget], getDatasets), [])
})

test('dashboard data sources expose separate current, trend and comparison analysis datasets', () => {
  const hydrated = applyIndicatorAnalysisToSource({
    code: 'mortality', name: 'Mortality', unit: 'PERCENT', origin: 'dashboard-data-source', originLabel: 'Published indicator'
  }, {
    dataAvailable: true,
    granularity: 'MONTHLY',
    overview: { periodStart: '2026-02-01', periodEnd: '2026-03-01', value: 0.2, numeratorValue: 2, denominatorValue: 10 },
    trend: [
      { periodStart: '2026-01-01', periodEnd: '2026-02-01', value: 0.1, numeratorValue: 1, denominatorValue: 10 },
      { periodStart: '2026-02-01', periodEnd: '2026-03-01', value: 0.2, numeratorValue: 2, denominatorValue: 10 }
    ],
    dimensionComparison: [
      { dimensions: { out_dept_code: 'A' }, value: 0.1, numeratorValue: 1, denominatorValue: 10 },
      { dimensions: { out_dept_code: 'A' }, value: 0.3, numeratorValue: 3, denominatorValue: 10 },
      { dimensions: { out_dept_code: 'B' }, value: 0.5, numeratorValue: 5, denominatorValue: 10 }
    ]
  })
  assert.equal(hydrated.origin, 'dashboard-data-source')
  assert.equal(hydrated.unit, '%')
  const datasets = createWidgetBindingDatasets(hydrated)
  assert.deepEqual(datasets.slice(0, 3).map(item => item.id), ['current', 'trend', 'departments'])
  assert.deepEqual(datasets.find(item => item.id === 'trend').rows.map(row => row.value), [10, 20])

  const trend = datasets.find(item => item.id === 'trend')
  const lineBinding = createDefaultBinding('line', datasets)
  assert.equal(lineBinding.dataset, 'trend')
  assert.equal(compileWidgetData('line', lineBinding, trend).status, 'ready')

  const departments = datasets.find(item => item.id === 'departments')
  const barBinding = createDefaultBinding('bar', datasets)
  assert.equal(barBinding.dataset, 'departments')
  assert.deepEqual(compileWidgetData('bar', barBinding, departments).series[0].values, [20, 50])
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

test('bar charts omit categories whose aggregated series are all zero', () => {
  const fields = createFieldCatalog([
    { department: '零值科室', value: 0, target: 0 },
    { department: '保留科室', value: 0, target: 2 },
    { department: '非零科室', value: 3, target: 0 }
  ])
  const source = {
    fields,
    rows: [
      { department: '零值科室', value: 0, target: 0 },
      { department: '保留科室', value: 0, target: 2 },
      { department: '非零科室', value: 3, target: 0 }
    ]
  }
  const config = {
    dataset: 'comparison',
    dimensions: [{ field: 'department' }],
    measures: [{ field: 'value', aggregation: 'avg' }, { field: 'target', aggregation: 'avg' }],
    series: [],
    sort: []
  }

  const bar = compileWidgetData('bar', config, source)
  assert.deepEqual(bar.categories, ['保留科室', '非零科室'])
  assert.deepEqual(bar.series.map(item => item.values), [[0, 3], [2, 0]])
  assert.deepEqual(compileWidgetData('line', config, source).categories, ['零值科室', '保留科室', '非零科室'])
  assert.equal(compileWidgetData('bar', config, { ...source, rows: [{ department: '零值科室', value: 0, target: 0 }] }).status, 'empty')
})

test('KPI display formatting removes floating-point tails without changing binding values', () => {
  assert.equal(formatDashboardMetric(6.403499999999999), '6.4')
  assert.equal(formatDashboardMetric(12), '12')
  assert.equal(formatDashboardMetric(null), '')
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
  const backendFields = [{ id: 'value', label: '指标值', semanticType: 'measure', aggregations: ['direct'] }]
  const backendBinding = { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] }
  assert.match(validateWidgetBinding('kpi', backendBinding, backendFields).errors.join('；'), /不支持平均值/)
  assert.equal(validateWidgetBinding('kpi', { ...backendBinding, measures: [{ field: 'value', aggregation: 'direct' }] }, backendFields).valid, true)
  for (const bad of [null, {}, { ...binding(), measures: [null] }, { ...binding(), sort: [null] }]) assert.equal(compileWidgetData('line', bad, dataset).status, 'invalid')
})

test('formal ratio rows with direct values regroup from complete numerator and denominator data', () => {
  const formal = {
    fields: [
      { id: 'OUT_DEPT_NAME', label: '出院科室', semanticType: 'dimension' },
      { id: 'value', label: '指标值', semanticType: 'measure', unit: 'PERCENT', aggregations: ['direct'] },
      { id: 'numeratorValue', label: '分子值', semanticType: 'measure' },
      { id: 'denominatorValue', label: '分母值', semanticType: 'measure' }
    ],
    rows: [
      { OUT_DEPT_NAME: '重症医学科', value: 1, numeratorValue: 1, denominatorValue: 1 },
      { OUT_DEPT_NAME: '重症医学科', value: 0.2, numeratorValue: 2, denominatorValue: 10 },
      { OUT_DEPT_NAME: '呼吸内科', value: 0.1, numeratorValue: 1, denominatorValue: 10 }
    ]
  }
  const binding = { dataset: 'backend', dimensions: [{ field: 'OUT_DEPT_NAME' }], measures: [{ field: 'value', aggregation: 'direct', axis: 'left' }], series: [], sort: [] }
  const model = compileWidgetData('bar', binding, formal)
  assert.equal(model.status, 'ready')
  assert.deepEqual(model.categories, ['重症医学科', '呼吸内科'])
  assert.deepEqual(model.series[0].values, [3 / 11, 0.1])
})

test('legacy code dimensions display their formal companion names while retaining raw tuples', () => {
  const formal = {
    fields: [
      { id: 'OUT_DEPT_CODE', label: '出院科室', semanticType: 'dimension' },
      { id: 'OUT_DEPT_NAME', label: '出院科室', semanticType: 'dimension' },
      { id: 'value', label: '指标值', semanticType: 'measure' }
    ],
    rows: [
      { OUT_DEPT_CODE: '16', OUT_DEPT_NAME: '呼吸与危重症医学科', value: 0.3 },
      { OUT_DEPT_CODE: '34', OUT_DEPT_NAME: '心血管内科', value: 0.2 }
    ]
  }
  const binding = { dataset: 'backend', dimensions: [{ field: 'OUT_DEPT_CODE' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
  const model = compileWidgetData('bar', binding, formal)
  assert.deepEqual(model.categories, ['呼吸与危重症医学科', '心血管内科'])
  assert.deepEqual(model.dimensionTuples, [{ OUT_DEPT_CODE: '16' }, { OUT_DEPT_CODE: '34' }])
})
test('KPI display formatting matches analysis percentage semantics and prefers backend displayValue', () => {
  assert.deepEqual(formatDashboardKpiMetric(0.003, { unit: 'PERCENT' }), { value: '0.30', unit: '%' })
  assert.deepEqual(formatDashboardKpiMetric(0.2558139535, { unit: '%', displayValue: '25.58%' }), { value: '25.58', unit: '%' })
  assert.deepEqual(formatDashboardKpiMetric(11, { unit: '%' }), { value: '11.00', unit: '%' })
  assert.deepEqual(formatDashboardKpiMetric(12, { unit: 'CURRENCY', displayValue: '¥12.00' }), { value: '¥12.00', unit: '' })
  assert.deepEqual(formatDashboardKpiMetric(1250, { unit: '人次' }), { value: '1,250', unit: '人次' })
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
test('bar points retain raw dimension codes when the axis displays companion names', () => {
  const fields = createFieldCatalog([{ OUT_DEPT_CODE: '28', OUT_DEPT_NAME: '神经内科', value: 0.01 }])
  const binding = { dataset: 'backend', dimensions: [{ field: 'OUT_DEPT_CODE' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
  const model = compileWidgetData('bar', binding, { fields, rows: [{ OUT_DEPT_CODE: '28', OUT_DEPT_NAME: '神经内科', value: 0.01 }] })
  assert.deepEqual(model.categories, ['神经内科'])
  assert.deepEqual(bindingChartOption('bar', model).series[0].data[0].dimensionValues, { OUT_DEPT_CODE: '28' })
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
