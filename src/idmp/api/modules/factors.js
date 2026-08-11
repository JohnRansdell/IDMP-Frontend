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

export function fetchFactorVersion(versionId) {
  return requestJson(`/factor-versions/${versionId}`)
}

export function createFactor(payload) {
  return requestJson('/factors', {
    method: 'POST',
    body: JSON.stringify(payload)
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
