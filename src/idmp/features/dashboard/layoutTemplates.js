import { GRID_COLUMNS, DEFAULT_WIDGET_STYLE, clonePersistableValue, normalizeGridLayout, normalizeWidgetMetadata } from './schema.js'
import { getWidgetGridConstraints } from './gridLayout.js'

export const DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY = 'idmp:dashboard-layout-templates:v1'
export const DASHBOARD_LAYOUT_TEMPLATE_VERSION = 1

const TEMPLATE_WIDGET_FIELDS = ['type', 'chartKind', 'visualType', 'preset', 'title']
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

function safeTemplateWidget(widget = {}) {
  const result = {}
  TEMPLATE_WIDGET_FIELDS.forEach((field) => { if (widget[field] !== undefined) result[field] = clonePersistableValue(widget[field]) })
  result.type = widget.type
  result.layout = clonePersistableValue(widget.layout)
  result.config = { style: { ...DEFAULT_WIDGET_STYLE, ...(plain(widget.config?.style) ? clonePersistableValue(widget.config.style) : {}) } }
  return result
}

function templateId() {
  return `layout-template-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createLayoutTemplateFromDashboard(schema, { id = templateId(), name = '未命名本地模板', description = '' } = {}) {
  const template = {
    version: DASHBOARD_LAYOUT_TEMPLATE_VERSION,
    id: String(id),
    name: String(name).trim(),
    description: String(description).trim(),
    columns: GRID_COLUMNS,
    widgets: (Array.isArray(schema?.widgets) ? schema.widgets : []).map(safeTemplateWidget)
  }
  const validation = validateLayoutTemplate(template)
  if (!validation.valid) throw new TypeError(`invalid layout template: ${validation.errors.join('; ')}`)
  return clonePersistableValue(template)
}

export function validateLayoutTemplate(template) {
  const errors = []
  if (!plain(template)) return { valid: false, errors: ['template must be a plain object'] }
  if (template.version !== DASHBOARD_LAYOUT_TEMPLATE_VERSION) errors.push(`version must be ${DASHBOARD_LAYOUT_TEMPLATE_VERSION}`)
  if (typeof template.id !== 'string' || !template.id.trim()) errors.push('id is required')
  if (typeof template.name !== 'string' || !template.name.trim()) errors.push('name is required')
  if (template.columns !== GRID_COLUMNS) errors.push(`columns must be ${GRID_COLUMNS}`)
  if (!Array.isArray(template.widgets)) errors.push('widgets must be an array')
  else {
    template.widgets.forEach((widget, index) => {
      const prefix = `widgets[${index}]`
      if (!plain(widget)) { errors.push(`${prefix} must be a plain object`); return }
      const metadata = normalizeWidgetMetadata({ id: `template-${index}`, ...widget, config: { style: widget.config?.style } })
      if (!metadata) errors.push(`${prefix}.type is invalid`)
      const layout = widget.layout
      if (!plain(layout) || !['x', 'y', 'w', 'h'].every(key => Number.isInteger(layout[key]))) { errors.push(`${prefix}.layout must use integer x/y/w/h`); return }
      if (layout.x < 0 || layout.y < 0 || layout.w < 1 || layout.h < 1 || layout.x + layout.w > GRID_COLUMNS) errors.push(`${prefix}.layout is out of bounds`)
      const constraints = getWidgetGridConstraints(metadata || widget)
      if (layout.w < constraints.minW || layout.h < constraints.minH) errors.push(`${prefix}.layout is below minimum size`)
    })
    for (let left = 0; left < template.widgets.length; left += 1) for (let right = left + 1; right < template.widgets.length; right += 1) {
      if (template.widgets[left]?.layout && template.widgets[right]?.layout && overlaps(template.widgets[left].layout, template.widgets[right].layout)) errors.push(`widgets[${left}] overlaps widgets[${right}]`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function instantiateLayoutTemplate(template, { createWidgetId = (index) => `dashboard-widget-${Date.now()}-${index + 1}` } = {}) {
  const validation = validateLayoutTemplate(template)
  if (!validation.valid) throw new TypeError(`invalid layout template: ${validation.errors.join('; ')}`)
  const ids = new Set()
  const widgets = template.widgets.map((item, index) => {
    let id = String(createWidgetId(index) || '').trim()
    if (!id || ids.has(id)) throw new TypeError('template instantiation produced duplicate widget ids')
    ids.add(id)
    const metadata = normalizeWidgetMetadata({
      id, type: item.type, chartKind: item.chartKind, visualType: item.visualType, preset: item.preset, title: item.title,
      config: { style: item.config?.style }
    })
    return { ...metadata, layout: normalizeGridLayout(item.layout, GRID_COLUMNS, item.layout) }
  })
  return clonePersistableValue(widgets)
}

// A layout template is deliberately narrower than a dashboard copy: the existing
// dashboard root (identity, metadata, appearance, filters) remains authoritative.
export function applyLayoutTemplateToDashboard(schema, template, options) {
  if (!plain(schema)) throw new TypeError('dashboard schema must be a plain object')
  return { ...clonePersistableValue(schema), widgets: instantiateLayoutTemplate(template, options) }
}

export function readLocalLayoutTemplates(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.filter(template => validateLayoutTemplate(template).valid).map(template => clonePersistableValue(template)) : []
  } catch { return [] }
}

export function writeLocalLayoutTemplates(templates, storage = globalThis.localStorage) {
  const value = Array.isArray(templates) ? templates.map(template => clonePersistableValue(template)) : []
  const invalid = value.find(template => !validateLayoutTemplate(template).valid)
  if (invalid) throw new TypeError('cannot store an invalid layout template')
  storage?.setItem(DASHBOARD_LAYOUT_TEMPLATE_STORAGE_KEY, JSON.stringify(value))
  return value
}

export function saveLocalLayoutTemplate(template, storage = globalThis.localStorage) {
  const templates = readLocalLayoutTemplates(storage).filter(item => item.id !== template.id)
  const next = [...templates, clonePersistableValue(template)]
  return writeLocalLayoutTemplates(next, storage)
}

export function deleteLocalLayoutTemplate(templateId, storage = globalThis.localStorage) {
  return writeLocalLayoutTemplates(readLocalLayoutTemplates(storage).filter(template => template.id !== templateId), storage)
}

export const BUILT_IN_LAYOUT_TEMPLATES = Object.freeze([
  { version: 1, id: 'builtin-hospital-overview', name: '全院概览', description: '4 个关键指标、趋势、排名与构成。', columns: 24, widgets: [
    ...[0, 6, 12, 18].map((x, index) => ({ type: 'kpi', title: `关键指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'line', visualType: 'line', title: '质量趋势', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '科室排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'chart', chartKind: 'pie', visualType: 'pie', title: '指标构成', config: { style: {} }, layout: { x: 0, y: 11, w: 12, h: 8 } }
  ] },
  { version: 1, id: 'builtin-topic-analysis', name: '专题分析', description: '专题指标、比较、排名与明细。', columns: 24, widgets: [
    ...[0, 6].map((x, index) => ({ type: 'kpi', title: `专题指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'bar', visualType: 'bar', title: '专题比较', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '专题排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'chart', chartKind: 'table', visualType: 'table', title: '专题明细', config: { style: {} }, layout: { x: 0, y: 11, w: 24, h: 8 } }
  ] },
  { version: 1, id: 'builtin-department-overview', name: '科室概览', description: '4 个科室指标、趋势、排名与预警。', columns: 24, widgets: [
    ...[0, 6, 12, 18].map((x, index) => ({ type: 'kpi', title: `科室指标 ${index + 1}`, visualType: 'kpi', config: { style: {} }, layout: { x, y: 0, w: 6, h: 3 } })),
    { type: 'chart', chartKind: 'line', visualType: 'line', title: '科室趋势', config: { style: {} }, layout: { x: 0, y: 3, w: 14, h: 8 } },
    { type: 'ranking', title: '科室排名', config: { style: {} }, layout: { x: 14, y: 3, w: 10, h: 7 } },
    { type: 'warnings', title: '预警事项', config: { style: {} }, layout: { x: 14, y: 10, w: 10, h: 7 } }
  ] }
])
