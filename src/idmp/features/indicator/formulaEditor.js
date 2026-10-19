import { arithmeticFormulaError, arithmeticFactorIds, statisticMethodForNode } from './arithmeticFormula.js'

const factorId = node => node?.nodeType === 'FACTOR_REF' ? String(node.factorVersionId ?? node.versionId ?? node.refVersionId ?? '') : ''

function additiveFactors(node) {
  const id = factorId(node)
  if (id) return [id]
  if (node?.nodeType !== 'BINARY' || node.operator !== 'ADD') return null
  const left = additiveFactors(node.left)
  const right = additiveFactors(node.right)
  return left && right ? [...left, ...right] : null
}

export function parseEditorFormula(formula) {
  const root = formula?.root || formula
  if (!root) return null
  const percent = formula?.display?.format === 'PERCENT'
  if (root.nodeType === 'STATISTIC') {
    const left = (root.children || []).map(factorId)
    return left.length && left.every(Boolean) ? { mode: '统计量型', left, right: [], statistic: root.operator } : null
  }
  const statistic = statisticMethodForNode(root)
  if (statistic) {
    const left = (root.arguments || []).map(factorId)
    if (left.length && left.every(Boolean) && !arithmeticFormulaError(root)) return { mode: '统计量型', left, right: [], statistic }
  }
  const additive = additiveFactors(root)
  if (additive) return { mode: '加法合成型', left: additive, right: [] }
  const advanced = () => arithmeticFormulaError(root) ? null : { mode: '嵌套公式型', left: arithmeticFactorIds(root), right: [] }
  if (root.nodeType !== 'BINARY' || !['DIV', 'SUB', 'MUL'].includes(root.operator)) return advanced()
  const left = additiveFactors(root.left)
  const right = additiveFactors(root.right)
  if (!left || !right) return advanced()
  const mode = root.operator === 'DIV'
    ? (percent ? (left.length + right.length > 2 ? '复合比率型' : '简单比率型') : (left.length + right.length > 2 ? '复合比值型' : '比值型'))
    : '多因子计算型'
  return { mode, left, right, operator: root.operator, policy: root.zeroDenominatorPolicy || 'RETURN_NULL' }
}

export const zeroPolicy = label => ({ '返回 NULL': 'RETURN_NULL', '返回 0': 'RETURN_ZERO', '标记异常': 'ERROR' }[label] || 'RETURN_NULL')
export const zeroPolicyLabel = policy => ({ RETURN_NULL: '返回 NULL', RETURN_ZERO: '返回 0', ERROR: '标记异常' }[policy] || '返回 NULL')
