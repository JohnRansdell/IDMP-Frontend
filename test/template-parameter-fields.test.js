import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { templateFieldOptions, fieldOptionsForParameter, templateParameterFields } from '../src/idmp/utils/templateParameterFields.js'

const definition = { primaryDomain: { sourceAlias: 's' }, aggregation: { function: 'COUNT_DISTINCT', fieldCode: '${FIELD}' } }
const sources = [
  { fieldReference: 's.patient_id', tableName: '手术记录', columnName: 'patient_id', dataType: 'STRING' },
  { fieldReference: 'd.patient_id', tableName: '死亡记录', columnName: 'patient_id', dataType: 'STRING' },
  { fieldReference: 's.amount', tableName: '手术记录', columnName: 'amount', dataType: 'DECIMAL' },
  { fieldReference: 's.surgery_date', tableName: '手术记录', columnName: 'surgery_date', dataType: 'DATETIME' }
]

test('field candidates preserve joined aliases and physical source labels', () => {
  const fields = templateFieldOptions(definition, sources)
  assert.deepEqual(fields.map(f => f.value), ['patient_id', 'd.patient_id', 'amount', 'surgery_date'])
  assert.match(fields[1].label, /死亡记录.patient_id/)
  assert.equal(templateFieldOptions(definition, [...sources, sources[0]]).length, 4)
})

test('aggregate field candidates match field types and normalize primary-source enum values', () => {
  const fields = templateFieldOptions(definition, sources)
  for (const aggregate of ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT']) {
    const dsl = { ...definition, aggregation: { function: aggregate, fieldRef: { parameterRef: 'FIELD' } } }
    const expected = ['SUM', 'AVG'].includes(aggregate) ? ['amount'] : ['MIN', 'MAX'].includes(aggregate) ? ['amount', 'surgery_date'] : fields.map(f => f.value)
    assert.deepEqual(fieldOptionsForParameter(fields, dsl, 'FIELD').map(f => f.value), expected)
  }
  assert.deepEqual(fieldOptionsForParameter(fields, definition, 'FIELD', ['s.patient_id', 'd.patient_id']).map(f => f.value), ['patient_id', 'd.patient_id'])
})

test('schema exposes only business parameters with concrete fields, required flags and defaults', () => {
  const fields = templateParameterFields({ required: ['FIELD'], 'x-fieldOptions': sources, properties: {
    FIELD: { title: '患者字段', type: 'string', 'x-dataType': 'FIELD_REF', default: 's.patient_id' },
    PRIVATE: { 'x-exposed': false }, LEVEL: { type: 'integer', default: 0 }, ENABLED: { type: 'boolean', default: false }
  } }, [{ code: 'PRIVATE', exposed: false }], definition)
  assert.deepEqual(fields.map(f => f.code), ['FIELD', 'LEVEL', 'ENABLED'])
  assert.equal(fields[0].defaultValue, 'patient_id')
  assert.equal(fields[0].fieldOptions.length, 4)
  assert.equal(fields[0].required, true)
  assert.equal(fields[1].defaultValue, 0)
  assert.equal(fields[2].defaultValue, false)
  assert.deepEqual(templateParameterFields({ properties: { F: {} } }, [{ code: 'F', exposed: false }], definition), [])
})

test('template pages enforce atomic definitions and use a field selector before generic inputs', () => {
  const read = name => readFileSync(new URL(`../src/idmp/views/${name}.vue`, import.meta.url), 'utf8')
  assert.match(read('FactorTemplateEditor'), /definition-only atomic-only/)
  assert.match(read('FactorEditor'), /props.atomicOnly && isDerived.value/)
  assert.match(read('FactorTemplateInstantiate'), /el-select\b[^>]*\bv-if="field.isField"/)
  assert.doesNotMatch(read('FactorTemplateInstantiate'), /allow-create/)
  assert.match(read('FactorEditor'), /router.replace\(`\/factor\/templates\//)
})
