import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/idmp/api/modules/meta.js', import.meta.url), 'utf8')
const api = await import(`data:text/javascript;base64,${Buffer.from(source.replace(
  "import { requestJson } from '@/idmp/api/request'",
  'const requestJson = (path, options) => ({ path, options })'
)).toString('base64')}`)

test('metadata API no longer exposes unused shortcut or flattened fields', () => {
  assert.equal('bindSourceTableDomain' in api, false)
  assert.equal('fetchSemanticFields' in api, false)
})

test('不再导出旧语义表接口封装', () => {
  for (const name of ['createSemanticTable', 'saveSemanticField', 'updateDefaultTimeField',
    'fetchSemanticTables', 'fetchSemanticTableFields']) {
    assert.equal(name in api, false, name)
  }
})

test('field lists remain scoped to the selected physical table', () => {
  assert.equal(api.fetchPhysicalTableFields('10', 'visit/archive').path,
    '/meta/data-domains/10/physical-tables/visit%2Farchive/semantic-fields')
  assert.equal(api.fetchSourceTableFields('visit/archive').path,
    '/meta/source-tables/visit%2Farchive/fields')
})

test('physical table binding preserves the explicit field payload', () => {
  const payload = { sourceFieldName: 'out_date', name: '出院时间' }
  assert.deepEqual(api.bindPhysicalTableField('10', 'visits', payload), {
    path: '/meta/data-domains/10/physical-tables/visits/semantic-fields',
    options: { method: 'POST', body: JSON.stringify(payload) }
  })
})
