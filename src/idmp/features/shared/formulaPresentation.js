import { resultNumber } from './resultPresentation.js'

export const operandFields = [
  { field: 'numeratorValue', alias: 'numerator', label: '分子' },
  { field: 'denominatorValue', alias: 'denominator', label: '分母' }
]

export function isRatioFormula(formula) {
  const root = formula?.root || formula
  return root?.nodeType === 'BINARY' && root.operator === 'DIV'
}

export function operandValue(row, operand) {
  return row?.[operand.field] ?? row?.[operand.alias]
}

// Unknown formulas may expose optional operands through the result contract.
// An explicit non-ratio formula must never inherit stale ratio-only fields.
export function resultOperandColumns(rows = [], formula) {
  if (formula != null && !isRatioFormula(formula)) return []
  return operandFields.filter(operand => rows.some(row => resultNumber(operandValue(row, operand)) !== null))
}
