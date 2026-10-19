export const arithmeticOperators = [['ADD', '加'], ['SUB', '减'], ['MUL', '乘'], ['DIV', '除']]
export const roundingModes = [['HALF_UP', '四舍五入'], ['HALF_DOWN', '半值向零舍入'], ['HALF_EVEN', '半值取偶数'], ['UP', '远离零舍入'], ['DOWN', '向零截断'], ['CEILING', '向上取整'], ['FLOOR', '向下取整'], ['UNNECESSARY', '不允许舍入']]
export const cloneFormula = value => JSON.parse(JSON.stringify(value))
export const formulaFunctions = [
  ['ROUND', '舍入'], ['ABS', '绝对值'], ['MIN', '最小值'], ['MAX', '最大值'],
  ['CLAMP', '限定范围'], ['COALESCE', '空值替代'], ['IF', '条件选择'],
  ['AVG', '平均数'], ['MEDIAN', '中位数'], ['PERCENTILE', '分位数']
]
export const comparisonOperators = [['EQ', '等于'], ['NE', '不等于'], ['GT', '大于'], ['GE', '大于等于'], ['LT', '小于'], ['LE', '小于等于']]
export const formulaChildren = node => node ? [node.left, node.right, node.operand, node.condition, node.whenTrue, node.whenFalse, ...(node.arguments || [])].filter(Boolean) : []

export function arithmeticDisplayError(display = {}) {
  if (display.multiplier != null && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(display.multiplier))) return '展示乘数应为有效数字'
  if (display.scale != null && (!Number.isInteger(display.scale) || display.scale < 0 || display.scale > 12)) return '展示精度应为 0 至 12 的整数'
  if (display.roundingMode && !roundingModes.some(([code]) => code === display.roundingMode)) return '展示舍入方式无效'
  return ''
}

export function arithmeticFormulaError(node, depth = 0) {
  if (!node || depth > 40) return '公式为空或嵌套层级过深'
  if (node.nodeType === 'FACTOR_REF') return String(node.factorVersionId || '') ? '' : '请选择因子'
  if (node.nodeType === 'CONST') return node.typeDescriptor?.valueType === 'BOOLEAN'
    ? (typeof node.value === 'boolean' ? '' : '请填写有效布尔常量')
    : typeof node.value !== 'boolean' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(node.value ?? '')) && Number.isFinite(Number(node.value)) ? '' : '请填写有效数字常量'
  if (node.nodeType === 'BINARY' && arithmeticOperators.some(([code]) => code === node.operator)) {
    if (node.operator === 'DIV' && !['RETURN_NULL', 'RETURN_ZERO', 'ERROR', undefined].includes(node.zeroDenominatorPolicy)) return '除零策略无效'
    return arithmeticFormulaError(node.left, depth + 1) || arithmeticFormulaError(node.right, depth + 1)
  }
  if (node.nodeType === 'COMPARE') return comparisonOperators.some(([code]) => code === node.comparator)
    ? arithmeticFormulaError(node.left, depth + 1) || arithmeticFormulaError(node.right, depth + 1) : '请选择比较方式'
  if (node.nodeType === 'UNARY' && ['ABS', 'NEGATE'].includes(node.operator)) return arithmeticFormulaError(node.operand, depth + 1)
  if (node.nodeType === 'CONDITION') return [node.condition, node.whenTrue, node.whenFalse].map(child => arithmeticFormulaError(child, depth + 1)).find(Boolean) || ''
  if (['FUNCTION', 'COALESCE'].includes(node.nodeType)) {
    const code = node.nodeType === 'COALESCE' ? 'COALESCE' : node.functionCode
    if (!formulaFunctions.some(([value]) => value === code)) return '该函数暂不支持可视化编辑'
    if (!Array.isArray(node.arguments) || !node.arguments.length) return '请添加函数参数'
    if (code === 'COALESCE' && node.arguments.length < 2) return '空值替代至少需要两个参数'
    if (['ROUND', 'ABS'].includes(code) && node.arguments.length !== 1 || ['IF', 'CLAMP'].includes(code) && node.arguments.length !== 3) return '函数参数数量不正确'
    if (code === 'ROUND') {
      if (!Number.isInteger(node.scale) || node.scale < 0 || node.scale > 10) return '舍入精度应为 0 至 10 的整数'
      if (node.roundingMode && !roundingModes.some(([value]) => value === node.roundingMode)) return '舍入方式无效'
    }
    if (code === 'PERCENTILE' && (!/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(String(node.percentile ?? '')))) return '分位数参数应为 0 至 1 的数值'
    return node.arguments.map(child => arithmeticFormulaError(child, depth + 1)).find(Boolean) || ''
  }
  return '该节点类型暂不支持可视化编辑'
}

