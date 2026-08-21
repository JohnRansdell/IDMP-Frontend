import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFactorDsl, getAggregationLabel, validateFilterNode } from '../src/idmp/utils/dslBuilder.js'

test('聚合方式显示中文且未知码原样返回', () => {
  assert.equal(getAggregationLabel('COUNT_DISTINCT'), '去重计数')
  assert.equal(getAggregationLabel('median'), '中位数')
  assert.equal(getAggregationLabel('CUSTOM_AGGREGATION'), 'CUSTOM_AGGREGATION')
})

test('cascade context contract requires explicit semantic table selection', () => {
  const dsl = { primaryDomain: { domainCode: 'D', semanticTableCode: 'T2' }, aggregation: { function: 'COUNT', fieldCode: 'F2' }, groupBy: ['F2'] }
  assert.equal(dsl.primaryDomain.semanticTableCode, 'T2')
  assert.equal(dsl.aggregation.fieldCode, 'F2')
  assert.deepEqual(dsl.groupBy, ['F2'])
})

test('COUNT supports optional field semantics for COUNT(field) and COUNT(*)', () => {
  const common = { domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', groupBy: [], filters: { nodeType: 'TRUE' } }
  assert.deepEqual(buildFactorDsl({ ...common, fieldCode: 'DEATH_DISCUSSION' }).aggregation, {
    function: 'COUNT',
    fieldCode: 'DEATH_DISCUSSION'
  })
  assert.deepEqual(buildFactorDsl({ ...common, fieldCode: '' }).aggregation, { function: 'COUNT' })
})

test('explicit period filter is complete without a literal value', () => {
  const filters = { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'OUT_DATE', operator: 'BETWEEN', parameter: 'period', value: '' }] }
  assert.deepEqual(validateFilterNode(filters), [])
  assert.deepEqual(buildFactorDsl({ domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', filters }).filters.children[0], {
    nodeType: 'PREDICATE', fieldCode: 'OUT_DATE', operator: 'BETWEEN', parameter: 'period'
  })
  assert.deepEqual(buildFactorDsl({ domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', filters }).parameters, [
    { code: 'period', type: 'PERIOD', source: 'RUNTIME' }
  ])
})

test('filter validation reports the exact missing step', () => {
  assert.deepEqual(validateFilterNode({ nodeType: 'PREDICATE', fieldCode: '', operator: '', value: '' }), ['请选择筛选字段'])
  assert.deepEqual(validateFilterNode({ nodeType: 'PREDICATE', fieldCode: 'SEX', operator: '', value: '' }), ['请选择该字段的判断方式'])
  assert.deepEqual(validateFilterNode({ nodeType: 'PREDICATE', fieldCode: 'SEX', operator: 'EQ', value: [] }), ['请填写或选择条件值'])
})

test('value-set predicates serialize stable item codes and validate selections', () => {
  const filters = { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'PATIENT_SEX', operator: 'IN_VALUE_SET', itemCodes: ['MALE'] }] }
  assert.deepEqual(validateFilterNode(filters), [])
  assert.deepEqual(buildFactorDsl({ domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', filters }).filters.children[0], {
    nodeType: 'PREDICATE', fieldCode: 'PATIENT_SEX', operator: 'IN_VALUE_SET', itemCodes: ['MALE']
  })
  assert.deepEqual(validateFilterNode({ nodeType: 'PREDICATE', fieldCode: 'PATIENT_SEX', operator: 'IN_VALUE_SET', itemCodes: [] }), ['请填写或选择条件值'])
})

test('value-set predicates carry the bound published version into compiler DSL', () => {
  const filters = { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'PATIENT_SEX', operator: 'IN_VALUE_SET', itemCodes: ['MALE'] }] }
  const fields = [{ code: 'PATIENT_SEX', valueSetVersionId: '102027642458358887' }]
  const dsl = buildFactorDsl({ domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', filters, fields })
  assert.deepEqual(dsl.filters.children[0], {
    nodeType: 'PREDICATE',
    fieldCode: 'PATIENT_SEX',
    operator: 'IN_VALUE_SET',
    itemCodes: ['MALE'],
    valueSetVersionId: '102027642458358887'
  })
})
