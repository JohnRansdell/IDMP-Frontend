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
const { createDashboardChartOption, formatKpiComparison } = await import('../src/idmp/features/dashboard/visualization.js')
const { createDashboardChartTheme, clinicalTrendTone } = await import('../src/idmp/features/dashboard/chartTheme.js')
const { applyChartPresentationPreset, applyWidgetStylePreset, applyWidgetVisualStyle, chartColorTargets, resolveWidgetVisualStyle, WIDGET_STYLE_PRESETS, widgetPalette } = await import('../src/idmp/features/dashboard/visualStyle.js')
const { resolveWidgetSurfaceTone } = await import('../src/idmp/features/dashboard/backgroundAssets.js')
const { hasDataBinding } = await import('../src/idmp/features/dashboard/bindingEngine.js')
const { normalizeKpiVariant } = await import('../src/idmp/features/dashboard/kpiVariants.js')
async function loadKpiPresentation() {
  const file = fileURLToPath(new URL('../src/idmp/features/dashboard/components/KpiPresentation.vue', import.meta.url))
  const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
  let code = compileScript(descriptor, { id: 'kpi-presentation-test', inlineTemplate: true }).content
  const vueBindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, specifiers]) => specifiers.split(',').map(specifier => specifier.trim()).filter(Boolean).map(specifier => { const [imported, local = imported] = specifier.split(/\s+as\s+/); return { imported: imported.trim(), local: local.trim() } }))
  const vuePrelude = vueBindings.map(({ imported, local }) => `const ${local} = globalThis.__kpiPresentation.vue.${imported};`).join('\n')
  code = code.replace(/^import .*$/gm, '').replace('export default', 'return')
  globalThis.__kpiPresentation = { vue, normalizeKpiVariant, formatKpiComparison }
  return Function(`const { normalizeKpiVariant, formatKpiComparison } = globalThis.__kpiPresentation;\n${vuePrelude}\n${code}`)()
}
const KpiPresentationComponent = await loadKpiPresentation()
async function loadChartStyleInspector() {
  const file = fileURLToPath(new URL('../src/idmp/features/dashboard/components/ChartStyleInspector.vue', import.meta.url))
  const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
  let code = compileScript(descriptor, { id: 'chart-style-inspector-test', inlineTemplate: true }).content
  const vueBindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, specifiers]) => specifiers.split(',').map(specifier => specifier.trim()).filter(Boolean).map(specifier => { const [imported, local = imported] = specifier.split(/\s+as\s+/); return { imported: imported.trim(), local: local.trim() } }))
  const vuePrelude = vueBindings.map(({ imported, local }) => `const ${local} = globalThis.__styleInspector.vue.${imported};`).join('\n')
  code = code.replace(/^import .*$/gm, '').replace('export default', 'return')
  const EmptyPicker = vue.defineComponent({ render: () => null })
  globalThis.__styleInspector = {
    vue, applyWidgetStylePreset, chartColorTargets, resolveWidgetVisualStyle, WIDGET_STYLE_PRESETS, widgetPalette,
    applyChartPresentationPreset, normalizeKpiVariant, KpiVariantPicker: EmptyPicker, ChartPresentationPicker: EmptyPicker,
    bindingKind: () => 'kpi', compileWidgetData: () => null, hasDataBinding: () => false,
    queryWidgetDatasetWithRuntime: value => value, effectiveDrill: () => null
  }
  code = `const { applyWidgetStylePreset, chartColorTargets, resolveWidgetVisualStyle, WIDGET_STYLE_PRESETS, widgetPalette, applyChartPresentationPreset, normalizeKpiVariant, KpiVariantPicker, ChartPresentationPicker, bindingKind, compileWidgetData, hasDataBinding, queryWidgetDatasetWithRuntime, effectiveDrill } = globalThis.__styleInspector;\n${vuePrelude}\n${code}`
  return Function(code)()
}
const ChartStyleInspectorComponent = await loadChartStyleInspector()
async function loadRenderer() {
  const file = fileURLToPath(new URL('../src/idmp/features/dashboard/components/WidgetRenderer.vue', import.meta.url))
  const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
  let code = compileScript(descriptor, { id: 'renderer-test', inlineTemplate: true }).content
  const vueBindings = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([, specifiers]) => specifiers.split(',').map(specifier => specifier.trim()).filter(Boolean).map(specifier => { const [imported, local = imported] = specifier.split(/\s+as\s+/); return { imported: imported.trim(), local: local.trim() } }))
  const vuePrelude = vueBindings.map(({ imported, local }) => `const ${local} = globalThis.__renderer.vue.${imported};`).join('\n')
  code = code.replace(/^import .*$/gm, '').replace('export default', 'return')
  const KpiPresentation = vue.defineComponent({ props: { model: Object }, setup: props => () => vue.h('div', `同比 ${formatKpiComparison(props.model?.yoy, props.model?.comparisonUnit || props.model?.unit)} · 环比 ${formatKpiComparison(props.model?.mom, props.model?.comparisonUnit || props.model?.unit)}`) })
  const BindingWidget = vue.defineComponent({ emits: ['analysis'], setup: (_, { emit }) => () => vue.h('button', { class: 'binding-widget-stub', onClick: () => emit('analysis') }) })
  globalThis.__renderer = { vue, hasDataBinding, createDashboardChartTheme, clinicalTrendTone, formatKpiComparison, applyWidgetVisualStyle, resolveWidgetVisualStyle, resolveWidgetSurfaceTone, BindingWidget, KpiPresentation, IdmpChart: vue.defineComponent({ props: { option: Object }, setup: props => () => vue.h('pre', { class: 'chart-option' }, JSON.stringify(props.option)) }), StatePanel: vue.defineComponent({ render: () => null }), Bell: {}, InfoFilled: {}, TrophyBase: {}, WarningFilled: {} }
  code = `const { hasDataBinding, createDashboardChartTheme, clinicalTrendTone, formatKpiComparison, applyWidgetVisualStyle, resolveWidgetVisualStyle, resolveWidgetSurfaceTone, BindingWidget, KpiPresentation, IdmpChart, StatePanel, Bell, InfoFilled, TrophyBase, WarningFilled } = globalThis.__renderer;
  ${vuePrelude}
  ${code}`
  return Function(code)()
}
const Renderer = await loadRenderer()
const source = { name: '演示', currentValue: 4, trendData: [2, 4, 3], trendLabels: ['1月','2月','3月'], departmentData: [{ name: '呼吸内科', value: 3 }, { name: '心内科', value: 6 }], pieData: [{ name: '呼吸内科', value: 3 }] }
const props = widget => ({ widget, getWidgetKpi: () => ({ title:'KPI', value:'1', status:'success' }), getTitle: item => item.title, getDescription: () => '', getIcon: () => ({}), getChartOption: item => createDashboardChartOption(item, { getSource: () => source }), isChartEmpty: () => false, getChartAriaLabel: () => '', getTableColumns: () => [{ key:'label', label:'名称' }], getTableRows: () => [{ label:'行' }] })
for (const kind of ['gauge','radar','funnel','scatter','heatmap']) test(`WidgetRenderer passes ${kind} option to chart renderer`, () => { const wrapper = mount(Renderer, { props: props({ id:kind, type:'chart', chartKind:kind, title:kind, config:{} }) }); const option = JSON.parse(wrapper.find('.chart-option').text()); assert.equal(option.series[0].type, kind); if (kind === 'radar') assert.ok(option.radar.indicator.length); if (kind === 'heatmap') assert.ok(option.xAxis && option.yAxis && option.visualMap); wrapper.unmount() })
test('WidgetRenderer table uses its table branch without IdmpChart', () => { const wrapper = mount(Renderer, { props: props({ id:'table', type:'chart', chartKind:'table', title:'表格', config:{} }) }); assert.equal(wrapper.find('table').exists(), true); assert.equal(wrapper.find('.chart-option').exists(), false); wrapper.unmount() })
test('WidgetRenderer formats percentage KPI comparisons only at presentation', () => { const wrapper = mount(Renderer, { props: { ...props({ id:'kpi', type:'kpi', title:'KPI', config:{} }), getWidgetKpi: () => ({ title:'KPI', value:'52.63%', unit:'%', mom:1.24, yoy:-0.12, trendDirection:'up', status:'success', target:'≥ 50%' }) } }); assert.match(wrapper.text(), /环比 \+1\.24%/); assert.match(wrapper.text(), /同比 -0\.12%/); wrapper.unmount() })
test('KPI presentation applies a visible variant class and rearranges the bound KPI structure', () => { const wrapper = mount(KpiPresentationComponent, { props: { variant: 'horizontal', model: { title: '出院人数', value: '120', yoy: 4.2, mom: 1.1, status: 'success' } } }); assert.equal(wrapper.classes().includes('is-variant-horizontal'), true); assert.equal(wrapper.find('.kpi-presentation__head').exists(), true); assert.equal(wrapper.find('.kpi-presentation__comparisons').text().includes('同比 +4.2'), true); wrapper.unmount() })
test('bound KPI forwards its analysis click in viewer mode', async () => {
  const widget = { id: 'bound-kpi', type: 'kpi', title: 'KPI', config: { dataBinding: { dataset: 'backend', dimensions: [], measures: [{ field: 'value', aggregation: 'direct' }], series: [], sort: [] } } }
  const wrapper = mount(Renderer, { props: { ...props(widget), interactive: true } })
  await wrapper.find('.binding-widget-stub').trigger('click')
  assert.deepEqual(wrapper.emitted('widget-analysis')?.[0], [widget])
  wrapper.unmount()
})
test('theme preset click emits a visibly different KPI style and selected preset id', async () => {
  const wrapper = mount(ChartStyleInspectorComponent, { props: { widget: { id: 'kpi-theme', type: 'kpi', config: { style: { background: '#ffffff', backgroundMode: 'none' } } } } })
  const warm = wrapper.findAll('.style-presets button').find(button => button.text().includes('暖橙'))
  assert.ok(warm)
  await warm.trigger('click')
  const update = wrapper.emitted('update')?.at(-1)?.[0]
  assert.equal(update.themePreset, 'warm')
  assert.equal(update.kpi.valueColor, '#9b5636')
  assert.equal(update.backgroundMode, 'solid')
  wrapper.unmount()
})
test('theme preset click updates parent widget state and immediately highlights the selection', async () => {
  const Host = vue.defineComponent({
    setup() {
      const widget = vue.ref({ id: 'kpi-theme-host', type: 'kpi', config: { style: { background: '#ffffff', backgroundMode: 'none' } } })
      const update = patch => { widget.value = { ...widget.value, config: { ...widget.value.config, style: { ...widget.value.config.style, ...patch } } } }
      return () => vue.h(ChartStyleInspectorComponent, { widget: widget.value, onUpdate: update })
    }
  })
  const wrapper = mount(Host)
  const warm = wrapper.findAll('.style-presets button').find(button => button.text().includes('暖橙'))
  await warm.trigger('click')
  await vue.nextTick()
  assert.equal(warm.classes().includes('is-active'), true)
  assert.equal(warm.attributes('aria-pressed'), 'true')
  wrapper.unmount()
})
