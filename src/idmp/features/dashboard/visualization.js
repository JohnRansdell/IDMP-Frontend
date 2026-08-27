import { IDMP_CHART_COLORS } from '../../charts/theme.js'

const DASHBOARD_DRILL_LEVELS = new Set([
  'HOSPITAL',
  'OUT_DEPT',
  'DEPARTMENT',
  'MEDICAL_GROUP',
  'ATTENDING_DOCTOR',
  'DOCTOR'
])
const DASHBOARD_DRILL_PARENT_KEYS = [
  'HOSPITAL_CODE',
  'OUT_DEPT_CODE',
  'MEDICAL_GROUP_CODE'
]
const REQUIRED_DASHBOARD_DRILL_PARENT_KEYS = ['HOSPITAL_CODE', 'OUT_DEPT_CODE']

export function normalizeDashboardDrillTarget(value, source = 'live') {
  if (!isRecord(value) || !isRecord(value.parentKeys)) return null

  const target = {
    resultId: toDrillString(value.resultId),
    indicatorId: toDrillString(value.indicatorId),
    indicatorCode: toDrillString(value.indicatorCode),
    indicatorName: toDrillString(value.indicatorName),
    indicatorVersionId: toDrillString(value.indicatorVersionId),
    currentLevel: toDrillString(value.currentLevel).toUpperCase(),
    parentKeys: Object.fromEntries(
      DASHBOARD_DRILL_PARENT_KEYS
        .map((key) => [key, toDrillString(value.parentKeys[key])])
        .filter(([, item]) => item)
    )
  }
  if (
    !target.resultId ||
    !target.indicatorId ||
    !target.indicatorCode ||
    !target.indicatorName ||
    !target.indicatorVersionId ||
    !DASHBOARD_DRILL_LEVELS.has(target.currentLevel) ||
    REQUIRED_DASHBOARD_DRILL_PARENT_KEYS.some((key) => !target.parentKeys[key])
  ) return null

  const snapshotId = toDrillString(value.snapshotId)
  const period = toDrillString(value.period)
  if (snapshotId) target.snapshotId = snapshotId
  if (period) target.period = period
  if (source === 'mock') target.source = 'mock'
  return target
}

export function resolveDashboardChartDrillTarget(params, source = 'live') {
  return normalizeDashboardDrillTarget(
    isRecord(params?.data) ? params.data.drillTarget : null,
    source
  )
}

export function buildDashboardDrillRouteQuery(value) {
  const target = normalizeDashboardDrillTarget(value, value?.source)
  if (!target) return null

  return {
    resultId: target.resultId,
    indicator: target.indicatorCode,
    indicatorId: target.indicatorId,
    indicatorName: target.indicatorName,
    indicatorVersionId: target.indicatorVersionId,
    currentLevel: target.currentLevel,
    ...target.parentKeys,
    ...(target.snapshotId ? { snapshotId: target.snapshotId } : {}),
    ...(target.period ? { period: target.period } : {}),
    ...(target.source === 'mock' ? { source: 'mock' } : {}),
    from: 'dashboard'
  }
}

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
        data: rows.map(copyChartDataItem)
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
    series: [{ name: source.name, type: 'bar', barWidth: 22, data: rows.map(copyChartDataItem) }]
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

function copyChartDataItem(item) {
  return isRecord(item) ? { ...item } : item
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toDrillString(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
}
