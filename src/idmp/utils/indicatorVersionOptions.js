export function groupIndicatorVersions(options = []) {
  const groups = new Map()
  for (const item of options) {
    const versionId = String(item.id || item.indicatorVersionId || item.versionId || '')
    if (!versionId) continue
    const id = String(item.indicatorId || item.indicatorCode || `version:${versionId}`)
    if (!groups.has(id)) groups.set(id, { id, name: item.indicatorName || item.name || '未命名指标', versions: [] })
    const group = groups.get(id)
    if (!group.versions.some(version => version.id === versionId)) group.versions.push({ ...item, id: versionId })
  }
  for (const group of groups.values()) group.versions.sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0))
  return [...groups.values()]
}
