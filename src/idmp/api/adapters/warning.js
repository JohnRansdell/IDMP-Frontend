export const WARNING_TYPES = [
  { value: 'THRESHOLD', label: '阈值预警' },
  { value: 'TREND', label: '趋势预警' },
  { value: 'VOLATILITY', label: '波动预警' },
  { value: 'SCENARIO_DIFFERENCE', label: '场景差异预警' }
]

export const WARNING_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const WARNING_PERIOD_TYPES = ['DAILY', 'MONTHLY', 'QUARTERLY', 'YEARLY']
export const WARNING_EVENT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'CLOSED']
export const WARNING_OPERATORS = ['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NE']

const LABELS = {
  INFO: '提示', LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重',
  THRESHOLD: '阈值预警', TREND: '趋势预警', VOLATILITY: '波动预警', SCENARIO_DIFFERENCE: '场景差异预警',
  OPEN: '待处理', ACKNOWLEDGED: '已确认', CLOSED: '已关闭',
  DAILY: '日', MONTHLY: '月', QUARTERLY: '季', YEARLY: '年',
  GT: '大于（>）', GTE: '大于等于（≥）', LT: '小于（<）', LTE: '小于等于（≤）', EQ: '等于（=）', NE: '不等于（≠）',
  ENABLED: '已启用', DISABLED: '已停用', DRAFT: '草稿', PUBLISHED: '已发布'
}

export function warningLabel(value) {
  return LABELS[String(value || '').toUpperCase()] || value || '-'
}

export function normalizePage(payload = {}) {
  if (Array.isArray(payload)) return { records: payload, total: payload.length, page: 1, size: payload.length }
  return {
    records: payload.records || payload.items || payload.list || [],
    total: Number(payload.total ?? 0),
    page: Number(payload.pageNum ?? payload.page ?? 1),
    size: Number(payload.pageSize ?? payload.size ?? 20)
  }
}

export function warningRuleCapabilities(rule = {}) {
  const version = rule.version || {}
  const publication = String(version.publicationStatus || rule.publicationStatus || '').toUpperCase()
  const enabled = String(rule.enableStatus || '').toUpperCase() === 'ENABLED'
  return {
    canEdit: publication === 'DRAFT' && Boolean(version.id || version.versionId),
    canPublish: publication === 'DRAFT' && Boolean(version.id || version.versionId),
    canEnable: publication === 'PUBLISHED' && !enabled,
    canDisable: enabled
  }
}

export function buildWarningRulePayload(form) {
  const scenarioIds = uniquePositiveIds(form.scenarioVersionIds)
  const recipients = uniquePositiveIds(form.recipientUserIds)
  const condition = {
    operator: form.operator,
    threshold: String(form.threshold || '').trim()
  }
  if (form.warningType !== 'THRESHOLD') condition.measure = form.measure || 'DELTA'
  if (form.warningType === 'VOLATILITY' && form.windowSize !== '') condition.windowSize = Number(form.windowSize)
  if (form.warningType === 'SCENARIO_DIFFERENCE') {
    condition.baselineIndicatorVersionId = opaquePositiveId(form.baselineIndicatorVersionId)
    condition.baselineScenarioVersionId = opaquePositiveId(form.baselineScenarioVersionId)
  }
  return {
    code: String(form.code || '').trim(),
    name: String(form.name || '').trim(),
    description: String(form.description || '').trim() || undefined,
    warningType: form.warningType,
    indicatorVersionId: opaquePositiveId(form.indicatorVersionId),
    periodType: form.periodType,
    scenarioScope: scenarioIds.length ? { scenarioVersionIds: scenarioIds } : {},
    scopePolicy: { includeNoScenario: Boolean(form.includeNoScenario) },
    condition,
    dedupPolicy: { scope: 'PERIOD' },
    notificationPolicy: { channels: ['IN_APP'], recipientUserIds: recipients },
    severity: form.severity,
    effectiveStartDate: form.effectiveStartDate || null,
    effectiveEndDate: form.effectiveEndDate || null
  }
}

export function validateWarningRuleForm(form) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(String(form.code || '').trim())) return '规则编码须以字母开头，仅含字母、数字或下划线，最长 64 位'
  if (!String(form.name || '').trim()) return '请填写规则名称'
  if (!opaquePositiveId(form.indicatorVersionId)) return '请选择已发布指标版本'
  if (!WARNING_PERIOD_TYPES.includes(form.periodType)) return '请选择统计周期'
  if (!WARNING_TYPES.some((item) => item.value === form.warningType)) return '请选择预警类型'
  if (!WARNING_OPERATORS.includes(form.operator) || !String(form.threshold || '').trim()) return '请填写合法的比较符和阈值'
  if (!uniquePositiveIds(form.recipientUserIds).length) return '请至少选择一位站内通知接收人'
  if (form.warningType === 'VOLATILITY' && (!Number.isInteger(Number(form.windowSize)) || Number(form.windowSize) < 2)) return '波动预警的窗口周期数至少为 2'
  if (form.warningType === 'SCENARIO_DIFFERENCE') {
    if (!opaquePositiveId(form.baselineIndicatorVersionId)) return '请选择基准指标版本'
    if (!opaquePositiveId(form.baselineScenarioVersionId)) return '请选择已发布基准场景版本'
  }
  if (form.effectiveStartDate && form.effectiveEndDate && form.effectiveStartDate > form.effectiveEndDate) return '生效开始日期不能晚于结束日期'
  return ''
}

function opaquePositiveId(value) {
  const text = String(value || '').trim()
  return /^\d+$/.test(text) && text !== '0' ? text : ''
}

function uniquePositiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(opaquePositiveId).filter(Boolean))]
}
