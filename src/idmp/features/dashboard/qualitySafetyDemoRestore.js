export function canRestoreQualitySafetyDemo({ isEditing = false, isDemoRuntime = false, sceneCode = '' } = {}) {
  return isEditing === true && isDemoRuntime === true && sceneCode === 'quality-safety'
}

export function createQualitySafetyDemoRestoreResult(schema) {
  return { schema, dirty: true }
}
