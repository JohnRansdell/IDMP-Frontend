import { canonicalPeriodColumn, withoutLegacyPeriod } from './factorPeriod.js'

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
    if (node.left || node.right) return {
      nodeType: 'PREDICATE', operator: node.operator,
      left: serializeExpression(node.left || { expressionType: 'FIELD', fieldCode: node.fieldCode }),
      ...(node.parameter ? { parameter: node.parameter } : node.right ? { right: serializeExpression(node.right) } : {})
    }
    const reference = serializeFieldReference(node.fieldCode)
    const result = { nodeType: 'PREDICATE', ...(typeof reference === 'string' ? { fieldCode: reference } : { fieldRef: reference }), operator: node.operator }
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


export function buildFactorDsl({ domainCode, tableName, semanticTableCode, sourceAlias = 'base', joins = [], aggregation, fieldCode, fieldExpression, groupBy = [], filters, fields = [], periodColumn = '', missingRowPolicy = null, calculationMode = 'TEMPORAL' }) {
  const mode = String(calculationMode).toUpperCase()
  const period = canonicalPeriodColumn(periodColumn, filters, fields)
  const businessFilters = withoutLegacyPeriod(filters)
  const fieldReference = serializeFieldReference(fieldCode)
  const aggregationNode = fieldExpression ? { function: aggregation, fieldExpression: serializeExpression(fieldExpression) } : aggregation === 'COUNT'
    ? { function: 'COUNT', ...(fieldCode ? (typeof fieldReference === 'string' ? { fieldCode: fieldReference } : { fieldRef: fieldReference }) : {}) }
    : { function: aggregation, ...(typeof fieldReference === 'string' ? { fieldCode: fieldReference } : { fieldRef: fieldReference }) }
  return {
    schemaVersion: '1.0',
    dslType: 'FACTOR',
    calculationMode: mode,
    ...(mode === 'TEMPORAL' && period ? { periodColumn: period } : {}),
    primaryDomain: { ...(domainCode ? { domainCode } : {}), ...(tableName ? { tableName } : semanticTableCode ? { semanticTableCode } : {}), ...(joins.length ? { sourceAlias } : {}) },
    ...(joins.length ? { joins: joins.map(({ relationId, fromAlias, sourceAlias: joinedAlias, tableName, joinType, cardinality, keys }) => ({
      ...(relationId ? { relationId: String(relationId) } : { tableName, joinType, cardinality, keys: (keys || []).map(({ fromField, targetField }) => ({ fromField, targetField })) }), fromAlias, sourceAlias: joinedAlias
    })) } : {}),
    filters: serializeFilterNode(businessFilters, fields),
    aggregation: aggregationNode,
    groupBy: groupBy.map(serializeFieldReference),
    parameters: mode === 'TEMPORAL' && period ? [{ code: 'period', type: 'PERIOD', source: 'RUNTIME' }, ...collectParameters(businessFilters, [], fields)] : collectParameters(businessFilters, [], fields),
    ...(missingRowPolicy ? { missingRowPolicy: String(missingRowPolicy) } : {}),
    output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: aggregationNode.function, nullable: false }
  }
}

// 仅开放能够无损回显的受控表达式，未知类型继续阻止覆盖保存。
export function hasUnsupportedFactorDslExpressions(dsl = {}) {
  return containsUnsupportedExpression(dsl?.filters) || (dsl.aggregation?.fieldExpression && !supportedExpression(dsl.aggregation.fieldExpression)) || false
}

function containsUnsupportedExpression(node) {
  if (!node || typeof node !== 'object') return false
  if (node.nodeType === 'PREDICATE' && (node.left && !supportedExpression(node.left) || node.right && !supportedExpression(node.right))) return true
  return containsUnsupportedExpression(node.child) || (node.children || []).some(containsUnsupportedExpression)
}

export function supportedExpression(node, depth = 0) {
  if (!node || depth > 12) return false
  if (['FIELD', 'LITERAL'].includes(node.expressionType)) return true
  if (node.expressionType === 'BINARY') return ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE'].includes(node.operator) && (node.operator !== 'DIVIDE' || !node.zeroDenominatorPolicy || node.zeroDenominatorPolicy === 'RETURN_NULL') && supportedExpression(node.left, depth + 1) && supportedExpression(node.right, depth + 1)
  if (node.expressionType === 'FUNCTION') return ['LEFT', 'SUBSTRING', 'TRIM', 'UPPER', 'LOWER'].includes(node.function) && Array.isArray(node.arguments) && node.arguments.every(item => supportedExpression(item, depth + 1))
  return node.expressionType === 'RANGE' && supportedExpression(node.start, depth + 1) && supportedExpression(node.end, depth + 1)
}

