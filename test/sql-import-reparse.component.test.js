import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as adapter from '../src/idmp/api/adapters/sqlImport.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { shallowMount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/views/SqlIndicatorImport.vue', import.meta.url), 'utf8')
const exposed = 'sql, importTask, factorMetadata, tableMappings, indicator, trialPeriod, runtimeParameterValues, runtimeQueryResult, createImport, sqlChanged, importBusy, operationError, refresh, metadataPayload'
const { descriptor } = parse(source.replace('</script>', `defineExpose({ ${exposed} })\n</script>`))
const compiled = compileScript(descriptor, { id: 'sql-reparse-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => { const [original, local = original] = name.trim().split(/\s+as\s+/); return `const ${local} = vue.${original};` })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Button = vue.defineComponent({ props: ['disabled', 'loading'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled || props.loading }, slots.default?.()) })
const elementStubs = Object.fromEntries([...source.matchAll(/<(el-[a-z-]+)/g)].map(([, name]) => [name, true]))
const task = (id, status = 'AWAITING_METADATA') => ({ importId: id, status, preview: { normalizedSql: 'SELECT COUNT(*) AS 人数 FROM 病案', factors: [{ key: '人数', suggestedName: `人数${id}`, dsl: {} }], tables: [] } })
function create(overrides = {}, query = {}) {
  const calls = { create: [], abandon: [], route: [] }
  let count = 0
  const deps = Object.fromEntries([...source.matchAll(/^import (?:\{([^}]+)\}|(\w+)) from /gm)].flatMap(([, names, name]) => (names ? names.split(',').map(x => x.trim()) : [name]).map(name => [name, () => []])))
  Object.assign(deps, adapter, {
    PageHeader: Pass, JsonCodePreview: Pass, SqlImportGroupingFields: Pass,
    ElMessage: { success() {}, warning() {}, error() {} }, ElMessageBox: { confirm: async () => {} },
    useRouter: () => ({ replace: value => calls.route.push(value), push() {} }), useRoute: () => ({ query }),
    fetchDataDomains: async () => [], adaptDataDomainList: value => value, fetchAllPages: async () => [],
    createSqlImport: async (payload, key) => { calls.create.push({ payload, key }); return task(String(++count)) },
    abandonSqlImport: async id => { calls.abandon.push(id); return task(id, 'ABANDONED') },
    fetchSqlImport: async id => task(id), ...overrides
  })
  const component = Function('vue', 'deps', `const { ${Object.keys(deps).filter(name => !['computed', 'onBeforeUnmount', 'onMounted', 'reactive', 'ref'].includes(name)).join(',')} } = deps;\n${bindings}\n${body}`)(vue, deps)
  const wrapper = shallowMount(component, { global: { mocks: { $can: () => false }, directives: { queryEnter: {}, loading: {} }, stubs: { ...elementStubs, 'el-button': Button } } })
  return { wrapper, calls }
}

test('修改后直接重新解析，重置旧映射、因子元数据、分组和试算条件', async () => {
  const { wrapper, calls } = create()
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  await wrapper.vm.createImport()
  await vue.nextTick()
  const reparse = wrapper.findAll('button').find(button => button.text() === '重新解析 SQL')
  assert.equal(reparse.element.disabled, false)
  wrapper.vm.factorMetadata[0].name = '旧名称'
  wrapper.vm.tableMappings['旧表'] = '旧映射'
  wrapper.vm.indicator.dimensionGrain = [{ fields: ['旧科室'] }]
  wrapper.vm.trialPeriod = ['2026-01-01', '2026-01-31']
  wrapper.vm.runtimeParameterValues.dept = '旧科室'
  wrapper.vm.runtimeQueryResult = { rows: [{ value: 99 }] }
  wrapper.vm.sql = 'SELECT COUNT(DISTINCT 住院号) AS 人数 FROM 病案'
  await vue.nextTick()
  assert.equal(wrapper.vm.sqlChanged, true)
  assert.equal(wrapper.text().includes('2. 确认治理元数据'), false)
  await reparse.trigger('click')
  await flushPromises()
  assert.equal(calls.create.length, 2)
  assert.notEqual(calls.create[0].key, calls.create[1].key)
  assert.deepEqual(calls.abandon, ['1'])
  assert.equal(calls.create[1].payload.sql, wrapper.vm.sql)
  assert.equal(calls.create[1].payload.tableMappings, undefined)
  assert.equal(wrapper.vm.factorMetadata[0].name, '人数2')
  assert.deepEqual(wrapper.vm.indicator.dimensionGrain, [])
  assert.deepEqual(wrapper.vm.trialPeriod, [])
  assert.deepEqual(wrapper.vm.runtimeParameterValues, {})
  assert.equal(wrapper.vm.runtimeQueryResult, null)
  assert.equal(wrapper.vm.sqlChanged, false)
  assert.equal(calls.route.at(-1).query.importId, '2')
  wrapper.unmount()
})

test('解析失败后保留编辑文本并允许再次提交，重复点击不会并发创建', async () => {
  let resolve
  let attempts = 0
  const { wrapper } = create({ createSqlImport: async () => { attempts++; if (attempts === 1) throw new Error('SQL 语法错误'); return new Promise(done => { resolve = done }) } })
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  await wrapper.vm.createImport()
  assert.equal(wrapper.vm.importBusy, false)
  assert.match(wrapper.vm.operationError.message, /SQL 语法错误/)
  const pending = wrapper.vm.createImport()
  await wrapper.vm.createImport()
  assert.equal(attempts, 2)
  resolve(task('成功'))
  await pending
  assert.equal(wrapper.vm.importTask.importId, '成功')
  assert.equal(wrapper.vm.operationError, null)
  assert.match(wrapper.vm.sql, /SELECT COUNT/)
  wrapper.unmount()
})

test('已发布会话重新解析不放弃或删除已发布资源', async () => {
  const { wrapper, calls } = create()
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  await wrapper.vm.createImport()
  wrapper.vm.importTask.status = 'SUCCEEDED'
  await wrapper.vm.createImport()
  assert.equal(calls.create.length, 2)
  assert.deepEqual(calls.abandon, [])
  wrapper.unmount()
})

test('恢复会话填回 SQL，旧会话清理失败时保留状态且不创建新会话', async () => {
  const { wrapper, calls } = create({ abandonSqlImport: async () => { throw new Error('无法清理旧会话') } }, { importId: '原会话' })
  await flushPromises()
  assert.match(wrapper.vm.sql, /SELECT COUNT/)
  assert.equal(wrapper.vm.sqlChanged, false)
  wrapper.vm.sql += ' WHERE 性别 = 1'
  await wrapper.vm.createImport()
  assert.equal(calls.create.length, 0)
  assert.equal(wrapper.vm.importTask.importId, '原会话')
  assert.equal(wrapper.vm.importBusy, false)
  assert.match(wrapper.vm.operationError.message, /无法清理旧会话/)
  wrapper.unmount()
})

test('试算或发布处理中不能重新解析', async () => {
  const { wrapper, calls } = create()
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  wrapper.vm.importTask = task('处理中', 'RUNNING')
  await wrapper.vm.createImport()
  assert.equal(calls.create.length, 0)
  assert.equal(wrapper.vm.importBusy, true)
  wrapper.unmount()
})

test('动态参数只展示解析得到的名称，保留后台所需声明，重新解析后更新列表', async () => {
  let count = 0
  const declarations = [
    { code: 'deptCode', type: 'STRING', parameterMode: 'TEMPORARY', required: false },
    { code: 'minAge', type: 'INTEGER', parameterMode: 'TEMPORARY', required: true }
  ]
  const { wrapper } = create({ createSqlImport: async () => {
    const result = task(String(++count))
    result.preview.factors[0].parameters = count === 1 ? declarations : [declarations[1]]
    return result
  } })
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案 [[WHERE 科室 = {{deptCode}}]] AND 年龄 >= {{minAge}}'
  await wrapper.vm.createImport()
  await vue.nextTick()
  const section = wrapper.get('.dynamic-parameters')
  assert.deepEqual(section.findAll('li').map(row => row.text()), ['deptCode', 'minAge'])
  assert.equal(section.findAll('input, select, button, el-input-stub, el-select-stub, el-checkbox-stub').length, 0)
  assert.doesNotMatch(section.text(), /临时重算|结果维度|必填|文本|整数/)
  assert.deepEqual(wrapper.vm.metadataPayload().factors[0].parameters, declarations)
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案 WHERE 年龄 >= {{minAge}}'
  await wrapper.vm.createImport()
  await vue.nextTick()
  assert.deepEqual(wrapper.findAll('.dynamic-parameter-list li').map(row => row.text()), ['minAge'])
  wrapper.unmount()
})

test('未解析出动态参数时展示空状态，不生成可编辑空参数行', async () => {
  const { wrapper } = create()
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  await wrapper.vm.createImport()
  await vue.nextTick()
  assert.equal(wrapper.get('.dynamic-parameters-empty').text(), '无')
  assert.equal(wrapper.find('.dynamic-parameter-list').exists(), false)
  assert.equal(wrapper.find('[aria-label="添加运行参数"]').exists(), false)
  wrapper.unmount()
})

test('SQL 定义规范在解析前位于编辑区后，解析后位于全部流程内容末尾', async () => {
  const { wrapper } = create()
  const sections = () => wrapper.findAll('.sql-import-page > section')
  assert.equal(sections().length, 2)
  assert.equal(sections().at(-1).classes().includes('sql-definition-section'), true)
  wrapper.vm.sql = 'SELECT COUNT(*) AS 人数 FROM 病案'
  await wrapper.vm.createImport()
  await vue.nextTick()
  assert.ok(sections().length > 2)
  assert.equal(sections().at(-1).classes().includes('sql-definition-section'), true)
  assert.equal(sections()[0].find('.sql-definition-hint').exists(), false)
  assert.equal(wrapper.findAll('.sql-definition-hint').length, 1)
  wrapper.vm.importTask.status = 'TRIAL_SUCCEEDED'
  await vue.nextTick()
  assert.match(sections().at(-2).text(), /4. 试算成功/)
  assert.equal(sections().at(-1).classes().includes('sql-definition-section'), true)
  wrapper.unmount()
})
