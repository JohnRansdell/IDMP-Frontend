import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/idmp/api/modules/meta.js', import.meta.url), 'utf8')
const api = await import(`data:text/javascript;base64,${Buffer.from(source.replace(
  "import { requestJson } from '@/idmp/api/request'",
  'const requestJson = (path, options) => ({ path, options })'
).replace("from '../pagination.js'", `from '${new URL('../src/idmp/api/pagination.js', import.meta.url).href}'`)).toString('base64')}`)

test('源库摘要刷新绕过请求缓存', () => {
  assert.deepEqual(api.fetchSourceDatabase(), { path: '/meta/source-database', options: { cache: 'no-store' } })
})

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

test('移除使用当前数据域与绑定 ID，不发送源表删除请求', () => {
  assert.deepEqual(api.removePhysicalTable('10', '102027642460301739'), {
    path: '/meta/data-domains/10/physical-tables/102027642460301739',
    options: { method: 'DELETE' }
  })
})
