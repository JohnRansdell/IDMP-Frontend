import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { compileScript, parse } from '@vue/compiler-sfc'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document, Text: dom.window.Text, Comment: dom.window.Comment })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount } = await import('@vue/test-utils')
const vue = await import('vue')
const { defineComponent, h, nextTick } = vue

async function loadClientSfc(file) {
  const source = await readFile(file, 'utf8')
  const { descriptor } = parse(source, { filename: file })
  let compiled = compileScript(descriptor, { id: 'dashboard-widget-boundary-test', inlineTemplate: true }).content
  compiled = compiled.replace(/^import \{([^}]+)\} from ['"]vue['"]\s*$/gm, (_, bindings) => {
    const aliases = bindings.split(',').map((binding) => binding.trim().replace(/\s+as\s+/, ': ')).join(', ')
    return `const { ${aliases} } = globalThis.__dashboardBoundaryVue`
  })
  compiled = compiled.replaceAll('import.meta.env.DEV', 'false').replace('export default', 'return')
  globalThis.__dashboardBoundaryVue = vue
  return Function(compiled)()
}

const Boundary = await loadClientSfc(fileURLToPath(new URL('../src/idmp/features/dashboard/components/DashboardWidgetBoundary.vue', import.meta.url)))
const ThrowingWidget = defineComponent({ render() { throw new Error('intentional widget failure') } })
const NormalWidget = defineComponent({ props: { label: String }, render() { return h('span', { class: 'normal-widget' }, this.label) } })

test('Widget boundary shows a viewer fallback for a throwing widget', async () => {
  const wrapper = mount(Boundary, { slots: { default: () => h(ThrowingWidget) } })
  await nextTick()
  assert.match(wrapper.text(), /该组件暂时无法显示/)
  wrapper.unmount()
})

test('Widget boundary preserves parent and siblings around a throwing widget', async () => {
  const Host = defineComponent({ render: () => h('main', { class: 'dashboard-shell' }, [h(NormalWidget, { label: 'A' }), h(Boundary, null, { default: () => h(ThrowingWidget) }), h(NormalWidget, { label: 'C' })]) })
  const wrapper = mount(Host, { attachTo: document.body })
  await nextTick()
  assert.equal(wrapper.find('.dashboard-shell').exists(), true)
  assert.deepEqual(wrapper.findAll('.normal-widget').map(node => node.text()), ['A', 'C'])
  assert.match(wrapper.text(), /该组件暂时无法显示/)
  wrapper.unmount()
})
test('Widget boundary renders designer-safe fallback', async () => {
  const wrapper = mount(Boundary, { props: { designer: true }, slots: { default: () => h(ThrowingWidget) } })
  await nextTick()
  assert.match(wrapper.text(), /组件渲染失败/)
  assert.match(wrapper.text(), /intentional widget failure/)
  wrapper.unmount()
})
