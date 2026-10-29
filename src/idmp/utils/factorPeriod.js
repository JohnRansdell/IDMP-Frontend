export function fieldReferenceCode(reference) {
  if (typeof reference === 'string') return reference.trim()
  return reference?.sourceAlias ? `${reference.sourceAlias}.${reference.fieldCode}` : reference?.fieldCode || ''
}

export function factorPeriodColumn(dsl = {}) {
  return fieldReferenceCode(dsl.periodColumn)
}

export function factorCalculationMode(dsl = {}) {
  const mode = String(dsl.calculationMode || '').toUpperCase()
  if (['STATIC', 'TEMPORAL'].includes(mode)) return mode
  return factorPeriodColumn(dsl) ? 'TEMPORAL' : 'STATIC'
}
