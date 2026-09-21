import test from 'node:test'
import assert from 'node:assert/strict'
import { changeDashboardGridColumns, normalizeDashboardSchema, validateDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { createKpiData, normalizeTrendDirection } from '../src/idmp/features/dashboard/visualization.js'
import { DASHBOARD_STUDIO_MENU_COMMANDS, createLocalDashboard, duplicateLocalDashboard, readDashboardCatalog, removeLocalDashboard, renameLocalDashboard, saveDashboardToCatalog } from '../src/idmp/features/dashboard/catalog.js'
import { BUILT_IN_LAYOUT_TEMPLATES } from '../src/idmp/features/dashboard/layoutTemplates.js'
import { dashboardAcceptanceDrillRows, dashboardAcceptanceDualAxisRows, dashboardAcceptanceKpis, dashboardAcceptanceMapRows, dashboardAcceptanceRows, dashboardAcceptanceSources } from '../src/idmp/features/dashboard/acceptanceData.js'
import { aggregateValues, bindingChartOption, compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { canApplyDashboardLoad, createDashboardSelectorOptions, dashboardOrigin, shouldSkipRemoteDashboardBootstrap } from '../src/idmp/features/dashboard/dashboardIdentity.js'
import { LOCAL_SCENE_DASHBOARDS } from '../src/idmp/features/dashboard/sceneRegistry.js'

const storage = () => { const values = new Map(); return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) } }
const schema = id => normalizeDashboardSchema({ version: 1, id, name: '自定义质量看板', dashboardType: 'custom', category: '质量', scope: 'personal', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [{ id: 'kpi', type: 'kpi', layout: { x: 0, y: 0, w: 6, h: 3 }, config: {} }, { id: 'text', type: 'text', layout: { x: 6, y: 0, w: 6, h: 3 }, config: { text: { title: '说明', body: '演示说明' } } }] })
test('FR-M8 acceptance: KPI comparisons preserve explicit direction and legacy fallback', () => {
  assert.equal(createKpiData({ code: 'a', name: '指标', currentValue: 52.63, unit: '%', mom: '+1.24%', yoy: '+3.18%', trendDirection: 'up' }).trendDirection, 'up')
  assert.equal(normalizeTrendDirection(undefined, '↓ 1.2%'), 'down'); assert.equal(normalizeTrendDirection(undefined, '0%'), 'flat')
})
test('FR-M8 acceptance: text persists and 24/12 conversion stays valid without overlap', () => {
  const twelve = changeDashboardGridColumns(schema('grid'), 12), roundTrip = changeDashboardGridColumns(twelve, 24)
  assert.equal(twelve.layout.columns, 12); assert.equal(roundTrip.layout.columns, 24); assert.equal(validateDashboardSchema(roundTrip).valid, true)
  for (const widget of twelve.widgets) assert.ok(widget.layout.x + widget.layout.w <= 12)
})
test('FR-M8 acceptance: local dashboard catalog creates, duplicates and deletes independently', () => {
  const local = storage(), original = schema('custom-one'); local.setItem('idmp:dashboard-schema:v1:custom-one', JSON.stringify(original)); saveDashboardToCatalog(original, local)
  const copy = duplicateLocalDashboard('custom-one', local, 'custom-copy'); assert.equal(copy.name, '自定义质量看板 - 副本'); assert.equal(readDashboardCatalog(local).length, 2)
  removeLocalDashboard('custom-copy', local); assert.equal(readDashboardCatalog(local).length, 1); assert.ok(local.getItem('idmp:dashboard-schema:v1:custom-one'))
})
test('FR-M8 acceptance: create, template, rename and protection keep schema/catalog consistent', () => {
  const local = storage()
  const blank = createLocalDashboard({ name: '空白', dashboardType: 'custom', scope: 'personal' }, { storage: local, id: 'blank' })
  assert.equal(validateDashboardSchema(blank).valid, true); assert.equal(blank.widgets.length, 0)
  const templated = createLocalDashboard({ name: '专题', dashboardType: 'topic', scope: 'hospital' }, { storage: local, id: 'topic', template: BUILT_IN_LAYOUT_TEMPLATES[1] })
  assert.equal(validateDashboardSchema(templated).valid, true); assert.ok(templated.widgets.length)
  renameLocalDashboard('topic', '专题 B', local)
  assert.equal(JSON.parse(local.getItem('idmp:dashboard-schema:v1:topic')).name, '专题 B'); assert.equal(readDashboardCatalog(local).find(item => item.id === 'topic').name, '专题 B')
  assert.throws(() => removeLocalDashboard('quality-overview', local), /不能删除/)
})
test('FR-M8 acceptance: fixed KPI, monthly, series, dual-axis and sort results are reproducible', () => {
  assert.deepEqual(dashboardAcceptanceKpis.map(item => item.trendDirection), ['up', 'down', 'flat'])
  const byMonth = month => dashboardAcceptanceRows.filter(row => row.month === month)
  assert.deepEqual(['2026-07','2026-08','2026-09'].map(month => Number(aggregateValues(byMonth(month).map(row => row.indicatorValue), 'avg').toFixed(2))), [47.33,48.83,50.33])
  const series = department => ['2026-07','2026-08','2026-09'].map(month => aggregateValues(byMonth(month).filter(row => row.department === department).map(row => row.indicatorValue), 'avg'))
  assert.deepEqual(series('呼吸内科'), [52,54,56]); assert.deepEqual(series('心内科'), [47,48,49]); assert.deepEqual(series('普外科'), [43,44.5,46])
  assert.deepEqual(['2026-07','2026-08','2026-09'].map(month => [aggregateValues(byMonth(month).map(row => row.numerator), 'sum'), aggregateValues(byMonth(month).map(row => row.denominator), 'sum')]), [[284,600],[293,600],[302,600]])
  assert.deepEqual(seriesOrder('2026-09', 'desc'), ['呼吸内科','心内科','普外科']); assert.deepEqual(seriesOrder('2026-09', 'asc'), ['普外科','心内科','呼吸内科'])
})
test('FR-M8 acceptance: UAT numerator and denominator use explicit left and right Y axes', () => {
  const source = dashboardAcceptanceSources.find(item => item.code === 'UAT_QUALITY_SAFETY_Q3')
  const [dataset] = createWidgetBindingDatasets(source)
  const binding = { dataset: 'acceptance', dimensions: [{ field: 'month' }], measures: [{ field: 'numerator', aggregation: 'sum', axis: 'left' }, { field: 'denominator', aggregation: 'sum', axis: 'right' }], series: [], sort: [] }
  const model = compileWidgetData('line', binding, dataset)
  assert.deepEqual(model.series.map(item => item.axis), ['left', 'right'])
  assert.deepEqual(model.series.map(item => item.values), [[284, 293, 302], [600, 600, 600]])
  const option = bindingChartOption('line', model)
  assert.deepEqual(option.yAxis, [{ type: 'value' }, { type: 'value' }])
  assert.deepEqual(option.series.map(item => item.yAxisIndex), [0, 1])
})
test('FR-M8 acceptance: dedicated dual-Y source uses readable distinct measures with direct aggregation', () => {
  const source = dashboardAcceptanceSources.find(item => item.code === 'UAT_DUAL_AXIS_MONTHLY')
  const [dataset] = createWidgetBindingDatasets(source)
  assert.deepEqual(dataset.rows, dashboardAcceptanceDualAxisRows)
  assert.deepEqual(dataset.fields.map(field => [field.id, field.label]), [['month', '月份'], ['actualValue', '实际值'], ['targetValue', '目标值']])
  const binding = { dataset: 'acceptance-dual-axis', dimensions: [{ field: 'month' }], measures: [{ field: 'actualValue', aggregation: 'direct', axis: 'left' }, { field: 'targetValue', aggregation: 'direct', axis: 'right' }], series: [], sort: [] }
  const model = compileWidgetData('line', binding, dataset)
  assert.deepEqual(model.series.map(item => [item.name, item.axis, item.values]), [['实际值', 'left', [47.33, 48.83, 50.33]], ['目标值', 'right', [50, 50, 50]]])
})
test('FR-M8 acceptance: dependent, scene/category, component and cross-filter rows are exact', () => {
  const respiratory = dashboardAcceptanceRows.filter(row => row.department === '呼吸内科'); assert.deepEqual([...new Set(respiratory.map(row => row.disease))], ['慢阻肺','肺炎'])
  const review = dashboardAcceptanceRows.filter(row => row.scene === '医院评审'); assert.deepEqual([...new Set(review.map(row => row.department))], ['心内科']); assert.deepEqual([...new Set(review.map(row => row.disease))], ['冠心病','心衰'])
  const surgery = dashboardAcceptanceRows.filter(row => row.indicatorCategory === '手术质量'); assert.deepEqual([...new Set(surgery.map(row => row.department))], ['普外科'])
  assert.deepEqual(dashboardAcceptanceRows.filter(row => row.disease === '慢阻肺').map(row => row.indicatorValue), [54,56,58])
  const cross = dashboardAcceptanceRows.filter(row => row.month === '2026-09' && row.department === '呼吸内科').map(row => [row.department,row.disease,row.indicatorValue]); assert.deepEqual(cross, [['呼吸内科','慢阻肺',58],['呼吸内科','肺炎',54]])
})
test('FR-M8 acceptance: drill and map fixtures retain their precise expected values', () => {
  const group = dashboardAcceptanceDrillRows.filter(row => row.department === '呼吸内科'); assert.equal(aggregateValues(group.filter(row => row.medicalGroup === '呼吸一组').map(row => row.value), 'avg'), 56.5); assert.equal(aggregateValues(group.filter(row => row.medicalGroup === '呼吸二组').map(row => row.value), 'avg'), 53)
  assert.deepEqual(group.filter(row => row.medicalGroup === '呼吸一组').map(row => [row.doctor,row.value]), [['张医生',58],['周医生',55]]); assert.deepEqual(dashboardAcceptanceMapRows, [{ region:'东区',value:82 },{ region:'西区',value:67 },{ region:'南区',value:74 },{ region:'北区',value:59 }])
})
test('FR-M8 acceptance: UAT sources are visible, unique and expose their exact binding contracts', () => {
  const names = dashboardAcceptanceSources.map(source => source.name)
  assert.deepEqual(names.slice(0, 4), ['[UAT] 男性出院患者占比（趋势↑）', '[UAT] 住院患者死亡率（趋势↓）', '[UAT] 手术并发症发生率（趋势↔）', '[UAT] 质量安全综合数据（2026 Q3 · 18条）'])
  assert.equal(new Set(names).size, names.length)
  assert.ok(dashboardAcceptanceSources.every(source => source.origin === 'acceptance'))
  const composite = dashboardAcceptanceSources.find(source => source.code === 'UAT_QUALITY_SAFETY_Q3')
  const [dataset] = createWidgetBindingDatasets(composite)
  assert.equal(dataset.rows.length, 18)
  for (const field of ['month', 'department', 'disease', 'scene', 'indicatorCategory', 'numerator', 'denominator', 'indicatorValue']) assert.ok(dataset.fields.some(item => item.id === field))
  const drill = dashboardAcceptanceSources.find(source => source.name === '[UAT] 组织层级下钻数据')
  const map = dashboardAcceptanceSources.find(source => source.name === '[UAT] 区域分布数据')
  assert.deepEqual(createWidgetBindingDatasets(drill)[0].fields.map(field => field.id), ['department', 'medicalGroup', 'doctor', 'value'])
  assert.deepEqual(createWidgetBindingDatasets(map)[0].fields.map(field => field.id), ['region', 'value'])
})
test('FR-M8 acceptance: visible Studio command model maps to protected local-dashboard operations', () => {
  assert.deepEqual(DASHBOARD_STUDIO_MENU_COMMANDS.map(item => item.id), ['create-blank', 'create-template', 'rename', 'copy', 'delete'])
  assert.equal(DASHBOARD_STUDIO_MENU_COMMANDS.find(item => item.id === 'delete').destructive, true)
  assert.throws(() => removeLocalDashboard('quality-overview', storage()), /不能删除/)
})
test('FR-M8 acceptance: selector joins system scenes and local catalog with one canonical id', () => {
  const local = storage()
  const blank = createLocalDashboard({ name: 'UAT 空白看板', dashboardType: 'custom', category: 'UAT', scope: 'personal' }, { storage: local, id: 'uat-blank' })
  assert.equal(blank.widgets.length, 0)
  const options = createDashboardSelectorOptions(LOCAL_SCENE_DASHBOARDS, readDashboardCatalog(local))
  assert.deepEqual(options.map(item => item.name), ['绩效考核', '医院评审', '质量安全', 'UAT 空白看板'])
  assert.deepEqual(options.map(item => item.id), [...LOCAL_SCENE_DASHBOARDS.map(item => item.dashboardId), 'uat-blank'])
  assert.equal(dashboardOrigin('uat-blank'), 'local'); assert.equal(shouldSkipRemoteDashboardBootstrap('uat-blank'), true)
  assert.equal(dashboardOrigin(LOCAL_SCENE_DASHBOARDS[2].dashboardId), 'system-scene'); assert.equal(shouldSkipRemoteDashboardBootstrap(LOCAL_SCENE_DASHBOARDS[2].dashboardId), false)
})
test('FR-M8 acceptance: valid empty local schema stays empty across persistence recovery', () => {
  const local = storage()
  const blank = createLocalDashboard({ name: '空白', dashboardType: 'custom', scope: 'personal' }, { storage: local, id: 'empty-local' })
  assert.equal(blank.widgets.length, 0)
  assert.equal(JSON.parse(local.getItem('idmp:dashboard-schema:v1:empty-local')).widgets.length, 0)
})
test('FR-M8 acceptance: stale dashboard loads cannot apply after canonical identity changes', () => {
  assert.equal(canApplyDashboardLoad({ generation: 4, latestGeneration: 4, targetDashboardId: 'quality-overview-quality-safety', activeDashboardId: 'quality-overview-quality-safety' }), true)
  assert.equal(canApplyDashboardLoad({ generation: 3, latestGeneration: 4, targetDashboardId: 'quality-overview-quality-safety', activeDashboardId: 'uat-local' }), false)
  assert.equal(canApplyDashboardLoad({ generation: 4, latestGeneration: 4, targetDashboardId: 'quality-overview-quality-safety', activeDashboardId: 'uat-local' }), false)
})
function seriesOrder(month, direction) { return [...new Set(dashboardAcceptanceRows.map(row => row.department))].map(department => [department, aggregateValues(dashboardAcceptanceRows.filter(row => row.month === month && row.department === department).map(row => row.indicatorValue), 'avg')]).sort((a,b) => (a[1] - b[1]) * (direction === 'asc' ? 1 : -1)).map(item => item[0]) }
