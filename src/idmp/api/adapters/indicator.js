const runtimeEnv = typeof import.meta.env === 'object' && import.meta.env ? import.meta.env : {}

const DRILL_PATH_LABELS = {
  ORGANIZATION: '组织维度',
  DISEASE: '病种维度',
  TIME: '时间维度',
  FACTOR: '因子维度',
  SCENARIO: '场景维度'
}

const DRILL_LEVEL_LABELS = {
  HOSPITAL: '医院',
  OUT_DEPT: '科室',
  DEPARTMENT: '科室',
  MEDICAL_GROUP: '医疗组',
  ATTENDING_DOCTOR: '主治医师',
  DOCTOR: '医师',
  ALL_SINGLE_DISEASE: '全部病种',
  SINGLE_DISEASE: '单病种',
  CASE: '病例',
  PATIENT: '患者',
  YEAR: '年',
  QUARTER: '季度',
  MONTH: '月',
  WEEK: '周',
  DAY: '日'
}

export const drillPathLabel = value => DRILL_PATH_LABELS[String(value || '').toUpperCase()] || value || '-'
export const drillLevelLabel = value => DRILL_LEVEL_LABELS[String(value || '').toUpperCase()] || value || '-'

export function combineFormulaNodes(nodes = [], operator = 'ADD', prefix = 'formula') {
  if (!Array.isArray(nodes) || !nodes.length) return null
  return nodes.slice(1).reduce((left, right, index) => ({
    nodeId: `${prefix}_${String(operator).toLowerCase()}_${index + 1}`,
    nodeType: 'BINARY',
    operator,
    left,
    right
  }), nodes[0])
}

export function selectIndicatorSummaryRecord(payload = {}) {
  const records = payload?.results?.records || payload?.records || []
  if (!Array.isArray(records) || !records.length) return null

  return records.reduce((selected, record) => (
    indicatorResultGrainRank(record) < indicatorResultGrainRank(selected) ? record : selected
  ), records[0])
}

export function normalizeIndicatorTrialResults(payload = {}) {
  const data = payload?.data || payload || {}
  const responseTargets = Array.isArray(data.targets) ? data.targets : []
  const targets = responseTargets.length
    ? responseTargets.map(normalizeIndicatorTrialTarget).filter(Boolean)
    : createLegacyIndicatorTrialTargets(data)

  return {
    batchId: toOpaqueId(data.batchId),
    batchCode: String(data.batchCode || ''),
    batchStatus: String(data.batchStatus || data.status || '').toUpperCase(),
    indicatorVersionId: toOpaqueId(data.indicatorVersionId),
    qualityStatus: String(data.qualityStatus || '').toUpperCase(),
    outcomeStatus: String(data.resultOutcomeStatus || data.outcomeStatus || '').toUpperCase(),
    periodStart: String(data.periodStart || ''),
    periodEnd: String(data.periodEnd || ''),
    factorDataProfiles: Array.isArray(data.factorDataProfiles) ? data.factorDataProfiles.map((item) => ({ ...item })) : [],
    targets
  }
}

export function selectDefaultIndicatorTrialTarget(targets = []) {
  const list = Array.isArray(targets) ? targets : []
  return list.find((target) => target.pathCode === 'TIME' && target.levelCode === 'MONTH')
    || [...list].sort((left, right) => right.grain.length - left.grain.length)[0]
    || null
}

export function formatIndicatorTrialPeriod(record = {}, target = {}) {
  const dimensions = record?.dimensions || record?.dimensionValues || {}
  const year = presentDimension(dimensions, 'time_year', 'TIME_YEAR')
  const quarter = presentDimension(dimensions, 'time_quarter', 'TIME_QUARTER')
  const month = presentDimension(dimensions, 'time_month', 'TIME_MONTH')
  const level = String(target?.levelCode || '').toUpperCase()
  if (level === 'MONTH' && year !== '' && month !== '') return `${year}-${String(month).padStart(2, '0')}`
  if (level === 'QUARTER' && year !== '' && quarter !== '') return `${year} Q${quarter}`
  if (level === 'YEAR' && year !== '') return String(year)
  const entries = Object.entries(dimensions).filter(([, value]) => value !== undefined && value !== null && value !== '')
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join('，') : '总体'
}

