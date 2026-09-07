import { DASHBOARD_CODE } from './constants.js'

export const DASHBOARD_SCHEMA_VERSION = 1
export const DASHBOARD_SCHEMA_STORAGE_PREFIX = 'idmp:dashboard-schema:v1:'
export const GRID_LAYOUT_ENGINE = 'gridstack'
export const GRID_COLUMNS = 24

const VALID_WIDGET_TYPES = new Set(['primary', 'supporting', 'kpi', 'chart', 'warnings', 'ranking'])
const WIDGET_METADATA_FIELDS = ['id', 'type', 'sourceCode', 'sourceName', 'kpiIndex', 'chartKind', 'visualType', 'preset', 'title', 'config']
const DEFAULT_GRID_LAYOUTS = Object.freeze({
  primary: { x: 0, y: 0, w: 8, h: 5 }, supporting: { x: 8, y: 0, w: 16, h: 5 },
  kpi: { x: 0, y: 0, w: 6, h: 4 }, chart: { x: 0, y: 0, w: 12, h: 8 },
  warnings: { x: 0, y: 0, w: 12, h: 7 }, ranking: { x: 12, y: 0, w: 12, h: 7 }
})

export function getDashboardSchemaStorageKey(dashboardId = DASHBOARD_CODE) {
  const safeId = String(dashboardId || '').trim()
  if (!safeId) throw new Error('dashboardId is required')
  return `${DASHBOARD_SCHEMA_STORAGE_PREFIX}${encodeURIComponent(safeId)}`
}

export function getDefaultGridLayout(type = 'chart') {
  return { ...(DEFAULT_GRID_LAYOUTS[type] || DEFAULT_GRID_LAYOUTS.chart) }
}

export function normalizeGridLayout(layout, columns = GRID_COLUMNS, fallback = getDefaultGridLayout()) {
  const source = layout && typeof layout === 'object' ? layout : fallback
  const safeColumns = Math.max(1, toInteger(columns, GRID_COLUMNS))
  const w = clamp(toInteger(source.w, fallback.w), 1, safeColumns)
  const h = Math.max(1, toInteger(source.h, fallback.h))
  const x = clamp(toInteger(source.x, fallback.x), 0, safeColumns - w)
  const y = Math.max(0, toInteger(source.y, fallback.y))
  return { x, y, w, h }
}

export function normalizeWidgetMetadata(widget = {}) {
  if (!widget || typeof widget !== 'object') return null
  const id = typeof widget.id === 'string' ? widget.id.trim() : ''
  const type = typeof widget.type === 'string' ? widget.type : ''
  if (!id || !VALID_WIDGET_TYPES.has(type)) return null
  const normalized = {}
  WIDGET_METADATA_FIELDS.forEach((field) => {
    if (widget[field] !== undefined && field !== 'config') normalized[field] = widget[field]
  })
  normalized.id = id
  normalized.type = type
  normalized.config = isPlainObject(widget.config) ? structuredClone(widget.config) : {}
  return normalized
}

export function mergeWidgetMetadataAndLayout(metadata = [], layouts = []) {
  const layoutById = new Map((Array.isArray(layouts) ? layouts : []).map((item) => [item.id, item]))
  return (Array.isArray(metadata) ? metadata : []).map((widget) => {
    const normalized = normalizeWidgetMetadata(widget)
    if (!normalized) return null
    return { ...normalized, layout: normalizeGridLayout(layoutById.get(normalized.id), GRID_COLUMNS, getDefaultGridLayout(normalized.type)) }
  }).filter(Boolean)
}

export function validateDashboardSchema(schema) {
  const errors = []
  if (!schema || typeof schema !== 'object') return { valid: false, errors: ['schema must be an object'] }
  if (schema.version !== DASHBOARD_SCHEMA_VERSION) errors.push(`version must be ${DASHBOARD_SCHEMA_VERSION}`)
  if (typeof schema.id !== 'string' || !schema.id.trim()) errors.push('id is required')
  if (!schema.layout || typeof schema.layout !== 'object') errors.push('layout is required')
  else {
    if (schema.layout.engine !== GRID_LAYOUT_ENGINE) errors.push('layout.engine must be gridstack')
    if (!Number.isInteger(schema.layout.columns) || schema.layout.columns < 1) errors.push('layout.columns must be a positive integer')
    if (typeof schema.layout.float !== 'boolean') errors.push('layout.float must be boolean')
  }
  if (!Array.isArray(schema.widgets)) errors.push('widgets must be an array')
  else {
    const ids = new Set()
    schema.widgets.forEach((widget, index) => {
      const prefix = `widgets[${index}]`
      if (!widget || typeof widget !== 'object') { errors.push(`${prefix} must be an object`); return }
      if (typeof widget.id !== 'string' || !widget.id.trim()) errors.push(`${prefix}.id is required`)
      else if (ids.has(widget.id)) errors.push(`${prefix}.id is duplicated`)
      else ids.add(widget.id)
      if (!VALID_WIDGET_TYPES.has(widget.type)) errors.push(`${prefix}.type is invalid`)
      const layout = widget.layout
      if (!layout || typeof layout !== 'object') { errors.push(`${prefix}.layout is required`); return }
      ;['x', 'y', 'w', 'h'].forEach((key) => {
        if (!Number.isInteger(layout[key])) errors.push(`${prefix}.layout.${key} must be an integer`)
      })
      if (Number.isInteger(layout.x) && layout.x < 0) errors.push(`${prefix}.layout.x must be non-negative`)
      if (Number.isInteger(layout.y) && layout.y < 0) errors.push(`${prefix}.layout.y must be non-negative`)
      if (Number.isInteger(layout.w) && layout.w <= 0) errors.push(`${prefix}.layout.w must be positive`)
      if (Number.isInteger(layout.h) && layout.h <= 0) errors.push(`${prefix}.layout.h must be positive`)
      if (Number.isInteger(layout.x) && Number.isInteger(layout.w) && Number.isInteger(schema.layout?.columns) && layout.x + layout.w > schema.layout.columns) errors.push(`${prefix}.layout exceeds columns`)
    })
  }
  return { valid: errors.length === 0, errors }
}

export function normalizeDashboardSchema(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const columns = Math.max(1, toInteger(source.layout?.columns, GRID_COLUMNS))
  const widgets = []
  const ids = new Set()
  ;(Array.isArray(source.widgets) ? source.widgets : []).forEach((widget) => {
    const metadata = normalizeWidgetMetadata(widget)
    if (!metadata || ids.has(metadata.id)) return
    ids.add(metadata.id)
    widgets.push({ ...metadata, layout: normalizeGridLayout(widget.layout, columns, getDefaultGridLayout(metadata.type)) })
  })
  return {
    version: DASHBOARD_SCHEMA_VERSION,
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : DASHBOARD_CODE,
    name: typeof source.name === 'string' ? source.name : '',
    layout: { engine: GRID_LAYOUT_ENGINE, columns, float: source.layout?.float === true },
    widgets
  }
}

function toInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}
function clamp(value, min, max) { return Math.min(Math.max(value, min), max) }
function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value) }
