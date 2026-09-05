import { requestJson } from '@/idmp/api/request'

export function fetchMappingGroups(params = {}) {
  return requestJson(withQuery('/mappings/groups', params))
}

export function createMappingGroup(payload) {
  return requestJson('/mappings/groups', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchMappings(params = {}) {
  return requestJson(withQuery('/mappings', params))
}

export function createMapping(payload) {
  return requestJson('/mappings', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchMapping(mappingId) {
  return requestJson(`/mappings/${encodeURIComponent(mappingId)}`)
}

export function updateMapping(mappingId, payload) {
  return requestJson(`/mappings/${encodeURIComponent(mappingId)}`, {
    method: 'PATCH', body: JSON.stringify(payload)
  })
}

export function submitMapping(mappingId, resourceVersion) {
  return mappingAction(mappingId, 'submit', { resourceVersion })
}

export function approveMapping(mappingId, resourceVersion, comment = '') {
  return mappingAction(mappingId, 'approve', { resourceVersion, comment: comment || undefined })
}

export function rejectMapping(mappingId, resourceVersion, comment) {
  return mappingAction(mappingId, 'reject', { resourceVersion, comment })
}

export function invalidateMapping(mappingId, resourceVersion, reason) {
  return mappingAction(mappingId, 'invalidate', { resourceVersion, reason })
}

export function compareIndicatorMappings(sourceIndicatorVersionId, targetIndicatorVersionId) {
  return requestJson(withQuery('/mappings/compare', { sourceIndicatorVersionId, targetIndicatorVersionId }))
}

export function fetchMappingsByIndicatorVersion(indicatorVersionId) {
  return requestJson(`/mappings/by-indicator-version/${encodeURIComponent(indicatorVersionId)}`)
}

export function fetchPolicyReferences(indicatorVersionId) {
  return requestJson(`/mappings/indicator-versions/${encodeURIComponent(indicatorVersionId)}/policy-references`)
}

export function createPolicyReference(indicatorVersionId, payload) {
  return requestJson(`/mappings/indicator-versions/${encodeURIComponent(indicatorVersionId)}/policy-references`, {
    method: 'POST', body: JSON.stringify(payload)
  })
}

export function invalidatePolicyReference(referenceId, resourceVersion) {
  return requestJson(`/mappings/policy-references/${encodeURIComponent(referenceId)}/invalidate`, {
    method: 'POST', body: JSON.stringify({ resourceVersion })
  })
}

function mappingAction(mappingId, action, payload) {
  return requestJson(`/mappings/${encodeURIComponent(mappingId)}/${action}`, {
    method: 'POST', body: JSON.stringify(payload)
  })
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.filter(item => item !== undefined && item !== null && item !== '').forEach(item => query.append(key, String(item)))
      return
    }
    query.set(key, String(value))
  })
  const queryText = query.toString()
  return queryText ? `${path}?${queryText}` : path
}
