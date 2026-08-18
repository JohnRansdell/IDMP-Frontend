const runtimeEnv = typeof import.meta.env === 'object' && import.meta.env ? import.meta.env : {}

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
    if (!dimension?.supported) return `${pathCode} 当前不支持下钻`
    const allowedLevels = dimension.levels.map((level) => level.code)
    if (allowedLevels.length && !allowedLevels.includes(maxLevel)) {
      return `${pathCode} 不支持层级 ${maxLevel}`
    }
    if (!allowedLevels.length && dimension.maxLevel && dimension.maxLevel !== maxLevel) {
      return `${pathCode} 仅支持最大层级 ${dimension.maxLevel}`
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
