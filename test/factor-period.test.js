import test from 'node:test'
import assert from 'node:assert/strict'
import { factorPeriodColumn, factorCalculationMode, canonicalPeriodColumn, withoutLegacyPeriod } from '../src/idmp/utils/factorPeriod.js'
import { buildFactorDsl } from '../src/idmp/utils/dslBuilder.js'

const period = field => ({ nodeType: 'PREDICATE', fieldCode: field, operator: 'BETWEEN', parameter: 'period' })
const business = { nodeType: 'PREDICATE', fieldCode: 'cost', operator: 'BETWEEN', value: { start: 1, end: 10 } }

test('ordinary and native SQL column-only factors are temporal', () => {
  for (const definitionType of [undefined, 'SQL']) {
    assert.equal(factorCalculationMode({ definitionType, periodColumn: 'joined.event_time' }), 'TEMPORAL')
    assert.equal(factorPeriodColumn({ definitionType, periodColumn: 'joined.event_time' }), 'joined.event_time')
  }
  assert.equal(factorCalculationMode({ definitionType: 'SQL' }), 'STATIC')
  assert.equal(factorCalculationMode({ periodColumn: 't.time', calculationMode: 'STATIC' }), 'STATIC')
  assert.equal(factorCalculationMode({ primaryDomain: { tableName: 'visit' } }), 'TEMPORAL')
})

test('legacy alias references migrate without losing literal business ranges or modifying input', () => {
  const filters = { nodeType: 'AND', children: [{ ...period(''), fieldRef: { sourceAlias: 'joined', fieldCode: 'event_time' } }, business] }
  const before = JSON.stringify(filters)
  assert.equal(factorPeriodColumn({ filters }), 'joined.event_time')
  assert.deepEqual(withoutLegacyPeriod(filters), { nodeType: 'AND', children: [business] })
  assert.equal(JSON.stringify(filters), before)
  const dsl = buildFactorDsl({ domainCode: 'VISIT', tableName: 'visit', aggregation: 'COUNT', filters })
  assert.equal(dsl.periodColumn, 'joined.event_time')
  assert.deepEqual(dsl.filters.children, [business])
})

test('conflicting new and old columns are rejected, equal resolved mappings accepted', () => {
  assert.throws(() => canonicalPeriodColumn('out_date', period('in_date')), /不一致/)
  assert.throws(() => canonicalPeriodColumn('', { nodeType: 'AND', children: [period('in_date'), period('out_date')] }), /不一致/)
  const fields = [{ code: 'joined.event_time', semanticFieldCode: 'TIME', sourceAlias: 'joined', physicalColumn: 'event_time' }]
  assert.equal(canonicalPeriodColumn('joined.event_time', period('joined.TIME'), fields), 'joined.event_time')
})

test('period conditions under OR and NOT cannot silently change business semantics', () => {
  assert.throws(() => withoutLegacyPeriod({ nodeType: 'OR', children: [period('time'), business] }), /不能位于/)
  assert.throws(() => withoutLegacyPeriod({ nodeType: 'NOT', child: period('time') }), /不能位于/)
})

test('all-record temporal factors keep root period while static output omits it', () => {
  const input = { domainCode: 'VISIT', tableName: 'visit', aggregation: 'COUNT', filters: { nodeType: 'TRUE' }, periodColumn: 'in_date' }
  assert.equal(buildFactorDsl(input).periodColumn, 'in_date')
  assert.equal('periodColumn' in buildFactorDsl({ ...input, calculationMode: 'STATIC' }), false)
})
