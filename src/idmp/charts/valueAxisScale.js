import { number } from 'echarts/core'

// Scale the complete series, including targets, independently of the visible category window.
export function valueAxisScale(values, unit = '') {
  const finite = values.filter(value => typeof value === 'number' && Number.isFinite(value))
  const lower = finite.reduce((min, value) => Math.min(min, value), 0)
  const upper = finite.reduce((max, value) => Math.max(max, value), 0)
  const interval = number.nice(upper === lower ? 0.2 : upper / 5 - lower / 5, true)
  const clean = value => Number(value.toPrecision(15))
  let min = clean(Math.floor(lower / interval) * interval)
  let max = clean(Math.ceil(upper / interval) * interval)
  if (min > lower) min = clean(min - interval)
  if (max < upper) max = clean(max + interval)
  if (min === max) max = clean(min + interval * 5)
  const precision = Math.min(20, number.getPrecisionSafe(interval))
  const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: precision, useGrouping: false })
  return {
    min, max, interval,
    axisLabel: { formatter: value => {
      const normalized = clean(Number(value))
      if (!Number.isFinite(normalized)) return ''
      const text = normalized === 0 ? '0'
        : precision > 6 || Math.abs(normalized) >= 1e12 ? normalized.toExponential() : formatter.format(normalized)
      return `${text}${unit}`
    } }
  }
}
