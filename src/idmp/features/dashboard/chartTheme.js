// Presentation only: preserve datasets, drill payloads, callbacks and series identity.
export const DASHBOARD_PALETTE = ['#1261a6', '#4c82b1', '#758aa3', '#a47735', '#8f9a80', '#ab8686']
export function createDashboardChartTheme(option = {}) {
  const axis = value => Array.isArray(value) ? value.map(axis) : value && ({ ...value, axisLine: { ...value.axisLine, lineStyle: { color: '#dce4e7', ...value.axisLine?.lineStyle } }, axisLabel: { color: '#73828a', fontSize: 11, ...value.axisLabel }, splitLine: { ...value.splitLine, lineStyle: { color: '#eff2f3', ...value.splitLine?.lineStyle } } })
  return {
    ...option, color: Array.isArray(option.color) && option.color.length ? option.color : DASHBOARD_PALETTE, backgroundColor: 'transparent',
    textStyle: { ...option.textStyle, fontFamily: 'Inter, system-ui, sans-serif', color: '#52636c' },
    tooltip: { ...option.tooltip, backgroundColor: '#fff', borderColor: '#e2e8eb', textStyle: { color: '#25343b', fontSize: 12 }, extraCssText: 'box-shadow:0 4px 16px #25343b12;border-radius:8px;' },
    legend: { ...option.legend, itemWidth: 12, itemHeight: 8, textStyle: { ...option.legend?.textStyle, color: '#667780', fontSize: 11 } },
    media: [...(Array.isArray(option.media) ? option.media : []), { query: { maxWidth: 420 }, option: { grid: { left: 32, right: 12, top: 32, bottom: 28, containLabel: true }, legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 10 } }, xAxis: { axisLabel: { fontSize: 10, interval: 'auto' } }, yAxis: { axisLabel: { fontSize: 10 } } } }],
    ...(option.xAxis ? { xAxis: axis(option.xAxis) } : {}),
    ...(option.yAxis ? { yAxis: axis(option.yAxis) } : {}),
    series: (Array.isArray(option.series) ? option.series : option.series ? [option.series] : []).map(series => ({
      ...series,
      ...(series.type === 'line' ? { showSymbol: series.showSymbol ?? false, lineStyle: { ...series.lineStyle, width: series.lineStyle?.width ?? 2.5 } } : {}),
      ...(series.type === 'bar' ? { itemStyle: { ...series.itemStyle, borderRadius: series.itemStyle?.borderRadius ?? [3, 3, 0, 0] } } : {}),
      ...(series.type === 'pie' ? { radius: series.radius ?? ['48%', '70%'], itemStyle: { ...series.itemStyle, borderWidth: 2, borderColor: '#fff' } } : {})
    }))
  }
}
// Use supplied clinical status, never infer clinical direction from +/- change.
export function clinicalTrendTone(status) {
  return ['success', 'warning', 'danger'].includes(status) ? status : 'neutral'
}
