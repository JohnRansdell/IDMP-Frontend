import { getWidgetGridConstraints } from './gridLayout.js'
import { hasLayoutCollisions } from './layoutOperations.js'

const integer = value => Math.round(Number(value))
export const percentageToGridWidth = (percent, columns = 24) => Math.round(Number(percent) * columns / 100)
export const gridWidthToPercentage = (width, columns = 24) => Math.round(Number(width) / columns * 100)

export function drawnRectangleToGridLayout(start, end, geometry, constraints = { minW: 1, minH: 1 }) {
  const { columns, rows, cellWidth, cellHeight } = geometry
  if (cellWidth <= 0 || cellHeight <= 0 || columns < 1 || rows < 1) return null
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
  const minW = Math.min(columns, constraints.minW)
  const minH = Math.min(rows, constraints.minH)
  const x = clamp(Math.floor(Math.min(start.x, end.x) / cellWidth), 0, columns - minW)
  const y = clamp(Math.floor(Math.min(start.y, end.y) / cellHeight), 0, rows - minH)
  return {
    x, y,
    w: clamp(Math.ceil(Math.max(start.x, end.x) / cellWidth) - x, minW, columns - x),
    h: clamp(Math.ceil(Math.max(start.y, end.y) / cellHeight) - y, minH, rows - y)
  }
}

export async function applyWidgetLayoutToCanvas(canvas, widgets) {
  const requestedLayout = widgets.map(widget => ({ id: widget.id, ...widget.layout }))
  const appliedLayout = await canvas?.applyLayout(requestedLayout)
  return appliedLayout?.length ? appliedLayout : requestedLayout
}

export function validatePreciseLayout(widgets, widgetId, draft, columns = 24) {
  const widget = widgets.find(item => item.id === widgetId)
  if (!widget) return { ok: false, reason: '组件不存在' }
  if (widget.config?.locked) return { ok: false, reason: '组件已锁定位置和尺寸' }
  const constraints = getWidgetGridConstraints(widget)
  const layout = { x: integer(draft.x), y: integer(draft.y), w: integer(draft.w), h: integer(draft.h) }
  if (!Object.values(layout).every(Number.isInteger) || layout.x < 0 || layout.y < 0) return { ok: false, reason: '位置必须为非负整数' }
  if (layout.w < constraints.minW || layout.h < constraints.minH) return { ok: false, reason: `尺寸不能小于 ${constraints.minW} × ${constraints.minH}` }
  if (layout.w > columns || layout.x + layout.w > columns) return { ok: false, reason: '位置和宽度超出画布' }
  const next = widgets.map(item => item.id === widgetId ? { ...item, layout } : item)
  if (hasLayoutCollisions(next)) return { ok: false, reason: '当前位置与其他组件冲突' }
  return { ok: true, widgets: next, layout }
}
