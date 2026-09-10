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

test('continuous range predicates serialize the bound version and preserve a half-open range', () => {
  const filters = { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'TOTAL_COST', operator: 'BETWEEN', value: { start: '1000.00', end: '5000.00' } }] }
  const fields = [{ code: 'TOTAL_COST', dataType: 'DECIMAL', valueSetMatchMode: 'CONTINUOUS', valueSetVersionId: '102027642460303012', continuousSpec: { unit: 'CNY', precision: 18, scale: 2, minimumValue: '0.00', maximumValue: '100000000.00' } }]
  assert.deepEqual(validateFilterNode(filters, [], fields), [])
  assert.deepEqual(buildFactorDsl({ domainCode: 'D', semanticTableCode: 'T', aggregation: 'COUNT', filters, fields }).filters.children[0], {
    nodeType: 'PREDICATE',
    fieldCode: 'TOTAL_COST',
    operator: 'BETWEEN',
    valueSetVersionId: '102027642460303012',
    value: { start: '1000.00', end: '5000.00' }
  })
})

test('continuous range validation enforces range order, scale and bounds', () => {
  const field = { code: 'TOTAL_COST', dataType: 'DECIMAL', valueSetMatchMode: 'CONTINUOUS', continuousSpec: { scale: 2, minimumValue: '0.00', maximumValue: '100.00' } }
  const predicate = (start, end) => ({ nodeType: 'PREDICATE', fieldCode: 'TOTAL_COST', operator: 'BETWEEN', value: { start, end } })
  assert.deepEqual(validateFilterNode(predicate('10.001', '20.00'), [], [field]), ['小数位不能超过值集定义的 2 位'])
  assert.deepEqual(validateFilterNode(predicate('20.00', '20.00'), [], [field]), ['连续范围的开始值必须小于结束值'])
  assert.deepEqual(validateFilterNode(predicate('-1.00', '20.00'), [], [field]), ['开始值不能小于 0.00'])
})

test('factor dsl serializes governed joins and qualified field references', () => {
  const dsl = buildFactorDsl({
    domainCode: 'VISIT', semanticTableCode: 'VISIT_TABLE', sourceAlias: 'base',
    joins: [{ relationId: '91', fromAlias: 'base', sourceAlias: 'dept', extra: 'ignored' }],
    aggregation: 'COUNT_DISTINCT', fieldCode: 'base.VISIT_ID', groupBy: ['dept.DEPT_NAME'],
    filters: { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'dept.DEPT_TYPE', operator: 'IN_VALUE_SET', itemCodes: ['CLINICAL'] }] },
    fields: [{ code: 'dept.DEPT_TYPE', valueSetVersionId: '7' }]
  })

  assert.deepEqual(dsl.primaryDomain, { domainCode: 'VISIT', semanticTableCode: 'VISIT_TABLE', sourceAlias: 'base' })
  assert.deepEqual(dsl.joins, [{ relationId: '91', fromAlias: 'base', sourceAlias: 'dept' }])
  assert.deepEqual(dsl.aggregation, { function: 'COUNT_DISTINCT', fieldRef: { sourceAlias: 'base', fieldCode: 'VISIT_ID' } })
  assert.deepEqual(dsl.groupBy, [{ sourceAlias: 'dept', fieldCode: 'DEPT_NAME' }])
  assert.deepEqual(dsl.filters.children[0].fieldRef, { sourceAlias: 'dept', fieldCode: 'DEPT_TYPE' })
})
