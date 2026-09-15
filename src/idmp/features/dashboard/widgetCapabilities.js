const capability = (defaultW, defaultH) => Object.freeze({ minW: 1, minH: 1, defaultW, defaultH })
export const WIDGET_GRID_CAPABILITIES = Object.freeze({
  primary: capability(8, 5), supporting: capability(16, 5), kpi: capability(6, 3),
  line: capability(12, 8), bar: capability(12, 8), pie: capability(12, 8), table: capability(12, 8),
  gauge: capability(8, 7), radar: capability(12, 8), funnel: capability(12, 8), scatter: capability(12, 8), heatmap: capability(12, 8), chart: capability(12, 8), warnings: capability(12, 7), ranking: capability(12, 7)
})

export function getWidgetGridCapability(widgetOrType = 'chart') {
  const type = typeof widgetOrType === 'string' ? widgetOrType : widgetOrType?.type
  const chartKind = typeof widgetOrType === 'object' && type === 'chart' ? widgetOrType?.chartKind : ''
  return WIDGET_GRID_CAPABILITIES[chartKind] || WIDGET_GRID_CAPABILITIES[type] || WIDGET_GRID_CAPABILITIES.chart
}

export function normalizeWidgetSelectionId(widgetId) {
  return widgetId === null || widgetId === undefined ? '' : String(widgetId)
}

export function getDashboardGridGeometry(columns = 24, cellWidth = 0, cellHeight = 60, margin = 8, rows = 1) {
  return {
    columns: Math.max(1, Math.round(Number(columns) || 24)),
    cellWidth: Math.max(0, Number(cellWidth) || 0),
    cellHeight: Math.max(1, Number(cellHeight) || 60),
    margin: Math.max(0, Number(margin) || 0),
    rows: Math.max(1, Math.ceil(Number(rows) || 1))
  }
}
