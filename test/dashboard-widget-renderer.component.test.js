import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { compileScript, parse } from '@vue/compiler-sfc'
const dom = new JSDOM('<!doctype html><html><body></body></html>')
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement, Element: dom.window.Element, Node: dom.window.Node, Document: dom.window.Document, Text: dom.window.Text, Comment: dom.window.Comment })
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
const vue = await import('vue'); const { mount } = await import('@vue/test-utils')
const { createDashboardChartOption } = await import('../src/idmp/features/dashboard/visualization.js')
const { createDashboardChartTheme, clinicalTrendTone } = await import('../src/idmp/features/dashboard/chartTheme.js')
const { hasDataBinding } = await import('../src/idmp/features/dashboard/bindingEngine.js')
async function loadRenderer() {
  const file = fileURLToPath(new URL('../src/idmp/features/dashboard/components/WidgetRenderer.vue', import.meta.url))
  const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
  let code = compileScript(descriptor, { id: 'renderer-test', inlineTemplate: true }).content
  const vueBindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, specifiers]) => specifiers.split(',').map(specifier => specifier.trim()).filter(Boolean).map(specifier => { const [imported, local = imported] = specifier.split(/\s+as\s+/); return { imported: imported.trim(), local: local.trim() } }))
  const vuePrelude = vueBindings.map(({ imported, local }) => `const ${local} = globalThis.__renderer.vue.${imported};`).join('\n')
  code = code.replace(/^import .*$/gm, '').replace('export default', 'return')
  globalThis.__renderer = { vue, hasDataBinding, createDashboardChartTheme, clinicalTrendTone, BindingWidget: vue.defineComponent({ render: () => null }), IdmpChart: vue.defineComponent({ props: { option: Object }, setup: props => () => vue.h('pre', { class: 'chart-option' }, JSON.stringify(props.option)) }), StatePanel: vue.defineComponent({ render: () => null }), Bell: {}, InfoFilled: {}, TrophyBase: {}, WarningFilled: {} }
  code = `const { hasDataBinding, createDashboardChartTheme, clinicalTrendTone, BindingWidget, IdmpChart, StatePanel, Bell, InfoFilled, TrophyBase, WarningFilled } = globalThis.__renderer;
  ${vuePrelude}
  ${code}`
  return Function(code)()
}
const Renderer = await loadRenderer()
const source = { name: '演示', currentValue: 4, trendData: [2, 4, 3], trendLabels: ['1月','2月','3月'], departmentData: [{ name: '呼吸内科', value: 3 }, { name: '心内科', value: 6 }], pieData: [{ name: '呼吸内科', value: 3 }] }
const props = widget => ({ widget, getWidgetKpi: () => ({ title:'KPI', value:'1', status:'success' }), getTitle: item => item.title, getDescription: () => '', getIcon: () => ({}), getChartOption: item => createDashboardChartOption(item, { getSource: () => source }), isChartEmpty: () => false, getChartAriaLabel: () => '', getTableColumns: () => [{ key:'label', label:'名称' }], getTableRows: () => [{ label:'行' }] })
for (const kind of ['gauge','radar','funnel','scatter','heatmap']) test(`WidgetRenderer passes ${kind} option to chart renderer`, () => { const wrapper = mount(Renderer, { props: props({ id:kind, type:'chart', chartKind:kind, title:kind, config:{} }) }); const option = JSON.parse(wrapper.find('.chart-option').text()); assert.equal(option.series[0].type, kind); if (kind === 'radar') assert.ok(option.radar.indicator.length); if (kind === 'heatmap') assert.ok(option.xAxis && option.yAxis && option.visualMap); wrapper.unmount() })
test('WidgetRenderer table uses its table branch without IdmpChart', () => { const wrapper = mount(Renderer, { props: props({ id:'table', type:'chart', chartKind:'table', title:'表格', config:{} }) }); assert.equal(wrapper.find('table').exists(), true); assert.equal(wrapper.find('.chart-option').exists(), false); wrapper.unmount() })
