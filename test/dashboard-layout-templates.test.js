import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILT_IN_LAYOUT_TEMPLATES,
  applyLayoutTemplateToDashboard,
  createLayoutTemplateFromDashboard,
  deleteLocalLayoutTemplate,
  instantiateLayoutTemplate,
  readLocalLayoutTemplates,
  saveLocalLayoutTemplate,
  validateLayoutTemplate
} from '../src/idmp/features/dashboard/layoutTemplates.js'
import { normalizeMetricGroupConfig } from '../src/idmp/features/dashboard/metricGroup.js'

const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const dashboard = {
  version: 1, id: 'dashboard-a', name: '原始看板', layout: { engine: 'gridstack', columns: 24, float: false },
  widgets: [
    { id: 'old-kpi', type: 'kpi', title: '死亡率', visualType: 'kpi', config: { style: { borderRadius: 12 }, dataBinding: { dimensions: [{ field: 'department' }], measures: [{ field: 'value' }], series: [], filters: [{ field: 'department', operator: 'eq', value: '内科' }] }, query: { respondToInteractionFilters: false }, interaction: { clickFilter: { enabled: true } }, runtimeResult: { value: 99 } }, layout: { x: 0, y: 0, w: 6, h: 3 } },
    { id: 'old-line', type: 'chart', chartKind: 'line', title: '趋势', config: { style: { background: '#fafafa' }, dataBinding: { dimensions: [{ field: 'month' }], measures: [{ field: 'value' }], series: [] } }, layout: { x: 6, y: 0, w: 12, h: 8 } }
  ]
}

test('layout template strips bindings and runtime data while retaining presentation and style', () => {
  const template = createLayoutTemplateFromDashboard(dashboard, { id: 'local-a', name: '质量布局', description: '本地测试' })
  assert.deepEqual(validateLayoutTemplate(template), { valid: true, errors: [] })
  assert.equal(template.widgets[0].id, undefined)
  assert.equal(template.widgets[0].config.dataBinding, undefined)
  assert.equal(template.widgets[0].config.query, undefined)
  assert.equal(template.widgets[0].config.interaction, undefined)
  assert.equal(template.widgets[0].config.runtimeResult, undefined)
  assert.equal(template.widgets[0].config.style.borderRadius, 12)
  assert.equal(template.widgets[1].chartKind, 'line')
})

test('instantiation creates fresh ids and valid 24-column layouts without source bindings', () => {
  const template = createLayoutTemplateFromDashboard(dashboard, { id: 'local-b', name: '可应用' })
  const widgets = instantiateLayoutTemplate(template, { createWidgetId: index => `new-${index}` })
  assert.deepEqual(widgets.map(widget => widget.id), ['new-0', 'new-1'])
  assert.equal(widgets.some(widget => widget.config.dataBinding || widget.sourceCode), false)
  assert.equal(widgets.every(widget => widget.layout.x + widget.layout.w <= 24), true)
  assert.throws(() => instantiateLayoutTemplate(template, { createWidgetId: () => 'duplicate' }), /duplicate widget ids/)
})

test('warning widgets retain their reusable filters but never event records in a template', () => {
  const source = {
    ...dashboard,
    widgets: [{
      id: 'old-warning', type: 'warnings', title: '高危预警',
      config: {
        style: { borderRadius: 10 },
        warning: { status: 'OPEN', severity: 'HIGH', indicatorVersionId: '9001', ruleId: '77', pageSize: 8, showTime: false },
        runtimeResult: { records: [{ id: 'event-a' }] }
      },
      layout: { x: 0, y: 0, w: 8, h: 7 }
    }]
  }
  const template = createLayoutTemplateFromDashboard(source, { id: 'local-warning', name: '预警布局' })
  assert.deepEqual(template.widgets[0].config.warning, source.widgets[0].config.warning)
  assert.equal(template.widgets[0].config.runtimeResult, undefined)
  const [widget] = instantiateLayoutTemplate(template, { createWidgetId: () => 'new-warning' })
  assert.deepEqual(widget.config.warning, source.widgets[0].config.warning)
})

test('applying a template replaces only widgets and leaves dashboard metadata available for undo', () => {
  const template = createLayoutTemplateFromDashboard(dashboard, { id: 'local-apply', name: '应用' })
  const before = structuredClone(dashboard)
  const applied = applyLayoutTemplateToDashboard(dashboard, template, { createWidgetId: index => `applied-${index}` })
  assert.equal(applied.id, before.id)
  assert.equal(applied.name, before.name)
  assert.deepEqual(applied.layout, before.layout)
  assert.deepEqual(applied.widgets.map(widget => widget.id), ['applied-0', 'applied-1'])
  assert.deepEqual(before, dashboard, 'the pre-apply snapshot remains usable by undo')
})

test('invalid templates are rejected before application and local storage only round-trips valid templates', () => {
  const invalid = { version: 1, id: 'bad', name: '坏模板', columns: 24, widgets: [{ type: 'kpi', config: { style: {} }, layout: { x: 23, y: 0, w: 6, h: 1 } }] }
  assert.equal(validateLayoutTemplate(invalid).valid, false)
  assert.throws(() => instantiateLayoutTemplate(invalid), /invalid layout template/)
  const local = storage()
  const template = createLayoutTemplateFromDashboard(dashboard, { id: 'local-c', name: '持久模板' })
  saveLocalLayoutTemplate(template, local)
  assert.deepEqual(readLocalLayoutTemplates(local).map(item => item.id), ['local-c'])
  deleteLocalLayoutTemplate('local-c', local)
  assert.deepEqual(readLocalLayoutTemplates(local), [])
})

