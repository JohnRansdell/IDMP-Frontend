import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { adaptDataDomainList, adaptSemanticFieldList, adaptSemanticTableList, adaptSourceFieldList } from '../src/idmp/api/adapters/meta.js'
import { dataTypeLabel, matchModeLabel, semanticKindLabel, sourceObjectTypeLabel, transformOptionLabel } from '../src/idmp/features/meta/index.js'
import { validateSemanticFieldCode, SEMANTIC_DATA_TYPES } from '../src/idmp/utils/validation.js'

test('API adapters preserve BIGINT ids as opaque strings', () => {
  const id = '9223372036854775807'
  assert.equal(adaptDataDomainList([{ id, code: 'D', name: 'Domain' }])[0].id, id)
  const table = adaptSemanticTableList([{ id, code: 'T' }])[0]
  assert.equal(typeof table.id, 'string')
  assert.equal(table.viewMappingId, id)
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

test('metadata enum labels are Chinese and preserve unknown backend codes', () => {
  assert.equal(matchModeLabel('exact'), '精确匹配')
  assert.equal(dataTypeLabel('DATETIME'), '日期时间')
  assert.equal(dataTypeLabel('VALUE_SET'), '值集')
  assert.equal(semanticKindLabel('dimension'), '维度')
  assert.equal(sourceObjectTypeLabel('BASE TABLE'), '数据表')
  assert.equal(transformOptionLabel('TRIM'), '去除首尾空白')
  assert.equal(matchModeLabel('REGEX'), 'REGEX')
})

test('data domain workspace places relation governance directly after the selected table context', async () => {
  const file = fileURLToPath(new URL('../src/idmp/views/DataDomainWorkspace.vue', import.meta.url))
  const source = await readFile(file, 'utf8')
  const contextIndex = source.indexOf('<h2>当前语义表上下文</h2>')
  const relationIndex = source.indexOf('<h2>语义表关联关系</h2>')
  const mappingIndex = source.indexOf('<h2>语义字段映射</h2>')

  assert.ok(contextIndex >= 0)
  assert.ok(relationIndex > contextIndex)
  assert.ok(mappingIndex > relationIndex)
})
