// Scenario bindings are replaced as a collection. Preserve every supported field
// from existing bindings when appending the current indicator version.
export function appendScenarioIndicator(existing, versionId) {
  const fields = ['indicatorVersionId', 'displayOrder', 'required', 'reportRequirementText', 'mappingOriginType', 'dimensionGrain', 'periodType', 'organizationScopeDsl']
  const result = existing.map(row => Object.fromEntries(fields.filter(key => row[key] !== undefined).map(key => [key, row[key]])))
  if (!result.some(row => String(row.indicatorVersionId) === String(versionId))) {
    if (result.length >= 500) throw new Error('场景已达到 500 个指标的上限')
    result.push({ indicatorVersionId: String(versionId), displayOrder: Math.max(-1, ...result.map(row => Number(row.displayOrder) || 0)) + 1, required: true, mappingOriginType: 'MANUAL' })
  }
  return result
}

export function restorePolicyDrafts(saved, versionId) {
  return saved?.policyDraftVersionId === String(versionId || '') && Array.isArray(saved?.form?.policyDrafts)
    ? saved.form.policyDrafts.filter(row => row && typeof row.policyFileVersionId === 'string').map(row => ({ ...row })) : []
}
