// Widget visual appearance has one canonical home: widget.config.style.
// This module deliberately translates that safe, small contract to ECharts
// options instead of exposing arbitrary option JSON to Dashboard users.
export const VISUAL_PALETTES = Object.freeze({
  default: ['#1261a6', '#4c82b1', '#758aa3', '#a47735', '#8f9a80', '#ab8686'],
  medicalBlue: ['#1261a6', '#2b77bd', '#619bd0', '#91bde0', '#345f8c', '#7a9fbd'],
  blueTeal: ['#1261a6', '#187f91', '#4f9f9e', '#78b9ae', '#4c82b1', '#88aab4'],
  green: ['#357b62', '#5c9b76', '#88b487', '#b0c997', '#4e8b78', '#729d66'],
  warm: ['#c56b3f', '#d7934f', '#be805b', '#d6aa6a', '#a95c51', '#d0a085'],
  colorful: ['#1261a6', '#4f8583', '#a47735', '#ab6680', '#7283b7', '#7f9a57']
})

export const HEATMAP_SCALES = Object.freeze({
  blue: ['#edf6ff', '#1261a6'], blueTeal: ['#e8f7f6', '#187f91'], green: ['#edf8f0', '#357b62'], warm: ['#fff4d6', '#c85d45'], coolWarm: ['#2d6da3', '#edf3e8', '#c85d45']
})

const defaults = Object.freeze({
  palettePreset: 'default', colors: [],
  common: { showLegend: true, legendPosition: 'top', showAxisLine: true, showGridLine: true },
  bar: { opacity: 1, borderRadius: 3, width: 'auto' },
  line: { width: 2.5, type: 'solid', smooth: false, showSymbol: false, symbol: 'circle', symbolSize: 6, area: false, areaOpacity: 0.16 },
  pie: { donut: true, innerRadius: 48, showLabel: true, labelPosition: 'outside' },
  scatter: { symbol: 'circle', symbolSize: 8, opacity: 1 },
  radar: { width: 2, showSymbol: true, symbolSize: 5, area: false, areaOpacity: 0.12 },
  funnel: { gap: 2, showLabel: true, labelPosition: 'outside' },
  heatmap: { colorScale: 'blue', borderColor: '#ffffff', borderWidth: 1, borderRadius: 0 },
  gauge: { progressColor: '', trackColor: '#e5ecee', showPointer: true, valueColor: '' },
  map: { lowColor: '#dceeff', highColor: '#1261a6', borderColor: '#ffffff', borderWidth: 1, showLabel: true },
  kpi: { valueColor: '', titleColor: '', trendColor: '' },
  table: { headerBackground: '#f3f7f8', zebra: true, compact: false }
})

function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {} }
function bounded(value, fallback, min, max) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback }
function pick(name, value, values) { return values.includes(value) ? value : defaults[name] }

