import test from 'node:test'
import assert from 'node:assert/strict'
import { factorPeriodColumn, factorCalculationMode } from '../src/idmp/utils/factorPeriod.js'
import { buildFactorDsl, validateFilterNode } from '../src/idmp/utils/dslBuilder.js'

const business = { nodeType: 'PREDICATE', fieldCode: 'out_date', operator: 'BETWEEN', value: { start: '2026-01-01', end: '2026-06-30' } }

test('physical and SQL factors use the same explicit time field and mode', () => {
  for (const definitionType of [undefined, 'SQL']) {
    assert.equal(factorCalculationMode({ definitionType, periodColumn: 'joined.event_time' }), 'TEMPORAL')
    assert.equal(factorPeriodColumn({ periodColumn: { sourceAlias: 'joined', fieldCode: 'event_time' } }), 'joined.event_time')
    assert.equal(factorCalculationMode({ definitionType }), 'STATIC')
    assert.equal(factorCalculationMode({ definitionType, calculationMode: 'TEMPORAL' }), 'TEMPORAL')
  }
  assert.equal(factorCalculationMode({ periodColumn: 't.time', calculationMode: 'STATIC' }), 'STATIC')
  assert.equal(factorCalculationMode({ primaryDomain: { tableName: 'visit' } }), 'STATIC')
})

test('filters never infer the statistics field and reserved period parameters are rejected', () => {
  const filters = { nodeType: 'PREDICATE', fieldCode: 'old_date', operator: 'BETWEEN', parameter: 'period' }
  assert.equal(factorPeriodColumn({ filters }), '')
  assert.equal(factorCalculationMode({ filters }), 'STATIC')
  assert.ok(validateFilterNode(filters).some(message => message.includes('重名')))
})

for (const nodeType of ['AND', 'OR', 'NOT']) {
  test(`explicit time binding preserves ${nodeType} date conditions without modifying input`, () => {
    const filters = nodeType === 'NOT' ? { nodeType, child: business } : { nodeType, children: [business] }
    const before = JSON.stringify(filters)
    const input = { tableName: 'visit', aggregation: 'COUNT', filters, periodColumn: 'admission_date' }
    const temporal = buildFactorDsl(input)
    assert.equal(temporal.periodColumn, 'admission_date')
    assert.deepEqual(temporal.filters, filters)
    assert.deepEqual(buildFactorDsl({ ...input, calculationMode: 'STATIC' }).filters, filters)
    assert.equal('periodColumn' in buildFactorDsl({ ...input, calculationMode: 'STATIC' }), false)
    assert.equal(JSON.stringify(filters), before)
  })
}
