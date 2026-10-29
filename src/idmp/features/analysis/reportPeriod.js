const FORMAL_GRAINS = ['MONTHLY', 'QUARTERLY', 'YEARLY']
export function sourceAvailableReportRange(availability) {
  const range = [availability?.earliestDataDate, availability?.latestDataDate].map(value => String(value || '').slice(0, 10))
  return range.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)) && range[0] <= range[1] ? range : []
}

export function formatPeriodLabel(periodStart, periodEnd) {
  const start = String(periodStart || '').slice(0, 10)
  const end = String(periodEnd || '').slice(0, 10)
  if (start && end) return `${start} 至 ${end}`
  return start || end || '-'
}

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
  if (!Number.isFinite(start.getTime())) return 'CUSTOM'
  if (start.getUTCDate() !== 1 || requested === 'QUARTERLY' && start.getUTCMonth() % 3 !== 0
    || requested === 'YEARLY' && start.getUTCMonth() !== 0) return 'CUSTOM'
  start.setUTCMonth(start.getUTCMonth() + { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[requested])
  return start.toISOString().slice(0, 10) === shiftReportDate(range[1], 1) ? requested : 'CUSTOM'
}

// Report ranges are inclusive calendar dates. CUSTOM remains custom even for a full quarter/year.
export function resolveReportPeriod(range = [], requested = 'MONTHLY', { parameters = {}, filters = {} } = {}) {
  const dates = range.length === 2 && range.every(Boolean) ? range.map(value => String(value).slice(0, 10)) : []
  const grain = String(requested).toUpperCase()
  const summaryGranularity = grain === 'STATIC' ? 'STATIC'
    : dates.length ? formalReportGranularity(dates, grain) : grain
  const hasRuntimeValues = Object.values(parameters).some(value => value !== null && value !== undefined && value !== '')
  const hasFilters = Object.values(filters).some(value => (Array.isArray(value) ? value : [value]).some(item => item !== null && item !== undefined && item !== ''))
  return {
    range: summaryGranularity === 'STATIC' ? [] : dates,
    summaryGranularity,
    // Filtered totals must preserve source-level statistics, not merge grouped rows.
    mode: !hasRuntimeValues && !hasFilters && FORMAL_GRAINS.includes(summaryGranularity) ? 'FORMAL' : 'INSTANT'
  }
}

export function reportPeriodQuery(context) {
  const { range, summaryGranularity, mode } = context
  return {
    granularity: normalizeAnalysisGranularity(context.granularity),
    summaryMode: mode,
    summaryGranularity,
    ...(range.length === 2 ? { periodStart: range[0], periodEnd: range[1] } : {})
  }
}

export function analysisReportContext(query = {}) {
  const range = query.periodStart && query.periodEnd ? [String(query.periodStart).slice(0, 10),
    String(query.periodEnd).slice(0, 10)] : []
  const summaryGranularity = String(query.summaryGranularity || query.granularity || 'MONTHLY').toUpperCase()
  return { ...resolveReportPeriod(range, summaryGranularity, { filters: analysisFilters(query) }), granularity: normalizeAnalysisGranularity(query.granularity) }
}

export function serializeAnalysisFilters(filters = {}) {
  return Object.fromEntries(Object.entries(filters).map(([field, value]) => [`filter.${field}`, value]))
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
