const pad = value => String(value).padStart(2, '0')
const iso = date => date.toISOString().slice(0, 10)
const monthValue = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
const addDays = (value, amount) => iso(new Date(Date.parse(`${value}T00:00:00Z`) + amount * 86400000))
const addMonths = (value, amount) => {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return iso(date)
}

export function defaultDashboardPeriod(options = []) {
  const month = options.map(option => String(option?.value || '')).filter(value => /^\d{4}-\d{2}$/.test(value)).sort().at(-1)
    || new Date().toISOString().slice(0, 7)
  return { type: 'MONTHLY', month, year: Number(month.slice(0, 4)), quarter: Math.ceil(Number(month.slice(5)) / 3), startMonth: month, endMonth: month }
}

export function resolveDashboardPeriod(selection = {}) {
  const type = selection.type || 'MONTHLY'
  let start, end
  if (type === 'MONTHLY' && monthValue(selection.month)) {
    start = `${selection.month}-01`
    end = addMonths(start, 1)
  } else if (['QUARTERLY', 'YEARLY'].includes(type) && Number.isInteger(Number(selection.year)) && selection.year >= 1900 && selection.year <= 9998) {
    const quarter = Number(selection.quarter)
    if (type === 'QUARTERLY' && (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)) return null
    start = `${selection.year}-${pad(type === 'YEARLY' ? 1 : (quarter - 1) * 3 + 1)}-01`
    end = addMonths(start, type === 'YEARLY' ? 12 : 3)
  } else if (type === 'CUSTOM' && monthValue(selection.startMonth) && monthValue(selection.endMonth) && selection.startMonth <= selection.endMonth) {
    start = `${selection.startMonth}-01`
    end = addMonths(`${selection.endMonth}-01`, 1)
  } else return null
  // Only an exact stored calendar-period result can currently represent an interval.
  let granularity = type === 'CUSTOM' ? null : type
  if (type === 'CUSTOM' && start.endsWith('-01')) {
    const month = Number(start.slice(5, 7))
    if (end === addMonths(start, 1)) granularity = 'MONTHLY'
    else if ((month - 1) % 3 === 0 && end === addMonths(start, 3)) granularity = 'QUARTERLY'
    else if (month === 1 && end === addMonths(start, 12)) granularity = 'YEARLY'
  }
  return { periodStart: start, periodEnd: end, granularity, selectionType: type }
}

export function dashboardPeriodLabel(period) {
  if (!period?.periodStart || !period?.periodEnd) return ''
  const start = period.periodStart.slice(0, 10), end = period.periodEnd.slice(0, 10)
  if (period.selectionType === 'CUSTOM' && start.endsWith('-01') && end.endsWith('-01')) return `${start.slice(0, 7)} ~ ${addMonths(end, -1).slice(0, 7)}`
  if (start.endsWith('-01') && end === addMonths(start, 1)) return `${start.slice(0, 4)}年${Number(start.slice(5, 7))}月`
  if (start.endsWith('-01') && (Number(start.slice(5, 7)) - 1) % 3 === 0 && end === addMonths(start, 3)) return `${start.slice(0, 4)}年第${Math.ceil(Number(start.slice(5, 7)) / 3)}季度`
  if (start.endsWith('-01-01') && end === addMonths(start, 12)) return `${start.slice(0, 4)}年`
  if (start.endsWith('-01') && end.endsWith('-01')) return `${start.slice(0, 7)} ~ ${addMonths(end, -1).slice(0, 7)}`
  return `${start} ~ ${addDays(end, -1)}`
}

export function dashboardComparisonPeriods(period) {
  const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[period?.granularity]
  const shift = amount => ({ periodStart: addMonths(period.periodStart, amount), periodEnd: addMonths(period.periodEnd, amount) })
  return {
    showMom: Boolean(months && period.selectionType !== 'CUSTOM' && period.granularity !== 'YEARLY'),
    yoyPeriod: months ? dashboardPeriodLabel(shift(-12)) : '',
    momPeriod: months ? dashboardPeriodLabel(shift(-months)) : ''
  }
}

const boundary = value => /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.0+)?)?$/.test(String(value || '')) ? value.slice(0, 10) : null
const samePeriod = (row, period) => boundary(row?.periodStart) === period?.periodStart && boundary(row?.periodEnd) === period?.periodEnd

export function enforceDashboardResultPeriod(result, query, { timeSeries = false, selectionType = query?.granularity } = {}) {
  if (!query?.periodStart || !query?.periodEnd || result?.status === 'ERROR') return result
  const period = { ...query, selectionType }
  const rows = (result?.rows || []).filter(row => timeSeries
    ? boundary(row.periodStart) && boundary(row.periodEnd) && boundary(row.periodStart) >= query.periodStart && boundary(row.periodEnd) <= query.periodEnd
    : samePeriod(row, query))
  const context = { ...period, label: dashboardPeriodLabel(period), ...dashboardComparisonPeriods(period) }
  const unavailable = !query.granularity || (!rows.length && result?.status !== 'LOADING')
  if (unavailable) return {
    ...result, status: 'NO_ACTIVE_RESULT', rows: [], resultId: null, snapshotId: null, drillContext: null,
    timeComparison: null, comparison: { yoy: null, mom: null }, periodContext: context,
    message: query.granularity ? `所选统计周期（${context.label}）暂无完整结果，请先计算对应周期。` : `所选区间（${context.label}）暂不支持整体结果查询。`
  }
  let comparison = result.timeComparison
  if (!samePeriod(comparison?.current, query)) comparison = null
  if (comparison) {
    const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[query.granularity]
    const matchesShift = (row, amount) => months && samePeriod(row, { periodStart: addMonths(query.periodStart, amount), periodEnd: addMonths(query.periodEnd, amount) })
    const previous = comparison.previousPeriod || comparison.previousMonth
    const year = comparison.samePeriodLastYear || comparison.sameMonthLastYear
    comparison = {
      ...comparison,
      yearOverYear: matchesShift(year, -12) ? comparison.yearOverYear : null,
      periodOverPeriod: context.showMom && matchesShift(previous, -months) ? comparison.periodOverPeriod || comparison.monthOverMonth : null,
      monthOverMonth: null
    }
  }
  return { ...result, rows, timeComparison: comparison, comparison: { yoy: null, mom: null }, yoy: null, mom: null, periodContext: context }
}
