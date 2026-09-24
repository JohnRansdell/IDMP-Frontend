// KPI variants are presentational only. Binding and KPI calculation stay shared.
export const KPI_VARIANTS = Object.freeze([
  Object.freeze({ id: 'standard', label: '标准指标', preview: 'standard' }),
  Object.freeze({ id: 'hero', label: 'Hero 数字', preview: 'hero' }),
  Object.freeze({ id: 'horizontal', label: '横向摘要', preview: 'horizontal' }),
  Object.freeze({ id: 'status', label: '状态强调', preview: 'status' }),
  Object.freeze({ id: 'trend', label: '趋势摘要', preview: 'trend' }),
  Object.freeze({ id: 'minimal', label: '极简数字', preview: 'minimal' })
])

const ids = new Set(KPI_VARIANTS.map(item => item.id))

export function normalizeKpiVariant(value) {
  return ids.has(value) ? value : 'standard'
}

export function getKpiVariant(value) {
  return KPI_VARIANTS.find(item => item.id === normalizeKpiVariant(value))
}
