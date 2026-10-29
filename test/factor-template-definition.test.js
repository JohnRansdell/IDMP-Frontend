import test from 'node:test'
import assert from 'node:assert/strict'
import { templatePeriodField, validateTemplateConditions, describeTemplateConditions, templateDefinitionFromFactor } from '../src/idmp/utils/factorTemplateDefinition.js'
import { buildFactorDsl, editableFilterTree } from '../src/idmp/utils/dslBuilder.js'

function buildFactorTemplateDefinition(form, fields=[]) {
  return templateDefinitionFromFactor(buildFactorDsl({...form,fields,sourceAlias:form.primaryOptions?.sourceAlias,periodColumn:form.periodFieldCode,joins:form.extraDefinition?.joins,fieldCode:form.fieldCode||form.extraDefinition?.aggregationField?.fieldCode,filters:form.scopeMode==='ALL'?{nodeType:'TRUE'}:form.filters}), {output:form.output})
}

test('shared factor definition drops obsolete template settings without restoring stale source or grain', () => {
  const original = { definitionKind:'DERIVED', expression:{ nodeType:'FACTOR' }, drillPathVersionIds:['1'], allowedGrains:['YEARLY'], output:{ dimension:'COUNT',grain:['old'],unit:'人',scale:0 } }
  const definition = { dslType:'FACTOR', primaryDomain:{tableName:'surgery'},aggregation:{function:'SUM'},groupBy:['dept'],output:{dimension:'SUM'} }
  const result = templateDefinitionFromFactor(definition, original)
  assert.deepEqual(result, {...definition,output:{dimension:'SUM',unit:'人',scale:0}})
  assert.equal(result.primaryDomain.domainCode,undefined)
  result.groupBy.push('doctor')
  assert.deepEqual(definition.groupBy,['dept'])
})

function designer() {
  return { domainCode: 'SURGERY', tableName: 'vmq_surgeryinfo', calculationMode: 'STATIC', periodFieldCode: 'operation_date', aggregation: 'COUNT', fieldCode: '', output: { valueType: 'DECIMAL', unit: 'COUNT', scale: 0 }, allowedGrains: ['MONTHLY'], drillPathVersionIds: ['102027642461473150'], filters: { nodeType: 'PREDICATE', fieldCode: 'surgery_level', operator: 'EQ', value: { parameterRef: 'LEVEL' } }, parameters: [{ code: 'LEVEL', displayName: '手术级别', dataType: 'INTEGER' }], extraDefinition: {} }
}
test('templates emit the shared factor source and fields, preserve zero scale without obsolete drill settings', () => {
  const dsl = buildFactorTemplateDefinition(designer())
  assert.deepEqual(dsl.primaryDomain, { domainCode: 'SURGERY', tableName: 'vmq_surgeryinfo' })
  assert.equal(dsl.filters.fieldCode, 'surgery_level')
  assert.deepEqual(dsl.filters.value, { parameterRef: 'LEVEL' })
  assert.equal(dsl.drillPathVersionIds, undefined)
  assert.equal(dsl.output.scale, 0)
  assert.equal(templatePeriodField(dsl.filters), '')
})
test('temporal templates keep business filters and add explicit period binding', () => {
  const form = designer(); form.calculationMode = 'TEMPORAL'
  const dsl = buildFactorTemplateDefinition(form)
  assert.equal(dsl.filters.fieldCode, 'surgery_level')
  assert.equal(dsl.periodColumn, 'operation_date')
  assert.equal(templatePeriodField(dsl), 'operation_date')
})
test('literal date filters remain business conditions in temporal and static templates', () => {
  const form = designer(); form.calculationMode = 'TEMPORAL'
  const period = { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'BETWEEN', value: { start: '2026-01-01', end: '2026-06-30' } }
  form.filters = { nodeType: 'AND', children: [{ nodeType: 'TRUE' }, period] }
  const dsl = buildFactorTemplateDefinition(form)
  assert.deepEqual(dsl.filters, form.filters)
  assert.equal(dsl.periodColumn, 'operation_date')
  form.calculationMode = 'STATIC'
  assert.deepEqual(buildFactorTemplateDefinition(form).filters, form.filters)
  assert.equal('periodColumn' in buildFactorTemplateDefinition(form), false)
})

