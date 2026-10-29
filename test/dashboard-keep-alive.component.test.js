import assert from 'node:assert/strict'
import { withCategoryViewport } from '../src/idmp/charts/categoryViewport.js'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { compileScript, parse } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const name of ['window', 'document', 'HTMLElement', 'SVGElement', 'Element', 'Node', 'Document', 'Text', 'Comment']) globalThis[name] = dom.window[name]
const sizes = new WeakMap()
for (const [property, dimension, fallback] of [['clientWidth', 'width', 600], ['clientHeight', 'height', 320]]) {
  Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get() { return this.isConnected ? (sizes.get(this)?.[dimension] ?? fallback) : 0 } })
}
const observers = []
globalThis.ResizeObserver = window.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.connected = false; observers.push(this) }
  observe(element) { this.element = element; this.connected = true }
  disconnect() { this.connected = false }
  deliver(width = 600, height = 320) { this.callback([{ target: this.element, contentRect: { width, height } }]) }
}
let frameId = 0
const frames = new Map()
window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId }
window.cancelAnimationFrame = id => frames.delete(id)
const vue = await import('vue')
const { mount, flushPromises } = await import('@vue/test-utils')
const membership = await import('../src/idmp/features/dashboard/gridMembership.js')
const layout = await import('../src/idmp/features/dashboard/gridLayout.js')
const capabilities = await import('../src/idmp/features/dashboard/widgetCapabilities.js')
const preciseLayout = await import('../src/idmp/features/dashboard/preciseLayout.js')
const { getDashboardWidgetSizeTier } = await import('../src/idmp/features/dashboard/widgetSizing.js')
const { resolveBackgroundAsset } = await import('../src/idmp/features/dashboard/backgroundAssets.js')
const Empty = vue.defineComponent({ render: () => null })

async function component(path, dependencies) {
  const { descriptor } = parse(await readFile(new URL(path, import.meta.url), 'utf8'))
  const compiled = compileScript(descriptor, { id: path, inlineTemplate: true }).content
  const bindings = [...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)]
    .flatMap(([, specifiers]) => specifiers.split(',').map(specifier => {
      const [imported, local = imported] = specifier.trim().split(/\s+as\s+/)
      return `const ${local} = vue.${imported};`
    })).join('\n')
  const code = compiled.replace(/^import .*$/gm, '').replace('export default', 'return')
  return Function('vue', ...Object.keys(dependencies), `${bindings}\n${code}`)(vue, ...Object.values(dependencies))
}

async function settle() {
  await flushPromises()
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach(callback => callback())
  await vue.nextTick()
}

function cached(Component, props) {
  const visible = vue.ref(true)
  const Host = vue.defineComponent({ setup: () => () => vue.h(vue.KeepAlive, null, {
    default: () => visible.value ? vue.h(Component, props) : vue.h('div', 'directory')
  }) })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, visible }
}

function chartRuntime() {
  const instances = []
  const echarts = {
    registerTheme() {},
    init() {
      const chart = { options: [], resizes: [], disposed: false, on() {},
        setOption(option) { this.options.push(option) },
        getOption() { return this.options.at(-1) || {} },
        resize(size) { this.resizes.push(size) },
        dispose() { this.disposed = true }
      }
      instances.push(chart)
      return chart
    }
  }
  return { instances, dependencies: { echarts, StatePanel: Empty, IDMP_CHART_THEME: {}, normalizeChartOption: value => value, withCategoryViewport } }
}

test('cached chart pauses detached callbacks, defers data changes, and restores the latest option', async () => {
  const runtime = chartRuntime()
  const Chart = await component('../src/idmp/components/IdmpChart.vue', runtime.dependencies)
  const option = vue.reactive({ series: [{ data: [1] }] })
  const { wrapper, visible } = cached(Chart, { option })
  await settle()
  const chart = runtime.instances[0]
  const observer = observers.at(-1)
  assert.equal(chart.options.length, 1)
  assert.equal(observer.connected, true)
  assert.equal(chart.resizes.length, 0)

  observer.deliver()
  assert.equal(frames.size, 1)
  visible.value = false
  await settle()
  assert.equal(observer.connected, false)
  assert.equal(observer.element.isConnected, false)
  assert.equal(frames.size, 0)
  observer.deliver(0, 0)
  window.dispatchEvent(new window.Event('resize'))
  option.series[0].data = [9]
  await settle()
  assert.equal(chart.options.length, 1)
  assert.equal(chart.resizes.length, 0)
  assert.equal(chart.disposed, false, 'cached charts retain their instance')

  visible.value = true
  await settle()
  assert.equal(observer.connected, true)
  assert.equal(runtime.instances.length, 1)
  assert.equal(chart.options.length, 2)
  assert.deepEqual(chart.options.at(-1).series[0].data, [9])
  wrapper.unmount()
  assert.equal(observer.connected, false)
  assert.equal(chart.disposed, true)
  assert.equal(frames.size, 0)
})

