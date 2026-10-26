// A saved working version is not evidence that a dashboard has been published.
export function isPublishedDashboard(item = {}) {
  return item.origin === 'remote'
    && Boolean(String(item.currentPublishedVersionId ?? '').trim())
    && !['ARCHIVED', 'DELETED', 'DISABLED', 'UNPUBLISHED'].includes(String(item.status || '').toUpperCase())
}

export function dashboardPublicationState(item = {}) {
  if (item.origin === 'local') return { label: '本地草稿', type: 'info' }
  const status = String(item.status || '').toUpperCase()
  if (status === 'ARCHIVED') return { label: '已归档', type: 'info' }
  if (status === 'DISABLED') return { label: '已停用', type: 'info' }
  if (status === 'UNPUBLISHED') return { label: '已下线', type: 'info' }
  if (!isPublishedDashboard(item)) return { label: '草稿（未发布）', type: 'info' }
  const hasDraft = String(item.workingVersionStatus || '').toUpperCase() === 'DRAFT'
    || Boolean(item.workingVersionId && String(item.workingVersionId) !== String(item.currentPublishedVersionId))
  return hasDraft
    ? { label: '已发布 · 有未发布修改', type: 'warning' }
    : { label: '已发布', type: 'success' }
}
