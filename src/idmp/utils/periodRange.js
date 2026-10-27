// User ranges are closed. Persisted result periods and execution APIs use an exclusive end.
const DAY = 86400000
const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
const midnight = value => /^\d{4}-\d{2}-\d{2}(?:[T ]00:00(?::00(?:\.0+)?)?)?$/.test(String(value || ''))
function parse(value) {
  const text = String(value || '').replace(' ', 'T')
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(text)) return NaN
  const parsed = Date.parse(`${dateOnly(text) ? `${text}T00:00:00` : text}Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === text.slice(0, 10) ? parsed : NaN
}
function timestamp(value, offset, milliseconds = false) {
  const time = parse(value)
  if (!Number.isFinite(time)) return ''
  return new Date(time + offset).toISOString().slice(0, milliseconds ? 23 : 19)
}

export function closedPeriodToQuery(payload = {}) {
  if (!payload.periodStart && !payload.periodEnd) return { ...payload }
  const start = parse(payload.periodStart), end = parse(payload.periodEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error('请选择开始时间不晚于结束时间的完整统计周期')
  const millis = /\.\d+$/.test(String(payload.periodEnd))
  return { ...payload, periodStart: timestamp(payload.periodStart, 0, /\.\d+$/.test(String(payload.periodStart))),
    periodEnd: timestamp(payload.periodEnd, dateOnly(payload.periodEnd) ? DAY : millis ? 1 : 1000, millis) }
}

export function resultPeriodToClosedRange(start, end, { dates = false } = {}) {
  if (!Number.isFinite(parse(start)) || !Number.isFinite(parse(end)) || parse(end) <= parse(start)) return []
  if (dates) return [String(start).slice(0, 10), timestamp(end, -1, true).slice(0, 10)]
  return [timestamp(start, 0), timestamp(end, -1000)]
}

export function formatResultPeriod(start, end) {
  if (!start || !end) return '-'
  if (midnight(start) && midnight(end)) return resultPeriodToClosedRange(start, end, { dates: true }).join(' 至 ') || '-'
  const closedEnd = timestamp(end, -1, true)
  if (!closedEnd || parse(end) <= parse(start)) return '-'
  return `${String(start).replace('T', ' ')} 至 ${closedEnd.replace('T', ' ')}`
}

export function formatResultPeriodField(field, value) {
  const code = String(field || '').replaceAll('_', '').toLowerCase()
  if (code === 'periodend' && Number.isFinite(parse(value))) {
    const end = timestamp(value, -1, true)
    return midnight(value) ? end.slice(0, 10) : end.replace('T', ' ')
  }
  if (code === 'periodstart' && Number.isFinite(parse(value))) return midnight(value) ? String(value).slice(0, 10) : String(value).replace('T', ' ')
  return value
}
