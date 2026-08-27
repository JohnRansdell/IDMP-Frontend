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
  RESOLVED: { label: '已处理', tone: 'success' },
  SUCCESS: { label: '已成功', tone: 'success' },
  CANCELED: { label: '已取消', tone: 'neutral' },
  PASSED: { label: '已通过', tone: 'success' },
  PASS: { label: '已通过', tone: 'success' },
  TRIAL_PASS: { label: '试算通过', tone: 'success' },
  TRIAL: { label: '试算结果', tone: 'info' },
  CALCULATED: { label: '已计算', tone: 'success' },
  CALCULATION_ERROR: { label: '计算异常', tone: 'danger' },
  NOT_CALCULABLE: { label: '不可计算', tone: 'warning' },
  HAS_DATA: { label: '有源数据', tone: 'success' },
  NO_DATA: { label: '无源数据', tone: 'neutral' },
  INCOMPLETE_DATA: { label: '依赖数据不完整', tone: 'warning' },
  WAITING_FOR_CALCULATION: { label: '有数据待计算', tone: 'warning' },
  CALCULATION_IN_PROGRESS: { label: '计算中', tone: 'info' },
  ACTIVE_RESULT: { label: '已有正式结果', tone: 'success' },
  AVAILABLE: { label: '数据范围可用', tone: 'success' },
  NO_COMMON_PERIOD: { label: '无共同可用周期', tone: 'warning' },
  PARTIAL: { label: '部分可探测', tone: 'warning' },
  VALID: { label: '校验通过', tone: 'success' },
  VALID_WITH_WARNINGS: { label: '校验通过（有警告）', tone: 'warning' },
  COMPILED: { label: '已编译', tone: 'success' },
  COMPILED_WITH_WARNINGS: { label: '已编译（有警告）', tone: 'warning' },
  WARN: { label: '警告', tone: 'warning' },
  WARNING: { label: '警告', tone: 'warning' },
  ERROR: { label: '错误', tone: 'danger' },
  BLOCK: { label: '阻断', tone: 'danger' },
  UNKNOWN: { label: '状态未知', tone: 'neutral' },
  MATCHED: { label: '已匹配', tone: 'success' },
  UNMATCHED: { label: '未匹配', tone: 'warning' },
  REJECTED: { label: '已拒绝', tone: 'danger' },
  MAPPED: { label: '已映射', tone: 'success' },
  UNMAPPED: { label: '未映射', tone: 'neutral' }
}

export const getStatusDefinition = (status) => {
  const normalized = String(status || '').trim().toUpperCase()
  return STATUS_DEFINITIONS[normalized] || {
    label: status || '未知',
    tone: 'neutral'
  }
}

export const getStatusLabel = (status) => getStatusDefinition(status).label

export const resolveStatusPresentation = ({ status = '', label = '', tone = '' } = {}) => {
  const definition = getStatusDefinition(status || label)
  return {
    label: label ? getStatusLabel(label) : definition.label,
    tone: tone || definition.tone
  }
}

