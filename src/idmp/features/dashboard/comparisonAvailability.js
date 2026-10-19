import { numericValue } from './fieldCatalog.js'

const comparisonKinds = new Set(['bar', 'pie', 'ranking', 'table', 'radar', 'funnel'])
const hasDimension = value => ['string', 'number', 'boolean'].includes(typeof value) && value !== '' && (typeof value !== 'number' || Number.isFinite(value))

// An overview probe explains an empty comparison; it never supplies chart rows.
export async function explainComparisonAvailability(widget, dataset, loadOverview) {
  const kind = widget.type === 'chart' ? widget.chartKind : widget.type
  if (!dataset || !comparisonKinds.has(kind) || ['ERROR', 'LOADING'].includes(dataset.status)) return dataset
  const binding = widget.config?.dataBinding
  if (!binding?.dimensions?.length || !binding.measures?.length) return dataset
  const fields = new Set((dataset.fields || []).map(field => field.id))
  if ([...binding.dimensions, ...binding.measures].some(item => !fields.has(item.field))) return dataset
  const rows = dataset.rows || []
  const hasBoundDimension = rows.some(row => binding.dimensions.every(dimension => hasDimension(row?.[dimension.field])))
  if (rows.some(row => binding.dimensions.every(dimension => hasDimension(row?.[dimension.field])) && binding.measures.some(measure => numericValue(row?.[measure.field]) !== null))) return dataset
  if (rows.length && hasBoundDimension) return { ...dataset, comparisonAvailability: { status: 'NO_MEASURE_VALUES' } }
  const reason = rows.length ? 'NO_DIMENSION_VALUES' : 'NO_COMPARISON_ROWS'
  // Missing axis values describe an incompatible binding, even if a separate
  // overview query can return a number. Do not call it missing chart results.
  if (rows.length) return { ...dataset, comparisonAvailability: { status: reason } }
  try {
    const overview = await loadOverview()
    const measure = overview?.kpiMeasureField || binding.measures[0].field
    const available = overview?.status !== 'ERROR' && (overview?.rows || []).some(row => numericValue(row?.[measure]) !== null)
    return { ...dataset, comparisonAvailability: { status: available ? 'SUMMARY_ONLY' : reason, reason } }
  } catch {
    return { ...dataset, comparisonAvailability: { status: reason } }
  }
}
