import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<html><body></body></html>')
for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const source = await readFile(new URL('../src/idmp/components/ResourceDeleteDialog.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source)
const compiled = compileScript(descriptor, { id: 'delete-copy', inlineTemplate: true }).content
const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
  .flatMap(([, names]) => names.split(',').map(name => {
    const [original, local = original] = name.trim().split(/\s+as\s+/)
    return `const ${local} = vue.${original};`
  })).join('\n')
const body = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
const Component = Function('vue', `${bindings}\nconst ElMessage = { error() {} }; const formatApiError = e => e.message;\n${body}`)(vue)
const Pass = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', slots.default?.()) })
const Dialog = vue.defineComponent({ setup: (_, { slots }) => () => vue.h('div', [slots.default?.(), slots.footer?.()]) })
const Button = vue.defineComponent({ props: ['disabled'], setup: (props, { slots }) => () => vue.h('button', { disabled: props.disabled }, slots.default?.()) })
const Alert = vue.defineComponent({ props: ['description'], setup: props => () => vue.h('div', props.description) })

test('删除影响显示实际资源名称，缺少说明时使用中文指引并阻止删除', async () => {
  let deletions = 0
  const wrapper = mount(Component, { props: {
    modelValue: false, resourceLabel: '因子',
    loadImpact: async () => ({ deletable: false,
      blockers: [{ code: 'FACTOR_REFERENCED_BY_INDICATOR', count: 1, samples: [{ resourceName: '住院死亡率' }] }],
      automaticActions: [{ code: 'DELETE_RESULTS', count: 7 }],
      warnings: [{ code: 'HAS_HISTORY', count: 2 }] }),
    performDelete: async () => { deletions++ }
  }, global: { components: {
    ElDialog: Dialog, ElAlert: Alert, ElButton: Button, ElForm: Pass, ElFormItem: Pass, ElInput: Pass, ElSkeleton: Pass, ElEmpty: Pass
  } } })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  const text = wrapper.text()
  assert.match(text, /存在依赖引用，请先解除关联/)
  assert.match(text, /住院死亡率/)
  assert.match(text, /相关配置将同步清理/)
  assert.match(text, /删除会影响关联资源，请确认/)
  assert.doesNotMatch(text, /FACTOR_REFERENCED|DELETE_RESULTS|HAS_HISTORY/)
  assert.equal(wrapper.find('[disabled]').exists(), true)
  assert.equal(deletions, 0)
  wrapper.unmount()
})
