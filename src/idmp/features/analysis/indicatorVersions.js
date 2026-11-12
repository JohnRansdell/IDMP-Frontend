export function publishedAnalysisVersions(versions, indicatorId) {
  const seen = new Set()
  return versions.filter(version => {
    const id = String(version.id || version.versionId || version.indicatorVersionId || '')
    if (!id || seen.has(id)
      || String(version.indicatorId || version.indicator?.id || '') !== String(indicatorId || '')
      || (version.publicationStatus || version.status) !== 'PUBLISHED' || version.status === 'ARCHIVED') return false
    seen.add(id)
    return true
  }).map(version => ({ ...version, id: String(version.id || version.versionId || version.indicatorVersionId) }))
    .sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0))
}

export function analysisVersionQuery(query, versionId) {
  // Dates remain comparable; result anchors and dimension bindings belong to the old version.
  const fields = ['indicator', 'indicatorName', 'periodStart', 'periodEnd', 'granularity',
    'summaryGranularity', 'trendStart', 'trendEnd']
  return { ...Object.fromEntries(Object.entries(query).filter(([key, value]) => fields.includes(key)
    && !(['granularity', 'summaryGranularity'].includes(key) && value === 'STATIC'))),
    indicatorVersionId: String(versionId) }
}
