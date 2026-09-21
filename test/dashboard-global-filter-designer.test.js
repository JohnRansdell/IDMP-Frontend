import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createFieldCatalog } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { createGlobalFilterDefinition, applyGlobalFilterScope, globalFilterScopeTargetIds, removeGlobalFilter } from '../src/idmp/features/dashboard/globalFilterDesignerModel.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '../src/idmp/features/dashboard/globalFilterCompatibility.js'
import { initialFilterValues } from '../src/idmp/features/dashboard/filterEngine.js'
import { deriveDependentFilterOptions, queryWidgetDataset, queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'
import { createQualitySafetyDemoSchema } from '../src/idmp/features/dashboard/acceptanceExample.js'

const rows = [
  { department: '呼吸内科', disease: '肺炎', indicatorValue: 4 },
  { department: '呼吸内科', disease: 'COPD', indicatorValue: 6 },
  { department: '心内科', disease: '肺炎', indicatorValue: 8 },
  { department: '心内科', disease: '冠心病', indicatorValue: 10 }
]
const catalog = createFieldCatalog(rows)
const departmentField = catalog.find(field => field.id === 'department')
const diseaseField = catalog.find(field => field.id === 'disease')
const widget = id => ({ id, type: 'chart', chartKind: 'bar', config: { dataBinding: { dataset: 'quality', dimensions: [{ field: 'department' }], measures: [{ field: 'indicatorValue', aggregation: 'avg' }], series: [], sort: [] } } })
const memoryStorage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }

function boundWidget(id, kind) {
  return {
    id,
    type: kind === 'kpi' ? 'kpi' : 'chart',
    ...(kind === 'kpi' ? {} : { chartKind: kind }),
    config: { dataBinding: { dataset: 'quality', dimensions: kind === 'kpi' ? [] : [{ field: 'department' }], measures: [{ field: 'indicatorValue', aggregation: 'avg' }], series: [], sort: [] } }
  }
}

test('a normal dashboard creates, persists, and applies a department global filter', () => {
  const department = createGlobalFilterDefinition(departmentField)
  assert.deepEqual({ label: department.label, field: department.field, dataType: department.dataType, type: department.type, defaultValue: department.defaultValue }, { label: '科室', field: 'department', dataType: 'string', type: 'multi-select', defaultValue: [] })
  const schema = normalizeDashboardSchema({ version: 1, id: 'normal-dashboard', globalFilters: [department], widgets: [widget('bar')] })
  const storage = memoryStorage(); persistDashboardSchema(storage, 'normal-dashboard', schema)
  const recovered = recoverDashboardSchema(storage, 'normal-dashboard').schema
  assert.deepEqual(recovered.globalFilters, [department])
  const dataset = { id: 'quality', rows, fields: catalog }
  assert.equal(queryWidgetDataset(dataset, recovered.widgets[0], recovered.globalFilters, initialFilterValues(recovered.globalFilters)).rows.length, 4)
  assert.equal(queryWidgetDataset(dataset, recovered.widgets[0], recovered.globalFilters, { [department.id]: ['呼吸内科'] }).rows.length, 2)
})

test('dependent disease options use the ordinary department filter and invalid selections stay runtime-only', () => {
  const department = createGlobalFilterDefinition(departmentField)
  const disease = { ...createGlobalFilterDefinition(diseaseField, [department]), dependsOn: [department.id] }
  const definitions = [department, disease]
  const dataset = { id: 'quality', rows, fields: catalog }
  assert.deepEqual(deriveDependentFilterOptions([dataset], definitions, { [department.id]: ['呼吸内科'], [disease.id]: [] }).get(disease.id).sort(), ['COPD', '肺炎'])
  const schema = normalizeDashboardSchema({ version: 1, id: 'runtime-only', globalFilters: definitions, widgets: [widget('bar')] })
  const before = JSON.stringify(schema)
  const values = initialFilterValues(schema.globalFilters); values[department.id] = ['呼吸内科']
  assert.equal(JSON.stringify(schema), before)
})

test('specific-widget scope and deletion reuse ignoredGlobalFilterIds without a second scope contract', () => {
  const department = createGlobalFilterDefinition(departmentField)
  const widgets = [widget('bar'), widget('table')]
  const scoped = applyGlobalFilterScope(widgets, department.id, ['bar'])
  assert.deepEqual(globalFilterScopeTargetIds(scoped, department.id), ['bar'])
  assert.deepEqual(scoped[1].config.query.ignoredGlobalFilterIds, [department.id])
  const removed = removeGlobalFilter([department], scoped, department.id)
  assert.deepEqual(removed.definitions, [])
  assert.deepEqual(removed.widgets[1].config.query.ignoredGlobalFilterIds, undefined)
})