test('every shipped built-in template is valid before GridStack sees it', () => {
  for (const template of BUILT_IN_LAYOUT_TEMPLATES) assert.deepEqual(validateLayoutTemplate(template), { valid: true, errors: [] }, template.name)
})

test('design templates retain distinct layouts, presentation hierarchy, and unbound metric groups', () => {
  const designs = BUILT_IN_LAYOUT_TEMPLATES.filter(template => template.visualTone)
  assert.equal(designs.length, 11)
  assert.equal(new Set(designs.map(template => template.id)).size, designs.length)
  assert.ok(designs.every(template => template.description && template.visualTone && template.density && template.detail?.useCase && template.detail?.layout && template.detail?.visual && template.detail?.components))
  assert.ok(designs.every(template => new Set(template.widgets.map(widget => `${widget.type}:${widget.title}`)).size === template.widgets.length))
  const layouts = designs.map(template => JSON.stringify(template.widgets.map(widget => [widget.type, widget.chartKind, widget.layout])))
  assert.equal(new Set(layouts).size, designs.length, 'each design has its own component composition and layout')
  const byId = id => designs.find(template => template.id === id)
  const executive = byId('builtin-executive-brief')
  const quality = byId('builtin-quality-overview')
  const operations = byId('builtin-operations-analysis')
  const minimal = byId('builtin-minimal-insight')
  const clinical = byId('builtin-clinical-command')
  const glass = byId('builtin-glass-medical')
  const cockpit = byId('builtin-dark-cockpit')
  assert.ok(minimal.widgets.length < executive.widgets.length)
  assert.equal(quality.appearance.theme, 'mint-medical')
  assert.equal(quality.widgets.filter(widget => widget.type === 'metric-group').length, 1)
  assert.ok(quality.widgets.some(widget => widget.type === 'warnings'))
  assert.ok(executive.widgets.some(widget => widget.type === 'kpi' && widget.config.style.kpiVariant === 'hero'))
  const resultsTable = operations.widgets.find(widget => widget.chartKind === 'table')
  const operationsTrend = operations.widgets.find(widget => widget.chartKind === 'line')
  assert.ok(resultsTable.layout.w * resultsTable.layout.h > operationsTrend.layout.w * operationsTrend.layout.h, 'operations prioritizes reading period results')
  assert.equal(resultsTable.config.style.table.compact, true)
  assert.equal(minimal.widgets.filter(widget => widget.type === 'text').length, 2)
  assert.equal(cockpit.widgets.filter(widget => widget.type === 'metric-group')[0].config.metricGroup.itemAppearance, 'divider')
  assert.equal(glass.widgets.every(widget => widget.config.style.backdropBlur === '12px'), true)
  const clinicalWarnings = clinical.widgets.find(widget => widget.type === 'warnings')
  const clinicalGroup = clinical.widgets.find(widget => widget.type === 'metric-group')
  assert.ok(clinicalWarnings.layout.h > clinicalGroup.layout.h, 'clinical monitoring gives warning events a prominent column')
  for (const template of designs) {
    for (const group of template.widgets.filter(widget => widget.type === 'metric-group')) {
      assert.deepEqual(normalizeMetricGroupConfig(group.config.metricGroup), group.config.metricGroup, template.name)
      assert.equal(group.config.metricGroup.layout.columns, 'auto', template.name)
      assert.deepEqual(group.config.metricGroup.items, [], `${template.name} must not invent bound metrics`)
    }
    const before = structuredClone(template)
    const widgets = instantiateLayoutTemplate(template, { createWidgetId: index => `${template.id}-${index}` })
    assert.deepEqual(template, before, `${template.name} is not mutated by creation`)
    assert.equal(new Set(widgets.map(widget => widget.id)).size, widgets.length, template.name)
    assert.ok(widgets.every(widget => !widget.sourceCode && !widget.config.dataBinding && !widget.config.runtimeResult), `${template.name} requires real data binding after instantiation`)
    for (const group of widgets.filter(widget => widget.type === 'metric-group')) {
      assert.deepEqual(group.config.metricGroup.items, [], `${template.name} keeps metric groups unbound after instantiation`)
    }
  }
})

test('built-in template catalog exposes the current general-purpose designs and business monitoring names', () => {
  const catalog = BUILT_IN_LAYOUT_TEMPLATES.map(template => [template.id, template.name])
    .sort(([left], [right]) => left.localeCompare(right))
  const expected = [
    ['builtin-quality-overview', '全院质量总览'],
    ['builtin-executive-brief', '高管简报'],
    ['builtin-clinical-command', '临床监测'],
    ['builtin-operations-analysis', '运营分析'],
    ['builtin-minimal-insight', '极简洞察'],
    ['builtin-glass-medical', '玻璃医疗'],
    ['builtin-dark-cockpit', '深色驾驶舱'],
    ['builtin-hospital-overview', '全院概览'],
    ['builtin-performance-assessment', '绩效指标监测'],
    ['builtin-topic-analysis', '医疗质量专题'],
    ['builtin-department-overview', '科室指标监测']
  ].sort(([left], [right]) => left.localeCompare(right))
  assert.deepEqual(catalog, expected)
})
