import test from 'node:test'
import assert from 'node:assert/strict'
import { sqlFactorLabel, sqlFactorSourceLabel, sqlPhysicalFieldLabel, sqlPhysicalFieldName } from '../src/idmp/features/indicator/sqlImportFields.js'
import { buildSqlImportMetadataPayload, normalizeSqlImportPreview } from '../src/idmp/api/adapters/sqlImport.js'

test('Chinese CTE factor labels use original output names and retain internal formula keys', () => {
  const preview = normalizeSqlImportPreview({
    factors: ['四级手术患者', '全部手术患者'].map((cte, index) => ({
      key: `stat___________${index || ''}`, outputAlias: `stat___________${index || ''}`,
      suggestedName: `${cte}.患者数`, dsl: { importSource: { cte, column: '患者数' } },
    })),
  })
  assert.deepEqual(preview.factors.map(draft => sqlFactorLabel({}, draft)), ['四级手术患者.患者数', '全部手术患者.患者数'])
  assert.equal(sqlFactorSourceLabel(preview.factors[0]), 'CTE 输出：四级手术患者.患者数')
  const draft = preview.factors[0]
  const metadata = { key: draft.key, name: '四级手术患者人数' }
  assert.equal(sqlFactorLabel(metadata, draft), '四级手术患者人数')
  assert.equal(buildSqlImportMetadataPayload({ factors: [metadata], indicator: {} }).factors[0].key, 'stat___________')
  metadata.name = ''
  assert.equal(sqlFactorLabel(metadata, draft), '四级手术患者.患者数')
})

test('factor source fallback does not mislabel a simple SELECT as CTE or show internal keys', () => {
  assert.equal(sqlFactorSourceLabel({ outputAlias: '住院手术记录数', key: 'surgery_count' }), '查询输出：住院手术记录数')
  assert.equal(sqlFactorSourceLabel({ dsl: { importSource: { column: '记录数' } } }), '查询输出：记录数')
  assert.equal(sqlFactorLabel({}, { dsl: { importSource: { cte: '统计', column: '人数' } } }), '统计.人数')
  assert.equal(sqlFactorLabel({}, { key: 'stat___', outputAlias: 'stat___' }), '未命名因子')
  assert.equal(sqlFactorSourceLabel({ key: 'stat___', outputAlias: 'stat___' }), '')
})

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
