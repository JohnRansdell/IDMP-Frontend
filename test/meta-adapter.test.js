import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDataDomainList, adaptSemanticFieldList, adaptSemanticTableList, adaptSourceFieldList } from '../src/idmp/api/adapters/meta.js'
import { validateSemanticFieldCode, SEMANTIC_DATA_TYPES } from '../src/idmp/utils/validation.js'

test('API adapters preserve BIGINT ids as opaque strings', () => {
  const id = '9223372036854775807'
  assert.equal(adaptDataDomainList([{ id, code: 'D', name: 'Domain' }])[0].id, id)
  assert.equal(typeof adaptSemanticTableList([{ id, code: 'T' }])[0].id, 'string')
})

test('semantic field adapter exposes stable fields and validates code/type', () => {
  const field = adaptSemanticFieldList([{ id: '1', code: 'DEATH_DATETIME', name: '死亡时间', dataType: 'DATETIME', semanticKind: 'dimension', sensitive: true }])[0]
  assert.equal(field.code, 'DEATH_DATETIME')
  assert.equal(field.dataType, 'DATETIME')
  assert.equal(field.sensitive, true)
  assert.equal(field.semanticKind, 'DIMENSION')
  assert.equal(field.semanticRole, 'DIMENSION')
  assert.equal(validateSemanticFieldCode('death-time'), false)
  assert.equal(validateSemanticFieldCode('DEATH_DATETIME'), true)
  assert.ok(SEMANTIC_DATA_TYPES.includes('DATE'))
})

test('source field adapter preserves Chinese comments for mapping guidance', () => {
  const field = adaptSourceFieldList([{ columnName: 'death_datetime', columnType: 'datetime', nullable: true, comment: '死亡时间' }])[0]
  assert.equal(field.columnName, 'death_datetime')
  assert.equal(field.comment, '死亡时间')
  assert.equal(field.nullable, true)
})
