import { requestJson } from '@/idmp/api/request'

export function fetchDataDomains() {
  return requestJson('/meta/data-domains')
}

export function createDataDomain(payload) {
  return requestJson('/meta/data-domains', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function syncSourceMappings() {
  return requestJson('/meta/source-mappings/sync', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function bindSourceTableDomain(tableName, payload) {
  return requestJson(`/meta/source-tables/${encodeURIComponent(tableName)}/bind-domain`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchSemanticFields(domainId) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-fields`)
}