export function serializeExpression(node) {
  if (!supportedExpression(node)) throw new Error('包含无法编辑的表达式，请通过原创建方式修改')
  if (node.expressionType === 'FIELD') {
    const reference = serializeFieldReference(node.fieldRef || node.fieldCode)
    return { expressionType: 'FIELD', ...(typeof reference === 'string' ? { fieldCode: reference } : { fieldRef: reference }) }
  }
  if (node.expressionType === 'LITERAL') return { expressionType: 'LITERAL', dataType: node.dataType, value: node.value, ...(node.dataType === 'DURATION' ? { unit: node.unit || 'HOUR' } : {}) }
  if (node.expressionType === 'BINARY') return { expressionType: 'BINARY', operator: node.operator, left: serializeExpression(node.left), right: serializeExpression(node.right), ...(node.operator === 'DIVIDE' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) }
  if (node.expressionType === 'FUNCTION') return { expressionType: 'FUNCTION', function: node.function, arguments: node.arguments.map(serializeExpression) }
  return { expressionType: 'RANGE', bounds: node.bounds || 'CLOSED', start: serializeExpression(node.start), end: serializeExpression(node.end) }
}

export function serializeFieldReference(value) {
  if (value && typeof value === 'object') return value
  const text = String(value || '').trim()
  const separator = text.indexOf('.')
  if (separator < 0) return text
  return { sourceAlias: text.slice(0, separator), fieldCode: text.slice(separator + 1) }
}

export function editableFilterTree(node, parameters = [], referenceKey = value => typeof value === 'string' ? value : `${value?.sourceAlias ? `${value.sourceAlias}.` : ''}${value?.fieldName || value?.fieldCode || ''}`) {
  const visit = item => {
    const result = JSON.parse(JSON.stringify(item))
    result.id = `filter-${Date.now()}-${Math.random()}`
    if (item.nodeType === 'PREDICATE') {
      result.fieldCode = referenceKey(item.fieldRef || item.fieldCode)
      if (item.parameter) result.parameterDefinition = parameters.find(parameter => parameter.code === item.parameter)
    }
    if (item.children) result.children = item.children.map(visit)
    if (item.child) { result.child = visit(item.child); if (!['AND', 'OR'].includes(result.child.nodeType)) result.child = { nodeType: 'AND', children: [result.child] } }
    return result
  }
  if (!node || node.nodeType === 'TRUE') return { nodeType: 'AND', children: [] }
  const result = visit(node)
  return ['AND', 'OR'].includes(result.nodeType) ? result : { nodeType: 'AND', children: [result] }
}

export function describeFieldExpression(node, fields = []) {
  if (!node) return '未完成表达式'
  if (node.expressionType === 'FIELD') {
    const ref = node.fieldRef || node.fieldCode
    const code = typeof ref === 'string' ? ref : `${ref?.sourceAlias ? `${ref.sourceAlias}.` : ''}${ref?.fieldName || ref?.fieldCode || ''}`
    return fields.find(field => field.code === code)?.label || code || '未选择字段'
  }
  if (node.expressionType === 'LITERAL') return `${node.value ?? ''}${node.dataType === 'DURATION' ? ({ SECOND: '秒', MINUTE: '分钟', HOUR: '小时', DAY: '天' })[node.unit || 'HOUR'] : ''}`
  if (node.expressionType === 'BINARY') return `（${describeFieldExpression(node.left, fields)} ${{ ADD: '+', SUBTRACT: '-', MULTIPLY: '×', DIVIDE: '÷' }[node.operator] || '?'} ${describeFieldExpression(node.right, fields)}）`
  if (node.expressionType === 'FUNCTION') return `${({ LEFT: '取左侧字符', SUBSTRING: '截取文本', TRIM: '去两端空格', UPPER: '转大写', LOWER: '转小写' })[node.function] || node.function}（${(node.arguments || []).map(item => describeFieldExpression(item, fields)).join('，')}）`
  return `${['OPEN', 'HALF_CLOSED'].includes(node.bounds) ? '(' : '['}${describeFieldExpression(node.start, fields)}, ${describeFieldExpression(node.end, fields)}${['OPEN', 'HALF_OPEN'].includes(node.bounds) ? ')' : ']'}`
}

