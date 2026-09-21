import { DASHBOARD_CODE } from './constants.js'
import { validateFilterDefinitions, validateConditions, validateWidgetQuery, validateWidgetInteraction } from './filterEngine.js'
import { getWidgetGridCapability } from './widgetCapabilities.js'

export const DASHBOARD_SCHEMA_VERSION = 1
export const DASHBOARD_SCHEMA_STORAGE_PREFIX = 'idmp:dashboard-schema:v1:'
export const GRID_LAYOUT_ENGINE = 'gridstack'
export const GRID_COLUMNS = 24

const VALID_WIDGET_TYPES = new Set(['primary', 'supporting', 'kpi', 'chart', 'text', 'warnings', 'ranking'])
const WIDGET_METADATA_FIELDS = ['id', 'type', 'sourceCode', 'sourceName', 'kpiIndex', 'chartKind', 'visualType', 'preset', 'title', 'config']
const ROOT_PERSISTED_FIELDS = new Set(['version', 'id', 'name', 'description', 'dashboardType', 'category', 'scope', 'sceneCode', 'responsivePolicy', 'layout', 'appearance', 'presentation', 'widgets', 'globalFilters'])
const LAYOUT_PERSISTED_FIELDS = new Set(['engine', 'columns', 'float'])
const WIDGET_PERSISTED_FIELDS = new Set([...WIDGET_METADATA_FIELDS, 'layout'])
const WIDGET_LAYOUT_PERSISTED_FIELDS = new Set(['x', 'y', 'w', 'h'])
const APPEARANCE_PERSISTED_FIELDS = new Set(['theme', 'background', 'cardStyle', 'gridGap'])
const BACKGROUND_PERSISTED_FIELDS = new Set(['type', 'value', 'intensity'])
const PRESENTATION_PERSISTED_FIELDS = new Set(['defaultMode', 'allowFullscreen', 'fit'])
export const DEFAULT_WIDGET_STYLE = Object.freeze({
  background: '#ffffff', borderColor: '#d0d5dd', borderWidth: 1,
  borderStyle: 'solid', borderRadius: 8, shadow: 'none', padding: 0, opacity: 1
})
export const DEFAULT_DASHBOARD_APPEARANCE = Object.freeze({
  theme: 'default', background: { type: 'color', value: '', intensity: 100 }, cardStyle: 'default', gridGap: 8
})
export const DEFAULT_DASHBOARD_PRESENTATION = Object.freeze({ defaultMode: 'standard', allowFullscreen: true, fit: 'viewport' })

export function getDashboardSchemaStorageKey(dashboardId = DASHBOARD_CODE) {
  const safeId = String(dashboardId || '').trim()
  if (!safeId) throw new Error('dashboardId is required')
  return `${DASHBOARD_SCHEMA_STORAGE_PREFIX}${encodeURIComponent(safeId)}`
}

export function getDefaultGridLayout(widgetOrType = 'chart') {
  const capability = getWidgetGridCapability(widgetOrType)
  const type = typeof widgetOrType === 'string' ? widgetOrType : widgetOrType?.type
  return { x: type === 'supporting' ? 8 : type === 'ranking' ? 12 : 0, y: 0, w: capability.defaultW, h: capability.defaultH }
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
  normalized.config = isPlainObject(widget.config) ? clonePersistableValue(widget.config) : {}
  normalized.config.style = { ...DEFAULT_WIDGET_STYLE, ...(isPlainObject(normalized.config.style) ? normalized.config.style : {}) }
  return normalized
}

export function mergeWidgetMetadataAndLayout(metadata = [], layouts = []) {
  const layoutById = new Map((Array.isArray(layouts) ? layouts : []).map((item) => [item.id, item]))
  return (Array.isArray(metadata) ? metadata : []).map((widget) => {
    const normalized = normalizeWidgetMetadata(widget)
    if (!normalized) return null
    return { ...normalized, layout: normalizeGridLayout(layoutById.get(normalized.id), GRID_COLUMNS, getDefaultGridLayout(normalized)) }
  }).filter(Boolean)
}

export function applyGridLayoutToSchema(schema, layouts = []) {
  if (!schema || typeof schema !== 'object') return schema
  const columns = Math.max(1, toInteger(schema.layout?.columns, GRID_COLUMNS))
  const layoutById = new Map((Array.isArray(layouts) ? layouts : [])
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => [item.id, item]))
  return {
    ...schema,
    widgets: (Array.isArray(schema.widgets) ? schema.widgets : []).map((widget) => {
      const layout = layoutById.get(widget.id)
      return layout
        ? { ...widget, layout: normalizeGridLayout(layout, columns, widget.layout || getDefaultGridLayout(widget.type)) }
        : widget
    })
  }
}

export function synchronizeDashboardGridLayout(schema, layouts = [], userInitiated = false) {
  return { schema: applyGridLayoutToSchema(schema, layouts), dirty: userInitiated === true }
}

