export const DASHBOARD_BREAKPOINTS = Object.freeze({ mobile: 768, tablet: 1200 })

export function dashboardBreakpointForWidth(width) {
  const safeWidth = Number(width) || 0
  return safeWidth < DASHBOARD_BREAKPOINTS.mobile ? 'mobile' : safeWidth < DASHBOARD_BREAKPOINTS.tablet ? 'tablet' : 'desktop'
}

export function responsiveColumns(breakpoint) {
  return breakpoint === 'mobile' ? 1 : breakpoint === 'tablet' ? 2 : 24
}

export function responsiveReadingOrder(widgets = []) {
  return [...widgets].sort((left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x)
}

function kind(widget) { return widget.type === 'chart' ? widget.chartKind || 'chart' : widget.type }
export function deriveResponsiveHeight(widget, breakpoint) {
  if (breakpoint === 'desktop') return widget.layout.h
  const visual = kind(widget)
  const mobile = breakpoint === 'mobile'
  if (visual === 'kpi') return mobile ? 2 : 3
  if (visual === 'primary') return mobile ? 5 : 5
  if (visual === 'supporting') return mobile ? 6 : 5
  if (visual === 'table' || visual === 'heatmap') return mobile ? 8 : 7
  if (visual === 'warnings' || visual === 'ranking') return mobile ? 7 : 7
  if (visual === 'gauge') return mobile ? 6 : 6
  if (visual === 'pie' || visual === 'radar' || visual === 'funnel') return mobile ? 7 : 7
  if (visual === 'scatter') return mobile ? 8 : 7
  return mobile ? 7 : 7
}

function tabletSpan(widget) {
  const visual = kind(widget)
  if (visual === 'kpi' || visual === 'gauge') return 1
  if (widget.layout.w <= 7 && !['table', 'heatmap', 'line', 'bar', 'scatter'].includes(visual)) return 1
  return 2
}

export function deriveTabletLayout(widgets = []) {
  const result = []
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const widget of responsiveReadingOrder(widgets)) {
    const w = tabletSpan(widget)
    if (x + w > 2) { y += rowHeight; x = 0; rowHeight = 0 }
    const h = deriveResponsiveHeight(widget, 'tablet')
    result.push({ ...widget, layout: { x, y, w, h } })
    x += w
    rowHeight = Math.max(rowHeight, h)
    if (x === 2) { y += rowHeight; x = 0; rowHeight = 0 }
  }
  return result
}

export function deriveMobileLayout(widgets = []) {
  let y = 0
  return responsiveReadingOrder(widgets).map(widget => {
    const h = deriveResponsiveHeight(widget, 'mobile')
    const next = { ...widget, layout: { x: 0, y, w: 1, h } }
    y += h
    return next
  })
}

export function deriveResponsiveLayout(widgets = [], breakpoint = 'desktop', policy = {}) {
  if (breakpoint === 'tablet') return policy.tablet === 'single-column' ? deriveMobileLayout(widgets).map(widget => ({ ...widget, layout: { ...widget.layout, w: 2 } })) : deriveTabletLayout(widgets)
  if (breakpoint === 'mobile') return deriveMobileLayout(widgets)
  return widgets.map(widget => ({ ...widget, layout: { ...widget.layout } }))
}
