import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFactorTemplateDefinition, templatePeriodField } from '../src/idmp/utils/factorTemplateDefinition.js'

function designer() {
  return { domainCode: 'SURGERY', tableName: 'vmq_surgeryinfo', calculationMode: 'STATIC', periodFieldCode: 'operation_date', aggregation: 'COUNT', fieldCode: '', output: { valueType: 'DECIMAL', unit: 'COUNT', scale: 0 }, allowedGrains: ['MONTHLY'], drillPathVersionIds: ['102027642461473150'], templateFilter: { enabled: true, fieldCode: 'surgery_level', operator: 'EQ', parameterCode: 'LEVEL' }, extraDefinition: {} }
}
test('templates emit physical table and fields, preserve bigint ids and zero scale', () => {
  const dsl = buildFactorTemplateDefinition(designer())
  assert.deepEqual(dsl.primaryDomain, { domainCode: 'SURGERY', tableName: 'vmq_surgeryinfo' })
  assert.equal(dsl.filters.fieldCode, 'surgery_level')
  assert.deepEqual(dsl.filters.value, { parameterRef: 'LEVEL' })
  assert.deepEqual(dsl.drillPathVersionIds, ['102027642461473150'])
  assert.equal(dsl.output.scale, 0)
  assert.equal(templatePeriodField(dsl.filters), '')
})
test('temporal templates keep business filters and add explicit period binding', () => {
  const form = designer(); form.calculationMode = 'TEMPORAL'
  const dsl = buildFactorTemplateDefinition(form)
  assert.equal(dsl.filters.children[0].fieldCode, 'surgery_level')
  assert.equal(templatePeriodField(dsl.filters), 'operation_date')
})
test('no TRUE children are generated inside AND and imported period is not duplicated', () => {
  const form = designer(); form.templateFilter.enabled = false; form.calculationMode = 'TEMPORAL'
  const period = { nodeType: 'PREDICATE', fieldCode: 'old_time', operator: 'BETWEEN', parameter: 'period' }
  form.filters = { nodeType: 'AND', children: [{ nodeType: 'TRUE' }, period] }
  const dsl = buildFactorTemplateDefinition(form)
  assert.equal(dsl.filters.children.length, 1)
  assert.equal(dsl.filters.children[0].fieldCode, 'operation_date')
  form.calculationMode = 'STATIC'
  assert.deepEqual(buildFactorTemplateDefinition(form).filters, { nodeType: 'TRUE' })
})
test('advanced definition retains governed join aliases, grouping, and parameterized aggregation', () => {
  const form = designer(); form.primaryOptions = { sourceAlias: 'source' }; form.groupBy = ['surgery_level']
  form.extraDefinition = { joins: [{ relationId: '100', sourceAlias: 'visit' }], aggregationField: { fieldCode: { parameterRef: 'FIELD' } } }
  const dsl = buildFactorTemplateDefinition(form)
  assert.equal(dsl.primaryDomain.sourceAlias, 'source')
  assert.deepEqual(dsl.groupBy, ['surgery_level'])
  assert.deepEqual(dsl.aggregation.fieldCode, { parameterRef: 'FIELD' })
  assert.equal(dsl.joins[0].relationId, '100')
  assert.equal('aggregationField' in dsl, false)
})