test('chart coalesces resize events and ignores unchanged or zero dimensions', async () => {
  const runtime = chartRuntime()
  const Chart = await component('../src/idmp/components/IdmpChart.vue', runtime.dependencies)
  const wrapper = mount(Chart, { props: { option: { series: [] } }, attachTo: document.body })
  await settle()
  const observer = observers.at(-1)
  const chart = runtime.instances[0]
  observer.deliver()
  observer.deliver()
  window.dispatchEvent(new window.Event('resize'))
  assert.equal(frames.size, 1)
  await settle()
  assert.equal(chart.resizes.length, 0)
  sizes.set(observer.element, { width: 0, height: 0 })
  observer.deliver(0, 0)
  await settle()
  assert.equal(chart.resizes.length, 0)
  sizes.set(observer.element, { width: 720, height: 360 })
  observer.deliver(720, 360)
  observer.deliver(720, 360)
  await settle()
  assert.deepEqual(chart.resizes, [{ width: 720, height: 360 }])
  observer.deliver(720, 360)
  wrapper.unmount()
  assert.equal(frames.size, 0)
  assert.equal(observer.connected, false)
})

test('a chart hidden before initialization waits for a positive size and reconnects after loading', async () => {
  const runtime = chartRuntime()
  const Chart = await component('../src/idmp/components/IdmpChart.vue', runtime.dependencies)
  const wrapper = mount(Chart, { props: { option: { series: [] } }, attachTo: document.body })
  const element = wrapper.find('.idmp-chart').element
  sizes.set(element, { width: 0, height: 0 })
  await settle()
  assert.equal(runtime.instances.length, 0)
  const observer = observers.at(-1)
  sizes.set(element, { width: 600, height: 320 })
  observer.deliver()
  await settle()
  assert.equal(runtime.instances.length, 1)
  await wrapper.setProps({ loading: true })
  await settle()
  assert.equal(observer.connected, false)
  assert.equal(runtime.instances[0].disposed, true)
  await wrapper.setProps({ loading: false })
  await settle()
  assert.equal(runtime.instances.length, 2)
  assert.equal(observer.connected, true)
  assert.notEqual(observer.element, element)
  wrapper.unmount()
})

test('cached widget retains its size tier while detached and measures again on activation', async () => {
  const Widget = await component('../src/idmp/features/dashboard/components/DashboardWidget.vue', {
    getWidgetGridConstraints: layout.getWidgetGridConstraints, normalizeWidgetSelectionId: capabilities.normalizeWidgetSelectionId,
    getDashboardWidgetSizeTier, resolveBackgroundAsset
  })
  const { wrapper, visible } = cached(Widget, { widget: { id: 'cached-widget', type: 'chart', config: {} } })
  await settle()
  const observer = observers.at(-1)
  const element = observer.element
  assert.equal(element.dataset.sizeTier, 'standard')
  visible.value = false
  await settle()
  assert.equal(observer.connected, false)
  observer.deliver(0, 0)
  await settle()
  assert.equal(element.dataset.sizeTier, 'standard')
  sizes.set(element, { width: 240, height: 160 })
  visible.value = true
  await settle()
  assert.equal(observer.connected, true)
  assert.equal(element.dataset.sizeTier, 'compact')
  observer.deliver(0, 0)
  await settle()
  assert.equal(element.dataset.sizeTier, 'compact')
  wrapper.unmount()
  assert.equal(observer.connected, false)
})

test('cached canvas suspends geometry and keyboard handlers without destroying the grid', async () => {
  let geometryReads = 0
  let resizeCalls = 0
  let destroys = 0
  const grid = { engine: { nodes: [] }, on() {}, getColumn: () => 24,
    cellWidth() { geometryReads++; return 25 }, getCellHeight: () => 60, getMargin: () => 8, getRow: () => 6,
    onResize() { resizeCalls++ }, destroy() { destroys++ }
  }
  const Canvas = await component('../src/idmp/features/dashboard/components/DashboardCanvas.vue', {
    ...membership, ...layout, ...capabilities, ...preciseLayout,
    GridStack: { init: () => grid }, DashboardWidget: Empty, DashboardWidgetBoundary: Empty
  })
  const { wrapper, visible } = cached(Canvas, { widgets: [], placementMode: true })
  await settle()
  const child = wrapper.findComponent(Canvas)
  const observer = observers.at(-1)
  assert.equal(observer.connected, true)
  visible.value = false
  await settle()
  const before = geometryReads
  observer.deliver(0, 0)
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(observer.connected, false)
  assert.equal(geometryReads, before)
  assert.equal(child.emitted('placement-cancel'), undefined)
  assert.equal(destroys, 0)
  visible.value = true
  await settle()
  assert.equal(observer.connected, true)
  assert.equal(resizeCalls, 1)
  assert.ok(geometryReads > before)
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(child.emitted('placement-cancel').length, 1)
  wrapper.unmount()
  assert.equal(observer.connected, false)
  assert.equal(destroys, 1)
})