// Column switching is deliberately schema-level so Designer and Viewer always
// receive the same normalized desktop layout.  We only support the product
// grid sizes (12/24), preserve every widget and resolve collisions by stacking.
export function changeDashboardGridColumns(schema, columns) {
  const nextColumns = Number(columns)
  if (![12, 24].includes(nextColumns)) throw new TypeError('grid columns must be 12 or 24')
  const currentColumns = Number(schema?.layout?.columns || GRID_COLUMNS)
  if (currentColumns === nextColumns) return normalizeDashboardSchema(schema)
  const occupied = []
  const widgets = (schema?.widgets || []).map((widget) => {
    const layout = widget.layout || getDefaultGridLayout(widget)
    const scaled = {
      x: Math.round(layout.x * nextColumns / currentColumns),
      y: Math.max(0, Math.round(layout.y)),
      w: Math.max(1, Math.round(layout.w * nextColumns / currentColumns)),
      h: Math.max(1, Math.round(layout.h))
    }
    let candidate = normalizeGridLayout(scaled, nextColumns, getDefaultGridLayout(widget))
    while (occupied.some(other => layoutsOverlap(candidate, other))) candidate = { ...candidate, y: candidate.y + 1 }
    occupied.push(candidate)
    return { ...widget, layout: candidate }
  })
  return normalizeDashboardSchema({ ...schema, layout: { ...schema.layout, columns: nextColumns }, widgets })
}

export function updateDashboardWidget(schema, widgetId, updater) {
  if (!schema || typeof schema !== 'object' || !widgetId) return schema
  let changed = false
  const widgets = (Array.isArray(schema.widgets) ? schema.widgets : []).map((widget) => {
    if (widget.id !== widgetId) return widget
    changed = true
    return typeof updater === 'function' ? updater(widget) : { ...widget, ...updater }
  })
  return changed ? { ...schema, widgets } : schema
}

