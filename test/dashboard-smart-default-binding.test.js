import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultBinding, isEmptyDashboardBinding, preferredMeasureAggregation } from '../src/idmp/features/dashboard/smartDefaultBinding.js'
import { applyDefaultDashboardBindings, dashboardFieldsToFrontend, sortDashboardDataSourcesByIndicatorCreatedAt, widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'

const fields = [
  { id: 'month', label: 'Month', semanticType: 'time' },
  { id: 'department', label: 'Department', semanticType: 'dimension' },
  { id: 'disease', label: 'Disease', semanticType: 'dimension' },
  { id: 'value', label: 'Value', semanticType: 'measure', recommendedAggregation: 'sum' },
  { id: 'target', label: 'Target', semanticType: 'measure' }
]
const dataset = (id = 'acceptance', availableFields = fields) => ({ id, fields: availableFields })

test('smart defaults create conservative bindings for regular charts and KPI', () => {
  assert.deepEqual(createDefaultBinding('bar', [dataset()]), { dataset: 'acceptance', dimensions: [{ field: 'department', label: 'Department' }], measures: [{ field: 'value', label: 'Value', aggregation: 'sum', axis: 'left' }], series: [], sort: [] })
  assert.equal(createDefaultBinding('line', [dataset()]).dimensions[0].field, 'month')
  assert.equal(createDefaultBinding('pie', [dataset()]).dimensions[0].field, 'department')
  assert.equal(createDefaultBinding('kpi', [dataset('current')]).measures[0].field, 'value')
  assert.equal(createDefaultBinding('gauge', [dataset('current')]).measures[0].field, 'value')
})

test('published indicator NONE capability becomes a direct backend result binding', () => {
  const fields = dashboardFieldsToFrontend([{
    code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE']
  }])
  assert.deepEqual(fields[0].aggregations, ['direct'])
  assert.equal(fields[0].defaultAggregation, undefined)
  assert.equal(preferredMeasureAggregation(fields[0]), 'direct')
  assert.equal(createDefaultBinding('kpi', [{ id: 'backend', fields }]).measures[0].aggregation, 'direct')
  assert.equal(preferredMeasureAggregation({ recommendedAggregation: 'sum', aggregations: ['avg', 'sum'] }), 'sum')
})

test('published mortality fields produce ready-to-preview chart and table defaults', () => {
  const publishedFields = dashboardFieldsToFrontend([
    { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', unit: 'PERCENT', aggregations: ['NONE'] },
    { code: 'periodStart', name: '统计开始时间', dataType: 'DATETIME', role: 'DIMENSION', filterable: true },
    { code: 'OUT_DEPT_CODE', name: '出院科室', dataType: 'STRING', role: 'DIMENSION', filterable: true, groupable: true },
    { code: 'OUT_DEPT_NAME', name: '出院科室', dataType: 'STRING', role: 'DIMENSION', filterable: true, groupable: true },
    { code: 'MAIN_DIAGNOSTIC', name: '主诊断', dataType: 'STRING', role: 'DIMENSION', filterable: true, groupable: true }
  ])
  const backend = [{ id: 'backend', fields: publishedFields }]
  for (const kind of ['bar', 'table', 'ranking']) {
    const binding = createDefaultBinding(kind, backend)
    assert.equal(binding.dataset, 'backend')
    assert.equal(binding.dimensions[0].field, 'OUT_DEPT_NAME')
    assert.deepEqual(binding.measures[0], { field: 'value', label: '指标值', aggregation: 'direct', axis: 'left' })
  }
  const line = createDefaultBinding('line', backend)
  assert.equal(line.dimensions[0].field, 'periodStart')
  assert.equal(line.measures[0].field, 'value')
})

test('saved backend widgets without bindings recover the same smart defaults', () => {
  const fields = [
    { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] },
    { code: 'periodStart', name: '统计开始时间', dataType: 'DATETIME', role: 'DIMENSION' },
    { code: 'OUT_DEPT_NAME', name: '出院科室', dataType: 'STRING', role: 'DIMENSION' }
  ]
  const schema = {
    widgets: [
      { id: 'bar', type: 'chart', chartKind: 'bar', sourceCode: 'mortality', config: {} },
      { id: 'line', type: 'chart', chartKind: 'line', sourceCode: 'mortality', config: {} },
      { id: 'table', type: 'chart', chartKind: 'table', sourceCode: 'mortality', config: {} }
    ]
  }
  const restored = applyDefaultDashboardBindings(schema, { mortality: fields })
  assert.equal(restored.widgets[0].config.dataBinding.dimensions[0].field, 'OUT_DEPT_NAME')
  assert.equal(restored.widgets[1].config.dataBinding.dimensions[0].field, 'periodStart')
  assert.equal(restored.widgets[2].config.dataBinding.dimensions[0].field, 'OUT_DEPT_NAME')
  assert.ok(restored.widgets.every(widget => widget.config.dataBinding.measures[0].field === 'value'))
})

test('saved bindings recover when a backend field no longer supports their aggregation', () => {
  const schema = {
    widgets: [{ id: 'kpi', type: 'kpi', sourceCode: 'mortality', config: { dataBinding: { dataset: 'current', dimensions: [], measures: [{ field: 'value', aggregation: 'avg', axis: 'left' }], series: [], sort: [] } } }]
  }
  const restored = applyDefaultDashboardBindings(schema, { mortality: [
    { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] }
  ] })
  assert.equal(restored.widgets[0].config.dataBinding.dataset, 'current')
  assert.equal(restored.widgets[0].config.dataBinding.measures[0].aggregation, 'direct')
})

