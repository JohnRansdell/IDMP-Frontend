import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { adaptDataDomainList, adaptPhysicalTableList, adaptSemanticFieldList, adaptSemanticTableList, adaptSourceFieldList } from '../src/idmp/api/adapters/meta.js'
import { dataTypeLabel, matchModeLabel, semanticKindLabel, sourceObjectTypeLabel, transformOptionLabel } from '../src/idmp/features/meta/index.js'
import { validateSemanticFieldCode, SEMANTIC_DATA_TYPES } from '../src/idmp/utils/validation.js'
import { adaptFactorPhysicalFields, physicalFieldDataType } from '../src/idmp/api/adapters/factorMetadata.js'

test('API adapters preserve BIGINT ids as opaque strings', () => {
  const id = '9223372036854775807'
  assert.equal(adaptDataDomainList([{ id, code: 'D', name: 'Domain' }])[0].id, id)
  const table = adaptSemanticTableList([{ id, code: 'T' }])[0]
  assert.equal(typeof table.id, 'string')
  assert.equal(table.viewMappingId, id)
  assert.equal(adaptPhysicalTableList([{ id, domainId: id, tableName: 'visit' }])[0].domainId, id)
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

test('data domain workspace uses physical tables without legacy semantic-table operations', async () => {
  const file = fileURLToPath(new URL('../src/idmp/views/DataDomainWorkspace.vue', import.meta.url))
  const source = await readFile(file, 'utf8')
  assert.match(source, /fetchPhysicalTables/)
  assert.match(source, /bindPhysicalTableField/)
  assert.match(source, /updatePhysicalTableDefaultTimeField/)
  assert.match(source, /openValueSetBinding/)
  assert.match(source, /openStandardization/)
  assert.match(source, /openFieldProfile/)
  assert.doesNotMatch(source, /fetchSemanticTables|createSemanticTable|semantic-table-relations/)
})

test('validated effective types survive metadata and ordinary factor field adapters', () => {
  const mapped = adaptSemanticFieldList([{ id: '1', code: 'EVENT_TIME', name: '事件时间', sourceFieldName: 'event_time',
    dataType: 'DATETIME', sourceDataType: 'varchar(32)', conversionFormat: 'yyyy/MM/dd HH:mm:ss' }])
  assert.equal(mapped[0].sourceDataType, 'varchar(32)')
  assert.equal(mapped[0].conversionFormat, 'yyyy/MM/dd HH:mm:ss')
  const fields = adaptFactorPhysicalFields(mapped, [{ columnName: 'event_time', columnType: 'varchar(32)' }], { isBase: true })
  assert.equal(fields[0].dataType, 'DATETIME')
})

test('factor field options use physical columns and types while preserving governance ids', () => {
  const fields = adaptFactorPhysicalFields([
    { id: '9223372036854775807', code: 'ADMISSION_TIME', sourceFieldName: 'in_date', name: '入院时间', dataType: 'STRING', filterable: true },
    { id: '2', code: 'AMOUNT', sourceFieldName: 'fee', dataType: 'STRING', aggregatable: false, valueSetId: '3' },
    { id: '4', code: 'UNMAPPED', dataType: 'STRING' }
  ], [
    { columnName: 'IN_DATE', columnType: 'datetime' },
    { columnName: 'fee', columnType: 'decimal(12,2)', comment: '费用' },
    { columnName: 'ungoverned', columnType: 'varchar(20)' }
  ], { sourceAlias: 'join1', sourceName: 'visit' })
  assert.equal(fields.length, 2)
  assert.equal(fields[0].code, 'join1.IN_DATE')
  assert.equal(fields[0].semanticFieldCode, 'ADMISSION_TIME')
  assert.equal(fields[0].id, '9223372036854775807')
  assert.equal(fields[0].kind, 'DATETIME')
  assert.equal(fields[1].kind, 'NUMBER')
  assert.equal(fields[1].label, '费用')
  assert.equal(fields[1].aggregatable, false)
  assert.equal(fields[1].valueSetId, '3')
  assert.equal(adaptFactorPhysicalFields([{ code: 'KEY', sourceFieldName: 'id' }], [], { isBase: true })[0].code, 'id')
})

test('physical MySQL types do not treat text dates as datetime', () => {
  for (const type of ['int unsigned', 'bigint(20)', 'decimal(10,2)', 'float', 'double']) assert.match(physicalFieldDataType(type), /INTEGER|DECIMAL/)
  assert.equal(physicalFieldDataType('varchar(40)', 'DATETIME'), 'STRING')
  assert.equal(physicalFieldDataType('', 'DATETIME'), 'DATETIME')
})

test('ordinary factor editor uses physical-table APIs and the physical relation contract', async () => {
  const source = await readFile(new URL('../src/idmp/views/FactorEditor.vue', import.meta.url), 'utf8')
  assert.match(source, /fetchPhysicalTables/)
  assert.match(source, /fetchPhysicalTableFields/)
  assert.match(source, /fetchPhysicalTableRelations/)
  assert.match(source, /leftPhysicalTableBindingId/)
  assert.match(source, /tableName:dslForm.tableName/)
  assert.doesNotMatch(source, /fetchSemanticTables|fetchSemanticTableFields|fetchSemanticTableRelations|主语义表/)
})
