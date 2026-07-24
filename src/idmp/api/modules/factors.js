import { requestJson } from '@/idmp/api/request'

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
