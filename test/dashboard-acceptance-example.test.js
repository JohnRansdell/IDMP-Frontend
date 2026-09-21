import test from 'node:test'
import assert from 'node:assert/strict'
import { createAcceptanceExampleSchema, createQualitySafetyShowcaseSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'
import { createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { dashboardAcceptanceSources } from '../src/idmp/features/dashboard/acceptanceData.js'
import { deriveDependentFilterOptions, queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'
import { DASHBOARD_RECOVERY_STATUS, persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'

const schema = createAcceptanceExampleSchema({ id: 'acceptance-test', sceneCode: 'quality-safety' })
function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
test('acceptance example is a valid five-widget current schema with filters and interactions', () => {
  assert.equal(schema.widgets.length, 5); assert.equal(schema.globalFilters.length, 2)
  const byTitle = Object.fromEntries(schema.widgets.map(item => [item.title, item]))
  assert.equal(schema.name, '质量安全综合看板')
  assert.equal(byTitle['质量安全核心指标'].type, 'kpi')
  assert.equal(byTitle['科室质量对比'].sourceCode, 'UAT_QUALITY_SAFETY_Q3')
  assert.deepEqual(byTitle['科室质量对比'].config.dataBinding.filters, [{ field: 'month', operator: 'equals', value: '2026-09' }])
  assert.deepEqual(byTitle['科室质量对比'].config.interaction.clickFilter.targetWidgetIds, ['acceptance-table'])
  assert.equal(byTitle['组织层级分析'].sourceCode, 'UAT_ORGANIZATION_DRILL')
  assert.deepEqual(byTitle['组织层级分析'].config.interaction.drill.hierarchy, ['department', 'medicalGroup', 'doctor'])
  assert.deepEqual(byTitle['质量明细'].config.tableColumns, ['month', 'department', 'disease', 'indicatorValue'])
  assert.deepEqual(schema.widgets.map(item => item.layout), [
    { x: 0, y: 0, w: 4, h: 6 },
    { x: 4, y: 0, w: 10, h: 6 },
    { x: 14, y: 0, w: 10, h: 6 },
    { x: 0, y: 6, w: 13, h: 7 },
    { x: 13, y: 6, w: 11, h: 7 }
  ])
  assert.equal(schema.appearance.background.intensity, 100)
  assert.deepEqual(schema.globalFilters.find(item => item.id === 'disease').dependsOn, ['department'])
})

test('quality safety showcase retains the acceptance fixture structure without creating another scene', () => {
  const showcase = createQualitySafetyShowcaseSchema({ id: 'quality-overview-quality-safety', sceneCode: 'quality-safety' })
  assert.equal(showcase.id, 'quality-overview-quality-safety')
  assert.equal(showcase.sceneCode, 'quality-safety')
  assert.equal(showcase.widgets.length, 5)
  assert.equal(showcase.globalFilters.length, 2)
})

test('a saved quality safety dashboard remains the recovered scene schema rather than being replaced by its demo seed', () => {
  const storage = memoryStorage()
  const key = 'dashboard:quality-overview-quality-safety'
  const saved = createQualitySafetyShowcaseSchema({ id: 'quality-overview-quality-safety', sceneCode: 'quality-safety' })
  saved.name = '已保存的质量安全布局'
  persistDashboardSchema(storage, key, saved)
  const recovered = recoverDashboardSchema(storage, key)
  assert.equal(recovered.status, DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA)
  assert.equal(recovered.schema.name, '已保存的质量安全布局')
})
test('acceptance fields are visible and department changes effective data and dependent diseases', () => {
  const source = { code: 'demo-quality', name: '演示', currentValue: 1, trendData: [], departmentData: [], pieData: [] }
  const dataset = { ...createWidgetBindingDatasets(source, { demo: true }).find(item => item.id === 'acceptance'), sourceCode: 'UAT_QUALITY_SAFETY_Q3' }
  const fields = new Map(dataset.fields.map(field => [field.id, field]))
  for (const id of ['year','quarter','month','department','medicalGroup','doctor','disease','scene','indicatorCategory','indicatorValue','targetValue','numerator','denominator','yoy','mom']) assert.ok(fields.has(id))
  assert.equal(fields.get('department').label, '科室'); assert.equal(fields.get('indicatorValue').label, '指标值')
  const options = deriveDependentFilterOptions([dataset], schema.globalFilters, { department: ['呼吸内科'], disease: [] })
  assert.deepEqual(options.get('disease').sort(), ['慢阻肺', '肺炎'].sort())
  assert.deepEqual(options.get('department').sort(), ['呼吸内科', '心内科', '普外科'].sort())
  const cardiology = deriveDependentFilterOptions([dataset], schema.globalFilters, { department: ['心内科'], disease: ['心衰'] })
  assert.deepEqual(cardiology.get('disease').sort(), ['冠心病', '心衰'].sort())
  assert.deepEqual(cardiology.get('department').sort(), ['呼吸内科', '心内科', '普外科'].sort())
  const kpi = schema.widgets.find(item => item.id === 'acceptance-kpi')
  const all = queryWidgetDatasetWithRuntime(dataset, kpi, { definitions: schema.globalFilters, values: { department: [], disease: [] } })
  const respiratory = queryWidgetDatasetWithRuntime(dataset, kpi, { definitions: schema.globalFilters, values: { department: ['呼吸内科'], disease: [] } })
  assert.ok(respiratory.rows.length < all.rows.length)
})

test('acceptance cross filter changes KPI, line and table effective rows then clears without changing schema', () => {
  const source = { code: 'demo-quality', name: '演示', currentValue: 1, trendData: [], departmentData: [], pieData: [] }
  const dataset = createWidgetBindingDatasets(source, { demo: true }).find(item => item.id === 'acceptance')
  const baselineSchema = JSON.stringify(schema)
  const interactions = { 'interaction-acceptance-bar': { id: 'interaction-acceptance-bar', sourceWidgetId: 'acceptance-bar', field: 'department', value: '呼吸内科', targetWidgetIds: ['acceptance-table'] } }
  const widget = schema.widgets.find(item => item.id === 'acceptance-table')
  const baseline = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions: {} })
  const filtered = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions })
  const restored = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions: {} })
  assert.deepEqual(baseline.rows.map(row => [row.month, row.department, row.disease, row.indicatorValue]), [['2026-09','呼吸内科','慢阻肺',58],['2026-09','呼吸内科','肺炎',54],['2026-09','心内科','冠心病',50],['2026-09','心内科','心衰',48],['2026-09','普外科','阑尾炎',47],['2026-09','普外科','胆囊炎',45]])
  assert.deepEqual(filtered.rows.map(row => [row.month, row.department, row.disease, row.indicatorValue]), [['2026-09','呼吸内科','慢阻肺',58],['2026-09','呼吸内科','肺炎',54]])
  assert.deepEqual(restored.rows, baseline.rows)
  assert.equal(JSON.stringify(schema), baselineSchema, 'runtime interaction state never mutates the persisted schema')
})

test('quality safety drill source is ready without inspector configuration', () => {
  const drillWidget = schema.widgets.find(item => item.id === 'acceptance-drill')
  const source = dashboardAcceptanceSources.find(item => item.code === drillWidget.sourceCode)
  const [dataset] = createWidgetBindingDatasets(source)
  assert.equal(dataset.id, 'acceptance-drill')
  assert.deepEqual(dataset.rows.filter(row => row.department === '呼吸内科' && row.medicalGroup === '呼吸一组').map(row => row.value), [58, 55])
})
