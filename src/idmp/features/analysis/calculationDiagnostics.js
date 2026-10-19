export function diagnosticPeriodQuery(versionId, periodRange = [], granularity = 'MONTHLY') {
  const query = { indicatorVersionId: String(versionId), granularity }
  if (granularity === 'STATIC') return query
  const [start, end] = periodRange
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || start > end) return null
  if (![start, end].every(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value)) return null
  query.periodStart = start
  query.periodEnd = new Date(Date.parse(`${end}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
  return query
}

export function diagnosticResults(analysis, query) {
  if (!analysis || String(analysis.indicatorVersionId || '') !== query.indicatorVersionId) return []
  const results = new Map()
  const rows = [analysis.overview, ...(analysis.trend || []), ...(analysis.dimensionComparison || [])]
  for (const row of rows) {
    if (!row?.resultId || (typeof row.resultId === 'number' && !Number.isSafeInteger(row.resultId))) continue
    if (query.granularity !== 'STATIC') {
      const start = String(row.periodStart || '').slice(0, 10)
      const end = String(row.periodEnd || '').slice(0, 10)
      if (!start || !end || start < query.periodStart || start >= query.periodEnd || end <= start || end > query.periodEnd) continue
    }
    results.set(String(row.resultId), row)
  }
  return [...results.values()]
}

export function diagnosticResultLabel(row) {
  const dimensions = row.dimensions || {}
  const names = Object.entries(dimensions).filter(([key, value]) => /name$/i.test(key) && value != null && value !== '').map(([, value]) => value)
  const members = names.length ? names.join(' / ') : Object.entries(dimensions).map(([key, value]) => `${key}：${value}`).join(' / ')
  const period = row.periodStart ? String(row.periodStart).slice(0, 10) : '静态结果'
  return `${period} · ${members || '汇总结果'} · ${row.displayValue ?? row.value ?? '-'} · #${String(row.resultId).slice(-6)}`
}

export function validateDiagnosticTrace(trace, row, versionId) {
  const context = trace?.context || {}
  if (String(context.indicatorVersionId || '') !== String(versionId) || String(context.resultId || '') !== String(row.resultId)) throw new Error('返回的计算链路与当前指标版本或结果不一致，请刷新后重试')
  for (const key of ['periodStart', 'periodEnd']) {
    if (row[key] && String(context[key] || '').slice(0, 10) !== String(row[key]).slice(0, 10)) throw new Error('返回的计算链路与所选结果周期不一致，请刷新后重试')
  }
  return trace
}