export function arithmeticFactorIds(node) {
  if (!node) return []
  if (node.nodeType === 'FACTOR_REF') return node.factorVersionId ? [String(node.factorVersionId)] : []
  return [...new Set(formulaChildren(node).flatMap(arithmeticFactorIds))]
}

export function createArithmeticNode(type, previous = {}) {
  const base = previous.nodeId ? { nodeId: previous.nodeId } : {}
  const factor = () => ({ nodeType: 'FACTOR_REF', factorVersionId: '' })
  if (type === 'FACTOR_REF') return { ...base, ...factor() }
  if (type === 'CONST') return { ...base, nodeType: type, value: '1', typeDescriptor: { valueType: 'DECIMAL', dimension: 'ONE', unit: 'ONE' } }
  if (type === 'FUNCTION') return { ...base, nodeType: type, functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [previous.nodeType ? cloneFormula({ ...previous, nodeId: undefined }) : factor()] }
  return { ...base, nodeType: 'BINARY', operator: 'ADD', left: factor(), right: factor() }
}

export function wrapArithmeticNode(node, operator) {
  const operand = cloneFormula(node || createArithmeticNode('FACTOR_REF'))
  if (operator === 'ROUND') return { nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [operand] }
  if (!arithmeticOperators.some(([code]) => code === operator)) throw new Error('不支持的运算符')
  return { nodeType: 'BINARY', operator, left: operand, right: createArithmeticNode('FACTOR_REF'), ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) }
}

export function buildArithmeticFormula(root, original = {}) {
  const error = arithmeticFormulaError(root) || arithmeticDisplayError(original.display)
  if (error) throw new Error(error)
  const formula = cloneFormula({ schemaVersion: '1.0', astType: 'INDICATOR_FORMULA', ...original, root })
  const used = new Set()
  const reserve = node => {
    if (node.nodeId) used.add(node.nodeId)
    formulaChildren(node).forEach(reserve)
  }
  reserve(formula.root)
  let sequence = 0
  const assigned = new Set()
  const assign = node => {
    if (!node.nodeId || assigned.has(node.nodeId)) {
      do { node.nodeId = `editor_node_${++sequence}` } while (used.has(node.nodeId))
      used.add(node.nodeId)
    }
    assigned.add(node.nodeId)
    formulaChildren(node).forEach(assign)
  }
  assign(formula.root)
  return formula
}

export function arithmeticFormulaText(node, factors = []) {
  if (!node) return ''
  const text = child => arithmeticFormulaText(child, factors)
  if (node.nodeType === 'FACTOR_REF') return factors.find(f => String(f.versionId ?? f.factorVersionId) === String(node.factorVersionId))?.name || factors.find(f => String(f.factorVersionId) === String(node.factorVersionId))?.factorName || `因子 ${node.factorVersionId || '待选择'}`
  if (node.nodeType === 'CONST') return String(node.value ?? '')
  if (node.nodeType === 'COMPARE') return `(${text(node.left)} ${{ EQ: '=', NE: '≠', GT: '>', GE: '≥', LT: '<', LE: '≤' }[node.comparator]} ${text(node.right)})`
  if (node.nodeType === 'UNARY') return `${node.operator === 'NEGATE' ? '负值' : '绝对值'}(${text(node.operand)})`
  if (node.nodeType === 'CONDITION') return `IF(${text(node.condition)}, ${text(node.whenTrue)}, ${text(node.whenFalse)})`
  if (['FUNCTION', 'COALESCE'].includes(node.nodeType)) {
    const code = node.nodeType === 'COALESCE' ? 'COALESCE' : node.functionCode
    return `${code}(${(node.arguments || []).map(text).join(', ')}${code === 'ROUND' ? `, ${node.scale}` : code === 'PERCENTILE' ? `; P${Number(node.percentile) * 100}` : ''})`
  }
  return `(${text(node.left)} ${{ ADD: '+', SUB: '−', MUL: '×', DIV: '÷' }[node.operator] || '?'} ${text(node.right)})`
}
