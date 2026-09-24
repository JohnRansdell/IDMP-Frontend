import { emptyBinding } from './bindingEngine.js'

const slots = binding => ['dimensions', 'measures', 'series', 'sort', 'filters']

export function isEmptyDashboardBinding(binding) {
  return !binding || slots(binding).every(slot => !Array.isArray(binding[slot]) || binding[slot].length === 0)
}

const measure = field => ({ field: field.id, label: field.label, aggregation: field.recommendedAggregation || field.defaultAggregation || field.aggregation || (field.aggregations || []).find(value => value === 'avg') || field.aggregations?.[0] || 'avg', axis: 'left' })
const dimension = field => ({ field: field.id, label: field.label, ...(field.semanticType === 'time' ? { granularity: 'raw' } : {}) })
const preferredDatasets = { kpi: ['current'], gauge: ['current'], line: ['trend', 'acceptance'], bar: ['departments', 'acceptance'], pie: ['distribution', 'departments', 'acceptance'], funnel: ['distribution', 'departments', 'acceptance'], radar: ['departments', 'acceptance'], scatter: ['acceptance'], heatmap: ['acceptance'] }
const rankByName = (field, tokens) => {
  const name = `${field.label || ''} ${field.id || ''}`.toLowerCase()
  const index = tokens.findIndex(token => name.includes(token))
  return index < 0 ? tokens.length : index
}
const sortByPreference = (fields, tokens) => fields.map((field, index) => ({ field, index, rank: rankByName(field, tokens) }))
  .sort((left, right) => left.rank - right.rank || left.index - right.index).map(item => item.field)
const candidates = (datasets, kind) => {
  const preferred = preferredDatasets[kind] || []
  const rank = dataset => {
    const index = preferred.indexOf(dataset.id)
    return index === -1 ? preferred.length : index
  }
  return [...datasets].sort((left, right) => rank(left) - rank(right))
}

export function createDefaultBinding(kind, datasets = [], { datasetId = '' } = {}) {
  const sources = datasetId ? datasets.filter(dataset => dataset.id === datasetId) : candidates(datasets, kind)
  for (const source of sources) {
    if (!source?.id || !Array.isArray(source.fields)) continue
    const fields = source.fields
    const dimensions = sortByPreference(fields.filter(field => field.semanticType === 'dimension'), ['科室', 'department', '病区', 'ward', '分类', 'category', '名称', 'name'])
    const times = sortByPreference(fields.filter(field => field.semanticType === 'time'), ['月份', 'month', '期间', 'period', '日期', 'date', '时间', 'time'])
    const measures = sortByPreference(fields.filter(field => field.semanticType === 'measure'), ['指标值', 'value', '数量', 'count', '发生率', 'rate', '金额', 'amount'])
    const category = dimensions[0] || times[0]
    const timeOrCategory = times[0] || category
    const base = emptyBinding(source.id)
    if (['kpi', 'gauge'].includes(kind) && measures[0]) return { ...base, measures: [measure(measures[0])] }
    if (['line', 'bar', 'pie', 'funnel', 'radar'].includes(kind)) {
      const selected = kind === 'line' ? timeOrCategory : category
      if (selected && measures[0]) return {
        ...base,
        dimensions: [dimension(selected)],
        measures: [measure(measures[0])],
        ...(kind === 'line' && selected.semanticType === 'time' ? { sort: [{ field: selected.id, direction: 'asc' }] } : {})
      }
    }
    if (kind === 'scatter' && measures.length >= 2) return { ...base, measures: [measure(measures[0]), measure(measures[1])] }
    if (kind === 'heatmap' && (dimensions.length + times.length) >= 2 && measures[0]) {
      const secondary = dimensions.find(field => field.id !== timeOrCategory.id) || times.find(field => field.id !== timeOrCategory.id)
      return { ...base, dimensions: [dimension(timeOrCategory)], series: [dimension(secondary)], measures: [measure(measures[0])] }
    }
  }
  // Region semantics are not inferable from a generic category field.
  return null
}
