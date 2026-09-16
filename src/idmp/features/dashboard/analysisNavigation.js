function firstIdentifier(source = {}) {
  return [
    source.analysisIndicatorId,
    source.indicatorId,
    source.indicatorCode,
    source.code
  ].map(value => String(value || '').trim()).find(Boolean) || ''
}

export function buildIndicatorAnalysisRouteQuery(source = {}) {
  const indicator = firstIdentifier(source)
  if (!indicator) return null
  const indicatorName = String(source.indicatorName || source.title || source.name || '').trim()
  const indicatorVersionId = String(source.analysisIndicatorVersionId || source.indicatorVersionId || '').trim()
  return {
    indicator,
    ...(indicatorName ? { indicatorName } : {}),
    ...(indicatorVersionId ? { indicatorVersionId } : {})
  }
}
