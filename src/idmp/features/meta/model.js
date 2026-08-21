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

const labelFor = (labels, value) => {
  const raw = String(value ?? '')
  return labels[raw.trim().toUpperCase()] || raw
}

const MATCH_MODE_LABELS = {
  EXACT: '精确匹配',
  PREFIX: '前缀匹配',
  RANGE: '范围匹配',
  HIERARCHICAL: '层级匹配'
}

const DATA_TYPE_LABELS = {
  STRING: '文本',
  INTEGER: '整数',
  DECIMAL: '小数',
  NUMBER: '数值',
  DATE: '日期',
  DATETIME: '日期时间',
  BOOLEAN: '布尔',
  CODE: '编码',
  VALUE_SET: '值集'
}

const SEMANTIC_KIND_LABELS = {
  DIMENSION: '维度',
  MEASURE: '度量',
  ATTRIBUTE: '属性'
}

const SOURCE_OBJECT_TYPE_LABELS = {
  'BASE TABLE': '数据表',
  BASE_TABLE: '数据表',
  TABLE: '数据表',
  VIEW: '视图',
  'MATERIALIZED VIEW': '物化视图',
  MATERIALIZED_VIEW: '物化视图'
}

const TRANSFORM_OPTION_LABELS = {
  REJECT: '拒绝',
  KEEP_SOURCE: '保留源值',
  SET_NULL: '置空',
  KEEP_NULL: '保留空值',
  TRIM: '去除首尾空白',
  UPPER: '转为大写',
  LOWER: '转为小写'
}

export const matchModeLabel = (value) => labelFor(MATCH_MODE_LABELS, value)
export const dataTypeLabel = (value) => labelFor(DATA_TYPE_LABELS, value)
export const semanticKindLabel = (value) => labelFor(SEMANTIC_KIND_LABELS, value)
export const sourceObjectTypeLabel = (value) => labelFor(SOURCE_OBJECT_TYPE_LABELS, value)
export const transformOptionLabel = (value) => labelFor(TRANSFORM_OPTION_LABELS, value)

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
