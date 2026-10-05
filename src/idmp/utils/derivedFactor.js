export const expressionTypes = [
  ['FACTOR_REF', '引用因子'], ['CONST', '数值常量'], ['BINARY', '四则运算'],
  ['UNARY', '一元运算'], ['COMPARE', '比较'], ['CONDITION', '条件判断'], ['FUNCTION', '函数'], ['COALESCE', '空值替代']
]

export function newExpression(type = 'FACTOR_REF') {
  const ref = () => ({ nodeType: 'FACTOR_REF', factorVersionId: '', alignmentPolicy: 'STRICT_EQUAL' })
  switch (type) {
    case 'CONST': return { nodeType: type, value: '0' }
    case 'BINARY': return { nodeType: type, operator: 'ADD', left: ref(), right: ref() }
    case 'COMPARE': return { nodeType: type, comparator: 'GT', left: ref(), right: newExpression('CONST') }
    case 'UNARY': return { nodeType: type, operator: 'ABS', operand: ref() }
    case 'CONDITION': return { nodeType: type, condition: newExpression('COMPARE'), whenTrue: ref(), whenFalse: newExpression('CONST') }
    case 'FUNCTION': return { nodeType: type, functionCode: 'COALESCE', arguments: [ref(), newExpression('CONST')] }
    case 'COALESCE': return { nodeType: type, arguments: [ref(), newExpression('CONST')] }
    default: return ref()
  }
}

export function newDerivedFactor() {
  return { schemaVersion: '1.1', dslType: 'FACTOR', definitionKind: 'DERIVED', calculationMode: 'TEMPORAL',
    primaryDomain: { domainCode: '' }, expression: newExpression('BINARY'),
    output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: 'COUNT', unit: 'COUNT', grain: [] } }
}

export function expressionChildren(node = {}) {
  if (['BINARY', 'COMPARE'].includes(node.nodeType)) return [['left', '左侧'], ['right', '右侧']]
  if (node.nodeType === 'UNARY') return [['operand', '操作数']]
  if (node.nodeType === 'CONDITION') return [['condition', '条件'], ['whenTrue', '满足时'], ['whenFalse', '不满足时']]
  return []
}

export function validateDerivedFactor(dsl, versions = []) {
  if (!dsl.primaryDomain?.domainCode) throw new Error('请选择数据域')
  let refs = 0
  const ids = new Map(versions.map(item => [String(item.id ?? item.versionId), item]))
  const grain = values => JSON.stringify([...new Set((values || []).map(value => String(value).trim().toUpperCase()))].sort())
  const visit = (node, depth = 0) => {
    if (depth > 32) throw new Error('公式嵌套过深，请拆分成多个复合因子')
    if (!expressionTypes.some(([type]) => type === node?.nodeType)) throw new Error('请选择公式节点类型')
    if (node.nodeType === 'FACTOR_REF') {
      refs += 1
      const version = ids.get(String(node.factorVersionId))
      if (!version || (version.status || version.publicationStatus) !== 'PUBLISHED') throw new Error('公式只能引用已发布的因子版本，请重新选择')
      const actual = version.output?.grain || version.dsl?.output?.grain || []
      if (node.alignmentPolicy === 'SCALAR_BROADCAST' && actual.length) throw new Error('总体广播只能引用不分组的因子')
      if (node.alignmentPolicy !== 'SCALAR_BROADCAST' && grain(actual) !== grain(dsl.output?.grain)) throw new Error('引用因子的分组粒度与当前输出粒度不一致')
    }
    if (node.nodeType === 'CONST' && (String(node.value ?? '').trim() === '' || !Number.isFinite(Number(node.value)))) throw new Error('请输入有效的数值常量')
    if (node.nodeType === 'BINARY' && !['ADD', 'SUB', 'MUL', 'DIV'].includes(node.operator)) throw new Error('请选择运算方式')
    if (node.nodeType === 'BINARY' && node.operator === 'DIV' && !['RETURN_NULL', 'RETURN_ZERO', 'ERROR'].includes(node.zeroDenominatorPolicy)) throw new Error('请选择分母为零时的处理方式')
    if (node.nodeType === 'COMPARE' && !['EQ', 'NE', 'GT', 'GE', 'LT', 'LE'].includes(node.comparator)) throw new Error('请选择比较方式')
    if (node.nodeType === 'UNARY' && !['ABS', 'NEGATE'].includes(node.operator)) throw new Error('请选择一元运算方式')
    expressionChildren(node).forEach(([key]) => visit(node[key], depth + 1))
    if (['FUNCTION', 'COALESCE'].includes(node.nodeType)) {
      const fn = node.nodeType === 'COALESCE' ? 'COALESCE' : node.functionCode
      if (!['COALESCE', 'IF', 'ABS', 'ROUND', 'MIN', 'MAX', 'CLAMP'].includes(fn)) throw new Error('请选择支持的函数')
      const count = node.arguments?.length || 0
      if (!count || (fn === 'ABS' && count !== 1) || (['IF', 'CLAMP'].includes(fn) && count !== 3) || (fn === 'ROUND' && ![1, 2].includes(count))) throw new Error('函数参数数量不正确')
      node.arguments.forEach(child => visit(child, depth + 1))
    }
  }
  visit(dsl.expression)
  if (!refs) throw new Error('公式至少需要引用一个已发布因子')
  return dsl
}

export function configurableSourceFactors(selected = [], capability = {}, catalog = []) {
  const ids = capability.factorVersionIds?.length ? capability.factorVersionIds : selected.map(item => item.versionId)
  const options = capability.fieldOptions || []
  return [...new Set(ids.map(String))].map(id => {
    const option = options.find(item => String(item.factorVersionId) === id)
    const factor = [...selected, ...catalog].find(item => String(item.versionId) === id)
    return { ...factor, versionId: id, name: option?.factorName || factor?.name || `源因子版本 ${id}` }
  })
}

export function activeSourceBindings(bindings, factors, fields) {
  const ids = new Set(factors.map(item => String(item.versionId)))
  return Object.fromEntries(Object.entries(bindings).filter(([id]) => ids.has(id)).map(([id, values]) =>
    [id, Object.fromEntries(Object.entries(values).filter(([field, value]) => fields.includes(field) && value))]))
}
