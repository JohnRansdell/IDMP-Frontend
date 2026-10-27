const differenceLabels = {
  indicatorName: '指标名称', definition: '定义', meaning: '业务含义', formulaAst: '计算公式',
  factors: '因子与过滤', policyReferences: '政策依据', defaultExclusion: '默认排除规则',
  unit: '单位', statisticalPeriod: '统计周期', granularity: '统计粒度', organizationScope: '组织范围'
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
  return Object.entries(difference || {}).filter(([key]) => key !== 'hasDifferences').map(([key, item]) => ({
    label: key === 'definition' && detailed ? '指标定义' : differenceLabels[key] || key,
    different: Boolean(item?.different), source: differenceValue(item?.source, detailed), target: differenceValue(item?.target, detailed)
  }))
}
