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