test('a normal bound dashboard propagates global values into rows and KPI, bar, and table view models', () => {
  const department = createGlobalFilterDefinition(departmentField)
  const dataset = { id: 'quality', rows, fields: catalog }
  const widgets = [boundWidget('kpi', 'kpi'), boundWidget('bar', 'bar'), boundWidget('table', 'table'), { id: 'preset', type: 'chart', chartKind: 'bar', config: {} }]
  const compatible = resolveCompatibleGlobalFilterWidgetIds(department, widgets, () => [dataset])
  assert.deepEqual(compatible, ['kpi', 'bar', 'table'])

  for (const widget of widgets.filter(item => item.id !== 'preset')) {
    const before = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: [department], values: { [department.id]: [] } })
    const after = queryWidgetDatasetWithRuntime(dataset, widget, { definitions: [department], values: { [department.id]: ['呼吸内科'] } })
    const kind = widget.type === 'kpi' ? 'kpi' : widget.chartKind
    assert.equal(before.rows.length, 4, `${widget.id} must begin with all raw rows`)
    assert.equal(after.rows.length, 2, `${widget.id} must receive the department filter before aggregation`)
    assert.notEqual(JSON.stringify(compileWidgetData(kind, widget.config.dataBinding, before)), JSON.stringify(compileWidgetData(kind, widget.config.dataBinding, after)), `${widget.id} view model must change`)
  }

  const scoped = applyGlobalFilterScope(widgets, department.id, ['kpi', 'table'], compatible)
  const selected = { [department.id]: ['呼吸内科'] }
  assert.equal(queryWidgetDataset(dataset, scoped.find(item => item.id === 'kpi'), [department], selected).rows.length, 2)
  assert.equal(queryWidgetDataset(dataset, scoped.find(item => item.id === 'table'), [department], selected).rows.length, 2)
  assert.equal(queryWidgetDataset(dataset, scoped.find(item => item.id === 'bar'), [department], selected).rows.length, 4)
  assert.deepEqual(globalFilterScopeTargetIds(scoped, department.id, compatible), ['kpi', 'table'])
})

test('global and cross filters compose on the same raw dataset while clearing cross filters preserves global selection', () => {
  const department = createGlobalFilterDefinition(departmentField)
  const disease = { ...createGlobalFilterDefinition(diseaseField, [department]), dependsOn: [department.id] }
  const target = boundWidget('target', 'table')
  const dataset = { id: 'quality', rows, fields: catalog }
  const all = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values: { [department.id]: [], [disease.id]: [] }, interactions: {} })
  const departmentOnly = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values: { [department.id]: ['呼吸内科'], [disease.id]: [] }, interactions: {} })
  const values = { [department.id]: [], [disease.id]: ['肺炎'] }
  const interactions = { 'interaction-source': { id: 'interaction-source', sourceWidgetId: 'source', field: 'department', value: '呼吸内科', targetWidgetIds: ['target'] } }
  const globallyFiltered = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values, interactions: {} })
  const combined = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values, interactions })
  const cleared = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values, interactions: {} })
  const departmentAndDisease = queryWidgetDatasetWithRuntime(dataset, target, { definitions: [department, disease], values: { [department.id]: ['呼吸内科'], [disease.id]: ['肺炎'] }, interactions: {} })
  assert.equal(all.rows.length, 4)
  assert.equal(departmentOnly.rows.length, 2)
  assert.equal(departmentAndDisease.rows.length, 1)
  assert.notEqual(JSON.stringify(compileWidgetData('table', target.config.dataBinding, departmentOnly)), JSON.stringify(compileWidgetData('table', target.config.dataBinding, departmentAndDisease)))
  assert.equal(globallyFiltered.rows.length, 2)
  assert.equal(combined.rows.length, 1)
  assert.equal(combined.rows[0].department, '呼吸内科')
  assert.deepEqual(cleared.rows, globallyFiltered.rows)
})

test('quality safety preset uses the same definition factory contract as normal designer filters', () => {
  const schema = createQualitySafetyDemoSchema({ id: 'quality-safety', sceneCode: 'quality-safety' })
  const normalDepartment = createGlobalFilterDefinition(departmentField, [], {
    id: 'department',
    optionSourceCode: 'UAT_QUALITY_SAFETY_Q3'
  })
  assert.deepEqual(schema.globalFilters.find(definition => definition.id === 'department'), normalDepartment)
  assert.deepEqual(schema.globalFilters.find(definition => definition.id === 'disease').dependsOn, ['department'])
})

test('designer exposes global filters in dashboard settings and records filter edits in its existing history transaction', async () => {
  const source = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  assert.match(source, /data-testid="dashboard-global-filter-settings"/)
  assert.doesNotMatch(source, /data-testid="dashboard-global-filters"/)
  assert.match(source, /data-testid="dashboard-settings" @click="showDashboardSettings"/)
  assert.match(source, /function updateGlobalFilters\(definitions\)[\s\S]*runDashboardHistoryTransaction/)
  assert.match(source, /function deleteGlobalFilter\(filterId\)[\s\S]*runDashboardHistoryTransaction/)
})