export function createPersistableDashboardSnapshot(schema) {
  const validation = validateDashboardSchema(schema)
  if (!validation.valid) throw new TypeError(`invalid current dashboard schema: ${validation.errors.join('; ')}`)
  assertDashboardPersistenceContract(schema)
  const source = clonePersistableValue(schema)
  return canonicalize({
    version: source.version,
    id: source.id,
    name: source.name,
    description: source.description,
    dashboardType: source.dashboardType,
    category: source.category,
    scope: source.scope,
    sceneCode: source.sceneCode,
    responsivePolicy: source.responsivePolicy,
    globalFilters: source.globalFilters ?? [],
    layout: source.layout,
    appearance: source.appearance,
    presentation: source.presentation,
    widgets: source.widgets
      .map((widget) => ({
        id: widget.id,
        type: widget.type,
        sourceCode: widget.sourceCode,
        sourceName: widget.sourceName,
        kpiIndex: widget.kpiIndex,
        chartKind: widget.chartKind,
        visualType: widget.visualType,
        preset: widget.preset,
        title: widget.title,
        config: widget.config,
        layout: widget.layout
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  })
}

export function assertDashboardPersistenceContract(schema) {
  assertKnownFields(schema, ROOT_PERSISTED_FIELDS, '$')
  assertKnownFields(schema.layout, LAYOUT_PERSISTED_FIELDS, '$.layout')
  if (schema.appearance !== undefined) {
    assertKnownFields(schema.appearance, APPEARANCE_PERSISTED_FIELDS, '$.appearance')
    if (schema.appearance.background !== undefined) assertKnownFields(schema.appearance.background, BACKGROUND_PERSISTED_FIELDS, '$.appearance.background')
  }
  if (schema.presentation !== undefined) assertKnownFields(schema.presentation, PRESENTATION_PERSISTED_FIELDS, '$.presentation')
  schema.widgets.forEach((widget, index) => {
    assertKnownFields(widget, WIDGET_PERSISTED_FIELDS, `$.widgets[${index}]`)
    assertKnownFields(widget.layout, WIDGET_LAYOUT_PERSISTED_FIELDS, `$.widgets[${index}].layout`)
  })
  clonePersistableValue(schema)
  return true
}

export function migrateDashboardSchema(input, { fromVersion, toVersion = DASHBOARD_SCHEMA_VERSION } = {}) {
  if (fromVersion !== 'legacy-pixel-layout' || toVersion !== DASHBOARD_SCHEMA_VERSION) {
    throw new TypeError(`unsupported dashboard migration: ${String(fromVersion)} -> ${String(toVersion)}`)
  }
  const migrated = normalizeDashboardSchema({ ...input, version: DASHBOARD_SCHEMA_VERSION })
  const validation = validateDashboardSchema(migrated)
  if (!validation.valid) throw new TypeError(`dashboard migration failed: ${validation.errors.join('; ')}`)
  assertDashboardPersistenceContract(migrated)
  return migrated
}

export function semanticDashboardEquals(left, right) {
  return JSON.stringify(createPersistableDashboardSnapshot(left)) === JSON.stringify(createPersistableDashboardSnapshot(right))
}

export function clonePersistableValue(value, path = '$', seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === undefined) return undefined
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new TypeError(`${path} is not JSON persistable`)
  }
  if (typeof value !== 'object') return value
  if (seen.has(value)) throw new TypeError(`${path} contains a circular reference`)
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => clonePersistableValue(item, `${path}[${index}]`, seen) ?? null)
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must be a plain JSON object`)
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError(`${path} contains symbol keys`)
    return Object.keys(value).reduce((result, key) => {
      const cloned = clonePersistableValue(value[key], `${path}.${key}`, seen)
      if (cloned !== undefined) result[key] = cloned
      return result
    }, {})
  } finally {
    seen.delete(value)
  }
}

export function validateDashboardSchema(schema) {
  const errors = []
  if (!schema || typeof schema !== 'object') return { valid: false, errors: ['schema must be an object'] }
  errors.push(...validateFilterDefinitions(schema.globalFilters))
  if (schema.version !== DASHBOARD_SCHEMA_VERSION) errors.push(`version must be ${DASHBOARD_SCHEMA_VERSION}`)
  if (typeof schema.id !== 'string' || !schema.id.trim()) errors.push('id is required')
  if (schema.description !== undefined && typeof schema.description !== 'string') errors.push('description must be a string')
  if (schema.dashboardType !== undefined && !['hospital-overview', 'topic', 'scene', 'department', 'custom'].includes(schema.dashboardType)) errors.push('dashboardType is invalid')
  if (schema.category !== undefined && typeof schema.category !== 'string') errors.push('category must be a string')
  if (schema.scope !== undefined && !['hospital', 'department', 'personal'].includes(schema.scope)) errors.push('scope is invalid')
  if (schema.sceneCode !== undefined && typeof schema.sceneCode !== 'string') errors.push('sceneCode must be a string')
  if (schema.responsivePolicy !== undefined && (schema.responsivePolicy?.tablet !== 'auto-two-column' && schema.responsivePolicy?.tablet !== 'single-column' || schema.responsivePolicy?.mobile !== 'single-column')) errors.push('responsivePolicy is invalid')
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
      errors.push(...validateWidgetQuery(widget.config?.query))
      errors.push(...validateWidgetInteraction(widget.config?.interaction))
      if (widget.config?.dataBinding?.filters !== undefined) errors.push(...validateConditions(widget.config.dataBinding.filters))
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
  if (source.version !== DASHBOARD_SCHEMA_VERSION) {
    throw new TypeError(`normalization requires dashboard schema version ${DASHBOARD_SCHEMA_VERSION}`)
  }
  const columns = Math.max(1, toInteger(source.layout?.columns, GRID_COLUMNS))
  const widgets = []
  const ids = new Set()
  ;(Array.isArray(source.widgets) ? source.widgets : []).forEach((widget) => {
    const metadata = normalizeWidgetMetadata(widget)
    if (!metadata || ids.has(metadata.id)) return
    ids.add(metadata.id)
    widgets.push({ ...metadata, layout: normalizeGridLayout(widget.layout, columns, getDefaultGridLayout(metadata)) })
  })
  return {
    version: DASHBOARD_SCHEMA_VERSION,
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : DASHBOARD_CODE,
    name: typeof source.name === 'string' ? source.name : '',
    description: typeof source.description === 'string' ? source.description : '',
    dashboardType: ['hospital-overview', 'topic', 'scene', 'department', 'custom'].includes(source.dashboardType) ? source.dashboardType : 'custom',
    category: typeof source.category === 'string' ? source.category : '',
    scope: ['hospital', 'department', 'personal'].includes(source.scope) ? source.scope : 'hospital',
    sceneCode: typeof source.sceneCode === 'string' ? source.sceneCode : '',
    responsivePolicy: { tablet: source.responsivePolicy?.tablet === 'single-column' ? 'single-column' : 'auto-two-column', mobile: 'single-column' },
    globalFilters: clonePersistableValue(source.globalFilters ?? []),
    layout: { engine: GRID_LAYOUT_ENGINE, columns, float: source.layout?.float === true },
    appearance: {
      ...DEFAULT_DASHBOARD_APPEARANCE,
      ...(isPlainObject(source.appearance) ? source.appearance : {}),
      background: {
        ...DEFAULT_DASHBOARD_APPEARANCE.background,
        ...(isPlainObject(source.appearance?.background) ? source.appearance.background : {}),
        intensity: normalizeBackgroundIntensity(source.appearance?.background?.intensity)
      }
    },
    presentation: { ...DEFAULT_DASHBOARD_PRESENTATION, ...(isPlainObject(source.presentation) ? source.presentation : {}) },
    widgets
  }
}

function normalizeBackgroundIntensity(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(100, Math.max(35, Math.round(numeric))) : 100
}

function toInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}
function clamp(value, min, max) { return Math.min(Math.max(value, min), max) }
function layoutsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y }
function isPlainObject(value) { return value && typeof value === 'object' && !Array.isArray(value) }
function assertKnownFields(value, allowed, path) {
  if (!isPlainObject(value)) throw new TypeError(`${path} must be a plain object`)
  const unknown = Object.keys(value).filter((key) => !allowed.has(key))
  if (unknown.length) throw new TypeError(`${path} contains undeclared persisted field(s): ${unknown.join(', ')}`)
}
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isPlainObject(value)) return value
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key])
    return result
  }, {})
}
