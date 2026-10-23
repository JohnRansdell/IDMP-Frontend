import test from 'node:test'
import assert from 'node:assert/strict'
import { annotateDepartmentFilterFields, departmentCodeOptions, departmentSelectionCodes, loadDepartmentCodeOptions } from '../src/idmp/features/dashboard/departmentFilters.js'
import { buildRemoteFilterOptionQuery, buildRemoteWidgetQuery } from '../src/idmp/features/dashboard/remoteQuery.js'
import { dashboardFieldsToFrontend, widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { queryWidgetDataset } from '../src/idmp/features/dashboard/queryAdapter.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '../src/idmp/features/dashboard/globalFilterCompatibility.js'

const fieldsFor = code => annotateDepartmentFilterFields([
  { code, name: '出院科室', dataType: 'STRING', role: 'DIMENSION', filterable: true },
  { code: code === '科室' ? '科室名称' : 'OUT_DEPT_NAME', name: '出院科室', dataType: 'STRING', role: 'DIMENSION', filterable: true },
  { code: 'value', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] }
])
const definition = field => ({ id: 'dept', field, label: '科室', enabled: true, type: 'multi-select', dataType: 'string', defaultValue: [] })
const widget = id => ({ id, type: 'kpi', config: { dataBinding: { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] } } })

test('global code and name fields map to each indicator code contract; candidate source is not scope', () => {
  for (const globalField of ['OUT_DEPT_CODE', 'OUT_DEPT_NAME', '科室', '科室名称']) {
    for (const code of ['OUT_DEPT_CODE', '科室']) {
      const def = { ...definition(globalField), optionSourceCode: 'another-source' }
      const context = { fields: fieldsFor(code), definitions: [def], values: { dept: ['5', '22'] } }
      assert.deepEqual(buildRemoteWidgetQuery(widget('w'), context).query.filters, { [code]: ['5', '22'] })
      assert.equal(buildRemoteFilterOptionQuery(def, [def], {}, fieldsFor(code), {}).fieldCode, code)
    }
  }
})

test('department mapping preserves disabled, ignored and independent widget filter scope', () => {
  const fields = fieldsFor('科室'), def = definition('OUT_DEPT_CODE')
  const context = { fields, definitions: [def], values: { dept: ['5'] } }
  for (const query of [{ inheritGlobalFilters: false }, { ignoredGlobalFilterIds: ['dept'] }]) {
    assert.deepEqual(buildRemoteWidgetQuery({ ...widget('w'), config: { query } }, context).query.filters, {})
  }
  assert.deepEqual(buildRemoteWidgetQuery(widget('w'), { ...context, definitions: [{ ...def, enabled: false }] }).query.filters, {})
  const scoped = { ...widget('w'), config: { backendQuery: { organizationMode: 'FIXED', organizationScope: { level: 'DEPARTMENT', ids: ['22'] } } } }
  assert.deepEqual(buildRemoteWidgetQuery(scoped, context), { empty: true })
})

test('metadata-declared custom department keys participate without inferring fields from labels', () => {
  const fields = annotateDepartmentFilterFields([{ code: 'WARD_MEMBER', filterable: true }, { code: 'WARD_TITLE', filterable: true }], [
    { levels: [{ levelName: '出院科室', memberKeyFieldCode: 'WARD_MEMBER', displayFieldCode: 'WARD_TITLE' }] }
  ])
  assert.deepEqual(buildRemoteWidgetQuery(widget('w'), { fields, definitions: [definition('科室名称')], values: { dept: ['5'] } }).query.filters, { WARD_MEMBER: ['5'] })
  assert.deepEqual(buildRemoteWidgetQuery(widget('w'), { fields: [{ code: 'disease', name: '出院科室', filterable: true }], definitions: [definition('OUT_DEPT_CODE')], values: { dept: ['5'] } }).query.filters, {})
})

test('server-filtered KPI remains visible and local pie filtering uses the mapped code column', () => {
  const defs = [definition('科室名称')], w = widget('pie')
  const pie = widgetResultToDataset({ rows: [{ 科室: '5', value: 0.2 }, { 科室: '22', value: 0.4 }] }, fieldsFor('科室'))
  assert.deepEqual(queryWidgetDataset(pie, w, defs, { dept: ['5'] }).rows, [{ 科室: '5', value: 0.2 }])
  const kpi = widgetResultToDataset({ rows: [{ value: 0 }], appliedGlobalFilterFields: ['OUT_DEPT_CODE'] }, fieldsFor('OUT_DEPT_CODE'))
  assert.deepEqual(queryWidgetDataset(kpi, widget('kpi'), defs, { dept: ['5'] }).rows, [{ value: 0 }])
  assert.deepEqual(resolveCompatibleGlobalFilterWidgetIds(defs[0], [widget('kpi'), widget('pie')], target => [target.id === 'kpi' ? kpi : pie]), ['kpi', 'pie'])
})

test('dependent option requests map upstream departments to the receiving indicator code', () => {
  const parent = definition('OUT_DEPT_CODE'), child = { id: 'disease', field: '病种', dependsOn: ['dept'] }
  const fields = [...fieldsFor('科室'), { code: '病种', filterable: true }]
  assert.deepEqual(buildRemoteFilterOptionQuery(child, [parent, child], { dept: ['5'] }, fields, {}).filters, { 科室: ['5'] })
  assert.equal(dashboardFieldsToFrontend(fieldsFor('科室')).find(field => field.id === '科室名称').departmentCodeField, '科室')
})

test('department candidates come only from the full master dictionary, independent of result filters', async () => {
  const options = await loadDepartmentCodeOptions({ fields: fieldsFor('科室'), query: { filters: { 病种: ['A'] } },
    fetchDictionary: async () => [{ code: '22', name: '泌尿外科' }, { code: '5', name: '产科' }, { code: '0101', name: '测试门诊' }],
    fetchNameRows: async () => { throw new Error('Must not query drill results') },
    fetchOptions: async () => { throw new Error('Must not query result-based candidates') }
  })
  assert.deepEqual(options, [{ value: '22', label: '泌尿外科' }, { value: '5', label: '产科' }, { value: '0101', label: '测试门诊' }])
  assert.deepEqual(departmentSelectionCodes(['产科'], options), ['5'])
  assert.deepEqual(departmentCodeOptions([{ value: '5' }, { value: '22' }], new Map([['5', '同名科室'], ['22', '同名科室']])).map(option => option.label), ['同名科室（5）', '同名科室（22）'])
})

test('dictionary loads once per option call and failures reject without result-based fallback', async () => {
  let calls = 0
  const options = await loadDepartmentCodeOptions({ fields: fieldsFor('OUT_DEPT_CODE'), query: {},
    fetchDictionary: async () => { calls++; return [{ code: '5', name: '产科' }] }
  })
  assert.deepEqual(options, [{ value: '5', label: '产科' }])
  assert.equal(calls, 1)
  await assert.rejects(loadDepartmentCodeOptions({ fields: fieldsFor('科室'), fetchDictionary: async () => { throw new Error('接口失败') } }), /接口失败/)
})
