import { IDMP_CHART_COLORS } from '../../charts/theme.js'

export function formatIndicatorValue(source) {
  if (!source) return ''
  if (source.currentValue === null || source.currentValue === undefined || source.currentValue === '') return '暂无数据'
  if (typeof source.currentValue === 'string') return source.currentValue
  return `${source.currentValue}${source.unit || ''}`
}

export function createKpiData(source) {
  return {
    code: source.code,
    title: source.name,
    value: formatIndicatorValue(source),
    change: source.change,
    target: source.target,
    status: source.status
  }
}

export function getVisualizationTitle(sourceName, visualType) {
  if (visualType === 'bar') return `${sourceName}科室对比`
  if (visualType === 'line') return `${sourceName}趋势`
  if (visualType === 'pie') return `${sourceName}构成`
  return sourceName
}

export function createDashboardChartOption(widget, presetOptions = {}) {
  if (widget.preset === 'trend') {
    if (widget.chartKind !== 'bar') return presetOptions.trendOption
    const option = presetOptions.trendOption || {}
    return {
      ...option,
      xAxis: {
        ...option.xAxis,
        boundaryGap: true,
        data: option.xAxis?.data || []
      },
      series: (option.series || []).map((series) => ({
        ...series,
        type: 'bar',
        data: series.data || []
      }))
    }
  }
  if (widget.preset === 'rate') {
    if (widget.chartKind !== 'bar') return presetOptions.rateOption
    const option = presetOptions.rateOption || {}
    const sourceSeries = option.series?.[0] || {}
    const rows = sourceSeries.data || []
    return {
      color: option.color || IDMP_CHART_COLORS,
      tooltip: { trigger: 'axis' },
      grid: { top: 24, left: 42, right: 20, bottom: 34 },
      xAxis: { type: 'category', data: rows.map((item) => item.name) },
      yAxis: { type: 'value' },
      series: [{
        name: sourceSeries.name || '指标值',
        type: 'bar',
        barWidth: 22,
        data: rows.map((item) => item.value)
      }]
    }
  }
  if (widget.chartKind === 'bar') return createVirtualBarOption(widget, presetOptions)
  if (widget.chartKind === 'pie') return createVirtualPieOption(widget, presetOptions)
  return createVirtualLineOption(widget, presetOptions)
}

function createVirtualBarOption(widget, presetOptions) {
  const source = getWidgetSource(widget, presetOptions)
  const rows = source.departmentData || []
  return {
    color: [IDMP_CHART_COLORS[0]],
    tooltip: { trigger: 'axis' },
    grid: { top: 24, left: 42, right: 20, bottom: 34 },
    xAxis: { type: 'category', data: rows.map((item) => item.name) },
    yAxis: { type: 'value' },
    series: [{ name: source.name, type: 'bar', barWidth: 22, data: rows.map((item) => item.value) }]
  }
}

function createVirtualLineOption(widget, presetOptions) {
  const source = getWidgetSource(widget, presetOptions)
  return {
    color: [IDMP_CHART_COLORS[1]],
    tooltip: { trigger: 'axis' },
    grid: { top: 24, left: 42, right: 20, bottom: 34 },
    xAxis: { type: 'category', boundaryGap: false, data: source.trendLabels || [] },
    yAxis: { type: 'value' },
    series: [{ name: source.name, type: 'line', smooth: true, symbolSize: 5, data: source.trendData || [] }]
  }
}

function createVirtualPieOption(widget, presetOptions) {
  const source = getWidgetSource(widget, presetOptions)
  return {
    color: IDMP_CHART_COLORS,
    tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
    legend: { bottom: 2, left: 'center', itemWidth: 18, itemHeight: 10 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '43%'],
        label: { fontSize: 12, formatter: '{b}\n{d}%' },
        data: source.pieData || []
      }
    ]
  }
}

function getWidgetSource(widget, presetOptions) {
  return presetOptions.getSource?.(widget.sourceCode) || {}
}
