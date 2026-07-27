import {
  DASHBOARD_DESIGN_WIDTH,
  DASHBOARD_LAYOUT_GAP,
  WIDGET_CONSTRAINTS
} from './constants'

const VALID_WIDGET_TYPES = new Set(Object.keys(WIDGET_CONSTRAINTS))

export function createDefaultLayout() {
  const summaryWidth = DASHBOARD_DESIGN_WIDTH - DASHBOARD_LAYOUT_GAP
  const primaryWidth = Math.round(summaryWidth * 0.72 / 2.17)
  const supportingWidth = summaryWidth - primaryWidth
  const splitWidth = DASHBOARD_DESIGN_WIDTH - DASHBOARD_LAYOUT_GAP
  const leftWidth = Math.round(splitWidth * 1.35 / 2.35)
  const rightWidth = splitWidth - leftWidth
  const chartY = 262 + DASHBOARD_LAYOUT_GAP
  const bottomY = chartY + 336 + DASHBOARD_LAYOUT_GAP

  return [
    {
      id: 'primary-metric',
      type: 'primary',
      kpiIndex: 0,
      x: 0,
      y: 0,
      w: primaryWidth,
      h: 262
    },
    {
      id: 'supporting-metrics',
      type: 'supporting',
      x: primaryWidth + DASHBOARD_LAYOUT_GAP,
      y: 0,
      w: supportingWidth,
      h: 262
    },
    {
      id: 'trend-chart',
      type: 'chart',
      chartKind: 'line',
      title: '近 12 月质量趋势',
      preset: 'trend',
      x: 0,
      y: chartY,
      w: leftWidth,
      h: 336
    },
    {
      id: 'rate-chart',
      type: 'chart',
      chartKind: 'pie',
      title: '指标目标分布',
      preset: 'rate',
      x: leftWidth + DASHBOARD_LAYOUT_GAP,
      y: chartY,
      w: rightWidth,
      h: 336
    },
    {
      id: 'warning-list',
      type: 'warnings',
      x: 0,
      y: bottomY,
      w: leftWidth,
      h: 302
    },
    {
      id: 'ranking-list',
      type: 'ranking',
      x: leftWidth + DASHBOARD_LAYOUT_GAP,
      y: bottomY,
      w: rightWidth,
      h: 302
    }
  ]
}

export function cloneLayout(layout) {
  return layout.map((item) => ({ ...item, data: item.data ? { ...item.data } : item.data }))
}

export function normalizeLayout(layout, getIndicatorSource, boardScale = 1) {
  if (!Array.isArray(layout)) return []

  const widgetIds = new Set()
  return layout
    .filter((widget) => (
      widget &&
      typeof widget === 'object' &&
      typeof widget.id === 'string' &&
      widget.id.trim() &&
      VALID_WIDGET_TYPES.has(widget.type) &&
      !widgetIds.has(widget.id) &&
      widgetIds.add(widget.id)
    ))
    .map((widget) => {
      const normalized = { ...widget }
      if (
        normalized.sourceCode &&
        !normalized.sourceSnapshot &&
        typeof getIndicatorSource === 'function'
      ) {
        normalized.sourceSnapshot = getIndicatorSource(normalized.sourceCode)
      }
      return constrainWidget(normalized, DASHBOARD_DESIGN_WIDTH, boardScale)
    })
}

export function getWidgetConstraints(widget, boardScale = 1) {
  const type = typeof widget === 'string' ? widget : widget?.type
  const constraints = WIDGET_CONSTRAINTS[type] || WIDGET_CONSTRAINTS.chart
  const widthScale = Math.min(1, toPositiveNumber(boardScale, 1))
  return {
    ...constraints,
    minW: Math.ceil(constraints.minW / widthScale)
  }
}

export function constrainWidget(
  widget,
  designWidth = DASHBOARD_DESIGN_WIDTH,
  boardScale = 1
) {
  const constraints = getWidgetConstraints(widget, boardScale)
  const safeDesignWidth = Math.max(constraints.minW, toRoundedNumber(designWidth, DASHBOARD_DESIGN_WIDTH))
  const width = clamp(
    toRoundedNumber(widget?.w, constraints.minW),
    constraints.minW,
    safeDesignWidth
  )
  const height = Math.max(
    constraints.minH,
    toRoundedNumber(widget?.h, constraints.minH)
  )
  const x = clamp(
    toRoundedNumber(widget?.x, 0),
    0,
    safeDesignWidth - width
  )
  const y = Math.max(0, toRoundedNumber(widget?.y, 0))

  return {
    ...widget,
    x,
    y,
    w: width,
    h: height
  }
}

export function widgetStyle(widget) {
  return {
    left: `${(widget.x / DASHBOARD_DESIGN_WIDTH) * 100}%`,
    top: `${widget.y}px`,
    width: `${(widget.w / DASHBOARD_DESIGN_WIDTH) * 100}%`,
    height: `${widget.h}px`
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function toRoundedNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

function toPositiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}
