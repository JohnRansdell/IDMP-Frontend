export const MAPPING_TYPES = [
  { value: 'EXACT', label: '完全一致', description: '定义、公式与统计范围可视为一致。' },
  { value: 'SAME_CONCEPT', label: '同一业务含义', description: '表达同一业务主题，但允许存在口径差异。' },
  { value: 'RELATED', label: '部分重叠 / 相关', description: '统计对象或业务范围部分重叠，不能直接视为相同。' },
  { value: 'BROADER', label: '源包含目标', description: '源指标统计范围更宽，包含目标指标。' },
  { value: 'NARROWER', label: '源被目标包含', description: '源指标统计范围更窄，被目标指标包含。' }
]

export const COMPARABILITY_TYPES = [
  { value: 'DIRECT', label: '可直接比较' },
  { value: 'CONDITIONAL', label: '有条件可比' },
  { value: 'NOT_COMPARABLE', label: '不可比较' }
]

export const POLICY_REFERENCE_ROLES = [
  { value: 'SOURCE', label: '来源依据' },
  { value: 'DEFINITION', label: '定义依据' },
  { value: 'INTERPRETATION', label: '解释依据' },
  { value: 'REFERENCE', label: '参考依据' }
]

const MAPPING_STATUS_LABELS = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  REJECTED: '已驳回',
  APPROVED: '已通过',
  INVALIDATED: '已失效'
}

export function normalizePage(payload = {}) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length, page: 1, size: payload.length }
  return {
    items: payload.records || payload.items || payload.list || [],
    total: Number(payload.total ?? 0),
    page: Number(payload.pageNum ?? payload.page ?? 1),
    size: Number(payload.pageSize ?? payload.size ?? 20)
  }
}

export function mappingTypeLabel(value) {
  return MAPPING_TYPES.find(item => item.value === String(value || '').toUpperCase())?.label || value || '-'
}

export function mappingTypeDescription(value) {
  return MAPPING_TYPES.find(item => item.value === String(value || '').toUpperCase())?.description || '请结合人工核对依据确认关系。'
}

export function comparabilityLabel(value) {
  return COMPARABILITY_TYPES.find(item => item.value === String(value || '').toUpperCase())?.label || value || '-'
}

export function policyReferenceRoleLabel(value) {
  return POLICY_REFERENCE_ROLES.find(item => item.value === String(value || '').toUpperCase())?.label || value || '-'
}

export function mappingStatusLabel(value) {
  const key = String(value || '').toUpperCase()
  return MAPPING_STATUS_LABELS[key] || value || '-'
}

export function mappingCapabilities(detail = {}) {
  const mapping = detail.mapping || detail || {}
  const status = String(mapping.reviewStatus || '').toUpperCase()
  return {
    canEdit: status === 'DRAFT' || status === 'REJECTED',
    canSubmit: status === 'DRAFT',
    canApprove: status === 'PENDING_REVIEW',
    canReject: status === 'PENDING_REVIEW',
    canInvalidate: status === 'APPROVED' && String(mapping.publicationStatus || '').toUpperCase() === 'PUBLISHED'
  }
}

export function mappingActionCompleted(detail = {}, action = '') {
  const mapping = detail.mapping || detail || {}
  const status = String(mapping.reviewStatus || '').toUpperCase()
  const publicationStatus = String(mapping.publicationStatus || '').toUpperCase()
  if (action === 'submit') return status === 'PENDING_REVIEW'
  if (action === 'approve') return status === 'APPROVED' && publicationStatus === 'PUBLISHED'
  if (action === 'reject') return status === 'REJECTED'
  if (action === 'invalidate') return status === 'INVALIDATED'
  return false
}

export function mappingActionAllowed(detail = {}, action = '') {
  const capabilities = mappingCapabilities(detail)
  return ({
    submit: capabilities.canSubmit,
    approve: capabilities.canApprove,
    reject: capabilities.canReject,
    invalidate: capabilities.canInvalidate
  })[action] === true
}

export function toOpaqueId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}

export function formatIndicatorRef(indicator = {}) {
  const code = indicator.indicatorCode || indicator.code || ''
  const name = indicator.indicatorName || indicator.name || ''
  return [code, name].filter(Boolean).join(' · ') || toOpaqueId(indicator.indicatorVersionId)
}
