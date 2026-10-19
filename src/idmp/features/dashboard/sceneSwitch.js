export function shouldConfirmDashboardSceneSwitch({ isEditing = false, dirty = false } = {}) {
  return isEditing === true && dirty === true
}