test('backend result rows align dimension keys with field codes case-insensitively', () => {
  const dataset = widgetResultToDataset({
    status: 'READY',
    fields: [
      { code: 'OUT_DEPT_CODE', name: '出院科室', dataType: 'STRING', role: 'DIMENSION' },
      { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] }
    ],
    rows: [{ out_dept_code: '4', value: 0.2558 }]
  })
  assert.equal(dataset.rows[0].OUT_DEPT_CODE, '4')
  assert.equal(dataset.rows[0].out_dept_code, '4')
})

test('widget results retain catalog time fields omitted by a narrower preview field list', () => {
  const dataset = widgetResultToDataset({
    fields: [{ code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] }],
    rows: [{ periodStart: '2025-11-01T00:00:00', value: 0.2558 }]
  }, [
    { code: 'periodStart', name: '统计开始时间', dataType: 'DATETIME', role: 'DIMENSION' },
    { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', unit: 'PERCENT', aggregations: ['NONE'] }
  ])
  assert.ok(dataset.fields.some(field => field.id === 'periodStart' && field.semanticType === 'time'))
  assert.deepEqual(dataset.fields.find(field => field.id === 'periodStart').granularities, ['raw'])
  assert.equal(dataset.fields.find(field => field.id === 'value').unit, 'PERCENT')
})

test('dashboard result adapter exposes backend time comparisons as percentage points', () => {
  const dataset = widgetResultToDataset({
    status: 'READY',
    timeComparison: {
      yearOverYear: { status: 'COMPARABLE', relativeChangePercent: -2.35 },
      periodOverPeriod: { status: 'COMPARABLE', relativeChangePercent: 4.18 }
    }
  })
  assert.deepEqual(dataset.comparison, {
    yoy: -2.35, mom: 4.18, unit: '%', trendDirection: null
  })
})

test('dashboard result adapter keeps non-comparable changes empty and supports legacy comparisons', () => {
  const unavailable = widgetResultToDataset({
    timeComparison: {
      yearOverYear: { status: 'NOT_COMPARABLE', relativeChangePercent: null },
      monthOverMonth: { status: 'NOT_COMPARABLE', relativeChangePercent: null }
    }
  })
  assert.equal(unavailable.comparison.yoy, null)
  assert.equal(unavailable.comparison.mom, null)
  assert.equal(unavailable.comparison.unit, '%')

  assert.deepEqual(widgetResultToDataset({ comparison: { yoy: 1.2, mom: -0.4, unit: '%' } }).comparison, {
    yoy: 1.2, mom: -0.4, unit: '%', trendDirection: null
  })
})

test('published dashboard data sources show the most recently created indicators first', () => {
  const sources = [
    { code: 'without-time', indicatorId: '30' },
    { code: 'older', indicatorId: '10' },
    { code: 'newest', indicatorId: '20' },
    { code: 'same-time', indicatorId: '21' }
  ]
  const indicators = [
    { id: '20', createdAt: '2026-09-29T10:00:00+08:00' },
    { id: '21', createdAt: '2026-09-29T10:00:00+08:00' },
    { id: '10', createdAt: '2026-09-20T10:00:00+08:00' }
  ]
  assert.deepEqual(
    sortDashboardDataSourcesByIndicatorCreatedAt(sources, indicators).map(source => source.code),
    ['newest', 'same-time', 'older', 'without-time']
  )
  assert.deepEqual(
    sortDashboardDataSourcesByIndicatorCreatedAt(sources.slice(0, 2), []).map(source => source.code),
    ['without-time', 'older']
  )
})

test('smart defaults keep scatter and heatmap conservative and map unguessed', () => {
  const scatter = createDefaultBinding('scatter', [dataset()])
  assert.deepEqual(scatter.measures.map(item => item.field), ['value', 'target'])
  assert.equal(createDefaultBinding('scatter', [dataset('acceptance', fields.filter(field => field.id !== 'target'))]), null)
  const heatmap = createDefaultBinding('heatmap', [dataset()])
  assert.deepEqual([heatmap.dimensions[0].field, heatmap.series[0].field, heatmap.measures[0].field], ['month', 'department', 'value'])
  assert.equal(createDefaultBinding('heatmap', [dataset('acceptance', fields.filter(field => field.semanticType !== 'dimension'))]), null)
  assert.equal(createDefaultBinding('map', [dataset()]), null)
})

test('default selection respects an explicit empty dataset choice and existing bindings remain protected', () => {
  const source = [dataset('current', fields.filter(field => field.semanticType === 'measure')), dataset('departments')]
  assert.equal(createDefaultBinding('line', source).dataset, 'departments')
  assert.equal(createDefaultBinding('line', source, { datasetId: 'current' }), null)
  assert.equal(isEmptyDashboardBinding({ dataset: 'acceptance', dimensions: [], measures: [], series: [], sort: [] }), true)
  assert.equal(isEmptyDashboardBinding({ dataset: 'acceptance', dimensions: [{ field: 'department' }], measures: [], series: [], sort: [] }), false)
})
