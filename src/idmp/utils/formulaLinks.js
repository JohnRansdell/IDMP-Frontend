export function splitFormulaLinks(expression, factors = []) {
  factors = Array.isArray(factors) ? factors : []
  const names = new Map()
  for (const factor of factors) names.set(factor.factorName, (names.get(factor.factorName) || 0) + 1)
  const references = factors.filter(factor => factor.factorName && factor.factorVersionId).map(factor => ({
    text: `【${factor.factorName}${names.get(factor.factorName) > 1 ? `（版本 ${factor.factorVersionId}）` : ''}】`,
    factorVersionId: String(factor.factorVersionId)
  })).sort((a, b) => b.text.length - a.text.length)
  const segments = []
  let remaining = expression || ''
  while (remaining) {
    let match = null, position = remaining.length
    for (const reference of references) {
      const index = remaining.indexOf(reference.text)
      if (index >= 0 && index < position) { match = reference; position = index }
    }
    if (!match) { segments.push({ text: remaining }); break }
    if (position) segments.push({ text: remaining.slice(0, position) })
    segments.push(match)
    remaining = remaining.slice(position + match.text.length)
  }
  return segments
}

function maskFactorLabels(expression, factors) {
  const segments = splitFormulaLinks(expression, factors)
  if (segments.some(segment => !segment.factorVersionId && /[【】]/.test(segment.text))) return null
  return segments.map(segment => segment.factorVersionId ? ' '.repeat(segment.text.length) : segment.text).join('')
}

function rootDivision(expression, factors) {
  const structure = maskFactorLabels(expression, factors)
  if (!structure?.startsWith('(') || !structure.endsWith(')')) return null
  let depth = 0, division = null
  for (let index = 0; index < structure.length; index += 1) {
    const symbol = structure[index]
    if (symbol === '(') depth += 1
    else if (symbol === ')') depth -= 1
    else if (symbol === '÷' && depth === 1) {
      if (division !== null) return null
      division = index
    }
    if (depth < 0 || (depth === 0 && index < structure.length - 1)) return null
  }
  return depth === 0 ? division : null
}

function fractionSegments(expression, factors) {
  let text = expression.trim()
  const structure = maskFactorLabels(text, factors)
  if (structure?.startsWith('(') && structure.endsWith(')')) {
    let depth = 0, wrapped = true
    for (let index = 0; index < structure.length - 1; index += 1) {
      if (structure[index] === '(') depth += 1
      else if (structure[index] === ')') depth -= 1
      if (depth <= 0) { wrapped = false; break }
    }
    if (wrapped && depth === 1) text = text.slice(1, -1).trim()
  }
  return splitFormulaLinks(text, factors).map(segment => segment.factorVersionId
    ? { ...segment, text: segment.text.slice(1, -1) } : segment)
}

export function splitFormulaFraction(formula, definition) {
  if (formula?.root?.nodeType !== 'BINARY' || formula.root.operator !== 'DIV') return null
  const expression = definition?.expression
  if (typeof expression !== 'string') return null
  const display = definition.displayExpression || expression
  if (typeof display !== 'string' || !display.startsWith(expression)) return null
  // Factor names can contain parentheses or division symbols; their labels are opaque.
  const division = rootDivision(expression, definition.factors)
  if (division === null) return null
  const numerator = expression.slice(1, division).trim()
  const denominator = expression.slice(division + 1, -1).trim()
  if (!numerator || !denominator) return null
  return {
    numerator: fractionSegments(numerator, definition.factors),
    denominator: fractionSegments(denominator, definition.factors),
    suffix: display.slice(expression.length).trim()
  }
}
