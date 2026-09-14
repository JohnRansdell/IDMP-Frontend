export const WIDGET_GRID_CAPABILITIES = Object.freeze({
  primary: Object.freeze({ minW: 7, minH: 4, defaultW: 8, defaultH: 5 }),
  supporting: Object.freeze({ minW: 10, minH: 5, defaultW: 16, defaultH: 5 }),
  kpi: Object.freeze({ minW: 3, minH: 2, defaultW: 6, defaultH: 3 }),
  line: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 8 }),
  bar: Object.freeze({ minW: 7, minH: 6, defaultW: 12, defaultH: 8 }),
  pie: Object.freeze({ minW: 6, minH: 6, defaultW: 12, defaultH: 8 }),
  table: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 8 }),
  gauge: Object.freeze({ minW: 6, minH: 5, defaultW: 8, defaultH: 7 }),
  radar: Object.freeze({ minW: 7, minH: 6, defaultW: 12, defaultH: 8 }),
  funnel: Object.freeze({ minW: 7, minH: 6, defaultW: 12, defaultH: 8 }),
  scatter: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 8 }),
  heatmap: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 8 }),
  chart: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 8 }),
  warnings: Object.freeze({ minW: 8, minH: 6, defaultW: 12, defaultH: 7 }),
  ranking: Object.freeze({ minW: 8, minH: 7, defaultW: 12, defaultH: 7 })
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
