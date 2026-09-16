import { numericValue } from './fieldCatalog.js'

export const AGGREGATIONS = { direct: '直接值（不聚合）', sum: '求和', avg: '平均值', max: '最大值', min: '最小值', count: '有效值计数' }
export const BINDING_CAPABILITIES = {
  kpi: { dimensions: 0, measures: 1, series: 0 },
  line: { dimensions: 2, measures: Infinity, series: 1 },
  bar: { dimensions: 2, measures: Infinity, series: 1 },
  pie: { dimensions: 1, measures: 1, series: 0 },
  ranking: { dimensions: 1, measures: 1, series: 0 },
  table: { dimensions: 1, measures: Infinity, series: 1 },
  gauge: { dimensions: 0, measures: 1, series: 0 },
  radar: { dimensions: 1, measures: Infinity, series: 1 },
  funnel: { dimensions: 1, measures: 1, series: 0 },
  scatter: { dimensions: 0, measures: 2, series: 0 },
  heatmap: { dimensions: 1, measures: 1, series: 1 }
}
export const bindingKind = widget => widget.type === 'chart' ? widget.chartKind || 'line' : widget.type
export const hasDataBinding = widget => Object.hasOwn(widget.config || {}, 'dataBinding')
export function emptyBinding(dataset = 'current') { return { dataset, dimensions: [], measures: [], series: [], sort: [] } }

export function validateWidgetBinding(kind, binding, fields = []) {
  const errors = []
  const capability = BINDING_CAPABILITIES[kind]
  if (!capability) return { valid: false, errors: ['此组件保留原有业务展示'] }
  if (!binding || typeof binding !== 'object') return { valid: false, errors: ['请配置数据字段'] }
  for (const slot of ['dimensions', 'measures', 'series', 'sort']) {
    if (!Array.isArray(binding[slot])) errors.push(`${slot} 配置必须是数组`)
  }
  if (errors.length) return { valid: false, errors }
  const dimensionCountValid = kind === 'line' || kind === 'bar' ? binding.dimensions.length >= 1 && binding.dimensions.length <= 2 : binding.dimensions.length === capability.dimensions
  if (!dimensionCountValid) errors.push(capability.dimensions ? (kind === 'line' || kind === 'bar' ? '请添加一至两个维度字段' : '请添加一个维度字段') : 'KPI 不支持维度')
  if (!binding.measures.length || binding.measures.length > capability.measures || kind === 'scatter' && binding.measures.length !== 2) errors.push(kind === 'scatter' ? '散点图需要恰好两个度量字段' : capability.measures === 1 ? '此组件仅支持一个度量' : '请添加至少一个度量字段')
  if (binding.series.length > capability.series) errors.push('此组件的系列数量超出限制')
  if (binding.sort.length > 1) errors.push('仅支持一个排序字段')
  const catalog = new Map(fields.map(field => [field.id, field]))
  for (const slot of ['dimensions', 'measures', 'series']) {
    const seen = new Set()
    for (const item of binding[slot]) {
      const field = catalog.get(item?.field)
      if (!field) { errors.push(`字段不存在：${item?.field || '未选择'}`); continue }
      if (seen.has(field.id)) errors.push('同一配置槽不能重复字段')
      seen.add(field.id)
      if ((slot === 'measures') !== (field.semanticType === 'measure')) errors.push(`${field.label} 不适用于此配置槽`)
      if (slot === 'measures' && !Object.hasOwn(AGGREGATIONS, item.aggregation)) errors.push('不支持的聚合方式')
      if (slot === 'measures' && item.axis !== undefined && !['left', 'right'].includes(item.axis)) errors.push('度量轴必须为左轴或右轴')
      if (slot === 'measures' && item.axis === 'right' && !['line', 'bar'].includes(kind)) errors.push('当前图表不支持右轴度量')
      if (slot !== 'measures' && item.granularity && !(field.granularities || ['raw']).includes(item.granularity)) errors.push('当前数据不支持此时间粒度')
    }
  }
  if (binding.series.some(item => binding.dimensions.some(dim => dim?.field === item?.field))) errors.push('系列与 X 轴应使用不同字段')
  for (const sort of binding.sort) {
    if (!['asc', 'desc'].includes(sort?.direction) || ![...binding.dimensions, ...binding.measures].some(item => item?.field === sort?.field)) errors.push('请选择已绑定的维度或度量排序')
  }
  return { valid: errors.length === 0, errors }
}

export function aggregateValues(values, aggregation) {
  const valid = values.map(numericValue).filter(value => value !== null)
  if (!valid.length) return null
  if (aggregation === 'direct') {
    if (values.length > 1) throw new Error('直接值遇到多行：请增加维度或明确选择聚合方式')
    return valid[0]
  }
  if (aggregation === 'count') return valid.length
  if (aggregation === 'sum' || aggregation === 'avg') {
    const sum = valid.reduce((total, value) => total + value, 0)
    return Number.isFinite(sum) ? sum / (aggregation === 'avg' ? valid.length : 1) : null
  }
  if (aggregation === 'max') return valid.reduce((a, b) => Math.max(a, b))
  if (aggregation === 'min') return valid.reduce((a, b) => Math.min(a, b))
  return null
}
const dimensionValue = value => ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value)) ? value : null

