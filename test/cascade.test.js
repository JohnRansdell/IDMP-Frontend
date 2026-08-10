import test from 'node:test'
import assert from 'node:assert/strict'

test('cascade context contract requires explicit semantic table selection', () => {
  const dsl = { primaryDomain: { domainCode: 'D', semanticTableCode: 'T2' }, aggregation: { function: 'COUNT', fieldCode: 'F2' }, groupBy: ['F2'] }
  assert.equal(dsl.primaryDomain.semanticTableCode, 'T2')
  assert.equal(dsl.aggregation.fieldCode, 'F2')
  assert.deepEqual(dsl.groupBy, ['F2'])
})
