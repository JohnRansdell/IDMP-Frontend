// Local-only registry: metadata points at independent persisted dashboards; it
// intentionally contains no server catalog claim and no full schema copies.
export const LOCAL_SCENE_DASHBOARDS = Object.freeze([
  { dashboardId: 'quality-overview-performance', sceneCode: 'performance', name: '绩效考核', dashboardType: 'scene' },
  { dashboardId: 'quality-overview-accreditation', sceneCode: 'accreditation', name: '医院评审', dashboardType: 'scene' },
  { dashboardId: 'quality-overview-quality-safety', sceneCode: 'quality-safety', name: '质量安全', dashboardType: 'scene' }
])
export function findLocalScene(sceneCode) { return LOCAL_SCENE_DASHBOARDS.find(item => item.sceneCode === sceneCode) || null }
export function isLocalSceneDashboardId(id) { return LOCAL_SCENE_DASHBOARDS.some(item => item.dashboardId === id) }