export function runtimeParameterDefinition(node, fields = []) {
  const field = fields.find(item => item.code === node.fieldCode)
  const type = node.parameterDefinition?.type || field?.dataType || 'STRING'
  return { code: node.parameter, type: ['CODE', 'VALUE_SET'].includes(type) ? 'STRING' : type === 'NUMBER' ? 'DECIMAL' : type, source: 'RUNTIME', required: node.parameterDefinition?.required === true, parameterMode: node.parameterDefinition?.parameterMode || 'TEMPORARY' }
}

export function collectParameters(node, result = [], fields = []) {
  if (!node) return result
  if (node.nodeType === 'PREDICATE' && node.parameter) {
    const definition = node.parameter === 'period' ? { code: 'period', type: 'PERIOD', source: 'RUNTIME' } : runtimeParameterDefinition(node, fields)
    const previous = result.find(item => item.code === node.parameter)
    if (!previous || JSON.stringify(previous) !== JSON.stringify(definition)) result.push(definition)
  }
  ;(node.children || []).forEach((child) => collectParameters(child, result, fields))
  if (node.child) collectParameters(node.child, result, fields)
  return result
}

export function validateFilterNode(node, errors = [], fields = []) {
  if (!node) return ['请至少添加一条统计范围条件']
  if (node.nodeType === 'TRUE') return errors
  if (node.nodeType === 'PREDICATE') {
    if (node.valueSource === 'PARAMETER' && !node.parameter) errors.push('请填写运行参数名称')
    if (!node.fieldCode && !node.left) errors.push('请选择筛选字段')
    else if (!node.operator) errors.push('请选择该字段的判断方式')
    else if (node.left || node.right) {
      validateExpression(node.left || { expressionType: 'FIELD', fieldCode: node.fieldCode }, errors, fields)
      if (!node.parameter && !['IS_NULL', 'IS_NOT_NULL'].includes(node.operator)) validateExpression(node.right, errors, fields)
    }
    else if (['IS_NULL', 'IS_NOT_NULL'].includes(node.operator)) return errors
    else if (node.operator === 'BETWEEN' && !node.parameter && isContinuousField(fields.find((item) => item.code === node.fieldCode))) validateContinuousRange(node, fields.find((item) => item.code === node.fieldCode), errors)
    else if (node.operator === 'IN_VALUE_SET' ? isEmptyFilterValue(node.itemCodes) : (!node.parameter && isEmptyFilterValue(node.value))) errors.push('请填写或选择条件值')
    if (node.parameter && node.parameter !== 'period' && (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(node.parameter) || ['periodStart', 'periodEnd'].includes(node.parameter))) errors.push('运行参数名称不合法或与系统统计周期参数重名')
    return errors
  }
  if (node.nodeType === 'NOT') return validateFilterNode(node.child, errors, fields)
  if (!(node.children || []).length) errors.push('条件组不能为空')
  ;(node.children || []).forEach((child) => validateFilterNode(child, errors, fields))
  const definitions = collectParameters(node, [], fields)
  if (new Set(definitions.map(item => item.code)).size !== definitions.length && !errors.includes('同名运行参数的类型、必填性和用途必须一致')) errors.push('同名运行参数的类型、必填性和用途必须一致')
  return errors
}

export function validateExpression(node, errors = [], fields = [], depth = 0) {
  if (!supportedExpression(node, depth)) { errors.push('表达式不完整或不受支持'); return errors }
  if (node.expressionType === 'FIELD') {
    const ref = node.fieldRef || node.fieldCode
    const key = typeof ref === 'string' ? ref : ref?.sourceAlias ? `${ref.sourceAlias}.${ref.fieldName || ref.fieldCode}` : ref?.fieldName || ref?.fieldCode
    if (!key || fields.length && !fields.some(field => field.code === key)) errors.push('请选择当前参与计算的物理字段')
  } else if (node.expressionType === 'LITERAL') {
    if (isEmptyFilterValue(node.value)) errors.push('请填写表达式常量')
  } else if (node.expressionType === 'BINARY') {
    validateExpression(node.left, errors, fields, depth + 1); validateExpression(node.right, errors, fields, depth + 1)
  } else if (node.expressionType === 'FUNCTION') node.arguments.forEach(item => validateExpression(item, errors, fields, depth + 1))
  else { validateExpression(node.start, errors, fields, depth + 1); validateExpression(node.end, errors, fields, depth + 1) }
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
