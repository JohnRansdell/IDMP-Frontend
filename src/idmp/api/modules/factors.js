import { requestJson } from '@/idmp/api/request'

export function fetchFactors(params = {}) {
  return requestJson(withQuery('/factors', params))
}

export function fetchFactor(factorId) {
  return requestJson(`/factors/${factorId}`)
}

export function fetchFactorVersionsByFactor(factorId) {
  return requestJson(`/factors/${factorId}/versions`)
}

export function fetchFactorVersions(params = {}) {
  return requestJson(withQuery('/factor-versions', params))
}

export async function fetchPublishedFactorVersions() {
  const rows = []
  for (let page = 1; ; page += 1) {
    const result = await fetchFactorVersions({ publicationStatus: 'PUBLISHED', page, size: 100 })
    const items = Array.isArray(result) ? result : result.records || result.list || result.items || []
    rows.push(...items)
    if (Array.isArray(result) || items.length < 100 || rows.length >= Number(result.total ?? Infinity)) break
  }
  return rows.filter(item => (item.status || item.publicationStatus) === 'PUBLISHED')
}

export function fetchFactorVersion(versionId) {
  return requestJson(`/factor-versions/${versionId}`)
}

export function fetchFactorDependencies(versionId) {
  return requestJson(`/factor-versions/${encodeURIComponent(versionId)}/dependencies`)
}

export function fetchFactorDependencyGraph(versionId) {
  return requestJson(`/factor-versions/${encodeURIComponent(versionId)}/dependency-graph`)
}

export function fetchFactorImpactAnalysis(versionId) {
  return requestJson(`/factor-versions/${encodeURIComponent(versionId)}/impact-analysis`)
}

export function createFactor(payload) {
  return requestJson('/factors', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateFactor(factorId, payload) {
  return requestJson(`/factors/${factorId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorDeletionImpact(factorId) {
  return requestJson(`/factors/${encodeURIComponent(factorId)}/deletion-impact`)
}

export function deleteFactor(factorId, payload) {
  return requestJson(`/factors/${encodeURIComponent(factorId)}`, {
    method: 'DELETE',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorRecycleBin(params = {}) {
  return requestJson(withQuery('/factors/recycle-bin', params))
}

export function fetchFactorRecycleDetail(factorId) {
  return requestJson(`/factors/recycle-bin/${encodeURIComponent(factorId)}`)
}

export function restoreFactor(factorId, resourceVersion) {
  return requestJson(`/factors/recycle-bin/${encodeURIComponent(factorId)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function compileFactorVersion(versionId, payload = {}) {
  return requestJson(`/factor-versions/${versionId}/compile`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchCompileArtifact(artifactId) {
  return requestJson(`/compile-artifacts/${artifactId}`)
}

export function trialFactorVersion(versionId, payload, idempotencyKey) {
  return requestJson(`/factor-versions/${versionId}/trial`, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function queryFactorVersion(versionId, payload) {
  return requestJson(`/factor-versions/${encodeURIComponent(versionId)}/query`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorTrialPeriodRecommendation(versionId) {
  return requestJson(`/factor-versions/${encodeURIComponent(versionId)}/trial-period-recommendation`)
}

export function fetchFactorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/factor-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}

export function publishFactorVersion(versionId) {
  return requestJson(`/factor-versions/${versionId}/publish`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, value)
    }
  })
  const queryText = query.toString()
  return queryText ? `${path}?${queryText}` : path
}

export function fetchFactorTemplateParameterSchema(templateId) {
  return requestJson(`/factor-templates/${templateId}/parameter-schema`)
}

export function fetchFactorTemplates(params = {}) {
  return requestJson(withQuery('/factor-templates', params))
}

export function createFactorTemplate(payload) {
  return requestJson('/factor-templates', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorTemplateVersions(templateId) {
  return requestJson(`/factor-templates/${templateId}/versions`)
}

export function createFactorTemplateVersion(templateId, payload) {
  return requestJson(`/factor-templates/${templateId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorTemplateVersion(versionId) {
  return requestJson(`/factor-template-versions/${versionId}`)
}

export function updateFactorTemplateVersion(versionId, payload) {
  return requestJson(`/factor-template-versions/${versionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function validateFactorTemplateVersion(versionId) {
  return requestJson(`/factor-template-versions/${versionId}/validate`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function publishFactorTemplateVersion(versionId, resourceVersion) {
  return requestJson(`/factor-template-versions/${versionId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function instantiateFactorTemplateVersion(versionId, payload) {
  return requestJson(`/factor-template-versions/${versionId}/instantiate`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchFactorTemplateInstances(versionId, params = {}) {
  return requestJson(withQuery(`/factor-template-versions/${versionId}/instances`, params))
}
