import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapters from '../src/idmp/api/adapters/meta.js'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { shallowMount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/SourceMetadataManagement.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ refreshSource, loadSourceDatabase, sourceTables })\n</script>'))
const compiled = compileScript(descriptor, { id: 'source-database', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => { const [original, local = original] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${original};` })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')

async function create(fetchDatabase) {
  const deps = Object.fromEntries([...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)].flatMap(([, names, name]) => (names ? names.split(',').map(x => x.trim()) : [name]).map(name => [name, () => []])))
  Object.assign(deps, adapters, { fetchSourceDatabase: fetchDatabase, fetchSourceTables: async () => [{ tableName: '病案', tableType: 'BASE TABLE', comment: '', fieldCount: 2 }], formatApiError: e => e.message, ElMessage: { error() {} } })
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).filter(name => !['computed', 'onMounted', 'reactive', 'ref'].includes(name)).join(',')} } = deps; ${bindings}\n${body}`)(vue, deps)
  const stubs = Object.fromEntries([...source.matchAll(/<(el-[a-z-]+)/g)].map(([, name]) => [name, true]))
  const wrapper = shallowMount(component, { global: { directives: { access: {} }, stubs } })
  await flushPromises()
  return wrapper
}

test('展示源库地址、类型和库名，刷新后更新', async () => {
  let host = '10.20.30.40'
  const wrapper = await create(async () => ({ host, databaseType: 'MySQL', databaseName: 'yunnan-vmq' }))
  const summary = () => wrapper.find('[aria-label="源数据库信息"]').text()
  assert.match(summary(), /10\.20\.30\.40/)
  assert.match(summary(), /MySQL/)
  assert.match(summary(), /yunnan-vmq/)
  host = 'source.internal'
  await wrapper.vm.refreshSource()
  assert.match(summary(), /source\.internal/)
  wrapper.unmount()
})

test('摘要失败不阻断目录，重试可恢复，空字段显示未提供', async () => {
  let failed = true
  const wrapper = await create(async () => { if (failed) throw new Error('源数据库连接超时'); return { host: null, databaseType: 'MySQL', databaseName: '业务源库' } })
  assert.equal(wrapper.vm.sourceTables.length, 1)
  assert.match(wrapper.find('[role="alert"]').text(), /源数据库连接超时/)
  failed = false
  await wrapper.vm.loadSourceDatabase()
  assert.equal(wrapper.find('[role="alert"]').exists(), false)
  assert.match(wrapper.find('[aria-label="源数据库信息"]').text(), /未提供/)
  wrapper.unmount()
})
