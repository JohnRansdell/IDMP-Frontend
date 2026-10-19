export const factorIdText = value => value === undefined || value === null ? '' : String(value)
export function factorVersionId(version = {}) { return factorIdText(version.id ?? version.versionId ?? version.factorVersionId) }
export function factorDetailVersionId(factor, versions, requested) {
  if (requested) return factorIdText(requested)
  const published = factorIdText(factor.currentPublishedVersionId ?? factor.publishedVersionId)
  if (published) return published
  return factorVersionId([...versions].sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0])
}
export function assertFactorVersionOwner(version, factorId) {
  if (factorIdText(version?.factorId) !== factorIdText(factorId)) throw new Error('所选版本不属于当前因子，无法显示或运行，请重新选择')
}
export function factorQueryRows(result = {}) {
  return (result.records || result.rows || []).map(row => ({ ...row, dimensions: row.dimensions || Object.fromEntries((result.grainFieldCodes || []).map(field => [field, row[field]])) }))
}
