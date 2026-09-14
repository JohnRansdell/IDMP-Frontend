import test from 'node:test'
import assert from 'node:assert/strict'
import { createFieldCatalog } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { validateFilterDefinitions, validateWidgetInteraction, validateWidgetQuery } from '../src/idmp/features/dashboard/filterEngine.js'
import { deriveDependentFilterOptions, normalizeDependentFilterValues, queryWidgetDatasetWithRuntime } from '../src/idmp/features/dashboard/queryAdapter.js'

const rows = [
  { department: '内科', category: '质量', value: 2 },
  { department: '内科', category: '安全', value: 4 },
  { department: '外科', category: '质量', value: 6 },
  { department: '外科', category: '安全', value: 8 }
]
const dataset = { id: 'departments', rows, fields: createFieldCatalog(rows) }
const definitions = [
  { id: 'department', label: '科室', field: 'department', dataType: 'string', type: 'select', defaultValue: null, enabled: true },
  { id: 'category', label: '分类', field: 'category', dataType: 'string', type: 'select', defaultValue: '质量', dependsOn: ['department'], invalidValueBehavior: 'clear', enabled: true }
]
const widget = (id, query = {}) => ({ id, config: { query, dataBinding: { dataset: 'departments', dimensions: [{ field: 'department', label: '科室' }], measures: [{ field: 'value', aggregation: 'sum' }], series: [], sort: [], filters: [{ field: 'value', operator: 'gte', value: 4 }] } } })

test('dependent options use only actual upstream row values and clear invalid runtime values', () => {
  const options = deriveDependentFilterOptions([dataset], definitions, { department: '内科', category: '质量' })
  assert.deepEqual(options.get('category'), ['质量', '安全'])
  const empty = deriveDependentFilterOptions([dataset], definitions, { department: '不存在' })
  assert.deepEqual(normalizeDependentFilterValues(definitions, { department: '不存在', category: '质量' }, empty), { department: '不存在', category: null })
  const reset = normalizeDependentFilterValues([{ ...definitions[1], invalidValueBehavior: 'reset-default', defaultValue: '质量' }], { category: '安全' }, new Map([['category', []]]))
  assert.equal(reset.category, null, 'an unavailable default must not be fabricated back into the selection')
})

test('global, component, and targeted interaction filters all execute on rows before aggregation', () => {
  const source = widget('source')
  const target = widget('target')
  const interactions = { 'interaction-source': { id: 'interaction-source', sourceWidgetId: 'source', field: 'department', value: '内科', targetWidgetIds: ['target'] } }
  const result = queryWidgetDatasetWithRuntime(dataset, target, { definitions, values: { department: null, category: '安全' }, interactions })
  assert.deepEqual(result.rows, [{ department: '内科', category: '安全', value: 4 }])
  assert.equal(queryWidgetDatasetWithRuntime(dataset, source, { definitions, values: { department: null, category: '安全' }, interactions }).rows.length, 2, 'source must not filter itself')
  assert.equal(queryWidgetDatasetWithRuntime(dataset, widget('target', { respondToInteractionFilters: false }), { definitions, values: { department: null, category: '安全' }, interactions }).rows.length, 2)
  assert.equal(queryWidgetDatasetWithRuntime(dataset, widget('target', { ignoredInteractionFilterIds: ['interaction-source'] }), { definitions, values: { department: null, category: '安全' }, interactions }).rows.length, 2)
})

test('persisted dependency and interaction configuration rejects runtime or malformed data', () => {
  assert.deepEqual(validateFilterDefinitions(definitions), [])
  assert.ok(validateFilterDefinitions([{ ...definitions[1], dependsOn: ['category'] }]).length)
  assert.deepEqual(validateWidgetInteraction({ clickFilter: { enabled: true, field: 'department', targetWidgetIds: ['target'] } }), [])
  assert.ok(validateWidgetInteraction({ clickFilter: { enabled: true, field: 'department', targetWidgetIds: ['target', 'target'] } }).length)
  assert.deepEqual(validateWidgetQuery({ respondToInteractionFilters: true, ignoredInteractionFilterIds: ['interaction-source'] }), [])
  assert.ok(validateWidgetQuery({ runtimeInteraction: {} }).length)
})
