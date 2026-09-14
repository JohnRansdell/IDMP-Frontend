import { DASHBOARD_DESIGN_WIDTH } from './constants.js'
import { gridWidgetId } from './gridMembership.js'
import { GRID_COLUMNS, getDefaultGridLayout, normalizeGridLayout } from './schema.js'
import { getWidgetGridCapability, WIDGET_GRID_CAPABILITIES } from './widgetCapabilities.js'

// These limits protect readable business content; they are not persistence defaults.
export const WIDGET_GRID_CONSTRAINTS = WIDGET_GRID_CAPABILITIES

export function getWidgetGridConstraints(widgetOrType = 'chart') {
  const { minW, minH } = getWidgetGridCapability(widgetOrType)
  const locked = typeof widgetOrType === 'object' && widgetOrType?.config?.locked === true
  return { minW, minH, ...(locked ? { noMove: true, noResize: true } : {}) }
}

export function legacyPixelLayoutToGrid(layout, options = {}) {
  const designWidth = positive(options.designWidth, DASHBOARD_DESIGN_WIDTH)
  const columns = positive(options.columns, GRID_COLUMNS)
  const cellHeight = positive(options.cellHeight, 60)
  const result = []
  const ids = new Set()
  ;(Array.isArray(layout) ? layout : []).forEach((legacyWidget) => {
    if (!legacyWidget || typeof legacyWidget !== 'object' || typeof legacyWidget.id !== 'string' || ids.has(legacyWidget.id)) return
    ids.add(legacyWidget.id)
    const fallback = getDefaultGridLayout(legacyWidget)
    const candidate = normalizeGridLayout({
      x: Math.round(Number(legacyWidget.x || 0) / designWidth * columns),
      y: Math.round(Number(legacyWidget.y || 0) / cellHeight),
      w: Math.round(Number(legacyWidget.w || 0) / designWidth * columns),
      // A migration must preserve readable content rather than minimize row usage.
      h: Math.ceil(Number(legacyWidget.h || 0) / cellHeight)
    }, columns, fallback)
    const constraints = getWidgetGridConstraints(legacyWidget)
    const constrained = normalizeGridLayout({ ...candidate, w: Math.max(candidate.w, constraints.minW), h: Math.max(candidate.h, constraints.minH) }, columns, candidate)
    result.push(placeWithoutOverlap({ id: legacyWidget.id, ...constrained }, result, columns))
  })
  return result
}

export function serializeGridLayout(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && gridWidgetId(item.id) !== null)
    .map((item) => ({
      id: gridWidgetId(item.id),
      x: Math.max(0, Math.round(Number(item.x) || 0)),
      y: Math.max(0, Math.round(Number(item.y) || 0)),
      // GridStack omits w/h from save() when they equal minW/minH.
      w: Math.max(1, Math.round(Number(item.w ?? item.minW) || 1)),
      h: Math.max(1, Math.round(Number(item.h ?? item.minH) || 1))
    }))
}

function placeWithoutOverlap(item, placed, columns) {
  const normalized = normalizeGridLayout(item, columns, item)
  let candidate = normalized
  while (placed.some((other) => overlaps(candidate, other))) candidate = { ...candidate, y: candidate.y + 1 }
  return { id: item.id, ...candidate }
}
function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y }
function positive(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}
