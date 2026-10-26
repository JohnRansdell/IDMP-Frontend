import Decimal from 'decimal.js'

const DisplayDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP })

export function resultNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function hasResultDisplay(value) {
  return (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value))
}

export function resultUnit(unit) {
  const text = String(unit || '').trim()
  return text.toUpperCase() === 'PERCENT' || text === '%' ? '%' : text
}

function displayNumber(value, { unit = '', percentRepresentation = 'ratio', display } = {}) {
  if (resultNumber(value) === null) return null
  // Formula display rules use an explicit multiplier, including for PERCENT.
  // Legacy dashboard datasets already store percentage points; raw API results do not.
  const multiplier = display ? display.multiplier ?? '1'
    : resultUnit(unit) === '%' && percentRepresentation === 'ratio' ? 100 : 1
  if (resultNumber(multiplier) === null) return null
  return new DisplayDecimal(String(value).trim()).times(String(multiplier).trim())
}

export function resultChartNumber(value, options = {}) {
  const number = displayNumber(value, options)?.toNumber()
  return Number.isFinite(number) ? number : null
}

export function formatResultNumber(value, { maximumFractionDigits = 2, missing = '-', useGrouping = true } = {}) {
  const number = resultNumber(value)
  return number === null ? missing : new Intl.NumberFormat('zh-CN', { maximumFractionDigits, useGrouping }).format(number)
}

export function formatResultValue(value, options = {}) {
  const { displayValue, display, unit = '', missing = '-', maximumFractionDigits = 2, useGrouping = false } = options
  if (hasResultDisplay(displayValue)) return String(displayValue).trim()
  const number = displayNumber(value, options)
  if (!number || !number.isFinite()) return missing
  if (display) {
    const scale = display.scale ?? 2
    if (!Number.isInteger(scale) || scale < 0 || scale > 12) return missing
    if (display.roundingMode === 'UNNECESSARY' && number.decimalPlaces() > scale) return missing
    const mode = display.roundingMode === 'CEILING' ? 'CEIL' : display.roundingMode || 'HALF_UP'
    const rounding = Decimal[`ROUND_${mode}`] ?? Decimal.ROUND_HALF_UP
    const rendered = number.toFixed(scale, rounding)
    return display.format === 'PERCENT' ? `${rendered}%` : rendered
  }
  if (resultUnit(unit) === '%') return `${number.toFixed(maximumFractionDigits)}%`
  return formatResultNumber(number.toNumber(), { maximumFractionDigits, missing, useGrouping })
}
