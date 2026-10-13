function dateRangeForMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''))
  if (!match) return {}
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || month < 1 || month > 12) return {}
  const next = new Date(Date.UTC(year, month, 1))
  return { periodStart: `${match[1]}-${match[2]}-01`, periodEnd: next.toISOString().slice(0, 10) }
}

function monthStart(value) {
  return /^\d{4}-\d{2}$/.test(String(value || '')) ? `${value}-01` : null
}

function nextMonthStart(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
}

export function dateRangeForMonths(period = '') {
  if (!Array.isArray(period)) return dateRangeForMonth(period)
  const values = period.map(value => String(value || '')).filter(value => /^\d{4}-\d{2}$/.test(value)).sort()
  if (!values.length) return {}
  const start = values[0]
  const end = values[values.length - 1]
  return { periodStart: monthStart(start), periodEnd: nextMonthStart(end) }
}

export function suggestIndependentWidgetPeriod(options = [], dashboardRange = []) {
  const months = [...new Set((Array.isArray(options) ? options : [])
    .map(option => String(option?.value || ''))
    .filter(value => /^\d{4}-\d{2}$/.test(value)))].sort().reverse()
  if (!months.length) return null
  const selected = (Array.isArray(dashboardRange) ? dashboardRange : [])
    .map(value => String(value || ''))
    .filter(value => /^\d{4}-\d{2}$/.test(value)).sort()
  if (selected.length && months.some(month => month >= selected[0] && month <= selected[selected.length - 1])) return null
  const month = months[0]
  return {
    periodMode: 'INDEPENDENT',
    periodStart: `${month}-01`,
    periodEnd: nextMonthStart(month),
    granularity: 'MONTHLY'
  }
}

export function buildPublishedIndicatorAnalysisQuery(source = {}, period = '') {
  return {
    indicatorVersionId: String(source.analysisIndicatorVersionId || source.indicatorVersionId || ''),
    granularity: 'MONTHLY',
    ...dateRangeForMonths(period)
  }
}

export function schemaPublishedIndicatorSourceCodes(schema) {
  return [...new Set((schema?.widgets || [])
    .flatMap(widget => [String(widget?.sourceCode || ''), ...((widget?.type === 'metric-group' ? widget.config?.metricGroup?.items || [] : []).map(item => String(item?.sourceCode || '')))])
    .filter(code => code.startsWith('catalog-indicator-')))]
}

export function buildPublishedIndicatorTrendPreviewQuery(widget = {}, query = {}) {
  return { ...query }
}

export function createPublishedDashboardPeriodOptions(periodLists = []) {
  const sets = (Array.isArray(periodLists) ? periodLists : [])
    .map(periods => new Set((Array.isArray(periods) ? periods : [])
      .filter(item => !item?.periodType || String(item.periodType).toUpperCase() === 'MONTHLY')
      .map(item => String(item?.periodStart || '').slice(0, 7))
      .filter(value => /^\d{4}-\d{2}$/.test(value))))
    .filter(set => set.size)
  if (!sets.length) return []
  const common = [...sets[0]].filter(value => sets.every(set => set.has(value)))
  const values = common.length ? common : [...new Set(sets.flatMap(set => [...set]))]
  return values.sort((left, right) => right.localeCompare(left)).map(value => ({
    value,
    label: `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月`
  }))
}

export function resolvePublishedDashboardPeriod(currentPeriod, options = [], fallback = '2025-12') {
  const values = (Array.isArray(options) ? options : []).map(option => option?.value).filter(Boolean)
  if (values.includes(currentPeriod)) return currentPeriod
  return values[0] || currentPeriod || fallback
}

export function resolvePublishedDashboardPeriodRange(currentRange, options = [], fallback = '2025-12') {
  const values = (Array.isArray(options) ? options : []).map(option => option?.value).filter(Boolean)
  if (!values.length) {
    const fallbackPeriod = Array.isArray(currentRange) ? currentRange.find(Boolean) : ''
    const value = fallbackPeriod || fallback
    return [value, value]
  }
  const selected = (Array.isArray(currentRange) ? currentRange : []).filter(value => values.includes(value)).sort()
  if (selected.length === 2) return [selected[0], selected[1]]
  if (selected.length === 1) return [selected[0], selected[0]]
  // Callers without an explicit default still fall back to the latest month.
  return [values[0], values[0]]
}

export function defaultPublishedDashboardPeriodRange(options = [], months = 6) {
  const values = (Array.isArray(options) ? options : [])
    .map(option => String(option?.value || ''))
    .filter(value => /^\d{4}-\d{2}$/.test(value))
    .sort((left, right) => right.localeCompare(left))
  if (!values.length) return []
  const latest = values[0]
  const [year, month] = latest.split('-').map(Number)
  const firstMonth = new Date(Date.UTC(year, month - Math.max(1, months), 1)).toISOString().slice(0, 7)
  const oldestAvailable = values.filter(value => value >= firstMonth && value <= latest).at(-1) || latest
  return [oldestAvailable, latest]
}
