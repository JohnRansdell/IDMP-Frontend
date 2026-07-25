export const STATUS_DEFINITIONS = {
  DRAFT: { label: '草稿', tone: 'neutral' },
  VALIDATING: { label: '校验中', tone: 'info' },
  VALIDATED: { label: '已校验', tone: 'success' },
  PUBLISHED: { label: '已发布', tone: 'success' },
  DISABLED: { label: '已停用', tone: 'neutral' },
  ARCHIVED: { label: '已归档', tone: 'neutral' },
  QUEUED: { label: '排队中', tone: 'info' },
  RUNNING: { label: '运行中', tone: 'info' },
  SUCCEEDED: { label: '已成功', tone: 'success' },
  PARTIAL_SUCCEEDED: { label: '部分成功', tone: 'warning' },
  FAILED: { label: '失败', tone: 'danger' },
  CANCELLING: { label: '取消中', tone: 'warning' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
  STAGING: { label: '暂存中', tone: 'info' },
  READY: { label: '待切换', tone: 'warning' },
  ACTIVE: { label: '当前活动', tone: 'success' },
  SUPERSEDED: { label: '已被替代', tone: 'neutral' },
  ENABLED: { label: '启用', tone: 'success' },
  INACTIVE: { label: '未启用', tone: 'neutral' },
  PENDING: { label: '待处理', tone: 'warning' },
  RESOLVED: { label: '已处理', tone: 'success' }
}

export const getStatusDefinition = (status) => {
  const normalized = String(status || '').trim().toUpperCase()
  return STATUS_DEFINITIONS[normalized] || {
    label: status || '未知',
    tone: 'neutral'
  }
}

