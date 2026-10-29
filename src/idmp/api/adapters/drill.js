import { toOpaqueId } from '../../utils/resourceId.js'
import { drillResultMetrics } from './result.js'

export const DRILL_DIMENSIONS = Object.freeze({
  ORGANIZATION: 'ORGANIZATION',
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

export function normalizeOrganizationDrillLevel(value) {
  const level = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return { DEPARTMENT: 'OUT_DEPT', DOCTOR: 'ATTENDING_DOCTOR' }[level] || level
}

export function normalizeDrillLevelDefinition(level = {}) {
  const dimensionFieldCode = level.dimensionFieldCode || level.dimensionSemanticFieldCode
  const memberKeyFieldCode = level.memberKeyFieldCode || level.memberKeySemanticFieldCode
  const displayFieldCode = level.displayFieldCode || level.displaySemanticFieldCode
  if (dimensionFieldCode === level.dimensionFieldCode && memberKeyFieldCode === level.memberKeyFieldCode && displayFieldCode === level.displayFieldCode) return level
  return { ...level,
    ...(dimensionFieldCode ? { dimensionFieldCode } : {}),
    ...(memberKeyFieldCode ? { memberKeyFieldCode } : {}),
    ...(displayFieldCode ? { displayFieldCode } : {}) }
}

export function canonicalDrillRootResultId(result, rootLevel) {
  const level = normalizeOrganizationDrillLevel(rootLevel)
  const root = result?.records?.find(row => normalizeOrganizationDrillLevel(row.levelCode) === level && row.resultId)
  return toOpaqueId(root?.resultId)
}

export function limitDrillNextLevels(nextLevels = [], path, maxLevel = path?.maxLevel) {
  if (!path?.levels?.length) return []
  const maxIndex = path.levels.findIndex(level => level.levelCode === maxLevel)
  const allowed = new Set((maxIndex < 0 ? path.levels : path.levels.slice(0, maxIndex + 1)).map(level => level.levelCode))
  return (Array.isArray(nextLevels) ? nextLevels : []).filter(level => allowed.has(level))
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
  if (level !== 'HOSPITAL') return summary
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
  value = value || {}
  return {
    ...value,
    ...drillResultMetrics(value),
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

export function deriveDrillPathResultIds(analysis = {}, configuredPaths = []) {
  const departmentAnchor = (Array.isArray(analysis.departmentComparison) ? analysis.departmentComparison : [])
    .find((item) => item?.resultId)
  const candidates = [analysis.overview, ...(Array.isArray(analysis.dimensionComparison) ? analysis.dimensionComparison : [])]
    .filter((item) => item?.resultId)
  const selected = {}
  if (departmentAnchor) {
    selected.ORGANIZATION = toOpaqueId(departmentAnchor.resultId)
  }
  if (!selected.ORGANIZATION && analysis.overview?.resultId) {
    selected.ORGANIZATION = toOpaqueId(analysis.overview.resultId)
  }
  // 自定义路径的根结果可能不会出现在 overview（汇总值没有 resultId）。
  // 后端可通过路径编码从同周期的任一结果定位对应的根快照。
  const customAnchor = toOpaqueId(
    analysis.overview?.resultId || candidates[0]?.resultId || analysis.resultContext?.resultId
  )
  if (customAnchor) {
    configuredPaths.forEach((path) => {
      const code = String(path?.pathCode || '')
      if (code.startsWith('CUSTOM_') || (code === 'ORGANIZATION' && !selected[code])) selected[code] = customAnchor
    })
  }
  return selected
}

function normalizeRecord(item = {}) {
  const dimensionKey = toOpaqueId(item.dimensionKey ?? item.dimKey ?? item.key)
  const dimensionName = item.dimensionName || item.dimensionLabel || item.name || item.displayValue || '-'
  const dimensionLabel = item.dimensionLabel && String(item.dimensionLabel) !== dimensionKey
    ? item.dimensionLabel : dimensionName
  return {
    ...item,
    resultId: toOpaqueId(item.resultId),
    levelCode: item.levelCode || item.level || '',
    dimensionKey,
    dimensionName,
    dimensionLabel,
    ...drillResultMetrics(item),
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
