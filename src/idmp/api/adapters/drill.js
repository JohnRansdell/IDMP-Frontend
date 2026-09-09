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

const DRILL_LEVEL_RANKS = Object.freeze({
  ORGANIZATION: Object.freeze({
    HOSPITAL: 1,
    OUT_DEPT: 2,
    DEPARTMENT: 2,
    MEDICAL_GROUP: 3,
    ATTENDING_DOCTOR: 4,
    DOCTOR: 4
  }),
  DISEASE: Object.freeze({
    ALL_SINGLE_DISEASE: 1,
    SINGLE_DISEASE: 2,
    CASE: 3,
    PATIENT: 3
  })
})

export function normalizeOrganizationDrillLevel(value) {
  const level = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return { DEPARTMENT: 'OUT_DEPT', DOCTOR: 'ATTENDING_DOCTOR' }[level] || level
}

export function limitDrillNextLevels(nextLevels = [], pathCode = '', maxLevel = '') {
  const levels = Array.isArray(nextLevels) ? nextLevels : []
  const ranks = DRILL_LEVEL_RANKS[pathCode] || {}
  const maxRank = ranks[maxLevel]
  if (!maxRank) return levels
  return levels.filter((level) => ranks[level] && ranks[level] <= maxRank)
}

export function reconcileScenarioPointWithRoot(point = {}, drillResult = {}, rootLevel = 'HOSPITAL') {
  const expectedLevel = String(rootLevel || '').toUpperCase()
  const rootRecord = (Array.isArray(drillResult.records) ? drillResult.records : []).find((record) => (
    String(record?.levelCode || '').toUpperCase() === expectedLevel && record?.resultId
  ))
  if (!rootRecord) return point
  return {
    ...point,
    resultId: rootRecord.resultId,
    value: rootRecord.indicatorValue ?? rootRecord.value ?? point.value,
    displayValue: rootRecord.displayValue ?? point.displayValue,
    qualityStatus: rootRecord.qualityStatus ?? point.qualityStatus,
    outcomeStatus: rootRecord.resultOutcomeStatus ?? rootRecord.outcomeStatus ?? point.outcomeStatus,
    qualityFlags: rootRecord.resultQualityFlags ?? rootRecord.qualityFlags ?? point.qualityFlags
  }
}

export function adaptDrillResult(payload = {}) {
  const data = payload?.data || payload || {}
  const context = normalizeContext(data.context)
  const records = Array.isArray(data.records) ? data.records.map(normalizeRecord) : []
  return {
    context,
    breadcrumb: Array.isArray(data.breadcrumb) ? data.breadcrumb.map(normalizeBreadcrumb) : [],
    summary: reconcileRootSummary(normalizeSummary(data.summary), records, context.currentLevel),
    columns: Array.isArray(data.columns) ? data.columns.map(normalizeColumn) : [],
    records,
    nextLevels: Array.isArray(data.nextLevels) ? data.nextLevels : [],
    pageInfo: normalizePageInfo(data.pageInfo),
    lineageAvailable: Boolean(data.lineageAvailable),
    exportAvailable: Boolean(data.exportAvailable),
    permissions: data.permissions || {},
    dataSource: data.dataSource || 'live'
  }
}

function reconcileRootSummary(summary, records, currentLevel) {
  const level = String(currentLevel || '').toUpperCase()
  if (!['HOSPITAL', 'ALL_SINGLE_DISEASE'].includes(level)) return summary
  const rootRecord = records.find((record) => String(record.levelCode || '').toUpperCase() === level)
  if (!rootRecord) return summary
  return normalizeSummary({ ...summary, ...rootRecord })
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
  const scores = { ORGANIZATION: Number.POSITIVE_INFINITY, DISEASE: -1 }
  const targetCodes = (Array.isArray(analysis.calculationTargets) ? analysis.calculationTargets : [])
    .map((target) => String(target?.targetCode || '').toUpperCase())
  const hasOrganizationTarget = targetCodes.some((code) => code.startsWith('DRILL:ORGANIZATION:'))
  const hasDiseaseTarget = targetCodes.some((code) => code.startsWith('DRILL:DISEASE:'))
  let organizationSpecificCandidate = null

  candidates.forEach((item) => {
    const dimensions = normalizeDimensionKeys(item.dimensions)
    const organizationScore = scoreOrganizationDimensions(dimensions)
    const diseaseScore = scoreDiseaseDimensions(dimensions)
    // 下钻接口必须始终使用路径根结果作为锚点；组织路径优先全院，而不是更深的科室/医生结果。
    if (organizationScore > 0 && organizationScore < scores.ORGANIZATION) {
      scores.ORGANIZATION = organizationScore
      selected.ORGANIZATION = toOpaqueId(item.resultId)
    }
    if (organizationScore >= 20 && (!organizationSpecificCandidate || organizationScore < organizationSpecificCandidate.score)) {
      organizationSpecificCandidate = { score: organizationScore, resultId: toOpaqueId(item.resultId) }
    }
    if (diseaseScore > scores.DISEASE) {
      scores.DISEASE = diseaseScore
      selected.DISEASE = toOpaqueId(item.resultId)
    }
  })

  if (!Number.isFinite(scores.ORGANIZATION)) delete selected.ORGANIZATION
  if (scores.DISEASE <= 0) delete selected.DISEASE
  // 当同一批次同时计算组织与病种路径时，全院维度结果可能被最后激活的病种
  // 快照占用。科室结果则必然属于组织快照，可先用它进入组织路径，再由根层
  // 响应解析出真正的全院 resultId。
  if (hasOrganizationTarget && hasDiseaseTarget && organizationSpecificCandidate) {
    selected.ORGANIZATION = organizationSpecificCandidate.resultId
  }
  if (hasDiseaseTarget && !selected.DISEASE) {
    selected.DISEASE = toOpaqueId(analysis.overview?.resultId || analysis.resultContext?.resultId)
  }
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
  if (hasAnyKey(keys, ['hospital_code', 'hospital_name'])) return 10
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
    resultId: toOpaqueId(item.resultId),
    levelCode: item.levelCode || item.level || '',
    dimensionKey: toOpaqueId(item.dimensionKey ?? item.dimKey ?? item.key),
    dimensionName: item.dimensionName || item.dimensionLabel || item.name || item.displayValue || '-',
    dimensionLabel: item.dimensionLabel || item.dimensionName || item.name || item.displayValue || '-',
    displayValue: item.displayValue ?? item.indicatorValue ?? item.value ?? null,
    indicatorValue: item.indicatorValue ?? item.value ?? null,
    numerator: item.numerator ?? item.numeratorValue ?? null,
    denominator: item.denominator ?? item.denominatorValue ?? null,
    unit: item.unit ?? item.indicatorUnit ?? '',
    nextLevel: item.nextLevel || ''
  }
}

function normalizePageInfo(value = {}) {
  const pageNum = value.pageNum ?? value.page
  const pageSize = value.pageSize ?? value.size
  const totalPages = value.totalPages ?? value.pages
  return {
    pageNum: Number(pageNum || 1),
    pageSize: Number(pageSize || 20),
    total: Number(value.total || 0),
    totalPages: Number(totalPages || 0),
    hasPageNum: isPageNumber(pageNum, 1),
    hasPageSize: isPageNumber(pageSize, 1),
    hasTotal: isPageNumber(value.total, 0),
    hasTotalPages: isPageNumber(totalPages, 0)
  }
}

function isPageNumber(value, minimum) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= minimum
}

function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}