function normalizeIndicatorTrialTarget(target, index) {
  if (!target || typeof target !== 'object') return null
  const results = target.results || {}
  const records = Array.isArray(results.records) ? results.records.map(normalizeIndicatorTrialRecord) : []
  const pathCode = String(target.drillPathCode || target.pathCode || '').toUpperCase()
  const levelCode = String(target.drillLevelCode || target.levelCode || '').toUpperCase()
  const targetId = toOpaqueId(target.targetId || target.id)
  const targetCode = String(target.targetCode || '')
  return {
    key: targetId || targetCode || `${pathCode}:${levelCode}:${index}`,
    targetId,
    targetCode,
    pathCode,
    levelCode,
    grain: Array.isArray(target.grain) ? target.grain.map(String) : [],
    status: String(target.targetStatus || target.status || '').toUpperCase(),
    resultSetId: toOpaqueId(target.resultSetId),
    resultSetStatus: String(target.resultSetStatus || '').toUpperCase(),
    qualityStatus: String(target.qualityStatus || '').toUpperCase(),
    outcomeStatus: String(target.resultOutcomeStatus || target.outcomeStatus || '').toUpperCase(),
    qualityFlags: Array.isArray(target.resultQualityFlags) ? [...target.resultQualityFlags] : [],
    errorMessage: target.errorMessage || null,
    factorDataProfiles: Array.isArray(target.factorDataProfiles) ? target.factorDataProfiles.map((item) => ({ ...item })) : [],
    periodStart: String(target.periodStart || ''),
    periodEnd: String(target.periodEnd || ''),
    records,
    total: toCount(results.total, records.length),
    pageNum: toPositiveInteger(results.pageNum, 1),
    pageSize: toPositiveInteger(results.pageSize, records.length || 100),
    pages: toPositiveInteger(results.pages, records.length ? 1 : 0)
  }
}

function normalizeIndicatorTrialRecord(record = {}) {
  return {
    ...record,
    resultId: toOpaqueId(record.resultId || record.id),
    dimensions: record.dimensions && typeof record.dimensions === 'object' && !Array.isArray(record.dimensions)
      ? { ...record.dimensions }
      : {},
    resultValue: record.resultValue ?? null,
    displayValue: record.displayValue ?? null,
    numeratorValue: record.numeratorValue ?? null,
    denominatorValue: record.denominatorValue ?? null,
    resultUnitCode: record.resultUnitCode ?? null,
    qualityStatus: String(record.qualityStatus || '').toUpperCase(),
    outcomeStatus: String(record.outcomeStatus || '').toUpperCase(),
    qualityFlags: Array.isArray(record.qualityFlags) ? [...record.qualityFlags] : []
  }
}

function createLegacyIndicatorTrialTargets(data) {
  const results = data.results || {}
  if (!Array.isArray(results.records)) return []
  return [normalizeIndicatorTrialTarget({
    targetId: data.targetId,
    targetCode: data.targetCode || 'LEGACY',
    targetStatus: data.targetStatus,
    resultSetId: data.resultSetId,
    resultSetStatus: data.resultSetStatus,
    qualityStatus: data.qualityStatus,
    resultOutcomeStatus: data.resultOutcomeStatus,
    resultQualityFlags: data.resultQualityFlags,
    errorMessage: data.errorMessage,
    factorDataProfiles: data.factorDataProfiles,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    results
  }, 0)].filter(Boolean)
}

