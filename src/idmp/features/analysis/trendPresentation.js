import { IDMP_CHART_COLORS } from '../../charts/theme.js'
import { formatResultValue, hasResultDisplay, resultChartNumber, resultUnit } from '../shared/resultPresentation.js'
import { formatPeriodLabel } from './reportPeriod.js'
import { formatResultPeriod } from '../../utils/periodRange.js'

const isChartNumber = value => value !== null && value !== '' && Number.isFinite(Number(value))
const isCompleteDateRange = range => Array.isArray(range) && Boolean(range[0] && range[1])

export function formatTrendDisplay(value, { unit, display }) {
  const text = formatResultValue(value, { unit, percentRepresentation: 'points',
    display: display ? { ...display, multiplier: '1' } : undefined })
  if (text === '-' || resultUnit(unit) === '%') return text
  return `${text}${unit || ''}`
}

export function formatTrendPeriodLabel(item, granularity) {
  const start = String(item?.periodStart || '').slice(0, 10)
  const normalizedGranularity = String(granularity || '').toUpperCase()
  if (normalizedGranularity === 'STATIC') return '静态结果'
  if (normalizedGranularity === 'DAILY') return start || '-'
  if (normalizedGranularity === 'MONTHLY') return start.slice(0, 7) || '-'
  if (normalizedGranularity === 'YEARLY') return start.slice(0, 4) || '-'
  if (normalizedGranularity === 'QUARTERLY' && start) {
    const month = Number(start.slice(5, 7))
    return `${start.slice(0, 4)}-Q${Math.ceil(month / 3)}`
  }
  return formatResultPeriod(item?.periodStart, item?.periodEnd)
}

function createTrendFromBackendAnalysis(payload, { unit, display, granularity, range, sourceDefaultRange }) {
  const responseGranularity = String(payload?.granularity || granularity).toUpperCase()
  if (
    !payload?.dataAvailable ||
    !Array.isArray(payload.trend) ||
    !payload.trend.length ||
    responseGranularity !== granularity
  ) return null

  return {
    range: sourceDefaultRange
      ? `源数据可用范围：${formatPeriodLabel(range[0], range[1])}`
      : isCompleteDateRange(range)
      ? `展示所选范围：${formatPeriodLabel(range[0], range[1])}`
      : responseGranularity === 'YEARLY' ? '展示全部可用年度结果' : '展示全部可用周期结果',
    labels: payload.trend.map((item) => formatTrendPeriodLabel(item, responseGranularity)),
    actual: payload.trend.map((item) => resultChartNumber(item?.value, { unit, display })),
    display: payload.trend.map((item) => item.displayValue),
    outcomes: payload.trend.map((item) => item.outcomeStatus),
    peer: payload.trend.map(() => null)
  }
}

// Generate chart coordinates, labels and PDF rows once from the same result.
export function createAnalysisTrendPresentation({ analysis, profile, display, granularity, range = [], sourceDefaultRange = false }) {
  const trend = createTrendFromBackendAnalysis(analysis, { unit: profile.unit, display, granularity, range, sourceDefaultRange })
    || { labels: [], actual: [], peer: [] }
  const hasPeer = Boolean(trend.peer?.some(isChartNumber))
  const formatValue = value => formatTrendDisplay(value, { unit: profile.unit, display })
  const rows = trend.labels.map((label, index) => ({
    label,
    actual: trend.actual[index] ?? '-',
    peer: trend.peer[index] ?? '-',
    actualDisplay: trend.outcomes?.[index] === 'NOT_CALCULABLE' ? '无法计算'
      : hasResultDisplay(trend.display?.[index]) ? trend.display[index] : formatValue(trend.actual[index]),
    peerDisplay: formatValue(trend.peer[index])
  }))
  const actualValues = trend.actual
  const actualSeries = {
    name: '本院实际值',
    type: 'line',
    // A single point needs no reveal animation, including after a table-triggered resize.
    animation: actualValues.length > 1,
    smooth: actualValues.length > 1,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: actualValues.length <= 1 ? 10 : 7,
    lineStyle: { width: 3 },
    itemStyle: { borderWidth: 2 },
    label: actualValues.length <= 1
      ? { show: true, position: 'top', formatter: ({ value }) => formatValue(value) }
      : { show: false },
    data: actualValues
  }
  if (isChartNumber(profile.markLineValue)) {
    actualSeries.markLine = {
      silent: true,
      symbol: 'none',
      // ECharts otherwise rounds small raw-ratio targets (e.g. 0.003) to zero.
      precision: -1,
      label: { formatter: profile.targetLabel, color: '#b4232c', position: 'insideEndTop' },
      lineStyle: { color: '#b4232c', type: 'dashed', width: 1 },
      data: [{ yAxis: Number(profile.markLineValue) }]
    }
  }
  const series = [actualSeries]
  if (hasPeer) series.push({
    name: '同级医院均值',
    type: 'line',
    smooth: true,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { width: 2, type: 'dashed' },
    data: trend.peer
  })
  const option = {
    animationDuration: 450,
    color: [IDMP_CHART_COLORS[0], IDMP_CHART_COLORS[4]],
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => formatValue(value)
    },
    legend: {
      top: 2,
      right: 8,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { fontSize: 12 },
      data: series.map((item) => item.name)
    },
    // Measure formatted ticks on each render/resize instead of assuming a fixed label width.
    grid: { top: 64, left: 16, right: 26, bottom: 16, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.labels,
      axisTick: { show: false },
      axisLabel: { margin: 12 }
    },
    yAxis: {
      type: 'value',
      min: ({ min }) => Math.min(0, min, profile.markLineValue ?? 0),
      max: isChartNumber(profile.markLineValue)
        ? ({ max }) => Math.max(max, profile.markLineValue) : profile.yAxisMax,
      name: profile.unit ? `单位：${profile.unit}` : '指标值',
      nameTextStyle: { align: 'left', padding: [0, 0, 4, 0] },
      axisLabel: { formatter: `{value}${profile.unit || ''}` },
      splitLine: { lineStyle: { type: 'dashed' } }
    },
    series
  }
  const notCalculableCount = trend.outcomes?.filter(outcome => outcome === 'NOT_CALCULABLE').length || 0
  return { trend, hasPeer, rows, option, notCalculableCount }
}
