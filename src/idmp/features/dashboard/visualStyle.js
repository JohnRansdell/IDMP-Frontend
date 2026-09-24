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

// Presets are intentionally write-only conveniences. They expand into the
// established style contract, so Viewer, copy, templates and persistence never
// need a parallel "preset runtime".
export const WIDGET_STYLE_PRESETS = Object.freeze({
  clinical: Object.freeze({ label: '临床白', style: { background: '#ffffff', borderColor: '#d8e2e7', borderWidth: 1, borderRadius: 10, shadow: 'sm', palettePreset: 'medicalBlue', colors: [], kpi: { valueColor: '#153b5d', titleColor: '#52636c', trendColor: '' } } }),
  blueTeal: Object.freeze({ label: '蓝青医疗', style: { background: '#f2f9fb', backgroundGradient: 'linear-gradient(135deg,#f8fcff 0%,#edf9f7 100%)', borderColor: '#b8d9df', borderWidth: 1, borderRadius: 12, shadow: 'sm', palettePreset: 'blueTeal', colors: [], kpi: { valueColor: '#12616d', titleColor: '#45656c', trendColor: '' } } }),
  mistBlue: Object.freeze({ label: '清透蓝', style: { background: '#f4f8ff', backgroundGradient: 'linear-gradient(135deg,#f9fbff 0%,#e9f3ff 100%)', borderColor: '#c8dcf2', borderWidth: 1, borderRadius: 12, shadow: 'sm', palettePreset: 'medicalBlue', colors: [], kpi: { valueColor: '#1d5d98', titleColor: '#526b85', trendColor: '' } } }),
  mint: Object.freeze({ label: '薄荷绿', style: { background: '#f2faf6', backgroundGradient: 'linear-gradient(135deg,#f8fdfb 0%,#e8f6ef 100%)', borderColor: '#bfded0', borderWidth: 1, borderRadius: 12, shadow: 'sm', palettePreset: 'green', colors: [], kpi: { valueColor: '#286b53', titleColor: '#55766a', trendColor: '' } } }),
  warm: Object.freeze({ label: '暖橙', style: { background: '#fff9f3', backgroundGradient: 'linear-gradient(135deg,#fffdf9 0%,#fff2e3 100%)', borderColor: '#efd4b8', borderWidth: 1, borderRadius: 12, shadow: 'sm', palettePreset: 'warm', colors: [], kpi: { valueColor: '#9b5636', titleColor: '#796253', trendColor: '' } } }),
  violet: Object.freeze({ label: '柔和紫', style: { background: '#faf8ff', backgroundGradient: 'linear-gradient(135deg,#fdfbff 0%,#f0ecff 100%)', borderColor: '#d9cff2', borderWidth: 1, borderRadius: 12, shadow: 'sm', palettePreset: 'colorful', colors: [], kpi: { valueColor: '#65548c', titleColor: '#6c6480', trendColor: '' } } })
})

export function applyWidgetStylePreset(style = {}, presetId = 'clinical') {
  const preset = WIDGET_STYLE_PRESETS[presetId]
  if (!preset) return { ...record(style) }
  const current = record(style)
  const next = { ...current, ...preset.style, kpi: { ...record(current.kpi), ...preset.style.kpi } }
  // A preset is a coherent surface selection, not an accidental image carryover.
  delete next.backgroundAssetKey
  delete next.backgroundImage
  delete next.backgroundOverlay
  delete next.backgroundSize
  delete next.backgroundPosition
  return next
}

export function resolveWidgetBackgroundMode(style = {}) {
  if (style.backgroundMode === 'image') return 'image'
  if (style.backgroundAssetKey || style.backgroundImage) return 'image'
  if (style.backgroundGradient) return 'gradient'
  if (style.background) return 'solid'
  return 'none'
}

