import { normalizePage as normalizePageModel } from '../pageModel.js'
export const WARNING_TYPES = [
  { value: 'THRESHOLD', label: '阈值预警' },
  { value: 'TREND', label: '趋势预警' },
  { value: 'VOLATILITY', label: '波动预警' }
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
  ENABLED: '已启用', DISABLED: '未启用', DRAFT: '未发布', PUBLISHED: '已发布'
}

export function warningLabel(value) {
  return LABELS[String(value || '').toUpperCase()] || value || '-'
}

export function normalizePage(payload) {
  const { items, ...page } = normalizePageModel(payload)
  return { records: items, ...page }
}

export function normalizeWarningRule(rule = {}) {
  const sourceVersion = rule.version || rule.currentVersion || rule.draftVersion || rule.publishedVersion || {}
  const fallbackVersionId = rule.draftVersionId || rule.currentVersionId || rule.currentPublishedVersionId
  const fallbackPublication = rule.draftVersionId
    ? 'DRAFT'
    : (rule.currentPublishedVersionId ? 'PUBLISHED' : rule.publicationStatus)
  const version = { ...sourceVersion, scopePolicy: { ...sourceVersion.scopePolicy, resultScope: sourceVersion.scopePolicy?.resultScope ?? { mode: 'MAIN' } } }
  const versionId = sourceVersion.id || sourceVersion.versionId || fallbackVersionId
  const publicationStatus = sourceVersion.publicationStatus || fallbackPublication
  if (versionId) version.id = versionId
  if (publicationStatus) version.publicationStatus = publicationStatus
  return {
    ...rule,
    version
  }
}

export function warningRuleCapabilities(rule = {}) {
  const normalized = normalizeWarningRule(rule)
  const version = normalized.version
  const publication = String(version.publicationStatus || rule.publicationStatus || '').toUpperCase()
  const enabled = String(normalized.enableStatus || '').toUpperCase() === 'ENABLED'
  return {
    canEdit: publication === 'DRAFT' && Boolean(version.id || version.versionId),
    canPublish: publication === 'DRAFT' && Boolean(version.id || version.versionId),
    canEnable: publication === 'PUBLISHED' && !enabled,
    canDisable: enabled
  }
}

export function buildWarningRulePayload(form) {
  const recipientPolicy = Array.isArray(form.recipientUsernames)
    ? { recipientUsernames: uniqueUsernames(form.recipientUsernames) }
    : { recipientUserIds: uniquePositiveIds(form.recipientUserIds) }
  const condition = {
    operator: form.operator,
    threshold: String(form.threshold || '').trim()
  }
  if (form.warningType !== 'THRESHOLD') condition.measure = form.measure || 'DELTA'
  if (form.warningType === 'VOLATILITY' && form.windowSize !== '') condition.windowSize = Number(form.windowSize)
  return {
    code: String(form.code || '').trim(),
    name: String(form.name || '').trim(),
    description: String(form.description || '').trim() || undefined,
    warningType: form.warningType,
    indicatorVersionId: opaquePositiveId(form.indicatorVersionId),
    periodType: form.periodType,
    // Keep the backend DTO shape, but never bind a rule to a scenario.
    scenarioScope: {},
    scopePolicy: { includeNoScenario: true, resultScope: form.resultScope ?? { mode: 'MAIN' } },
    condition: form.conditionTree ? cleanWarningCondition(form.conditionTree, form.warningType) : condition,
    dedupPolicy: { scope: 'PERIOD' },
    notificationPolicy: { channels: ['IN_APP'], ...recipientPolicy },
    severity: form.severity,
    effectiveStartDate: form.effectiveStartDate || null,
    effectiveEndDate: form.effectiveEndDate || null
  }
}

export function serializeWarningRulePayload(payload = {}) {
  const marked = {
    ...payload,
    indicatorVersionId: markJsonInteger(payload.indicatorVersionId),
    scenarioScope: payload.scenarioScope?.scenarioVersionIds
      ? {
          ...payload.scenarioScope,
          scenarioVersionIds: payload.scenarioScope.scenarioVersionIds.map(markJsonInteger)
        }
      : (payload.scenarioScope || {}),
    condition: {
      ...(payload.condition || {}),
      ...(payload.condition?.baselineIndicatorVersionId
        ? { baselineIndicatorVersionId: markJsonInteger(payload.condition.baselineIndicatorVersionId) }
        : {}),
      ...(payload.condition?.baselineScenarioVersionId
        ? { baselineScenarioVersionId: markJsonInteger(payload.condition.baselineScenarioVersionId) }
        : {})
    },
    notificationPolicy: {
      ...(payload.notificationPolicy || {}),
      ...(payload.notificationPolicy?.recipientUserIds
        ? { recipientUserIds: payload.notificationPolicy.recipientUserIds.map(markJsonInteger) }
        : {})
    }
  }
  return JSON.stringify(marked).replace(/"__IDMP_JSON_INTEGER__(\d+)"/g, '$1')
}

