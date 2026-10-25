const FORMAL_GRAINS = ['MONTHLY', 'QUARTERLY', 'YEARLY']
export const normalizeAnalysisGranularity = value => ['DAILY', ...FORMAL_GRAINS, 'STATIC'].includes(String(value).toUpperCase()) ? String(value).toUpperCase() : 'MONTHLY'
export function shiftReportDate(value, days) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function formalReportGranularity(range, requested = 'CUSTOM') {
  if (!range?.[0] || !range?.[1] || !FORMAL_GRAINS.includes(requested)) return 'CUSTOM'
  const start = new Date(`${range[0]}T00:00:00Z`)
  if (start.getUTCDate() !== 1 || requested === 'QUARTERLY' && start.getUTCMonth() % 3 !== 0
    || requested === 'YEARLY' && start.getUTCMonth() !== 0) return 'CUSTOM'
  start.setUTCMonth(start.getUTCMonth() + { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[requested])
  return start.toISOString().slice(0, 10) === shiftReportDate(range[1], 1) ? requested : 'CUSTOM'
}

export function analysisReportContext(query = {}) {
  // Old dashboard links used CUSTOM and an exclusive end. New links carry inclusive report dates.
  const legacyCustom = String(query.granularity).toUpperCase() === 'CUSTOM'
  const range = query.periodStart && query.periodEnd ? [String(query.periodStart).slice(0, 10),
    legacyCustom ? shiftReportDate(query.periodEnd, -1) : String(query.periodEnd).slice(0, 10)] : []
  const summaryGranularity = String(query.summaryGranularity || (legacyCustom ? 'CUSTOM' : query.granularity) || 'MONTHLY').toUpperCase()
  return { range, mode: summaryGranularity === 'CUSTOM' || summaryGranularity === 'STATIC' ? 'INSTANT' : 'FORMAL',
    granularity: normalizeAnalysisGranularity(query.granularity),
    summaryGranularity }
}

export function analysisFilterParams(query = {}) {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key.startsWith('filter.')))
}

export function analysisFilters(query = {}) {
  return Object.fromEntries(Object.entries(analysisFilterParams(query)).map(([key, value]) => [key.slice(7), value]))
}

export function analysisRouteKey(query = {}) {
  const fields = ['indicator', 'indicatorVersionId', 'periodStart', 'periodEnd', 'granularity', 'summaryMode', 'summaryGranularity',
    'trendStart', 'trendEnd', 'drillResultId', 'drillStartLevel', 'drillParentKeys']
  return JSON.stringify(Object.entries(query).filter(([key]) => fields.includes(key) || key.startsWith('filter.'))
    .sort(([a], [b]) => a.localeCompare(b)))
}
