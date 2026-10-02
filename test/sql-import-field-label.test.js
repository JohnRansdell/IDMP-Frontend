import test from 'node:test'
import assert from 'node:assert/strict'
import { sqlPhysicalFieldLabel, sqlPhysicalFieldName } from '../src/idmp/features/indicator/sqlImportFields.js'
import { buildSqlImportMetadataPayload, normalizeSqlImportPreview } from '../src/idmp/api/adapters/sqlImport.js'

test('SQL source choices display real table names and preserve SQL references in metadata', () => {
  const source = { physicalTable: 'vmq_basicinformationzy', sqlAlias: 'b', columnName: 'In_Date', fieldReference: 'b.In_Date', columnType: 'datetime', comment: '入院时间' }
  const preview = normalizeSqlImportPreview({ factors: [{ key: 'total', timeFieldOptions: [source], dimensionFieldOptions: [source] }] })
  const option = preview.factors[0].timeFieldOptions[0]
  assert.equal(sqlPhysicalFieldName(option), 'vmq_basicinformationzy.In_Date')
  assert.equal(sqlPhysicalFieldLabel(option), 'vmq_basicinformationzy.In_Date · datetime · 入院时间')
  assert.equal(sqlPhysicalFieldName(preview.factors[0].dimensionFieldOptions[0]), 'vmq_basicinformationzy.In_Date')
  const payload = buildSqlImportMetadataPayload({ scope: 'FACTORS_AND_INDICATOR', factors: [{ key: 'total', code: 'TOTAL', name: '入院人次', calculationMode: 'TEMPORAL', timeField: option.fieldReference, dimensionBindings: { 科室: 'b.dept_code' } }], indicator: { code: 'RATE', name: '比例', dimensionGrain: ['科室'] } })
  assert.equal(payload.factors[0].timeField, 'b.In_Date')
  assert.equal(payload.factors[0].dimensionBindings.科室, 'b.dept_code')
})

test('self JOIN field labels remain distinct without exposing table aliases', () => {
  const options = ['b', 't'].map(sqlAlias => ({ physicalTable: 'visits', sqlAlias, columnName: 'dept_code', fieldReference: `${sqlAlias}.dept_code` }))
  assert.equal(sqlPhysicalFieldLabel(options[0], options), 'visits.dept_code（来源 1）')
  assert.equal(sqlPhysicalFieldLabel(options[1], options), 'visits.dept_code（来源 2）')
  assert.notEqual(options[0].fieldReference, options[1].fieldReference)
})

test('real table fields and legacy incomplete metadata do not invent table names', () => {
  assert.equal(sqlPhysicalFieldLabel({ physicalTable: 'visits', columnName: 'in_date', fieldReference: 'visits.in_date' }), 'visits.in_date')
  assert.equal(sqlPhysicalFieldName({ fieldReference: 'b.in_date' }), 'in_date')
  assert.equal(sqlPhysicalFieldName({ columnName: 'b.in_date' }), 'in_date')
  assert.equal(sqlPhysicalFieldName(), '')
})
