import test from 'node:test'
import assert from 'node:assert/strict'
import { reactive } from 'vue'
import { createFieldCatalog } from '../src/idmp/features/dashboard/fieldCatalog.js'
import { applyFilters, initialFilterValues, validateFilterDefinitions, validateConditions } from '../src/idmp/features/dashboard/filterEngine.js'
import { deriveDependentFilterOptions, normalizeDependentFilterValues, queryWidgetDataset } from '../src/idmp/features/dashboard/queryAdapter.js'
import { compileWidgetData } from '../src/idmp/features/dashboard/bindingEngine.js'
import { normalizeDashboardSchema, createPersistableDashboardSnapshot, validateDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { persistDashboardSchema, recoverDashboardSchema } from '../src/idmp/features/dashboard/persistence.js'

const rows = [{ department: '内科', value: 2, date: '2026-07-01', category: '质量' }, { department: '外科', value: 6, date: '2026-07-01', category: '安全' }, { department: '内科', value: 4, date: '2026-08-01', category: '安全' }, { department: '外科', value: 8, date: '2026-08-01', category: '质量' }]
const fields = createFieldCatalog(rows)
const dataset = { id: 'trend', rows, fields }
const def = { id: 'department', label: '科室', field: 'department', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true }
const widget = { config: { dataBinding: { dataset: 'trend', dimensions: [], measures: [{ field: 'value', aggregation: 'avg' }], series: [], sort: [] } } }
const filter = (field, operator, value) => applyFilters(rows, [{ field, operator, value }], fields)
test('filter catalog recommends date ranges only for full dates, never raw month labels', () => {
  assert.equal(fields.find(field => field.id === 'date').preferredFilterType, 'date-range')
  const [month] = createFieldCatalog([{ month: '7月' }], { month: { dataType: 'date', semanticType: 'time' } })
  assert.equal(month.preferredFilterType, 'multi-select'); assert.equal(month.filterDataType, 'string')
})
test('dimension equals, notEquals, in and notIn operate on rows', () => {
  for (const operator of ['equals', 'in']) assert.equal(filter('department', operator, operator === 'in' ? ['内科'] : '内科').rows.length, 2)
  assert.equal(filter('department', 'notEquals', '外科').rows[0].department, '内科')
  assert.equal(filter('department', 'notIn', ['内科', '外科']).rows.length, 0)
})
test('numeric comparisons and inclusive between normalize numeric strings', () => {
  for (const [operator, expected] of [['gt', 2], ['gte', 3], ['lt', 1], ['lte', 2], ['equals', 1]]) assert.equal(filter('value', operator, '4').rows.length, expected)
  assert.deepEqual(filter('value', 'between', [4, 6]).rows.map(row => row.value), [6, 4])
})
test('date ranges are inclusive; invalid dates and reversed ranges are diagnosed', () => {
  assert.equal(filter('date', 'between', ['2026-07-01', '2026-07-31']).rows.length, 2)
  assert.equal(filter('date', 'before', '2026-08-01').rows.length, 2)
  assert.equal(filter('date', 'after', '2026-07-01').rows.length, 2)
  assert.equal(filter('date', 'equals', '2026-07-01').rows.length, 2)
  assert.ok(filter('date', 'between', ['2026-08-01', '2026-07-01']).diagnostics.length)
  assert.ok(filter('date', 'equals', '2026-02-30').diagnostics.length)
})
test('empty/invalid values are not zero; false and zero remain filterable', () => {
  const data = [{ value: null, flag: false }, { value: 0, flag: true }, { value: '', flag: false }, { value: undefined, flag: null }, { value: 'bad', flag: true }]
  const catalog = createFieldCatalog(data, { value: { dataType: 'number' }, flag: { dataType: 'boolean' } })
  assert.equal(applyFilters(data, [{ field: 'value', operator: 'isEmpty' }], catalog).rows.length, 4)
  assert.equal(applyFilters(data, [{ field: 'value', operator: 'isNotEmpty' }], catalog).rows.length, 1)
  assert.equal(applyFilters(data, [{ field: 'flag', operator: 'equals', value: false }], catalog).rows.length, 2)
})
test('global AND component filters execute before aggregation', () => {
  const bound = { config: { dataBinding: { ...widget.config.dataBinding, filters: [{ field: 'category', operator: 'equals', value: '安全' }] } } }
  const result = queryWidgetDataset(dataset, bound, [def], { department: ['内科'] })
  assert.deepEqual(result.rows, [rows[2]])
  assert.equal(compileWidgetData('kpi', bound.config.dataBinding, result).value, 4)
})
test('ignored ids and inherit=false only bypass global conditions', () => {
  for (const query of [{ ignoredGlobalFilterIds: ['department'] }, { inheritGlobalFilters: false }]) {
    assert.equal(queryWidgetDataset(dataset, { config: { ...widget.config, query } }, [def], { department: ['内科'] }).rows.length, 4)
  }
})
test('reset returns independent default values rather than clearing them', () => {
  const definitions = [{ ...def, defaultValue: ['外科'] }]
  const runtime = initialFilterValues(definitions); runtime.department.push('内科')
  assert.deepEqual(definitions[0].defaultValue, ['外科'])
  assert.deepEqual(initialFilterValues(definitions), { department: ['外科'] })
})
test('unavailable fields are diagnosed and incompatible globals do not blank widgets', () => {
  const result = applyFilters(rows, [{ field: 'missing', operator: 'equals', value: 'x' }], fields)
  assert.equal(result.rows, rows); assert.ok(result.diagnostics.length)
  assert.equal(queryWidgetDataset(dataset, widget, [{ ...def, field: 'missing' }], { department: ['x'] }).rows, rows)
})
test('empty selection and disabled global filter mean no additional restriction', () => {
  assert.equal(queryWidgetDataset(dataset, widget, [def], { department: [] }).rows, rows)
  assert.equal(queryWidgetDataset(dataset, widget, [{ ...def, enabled: false }], { department: ['x'] }).rows, rows)
})
test('dependent options apply every selected parent before collecting child values and clear invalid values', () => {
  const acceptanceRows = [
    { department: '呼吸内科', scene: '质量安全', disease: '慢阻肺' }, { department: '呼吸内科', scene: '质量安全', disease: '肺炎' },
    { department: '心内科', scene: '医院评审', disease: '冠心病' }, { department: '心内科', scene: '医院评审', disease: '心衰' },
    { department: '普外科', scene: '绩效考核', disease: '阑尾炎' }, { department: '普外科', scene: '绩效考核', disease: '胆囊炎' }
  ]
  const acceptance = { id: 'acceptance', rows: acceptanceRows, fields: createFieldCatalog(acceptanceRows) }
  // This dataset has a disease but no department. It must not leak its value
  // while a department parent is selected.
  const unrelated = { id: 'unrelated', rows: [{ disease: '不应出现' }], fields: createFieldCatalog([{ disease: '不应出现' }]) }
  const definitions = [
    { id: 'department', label: '科室', field: 'department', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true },
    { id: 'scene', label: '场景', field: 'scene', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true },
    { id: 'disease', label: '病种', field: 'disease', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true, dependsOn: ['department', 'scene'], invalidValueBehavior: 'clear' }
  ]
  const respiratory = deriveDependentFilterOptions([acceptance, unrelated], definitions, { department: ['呼吸内科'], scene: [], disease: [] })
  assert.deepEqual(respiratory.get('disease'), ['慢阻肺', '肺炎'])
  const cardiology = deriveDependentFilterOptions([acceptance, unrelated], definitions, { department: ['心内科'], scene: [], disease: [] })
  assert.deepEqual(cardiology.get('disease'), ['冠心病', '心衰'])
  const normalized = normalizeDependentFilterValues(definitions, { department: ['心内科'], scene: [], disease: ['慢阻肺'] }, cardiology)
  assert.deepEqual(normalized.disease, [])
})
test('definition and condition validation rejects malformed persisted configurations', () => {
  for (const bad of [null, {}, [def, def], [{ ...def, defaultValue: {} }], [{ ...def, runtimeValue: ['内科'] }], [{ ...def, type: 'date-range' }]]) assert.ok(validateFilterDefinitions(bad).length)
  assert.ok(validateConditions([{ field: 'value', operator: 'between', value: [1] }]).length)
  assert.ok(validateConditions([{ field: 'value', operator: 'custom-expression', value: 3 }]).length)
})
test('reactive definitions/defaults/component/scope persist losslessly; runtime does not', () => {
  const schema = reactive(normalizeDashboardSchema({ version: 1, id: 'filters', globalFilters: [def], widgets: [{ id: 'kpi', type: 'kpi', config: { query: { inheritGlobalFilters: true, ignoredGlobalFilterIds: ['department'] }, dataBinding: { ...widget.config.dataBinding, filters: [{ field: 'value', operator: 'gte', value: 2 }] } } }] }))
  const runtime = initialFilterValues(schema.globalFilters); runtime.department = ['内科']
  const memory = new Map(); const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  persistDashboardSchema(storage, 'filter', schema)
  const loaded = recoverDashboardSchema(storage, 'filter').schema
  assert.deepEqual(loaded.globalFilters, [def]); assert.deepEqual(loaded.widgets[0].config, JSON.parse(JSON.stringify(schema.widgets[0].config)))
  assert.equal(storage.getItem('filter').includes('runtime'), false)
  assert.deepEqual(initialFilterValues(loaded.globalFilters), { department: [] })
  assert.equal(validateDashboardSchema({ ...schema, widgets: [{ ...schema.widgets[0], config: { query: { runtimeValues: {} } } }] }).valid, false)
})
test('legacy schema normalizes filters to empty without rewriting storage or changing data', () => {
  const legacy = normalizeDashboardSchema({ version: 1, id: 'old', widgets: [] }); delete legacy.globalFilters
  const text = JSON.stringify(legacy)
  const storage = { getItem: () => text, setItem: () => assert.fail('read must not write') }
  const loaded = recoverDashboardSchema(storage, 'old').schema
  assert.deepEqual(loaded.globalFilters, [])
  assert.deepEqual(createPersistableDashboardSnapshot(legacy), createPersistableDashboardSnapshot(loaded))
  assert.equal(queryWidgetDataset(dataset, widget).rows, rows)
})
