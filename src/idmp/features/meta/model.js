export function toOpaqueId(value) {
  if (value === undefined || value === null || value === '') return ''
  return String(value)
}

export function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

export function normalizeSourceTable(item = {}) {
  return {
    id: toOpaqueId(item.id),
    tableName: item.tableName || '',
    tableType: item.tableType || '',
    comment: item.comment ?? '',
    fieldCount: item.fieldCount ?? 0
  }
}

export function normalizeSourceField(item = {}) {
  return {
    columnName: item.columnName || '',
    columnType: item.columnType || '',
    nullable: item.nullable ?? null,
    comment: item.comment ?? ''
  }
}

export function normalizeDataDomain(item = {}) {
  return {
    id: toOpaqueId(item.id ?? item.domainId),
    code: item.code || item.domainCode || '',
    name: item.name || item.domainName || '',
    description: item.description ?? '',
    status: item.status || '',
    createdAt: item.createdAt || ''
  }
}

export function normalizeSemanticTable(item = {}) {
  return {
    id: toOpaqueId(item.id),
    domainId: toOpaqueId(item.domainId),
    code: item.code || item.semanticTableCode || '',
    name: item.name || item.semanticTableName || '',
    sourceTableName: item.sourceTableName || item.tableName || '',
    sourceObjectType: item.sourceObjectType || '',
    defaultTimeSemanticFieldCode: item.defaultTimeSemanticFieldCode || null,
    status: item.status || ''
  }
}

export function normalizeSemanticField(item = {}) {
  const semanticKind = String(item.semanticKind || item.semanticRole || item.role || '').toUpperCase()
  return {
    id: toOpaqueId(item.id),
    domainId: toOpaqueId(item.domainId),
    tableCode: item.tableCode || item.semanticTableCode || '',
    code: item.code || item.fieldCode || item.semanticCode || '',
    name: item.name || item.fieldName || item.semanticName || '',
    dataType: item.dataType || '',
    semanticKind,
    semanticRole: semanticKind,
    groupable: item.groupable,
    aggregatable: item.aggregatable,
    filterable: item.filterable,
    options: item.options || item.values || item.enumValues || [],
    sensitive: normalizeBoolean(item.sensitive),
    sourceFieldName: item.sourceFieldName || item.sourceColumn || item.columnName || '',
    sourceFieldMappingId: toOpaqueId(item.sourceFieldMappingId ?? item.mappingId),
    valueSetId: toOpaqueId(item.valueSetId),
    resourceVersion: item.resourceVersion ?? null
  }
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  return false
}
