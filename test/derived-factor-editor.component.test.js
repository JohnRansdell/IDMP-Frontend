import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as derived from '../src/idmp/utils/derivedFactor.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const Select = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Input = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: () => () => vue.h('input') })
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/DerivedFactorEditor.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'derived-authoring', inlineTemplate: true })
const renderBindings = [...compiled.content.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => { const [imported, local = imported] = name.trim().split(/\s+as\s+/); return local.startsWith('_') ? `const ${local}=vue.${imported};` : '' })).join('\n')
const code = compiled.content.replace(/^import .*$/gm, '').replace('export default', 'return')
const field = (wrapper, id) => wrapper.findAllComponents(Select).find(item => item.attributes('id') === id)
const version = (id, unit = 'CNY', mode = 'STATIC') => ({ id, status: 'PUBLISHED', currentArtifactId: `artifact-${id}`, dsl: { calculationMode: mode, primaryDomain: { tableName: 'costs' }, output: { dimension: 'SUM', unit, grain: ['科室'] } } })
async function editor(overrides = {}, props = {}) {
  const deps = Object.fromEntries(Object.entries(compiled.imports).map(([name, binding]) => [name, binding.source === 'vue' ? vue[binding.imported] : () => undefined]))
  Object.assign(deps, derived, { Refresh: Pass, FactorExpressionNode: Pass, ElMessageBox: { confirm: async () => {} },
    fetchPublishedFactorVersions: async () => [version('A'), version('B')],
    fetchFactorVersion: async id => version(id),
    fetchCompileArtifact: async () => ({}), ...overrides })
  const Component = Function('deps', 'vue', `const { ${Object.keys(deps).join(',')} }=deps;\n${renderBindings}\n${code}`)(deps, vue)
  let wrapper
  wrapper = mount(Component, { props: { modelValue: derived.newDerivedFactor(), autoConfigure: true, ...props,
    'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) }, global: {
    components: { ElForm: Pass, ElFormItem: Pass, ElSelect: Select, ElOption: Pass, ElInput: Input, ElButton: Pass, ElAlert: Pass }, directives: { loading() {} }
  } })
  await flushPromises()
  return wrapper
}

test('ordinary creation needs no domain selection and inherits confirmed grain, mode and additive output', async () => {
  const wrapper = await editor()
  assert.equal(wrapper.get('.advanced-settings').element.open, false)
  field(wrapper, 'derived-left-factor').vm.$emit('update:modelValue', 'A')
  await flushPromises()
  field(wrapper, 'derived-right-factor').vm.$emit('update:modelValue', 'B')
  await flushPromises()
  const dsl = wrapper.props('modelValue')
  assert.deepEqual(dsl.primaryDomain, {})
  assert.equal(dsl.calculationMode, 'STATIC')
  assert.deepEqual(dsl.output.grain, ['科室'])
  assert.equal(dsl.output.unit, 'CNY')
  assert.equal(dsl.output.dimension, 'SUM')
  assert.equal(wrapper.vm.validate(), dsl)
  wrapper.unmount()
})

test('unknown output units remain absent and legacy explicit settings are not rewritten on load', async () => {
  const missing = id => ({ id, status: 'PUBLISHED', dsl: { output: { grain: [] } } })
  const dsl = derived.newDerivedFactor()
  dsl.expression = derived.buildSimpleDerivedExpression('ADD', 'A', 'B')
  const wrapper = await editor({ fetchFactorVersion: async id => missing(id) }, { modelValue: dsl })
  assert.equal(wrapper.props('modelValue').output.unit, undefined)
  assert.equal(wrapper.props('modelValue').output.dimension, undefined)
  wrapper.unmount()
  const legacy = { ...dsl, primaryDomain: { domainCode: 'EXISTING' }, output: { grain: [], unit: 'CUSTOM', dimension: 'LEGACY' } }
  const saved = await editor({}, { modelValue: legacy, autoConfigure: false })
  assert.deepEqual(saved.props('modelValue'), legacy)
  assert.equal(saved.emitted('update:modelValue'), undefined)
  saved.unmount()
})

test('incompatible units and metadata read failures stop save with an actionable reason', async () => {
  const dsl = derived.newDerivedFactor(); dsl.expression = derived.buildSimpleDerivedExpression('ADD', 'A', 'B')
  const wrapper = await editor({ fetchFactorVersion: async id => version(id, id === 'A' ? 'CNY' : 'COUNT') }, { modelValue: dsl })
  assert.throws(() => wrapper.vm.validate(), /单位不一致/)
  wrapper.unmount()
  const failed = await editor({ fetchFactorVersion: async () => { throw Error('引用因子读取失败') } }, { modelValue: dsl })
  assert.throws(() => failed.vm.validate(), /引用因子读取失败/)
  failed.unmount()
})

test('late metadata cannot apply a previously selected factor or invent its unit', async () => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const wrapper = await editor({ fetchFactorVersion: id => id === 'A' ? pending : Promise.resolve(version(id, 'KG')) })
  field(wrapper, 'derived-left-factor').vm.$emit('update:modelValue', 'A')
  await vue.nextTick()
  field(wrapper, 'derived-left-factor').vm.$emit('update:modelValue', 'B')
  await flushPromises()
  release(version('A', 'CNY'))
  await flushPromises()
  assert.equal(wrapper.props('modelValue').expression.left.factorVersionId, 'B')
  assert.equal(wrapper.props('modelValue').output.unit, undefined) // ADD still lacks the other operand.
  wrapper.unmount()
})
