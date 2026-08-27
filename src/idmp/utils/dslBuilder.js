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
    const field = fields.find((item) => item.code === node.fieldCode)
    if (node.parameter) result.parameter = node.parameter
    if (node.operator === 'IN_VALUE_SET') {
      result.itemCodes = Array.isArray(node.itemCodes) ? node.itemCodes : []
      const valueSetVersionId = node.valueSetVersionId || field?.valueSetVersionId
      if (valueSetVersionId) result.valueSetVersionId = String(valueSetVersionId)
    } else if (node.operator === 'BETWEEN' && !node.parameter && isContinuousField(field)) {
      const valueSetVersionId = node.valueSetVersionId || field?.valueSetVersionId || field?.valueSetBinding?.valueSetVersionId
      if (valueSetVersionId) result.valueSetVersionId = String(valueSetVersionId)
      result.value = { start: node.value?.start ?? '', end: node.value?.end ?? '' }
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

export function validateFilterNode(node, errors = [], fields = []) {
  if (!node) return ['请至少添加一条统计范围条件']
  if (node.nodeType === 'PREDICATE') {
    if (!node.fieldCode) errors.push('请选择筛选字段')
    else if (!node.operator) errors.push('请选择该字段的判断方式')
    else if (node.operator === 'BETWEEN' && !node.parameter && isContinuousField(fields.find((item) => item.code === node.fieldCode))) validateContinuousRange(node, fields.find((item) => item.code === node.fieldCode), errors)
    else if (node.operator === 'IN_VALUE_SET' ? isEmptyFilterValue(node.itemCodes) : (!node.parameter && isEmptyFilterValue(node.value))) errors.push('请填写或选择条件值')
    return errors
  }
  if (node.nodeType === 'NOT') return validateFilterNode(node.child, errors, fields)
  if (!(node.children || []).length) errors.push('条件组不能为空')
  ;(node.children || []).forEach((child) => validateFilterNode(child, errors, fields))
  return errors
}

function isEmptyFilterValue(value) {
  return value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0)
}

function isContinuousField(field) {
  return String(field?.valueSetMatchMode || field?.valueSetBinding?.matchMode || '').toUpperCase() === 'CONTINUOUS'
}

function validateContinuousRange(node, field, errors) {
  const start = node.value?.start
  const end = node.value?.end
  if (isEmptyFilterValue(start) || isEmptyFilterValue(end)) { errors.push('请填写连续范围的开始值和结束值'); return }
  const spec = field?.continuousSpec || field?.valueSetBinding?.continuousSpec || {}
  const dataType = String(field?.dataType || '').toUpperCase()
  if (['INTEGER', 'DECIMAL'].includes(dataType)) {
    if (!isValidNumberText(start) || !isValidNumberText(end)) { errors.push('连续数值范围必须为合法数字'); return }
    if (Number(start) >= Number(end)) { errors.push('连续范围的开始值必须小于结束值'); return }
    if (dataType === 'INTEGER' && (!isIntegerText(start) || !isIntegerText(end))) { errors.push('整数连续值集不允许小数'); return }
    if (spec.scale != null && (decimalScale(start) > Number(spec.scale) || decimalScale(end) > Number(spec.scale))) { errors.push(`小数位不能超过值集定义的 ${spec.scale} 位`); return }
    if (spec.minimumValue != null && Number(start) < Number(spec.minimumValue)) { errors.push(`开始值不能小于 ${spec.minimumValue}`); return }
    if (spec.maximumValue != null && Number(end) > Number(spec.maximumValue)) errors.push(`结束值不能大于 ${spec.maximumValue}`)
  } else if (String(start) >= String(end)) errors.push('连续范围的开始值必须早于结束值')
}

function isValidNumberText(value) { return /^[-+]?\d+(\.\d+)?$/.test(String(value)) }
function isIntegerText(value) { return /^[-+]?\d+$/.test(String(value)) }
function decimalScale(value) { return (String(value).split('.')[1] || '').length }
