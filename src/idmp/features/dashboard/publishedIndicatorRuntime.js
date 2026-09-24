function dateRangeForMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''))
  if (!match) return {}
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || month < 1 || month > 12) return {}
  const next = new Date(Date.UTC(year, month, 1))
  return { periodStart: `${match[1]}-${match[2]}-01`, periodEnd: next.toISOString().slice(0, 10) }
}

export function buildPublishedIndicatorAnalysisQuery(source = {}, period = '') {
  return {
    indicatorVersionId: String(source.analysisIndicatorVersionId || source.indicatorVersionId || ''),
    granularity: 'MONTHLY',
    ...dateRangeForMonth(period)
  }
}

export function schemaPublishedIndicatorSourceCodes(schema) {
  return [...new Set((schema?.widgets || [])
    .flatMap(widget => [String(widget?.sourceCode || ''), ...((widget?.type === 'metric-group' ? widget.config?.metricGroup?.items || [] : []).map(item => String(item?.sourceCode || '')))])
    .filter(code => code.startsWith('catalog-indicator-')))]
}
