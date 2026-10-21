import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/WarningMemberSelect.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source.replace('</script>', 'defineExpose({ load, searchMembers })\n</script>'))
const compiled = compileScript(descriptor, { id: 'warning-member-test', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, fields]) => fields.split(',').map(field => {
    const [imported, local = imported] = field.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${imported};`
  })).join('\n')
const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Select = vue.defineComponent({ name: 'ElSelect', props: ['modelValue', 'loading'],
  setup: (_, { slots }) => () => vue.h('div', [slots.default?.(), slots.footer?.()]) })
const Option = vue.defineComponent({ name: 'ElOption', props: ['value'], setup: props => () => vue.h('span', props.value) })
const Button = vue.defineComponent({ setup: (_, { slots, attrs }) => () => vue.h('button', attrs, slots.default?.()) })
function create(fetch, props = {}) {
  const calls = []
  const Component = Function('vue', 'fetchWarningMemberOptions', `${bindings}\n${code}`)(vue, async params => { calls.push(params); return fetch(params) })
  const wrapper = mount(Component, { props: { indicatorVersionId: '102027642463201863', targetCode: 'BASE', dimension: 'OUT_DEPT_CODE', ...props },
    global: { components: { ElSelect: Select, ElOption: Option, ElButton: Button } } })
  return { wrapper, calls }
}

test('loads real candidate response, appends pages and preserves selected values during search', async () => {
  const { wrapper, calls } = create(params => params.search ? { values: ['22'], nextAfter: null }
    : params.after ? { values: ['22'], nextAfter: null } : { values: ['14', '21'], nextAfter: '21' }, { modelValue: ['saved'] })
  await flushPromises()
  assert.deepEqual(wrapper.findAll('span').map(item => item.text()), ['saved', '14', '21'])
  assert.equal(calls[0].targetCode, 'BASE')
  assert.equal(calls[0].size, 50)
  await wrapper.get('button').trigger('click'); await flushPromises()
  assert.equal(calls[1].after, '21')
  assert.deepEqual(wrapper.findAll('span').map(item => item.text()), ['saved', '14', '21', '22'])
  await wrapper.vm.searchMembers('22'); await flushPromises()
  assert.equal(calls[2].search, '22')
  assert.deepEqual(wrapper.findAll('span').map(item => item.text()), ['saved', '22'])
  wrapper.findComponent(Select).vm.$emit('update:modelValue', ['saved', '22'])
  assert.deepEqual(wrapper.emitted('update:modelValue')[0], [['saved', '22']])
  wrapper.unmount()
})

test('ignores stale responses after target switches and exposes request failures with retry', async () => {
  let resolve, attempts = 0
  const pending = new Promise(done => { resolve = done })
  const { wrapper } = create(params => {
    if (params.targetCode === 'BASE') return pending
    if (++attempts === 1) throw new Error('成员服务暂不可用')
    return { values: ['new-target'], nextAfter: null }
  })
  await wrapper.setProps({ targetCode: 'DRILL:ORG:DEPT' }); await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /成员服务暂不可用/)
  await wrapper.get('button').trigger('click'); await flushPromises()
  resolve({ values: ['old-target'], nextAfter: null }); await flushPromises()
  assert.deepEqual(wrapper.findAll('span').map(item => item.text()), ['new-target'])
  assert.equal(wrapper.find('[role="alert"]').exists(), false)
  wrapper.unmount()
})

test('read-only rules display saved members without fetching candidates', async () => {
  const { wrapper, calls } = create(() => { throw new Error('Must not query') }, { disabled: true, modelValue: ['22'] })
  await flushPromises()
  assert.deepEqual(calls, [])
  assert.equal(wrapper.text(), '22')
  wrapper.unmount()
})
