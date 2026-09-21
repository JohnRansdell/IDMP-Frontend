const capability = (defaultW, defaultH) => Object.freeze({ minW: 1, minH: 1, defaultW, defaultH })
export const WIDGET_GRID_CAPABILITIES = Object.freeze({
  primary: capability(8, 5), supporting: capability(16, 5), kpi: capability(6, 3),
  line: capability(12, 8), bar: capability(12, 8), pie: capability(12, 8), table: capability(12, 8),
  gauge: capability(8, 7), radar: capability(12, 8), funnel: capability(12, 8), scatter: capability(12, 8), heatmap: capability(12, 8), chart: capability(12, 8), warnings: capability(12, 7), ranking: capability(12, 7)
  , text: capability(6, 3), map: capability(12, 8)
})

// Viewer-only presentation policy. These values deliberately never enter the
// persisted desktop schema: GridStack editing remains free down to 1x1.
export const WIDGET_RESPONSIVE_PRESENTATION_CAPABILITIES = Object.freeze({
  kpi: Object.freeze({ mobileMinH: 3, compact: 'value-only' }),
  primary: Object.freeze({ mobileMinH: 5, compact: 'hide-secondary' }),
  supporting: Object.freeze({ mobileMinH: 7, compact: 'stacked-list' }),
  line: Object.freeze({ mobileMinH: 8, compact: 'compact-chart' }),
  bar: Object.freeze({ mobileMinH: 8, compact: 'compact-chart' }),
  pie: Object.freeze({ mobileMinH: 7, compact: 'square-chart' }),
  gauge: Object.freeze({ mobileMinH: 7, compact: 'square-chart' }),
  radar: Object.freeze({ mobileMinH: 7, compact: 'square-chart' }),
  funnel: Object.freeze({ mobileMinH: 8, compact: 'compact-chart' }),
  scatter: Object.freeze({ mobileMinH: 9, compact: 'compact-chart' }),
  heatmap: Object.freeze({ mobileMinH: 9, compact: 'compact-chart' }),
  table: Object.freeze({ mobileMinH: 9, compact: 'horizontal-scroll' }),
  warnings: Object.freeze({ mobileMinH: 8, compact: 'stacked-list' }),
  ranking: Object.freeze({ mobileMinH: 8, compact: 'stacked-list' }),
  chart: Object.freeze({ mobileMinH: 8, compact: 'compact-chart' })
  , text: Object.freeze({ mobileMinH: 3, compact: 'text' }), map: Object.freeze({ mobileMinH: 8, compact: 'compact-chart' })
})

export function getWidgetGridCapability(widgetOrType = 'chart') {
  const type = typeof widgetOrType === 'string' ? widgetOrType : widgetOrType?.type
  const chartKind = typeof widgetOrType === 'object' && type === 'chart' ? widgetOrType?.chartKind : ''
  return WIDGET_GRID_CAPABILITIES[chartKind] || WIDGET_GRID_CAPABILITIES[type] || WIDGET_GRID_CAPABILITIES.chart
}

export function getWidgetResponsivePresentationCapability(widgetOrType = 'chart') {
  const type = typeof widgetOrType === 'string' ? widgetOrType : widgetOrType?.type
  const chartKind = typeof widgetOrType === 'object' && type === 'chart' ? widgetOrType?.chartKind : ''
  return WIDGET_RESPONSIVE_PRESENTATION_CAPABILITIES[chartKind] || WIDGET_RESPONSIVE_PRESENTATION_CAPABILITIES[type] || WIDGET_RESPONSIVE_PRESENTATION_CAPABILITIES.chart
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