export function resolveWidgetVisualStyle(widget = {}) {
  const source = record(widget.config?.style)
  const colors = Array.isArray(source.colors) ? source.colors.filter(color => /^#[0-9a-f]{6}$/i.test(color)) : []
  const merge = key => ({ ...defaults[key], ...record(source[key]) })
  return {
    palettePreset: source.palettePreset === 'custom' || Object.hasOwn(VISUAL_PALETTES, source.palettePreset) ? source.palettePreset : defaults.palettePreset,
    colors,
    common: merge('common'), bar: merge('bar'), line: merge('line'), pie: merge('pie'), scatter: merge('scatter'), radar: merge('radar'), funnel: merge('funnel'), heatmap: merge('heatmap'), gauge: merge('gauge'), map: merge('map'), kpi: merge('kpi'), table: merge('table')
  }
}

export function widgetPalette(widget) {
  const style = resolveWidgetVisualStyle(widget)
  return style.palettePreset === 'custom' && style.colors.length ? style.colors : VISUAL_PALETTES[style.palettePreset] || VISUAL_PALETTES.default
}

export function resetWidgetVisualStyle(style = {}) {
  const next = { ...record(style) }
  ;['palettePreset', 'colors', 'common', 'bar', 'line', 'pie', 'scatter', 'radar', 'funnel', 'heatmap', 'gauge', 'map', 'kpi', 'table'].forEach(key => delete next[key])
  return next
}

export function applyWidgetVisualStyle(widget, rawOption = {}) {
  const style = resolveWidgetVisualStyle(widget)
  const palette = widgetPalette(widget)
  const common = style.common
  const axis = value => ({ ...value, axisLine: { ...value.axisLine, show: common.showAxisLine !== false }, splitLine: { ...value.splitLine, show: common.showGridLine !== false } })
  const applyAxis = axisValue => Array.isArray(axisValue) ? axisValue.map(axis) : axisValue ? axis(axisValue) : axisValue
  const kind = widget.chartKind || widget.visualType || ''
  const option = {
    ...rawOption,
    color: palette,
    legend: rawOption.legend ? { ...rawOption.legend, show: common.showLegend !== false, ...(common.legendPosition === 'bottom' ? { top: undefined, bottom: 0 } : { bottom: undefined, top: 0 }) } : rawOption.legend,
    xAxis: applyAxis(rawOption.xAxis),
    yAxis: applyAxis(rawOption.yAxis)
  }
  if (kind === 'heatmap') option.visualMap = { ...rawOption.visualMap, inRange: { ...rawOption.visualMap?.inRange, color: HEATMAP_SCALES[style.heatmap.colorScale] || HEATMAP_SCALES.blue } }
  if (kind === 'map') {
    option.visualMap = { ...rawOption.visualMap, inRange: { ...rawOption.visualMap?.inRange, color: [style.map.lowColor, style.map.highColor] } }
    option.yAxis = { ...axis(rawOption.yAxis), axisLabel: { ...rawOption.yAxis?.axisLabel, show: style.map.showLabel !== false } }
  }
  option.series = (Array.isArray(rawOption.series) ? rawOption.series : rawOption.series ? [rawOption.series] : []).map((series, index) => {
    const color = palette[index % palette.length]
    if (series.type === 'bar') {
      const isMap = kind === 'map'
      const bar = isMap ? { ...style.bar, borderRadius: 3, opacity: 1 } : style.bar
      const width = { narrow: '38%', standard: '58%', wide: '78%' }[bar.width]
      return { ...series, ...(width ? { barWidth: width } : {}), itemStyle: { ...series.itemStyle, color: isMap ? undefined : color, opacity: bar.opacity, borderRadius: isMap ? [0, 4, 4, 0] : [bar.borderRadius, bar.borderRadius, 0, 0], ...(isMap ? { borderColor: style.map.borderColor, borderWidth: style.map.borderWidth } : {}) } }
    }
    if (series.type === 'line') return { ...series, showSymbol: style.line.showSymbol !== false, symbol: style.line.symbol, symbolSize: style.line.symbolSize, lineStyle: { ...series.lineStyle, color, width: style.line.width, type: style.line.type }, itemStyle: { ...series.itemStyle, color }, smooth: style.line.smooth === true, ...(style.line.area ? { areaStyle: { ...series.areaStyle, color, opacity: style.line.areaOpacity } } : { areaStyle: undefined }) }
    if (series.type === 'pie') return { ...series, radius: style.pie.donut ? [`${style.pie.innerRadius}%`, '70%'] : ['0%', '70%'], label: { ...series.label, show: style.pie.showLabel !== false, position: style.pie.labelPosition === 'inside' ? 'inside' : 'outside' } }
    if (series.type === 'scatter') return { ...series, symbol: style.scatter.symbol, symbolSize: style.scatter.symbolSize, itemStyle: { ...series.itemStyle, color, opacity: style.scatter.opacity } }
    if (series.type === 'radar') return { ...series, symbol: style.radar.showSymbol === false ? 'none' : 'circle', symbolSize: style.radar.symbolSize, lineStyle: { ...series.lineStyle, color, width: style.radar.width }, itemStyle: { ...series.itemStyle, color }, areaStyle: style.radar.area ? { ...series.areaStyle, color, opacity: style.radar.areaOpacity } : undefined }
    if (series.type === 'funnel') return { ...series, gap: style.funnel.gap, label: { ...series.label, show: style.funnel.showLabel !== false, position: style.funnel.labelPosition === 'inside' ? 'inside' : 'outside' } }
    if (series.type === 'heatmap') return { ...series, itemStyle: { ...series.itemStyle, borderColor: style.heatmap.borderColor, borderWidth: style.heatmap.borderWidth, borderRadius: style.heatmap.borderRadius } }
    if (series.type === 'gauge') return { ...series, progress: { ...series.progress, show: true, itemStyle: { ...series.progress?.itemStyle, color: style.gauge.progressColor || color } }, axisLine: { ...series.axisLine, lineStyle: { ...series.axisLine?.lineStyle, color: [[1, style.gauge.trackColor]] } }, pointer: { ...series.pointer, show: style.gauge.showPointer !== false }, detail: { ...series.detail, color: style.gauge.valueColor || undefined } }
    return series
  })
  return option
}
