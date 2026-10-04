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
