import test from 'node:test'
import assert from 'node:assert/strict'
import { createAcceptanceExampleSchema, createQualitySafetyShowcaseSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'
import { createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { deriveDependentFilterOptions, queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'
import { DASHBOARD_RECOVERY_STATUS, persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'

const schema = createAcceptanceExampleSchema({ id: 'acceptance-test', sceneCode: 'quality-safety' })
function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }
test('acceptance example is a valid five-widget current schema with filters and interactions', () => {
  assert.equal(schema.widgets.length, 5); assert.equal(schema.globalFilters.length, 2)
  const byTitle = Object.fromEntries(schema.widgets.map(item => [item.title, item]))
  assert.equal(schema.name, '质量安全综合看板')
  assert.equal(byTitle['质量安全综合指标'].type, 'kpi')
  assert.deepEqual(byTitle['科室质量指标对比 · 点击联动'].config.interaction.clickFilter.targetWidgetIds, ['acceptance-kpi', 'acceptance-line', 'acceptance-table'])
  assert.deepEqual(byTitle['科室层级分析 · 点击下钻'].config.interaction.drill.hierarchy, ['department', 'medicalGroup', 'doctor'])
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
  const dataset = createWidgetBindingDatasets(source, { demo: true }).find(item => item.id === 'acceptance')
  const fields = new Map(dataset.fields.map(field => [field.id, field]))
  for (const id of ['year','quarter','month','department','medicalGroup','doctor','disease','scene','indicatorCategory','indicatorValue','targetValue','numerator','denominator','yoy','mom']) assert.ok(fields.has(id))
  assert.equal(fields.get('department').label, '科室'); assert.equal(fields.get('indicatorValue').label, '指标值')
  const options = deriveDependentFilterOptions([dataset], schema.globalFilters, { department: ['呼吸内科'], disease: [] })
  assert.deepEqual(options.get('disease').sort(), ['COPD', '哮喘', '肺炎'].sort())
  const kpi = schema.widgets.find(item => item.id === 'acceptance-kpi')
  const all = queryWidgetDatasetWithRuntime(dataset, kpi, { definitions: schema.globalFilters, values: { department: [], disease: [] } })
  const respiratory = queryWidgetDatasetWithRuntime(dataset, kpi, { definitions: schema.globalFilters, values: { department: ['呼吸内科'], disease: [] } })
  assert.ok(respiratory.rows.length < all.rows.length)
})

test('acceptance cross filter changes KPI, line and table effective rows then clears without changing schema', () => {
  const source = { code: 'demo-quality', name: '演示', currentValue: 1, trendData: [], departmentData: [], pieData: [] }
  const dataset = createWidgetBindingDatasets(source, { demo: true }).find(item => item.id === 'acceptance')
  const baselineSchema = JSON.stringify(schema)
  const interactions = { 'interaction-acceptance-bar': { id: 'interaction-acceptance-bar', sourceWidgetId: 'acceptance-bar', field: 'department', value: '呼吸内科', targetWidgetIds: ['acceptance-kpi', 'acceptance-line', 'acceptance-table'] } }
  for (const id of ['acceptance-kpi', 'acceptance-line', 'acceptance-table']) {
    const widget = schema.widgets.find(item => item.id === id)
    const baseline = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions: {} })
    const filtered = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions })
    const restored = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: schema.globalFilters, values: { department: [], disease: [] }, interactions: {} })
    assert.ok(filtered.rows.length < baseline.rows.length, `${id} must receive the runtime interaction filter`)
    assert.deepEqual(restored.rows, baseline.rows)
  }
  assert.equal(JSON.stringify(schema), baselineSchema, 'runtime interaction state never mutates the persisted schema')
})
