import { requestJson } from '@/idmp/api/request'

export function fetchIndicators(params = {}) {
  return requestJson(withQuery('/indicators', params))
}

export function fetchIndicator(indicatorId) {
  return requestJson(`/indicators/${indicatorId}`)
}

export function fetchIndicatorVersions(indicatorId) {
  return requestJson(`/indicators/${indicatorId}/versions`)
}

export function fetchIndicatorVersionList(params = {}) {
  return requestJson(withQuery('/indicator-versions', params))
}

export function fetchIndicatorVersion(versionId) {
  return requestJson(`/indicator-versions/${versionId}`)
}

export function fetchIndicatorFormula(versionId) {
  return requestJson(`/indicator-versions/${versionId}/formula`)
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

export function publishIndicatorVersion(versionId) {
  return requestJson(`/indicator-versions/${versionId}/publish`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function fetchIndicatorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/indicator-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}

export function fetchIndicatorAnalysis(indicatorId, params = {}) {
  return requestJson(withQuery(`/analysis/indicators/${indicatorId}/analysis`, params))
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