export function applyWidgetBackgroundMode(style = {}, mode = 'none') {
  const next = { ...record(style) }
  if (mode === 'solid') { delete next.backgroundMode; delete next.backgroundGradient; delete next.backgroundAssetKey; delete next.backgroundImage; delete next.backgroundOverlay; delete next.backgroundSize; delete next.backgroundPosition; return { ...next, background: next.background || '#ffffff' } }
  if (mode === 'gradient') { delete next.backgroundMode; delete next.backgroundAssetKey; delete next.backgroundImage; delete next.backgroundOverlay; delete next.backgroundSize; delete next.backgroundPosition; return { ...next, backgroundGradient: next.backgroundGradient || 'linear-gradient(135deg,#f8fcff 0%,#edf9f7 100%)' } }
  if (mode === 'image') { delete next.backgroundGradient; return { ...next, backgroundMode: 'image' } }
  delete next.backgroundMode; delete next.background; delete next.backgroundGradient; delete next.backgroundAssetKey; delete next.backgroundImage; delete next.backgroundOverlay; delete next.backgroundSize; delete next.backgroundPosition
  return next
}

export function chartPaletteLabels(widget = {}, count = 1) {
  const kind = widget.chartKind || widget.visualType || ''
  const names = Array.isArray(widget.config?.series) ? widget.config.series.map(item => item?.name).filter(Boolean) : []
  const base = kind === 'pie' ? '分类颜色' : kind === 'funnel' ? '阶段颜色' : kind === 'heatmap' ? '数值色阶' : kind === 'map' ? '区域色阶' : kind === 'scatter' ? '散点颜色' : kind === 'radar' ? '雷达配色' : kind === 'line' ? '折线颜色' : kind === 'bar' ? '柱形颜色' : '数据颜色'
  return Array.from({ length: count }, (_, index) => names[index] || (count === 1 ? base : `${base} ${index + 1}`))
}

