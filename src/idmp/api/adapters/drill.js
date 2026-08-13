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
    summary: normalizeSummary(data.summary),
    columns: Array.isArray(data.columns) ? data.columns.map(normalizeColumn) : [],
    records: Array.isArray(data.records) ? data.records.map(normalizeRecord) : [],
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

function normalizeSummary(value = {}) {
  return {
    ...value,
    indicatorValue: value.indicatorValue ?? value.value ?? null,
    displayValue: value.displayValue ?? null,
    numerator: value.numerator ?? value.numeratorValue ?? null,
    denominator: value.denominator ?? value.denominatorValue ?? null,
    qualityStatus: value.qualityStatus || '-'
  }
}

function normalizeBreadcrumb(item = {}) {
  return {
    ...item,
    level: String(item.level || item.levelCode || ''),
    label: item.label || item.displayValue || item.name || item.value || '-',
    key: toOpaqueId(item.key ?? item.dimensionKey)
  }
}

function normalizeColumn(item = {}) {
  return {
    ...item,
    field: String(item.field || item.code || ''),
    label: item.label || item.title || item.name || item.field || '-',
    sortable: Boolean(item.sortable),
    sensitive: Boolean(item.sensitive)
  }
}

export function deriveDrillPathResultIds(analysis = {}) {
  const candidates = [analysis.overview, ...(Array.isArray(analysis.dimensionComparison) ? analysis.dimensionComparison : [])]
    .filter((item) => item?.resultId)
  const selected = {}
  const scores = { ORGANIZATION: -1, DISEASE: -1 }

  candidates.forEach((item) => {
    const dimensions = normalizeDimensionKeys(item.dimensions)
    const organizationScore = scoreOrganizationDimensions(dimensions)
    const diseaseScore = scoreDiseaseDimensions(dimensions)
    if (organizationScore > scores.ORGANIZATION) {
      scores.ORGANIZATION = organizationScore
      selected.ORGANIZATION = toOpaqueId(item.resultId)
    }
    if (diseaseScore > scores.DISEASE) {
      scores.DISEASE = diseaseScore
      selected.DISEASE = toOpaqueId(item.resultId)
    }
  })

  if (scores.ORGANIZATION <= 0) delete selected.ORGANIZATION
  if (scores.DISEASE <= 0) delete selected.DISEASE
  if (!selected.ORGANIZATION && !selected.DISEASE && analysis.overview?.resultId) {
    selected.ORGANIZATION = toOpaqueId(analysis.overview.resultId)
  }
  return selected
}

function normalizeDimensionKeys(dimensions = {}) {
  return new Set(Object.keys(dimensions || {}).map((key) => key.toLowerCase()))
}

function scoreOrganizationDimensions(keys) {
  if (hasAnyKey(keys, ['attending_doctor_code', 'attending_doctor_name', 'doctor_code', 'doctor_name'])) return 40
  if (hasAnyKey(keys, ['medical_group_code', 'medical_group_name'])) return 30
  if (hasAnyKey(keys, ['out_dept_code', 'out_dept_name', 'department_code', 'department_name'])) return 20
  return 0
}

function scoreDiseaseDimensions(keys) {
  if (hasAnyKey(keys, ['visit_id', 'patient_id', 'patient_name', 'case_id'])) return 40
  if (hasAnyKey(keys, ['single_disease_code', 'single_disease_name'])) return 30
  if (hasAnyKey(keys, ['direct_death', 'diagnosis_code', 'diagnosis_name', 'disease_code', 'disease_name'])) return 20
  return 0
}

function hasAnyKey(keys, candidates) {
  return candidates.some((key) => keys.has(key))
}

function normalizeRecord(item = {}) {
  return {
    ...item,
    levelCode: item.levelCode || item.level || '',
    dimensionKey: toOpaqueId(item.dimensionKey ?? item.key),
    dimensionName: item.dimensionName || item.dimensionLabel || item.name || item.displayValue || '-',
    dimensionLabel: item.dimensionLabel || item.dimensionName || item.name || item.displayValue || '-',
    displayValue: item.displayValue ?? item.indicatorValue ?? item.value ?? null,
    nextLevel: item.nextLevel || ''
  }
}

function normalizePageInfo(value = {}) {
  return {
    pageNum: Number(value.pageNum || value.page || 1),
    pageSize: Number(value.pageSize || value.size || 20),
    total: Number(value.total || 0),
    totalPages: Number(value.totalPages || value.pages || 0)
  }
}

function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}
