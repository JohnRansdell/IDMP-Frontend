import test from 'node:test'
import assert from 'node:assert/strict'
import { departmentFilterOptions, formalFiltersForWidget, MORTALITY_SOURCE } from '../src/idmp/features/dashboard/formalGlobalFilters.js'
import { createGlobalFilterDefinition } from '../src/idmp/features/dashboard/globalFilterDesignerModel.js'
import { filterOptionValue, filterValueLabel } from '../src/idmp/features/dashboard/filterOptions.js'
import { widgetResultToDataset } from '../src/idmp/api/adapters/dashboard.js'
import { queryWidgetDataset } from '../src/idmp/features/dashboard/queryAdapter.js'
const fields = [{ code: 'OUT_DEPT_CODE', name: '出院科室', dataType: 'STRING', role: 'DIMENSION', filterable: true }, { code: 'value', name: '指标值', dataType: 'DECIMAL', role: 'MEASURE', aggregations: ['NONE'] }]
const catalogs = { [MORTALITY_SOURCE]: fields, surgery: [], transfer: [] }
const mortality = { id: 'mortality', type: 'kpi', sourceCode: MORTALITY_SOURCE, config: {} }
const manualDefinitions = () => [createGlobalFilterDefinition({ id: 'OUT_DEPT_CODE', label: '出院科室', dataType: 'string', preferredFilterType: 'select' }, [], { id: 'mortality-department' })]
test('department options display formal Chinese names without replacing filter codes', () => {
  const options = departmentFilterOptions([{ value: '4', label: '4' }], [{ out_dept_code: '4', out_dept_name: '重症医学科' }])
  assert.deepEqual(options, [{ value: '4', label: '重症医学科' }])
  assert.equal(filterOptionValue(options[0]), '4')
  assert.equal(filterValueLabel(['4'], options), '重症医学科')
  assert.equal(filterOptionValue('旧选项'), '旧选项')
})
test('department filters respect capabilities, disabled state and widget scope', () => {
  const definitions = manualDefinitions()
  const values = { 'mortality-department': '4' }
  assert.deepEqual(formalFiltersForWidget(mortality, definitions, values, catalogs), { OUT_DEPT_CODE: '4' })
  for (const sourceCode of ['surgery', 'transfer']) assert.deepEqual(formalFiltersForWidget({ sourceCode }, definitions, values, catalogs), {})
  assert.deepEqual(formalFiltersForWidget({ ...mortality, config: { query: { ignoredGlobalFilterIds: ['mortality-department'] } } }, definitions, values, catalogs), {})
  assert.deepEqual(formalFiltersForWidget(mortality, [{ ...definitions[0], enabled: false }], values, catalogs), {})
  assert.deepEqual(formalFiltersForWidget(mortality, definitions, { 'mortality-department': null }, catalogs), {})
})
test('backend filtered KPI overview is not filtered again against absent department columns', () => {
  const definitions = manualDefinitions()
  const dataset = widgetResultToDataset({ status: 'READY', rows: [{ value: 12 / 42, displayValue: '28.57%' }], appliedGlobalFilterFields: ['OUT_DEPT_CODE'] }, fields)
  assert.equal(queryWidgetDataset(dataset, mortality, definitions, { 'mortality-department': '4' }).rows.length, 1)
  assert.equal(queryWidgetDataset({ ...dataset, appliedGlobalFilterFields: [] }, mortality, definitions, { 'mortality-department': '4' }).rows.length, 0)
})
