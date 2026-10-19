// Dedicated acceptance fixture; it never appears as a server catalog entry.
export const LOCAL_SCENE_DASHBOARDS = Object.freeze([
  { dashboardId: 'quality-overview-quality-safety', sceneCode: 'quality-safety', name: '质量安全', dashboardType: 'scene' }
])
export function findLocalScene(sceneCode) { return LOCAL_SCENE_DASHBOARDS.find(item => item.sceneCode === sceneCode) || null }
export function findLocalSceneByDashboardId(dashboardId) { return LOCAL_SCENE_DASHBOARDS.find(item => item.dashboardId === dashboardId) || null }
export function isLocalSceneDashboardId(id) { return LOCAL_SCENE_DASHBOARDS.some(item => item.dashboardId === id) }
export function visibleDemoSceneDashboards({ previewMode = '', explicit = false, dashboardId = '' } = {}) {
  return previewMode === '1' || explicit || isLocalSceneDashboardId(dashboardId) ? LOCAL_SCENE_DASHBOARDS : []
}
export function shouldConfirmDashboardSceneSwitch({ isEditing = false, dirty = false } = {}) { return isEditing === true && dirty === true }
