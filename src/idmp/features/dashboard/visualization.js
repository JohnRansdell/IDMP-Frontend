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

// MOM/YOY stay numeric in the binding pipeline. This presentation formatter
// gives percent KPIs their explicit comparison-unit suffix without changing
// the underlying comparison value.
export function formatKpiComparison(value, unit = '') {
  if (value === null || value === undefined || value === '') return '—'
  const text = String(value).trim()
  const numeric = Number(text.replace(/%$/, ''))
  if (!Number.isFinite(numeric)) return text
  const visible = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Math.abs(numeric))
  const sign = numeric > 0 ? '+' : numeric < 0 ? '-' : ''
  return `${sign}${visible}${unit === '%' ? '%' : ''}`
}

export function createKpiData(source) {
  const comparisons = {}
  if (source.mom !== undefined) comparisons.mom = source.mom
  if (source.yoy !== undefined) comparisons.yoy = source.yoy
  if (source.trendDirection !== undefined || source.mom !== undefined || source.yoy !== undefined) comparisons.trendDirection = normalizeTrendDirection(source.trendDirection, source.change)
  return {
    code: source.code,
    analysisIndicatorId: source.analysisIndicatorId || source.indicatorId || '',
    analysisIndicatorVersionId: source.analysisIndicatorVersionId || source.indicatorVersionId || '',
    analysisEnabled: source.analysisEnabled !== false,
    title: source.name,
    value: formatIndicatorValue(source),
    unit: source.unit || '',
    ...comparisons,
    change: source.change,
    target: source.target,
    status: source.status
  }
}

export function normalizeTrendDirection(direction, legacyChange = '') {
  if (['up', 'down', 'flat'].includes(direction)) return direction
  if (String(legacyChange).includes('↑')) return 'up'
  if (String(legacyChange).includes('↓')) return 'down'
  return 'flat'
}

export function createPublishedIndicatorSources(indicators = [], publishedVersions = []) {
  const directory = Array.isArray(indicators) ? indicators : []
  const versions = Array.isArray(publishedVersions) ? publishedVersions : []
  const indicatorsById = new Map(directory.map((item) => [toSourceString(item?.id || item?.indicatorId), item]))
  const indicatorsByCode = new Map(directory.map((item) => [toSourceString(item?.code), item]))
  const seenIndicators = new Set()

  return versions.map((version) => {
    const nestedIndicator = version?.indicator || {}
    const versionIndicatorId = toSourceString(version?.indicatorId || nestedIndicator.id)
    const versionIndicatorCode = toSourceString(version?.indicatorCode || version?.code || nestedIndicator.code)
    const indicator = indicatorsById.get(versionIndicatorId) || indicatorsByCode.get(versionIndicatorCode) || nestedIndicator
    const indicatorId = toSourceString(indicator?.id || indicator?.indicatorId || versionIndicatorId)
    const indicatorCode = toSourceString(indicator?.code || versionIndicatorCode)
    const versionId = toSourceString(version?.id || version?.versionId || version?.indicatorVersionId)
    const identity = indicatorId || indicatorCode
    if (!identity || !versionId || seenIndicators.has(identity)) return null
    seenIndicators.add(identity)

    return {
      code: `catalog-indicator-${identity}`,
      name: indicator?.name || version?.indicatorName || version?.name || indicatorCode || '未命名指标',
      category: indicator?.categoryName || indicator?.category || nestedIndicator.categoryName || nestedIndicator.category || '指标目录',
      unit: indicator?.unit || indicator?.displayUnit || nestedIndicator.unit || nestedIndicator.displayUnit || version?.unit || version?.displayUnit || '',
      currentValue: null,
      change: '暂无同比数据',
      target: '来源：已发布指标',
      status: 'info',
      origin: 'indicator-catalog',
      originLabel: '已发布指标',
      indicatorId,
      indicatorCode,
      analysisIndicatorId: indicatorId || indicatorCode,
      analysisIndicatorVersionId: versionId,
      analysisEnabled: true,
      trendData: [],
      trendLabels: [],
      departmentData: [],
      pieData: []
    }
  }).filter(Boolean)
}

export function applyIndicatorAnalysisToSource(source, payload = {}) {
  if (!source) return source
  const comparisons = Array.isArray(payload?.dimensionComparison) ? payload.dimensionComparison : []
  const overview = comparisons.find(isHospitalOverview) || payload?.overview || null
  const unit = source.unit || payload?.unit || payload?.displayUnit || overview?.unit || overview?.displayUnit || ''
  const hasData = Boolean(payload?.dataAvailable && overview)
  const trend = payload?.dataAvailable && Array.isArray(payload?.trend) ? payload.trend : []
  const departmentData = comparisons
    .filter((item) => item?.dimensions?.out_dept_code || item?.dimensions?.out_dept_id)
    .map((item) => ({
      name: item.dimensions?.out_dept_name || item.dimensions?.out_dept_code || item.dimensions?.out_dept_id,
      value: normalizeAnalysisNumber(item?.value, unit)
    }))
    .filter((item) => item.name && item.value !== null)
  const bindingRows = payload?.dataAvailable
    ? comparisons.map((item) => ({
      ...Object.fromEntries(Object.entries(isRecord(item?.dimensions) ? item.dimensions : {})
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))),
      value: normalizeAnalysisNumber(item?.value, unit)
    })).filter((row) => row.value !== null)
    : []

  return {
    ...source,
    unit,
    currentValue: hasData ? resolveAnalysisDisplayValue(overview, unit) : null,
    change: hasData ? '当前正式结果' : '暂无正式结果',
    status: hasData ? 'success' : 'info',
    origin: 'indicator-catalog',
    originLabel: '已发布指标',
    trendLabels: trend.map((item) => formatAnalysisPeriod(item, payload?.granularity)),
    trendData: trend.map((item) => normalizeAnalysisNumber(item?.value, unit)),
    departmentData,
    pieData: departmentData.map((item) => ({ ...item })),
    bindingRows
  }
}

