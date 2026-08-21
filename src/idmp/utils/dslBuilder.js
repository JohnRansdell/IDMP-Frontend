const AGGREGATION_LABELS = {
  COUNT: '记录计数',
  COUNT_DISTINCT: '去重计数',
  SUM: '数值求和',
  AVG: '平均值',
  MIN: '最小值',
  MAX: '最大值',
  MEDIAN: '中位数'
}

export function getAggregationLabel(value) {
  return AGGREGATION_LABELS[String(value || '').trim().toUpperCase()] || value || '-'
}

export function serializeFilterNode(node, fields = []) {
  if (!node) return { nodeType: 'TRUE' }
  if (node.nodeType === 'TRUE') return { nodeType: 'TRUE' }
  if (node.nodeType === 'PREDICATE') {
    const result = { nodeType: 'PREDICATE', fieldCode: node.fieldCode, operator: node.operator }
    if (node.parameter) result.parameter = node.parameter
    if (node.operator === 'IN_VALUE_SET') {
      result.itemCodes = Array.isArray(node.itemCodes) ? node.itemCodes : []
      const field = fields.find((item) => item.code === node.fieldCode)
      const valueSetVersionId = node.valueSetVersionId || field?.valueSetVersionId
      if (valueSetVersionId) result.valueSetVersionId = String(valueSetVersionId)
    } else if (node.value !== undefined && node.value !== '') result.value = node.value
    return result
  }
  if (node.nodeType === 'NOT') return { nodeType: 'NOT', child: serializeFilterNode(node.child, fields) }
  if (!(node.children || []).length) return { nodeType: 'TRUE' }
  return {
    nodeType: node.nodeType === 'OR' ? 'OR' : 'AND',
    children: (node.children || []).map((child) => serializeFilterNode(child, fields))
  }
}

export function buildFactorDsl({ domainCode, semanticTableCode, aggregation, fieldCode, groupBy = [], filters, fields = [] }) {
  const aggregationNode = aggregation === 'COUNT'
    ? { function: 'COUNT', ...(fieldCode ? { fieldCode } : {}) }
    : { function: aggregation, fieldCode }
  return {
    schemaVersion: '1.0',
    dslType: 'FACTOR',
    primaryDomain: { domainCode, ...(semanticTableCode ? { semanticTableCode } : {}) },
    filters: serializeFilterNode(filters, fields),
    aggregation: aggregationNode,
    groupBy,
    parameters: collectParameters(filters),
    output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: aggregationNode.function, nullable: false }
  }
}

export function collectParameters(node, result = []) {
  if (!node) return result
  if (node.nodeType === 'PREDICATE' && node.parameter && !result.some((item) => item.code === node.parameter)) {
    result.push({ code: node.parameter, type: 'PERIOD', source: 'RUNTIME' })
  }
  ;(node.children || []).forEach((child) => collectParameters(child, result))
  if (node.child) collectParameters(node.child, result)
  return result
}

export function validateFilterNode(node, errors = []) {
  if (!node) return ['请至少添加一条统计范围条件']
  if (node.nodeType === 'PREDICATE') {
    if (!node.fieldCode) errors.push('请选择筛选字段')
    else if (!node.operator) errors.push('请选择该字段的判断方式')
    else if (node.operator === 'IN_VALUE_SET' ? isEmptyFilterValue(node.itemCodes) : (!node.parameter && isEmptyFilterValue(node.value))) errors.push('请填写或选择条件值')
    return errors
  }
  if (node.nodeType === 'NOT') return validateFilterNode(node.child, errors)
  if (!(node.children || []).length) errors.push('条件组不能为空')
  ;(node.children || []).forEach((child) => validateFilterNode(child, errors))
  return errors
}

function isEmptyFilterValue(value) {
  return value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0)
}
