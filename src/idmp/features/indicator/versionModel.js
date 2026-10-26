import { toOpaqueId } from '../../utils/resourceId.js'

export function resolveIndicatorVersionId(version) {
  return toOpaqueId(version?.indicatorVersionId ?? version?.versionId ?? version?.draftVersionId
    ?? version?.currentVersionId ?? version?.latestVersionId ?? version?.id
    ?? version?.version?.id ?? version?.version?.indicatorVersionId)
}

export function extractFormula(payload) {
  return payload?.formula?.formula || payload?.formula || payload?.formulaAst || payload?.definition?.formula || null
}

export function pickLatestVersion(versions) {
  return [...versions].sort((a, b) => {
    const difference = Number(b.versionNo ?? b.version ?? 0) - Number(a.versionNo ?? a.version ?? 0)
    return difference || String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || ''))
  })[0]
}
