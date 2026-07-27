export const DASHBOARD_LAYOUT_STORAGE_KEY = 'idmp:dashboard-layout:v3'
export const OBSOLETE_DASHBOARD_LAYOUT_STORAGE_KEYS = [
  'idmp:dashboard-layout:v2',
  'idmp:dashboard-layout:v1',
  'idmp:dashboard-layout'
]
export const DASHBOARD_DESIGN_WIDTH = 1440
export const DASHBOARD_MIN_WIDTH = 916
export const DASHBOARD_LAYOUT_GAP = 16
export const DEFAULT_DASHBOARD_HEIGHT = 932
export const DASHBOARD_CODE = 'quality-overview'

export const WIDGET_CONSTRAINTS = Object.freeze({
  kpi: Object.freeze({ minW: 220, minH: 158 }),
  primary: Object.freeze({ minW: 300, minH: 246 }),
  supporting: Object.freeze({ minW: 560, minH: 262 }),
  chart: Object.freeze({ minW: 360, minH: 336 }),
  warnings: Object.freeze({ minW: 360, minH: 286 }),
  ranking: Object.freeze({ minW: 360, minH: 302 })
})

export const resizeHandles = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw']

export const widgetTypeOptions = [
  { label: '指标卡', value: 'kpi' },
  { label: '柱状图', value: 'bar' },
  { label: '折线图', value: 'line' },
  { label: '饼图', value: 'pie' }
]
