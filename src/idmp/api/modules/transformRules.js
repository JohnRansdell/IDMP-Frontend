import { requestJson } from '@/idmp/api/request'

export function fetchSourceValueProfile(mappingId, params = {}) {
  return requestJson(withQuery(`/meta/source-field-mappings/${encodeURIComponent(mappingId)}/value-profile`, params))
}

export function fetchSourceTransformRule(mappingId) {
  return requestJson(`/meta/source-field-mappings/${encodeURIComponent(mappingId)}/transform-rule`)
}

export function fetchTransformRuleVersion(versionId) {
  return requestJson(`/transform-rule-versions/${encodeURIComponent(versionId)}`)
}

export function createTransformRule(mappingId, payload) {
  return requestJson(`/meta/source-field-mappings/${encodeURIComponent(mappingId)}/transform-rules`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateTransformRuleVersion(versionId, payload) {
  return requestJson(`/transform-rule-versions/${encodeURIComponent(versionId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function previewTransformRule(versionId, limit = 100) {
  return requestJson(`/transform-rule-versions/${encodeURIComponent(versionId)}/preview`, {
    method: 'POST',
    body: JSON.stringify({ limit })
  })
}

export function validateTransformRule(versionId) {
  return requestJson(`/transform-rule-versions/${encodeURIComponent(versionId)}/validate`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function publishTransformRule(versionId, resourceVersion) {
  return requestJson(`/transform-rule-versions/${encodeURIComponent(versionId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  })
  const text = query.toString()
  return text ? `${path}?${text}` : path
}