function presentDimension(dimensions, ...keys) {
  for (const key of keys) {
    const value = dimensions?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

function toCount(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function toPositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function indicatorResultGrainRank(record = {}) {
  const level = String(record?.levelCode || record?.level || '').toUpperCase()
  if (level === 'HOSPITAL' || level === 'ALL_SINGLE_DISEASE') return 0
  const dimensions = record?.dimensions || record?.dimensionValues
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) return Number.MAX_SAFE_INTEGER
  return Object.keys(dimensions).filter((key) => {
    const value = dimensions[key]
    return value !== undefined && value !== null && value !== ''
  }).length
}

export function normalizeIndicatorAnalysisParams(params = {}) {
  const normalized = { ...params }
  if (normalized.periodStart) normalized.periodStart = toApiDate(normalized.periodStart)
  if (normalized.periodEnd) normalized.periodEnd = toApiDate(normalized.periodEnd)
  return normalized
}

function toApiDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text
}

export const defaultDrillConfig = Object.freeze({
  pathCode: runtimeEnv.VITE_DEFAULT_DRILL_PATH_CODE || 'ORGANIZATION',
  maxLevel: runtimeEnv.VITE_DEFAULT_DRILL_MAX_LEVEL || 'OUT_DEPT',
  pathVersionId: ''
})

export function normalizeDrillPaths(payload, fallback = []) {
  const paths = payload?.drillPaths
    || payload?.drillConfig?.paths
    || payload?.drillConfig?.drillPaths
    || payload?.drillConfig
    || fallback

  const list = Array.isArray(paths) ? paths : [paths]
  return list.map((path) => ({
    pathCode: String(path?.pathCode || ''),
    maxLevel: String(path?.maxLevel || ''),
    pathVersionId: String(path?.pathVersionId || '')
  })).filter((path) => path.pathCode && path.maxLevel)
}

export function normalizeDrillConfig(payload, fallback = defaultDrillConfig) {
  const path = normalizeDrillPaths(payload)[0]

  return {
    pathCode: String(path?.pathCode || fallback.pathCode || ''),
    maxLevel: String(path?.maxLevel || fallback.maxLevel || ''),
    pathVersionId: String(path?.pathVersionId || payload?.drillConfig?.pathVersionId || fallback.pathVersionId || '')
  }
}

export function buildIndicatorVersionPayload({ copyFromVersionId = '', drillConfig, drillPaths, formula } = {}) {
  const normalizedPaths = Array.isArray(drillPaths)
    ? normalizeDrillPaths({ drillPaths })
    : normalizeDrillPaths({ drillConfig }, [{ ...defaultDrillConfig, ...drillConfig }])
  if (!normalizedPaths.length) {
    throw new Error('创建指标版本前必须选择下钻路径和最大层级')
  }
  if (new Set(normalizedPaths.map((path) => path.pathCode)).size !== normalizedPaths.length) {
    throw new Error('同一下钻路径只能选择一次')
  }

  return {
    ...(copyFromVersionId ? { copyFromVersionId: String(copyFromVersionId) } : {}),
    ...(formula ? { formula } : {}),
    drillPaths: normalizedPaths.map(({ pathCode, maxLevel }) => ({ pathCode, maxLevel }))
  }
}

export function normalizeDrillCapabilities(payload = {}) {
  const data = payload?.data || payload || {}
  return {
    factorVersionIds: Array.isArray(data.factorVersionIds) ? data.factorVersionIds.map((id) => String(id)) : [],
    dimensions: Array.isArray(data.dimensions) ? data.dimensions.map((dimension) => ({
      pathCode: String(dimension?.pathCode || ''),
      supported: Boolean(dimension?.supported),
      maxLevel: String(dimension?.maxLevel || ''),
      levels: Array.isArray(dimension?.levels) ? dimension.levels.map((level) => ({
        code: String(level?.code || ''),
        name: String(level?.name || level?.code || '')
      })).filter((level) => level.code) : [],
      limitingFactors: Array.isArray(dimension?.limitingFactors) ? dimension.limitingFactors.map((factor) => ({
        factorVersionId: String(factor?.factorVersionId || ''),
        maxLevel: String(factor?.maxLevel || ''),
        reason: String(factor?.reason || '')
      })) : []
    })).filter((dimension) => dimension.pathCode) : []
  }
}

export function validateDrillSelection(capabilities = {}, drillPaths = []) {
  if (!Array.isArray(drillPaths) || !drillPaths.length) return '请至少选择一条下钻路径'
  const dimensions = new Map((capabilities.dimensions || []).map((dimension) => [dimension.pathCode, dimension]))
  const seen = new Set()
  for (const path of drillPaths) {
    const pathCode = String(path?.pathCode || '')
    const maxLevel = String(path?.maxLevel || '')
    if (!pathCode || !maxLevel) return '下钻路径和最大层级不能为空'
    if (seen.has(pathCode)) return '同一下钻路径只能选择一次'
    seen.add(pathCode)
    const dimension = dimensions.get(pathCode)
    if (!dimension?.supported) return `${drillPathLabel(pathCode)}当前不支持下钻`
    const allowedLevels = dimension.levels.map((level) => level.code)
    if (allowedLevels.length && !allowedLevels.includes(maxLevel)) {
      return `${drillPathLabel(pathCode)}不支持层级“${drillLevelLabel(maxLevel)}”`
    }
    if (!allowedLevels.length && dimension.maxLevel && dimension.maxLevel !== maxLevel) {
      return `${drillPathLabel(pathCode)}仅支持到“${drillLevelLabel(dimension.maxLevel)}”层级`
    }
  }
  return ''
}

export function requiredGrainForDrill(drillConfig = {}) {
  const pathCode = String(drillConfig.pathCode || '').toUpperCase()
  const maxLevel = String(drillConfig.maxLevel || '').toUpperCase()
  if (pathCode !== 'ORGANIZATION') return []
  if (maxLevel === 'HOSPITAL') return ['HOSPITAL_CODE']
  if (maxLevel === 'OUT_DEPT') return ['HOSPITAL_CODE', 'OUT_DEPT_CODE']
  return []
}

export function findUnsupportedDrillFactors(factors = [], drillConfig = {}) {
  const required = requiredGrainForDrill(drillConfig)
  if (!required.length) return []
  return factors.map((factor) => {
    const grain = factor?.dsl?.output?.grain || factor?.output?.grain || factor?.dsl?.groupBy || []
    const available = new Set(grain.map((item) => String(item?.fieldCode || item).toUpperCase()))
    const missing = required.filter((code) => !available.has(code))
    return missing.length ? { factor, missing } : null
  }).filter(Boolean)
}
