import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSemanticFieldUpdate } from '../src/idmp/features/meta/fieldUpdate.js'

test('editing an existing time field uses the semantic-field PATCH contract and preserves other metadata', () => {
  const detail = {
    resourceVersion: '9223372036854775807',
    nullable: false,
    unit: 'DAY',
    valueSetId: '102027642458341302',
    sensitivityLevel: 'HIGH',
    maskingPolicy: { mode: 'PARTIAL' }
  }
  const result = buildSemanticFieldUpdate(detail, {
    name: '出院时间', dataType: 'DATETIME', semanticKind: 'TIME', sensitive: true
  })
  assert.deepEqual(result, {
    resourceVersion: detail.resourceVersion,
    name: '出院时间', valueType: 'DATETIME', semanticKind: 'TIME',
    unit: 'DAY', nullable: false, valueSetId: detail.valueSetId,
    sensitivityLevel: 'HIGH', maskingPolicy: { mode: 'PARTIAL' }
  })
})

test('field edit requires versioned detail and maps an unchecked sensitive flag to NONE', () => {
  assert.throws(() => buildSemanticFieldUpdate({}, { name: '出院时间' }), /版本号或可空信息/)
  assert.deepEqual(buildSemanticFieldUpdate(
    { resourceVersion: 0, nullable: true, sensitivityLevel: 'MEDIUM' },
    { name: '出院时间', dataType: 'DATETIME', semanticKind: 'TIME', sensitive: false }
  ), {
    resourceVersion: 0, name: '出院时间', valueType: 'DATETIME', semanticKind: 'TIME',
    unit: null, nullable: true, valueSetId: null, sensitivityLevel: 'NONE', maskingPolicy: {}
  })
})
