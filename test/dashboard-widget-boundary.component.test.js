import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const { mount } = await import('@vue/test-utils')
const { defineComponent, h } = await import('vue')
const vite = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const Boundary = (await vite.ssrLoadModule('/src/idmp/features/dashboard/components/DashboardWidgetBoundary.vue')).default
test.after(() => vite.close())
const ThrowingWidget = defineComponent({ render() { throw new Error('intentional widget failure') } })
const NormalWidget = defineComponent({ props: { label: String }, render() { return h('span', { class: 'normal-widget' }, this.label) } })
test('Widget boundary isolates a throwing sibling and shows viewer fallback', () => {
  const Host = defineComponent({ render: () => h('main', { class: 'dashboard-shell' }, [h(NormalWidget, { label: 'A' }), h(Boundary, null, { default: () => h(ThrowingWidget) }), h(NormalWidget, { label: 'C' })]) })
  const wrapper = mount(Host, { attachTo: document.body })
  assert.equal(wrapper.find('.dashboard-shell').exists(), true)
  assert.deepEqual(wrapper.findAll('.normal-widget').map(node => node.text()), ['A', 'C'])
  assert.match(wrapper.text(), /该组件暂时无法显示/)
  wrapper.unmount()
})
test('Widget boundary renders designer-safe fallback', () => {
  const wrapper = mount(Boundary, { props: { designer: true }, slots: { default: ThrowingWidget } })
  assert.match(wrapper.text(), /组件渲染失败/)
  assert.match(wrapper.text(), /intentional widget failure/)
  wrapper.unmount()
})
