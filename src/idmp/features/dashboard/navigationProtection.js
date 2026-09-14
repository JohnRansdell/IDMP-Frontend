export const DASHBOARD_UNSAVED_MESSAGE = '当前看板存在未保存修改，确定要离开吗？'

export function shouldProtectDashboardNavigation(dirty) {
  return dirty === true
}

export function handleDashboardBeforeUnload(event, dirty) {
  if (!shouldProtectDashboardNavigation(dirty)) return false
  event.preventDefault()
  event.returnValue = ''
  return true
}
