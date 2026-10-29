import { resolveReportPeriod, serializeAnalysisFilters, shiftReportDate } from './reportPeriod.js'

// The formal API takes inclusive dates; the instant API takes an exclusive end timestamp.
export function buildReportSummaryRequest({ indicatorId, versionId, range, granularity, filters = {}, parameters }) {
  const period = resolveReportPeriod(range, granularity, { parameters, filters })
  if (!versionId || (period.summaryGranularity !== 'STATIC' && !period.range.length)) return null
  const [periodStart = '', periodEnd = ''] = period.range
  if (period.mode === 'FORMAL') {
    if (!indicatorId) return null
    return {
      ...period, method: 'GET', path: `/analysis/indicators/${indicatorId}/range-summary`, id: String(indicatorId),
      params: { indicatorVersionId: versionId, periodStart, periodEnd,
        granularity: period.summaryGranularity, ...serializeAnalysisFilters(filters) }
    }
  }
  return {
    ...period, method: 'POST', path: `/analysis/indicator-versions/${versionId}/instant-summary`, id: String(versionId),
    payload: {
      summaryOnly: true,
      ...(Object.keys(filters).length ? { filters } : {}),
      ...(period.summaryGranularity !== 'STATIC' ? {
        periodStart: `${periodStart}T00:00:00`, periodEnd: `${shiftReportDate(periodEnd, 1)}T00:00:00`
      } : {}),
      ...(parameters !== undefined ? { parameters } : {})
    }
  }
}
