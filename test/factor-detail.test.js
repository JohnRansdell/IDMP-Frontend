import test from 'node:test'
import assert from 'node:assert/strict'
import { factorDetailVersionId, assertFactorVersionOwner, factorQueryRows } from '../src/idmp/features/factor/detail.js'
test('detail defaults to the published version, while allowing an explicitly requested draft', () => {
  const versions = [{ id: '100000000000000001', versionNo: 1 }, { id: '100000000000000002', versionNo: 2 }]
  const factor = { currentPublishedVersionId: '100000000000000001' }
  assert.equal(factorDetailVersionId(factor, versions), '100000000000000001')
  assert.equal(factorDetailVersionId(factor, []), '100000000000000001')
  assert.equal(factorDetailVersionId(factor, versions, '100000000000000002'), '100000000000000002')
  assert.equal(factorDetailVersionId({}, versions), '100000000000000002')
  assert.equal(factorDetailVersionId({}, []), '')
})
test('version ownership rejects mismatched and missing factor IDs without losing integer precision', () => {
  assert.doesNotThrow(() => assertFactorVersionOwner({ factorId: '100000000000000001' }, '100000000000000001'))
  assert.throws(() => assertFactorVersionOwner({ factorId: '100000000000000002' }, '100000000000000001'), /不属于/)
  assert.throws(() => assertFactorVersionOwner({}, '100000000000000001'), /不属于/)
})
test('query rows retain returned dimensions and support flat grouped result columns', () => {
  assert.deepEqual(factorQueryRows({ grainFieldCodes: ['dept'], records: [{ dept: 'A', value: 3 }] }), [{ dept: 'A', value: 3, dimensions: { dept: 'A' } }])
  assert.deepEqual(factorQueryRows({ rows: [{ value: 0, dimensions: { group: 'B' } }] }), [{ value: 0, dimensions: { group: 'B' } }])
})