export function compileWidgetData(kind, binding, dataset) {
  const validation = validateWidgetBinding(kind, binding, dataset?.fields)
  if (!dataset || !validation.valid) return { status: 'invalid', message: dataset ? validation.errors.join('；') : '数据源不可用，请重新选择数据源' }
  const rows = Array.isArray(dataset.rows) ? dataset.rows : []
  if (kind === 'scatter') {
    const [x, y] = binding.measures
    const points = rows.map(row => [numericValue(row?.[x.field]), numericValue(row?.[y.field])]).filter(point => point[0] !== null && point[1] !== null)
    return points.length ? { status: 'ready', categories: [], series: [{ name: `${x.label || x.field} / ${y.label || y.field}`, values: points }], items: [] } : { status: 'empty', message: '暂无可用数值点' }
  }
  const categories = new Map(), groups = new Map(), splits = new Map()
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const tuple = binding.dimensions.map(dimension => dimensionValue(row?.[dimension.field]))
    const category = binding.dimensions.length ? tuple : ''
    const split = binding.series.length ? dimensionValue(row?.[binding.series[0].field]) : ''
    if (tuple.some(value => value === null || value === '') || split === null || split === '' && binding.series.length) continue
    const categoryKey = JSON.stringify(category), splitKey = JSON.stringify(split)
    categories.set(categoryKey, category)
    splits.set(splitKey, split)
    const key = JSON.stringify([categoryKey, splitKey])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  try {
    const categoryKeys = [...categories.keys()]
    const series = [...splits].flatMap(([splitKey, split]) => binding.measures.map(measure => ({
      field: measure.field,
      name: [split, measure.label || dataset.fields.find(field => field.id === measure.field)?.label].filter(value => value !== '').join(' · '),
      values: categoryKeys.map(key => aggregateValues((groups.get(JSON.stringify([key, splitKey])) || []).map(row => row[measure.field]), measure.aggregation))
    })))
    if (!series.some(item => item.values.some(value => value !== null))) return { status: 'empty', message: '暂无数据' }
    let order = categoryKeys.map((_, index) => index)
    const sort = binding.sort[0]
    if (sort) {
      const measureSeries = series.find(item => item.field === sort.field)
      const values = measureSeries?.values || [...categories.values()]
      order.sort((a, b) => {
        if (values[a] === null) return values[b] === null ? 0 : 1
        if (values[b] === null) return -1
        const compare = typeof values[a] === 'number' && typeof values[b] === 'number' ? values[a] - values[b] : String(values[a]).localeCompare(String(values[b]), 'zh-CN', { numeric: true })
        return compare * (sort.direction === 'desc' ? -1 : 1)
      })
    }
    const categoryValues = [...categories.values()]
    const sortedCategories = order.map(index => Array.isArray(categoryValues[index]) ? categoryValues[index].join(' / ') : String(categoryValues[index]))
    const sortedSeries = series.map(item => ({ ...item, values: order.map(index => item.values[index]) }))
    if (kind === 'kpi') return { status: 'ready', value: sortedSeries[0].values[0], label: sortedSeries[0].name, unit: binding.measures[0].aggregation === 'count' ? '' : dataset.fields.find(field => field.id === binding.measures[0].field)?.unit || '' }
    return { status: 'ready', categories: sortedCategories, dimensionTuples: order.map(index => Object.fromEntries(binding.dimensions.map((dimension, dimensionIndex) => [dimension.field, categoryValues[index][dimensionIndex]]))), series: sortedSeries.map(seriesItem => ({ ...seriesItem, axis: binding.measures.find(measure => measure.field === seriesItem.field)?.axis || 'left' })), items: sortedCategories.map((name, index) => ({ name, value: sortedSeries[0].values[index] })).filter(item => item.value !== null) }
  } catch (error) { return { status: 'invalid', message: error.message } }
}

// Chart options are a downstream presentation adapter, not the engine contract.
export function bindingChartOption(kind, model) {
  if (model.status !== 'ready') return {}
  if (kind === 'pie') return { tooltip: { trigger: 'item' }, legend: { bottom: 0 }, series: [{ type: 'pie', data: model.items }] }
  if (kind === 'funnel') return { tooltip: { trigger: 'item' }, series: [{ type: 'funnel', left: '12%', top: 12, bottom: 12, width: '76%', data: model.items }] }
  if (kind === 'gauge') return { series: [{ type: 'gauge', progress: { show: true }, detail: { valueAnimation: true, formatter: '{value}' }, data: [{ value: model.series[0]?.values[0], name: model.series[0]?.name }] }] }
  if (kind === 'radar') return { tooltip: {}, legend: { top: 0 }, radar: { indicator: model.categories.map(name => ({ name })) }, series: model.series.map(item => ({ name: item.name, type: 'radar', data: [{ value: item.values }] })) }
  if (kind === 'scatter') return { tooltip: { trigger: 'item' }, xAxis: { type: 'value' }, yAxis: { type: 'value' }, series: model.series.map(item => ({ name: item.name, type: 'scatter', data: item.values })) }
  if (kind === 'heatmap') {
    const ys = model.series.map(item => item.name)
    return { tooltip: { position: 'top' }, grid: { top: 38, bottom: 28, left: 12, right: 16, containLabel: true }, xAxis: { type: 'category', data: model.categories }, yAxis: { type: 'category', data: ys }, visualMap: { min: 0, max: Math.max(0, ...model.series.flatMap(item => item.values.filter(value => value !== null))), calculable: true, orient: 'horizontal', left: 'center', bottom: 0 }, series: [{ type: 'heatmap', data: model.series.flatMap((item, y) => item.values.map((value, x) => value === null ? null : [x, y, value]).filter(Boolean)) }] }
  }
  const dualAxis = ['line', 'bar'].includes(kind) && model.series.some(item => item.axis === 'right')
  return { tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { top: 38, bottom: 28, left: 12, right: 16, containLabel: true }, xAxis: { type: 'category', data: model.categories }, yAxis: dualAxis ? [{ type: 'value' }, { type: 'value' }] : { type: 'value' }, series: model.series.map(item => ({ name: item.name, type: kind, data: item.values, ...(dualAxis ? { yAxisIndex: item.axis === 'right' ? 1 : 0 } : {}) })) }
}
