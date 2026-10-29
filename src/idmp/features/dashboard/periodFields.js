const periodCodes = new Set(['period', 'month', 'date', 'periodstart', 'periodend', 'statperiod', 'statmonth'])

export function isPeriodField(field) {
  return periodCodes.has(String(field || '').replaceAll('_', '').toLowerCase())
}

export function normalizePeriodBinding(binding) {
  if (!binding || typeof binding !== 'object') return binding
  const normalize = item => {
    if (!item || !isPeriodField(item.field)) return item
    const code = String(item.field).replaceAll('_', '').toLowerCase()
    return { ...item, field: code === 'periodend' ? 'periodEnd' : 'periodStart',
      ...(['month', 'statmonth'].includes(code) ? { periodFormat: 'MONTHLY' } : {}) }
  }
  return { ...binding, ...Object.fromEntries(['dimensions', 'series', 'sort'].filter(slot => Array.isArray(binding[slot]))
    .map(slot => [slot, binding[slot].map(normalize)])) }
}

export function dashboardWidgetResultShape(widget = {}) {
  const kind = widget.type === 'chart' ? widget.chartKind || 'line' : widget.type
  if (['kpi', 'gauge'].includes(kind)) return 'OVERVIEW'
  if (kind === 'line' || (['bar', 'table'].includes(kind) && widget.config?.dataBinding?.dimensions?.length === 1 && isPeriodField(widget.config.dataBinding.dimensions[0].field))) return 'TREND'
  return 'COMPARISON'
}

// Use the start of the actual result period. Its end is exclusive and can
// belong to the following month; neither request dates nor scenario IDs are
// substitutes for a result's period.
export function normalizePeriodDataset(dataset = {}) {
  const fields = (dataset.fields || []).map(field => isPeriodField(field.id) && field.semanticType !== 'measure'
    ? { ...field, semanticType: 'time', granularities: field.granularities?.length ? field.granularities : ['raw'] }
    : field)
  const rows = (dataset.rows || []).map(row => {
    const keys = new Map(Object.keys(row || {}).map(key => [key.replaceAll('_', '').toLowerCase(), key]))
    const start = row?.[keys.get('periodstart')]
    const match = /^(\d{4})-(\d{1,2})(?:-\d{2}(?:T|\s|$)|$)/.exec(String(start || ''))
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return row
    const period = `${match[1]}-${match[2].padStart(2, '0')}`
    const aligned = { ...row }
    for (const field of fields) {
      const code = field.id.replaceAll('_', '').toLowerCase()
      if (!['period', 'month', 'statperiod', 'statmonth'].includes(code)) continue
      const existing = row[keys.get(code)]
      if (existing !== null && existing !== undefined && existing !== '') continue
      aligned[field.id] = period
    }
    return aligned
  })
  return { ...dataset, fields, rows }
}
