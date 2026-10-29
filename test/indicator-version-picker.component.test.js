import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { groupIndicatorVersions } from '../src/idmp/utils/indicatorVersionOptions.js'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node']) globalThis[key] = dom.window[key]
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const { descriptor } = parse(await readFile(new URL('../src/idmp/components/IndicatorVersionPicker.vue', import.meta.url), 'utf8'))
const compiled = compileScript(descriptor, { id: 'version-picker', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, names]) => names.split(',').map(name => {
  const [imported, local = imported] = name.trim().split(/\s+as\s+/)
  return `const ${local} = vue.${imported};`
})).join('\n')
const component = Function('vue', 'groupIndicatorVersions', `${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, groupIndicatorVersions)
const Select = vue.defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Option = vue.defineComponent({ props: ['value', 'label'], setup: props => () => vue.h('span', props.label) })
const options = [
  { id: '90071992547409931', indicatorId: '1', indicatorName: '同名指标', versionNo: 1 },
  { id: '90071992547409932', indicatorId: '1', indicatorName: '同名指标', versionNo: 2 },
  { id: '90071992547409933', indicatorId: '2', indicatorName: '同名指标', versionNo: 3 }
]
function create(props = {}) {
  let wrapper
  wrapper = mount(component, { props: { options, 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }), ...props }, global: { components: { ElSelect: Select, ElOption: Option } } })
  return wrapper
}
test('restores opaque version IDs when options arrive later', async () => {
  const wrapper = create({ modelValue: options[1].id, options: [] })
  assert.match(wrapper.text(), /所选指标暂不可用/)
  assert.equal(wrapper.findAllComponents(Select).length, 1)
  await wrapper.setProps({ options })
  const selects = wrapper.findAllComponents(Select)
  assert.equal(selects[0].props('modelValue'), '1')
  assert.deepEqual(selects[1].findAllComponents(Option).map(x => x.props('value')), [options[1].id, options[0].id])
  wrapper.unmount()
})
test('switching indicators clears version, including same-name indicators', async () => {
  const wrapper = create({ modelValue: options[0].id })
  const selects = wrapper.findAllComponents(Select)
  selects[0].vm.$emit('update:modelValue', '2')
  await vue.nextTick()
  assert.equal(selects[1].props('modelValue'), '')
  assert.deepEqual(selects[1].findAllComponents(Option).map(x => x.props('value')), [options[2].id])
  assert.equal(selects[1].props('disabled'), false)
  wrapper.unmount()
})
test('clearing indicator hides version and read-only disables both restored controls', async () => {
  const wrapper = create({ modelValue: options[0].id })
  const selects = wrapper.findAllComponents(Select)
  selects[0].vm.$emit('update:modelValue', '')
  await vue.nextTick()
  assert.equal(wrapper.findAllComponents(Select).length, 1)
  assert.equal(wrapper.props('modelValue'), '')
  await wrapper.setProps({ modelValue: options[0].id, disabled: true })
  assert.equal(wrapper.findAllComponents(Select).length, 2)
  assert.ok(wrapper.findAllComponents(Select).every(x => x.props('disabled')))
  wrapper.unmount()
})
test('initially shows only indicator and reveals version only after selection', async () => {
  const wrapper = create()
  assert.equal(wrapper.findAllComponents(Select).length, 1)
  wrapper.findComponent(Select).vm.$emit('update:modelValue', '1')
  await vue.nextTick()
  const selects = wrapper.findAllComponents(Select)
  assert.equal(selects.length, 2)
  assert.equal(selects[1].props('modelValue'), '')
  assert.deepEqual(selects[1].findAllComponents(Option).map(x => x.props('value')), [options[1].id, options[0].id])
  wrapper.unmount()
})
