import { requestJson } from '@/idmp/api/request'

export function fetchValueSets(params = {}) {
  return requestJson(withQuery('/meta/value-sets', params))
}

export function fetchValueSet(valueSetId) {
  return requestJson(`/meta/value-sets/${encodeURIComponent(valueSetId)}`)
}

export function fetchValueSetVersions(valueSetId) {
  return requestJson(`/meta/value-sets/${encodeURIComponent(valueSetId)}/versions`)
}

export function fetchValueSetVersion(versionId) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}`)
}

export function fetchValueSetItems(versionId) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}/items`)
}

export function replaceValueSetItems(versionId, payload) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}/items`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function updateValueSetVersion(versionId, payload) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function validateValueSetVersion(versionId) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}/validate`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function publishValueSetVersion(valueSetId, versionId, resourceVersion) {
  return requestJson(`/meta/value-sets/${encodeURIComponent(valueSetId)}/versions/${encodeURIComponent(versionId)}/publish`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function archiveValueSetVersion(versionId, resourceVersion) {
  return requestJson(`/meta/value-set-versions/${encodeURIComponent(versionId)}/archive`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function fetchSemanticFieldValueSet(fieldId) {
  return requestJson(`/meta/semantic-fields/${encodeURIComponent(fieldId)}/value-set`)
}

export function bindSemanticFieldValueSet(fieldId, payload) {
  return requestJson(`/meta/semantic-fields/${encodeURIComponent(fieldId)}/value-set`, {
    method: 'PUT',
    body: JSON.stringify(payload)
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
