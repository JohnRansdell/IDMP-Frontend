import { isLocalSceneDashboardId } from './sceneRegistry.js'

export function dashboardOrigin(dashboardId) {
  return isLocalSceneDashboardId(dashboardId) ? 'system-scene' : 'local'
}

export function shouldSkipRemoteDashboardBootstrap(dashboardId) {
  return dashboardOrigin(dashboardId) === 'local'
}

export function canApplyDashboardLoad({ generation, latestGeneration, targetDashboardId, activeDashboardId } = {}) {
  return generation === latestGeneration && targetDashboardId === activeDashboardId
}

export function canRefreshRemoteDashboard({ activeDashboardId, schemaDashboardId, metadataDashboardId, publishedVersionId, isMock, isLoading } = {}) {
  const id = String(activeDashboardId || '')
  return Boolean(id && publishedVersionId && !isMock && !isLoading
    && id === String(schemaDashboardId || '')
    && id === String(metadataDashboardId || ''))
}

export function createDashboardSelectorOptions(scenes = [], catalog = []) {
  const systemIds = new Set(scenes.map(item => item.dashboardId))
  return [
    ...scenes.map(item => ({ id: item.dashboardId, name: item.name, origin: 'system-scene' })),
    ...catalog.filter(item => !systemIds.has(item.id)).map(item => ({ id: item.id, name: item.name, origin: 'local', dashboardType: item.dashboardType, scope: item.scope }))
  ]
}
