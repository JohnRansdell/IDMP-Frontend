import test from 'node:test'
import assert from 'node:assert/strict'
import { createAcceptanceExampleSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'
import { createWidgetBindingDatasets } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { deriveDependentFilterOptions, queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'

const schema = createAcceptanceExampleSchema({ id: 'acceptance-test', sceneCode: 'performance' })
test('acceptance example is a valid five-widget current schema with filters and interactions', () => {
  assert.equal(schema.widgets.length, 5); assert.equal(schema.globalFilters.length, 2)
  const byTitle = Object.fromEntries(schema.widgets.map(item => [item.title, item]))
  assert.equal(byTitle['全院指标值'].type, 'kpi')
  assert.deepEqual(byTitle['科室指标对比'].config.interaction.clickFilter.targetWidgetIds, ['acceptance-kpi', 'acceptance-line', 'acceptance-table'])
  assert.deepEqual(byTitle['组织层级下钻'].config.interaction.drill.hierarchy, ['department', 'medicalGroup', 'doctor'])
  assert.deepEqual(schema.globalFilters.find(item => item.id === 'disease').dependsOn, ['department'])
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
