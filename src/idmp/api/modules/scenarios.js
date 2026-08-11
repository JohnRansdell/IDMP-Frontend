import { requestJson } from '@/idmp/api/request'

export function fetchScenarios(params = {}) {
  return requestJson(withQuery('/scenarios', params))
}

export function createScenario(payload, idempotencyKey) {
  return requestJson('/scenarios', {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function fetchScenarioVersions(scenarioId) {
  return requestJson(`/scenarios/${scenarioId}/versions`)
}

export function createScenarioVersion(scenarioId, payload = {}, idempotencyKey) {
  return requestJson(`/scenarios/${scenarioId}/versions`, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function fetchScenarioVersion(versionId) {
  return requestJson(`/scenario-versions/${versionId}`)
}

export function updateScenarioVersion(versionId, payload) {
  return requestJson(`/scenario-versions/${versionId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function replaceScenarioIndicators(versionId, payload) {
  return requestJson(`/scenario-versions/${versionId}/indicators`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function replaceScenarioOverrides(versionId, payload) {
  return requestJson(`/scenario-versions/${versionId}/overrides`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function fetchScenarioMergedPreview(versionId) {
  return requestJson(`/scenario-versions/${versionId}/merged-preview`)
}

export function validateScenarioVersion(versionId) {
  return requestJson(`/scenario-versions/${versionId}/validate`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function publishScenarioVersion(versionId, resourceVersion, idempotencyKey) {
  return requestJson(`/scenario-versions/${versionId}/publish`, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({ resourceVersion })
  })
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  })
  const queryText = query.toString()
  return queryText ? `${path}?${queryText}` : path
}
