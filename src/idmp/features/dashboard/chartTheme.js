// Presentation only: preserve datasets, drill payloads, callbacks and series identity.
export const DASHBOARD_PALETTE = ['#1261a6', '#4c82b1', '#758aa3', '#a47735', '#8f9a80', '#ab8686']
export function createDashboardChartTheme(option = {}, surfaceTone = 'light') {
  const dark = surfaceTone === 'dark'
  const tokens = dark ? { text: '#f8fbff', legend: '#e5f1fa', axis: '#d9e9f5', axisLine: 'rgba(217,233,245,.72)', splitLine: 'rgba(217,233,245,.28)' } : { text: '#52636c', legend: '#667780', axis: '#73828a', axisLine: '#dce4e7', splitLine: '#eff2f3' }
  const axis = value => Array.isArray(value) ? value.map(axis) : value && ({ ...value, axisLine: { ...value.axisLine, lineStyle: { color: tokens.axisLine, ...value.axisLine?.lineStyle } }, axisLabel: { color: tokens.axis, fontSize: 11, ...value.axisLabel }, nameTextStyle: { color: tokens.axis, ...value.nameTextStyle }, splitLine: { ...value.splitLine, lineStyle: { color: tokens.splitLine, ...value.splitLine?.lineStyle } } })
  return {
    ...option, color: Array.isArray(option.color) && option.color.length ? option.color : DASHBOARD_PALETTE, backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: tokens.text, ...option.textStyle },
    tooltip: { ...option.tooltip, backgroundColor: '#fff', borderColor: '#e2e8eb', borderWidth: 1, padding: [9, 12], textStyle: { color: '#25343b', fontSize: 12, lineHeight: 20 }, extraCssText: 'box-shadow:0 8px 24px rgba(37,52,59,.12);border-radius:10px;' },
    legend: { ...option.legend, itemWidth: 10, itemHeight: 8, itemGap: 14, textStyle: { color: tokens.legend, fontSize: 11, ...option.legend?.textStyle } },
    media: [...(Array.isArray(option.media) ? option.media : []), { query: { maxWidth: 420 }, option: { grid: { left: 32, right: 12, top: 32, bottom: 28, containLabel: true }, legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } }, xAxis: { axisLabel: { fontSize: 10, interval: 'auto' } }, yAxis: { axisLabel: { fontSize: 10 } } } }],
    ...(option.xAxis ? { xAxis: axis(option.xAxis) } : {}),
    ...(option.yAxis ? { yAxis: axis(option.yAxis) } : {}),
    series: (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []).map(series => ({
      ...series,
      ...(series.type === 'line' ? { showSymbol: series.showSymbol ?? false, lineStyle: { ...series.lineStyle, width: series.lineStyle?.width ?? 2.5 } } : {}),
      ...(series.type === 'bar' ? { itemStyle: { ...series.itemStyle, borderRadius: series.itemStyle?.borderRadius ?? [4, 4, 0, 0] }, emphasis: { ...series.emphasis, focus: series.emphasis?.focus ?? 'series' } } : {}),
      ...(series.type === 'pie' ? { radius: series.radius ?? ['48%', '70%'], itemStyle: { ...series.itemStyle, borderWidth: 2, borderColor: '#fff' }, emphasis: { ...series.emphasis, scale: series.emphasis?.scale ?? true, scaleSize: series.emphasis?.scaleSize ?? 6 } } : {})
    }))
  }
}
// Use supplied clinical status, never infer clinical direction from +/- change.
export function clinicalTrendTone(status) {
  return ['success', 'warning', 'danger'].includes(status) ? status : 'neutral'
}
