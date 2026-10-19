import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptFactorSourceFields } from '../src/idmp/api/adapters/factorMetadata.js'
import { buildFactorDsl, serializeFilterNode, serializeExpression, hasUnsupportedFactorDslExpressions, validateFilterNode, collectParameters, editableFilterTree } from '../src/idmp/utils/dslBuilder.js'

const field = code => ({ expressionType: 'FIELD', fieldCode: code })
const literal = (value, dataType = 'INTEGER') => ({ expressionType: 'LITERAL', dataType, value })
const fields = [{ code: 'age', dataType: 'INTEGER' }, { code: 'admission', dataType: 'DATETIME' }, { code: 'discharge', dataType: 'DATETIME' }, { code: 'joined.dept', dataType: 'STRING' }]
const parameter = (code = 'minimum', type = 'INTEGER') => ({ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', parameter: code, parameterDefinition: { type, required: false, parameterMode: 'TEMPORARY' } })

test('physical source fields and SQL DSL do not require a domain or a value set', () => {
  const fields = adaptFactorSourceFields([
    { columnName: 'age', columnType: 'int', comment: '年龄' },
    { columnName: 'admission', columnType: 'datetime' },
    { columnName: 'flag', columnType: 'tinyint(1)' },
    { columnName: 'birthday', columnType: 'date' },
    { columnName: 'dept', columnType: 'varchar(32)' }
  ], { isBase: true })
  assert.equal(fields.length, 5)
  assert.equal(fields[0].code, 'age')
  assert.equal(fields[0].dataType, 'INTEGER')
  assert.equal(fields[0].label, '年龄')
  assert.equal(fields[0].id, '')
  assert.equal(fields[2].dataType, 'BOOLEAN')
  assert.equal(fields[3].dataType, 'DATE')
  assert.deepEqual(fields[4].options, [])
  const dsl = buildFactorDsl({ tableName: 'vmq_visit', calculationMode: 'STATIC', aggregation: 'COUNT_DISTINCT', fieldCode: 'age',
    filters: { nodeType: 'AND', children: [{ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }] }, fields })
  assert.deepEqual(dsl.primaryDomain, { tableName: 'vmq_visit' })
  assert.equal(dsl.filters.children[0].valueSetVersionId, undefined)
})

test('inline physical joins retain table names, aliases and all key pairs without creating domain relations', () => {
  const joins = [{ fromAlias: 'base', sourceAlias: 'transfer', tableName: 'vmq_transfer', joinType: 'INNER', cardinality: 'MANY_TO_ONE',
    keys: [{ fromField: 'id', targetField: 'visit_id' }, { fromField: 'org', targetField: 'org' }], fields: [] }]
  const dsl = buildFactorDsl({ tableName: 'vmq_visit', calculationMode: 'STATIC', aggregation: 'COUNT', joins, filters: { nodeType: 'TRUE' } })
  assert.deepEqual(dsl.joins, [{ fromAlias: 'base', sourceAlias: 'transfer', tableName: 'vmq_transfer', joinType: 'INNER', cardinality: 'MANY_TO_ONE',
    keys: [{ fromField: 'id', targetField: 'visit_id' }, { fromField: 'org', targetField: 'org' }] }])
  assert.equal(dsl.primaryDomain.sourceAlias, 'base')
  assert.equal(dsl.joins[0].relationId, undefined)
})

test('ordinary comparisons, null predicates and boolean nesting serialize independently of value sets', () => {
  const filters = { nodeType: 'OR', children: [{ nodeType: 'PREDICATE', fieldCode: 'age', operator: 'GTE', value: 18 }, { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldCode: 'joined.dept', operator: 'IS_NULL' } }] }
  assert.deepEqual(validateFilterNode(filters, [], fields), [])
  const result = serializeFilterNode(filters)
  assert.equal(result.nodeType, 'OR')
  assert.deepEqual(result.children[1].child.fieldRef, { sourceAlias: 'joined', fieldCode: 'dept' })
})

test('time differences and durations survive a visual edit without flattening', () => {
  const filters = { nodeType: 'PREDICATE', left: { expressionType: 'BINARY', operator: 'SUBTRACT', left: field('discharge'), right: field('admission') }, operator: 'LTE', right: { ...literal(48, 'DURATION'), unit: 'HOUR' } }
  assert.equal(hasUnsupportedFactorDslExpressions({ filters }), false)
  assert.deepEqual(validateFilterNode(filters, [], fields), [])
  assert.deepEqual(serializeFilterNode(filters), filters)
  const roundTrip = serializeFilterNode(serializeFilterNode(filters))
  assert.deepEqual(roundTrip, filters)
})

test('runtime business parameters retain their type and do not become system periods', () => {
  const filters = { nodeType: 'AND', children: [parameter(), { ...parameter('after', 'DATETIME'), fieldCode: 'admission' }] }
  const dsl = buildFactorDsl({ domainCode: 'VISIT', tableName: 'visits', aggregation: 'COUNT', filters, fields, periodColumn: 'discharge' })
  assert.deepEqual(dsl.parameters, [{ code: 'period', type: 'PERIOD', source: 'RUNTIME' }, { code: 'minimum', type: 'INTEGER', source: 'RUNTIME', required: false, parameterMode: 'TEMPORARY' }, { code: 'after', type: 'DATETIME', source: 'RUNTIME', required: false, parameterMode: 'TEMPORARY' }])
  assert.equal(dsl.filters.children[0].parameter, 'minimum')
  assert.equal('parameterDefinition' in dsl.filters.children[0], false)
  assert.deepEqual(validateFilterNode(filters, [], fields), [])
})

test('duplicate compatible parameters merge but conflicting declarations prevent saving', () => {
  const filters = { nodeType: 'AND', children: [parameter(), parameter()] }
  assert.equal(collectParameters(filters).length, 1)
  filters.children[1].parameterDefinition.type = 'STRING'
  assert.match(validateFilterNode(filters, [], fields).join(' '), /同名运行参数/)
  for (const code of ['periodStart', 'periodEnd', 'bad-name']) assert.match(validateFilterNode(parameter(code), [], fields).join(' '), /运行参数名称/)
})

test('aggregation expressions and controlled text functions preserve their definitions', () => {
  const expression = { expressionType: 'FUNCTION', function: 'LEFT', arguments: [field('joined.dept'), literal(5)] }
  const dsl = buildFactorDsl({ domainCode: 'VISIT', tableName: 'visits', aggregation: 'COUNT_DISTINCT', fieldExpression: expression, filters: { nodeType: 'TRUE' } })
  assert.deepEqual(dsl.aggregation.fieldExpression.arguments[0], { expressionType: 'FIELD', fieldRef: { sourceAlias: 'joined', fieldCode: 'dept' } })
  assert.equal(hasUnsupportedFactorDslExpressions({ aggregation: { fieldExpression: expression } }), false)
  assert.equal(hasUnsupportedFactorDslExpressions({ aggregation: { fieldExpression: { expressionType: 'RAW_SQL', sql: 'bad' } } }), true)
  assert.throws(() => serializeExpression({ expressionType: 'RAW_SQL', sql: 'bad' }), /无法编辑/)
})

test('field-to-field comparison and range boundaries round-trip', () => {
  const filters = { nodeType: 'PREDICATE', fieldCode: 'admission', operator: 'LT', right: field('discharge') }
  assert.deepEqual(validateFilterNode(filters, [], fields), [])
  assert.deepEqual(serializeFilterNode(filters).left, field('admission'))
  const range = { expressionType: 'RANGE', bounds: 'HALF_OPEN', start: literal(0), end: literal(48) }
  assert.deepEqual(serializeExpression(range), range)
})

test('existing runtime declarations and field-name references hydrate without losing required flags', () => {
  const original = { nodeType: 'NOT', child: { nodeType: 'PREDICATE', fieldRef: { sourceAlias: 'joined', fieldName: 'dept' }, operator: 'EQ', parameter: 'department' } }
  const parameters = [{ code: 'department', type: 'STRING', required: true, parameterMode: 'DIMENSION' }]
  const editable = editableFilterTree(original, parameters)
  assert.equal(editable.children[0].child.children[0].fieldCode, 'joined.dept')
  assert.deepEqual(collectParameters(editable), [{ ...parameters[0], source: 'RUNTIME' }])
  assert.deepEqual(validateFilterNode(editable, [], fields), [])
  assert.deepEqual(original.child.fieldRef, { sourceAlias: 'joined', fieldName: 'dept' })
})
