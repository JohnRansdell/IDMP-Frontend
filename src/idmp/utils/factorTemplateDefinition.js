import { factorPeriodColumn, withoutLegacyPeriod } from './factorPeriod.js'
import { collectParameters, serializeExpression, serializeFilterNode, validateExpression, validateFilterNode, describeFieldExpression } from './dslBuilder.js'

export function templatePeriodField(definition) {
  return definition?.nodeType ? factorPeriodColumn({ filters: definition }) : factorPeriodColumn(definition)
}

export function buildFactorTemplateDefinition(designer, fields = []) {
  const mode = designer.calculationMode || 'TEMPORAL'
  const primaryDomain = { ...designer.primaryOptions, domainCode: designer.domainCode, tableName: designer.tableName }
  const aggregation = { function: designer.aggregation }
  if (designer.fieldExpression) aggregation.fieldExpression = serializeExpression(designer.fieldExpression)
  else if (designer.fieldCode) aggregation.fieldCode = designer.fieldCode
  else if (designer.extraDefinition?.aggregationField) Object.assign(aggregation, designer.extraDefinition.aggregationField)
  const filter = designer.scopeMode === 'ALL' ? { nodeType: 'TRUE' } : designer.filters || { nodeType: 'TRUE' }
  const filters = serializeFilterNode(withoutLegacyPeriod(filter), fields)
  const parameters = [...(designer.runtimeParameters || [])]
  for (const parameter of collectParameters(filter, [], fields)) {
    const index = parameters.findIndex(item => item.code === parameter.code)
    if (index < 0) parameters.push(parameter)
    else parameters[index] = parameter
  }
  const { aggregationField, periodColumn, ...extra } = designer.extraDefinition || {}
  return {
    ...extra, schemaVersion: '1.0', dslType: 'FACTOR', calculationMode: mode, primaryDomain,
    ...(mode === 'TEMPORAL' && designer.periodFieldCode ? { periodColumn: designer.periodFieldCode } : {}),
    filters, aggregation, groupBy: designer.groupBy || [], parameters,
    output: { valueType: designer.output.valueType, semanticKind: 'MEASURE', dimension: designer.aggregation === 'COUNT' ? 'COUNT' : 'VALUE', unit: designer.output.unit, nullable: false, precision: Number(designer.output.precision || 30), scale: Number(designer.output.scale ?? 10), grain: [] },
    applicableDomains: designer.domainCode ? [{ domainCode: designer.domainCode }] : [],
    allowedGrains: designer.allowedGrains,
    drillPathVersionIds: designer.drillPathVersionIds.map(String).filter(id => /^\d+$/.test(id))
  }
}

export function validateTemplateConditions(designer, fields = []) {
  const errors = []
  const filters = designer.scopeMode === 'ALL' ? { nodeType: 'TRUE' } : designer.filters
  validateFilterNode(filters, errors, fields)
  if (designer.fieldExpression) validateExpression(designer.fieldExpression, errors, fields)
  const parameters = new Set((designer.parameters || []).map(item => item.code?.toUpperCase()))
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (Object.hasOwn(node, 'parameterRef') && (!node.parameterRef || !parameters.has(String(node.parameterRef).toUpperCase()))) errors.push('请选择已声明的模板参数；删除或重命名参数后需更新引用')
    if (node.nodeType === 'PREDICATE' && !node.left && node.fieldCode && fields.length && !fields.some(field => field.code === node.fieldCode)) errors.push('筛选字段不属于当前物理表')
    Object.values(node).forEach(visit)
  }
  visit(filters)
  visit(designer.fieldExpression)
  return [...new Set(errors)]
}

export function describeTemplateConditions(node, fields = [], parameters = []) {
  const value = item => item && typeof item === 'object' && Object.hasOwn(item, 'parameterRef')
    ? `参数「${parameters.find(parameter => parameter.code?.toUpperCase() === String(item.parameterRef).toUpperCase())?.displayName || item.parameterRef || '未选择'}」`
    : Array.isArray(item) ? item.join('、') : item && typeof item === 'object' ? JSON.stringify(item) : String(item ?? '')
  const expression = item => {
    if (!item) return '未完成表达式'
    if (item.expressionType === 'LITERAL') return value(item.value)
    const replaced = JSON.parse(JSON.stringify(item), (key, child) => key === 'value' && child?.parameterRef !== undefined ? value(child) : child)
    return describeFieldExpression(replaced, fields)
  }
  if (!node || node.nodeType === 'TRUE') return '全部记录'
  if (node.nodeType === 'NOT') return `非（${describeTemplateConditions(node.child, fields, parameters)}）`
  if (node.nodeType === 'PREDICATE') {
    const left = node.left ? expression(node.left) : fields.find(field => field.code === node.fieldCode)?.label || node.fieldCode || '未选择字段'
    const operator = { EQ: '=', NE: '≠', GT: '>', GTE: '≥', LT: '<', LTE: '≤', LIKE: '匹配', NOT_LIKE: '不匹配', BETWEEN: '位于范围', IN_VALUE_SET: '属于', IS_NULL: '为空', IS_NOT_NULL: '非空' }[node.operator] || node.operator
    const right = node.parameter ? `运行参数「${node.parameter}」` : node.right ? expression(node.right) : value(node.operator === 'IN_VALUE_SET' ? node.itemCodes : node.value)
    return `${left} ${operator}${['IS_NULL', 'IS_NOT_NULL'].includes(node.operator) ? '' : ` ${right}`}`
  }
  return `（${(node.children || []).map(child => describeTemplateConditions(child, fields, parameters)).join(node.nodeType === 'OR' ? ' 或 ' : ' 且 ')}）`
}
