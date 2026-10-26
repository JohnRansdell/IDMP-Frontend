import { resolveReportPeriod, reportPeriodQuery, normalizeAnalysisGranularity, serializeAnalysisFilters, shiftReportDate } from '../analysis/reportPeriod.js'

function firstIdentifier(source = {}) {
  return [
    source.analysisIndicatorId,
    source.indicatorId,
    source.indicatorCode,
    source.code
  ].map(value => String(value || '').trim()).find(Boolean) || ''
}

export function buildIndicatorAnalysisPeriodContext(period = '', backendQuery = {}) {
  const fixedStart = String(backendQuery.periodStart || '').trim()
  const fixedEnd = String(backendQuery.periodEnd || '').trim()
  if (['FIXED', 'INDEPENDENT'].includes(String(backendQuery.periodMode || '').toUpperCase()) && fixedStart && fixedEnd) {
    return {
      periodStart: fixedStart,
      periodEnd: fixedEnd,
      periodEndInclusive: true,
      granularity: String(backendQuery.granularity || 'MONTHLY').toUpperCase()
    }
  }

  const selected = (Array.isArray(period) ? period : [period])
    .map(value => String(value || ''))
    .filter(value => /^\d{4}-\d{2}$/.test(value))
    .sort()
  if (!selected.length) return {}
  const start = selected[0]
  const end = selected[selected.length - 1]
  const [endYear, endMonth] = end.split('-').map(Number)
  return {
    periodStart: `${start}-01`,
    periodEnd: new Date(Date.UTC(endYear, endMonth, 1)).toISOString().slice(0, 10),
    granularity: 'MONTHLY'
  }
}

export function buildIndicatorAnalysisRouteQuery(source = {}, context = {}) {
  const indicator = firstIdentifier(source)
  if (!indicator) return null
  const indicatorName = String(source.indicatorName || source.title || source.name || '').trim()
  const indicatorVersionId = String(source.analysisIndicatorVersionId || source.indicatorVersionId || '').trim()
  const periodStart = String(context.periodStart || '').trim()
  const rawEnd = String(context.periodEnd || '').trim()
  const periodEnd = rawEnd ? context.periodEndInclusive ? rawEnd : shiftReportDate(rawEnd, -1) : ''
  const granularity = String(context.granularity || '').trim().toUpperCase()
  const report = resolveReportPeriod([periodStart, periodEnd], granularity)
  return {
    indicator,
    ...(indicatorName ? { indicatorName } : {}),
    ...(indicatorVersionId ? { indicatorVersionId } : {}),
    ...serializeAnalysisFilters(context.filters || {}),
    ...(periodStart && periodEnd ? { ...reportPeriodQuery({ ...report, granularity }),
      trendStart: periodStart, trendEnd: periodEnd } : {}),
    ...(granularity ? { granularity: normalizeAnalysisGranularity(granularity) } : {})
  }
}
