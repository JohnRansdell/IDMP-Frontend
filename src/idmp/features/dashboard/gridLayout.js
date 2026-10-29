import { gridWidgetId } from './gridMembership.js'
import { getWidgetGridCapability, WIDGET_GRID_CAPABILITIES } from './widgetCapabilities.js'

// These limits protect readable business content; they are not persistence defaults.
export const WIDGET_GRID_CONSTRAINTS = WIDGET_GRID_CAPABILITIES

export function getWidgetGridConstraints(widgetOrType = 'chart') {
  const { minW, minH } = getWidgetGridCapability(widgetOrType)
  const locked = typeof widgetOrType === 'object' && widgetOrType?.config?.locked === true
  return { minW, minH, ...(locked ? { noMove: true, noResize: true } : {}) }
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