const defaults = Object.freeze({
  palettePreset: 'default', colors: [],
  common: { showLegend: true, legendPosition: 'top', showAxisLine: true, showGridLine: true, xAxisLabelRotation: 'auto' },
  bar: { opacity: 1, borderRadius: 3, width: 'auto', orientation: 'vertical' },
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
    common: merge('common'), bar: { ...merge('bar'), orientation: ['vertical', 'horizontal'].includes(source.bar?.orientation) ? source.bar.orientation : 'vertical' }, line: merge('line'), pie: merge('pie'), scatter: merge('scatter'), radar: merge('radar'), funnel: merge('funnel'), heatmap: merge('heatmap'), gauge: merge('gauge'), map: merge('map'), kpi: merge('kpi'), table: merge('table')
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

export const CHART_PRESENTATION_PRESETS = Object.freeze({
  bar: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准柱形', style: { bar: { width: 'auto', borderRadius: 3, opacity: 1, orientation: 'vertical' }, common: { showLegend: true, showGridLine: true } } }),
    Object.freeze({ id: 'emphasis', label: '强调柱形', style: { bar: { width: 'wide', borderRadius: 12, opacity: 1, orientation: 'vertical' }, common: { showLegend: true, showGridLine: false } } }),
    Object.freeze({ id: 'ranking', label: '排名条', style: { bar: { width: 'standard', borderRadius: 7, opacity: 1, orientation: 'horizontal' }, common: { showLegend: false, showGridLine: true } } }),
    Object.freeze({ id: 'compact', label: '紧凑对比', style: { bar: { width: 'narrow', borderRadius: 2, opacity: .86, orientation: 'vertical' }, common: { showLegend: false, showGridLine: true } } })
  ]),
  line: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准趋势', style: { line: { width: 2.5, type: 'solid', smooth: false, showSymbol: false, area: false } } }),
    Object.freeze({ id: 'smooth', label: '平滑趋势', style: { line: { width: 3, type: 'solid', smooth: true, showSymbol: true, symbol: 'circle', symbolSize: 6, area: false } } }),
    Object.freeze({ id: 'area', label: '面积趋势', style: { line: { width: 3, type: 'solid', smooth: true, showSymbol: false, area: true, areaOpacity: .16 }, common: { showGridLine: true } } }),
    Object.freeze({ id: 'minimal', label: '极简趋势', style: { line: { width: 3, type: 'solid', smooth: true, showSymbol: false, area: false }, common: { showLegend: false, showGridLine: false, showAxisLine: true } } })
  ]),
  pie: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准饼图', style: { pie: { donut: false, innerRadius: 48, showLabel: true, labelPosition: 'outside' }, common: { showLegend: true } } }),
    Object.freeze({ id: 'donut-summary', label: '环形摘要', style: { pie: { donut: true, innerRadius: 55, showLabel: true, labelPosition: 'outside' }, common: { showLegend: true } } }),
    Object.freeze({ id: 'minimal-donut', label: '极简环形', style: { pie: { donut: true, innerRadius: 70, showLabel: false, labelPosition: 'outside' }, common: { showLegend: true } } }),
    Object.freeze({ id: 'label-analysis', label: '标签分析', style: { pie: { donut: false, innerRadius: 48, showLabel: true, labelPosition: 'outside' }, common: { showLegend: true } } })
  ]),
  scatter: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准散点', style: { scatter: { symbol: 'circle', symbolSize: 8, opacity: 1 }, common: { showLegend: true, showGridLine: true } } }),
    Object.freeze({ id: 'emphasis', label: '强调散点', style: { scatter: { symbol: 'diamond', symbolSize: 12, opacity: 1 }, common: { showLegend: true, showGridLine: false } } }),
    Object.freeze({ id: 'minimal', label: '极简散点', style: { scatter: { symbol: 'circle', symbolSize: 6, opacity: .72 }, common: { showLegend: false, showGridLine: false } } })
  ]),
  radar: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准雷达', style: { radar: { width: 2, showSymbol: true, symbolSize: 5, area: false, areaOpacity: .12 }, common: { showLegend: true } } }),
    Object.freeze({ id: 'filled', label: '填充雷达', style: { radar: { width: 2.5, showSymbol: true, symbolSize: 5, area: true, areaOpacity: .25 }, common: { showLegend: true } } }),
    Object.freeze({ id: 'comparison', label: '对比雷达', style: { radar: { width: 3, showSymbol: true, symbolSize: 7, area: true, areaOpacity: .1 }, common: { showLegend: true } } })
  ]),
  funnel: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准漏斗', style: { funnel: { gap: 2, showLabel: true, labelPosition: 'outside' }, common: { showLegend: true } } }),
    Object.freeze({ id: 'compact', label: '紧凑阶段', style: { funnel: { gap: 0, showLabel: false, labelPosition: 'inside' }, common: { showLegend: false } } }),
    Object.freeze({ id: 'label-analysis', label: '标签分析', style: { funnel: { gap: 4, showLabel: true, labelPosition: 'outside' }, common: { showLegend: true } } })
  ]),
  gauge: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准仪表', style: { gauge: { progressColor: '', trackColor: '#e5ecee', showPointer: true, valueColor: '' } } }),
    Object.freeze({ id: 'progress', label: '强调进度', style: { gauge: { progressColor: '#1261a6', trackColor: '#dce8ef', showPointer: true, valueColor: '#153b5d' } } }),
    Object.freeze({ id: 'minimal', label: '极简仪表', style: { gauge: { progressColor: '#4f8583', trackColor: '#edf2f2', showPointer: false, valueColor: '#25343b' } } })
  ]),
  heatmap: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准热力', style: { heatmap: { colorScale: 'blue', borderColor: '#ffffff', borderWidth: 1 } } }),
    Object.freeze({ id: 'soft', label: '柔和热力', style: { heatmap: { colorScale: 'blueTeal', borderColor: '#f7fbfb', borderWidth: 1 } } }),
    Object.freeze({ id: 'contrast', label: '高对比热力', style: { heatmap: { colorScale: 'coolWarm', borderColor: '#ffffff', borderWidth: 2 } } })
  ]),
  map: Object.freeze([
    Object.freeze({ id: 'standard', label: '标准区域', style: { map: { lowColor: '#dceeff', highColor: '#1261a6', borderColor: '#ffffff', borderWidth: 1, showLabel: true } } }),
    Object.freeze({ id: 'soft', label: '柔和区域', style: { map: { lowColor: '#e8f7f6', highColor: '#4f9f9e', borderColor: '#f8fcfc', borderWidth: 1, showLabel: true } } }),
    Object.freeze({ id: 'contrast', label: '高对比区域', style: { map: { lowColor: '#dceeff', highColor: '#003b72', borderColor: '#ffffff', borderWidth: 2, showLabel: true } } })
  ])
})

