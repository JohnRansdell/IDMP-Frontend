// Presentation only: preserve datasets, drill payloads, callbacks and series identity.
export const DASHBOARD_PALETTE = ['#1261a6', '#4c82b1', '#758aa3', '#a47735', '#8f9a80', '#ab8686']
export const MINT_MEDICAL_PALETTE = ['#11aaa7', '#ff8400', '#4d9df5', '#55b98d', '#7c93a6', '#bc7891']
export function createDashboardChartTheme(option = {}, surfaceTone = 'light', appearanceTheme = 'default') {
  const dark = surfaceTone === 'dark'
  const mint = appearanceTheme === 'mint-medical'
  const tokens = dark ? { text: '#f8fbff', legend: '#e5f1fa', axis: '#d9e9f5', axisLine: 'rgba(217,233,245,.72)', splitLine: 'rgba(217,233,245,.28)' } : mint ? { text: '#43585d', legend: '#5f7378', axis: '#778b8e', axisLine: '#d4e7e6', splitLine: '#dcefed' } : { text: '#52636c', legend: '#667780', axis: '#73828a', axisLine: '#dce4e7', splitLine: '#eff2f3' }
  const axis = value => Array.isArray(value) ? value.map(axis) : value && ({ ...value, axisLine: { ...value.axisLine, lineStyle: { color: tokens.axisLine, ...value.axisLine?.lineStyle } }, axisLabel: { color: tokens.axis, fontSize: 11, ...value.axisLabel }, nameTextStyle: { color: tokens.axis, ...value.nameTextStyle }, splitLine: { ...value.splitLine, lineStyle: { color: tokens.splitLine, ...value.splitLine?.lineStyle } } })
  const sourceSeries = Array.isArray(option.series) ? option.series : option.series ? [option.series] : []
  const hasCartesianAxes = Boolean(option.xAxis && option.yAxis)
  const hasLegend = Boolean(option.legend) && option.legend?.show !== false
  const legendAtBottom = hasLegend && option.legend?.bottom !== undefined
  const hasBottomScale = Boolean(option.visualMap) && option.visualMap?.show !== false && option.visualMap?.bottom !== undefined
  const sourceGrid = option.grid || {}
  const safeGrid = hasCartesianAxes ? {
    ...sourceGrid,
    top: Math.max(Number(sourceGrid.top) || 18, hasLegend && !legendAtBottom ? 44 : 18),
    bottom: Math.max(Number(sourceGrid.bottom) || 28, legendAtBottom ? 52 : hasBottomScale ? 54 : 28),
    left: sourceGrid.left ?? 12,
    right: sourceGrid.right ?? 16,
    containLabel: true
  } : option.grid
  const themedSeries = sourceSeries.map(series => ({
    ...series,
    ...(series.type === 'line' ? { showSymbol: series.showSymbol ?? mint, symbolSize: series.symbolSize ?? (mint ? 7 : undefined), lineStyle: { ...series.lineStyle, width: series.lineStyle?.width ?? 2.5 } } : {}),
    ...(series.type === 'bar' ? { itemStyle: { ...series.itemStyle, borderRadius: series.itemStyle?.borderRadius ?? [4, 4, 0, 0] }, emphasis: { ...series.emphasis, focus: series.emphasis?.focus ?? 'series' } } : {}),
    ...(series.type === 'pie' ? { radius: series.radius ?? ['42%', '64%'], center: series.center ?? ['50%', legendAtBottom ? '43%' : '50%'], avoidLabelOverlap: true, label: { overflow: 'truncate', width: 82, ...series.label }, labelLine: { length: 8, length2: 6, ...series.labelLine }, itemStyle: { ...series.itemStyle, borderWidth: 2, borderColor: '#fff' }, emphasis: { ...series.emphasis, scale: series.emphasis?.scale ?? true, scaleSize: series.emphasis?.scaleSize ?? 6 } } : {}),
    ...(series.type === 'funnel' ? { top: Math.max(Number(series.top) || 16, hasLegend && !legendAtBottom ? 42 : 16), bottom: Math.max(Number(series.bottom) || 16, legendAtBottom ? 42 : 16), label: { overflow: 'truncate', width: 84, ...series.label } } : {}),
    ...(series.type === 'gauge' ? { center: series.center ?? ['50%', '54%'], radius: series.radius ?? '76%', title: { offsetCenter: [0, '72%'], overflow: 'truncate', width: 120, ...series.title }, detail: { offsetCenter: [0, '36%'], fontSize: 20, ...series.detail } } : {})
  }))
  const compactSeries = themedSeries.map(series => ['pie', 'funnel'].includes(series.type) ? { label: { show: false }, labelLine: { show: false } } : series.type === 'gauge' ? { title: { show: false }, detail: { fontSize: 16 } } : {})
  return {
    ...option, color: Array.isArray(option.color) && option.color.length ? option.color : mint ? MINT_MEDICAL_PALETTE : DASHBOARD_PALETTE, backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: tokens.text, ...option.textStyle },
    tooltip: { ...option.tooltip, backgroundColor: '#fff', borderColor: '#e2e8eb', borderWidth: 1, padding: [9, 12], textStyle: { color: '#25343b', fontSize: 12, lineHeight: 20 }, extraCssText: 'box-shadow:0 8px 24px rgba(37,52,59,.12);border-radius:10px;' },
    ...(hasLegend ? { legend: { ...option.legend, type: option.legend?.type || 'scroll', itemWidth: 10, itemHeight: 8, itemGap: 14, textStyle: { color: tokens.legend, fontSize: 11, ...option.legend?.textStyle } } } : {}),
    ...(hasCartesianAxes ? { grid: safeGrid } : {}),
    media: [
      ...(Array.isArray(option.media) ? option.media : []),
      { query: { maxHeight: 220 }, option: { grid: { left: 10, right: 10, top: 12, bottom: 18, containLabel: true }, legend: { show: false }, visualMap: { show: false }, series: compactSeries } },
      { query: { maxWidth: 420 }, option: { grid: { left: 10, right: 10, top: hasLegend && !legendAtBottom ? 38 : 16, bottom: legendAtBottom ? 46 : hasBottomScale ? 48 : 24, containLabel: true }, legend: { type: 'scroll', show: hasLegend, itemGap: 8, textStyle: { fontSize: 10 } }, xAxis: { axisLabel: { fontSize: 10, interval: 'auto', hideOverlap: true, overflow: 'truncate' } }, yAxis: { axisLabel: { fontSize: 10, hideOverlap: true, overflow: 'truncate' } } } }
    ],
    ...(option.xAxis ? { xAxis: axis(option.xAxis) } : {}),
    ...(option.yAxis ? { yAxis: axis(option.yAxis) } : {}),
    series: themedSeries
  }
}
// Use supplied clinical status, never infer clinical direction from +/- change.
export function clinicalTrendTone(status) {
  return ['success', 'warning', 'danger'].includes(status) ? status : 'neutral'
}
