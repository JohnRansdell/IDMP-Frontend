import test from 'node:test'
import assert from 'node:assert/strict'
import { widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'
import { effectiveDrill } from '../src/idmp/features/dashboard/drillDown.js'
import { buildRemoteWidgetQuery } from '../src/idmp/features/dashboard/remoteQuery.js'
import { createMultiIndicatorDataset, singleIndicatorProjectionBinding } from '../src/idmp/features/dashboard/multiIndicator.js'
import { loadBackendChartRoot, loadBackendChartLevel, initialBackendChartNavigation, projectedDrillNavigation, resolveChartDrillPath } from '../src/idmp/features/dashboard/backendChartDrill.js'

const fields = [
  { code: 'dept', name: 'Department', dataType: 'STRING', role: 'DIMENSION', filterable: true, groupable: true, aggregations: [] },
  { code: 'disease', name: 'Disease', dataType: 'STRING', role: 'DIMENSION', filterable: true, groupable: true, aggregations: [] },
  { code: 'value', name: 'Value', dataType: 'DECIMAL', role: 'MEASURE', filterable: true, aggregations: ['NONE'] }
]
const binding = { dataset: 'backend', dimensions: [{ field: 'dept' }], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] }
const dataset = rows => widgetResultToDataset({ status: 'READY', rowMode: 'PROJECTED', rows }, fields)

test('backend projection displays returned values without dividing or adding operands again', () => {
  const data = dataset([{ dept: 'A', value: 0.01084991, numeratorValue: 6, denominatorValue: 553 }])
  const model = compileWidgetData('bar', binding, data)
  assert.equal(data.rowMode, 'PROJECTED')
  assert.equal(data.serverCalculated, true)
  assert.equal(model.status, 'ready')
  assert.deepEqual(model.series[0].values, [0.01084991])
})

test('duplicate server tuples fail rather than summing numerator/denominator or averaging ratios', () => {
  const data = dataset([{ dept: 'A', value: 0.5, numeratorValue: 1, denominatorValue: 2 }, { dept: 'A', value: 0.1, numeratorValue: 1, denominatorValue: 10 }])
  const model = compileWidgetData('pie', binding, data)
  assert.equal(model.status, 'invalid')
  assert.match(model.message, /唯一粒度/)
  assert.equal(compileWidgetData('pie', { ...binding, measures: [{ field: 'value', aggregation: 'sum' }] }, data).status, 'invalid')
})

test('series pivot preserves sparse cells and unassigned dimensions without aggregation', () => {
  const data = dataset([{ dept: 'A', disease: 'X', value: 2 }, { dept: 'B', disease: 'Y', value: 3 }, { dept: null, disease: 'X', value: 4 }])
  const model = compileWidgetData('bar', { ...binding, series: [{ field: 'disease' }] }, data)
  assert.equal(model.status, 'ready')
  assert.deepEqual(model.categories, ['A', 'B', '未分配'])
  assert.deepEqual(model.series.map(item => item.values), [[2, null, 4], [null, 3, null]])
})

test('server-applied dimension filters are not rerun against projected rows lacking those fields', () => {
  const data = dataset([{ dept: 'A', value: 2 }])
  const widget = { id: 'bar', config: { dataBinding: { ...binding, filters: [{ field: 'disease', operator: 'equals', value: 'X' }] } } }
  const filtered = queryWidgetDatasetWithRuntime(data, widget, { interactions: { x: { id: 'x', field: 'disease', value: 'X', targetWidgetIds: ['bar'] } } })
  assert.equal(filtered.rows.length, 1)
  assert.deepEqual(filtered.filterDiagnostics, [])
})

test('cross-widget filters are included in backend requests and conflict intersections stay empty', () => {
  const widget = { id: 'bar', config: {} }
  const interactions = { x: { id: 'x', field: 'disease', value: 'X', targetWidgetIds: ['bar'] } }
  assert.deepEqual(buildRemoteWidgetQuery(widget, { fields, interactions }).query.filters, { disease: 'X' })
  const scoped = { ...widget, config: { query: { respondToInteractionFilters: false } } }
  assert.deepEqual(buildRemoteWidgetQuery(scoped, { fields, interactions }).query.filters, {})
})

test('projected results use backend drill instead of substituting a local hierarchy field', () => {
  const widget = { config: { dataBinding: binding, interaction: { drill: { hierarchy: ['disease', 'dept'] } } } }
  const effective = effectiveDrill(widget, dataset([{ dept: 'A', value: 2 }]))
  assert.equal(effective.binding, binding)
  assert.deepEqual(effective.hierarchy, [])
})

test('projected drill reuses the returned snapshot and carries filters through each level', async () => {
  const context = { resultId: '100', snapshotId: '200', parentKeys: { HOSPITAL_CODE: 'H' }, filters: { OUT_DEPT_CODE: '28', DISEASE: 'X' } }
  const root = await loadBackendChartRoot(() => { throw new Error('must not reload root') }, { resultId: '100', indicatorVersionId: '300', drillContext: context })
  const navigation = initialBackendChartNavigation(root)
  const result = await loadBackendChartLevel(async (id, payload) => {
    assert.equal(id, '100')
    assert.equal(payload.snapshotId, '200')
    assert.deepEqual(payload.filters, context.filters)
    return { context: { resultId: id, snapshotId: '200', indicatorVersionId: '300', currentLevel: 'OUT_DEPT', parentKeys: payload.parentKeys }, records: [], pageInfo: { total: 0, pageNum: 1, pageSize: 200, hasTotal: true, hasPageNum: true, hasPageSize: true } }
  }, root, navigation)
  assert.deepEqual(result.records, [])
})

