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

function differenceValue(value, detailed) {
  if (value === undefined || value === null || value === '') return detailed ? '未提供' : '-'
  if (typeof value !== 'object') return String(value)
  if (!detailed) return '已返回结构化内容'
  if (Array.isArray(value)) return value.length ? `共 ${value.length} 项配置` : '无配置'
  return String(value.name || value.indicatorName || value.policyFileName || '已返回结构化内容')
}

export function buildDifferenceRows(difference, { detailed = false } = {}) {
  return Object.entries(difference || {}).filter(([, item]) => item && typeof item === 'object' && ('source' in item || 'target' in item)).map(([key, item]) => ({
    key, sourceValue: item.source, targetValue: item.target,
    label: key === 'definition' && detailed ? '指标定义' : differenceLabels[key] || key,
    different: Boolean(item?.different), source: differenceValue(item?.source, detailed), target: differenceValue(item?.target, detailed)
  }))
}
