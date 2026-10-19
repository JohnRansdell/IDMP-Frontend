import { isLocalSceneDashboardId } from './sceneRegistry.js'
export const dashboardOrigin = id => isLocalSceneDashboardId(id) ? 'system-scene' : 'local'
export const shouldSkipRemoteDashboardBootstrap = id => dashboardOrigin(id) === 'local'
export * from '../../../src/idmp/features/dashboard/dashboardIdentity.js'
