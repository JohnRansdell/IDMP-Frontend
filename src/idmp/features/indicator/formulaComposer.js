import { cloneFormula, createArithmeticNode } from './arithmeticFormula.js'

export const formulaBlockModes = [
  { code: 'RATIO', name: '简单比率型', expression: '分子 ÷ 分母 × 100' },
  { code: 'SUM', name: '加法合成型', expression: 'A + B + …' },
  { code: 'COMPOSITE_RATIO', name: '复合比率型', expression: '(A + B) ÷ (C + D) × 100' },
  { code: 'ARITHMETIC', name: '多因子计算型', expression: 'A − B / A × B' },
  { code: 'STATISTIC', name: '统计量型', expression: '统计方法', disabled: true, reason: '后端暂不支持将统计量节点嵌入公式' },
  { code: 'QUOTIENT', name: '比值型', expression: '分子 ÷ 分母' },
  { code: 'COMPOSITE_QUOTIENT', name: '复合比值型', expression: '(A + B) ÷ (C + D)' },
  { code: 'ROUND', name: '舍入', expression: 'ROUND(A)' }
]

export const emptyFormulaSlot = () => createArithmeticNode('FACTOR_REF')
const binary = (operator, left = emptyFormulaSlot(), right = emptyFormulaSlot()) => ({ nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: 'RETURN_NULL' } : {}) })
const number = value => ({ ...createArithmeticNode('CONST'), value: String(value) })
export const isEmptyFormulaSlot = node => !node || (node.nodeType === 'FACTOR_REF' && !node.factorVersionId)

export function createFormulaBlock(code) {
  if (code === 'SUM') return binary('ADD')
  if (code === 'ARITHMETIC') return binary('SUB')
  if (code === 'ROUND') return { nodeType: 'FUNCTION', functionCode: 'ROUND', scale: 2, roundingMode: 'HALF_UP', arguments: [emptyFormulaSlot()] }
  if (!['RATIO', 'COMPOSITE_RATIO', 'QUOTIENT', 'COMPOSITE_QUOTIENT'].includes(code)) throw new Error('该计算模式暂不支持嵌套')
  const composite = code.startsWith('COMPOSITE_')
  const quotient = binary('DIV', composite ? binary('ADD') : emptyFormulaSlot(), composite ? binary('ADD') : emptyFormulaSlot())
  // 子公式必须携带自己的百分比运算，不能借用整个指标的展示乘数。
  return code.endsWith('RATIO') ? binary('MUL', quotient, number('100')) : quotient
}

export function formulaAt(root, path = []) {
  return path.reduce((node, key) => node?.[key], root)
}

export function replaceFormulaAt(root, path, replacement) {
  if (!path.length) return cloneFormula(replacement)
  const [key, ...rest] = path
  if (!root || !Object.hasOwn(root, key)) throw new Error('公式位置已变化，请重新选择')
  const copy = Array.isArray(root) ? [...root] : { ...root }
  copy[key] = replaceFormulaAt(root[key], rest, replacement)
  return copy
}

function sumSlots(node, path = []) {
  if (node?.nodeType === 'BINARY' && node.operator === 'ADD') return [...sumSlots(node.left, [...path, 'left']), ...sumSlots(node.right, [...path, 'right'])]
  return [{ path, node }]
}

export function describeFormulaBlock(node) {
  if (isEmptyFormulaSlot(node)) return { name: '公式', slots: [] }
  if (node.nodeType === 'FACTOR_REF') return { name: '因子', slots: [] }
  if (node.nodeType === 'CONST') return { name: '数字常量', slots: [] }
  if (node.nodeType === 'FUNCTION' && node.functionCode === 'ROUND') return { name: '舍入', slots: [{ label: '计算对象', path: ['arguments', 0], node: node.arguments[0] }] }
  const percent = node.nodeType === 'BINARY' && node.operator === 'MUL' && node.left?.nodeType === 'BINARY' && node.left.operator === 'DIV' && node.right?.nodeType === 'CONST' && Number(node.right.value) === 100
  const division = percent ? node.left : node
  if (division.nodeType === 'BINARY' && division.operator === 'DIV') {
    const base = percent ? ['left'] : []
    const composite = [division.left, division.right].some(n => n?.nodeType === 'BINARY' && n.operator === 'ADD')
    return { name: percent ? (composite ? '复合比率型' : '简单比率型') : (composite ? '复合比值型' : '比值型'), divisionPath: base, ...(percent ? { multiplierPath: ['right'] } : {}),
      slots: [{ label: '分子', path: [...base, 'left'], node: division.left }, { label: '分母', path: [...base, 'right'], node: division.right }] }
  }
  if (node.nodeType === 'BINARY' && node.operator === 'ADD') return { name: '加法合成型', additive: true, slots: sumSlots(node).map((item, index) => ({ ...item, label: `参与项 ${index + 1}` })) }
  if (node.nodeType === 'BINARY') return { name: '多因子计算型', operation: true, slots: [{ label: node.operator === 'SUB' ? '被减数' : '乘数 1', path: ['left'], node: node.left }, { label: node.operator === 'SUB' ? '减数' : '乘数 2', path: ['right'], node: node.right }] }
  return { name: '暂不支持的计算模式', slots: [] }
}

export function insertFormulaBlock(root, path, item) {
  const existing = formulaAt(root, path)
  let next = cloneFormula(item)
  if (!isEmptyFormulaSlot(existing)) {
    const first = describeFormulaBlock(next).slots[0]
    if (first) next = replaceFormulaAt(next, first.path, existing)
  }
  return replaceFormulaAt(root, path, next)
}

export function removeSumSlot(root, groupPath, slotPath) {
  const group = formulaAt(root, groupPath)
  const descriptor = describeFormulaBlock(group)
  if (!descriptor.additive || !descriptor.slots.some(slot => JSON.stringify(slot.path) === JSON.stringify(slotPath))) throw new Error('所选参与项不存在')
  if (descriptor.slots.length <= 2) return replaceFormulaAt(root, [...groupPath, ...slotPath], emptyFormulaSlot())
  const parentPath = slotPath.slice(0, -1)
  const parent = formulaAt(group, parentPath)
  const sibling = slotPath.at(-1) === 'left' ? parent.right : parent.left
  return replaceFormulaAt(root, [...groupPath, ...parentPath], sibling)
}
