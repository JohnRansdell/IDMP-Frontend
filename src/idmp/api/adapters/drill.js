export const DRILL_DIMENSIONS = Object.freeze({
  TIME: 'TIME',
  ORGANIZATION: 'ORGANIZATION',
  DISEASE: 'DISEASE',
  FACTOR: 'FACTOR',
  SCENARIO: 'SCENARIO'
})

export const DRILL_LEVELS = Object.freeze({
  HOSPITAL: 'HOSPITAL',
  DEPARTMENT: 'DEPARTMENT',
  MEDICAL_GROUP: 'MEDICAL_GROUP',
  DOCTOR: 'DOCTOR',
  PATIENT: 'PATIENT'
})

export function adaptDrillResult(payload = {}) {
  const data = payload?.data || payload || {}
  return {
    context: normalizeContext(data.context),
    breadcrumb: Array.isArray(data.breadcrumb) ? data.breadcrumb.map(normalizeBreadcrumb) : [],
    summary: data.summary || {},
    columns: Array.isArray(data.columns) ? data.columns.map(normalizeColumn) : [],
    records: Array.isArray(data.records) ? data.records : [],
    nextLevels: Array.isArray(data.nextLevels) ? data.nextLevels : [],
    pageInfo: normalizePageInfo(data.pageInfo),
    lineageAvailable: Boolean(data.lineageAvailable),
    exportAvailable: Boolean(data.exportAvailable),
    permissions: data.permissions || {},
    dataSource: data.dataSource || 'live'
  }
}

function normalizeContext(value = {}) {
  return {
    ...value,
    resultId: toOpaqueId(value.resultId),
    snapshotId: toOpaqueId(value.snapshotId),
    indicatorId: toOpaqueId(value.indicatorId),
    indicatorVersionId: toOpaqueId(value.indicatorVersionId),
    scenarioVersionId: toOpaqueId(value.scenarioVersionId)
  }
}

function normalizeBreadcrumb(item = {}) {
  return {
    ...item,
    level: String(item.level || ''),
    label: item.label || item.name || item.value || '-',
    key: toOpaqueId(item.key)
  }
}

function normalizeColumn(item = {}) {
  return {
    ...item,
    field: String(item.field || item.code || ''),
    label: item.label || item.name || item.field || '-',
    sortable: Boolean(item.sortable),
    sensitive: Boolean(item.sensitive)
  }
}

function normalizePageInfo(value = {}) {
  return {
    pageNum: Number(value.pageNum || value.page || 1),
    pageSize: Number(value.pageSize || value.size || 20),
    total: Number(value.total || 0),
    totalPages: Number(value.totalPages || 0)
  }
}

function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}
