import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import * as options from '../src/idmp/features/dashboard/filterOptions.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount } = await import('@vue/test-utils')
const engine = await import('../src/idmp/features/dashboard/filterEngine.js')
async function component(file, dependencies) {
  const { descriptor } = parse(await readFile(new URL(`../src/idmp/features/dashboard/components/${file}.vue`, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: file, inlineTemplate: true }).content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
    .flatMap(([, names]) => names.split(',').map(name => {
      const [original, local = original] = name.trim().split(/\s+as\s+/)
      return `const ${local} = vue.${original};`
    })).join('\n')
  return Function('vue', 'deps', `const { ${Object.keys(dependencies).join(',')} } = deps;\n${bindings}\n${compiled.replace(/^import .*$/gm, '').replace('export default', 'return')}`)(vue, dependencies)
}
const FilterValue = await component('FilterValue', options)
const FilterBar = await component('DashboardFilterBar', { FilterValue, ...engine })
const choices = [{ value: '28', label: '神经内科' }, { value: '29', label: '神经外科' }]
const create = props => mount(FilterValue, { attachTo: document.body, props: { type: 'multi-select', options: choices, modelValue: [], confirmSelection: true, ...props } })
const open = wrapper => wrapper.get('summary').trigger('click')
const select = (wrapper, code, checked = true) => wrapper.get(`[data-filter-option="${code}"]`).setValue(checked)
const action = (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click')

test('multiple department selections update the filter bar only once after confirmation', async () => {
  const wrapper = mount(FilterBar, { props: {
    definitions: [{ id: 'dept', field: 'dept', type: 'multi-select', enabled: true, dataType: 'string', label: '科室' }],
    catalog: [{ id: 'dept', dataType: 'string', options: choices }], values: { dept: [], other: 'preserved' }
  } })
  const filter = wrapper.getComponent(FilterValue)
  await open(filter)
  await select(filter, '28')
  await select(filter, '29')
  assert.equal(wrapper.emitted('change'), undefined)
  await action(filter, '确定')
  assert.deepEqual(wrapper.emitted('change'), [[{ dept: ['28', '29'], other: 'preserved' }]])
  assert.equal(filter.get('details').element.open, false)
  wrapper.unmount()
})

test('cancel and reopening discard pending selections without changing the model', async () => {
  const modelValue = ['28']
  const wrapper = create({ modelValue })
  await open(wrapper)
  await select(wrapper, '29')
  await action(wrapper, '取消')
  await open(wrapper)
  assert.equal(wrapper.get('[data-filter-option="29"]').element.checked, false)
  assert.equal(wrapper.get('[data-filter-option="28"]').element.checked, true)
  assert.deepEqual(modelValue, ['28'])
  assert.equal(wrapper.emitted('update:modelValue'), undefined)
  wrapper.unmount()
})

test('Escape, outside click and closing the summary never apply a draft', async () => {
  const wrapper = create()
  for (const dismiss of [
    () => wrapper.get('details').trigger('keydown', { key: 'Escape' }),
    () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })),
    () => open(wrapper)
  ]) {
    await open(wrapper)
    await select(wrapper, '28')
    await dismiss()
    await vue.nextTick()
    assert.equal(wrapper.get('details').element.open, false)
    assert.equal(wrapper.emitted('update:modelValue'), undefined)
  }
  wrapper.unmount()
})

test('clearing a selection waits for confirmation and unchanged selections do not refresh', async () => {
  const wrapper = create({ modelValue: ['28'] })
  await open(wrapper)
  await action(wrapper, '确定')
  assert.equal(wrapper.emitted('update:modelValue'), undefined)
  await open(wrapper)
  await action(wrapper, '清空')
  assert.equal(wrapper.emitted('update:modelValue'), undefined)
  await action(wrapper, '确定')
  assert.deepEqual(wrapper.emitted('update:modelValue'), [[[]]])
  wrapper.unmount()
})

test('external filter resets replace an open draft instead of submitting stale departments', async () => {
  const wrapper = create({ modelValue: ['28'] })
  await open(wrapper)
  await select(wrapper, '29')
  await wrapper.setProps({ modelValue: [] })
  assert.ok(wrapper.findAll('input').every(input => !input.element.checked))
  await action(wrapper, '确定')
  assert.equal(wrapper.emitted('update:modelValue'), undefined)
  wrapper.unmount()
})

test('configuration editors retain immediate updates unless confirmation is enabled', async () => {
  const wrapper = create({ confirmSelection: false })
  await open(wrapper)
  await select(wrapper, '28')
  assert.deepEqual(wrapper.emitted('update:modelValue'), [[['28']]])
  assert.equal(wrapper.findAll('button').length, 0)
  wrapper.unmount()
})
