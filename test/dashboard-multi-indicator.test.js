import test from 'node:test'
import assert from 'node:assert/strict'
import { createMultiIndicatorDataset, multiIndicatorMeasureField, validateComponentQueryScope, validateIndicatorBindings } from '../src/idmp/features/dashboard/multiIndicator.js'
import { bindingChartOption, compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { dashboardDetailToSchema, schemaToDashboardPayload, selectDashboardVersion } from '../src/idmp/api/adapters/dashboard.js'

const dimension = { id: 'month', label: '月份', dataType: 'string', semanticType: 'dimension' }
const measure = { id: 'value', label: '指标值', dataType: 'number', semanticType: 'measure', unit: '%' }

test('published dashboard viewer and editor select published and working versions independently', () => {
  const published = { id: 'published-v1', widgets: [{ code: 'published-widget' }] }
  const working = { id: 'working-v2', widgets: [{ code: 'draft-widget' }] }
  const detail = {
    dashboard: { currentPublishedVersionId: 'published-v1', workingVersionId: 'working-v2' },
    version: working
  }

  assert.equal(selectDashboardVersion(detail, [published, working], { editing: false }), published)
  assert.equal(selectDashboardVersion(detail, [published, working], { editing: true }), working)
  assert.equal(selectDashboardVersion(detail, [], { editing: true }), working)
})

test('multiple independent indicator sources align by a shared dimension without filling missing values', () => {
  const datasets = new Map([
    ['A', [{ id: 'analysis', fields: [dimension, measure], rows: [{ month: '2026-01', value: 1 }, { month: '2026-02', value: 2 }] }]],
    ['B', [{ id: 'analysis', fields: [dimension, measure], rows: [{ month: '2026-01', value: 10 }] }]]
  ])
  const widget = { sourceCode: 'A', sourceName: '指标 A', config: { indicatorBindings: [{ sourceCode: 'A', sourceName: '指标 A', alias: 'A', axis: 'left' }, { sourceCode: 'B', sourceName: '指标 B', alias: 'B', axis: 'right' }] } }
  const result = createMultiIndicatorDataset(widget, datasets)
  assert.equal(result.id, 'multi-indicator')
  assert.deepEqual(result.rows, [
    { month: '2026-01', [multiIndicatorMeasureField('A')]: 1, [multiIndicatorMeasureField('B')]: 10 },
    { month: '2026-02', [multiIndicatorMeasureField('A')]: 2 }
  ])
})

test('multi-indicator and component fixed scopes reject incomplete saved configuration', () => {
  assert.deepEqual(validateIndicatorBindings([{ sourceCode: 'A', alias: 'A', axis: 'left' }, { sourceCode: 'A', alias: '', axis: 'right' }], 'pie'), [
    'indicatorBindings[1].sourceCode is duplicated',
    'indicatorBindings[1].alias is required',
    'indicatorBindings[1].axis right is not supported'
  ])
  assert.deepEqual(validateComponentQueryScope({ periodMode: 'FIXED' }), ['fixed component period requires start and end'])
  assert.deepEqual(validateComponentQueryScope({ periodMode: 'FIXED', periodStart: '2026-09-01', periodEnd: '2026-09-30' }), [])
})

test('map rendering uses a real ECharts map only when a GeoJSON boundary is supplied', () => {
  const dataset = { fields: [{ id: 'region', label: '区域', dataType: 'string', semanticType: 'dimension' }, measure], rows: [{ region: 'A区', value: 12 }] }
  const binding = { dataset: 'map', dimensions: [{ field: 'region' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
  const model = compileWidgetData('map', binding, dataset)
  assert.deepEqual(bindingChartOption('map', model), {})
  const option = bindingChartOption('map', model, { mapDefinition: { name: 'demo', geoJSON: { type: 'FeatureCollection', features: [] } } })
  assert.equal(option.series[0].type, 'map')
  assert.equal(option.series[0].map, 'demo')
  assert.equal(option.__mapDefinition.name, 'demo')
})

test('multiple indicators and component query scope persist through the backend widget contract', () => {
  const indicatorBindings = [
    { sourceCode: 'A', sourceName: '指标 A', alias: 'A', axis: 'left' },
    { sourceCode: 'B', sourceName: '指标 B', alias: 'B', axis: 'right' }
  ]
  const backendQuery = {
    periodMode: 'FIXED', periodGranularity: 'MONTHLY', periodStart: '2026-01-01', periodEnd: '2026-06-30',
    organizationMode: 'FIXED', organizationLevel: 'DEPARTMENT', organizationIds: ['10', '20'],
    scenarioMode: 'FIXED', scenarioVersionIds: ['301']
  }
  const schema = {
    version: 1, id: 'multi-contract', name: '多指标看板', dashboardType: 'topic', scope: 'hospital',
    layout: { engine: 'gridstack', columns: 24, float: false }, appearance: {}, globalFilters: [],
    widgets: [{
      id: 'trend', type: 'chart', chartKind: 'line', title: '多指标趋势', sourceCode: 'A',
      layout: { x: 0, y: 0, w: 12, h: 5 },
      config: {
        indicatorBindings, backendQuery,
        dataBinding: { dataset: 'multi-indicator', dimensions: [{ field: 'month' }], measures: [{ field: 'indicator__A', axis: 'left' }, { field: 'indicator__B', axis: 'right' }], series: [], sort: [] }
      }
    }]
  }
  const payload = schemaToDashboardPayload(schema, { dataSources: [{ code: 'A', indicatorVersionId: 101 }, { code: 'B', indicatorVersionId: 202 }] })
  const remoteWidget = payload.widgets[0]
  assert.deepEqual(remoteWidget.indicatorVersionIds, ['101', '202'])
  assert.deepEqual(remoteWidget.chart.indicatorBindings, indicatorBindings)
  assert.equal(remoteWidget.query.periodGranularity, 'MONTHLY')
  assert.deepEqual(remoteWidget.query.organizationIds, ['10', '20'])

  const restored = dashboardDetailToSchema({ dashboard: { id: 'multi-contract', name: '多指标看板', type: 'TOPIC' }, version: { layout: payload.layout, widgets: payload.widgets } })
  assert.deepEqual(restored.widgets[0].config.indicatorBindings, indicatorBindings)
  assert.equal(restored.widgets[0].config.backendQuery.scenarioMode, 'FIXED')
  assert.deepEqual(restored.widgets[0].config.backendQuery.scenarioVersionIds, ['301'])
})
