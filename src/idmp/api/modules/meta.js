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

export function fetchSourceTables(params = {}) {
  return requestJson(withQuery('/meta/source-tables', params))
}

export function fetchSourceTableFields(tableName) {
  return requestJson(`/meta/source-tables/${encodeURIComponent(tableName)}/fields`)
}

export function syncSourceMappings() {
  return requestJson('/meta/source-mappings/sync', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function bindSourceTableDomain(tableName, payload) {
  // 兼容快捷接口：正式 M0 流程应使用 createSemanticTable 逐步配置。
  return requestJson(`/meta/source-tables/${encodeURIComponent(tableName)}/bind-domain`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function createSemanticTable(domainId, payload) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-tables`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function saveSemanticField(domainId, tableCode, payload) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-tables/${tableCode}/semantic-fields`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateDefaultTimeField(domainId, tableCode, payload) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-tables/${tableCode}/default-time-field`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  })
}

export function fetchSemanticTables(domainId) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-tables`)
}

export function fetchSemanticTableFields(domainId, tableCode) {
  return requestJson(`/meta/data-domains/${domainId}/semantic-tables/${tableCode}/semantic-fields`)
}

export function fetchSemanticFields(domainId) {
  // 兼容扁平视图：多表数据域的正式字段选择必须使用表级接口。
  return requestJson(`/meta/data-domains/${domainId}/semantic-fields`)
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
