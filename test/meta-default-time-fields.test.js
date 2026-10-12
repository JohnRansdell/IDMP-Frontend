import test from 'node:test'
import assert from 'node:assert/strict'
import { applySemanticFieldDetails, defaultTimeFieldOptions } from '../src/idmp/features/meta/defaultTimeFields.js'

test('text out_date from the actual source schema is selectable alongside datetime create_date', () => {
  const mapped = [
    { code: 'CREATE_DATE', name: '创建时间', sourceFieldName: 'create_date', dataType: 'DATETIME' },
    { code: 'DISCHARGE_TIME', name: '出院时间', sourceFieldName: 'out_date', dataType: 'STRING' },
    { code: 'SEX', name: '性别', sourceFieldName: 'sex', dataType: 'STRING' }
  ]
  const source = [
    { columnName: 'create_date', columnType: 'datetime' },
    { columnName: 'out_date', columnType: 'varchar(32)' },
    { columnName: 'sex', columnType: 'varchar(10)' }
  ]
  const options = defaultTimeFieldOptions(mapped, source, 'DISCHARGE_TIME')
  assert.deepEqual(options.map(field => field.code), ['CREATE_DATE', 'DISCHARGE_TIME'])
  assert.match(options[1].timeFieldHint, /文本/)
  assert.deepEqual(defaultTimeFieldOptions(mapped, source).map(field => field.code), ['CREATE_DATE', 'DISCHARGE_TIME'])
})

test('an existing default remains visible even when its text field name is unconventional', () => {
  const fields = [{ code: 'PERIOD', sourceFieldName: 'recorded', dataType: 'STRING' }]
  const source = [{ columnName: 'recorded', columnType: 'varchar(32)' }]
  assert.deepEqual(defaultTimeFieldOptions(fields, source, 'PERIOD').map(field => field.code), ['PERIOD'])
  assert.deepEqual(defaultTimeFieldOptions(fields, source), [])
  assert.deepEqual(defaultTimeFieldOptions([{ code: 'LEGACY_TIME', dataType: 'STRING' }], [], 'LEGACY_TIME').map(field => field.code), ['LEGACY_TIME'])
})

test('semantic detail corrects the physical list type before choosing a default time field', () => {
  const source = [{ columnName: 'out_date', columnType: 'varchar(32)' }]
  const list = [{ id: '7', code: 'DISCHARGE_TIME', sourceFieldName: 'out_date', dataType: 'STRING' }]
  const fields = applySemanticFieldDetails(list, new Map([['7', { valueType: 'DATETIME', semanticKind: 'TIME' }]]))
  assert.equal(fields[0].dataType, 'DATETIME')
  assert.deepEqual(defaultTimeFieldOptions(fields, source).filter(field => ['DATE', 'DATETIME'].includes(field.dataType)).map(field => field.code), ['DISCHARGE_TIME'])
  assert.match(defaultTimeFieldOptions(fields, source)[0].timeFieldHint, /文本/)
  const invalid = applySemanticFieldDetails(list, new Map([['7', { valueType: 'STRING' }]]))
  assert.deepEqual(defaultTimeFieldOptions(invalid, source).filter(field => ['DATE', 'DATETIME'].includes(field.dataType)), [])
})