const fields = [{ code: 'surgery_level', label: '手术级别', dataType: 'INTEGER' }, { code: 'duration', label: '手术时长', dataType: 'DECIMAL' }]
const literal = value => ({ expressionType: 'LITERAL', dataType: 'DECIMAL', value })
test('nested AND OR NOT, template values and field expressions survive serialization and editing', () => {
  const form = designer()
  form.filters = { nodeType: 'AND', children: [form.filters, { nodeType: 'OR', children: [
    { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'duration', operator: 'IS_NULL' } },
    { nodeType: 'PREDICATE', left: { expressionType: 'BINARY', operator: 'MULTIPLY', left: { expressionType: 'FIELD', fieldCode: 'duration' }, right: literal(60) }, operator: 'GTE', right: literal({ parameterRef: 'LEVEL' }) }
  ] }] }
  assert.deepEqual(validateTemplateConditions(form, fields), [])
  const first = buildFactorTemplateDefinition(form, fields)
  form.filters = editableFilterTree(first.filters)
  const second = buildFactorTemplateDefinition(form, fields)
  assert.equal(second.filters.children[0].value.parameterRef, 'LEVEL')
  assert.equal(second.filters.children[1].children[0].child.children[0].operator, 'IS_NULL')
  assert.deepEqual(second.filters.children[1].children[1], first.filters.children[1].children[1])
  assert.match(describeTemplateConditions(form.filters, fields, form.parameters), /参数「手术级别」/)
  assert.doesNotMatch(describeTemplateConditions(form.filters, fields, form.parameters), /\[object Object\]/)
})

test('aggregate expressions and runtime conditions preserve different parameter lifecycles', () => {
  const form = designer()
  form.aggregation = 'SUM'
  form.fieldCode = 'obsolete'
  form.fieldExpression = { expressionType: 'BINARY', operator: 'MULTIPLY', left: { expressionType: 'FIELD', fieldCode: 'duration' }, right: literal({ parameterRef: 'LEVEL' }) }
  form.filters = { nodeType: 'PREDICATE', fieldCode: 'duration', operator: 'GT', parameter: 'minDuration', parameterDefinition: { type: 'DECIMAL', required: true, parameterMode: 'TEMPORARY' } }
  const dsl = buildFactorTemplateDefinition(form, fields)
  assert.deepEqual(validateTemplateConditions(form, fields), [])
  assert.equal(dsl.aggregation.fieldCode, undefined)
  assert.equal(dsl.aggregation.fieldExpression.right.value.parameterRef, 'LEVEL')
  assert.deepEqual(dsl.parameters, [{ code: 'minDuration', type: 'DECIMAL', source: 'RUNTIME', required: true, parameterMode: 'TEMPORARY' }])
  assert.equal(dsl.filters.parameter, 'minDuration')
})

test('removed parameters, incomplete groups and changed source fields block save', () => {
  const form = designer()
  form.parameters = []
  assert.match(validateTemplateConditions(form, fields).join(), /模板参数/)
  form.filters = { nodeType: 'AND', children: [] }
  assert.match(validateTemplateConditions(form, fields).join(), /条件组不能为空/)
  form.filters = { nodeType: 'PREDICATE', fieldCode: 'removed', operator: 'EQ', value: 2 }
  assert.match(validateTemplateConditions(form, fields).join(), /不属于当前物理表/)
  form.scopeMode = 'ALL'
  assert.deepEqual(validateTemplateConditions(form, fields), [])
  assert.deepEqual(buildFactorTemplateDefinition(form, fields).filters, { nodeType: 'TRUE' })
})

test('range and text function expressions retain values, boundaries, and parameter references', () => {
  const form = designer()
  form.filters = { nodeType: 'PREDICATE', left: { expressionType: 'FUNCTION', function: 'LEFT', arguments: [{ expressionType: 'FIELD', fieldCode: 'surgery_level' }, literal(1)] }, operator: 'BETWEEN', right: { expressionType: 'RANGE', bounds: 'CLOSED', start: literal(1), end: literal({ parameterRef: 'LEVEL' }) } }
  assert.deepEqual(validateTemplateConditions(form, fields), [])
  assert.deepEqual(buildFactorTemplateDefinition(form, fields).filters, form.filters)
})
test('advanced definition retains governed join aliases, grouping, and parameterized aggregation', () => {
  const form = designer(); form.primaryOptions = { sourceAlias: 'source' }; form.groupBy = ['surgery_level']
  form.extraDefinition = { joins: [{ relationId: '100', sourceAlias: 'visit' }], aggregationField: { fieldCode: { parameterRef: 'FIELD' } } }
  const dsl = buildFactorTemplateDefinition(form)
  assert.equal(dsl.primaryDomain.sourceAlias, 'source')
  assert.deepEqual(dsl.groupBy, ['surgery_level'])
  assert.deepEqual(dsl.aggregation.fieldRef, { parameterRef: 'FIELD' })
  assert.equal(dsl.joins[0].relationId, '100')
  assert.equal('aggregationField' in dsl, false)
})
