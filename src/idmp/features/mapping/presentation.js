import { businessDifferenceValue, sameDifferenceValue, visibleDifferenceEntries } from './differenceContent.js'

const differenceLabels = {
  indicatorName: '指标名称', definition: '定义', meaning: '业务含义', formulaAst: '计算公式',
  factors: '因子与过滤', policyReferences: '政策依据', defaultExclusion: '默认排除规则',
  unit: '单位', statisticalPeriod: '统计周期', granularity: '统计粒度', organizationScope: '组织范围',
  displaySpec: '展示格式', displayType: '展示类型', direction: '评价方向', defaultGrain: '默认粒度',
  validationRule: '校验规则', indicatorSystem: '指标体系', defaultExcludeDsl: '默认排除条件',
  defaultPeriodType: '默认统计周期', indicatorCategory: '指标类别', applicableOrgScope: '适用组织',
  formulaDisplayText: '公式说明', allowScenarioOverride: '允许场景覆盖', calculationDescription: '计算说明', defaultExcludeDisplayText: '排除条件说明'
}

export function policyLabel(indicator) {
  const references = Array.isArray(indicator?.policyReferences) ? indicator.policyReferences : []
  const policy = references.find(item => item?.policyFileName || item?.policyFileCode || item?.policyFileVersionId)
  return policy?.policyFileName || indicator?.policyFileName || '未标注政策来源'
}

export function indicatorVersionLabel(indicator) {
  const number = String(indicator?.versionNo ?? '').trim()
  return number ? `V${number}` : '-'
}

function differenceValue(value, detailed) {
  if (value === undefined || value === null || value === '') return detailed ? '未提供' : '-'
  if (typeof value !== 'object') return String(value)
  if (!detailed) return '已返回结构化内容'
  if (Array.isArray(value)) return value.length ? `共 ${value.length} 项配置` : '无配置'
  return String(value.name || value.indicatorName || value.policyFileName || '已返回结构化内容')
}

export function buildDifferenceRows(difference, { detailed = false } = {}) {
  const order = ['indicatorName', 'definition', 'meaning', 'unit', 'direction', 'defaultPeriodType', 'defaultGrain', 'applicableOrgScope', 'displayType', 'displaySpec', 'formulaAst', 'factors', 'policyReferences']
  return visibleDifferenceEntries(difference).filter(([key, item]) => item && typeof item === 'object' && ('source' in item || 'target' in item) && !(key === 'formulaDisplayText' && difference.formulaAst))
  .sort(([a], [b]) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length)).map(([key, item]) => {
    const sourceValue = key === 'formulaAst' ? item.source : businessDifferenceValue(item.source)
    const targetValue = key === 'formulaAst' ? item.target : businessDifferenceValue(item.target)
    return {
    key, sourceValue, targetValue,
    label: key === 'definition' && detailed ? '指标定义' : differenceLabels[key] || key,
    different: key === 'formulaAst' ? Boolean(item?.different) : !sameDifferenceValue(sourceValue, targetValue), source: differenceValue(sourceValue, detailed), target: differenceValue(targetValue, detailed)
  } })
}
