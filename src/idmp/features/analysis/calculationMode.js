export function resolveIndicatorCalculationMode(version, indicator, routeGranularity = '') {
  const value = String(
    version?.calculationMode ||
    version?.definition?.calculationMode ||
    version?.formula?.calculationMode ||
    indicator?.calculationMode ||
    ''
  ).toUpperCase()
  if (['STATIC', 'TEMPORAL'].includes(value)) return value
  return String(routeGranularity).toUpperCase() === 'STATIC' ? 'STATIC' : ''
}
