import { DASHBOARD_DESIGN_WIDTH } from './constants.js'
import { GRID_COLUMNS, getDefaultGridLayout, normalizeGridLayout } from './schema.js'

export function legacyPixelLayoutToGrid(layout, options = {}) {
  const designWidth = positive(options.designWidth, DASHBOARD_DESIGN_WIDTH)
  const columns = positive(options.columns, GRID_COLUMNS)
  const cellHeight = positive(options.cellHeight, 60)
  const result = []
  const ids = new Set()
  ;(Array.isArray(layout) ? layout : []).forEach((legacyWidget) => {
    if (!legacyWidget || typeof legacyWidget !== 'object' || typeof legacyWidget.id !== 'string' || ids.has(legacyWidget.id)) return
    ids.add(legacyWidget.id)
    const fallback = getDefaultGridLayout(legacyWidget.type)
    const candidate = normalizeGridLayout({
      x: Math.round(Number(legacyWidget.x || 0) / designWidth * columns),
      y: Math.round(Number(legacyWidget.y || 0) / cellHeight),
      w: Math.round(Number(legacyWidget.w || 0) / designWidth * columns),
      h: Math.round(Number(legacyWidget.h || 0) / cellHeight)
    }, columns, fallback)
    result.push(placeWithoutOverlap({ id: legacyWidget.id, ...candidate }, result, columns))
  })
  return result
}

export function serializeGridLayout(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({
      id: item.id,
      x: Math.max(0, Math.round(Number(item.x) || 0)),
      y: Math.max(0, Math.round(Number(item.y) || 0)),
      w: Math.max(1, Math.round(Number(item.w) || 1)),
      h: Math.max(1, Math.round(Number(item.h) || 1))
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