export function chartPresentationPresets(kind) { return CHART_PRESENTATION_PRESETS[kind] || [] }
export function applyChartPresentationPreset(widget = {}, presetId = '') {
  const kind = widget.chartKind || widget.visualType
  const preset = chartPresentationPresets(kind).find(item => item.id === presetId)
  if (!preset) return { ...record(widget.config?.style) }
  const current = record(widget.config?.style)
  return { ...current, ...preset.style, bar: { ...record(current.bar), ...record(preset.style.bar) }, line: { ...record(current.line), ...record(preset.style.line) }, pie: { ...record(current.pie), ...record(preset.style.pie) }, scatter: { ...record(current.scatter), ...record(preset.style.scatter) }, radar: { ...record(current.radar), ...record(preset.style.radar) }, funnel: { ...record(current.funnel), ...record(preset.style.funnel) }, gauge: { ...record(current.gauge), ...record(preset.style.gauge) }, heatmap: { ...record(current.heatmap), ...record(preset.style.heatmap) }, map: { ...record(current.map), ...record(preset.style.map) }, common: { ...record(current.common), ...record(preset.style.common) } }
}

export function applyWidgetVisualStyle(widget, rawOption = {}) {
  const style = resolveWidgetVisualStyle(widget)
  const palette = widgetPalette(widget)
  const common = style.common
  const axis = value => ({ ...value, axisLine: { ...value.axisLine, show: common.showAxisLine !== false }, splitLine: { ...value.splitLine, show: common.showGridLine !== false } })
  const applyAxis = axisValue => Array.isArray(axisValue) ? axisValue.map(axis) : axisValue ? axis(axisValue) : axisValue
  const kind = widget.chartKind || widget.visualType || ''
  const rotation = resolveXAxisRotation(rawOption.xAxis, common.xAxisLabelRotation)
  const rotateXAxis = value => Array.isArray(value)
    ? value.map(axisValue => rotateXAxis(axisValue))
    : value ? { ...value, axisLabel: { ...value.axisLabel, rotate: rotation } } : value
  let option = {
    ...rawOption,
    color: palette,
    legend: rawOption.legend ? { ...rawOption.legend, show: common.showLegend !== false, ...(common.legendPosition === 'bottom' ? { top: undefined, bottom: 0 } : { bottom: undefined, top: 0 }) } : rawOption.legend,
    xAxis: rotateXAxis(applyAxis(rawOption.xAxis)),
    yAxis: applyAxis(rawOption.yAxis)
  }
  if (kind === 'bar' && style.bar.orientation === 'horizontal' && !Array.isArray(rawOption.yAxis)) {
    const category = rawOption.xAxis
    const value = rawOption.yAxis
    if (category?.type === 'category' && value?.type === 'value') {
      option = { ...option, grid: { ...option.grid, left: Math.max(Number(option.grid?.left) || 42, 82) }, xAxis: { ...value, type: 'value' }, yAxis: { ...category, type: 'category', inverse: true, axisLabel: { ...category.axisLabel, rotate: 0 } } }
    }
  }
  if (rotation) option.grid = { ...rawOption.grid, bottom: Math.max(Number(rawOption.grid?.bottom) || 28, rotation >= 60 ? 70 : 54), containLabel: true }
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
      return { ...series, ...(width ? { barWidth: width } : {}), label: bar.orientation === 'horizontal' ? { ...series.label, show: true, position: 'right' } : series.label, itemStyle: { ...series.itemStyle, color: isMap ? undefined : color, opacity: bar.opacity, borderRadius: isMap || bar.orientation === 'horizontal' ? [0, bar.borderRadius, bar.borderRadius, 0] : [bar.borderRadius, bar.borderRadius, 0, 0], ...(isMap ? { borderColor: style.map.borderColor, borderWidth: style.map.borderWidth } : {}) } }
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

// Keep auto deterministic and data-driven: short, sparse categories remain
// horizontal while dense or long labels get enough room without truncation.
function resolveXAxisRotation(axis, value) {
  if ([0, 30, 45, 60, 90].includes(Number(value))) return Number(value)
  const source = Array.isArray(axis) ? axis[0] : axis
  const labels = Array.isArray(source?.data) ? source.data.map(item => String(item ?? '')) : []
  const longest = Math.max(0, ...labels.map(item => item.length))
  if (labels.length >= 10 || longest >= 12) return 60
  if (labels.length >= 7 || longest >= 8) return 45
  return 0
}
