export const arithmeticOperators = [['ADD', '加'], ['SUB', '减'], ['MUL', '乘'], ['DIV', '除']]
export const roundingModes = [['HALF_UP', '四舍五入'], ['HALF_DOWN', '半值向零舍入'], ['HALF_EVEN', '半值取偶数'], ['UP', '远离零舍入'], ['DOWN', '向零截断'], ['CEILING', '向上取整'], ['FLOOR', '向下取整'], ['UNNECESSARY', '不允许舍入']]
export const cloneFormula = value => JSON.parse(JSON.stringify(value))

export function arithmeticDisplayError(display = {}) {
  if (display.multiplier != null && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(display.multiplier))) return '展示乘数应为有效数字'
  if (display.scale != null && (!Number.isInteger(display.scale) || display.scale < 0 || display.scale > 12)) return '展示精度应为 0 至 12 的整数'
  if (display.roundingMode && !roundingModes.some(([code]) => code === display.roundingMode)) return '展示舍入方式无效'
  return ''
}

export function arithmeticFormulaError(node, depth = 0) {
  if (!node || depth > 40) return '公式为空或嵌套层级过深'
  if (node.nodeType === 'FACTOR_REF') return String(node.factorVersionId || '') ? '' : '请选择因子'
  if (node.nodeType === 'CONST') return node.typeDescriptor?.valueType !== 'BOOLEAN' && typeof node.value !== 'boolean' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(node.value ?? '')) && Number.isFinite(Number(node.value)) ? '' : '请填写有效数字常量'
  if (node.nodeType === 'BINARY' && arithmeticOperators.some(([code]) => code === node.operator)) {
    if (node.operator === 'DIV' && !['RETURN_NULL', 'RETURN_ZERO', 'ERROR', undefined].includes(node.zeroDenominatorPolicy)) return '除零策略无效'
    return arithmeticFormulaError(node.left, depth + 1) || arithmeticFormulaError(node.right, depth + 1)
  }
  if (node.nodeType === 'FUNCTION' && node.functionCode === 'ROUND' && node.arguments?.length === 1) {
    if (!Number.isInteger(node.scale) || node.scale < 0 || node.scale > 12) return '舍入精度应为 0 至 12 的整数'
    if (node.roundingMode && !roundingModes.some(([code]) => code === node.roundingMode)) return '舍入方式无效'
    return arithmeticFormulaError(node.arguments[0], depth + 1)
  }
  return '该节点类型暂不支持可视化编辑'
}

export function arithmeticFactorIds(node) {
  if (!node) return []
  if (node.nodeType === 'FACTOR_REF') return node.factorVersionId ? [String(node.factorVersionId)] : []
  return [...new Set([node.left, node.right, ...(node.arguments || [])].flatMap(arithmeticFactorIds))]
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
    ;[node.left, node.right, ...(node.arguments || [])].filter(Boolean).forEach(reserve)
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
    ;[node.left, node.right, ...(node.arguments || [])].filter(Boolean).forEach(assign)
  }
  assign(formula.root)
  return formula
}

export function arithmeticFormulaText(node, factors = []) {
  if (!node) return ''
  const text = child => arithmeticFormulaText(child, factors)
  if (node.nodeType === 'FACTOR_REF') return factors.find(f => String(f.versionId ?? f.factorVersionId) === String(node.factorVersionId))?.name || factors.find(f => String(f.factorVersionId) === String(node.factorVersionId))?.factorName || `因子 ${node.factorVersionId || '待选择'}`
  if (node.nodeType === 'CONST') return String(node.value ?? '')
  if (node.nodeType === 'FUNCTION') return `ROUND(${text(node.arguments?.[0])}, ${node.scale})`
  return `(${text(node.left)} ${{ ADD: '+', SUB: '−', MUL: '×', DIV: '÷' }[node.operator] || '?'} ${text(node.right)})`
}