test('drill uses exact department parents instead of remerging BASE rows for redundant department filters', () => {
  const path = { pathCode: 'ORGANIZATION', maxLevel: 'DOCTOR', levels: [
    { levelCode: 'HOSPITAL', dimensionFieldCode: 'HOSPITAL_CODE' },
    { levelCode: 'OUT_DEPT', memberKeyFieldCode: 'OUT_DEPT_CODE', dimensionFieldCode: 'OUT_DEPT_CODE', displayFieldCode: 'OUT_DEPT_NAME' },
    { levelCode: 'DOCTOR', dimensionFieldCode: 'DOCTOR_CODE' }
  ] }
  const navigation = projectedDrillNavigation({ out_dept_code: '28', OUT_DEPT_NAME: 'Neurology' }, path,
    { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: 'H' }, filters: { OUT_DEPT_CODE: ['28', '29'], OUT_DEPT_NAME: 'Neurology', disease: 'X' } })
  assert.equal(navigation.initialNavigation.currentLevel, 'DOCTOR')
  assert.deepEqual(navigation.initialNavigation.parentKeys, { HOSPITAL_CODE: 'H', OUT_DEPT_CODE: '28' })
  assert.deepEqual(navigation.filters, { OUT_DEPT_NAME: 'Neurology', disease: 'X' }, 'Explicit server filters remain intact; display names are not new parent keys')
  const legacyPath = projectedDrillNavigation({ out_dept_code: '28', OUT_DEPT_NAME: 'Neurology' }, { pathCode: 'ORGANIZATION', levels: null, maxLevel: 'ATTENDING_DOCTOR' },
    { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: 'H' }, filters: {}, fieldLevels: { HOSPITAL_CODE: 1, OUT_DEPT_CODE: 2, ATTENDING_DOCTOR: 3 } })
  assert.equal(legacyPath.initialNavigation.currentLevel, 'ATTENDING_DOCTOR')
})

test('missing backend dimension fields do not silently become an unassigned category', () => {
  const model = compileWidgetData('bar', binding, dataset([{ value: 2 }]))
  assert.equal(model.status, 'invalid')
  assert.match(model.message, /缺少组件维度/)
})

test('projected department names use configured custom levels and the returned snapshot', async () => {
  const levels = [{ levelCode: 'ROOT', levelName: '全部' },
    { levelCode: 'DEPT', levelName: '科室', dimensionFieldCode: 'department', displayFieldCode: 'department_name' },
    { levelCode: 'DOCTOR', dimensionFieldCode: 'doctor' }]
  for (const pathCode of ['CUSTOM_ORG', 'ORGANIZATION']) {
    const path = resolveChartDrillPath([{ pathCode, levels, maxLevel: 'DOCTOR' }], 'department')
    const root = await loadBackendChartRoot(() => { throw new Error('must not reload analysis') }, {
      resultId: '100', indicatorVersionId: '300', path,
      drillContext: { resultId: '100', snapshotId: '200', currentLevel: 'DEPT', parentKeys: {}, filters: {} }
    })
    const navigation = initialBackendChartNavigation(root)
    assert.equal(navigation.currentLevel, 'DEPT')
    await loadBackendChartLevel(async (id, payload) => {
      assert.equal(payload.pathCode, pathCode)
      assert.equal(payload.currentLevel, 'DEPT')
      assert.equal(payload.snapshotId, '200')
      return { context: { resultId: id, snapshotId: '200', indicatorVersionId: '300', currentLevel: 'DEPT', pathCode, parentKeys: {} },
        records: [], pageInfo: { total: 0, pageNum: 1, pageSize: 200, hasTotal: true, hasPageNum: true, hasPageSize: true } }
    }, root, navigation)
  }
})

test('multi-indicator requests retain dimensions but query source metric values directly', () => {
  const projected = singleIndicatorProjectionBinding({ ...binding, measures: [{ field: 'indicator__A', aggregation: 'direct' }], filters: [
    { field: 'disease', operator: 'equals', value: 'X' }, { field: 'indicator__A', operator: 'gt', value: 1 }
  ] }, fields)
  assert.deepEqual(projected.measures, [{ field: 'value', aggregation: 'direct' }])
  assert.deepEqual(projected.filters.map(item => item.field), ['disease'])
  const widget = { sourceCode: 'A', config: { indicatorBindings: [{ sourceCode: 'A', alias: 'A' }, { sourceCode: 'B', alias: 'B' }] } }
  const combined = createMultiIndicatorDataset(widget, new Map([
    ['A', [dataset([{ dept: 'A', value: 2 }])]],
    ['B', [dataset([{ dept: 'A', value: 3 }])]]
  ]))
  assert.equal(combined.rowMode, 'PROJECTED')
  assert.equal(combined.serverCalculated, true)
  assert.equal(combined.rows[0].indicator__A, 2)
  assert.equal(combined.rows[0].indicator__B, 3)
})
