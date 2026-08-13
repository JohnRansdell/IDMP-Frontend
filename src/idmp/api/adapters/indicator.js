const runtimeEnv = typeof import.meta.env === 'object' && import.meta.env ? import.meta.env : {}

export const defaultDrillConfig = Object.freeze({
  pathCode: runtimeEnv.VITE_DEFAULT_DRILL_PATH_CODE || 'ORGANIZATION',
  maxLevel: runtimeEnv.VITE_DEFAULT_DRILL_MAX_LEVEL || 'OUT_DEPT',
  pathVersionId: ''
})

export function normalizeDrillConfig(payload, fallback = defaultDrillConfig) {
  const paths = payload?.drillPaths
    || payload?.drillConfig?.paths
    || payload?.drillConfig?.drillPaths
    || payload?.drillConfig
    || []
  const path = Array.isArray(paths) ? paths[0] : paths

  return {
    pathCode: String(path?.pathCode || fallback.pathCode || ''),
    maxLevel: String(path?.maxLevel || fallback.maxLevel || ''),
    pathVersionId: String(path?.pathVersionId || payload?.drillConfig?.pathVersionId || fallback.pathVersionId || '')
  }
}

export function buildIndicatorVersionPayload({ copyFromVersionId = '', drillConfig, formula } = {}) {
  const normalized = normalizeDrillConfig({ drillConfig }, { ...defaultDrillConfig, ...drillConfig })
  if (!normalized.pathCode || !normalized.maxLevel) {
    throw new Error('创建指标版本前必须选择下钻路径和最大层级')
  }

  return {
    ...(copyFromVersionId ? { copyFromVersionId: String(copyFromVersionId) } : {}),
    ...(formula ? { formula } : {}),
    drillPaths: [{
      pathCode: normalized.pathCode,
      maxLevel: normalized.maxLevel
    }]
  }
}
