import { requestJson } from '@/idmp/api/request'

export function fetchIndicators() {
  return requestJson('/indicators')
}

export function createIndicator(payload) {
  return requestJson('/indicators', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function createIndicatorVersion(indicatorId, payload = {}) {
  return requestJson(`/indicators/${indicatorId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function saveIndicatorFormula(versionId, payload) {
  return requestJson(`/indicator-versions/${versionId}/formula`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function compileIndicatorFormula(versionId, payload) {
  return requestJson(`/indicator-versions/${versionId}/formula/compile`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function trialIndicatorVersion(versionId, payload, idempotencyKey) {
  return requestJson(`/indicator-versions/${versionId}/trial`, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function fetchIndicatorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/indicator-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}
