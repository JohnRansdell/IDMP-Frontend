// An explicit null is authoritative. Only absent aliases may fall back.
function field(source, names, fallback = null) {
  const name = names.find(key => source[key] !== undefined)
  return name === undefined ? fallback : source[name]
}

export function normalizeResultMetrics(source = {}) {
  return {
    ...source,
    value: field(source, ['value', 'indicatorValue']),
    displayValue: field(source, ['displayValue']),
    numeratorValue: field(source, ['numeratorValue', 'numerator']),
    denominatorValue: field(source, ['denominatorValue', 'denominator'])
  }
}

export function drillResultMetrics(source = {}) {
  const result = normalizeResultMetrics(source)
  return {
    indicatorValue: field(source, ['indicatorValue'], result.value),
    displayValue: result.displayValue,
    numerator: field(source, ['numerator'], result.numeratorValue),
    denominator: field(source, ['denominator'], result.denominatorValue)
  }
}