function markJsonInteger(value) {
  const id = opaquePositiveId(value)
  if (!id) throw new Error('预警规则包含无效的正整数 ID')
  return `__IDMP_JSON_INTEGER__${id}`
}

export function validateWarningRuleForm(form) {
  if (!String(form.name || '').trim()) return '请填写规则名称'
  if (!opaquePositiveId(form.indicatorVersionId)) return '请选择已发布指标版本'
  if (!WARNING_PERIOD_TYPES.includes(form.periodType)) return '请选择统计周期'
  if (!WARNING_TYPES.some((item) => item.value === form.warningType)) return '请选择预警类型'
  if (form.resultScope?.mode === 'GROUPED' && (!form.resultScope.dimensions?.length || !form.resultScope.targetCode)) return '请选择分组粒度'
  const conditionError = validateWarningCondition(form.conditionTree || { operator: form.operator, threshold: form.threshold, windowSize: form.windowSize }, form.warningType)
  if (conditionError) return conditionError
  if (!(Array.isArray(form.recipientUsernames) ? uniqueUsernames(form.recipientUsernames) : uniquePositiveIds(form.recipientUserIds)).length) return '请至少选择一位站内通知接收人'
  if (form.effectiveStartDate && form.effectiveEndDate && form.effectiveStartDate > form.effectiveEndDate) return '生效开始日期不能晚于结束日期'
  return ''
}

export function cleanWarningCondition(node, type) {
  if (node.logic) return { logic: node.logic, children: node.children.map(child => cleanWarningCondition(child, type)) }
  return { operator: node.operator || 'GT', threshold: String(node.threshold).trim(),
    ...(type === 'TREND' ? { measure: node.measure || 'DELTA' } : {}),
    ...(type === 'VOLATILITY' ? { windowSize: Number(node.windowSize || 3) } : {}) }
}

export function describeWarningCondition(node, type) {
  if (!node) return '-'
  if (node.logic === 'NOT') return `非（${describeWarningCondition(node.children?.[0], type)}）`
  if (node.logic) return `（${(node.children || []).map(child => describeWarningCondition(child, type)).join(node.logic === 'AND' ? ' 且 ' : ' 或 ')}）`
  const symbols = { GT: '>', GTE: '≥', LT: '<', LTE: '≤', EQ: '=', NE: '≠' }
  const subject = type === 'TREND' ? (node.measure === 'CHANGE_RATE' ? '变化率' : '变化值')
    : type === 'VOLATILITY' ? `最近 ${node.windowSize || 3} 个周期的标准差` : type === 'THRESHOLD' ? '指标值' : ''
  const threshold = String(node.threshold ?? '').trim() || '待填写'
  return `${subject ? `${subject} ` : ''}${symbols[node.operator || 'GT'] || node.operator} ${threshold}`
}

export function validateWarningCondition(root, type) {
  let count = 0
  function visit(node, depth) {
    if (depth > 8 || ++count > 100) return '条件最多 8 层、100 个节点'
    if (!node || typeof node !== 'object') return '条件节点不合法'
    if (node.logic) {
      if (!['AND', 'OR', 'NOT'].includes(node.logic) || !Array.isArray(node.children) || !node.children.length) return '请选择合法逻辑，条件组不能为空'
      if (node.logic === 'NOT' && node.children.length !== 1) return '非条件组只能包含一个条件'
      for (const child of node.children) { const error = visit(child, depth + 1); if (error) return error }
      return ''
    }
    const raw = String(node.threshold ?? '').trim()
    if (!WARNING_OPERATORS.includes(node.operator) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)
      || raw.length > 100 || !Number.isFinite(Number(raw))) return '请填写合法的比较符和数字阈值'
    if (type === 'VOLATILITY' && (!Number.isInteger(Number(node.windowSize ?? 3)) || Number(node.windowSize ?? 3) < 2 || Number(node.windowSize ?? 3) > 60)) return '波动窗口必须为 2～60 的整数'
    return ''
  }
  return visit(root, 1)
}

function opaquePositiveId(value) {
  const text = String(value || '').trim()
  return /^\d+$/.test(text) && text !== '0' ? text : ''
}

function uniquePositiveIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(opaquePositiveId).filter(Boolean))]
}

function uniqueUsernames(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? '').trim())
    .filter(value => /^[A-Za-z0-9_@.-]{1,64}$/.test(value)))]
}

export function warningRecipientLabel(user = {}) {
  const name = String(user.displayName || '').trim()
  const username = String(user.username || '').trim()
  return name && username && name !== username ? `${name} · ${username}` : name || username || '未命名用户'
}
