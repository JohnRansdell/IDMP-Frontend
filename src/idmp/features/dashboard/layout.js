import { dashboardKpis } from '@/idmp/data/demo'
import { DASHBOARD_DESIGN_WIDTH } from './constants'

export function createDefaultLayout() {
  const gap = 16
  const kpiWidth = (DASHBOARD_DESIGN_WIDTH - gap * 5) / 6
  const sideTotal = DASHBOARD_DESIGN_WIDTH - gap
  const leftWidth = Math.round(sideTotal * 1.35 / 2.35)
  const rightWidth = sideTotal - leftWidth
  const result = dashboardKpis.map((_, index) => ({
    id: `kpi-${index}`,
    type: 'kpi',
    kpiIndex: index,
    x: Math.round(index * (kpiWidth + gap)),
    y: 0,
    w: Math.round(kpiWidth),
    h: 158
  }))

  result.push(
    { id: 'trend-chart', type: 'chart', chartKind: 'line', title: '指标趋势（近12月）', preset: 'trend', x: 0, y: 174, w: leftWidth, h: 336 },
    { id: 'rate-chart', type: 'chart', chartKind: 'pie', title: '分类达标率', preset: 'rate', x: leftWidth + gap, y: 174, w: rightWidth, h: 336 },
    { id: 'warning-list', type: 'warnings', x: 0, y: 526, w: leftWidth, h: 286 },
    { id: 'ranking-list', type: 'ranking', x: leftWidth + gap, y: 526, w: rightWidth, h: 286 }
  )
  return result
}

export function cloneLayout(layout) {
  return layout.map((item) => ({ ...item, data: item.data ? { ...item.data } : item.data }))
}

export function normalizeLayout(layout, getIndicatorSource) {
  return layout.map((widget) => {
    if (widget.type === 'trend') {
      return { ...widget, type: 'chart', chartKind: 'line', title: '指标趋势（近12月）', preset: 'trend' }
    }
    if (widget.type === 'rate') {
      return { ...widget, type: 'chart', chartKind: 'pie', title: '分类达标率', preset: 'rate' }
    }
    if (widget.sourceCode && !widget.dataSource) {
      return { ...widget, dataSource: getIndicatorSource(widget.sourceCode) }
    }
    return widget
  })
}

export function widgetStyle(widget) {
  return {
    left: `${(widget.x / DASHBOARD_DESIGN_WIDTH) * 100}%`,
    top: `${widget.y}px`,
    width: `${(widget.w / DASHBOARD_DESIGN_WIDTH) * 100}%`,
    height: `${widget.h}px`
  }
}
