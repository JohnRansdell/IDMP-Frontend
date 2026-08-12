export const SCENARIO_TYPES = [
  { value: 'ASSESSMENT', label: '考核上报' },
  { value: 'REVIEW', label: '医院评审' },
  { value: 'QUALITY_CONTROL', label: '专业质控' },
  { value: 'TOPIC', label: '专项主题' },
  { value: 'CUSTOM', label: '自定义' }
]

export const PERIOD_TYPES = [
  { value: 'DAILY', label: '日' },
  { value: 'WEEKLY', label: '周' },
  { value: 'MONTHLY', label: '月' },
  { value: 'QUARTERLY', label: '季度' },
  { value: 'YEARLY', label: '年' },
  { value: 'CUSTOM', label: '自定义' }
]

const PERIOD_TYPE_ALIASES = Object.freeze({
  DAY: 'DAILY',
  DAILY: 'DAILY',
  WEEK: 'WEEKLY',
  WEEKLY: 'WEEKLY',
  MONTH: 'MONTHLY',
  MONTHLY: 'MONTHLY',
  QUARTER: 'QUARTERLY',
  QUARTERLY: 'QUARTERLY',
  YEAR: 'YEARLY',
  YEARLY: 'YEARLY',
  CUSTOM: 'CUSTOM',
  日: 'DAILY',
  每日: 'DAILY',
  日度: 'DAILY',
  周: 'WEEKLY',
  每周: 'WEEKLY',
  周度: 'WEEKLY',
  月: 'MONTHLY',
  每月: 'MONTHLY',
  月度: 'MONTHLY',
  季: 'QUARTERLY',
  季度: 'QUARTERLY',
  年: 'YEARLY',
  每年: 'YEARLY',
  年度: 'YEARLY',
  自定义: 'CUSTOM'
})

export function normalizePeriodType(value, fallback = '') {
  const source = value && typeof value === 'object'
    ? value.value ?? value.code ?? value.name
    : value
  if (source === undefined || source === null || source === '') return fallback
  return PERIOD_TYPE_ALIASES[String(source).trim().toUpperCase()] || fallback
}

export const OVERRIDE_TYPES = [
  { value: 'EXCLUSION', label: '排除条件' },
  { value: 'PARAMETER', label: '参数' },
  { value: 'DATA_SOURCE', label: '数据源' },
  { value: 'DISPLAY', label: '展示' },
  { value: 'THRESHOLD', label: '阈值' }
]

export function normalizePage(payload) {
  if (Array.isArray(payload)) return { items: payload, total: payload.length, page: 1, size: payload.length }
  return {
    items: payload?.items || payload?.records || payload?.list || [],
    total: Number(payload?.total ?? 0),
    page: Number(payload?.page ?? 1),
    size: Number(payload?.size ?? 20)
  }
}

export function scenarioTypeLabel(value) {
  return SCENARIO_TYPES.find((item) => item.value === value)?.label || value || '-'
}

export function periodTypeLabel(value) {
  return PERIOD_TYPES.find((item) => item.value === value)?.label || value || '-'
}

export function publicationStatusLabel(value) {
  return { DRAFT: '草稿', VALIDATED: '已校验', PUBLISHED: '已发布', ARCHIVED: '已归档' }[value] || value || '-'
}

export function scenarioDetailToForm(detail) {
  const scenario = detail?.scenario || {}
  const version = detail?.version || {}
  return {
    scenarioId: scenario.id,
    versionId: version.id,
    code: scenario.code || '',
    name: scenario.name || '',
    type: scenario.type || 'CUSTOM',
    description: scenario.description || '',
    governingOrgName: scenario.governingOrgName || '',
    defaultPeriodType: normalizePeriodType(version.defaultPeriodType, version.defaultPeriodType ? '' : 'MONTHLY'),
    defaultParameters: version.defaultParameters || {},
    defaultExclusionDsl: version.defaultExclusionDsl || { nodeType: 'TRUE' },
    defaultExclusionDisplayText: version.defaultExclusionDisplayText || '',
    defaultDataSourcePriority: version.defaultDataSourcePriority || [],
    displayText: version.displayText || '',
    effectiveStartDate: version.effectiveStartDate || '',
    effectiveEndDate: version.effectiveEndDate || '',
    resourceVersion: version.resourceVersion ?? 0,
    publicationStatus: version.publicationStatus || 'DRAFT',
    versionNo: version.versionNo || '-',
    indicators: (version.indicators || []).map((item) => ({ ...item })),
    overrides: (version.overrides || []).map((item) => ({
      ...item,
      overrideValue: item.overrideValue ?? item.value
    }))
  }
}

export function scenarioFormToPatch(form) {
  const defaultPeriodType = normalizePeriodType(form.defaultPeriodType)
  if (!defaultPeriodType) {
    throw new Error('默认统计周期无效，请重新选择日、周、月、季度、年或自定义')
  }
  return {
    resourceVersion: form.resourceVersion,
    name: form.name,
    description: form.description,
    governingOrgName: form.governingOrgName,
    defaultPeriodType,
    defaultParameters: form.defaultParameters,
    defaultExclusionDsl: form.defaultExclusionDsl,
    defaultExclusionDisplayText: form.defaultExclusionDisplayText,
    defaultDataSourcePriority: form.defaultDataSourcePriority,
    displayText: form.displayText,
    effectiveStartDate: form.effectiveStartDate || null,
    effectiveEndDate: form.effectiveEndDate || null
  }
}

export function toIndicatorBinding(item, index) {
  return {
    indicatorVersionId: Number(item.indicatorVersionId ?? item.id ?? item.versionId),
    displayOrder: Number(item.displayOrder ?? index),
    required: item.required !== false,
    reportRequirementText: item.reportRequirementText || '',
    mappingOriginType: item.mappingOriginType || 'MANUAL'
  }
}

export function toOverridePayload(item) {
  return {
    indicatorVersionId: item.indicatorVersionId ? Number(item.indicatorVersionId) : null,
    overrideType: item.overrideType,
    targetNodePath: item.targetNodePath,
    overrideValue: item.overrideValue,
    displayText: item.displayText || '',
    priority: Number(item.priority || 0)
  }
}
