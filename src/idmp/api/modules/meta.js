import { requestJson } from '@/idmp/api/request'

export function fetchDataDomains() {
  return requestJson('/meta/data-domains')
}

export function createDataDomain({ code: _code, ...payload }) {
  return requestJson('/meta/data-domains', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchPhysicalTables(domainId) {
  return requestJson(`/meta/data-domains/${encodeURIComponent(domainId)}/physical-tables`)
}

export function addPhysicalTable(domainId, tableName) {
  return requestJson(`/meta/data-domains/${encodeURIComponent(domainId)}/physical-tables`, {
    method: 'POST',
    body: JSON.stringify({ tableName })
  })
}

export function fetchPhysicalTableFields(domainId, tableName) {
  return requestJson(`/meta/data-domains/${encodeURIComponent(domainId)}/physical-tables/${encodeURIComponent(tableName)}/semantic-fields`)
}

export function fetchPhysicalTableRelations(physicalTableBindingId, params = {}) {
  return requestJson(withQuery('/meta/physical-table-relations', { physicalTableBindingId, ...params }))
}

export function createPhysicalTableRelation({ code: _code, ...payload }) {
  return requestJson('/meta/physical-table-relations', { method: 'POST', body: JSON.stringify(payload) })
}

export function fetchPhysicalTableRelation(relationId) {
  return requestJson(`/meta/physical-table-relations/${encodeURIComponent(relationId)}`)
}

export function updatePhysicalTableRelation(relationId, payload) {
  return requestJson(`/meta/physical-table-relations/${encodeURIComponent(relationId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function validatePhysicalTableRelation(relationId) {
  return requestJson(`/meta/physical-table-relations/${encodeURIComponent(relationId)}/validate`, { method: 'POST' })
}

export function publishPhysicalTableRelation(relationId, resourceVersion) {
  return requestJson(`/meta/physical-table-relations/${encodeURIComponent(relationId)}/publish`, { method: 'POST', body: JSON.stringify({ resourceVersion }) })
}

export function bindPhysicalTableField(domainId, tableName, payload) {
  return requestJson(`/meta/data-domains/${encodeURIComponent(domainId)}/physical-tables/${encodeURIComponent(tableName)}/semantic-fields`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchSemanticField(fieldId) {
  return requestJson(`/meta/semantic-fields/${encodeURIComponent(fieldId)}`)
}

export function updateSemanticField(fieldId, payload) {
  return requestJson(`/meta/semantic-fields/${encodeURIComponent(fieldId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function updatePhysicalTableDefaultTimeField(domainId, tableName, semanticFieldCode) {
  return requestJson(`/meta/data-domains/${encodeURIComponent(domainId)}/physical-tables/${encodeURIComponent(tableName)}/default-time-field`, {
    method: 'PATCH',
    body: JSON.stringify({ semanticFieldCode })
  })
}

export function fetchSourceTables(params = {}) {
  return requestJson(withQuery('/meta/source-tables', params))
}

export function fetchSourceTableFields(tableName) {
  return requestJson(`/meta/source-tables/${encodeURIComponent(tableName)}/fields`)
}

export function fetchSourceTimeFieldOptions(tableName) {
  return requestJson(`/meta/source-tables/${encodeURIComponent(tableName)}/time-fields`)
}

export function fetchDrillPaths(params = {}) {
  return requestJson(withQuery('/meta/drill-paths', params))
}

export function fetchDrillPathVersion(versionId, options = {}) {
  return requestJson(`/meta/drill-path-versions/${encodeURIComponent(versionId)}`, options)
}

export function syncSourceMappings() {
  return requestJson('/meta/source-mappings/sync', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function fetchSemanticTableRelations(viewMappingId, params = {}) {
  return requestJson(withQuery('/meta/semantic-table-relations', { viewMappingId, ...params }))
}

export function createSemanticTableRelation({ code: _code, ...payload }) {
  return requestJson('/meta/semantic-table-relations', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchSemanticTableRelation(relationId) {
  return requestJson(`/meta/semantic-table-relations/${encodeURIComponent(relationId)}`)
}

export function updateSemanticTableRelation(relationId, payload) {
  return requestJson(`/meta/semantic-table-relations/${encodeURIComponent(relationId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function validateSemanticTableRelation(relationId, payload = {}) {
  return semanticTableRelationAction(relationId, 'validate', payload)
}

export function publishSemanticTableRelation(relationId, payload = {}) {
  return semanticTableRelationAction(relationId, 'publish', payload)
}

export function disableSemanticTableRelation(relationId, payload = {}) {
  return semanticTableRelationAction(relationId, 'disable', payload)
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

function semanticTableRelationAction(relationId, action, payload) {
  return requestJson(`/meta/semantic-table-relations/${encodeURIComponent(relationId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
