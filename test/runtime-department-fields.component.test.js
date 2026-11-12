import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { runtimeParameterLabel } from '../src/idmp/utils/runtimeParameterLabel.js'
import { buildSqlRuntimeParameterValues } from '../src/idmp/api/adapters/sqlImport.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/RuntimeParameterFields.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'runtime-department-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [imported, local = imported] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Select = vue.defineComponent({ name: 'ElSelect', props: ['modelValue', 'loading'], emits: ['update:modelValue', 'visible-change'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Option = vue.defineComponent({ name: 'ElOption', props: ['value', 'label'], setup: props => () => vue.h('span', props.label) })
const Input = vue.defineComponent({ name: 'ElInput', props: ['modelValue'], emits: ['update:modelValue'], setup: () => () => vue.h('input') })
const verified = ['deptCode', 'departCode', 'department']
const declaration = code => ({ code, type: 'STRING', required: false, parameterMode: 'TEMPORARY' })
const rows = [{ code: '0101', name: '测试门诊' }, { code: '21', name: '测试住院' }]
function create({ declarations = verified.map(declaration), modelValue = {}, allowed = verified, load = async () => rows } = {}) {
  let reads = 0, session = 1
  const deps = { runtimeParameterLabel, fetchDepartmentDictionary: () => { reads++; return load() }, getRequestSessionRevision: () => session }
  const Component = Function('vue', 'deps', `const { ${Object.keys(deps).join(',')} } = deps;\n${bindings}\n${code}`)(vue, deps)
  const wrapper = mount(Component, { props: { declarations, modelValue, departmentParameterCodes: allowed }, global: { components: { ElSelect: Select, ElOption: Option, ElInput: Input, ElInputNumber: Input, ElDatePicker: Input } } })
  return { wrapper, reads: () => reads, changeSession: () => session++ }
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('verified parameters select dictionary codes and preserve the exact scalar request keys and leading zeros', async () => {
  const initial = { patientName: '示例', limit: 0 }
  const { wrapper, reads } = create({ modelValue: initial })
  assert.equal(reads(), 0)
  for (const [index, code] of verified.entries()) {
    const select = wrapper.findAllComponents(Select)[index]
    select.vm.$emit('visible-change', true)
    await flushPromises()
    assert.equal(select.findAllComponents(Option)[0].props('label'), '测试门诊')
    assert.equal(select.findAllComponents(Option)[0].props('value'), '0101')
    select.vm.$emit('update:modelValue', '0101')
    await vue.nextTick()
    const next = wrapper.emitted('update:modelValue').at(-1)[0]
    assert.deepEqual(next, { ...initial, [code]: '0101' })
    assert.deepEqual(buildSqlRuntimeParameterValues([declaration(code)], next), { [code]: '0101' })
    assert.deepEqual(wrapper.emitted('change').at(-1)[0], next)
    assert.deepEqual(initial, { patientName: '示例', limit: 0 })
  }
  wrapper.unmount()
})

test('only opted-in STRING parameters become department selects; unrelated names and types keep their inputs', () => {
  const { wrapper } = create({ declarations: [declaration('deptCode'), declaration('deptName'), declaration('otherDeptCode'), { code: 'department', type: 'INTEGER' }] })
  assert.equal(wrapper.findAllComponents(Select).length, 1)
  assert.equal(wrapper.findAllComponents(Input).length, 3)
  wrapper.unmount()
  const original = create({ allowed: [] })
  assert.equal(original.wrapper.findAllComponents(Select).length, 0)
  assert.equal(original.wrapper.findAllComponents(Input).length, 3)
  original.wrapper.unmount()
})

test('saved and missing dictionary codes remain scalar values and loading never emits a query change', async () => {
  const { wrapper } = create({ declarations: [declaration('deptCode')], modelValue: { deptCode: '0099' } })
  await flushPromises()
  const select = wrapper.findComponent(Select)
  assert.equal(select.props('modelValue'), '0099')
  assert.equal(select.findAllComponents(Option)[0].props('value'), '0099')
  assert.equal(wrapper.emitted('change'), undefined)
  await wrapper.setProps({ departmentParameterCodes: [...verified] })
  assert.equal(select.findAllComponents(Option)[1].props('label'), '测试门诊')
  select.vm.$emit('update:modelValue', '')
  await vue.nextTick()
  const value = wrapper.emitted('update:modelValue').at(-1)[0]
  assert.deepEqual(value, { deptCode: '' })
  assert.deepEqual(buildSqlRuntimeParameterValues([declaration('deptCode')], value), {})
  wrapper.unmount()
})

test('dictionary failure is visible, keeps the selected code and retries on reopening', async () => {
  let failed = true
  const { wrapper } = create({ declarations: [declaration('deptCode')], modelValue: { deptCode: '0101' }, load: async () => { if (failed) throw new Error('科室读取失败'); return rows } })
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /科室读取失败/)
  assert.equal(wrapper.findComponent(Select).props('modelValue'), '0101')
  failed = false
  wrapper.findComponent(Select).vm.$emit('visible-change', true)
  await flushPromises()
  assert.equal(wrapper.find('[role="alert"]').exists(), false)
  assert.equal(wrapper.findComponent(Option).props('label'), '测试门诊')
  wrapper.unmount()
})

test('late dictionary results cannot overwrite newer loads or a different indicator', async () => {
  const first = deferred(), second = deferred(); let reads = 0
  const { wrapper } = create({ declarations: [declaration('deptCode')], load: () => ++reads === 1 ? first.promise : second.promise })
  const select = wrapper.findComponent(Select)
  select.vm.$emit('visible-change', true)
  select.vm.$emit('visible-change', true)
  second.resolve(rows); await flushPromises()
  first.resolve([{ code: 'old', name: '旧科室' }]); await flushPromises()
  assert.deepEqual(wrapper.findAllComponents(Option).map(option => option.props('value')), ['0101', '21'])
  await wrapper.setProps({ declarations: [declaration('patientName')] })
  assert.equal(wrapper.findComponent(Select).exists(), false)
  wrapper.unmount()
})

test('dictionary results from a previous login session are ignored', async () => {
  const pending = deferred()
  const { wrapper, changeSession } = create({ declarations: [declaration('deptCode')], load: () => pending.promise })
  wrapper.findComponent(Select).vm.$emit('visible-change', true)
  changeSession(); pending.resolve(rows); await flushPromises()
  assert.equal(wrapper.findAllComponents(Option).length, 0)
  wrapper.unmount()
})
