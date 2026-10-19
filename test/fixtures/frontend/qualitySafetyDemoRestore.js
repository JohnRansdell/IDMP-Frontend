export const QUALITY_SAFETY_DASHBOARD_ID = 'quality-overview-quality-safety'

export function canRestoreQualitySafetyDemo({ isEditing = false, dashboardId = '' } = {}) {
  return isEditing === true && dashboardId === QUALITY_SAFETY_DASHBOARD_ID
}

export function createQualitySafetyDemoRestoreResult(schema) {
  return { schema, dirty: true }
}