export function getVisualizationTitle(sourceName, visualType) {
  if (visualType === 'bar') return `${sourceName}科室对比`
  if (visualType === 'line') return `${sourceName}趋势`
  if (visualType === 'pie') return `${sourceName}构成`
  if (visualType === 'table') return `${sourceName}数据明细`
  if (visualType === 'gauge') return `${sourceName}仪表盘`
  if (visualType === 'radar') return `${sourceName}雷达分析`
  if (visualType === 'funnel') return `${sourceName}漏斗分析`
  if (visualType === 'scatter') return `${sourceName}散点分析`
  if (visualType === 'heatmap') return `${sourceName}热力分析`
  if (visualType === 'map') return `${sourceName}演示区域分布`
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
  if (widget.chartKind === 'gauge') return createVirtualGaugeOption(widget, presetOptions)
  if (widget.chartKind === 'radar') return createVirtualRadarOption(widget, presetOptions)
  if (widget.chartKind === 'funnel') return createVirtualFunnelOption(widget, presetOptions)
  if (widget.chartKind === 'scatter') return createVirtualScatterOption(widget, presetOptions)
  if (widget.chartKind === 'heatmap') return createVirtualHeatmapOption(widget, presetOptions)
  if (widget.chartKind === 'map') return createVirtualMapOption(widget, presetOptions)
  return createVirtualLineOption(widget, presetOptions)
}

function createVirtualGaugeOption(widget, options) { const source = getWidgetSource(widget, options); return { series: [{ type: 'gauge', data: [{ value: Number(source.currentValue) || 0, name: source.name || '指标值' }] }] } }
function createVirtualRadarOption(widget, options) { const source = getWidgetSource(widget, options), rows = source.departmentData || []; return { radar: { indicator: rows.map(row => ({ name: row.name, max: Math.max(...rows.map(item => Number(item.value) || 0), 1) })) }, series: [{ type: 'radar', data: [{ value: rows.map(row => Number(row.value) || 0), name: source.name || '指标值' }] }] } }
function createVirtualFunnelOption(widget, options) { const source = getWidgetSource(widget, options); return { series: [{ type: 'funnel', data: (source.pieData || source.departmentData || []).map(copyChartDataItem) }] } }
function createVirtualScatterOption(widget, options) { const source = getWidgetSource(widget, options); return { xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: [{ type: 'scatter', data: (source.trendData || []).map((value, index) => [index + 1, Number(value) || 0]) }] } }
function createVirtualHeatmapOption(widget, options) { const source = getWidgetSource(widget, options), rows = source.departmentData || []; return { xAxis: { type: 'category', data: rows.map(row => row.name) }, yAxis: { type: 'category', data: ['指标值'] }, visualMap: { min: 0, max: Math.max(...rows.map(row => Number(row.value) || 0), 1), calculable: true }, series: [{ type: 'heatmap', data: rows.map((row, index) => [index, 0, Number(row.value) || 0]) }] } }
// Geo adapter boundary: this intentionally uses named demo regions until a
// sanctioned GeoJSON source is supplied. It is not presented as hospital GIS.
function createVirtualMapOption(widget, options) { const source = getWidgetSource(widget, options), rows = source.departmentData || []; return { tooltip: { trigger: 'axis' }, grid: { top: 22, left: 62, right: 22, bottom: 30 }, xAxis: { type: 'value' }, yAxis: { type: 'category', inverse: true, data: rows.map(row => row.name) }, series: [{ name: '演示区域分布', type: 'bar', data: rows.map(row => Number(row.value) || 0), itemStyle: { color: '#4f8583', borderRadius: [0, 4, 4, 0] } }] } }

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

function toSourceString(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function isHospitalOverview(item) {
  const dimensions = item?.dimensions || {}
  return Boolean(dimensions.hospital_code || dimensions.hospital_id) &&
    !dimensions.out_dept_code && !dimensions.out_dept_id &&
    !dimensions.department_code && !dimensions.department_id
}

function resolveAnalysisDisplayValue(item, unit) {
  if (item?.displayValue !== undefined && item?.displayValue !== null && item.displayValue !== '') {
    return item.displayValue
  }
  const value = normalizeAnalysisNumber(item?.value, unit)
  if (value === null) return null
  return unit === '%' ? `${value.toFixed(2)}%` : value
}

function normalizeAnalysisNumber(value, unit) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return unit === '%' ? Number((number * 100).toFixed(2)) : number
}

function formatAnalysisPeriod(item, granularity) {
  const start = toSourceString(item?.periodStart).slice(0, 10)
  const normalizedGranularity = toSourceString(granularity).toUpperCase()
  if (normalizedGranularity === 'MONTHLY') return start.slice(0, 7)
  if (normalizedGranularity === 'YEARLY') return start.slice(0, 4)
  if (normalizedGranularity === 'QUARTERLY' && start) {
    return `${start.slice(0, 4)}-Q${Math.ceil(Number(start.slice(5, 7)) / 3)}`
  }
  return start || toSourceString(item?.periodEnd).slice(0, 10)
}
