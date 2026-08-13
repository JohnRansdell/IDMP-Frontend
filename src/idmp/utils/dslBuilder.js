export function serializeFilterNode(node) {
  if (!node) return { nodeType: 'TRUE' }
  if (node.nodeType === 'TRUE') return { nodeType: 'TRUE' }
  if (node.nodeType === 'PREDICATE') {
    const result = { nodeType: 'PREDICATE', fieldCode: node.fieldCode, operator: node.operator }
    if (node.parameter) result.parameter = node.parameter
    else if (node.value !== undefined && node.value !== '') result.value = node.value
    return result
  }
  if (node.nodeType === 'NOT') return { nodeType: 'NOT', child: serializeFilterNode(node.child) }
  if (!(node.children || []).length) return { nodeType: 'TRUE' }
  return { nodeType: node.nodeType === 'OR' ? 'OR' : 'AND', children: (node.children || []).map(serializeFilterNode) }
}

export function buildFactorDsl({ domainCode, semanticTableCode, aggregation, fieldCode, groupBy = [], filters }) {
  const aggregationNode = aggregation === 'COUNT' ? { function: 'COUNT' } : { function: aggregation, fieldCode }
  return {
    schemaVersion: '1.0',
    dslType: 'FACTOR',
    primaryDomain: { domainCode, ...(semanticTableCode ? { semanticTableCode } : {}) },
    filters: serializeFilterNode(filters),
    aggregation: aggregationNode,
    groupBy,
    parameters: collectParameters(filters),
    output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: aggregationNode.function, nullable: false }
  }
}

export function collectParameters(node, result = []) {
  if (!node) return result
  if (node.nodeType === 'PREDICATE' && node.parameter && !result.some((item) => item.code === node.parameter)) {
    result.push({ code: node.parameter, type: 'DATETIME_RANGE' })
  }
  ;(node.children || []).forEach((child) => collectParameters(child, result))
  if (node.child) collectParameters(node.child, result)
  return result
}

export function validateFilterNode(node, errors = []) {
  if (!node) return ['请至少添加一条统计范围条件']
  if (node.nodeType === 'PREDICATE') {
    if (!node.fieldCode) errors.push('存在未选择字段的条件')
    if (!node.operator) errors.push('存在未选择操作符的条件')
    if (!node.parameter && (node.value === '' || node.value === undefined || node.value === null)) errors.push('存在未填写值的条件')
    return errors
  }
  if (node.nodeType === 'NOT') return validateFilterNode(node.child, errors)
  if (!(node.children || []).length) errors.push('条件组不能为空')
  ;(node.children || []).forEach((child) => validateFilterNode(child, errors))
  return errors
}
