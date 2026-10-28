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
    primaryDomain: {}, expression: newExpression('BINARY'),
    output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', grain: [] } }
}

export function simpleDerivedExpression(node) {
  if (node?.nodeType === 'FACTOR_REF') return { operator: 'REF', left: node, right: null }
  if (node?.nodeType === 'BINARY' && ['ADD', 'SUB', 'MUL', 'DIV'].includes(node.operator)
    && node.left?.nodeType === 'FACTOR_REF' && node.right?.nodeType === 'FACTOR_REF') {
    return { operator: node.operator, left: node.left, right: node.right }
  }
  return null
}

export function buildSimpleDerivedExpression(operator, left, right, zeroDenominatorPolicy = 'RETURN_NULL') {
  const factorRef = value => value?.nodeType === 'FACTOR_REF'
    ? { ...value, factorVersionId: String(value.factorVersionId || '') }
    : { nodeType: 'FACTOR_REF', factorVersionId: String(value || ''), alignmentPolicy: 'STRICT_EQUAL' }
  if (operator === 'REF') return factorRef(left)
  return { nodeType: 'BINARY', operator, left: factorRef(left), right: factorRef(right),
    ...(operator === 'DIV' ? { zeroDenominatorPolicy } : {}) }
}

export function expressionChildren(node = {}) {
  if (['BINARY', 'COMPARE'].includes(node.nodeType)) return [['left', '左侧'], ['right', '右侧']]
  if (node.nodeType === 'UNARY') return [['operand', '操作数']]
  if (node.nodeType === 'CONDITION') return [['condition', '条件'], ['whenTrue', '满足时'], ['whenFalse', '不满足时']]
  return []
}

export function validateDerivedFactor(dsl, versions = []) {
  if (!dsl.primaryDomain || typeof dsl.primaryDomain !== 'object' || Array.isArray(dsl.primaryDomain)) throw new Error('因子归类信息格式不正确，请重新打开页面')
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
    return { ...factor, versionId: id, name: option?.factorName || factor?.name || `原子因子版本 ${id}` }
  })
}

export function activeSourceBindings(bindings, factors, fields) {
  const ids = new Set(factors.map(item => String(item.versionId)))
  return Object.fromEntries(Object.entries(bindings).filter(([id]) => ids.has(id)).map(([id, values]) =>
    [id, Object.fromEntries(Object.entries(values).filter(([field, value]) => fields.includes(field) && value))]))
}


export function derivedReferenceIds(expression) {
  const ids = new Set()
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (node.nodeType === 'FACTOR_REF' && node.factorVersionId) ids.add(String(node.factorVersionId))
    expressionChildren(node).forEach(([key]) => visit(node[key]))
    ;(node.arguments || []).forEach(visit)
  }
  visit(expression)
  return [...ids]
}

// Only reuse declared, compatible metadata. Never invent a domain or a money/count unit.
export function derivedResultDefaults(expression, versions) {
  const byId = new Map(versions.map(version => [String(version.id ?? version.versionId), version]))
  const refs = derivedReferenceIds(expression).map(id => byId.get(id)).filter(Boolean)
  const modes = [...new Set(refs.map(item => item.calculationMode || item.dsl?.calculationMode).filter(Boolean))]
  const grainKey = grain => JSON.stringify([...new Set(grain || [])].sort())
  const strictIds = new Set()
  const aligned = node => { if (!node || typeof node !== 'object') return; if (node.nodeType === 'FACTOR_REF' && node.alignmentPolicy !== 'SCALAR_BROADCAST') strictIds.add(String(node.factorVersionId)); expressionChildren(node).forEach(([key]) => aligned(node[key])); (node.arguments || []).forEach(aligned) }
  aligned(expression)
  const outputs = refs.filter(item => strictIds.has(String(item.id ?? item.versionId))).map(item => item.output || item.dsl?.output || {})
  const grains = [...new Set(outputs.map(output => grainKey(output.grain)))]
  const output = { valueType: 'DECIMAL', semanticKind: 'MEASURE', grain: grains.length === 1 ? JSON.parse(grains[0]) : [] }
  const typeOf = node => {
    if (node?.nodeType === 'FACTOR_REF') return byId.get(String(node.factorVersionId))?.output || byId.get(String(node.factorVersionId))?.dsl?.output || {}
    if (node?.nodeType === 'BINARY' && ['ADD', 'SUB'].includes(node.operator)) {
      const left = typeOf(node.left), right = typeOf(node.right), result = {}
      for (const key of ['dimension', 'unit']) {
        if (left[key] && right[key] && left[key] !== right[key]) throw new Error(`相加或相减的因子${key === 'unit' ? '单位' : '量纲'}不一致，请选择兼容的因子`)
        if (left[key] && left[key] === right[key]) result[key] = left[key]
      }
      return result
    }
    if (node?.nodeType === 'UNARY' || node?.nodeType === 'FUNCTION' && ['ROUND', 'ABS'].includes(node.functionCode)) return typeOf(node.operand || node.arguments?.[0])
    return {}
  }
  const declared = typeOf(expression)
  for (const key of ['dimension', 'unit']) if (declared[key]) output[key] = declared[key]
  if (modes.length > 1) throw new Error('引用因子的计算模式不一致，请选择同为时序或同为静态的因子')
  return { output, calculationMode: modes[0], grainConflict: grains.length > 1 }
}
