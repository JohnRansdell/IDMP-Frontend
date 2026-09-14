// Catalogs describe available scalar columns, never a Cartesian join of snapshots.
const labels = { month: '统计月份', period: '统计月份', departmentName: '科室', deptName: '科室', deptCode: '科室编码', category: '分类', value: '指标值', numerator: '分子值', denominator: '分母值', yoy: '同比', mom: '环比' }
export function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
export function createFieldCatalog(rows = [], hints = {}) {
  const keys = new Set([...Object.keys(hints), ...rows.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : [])])
  return [...keys].flatMap(id => {
    const values = rows.map(row => row?.[id]).filter(value => value !== null && value !== undefined && value !== '')
    const hint = hints[id] || {}
    if (!hint.dataType && (!values.length || values.some(value => typeof value === 'object' || typeof value === 'function'))) return []
    const dataType = hint.dataType || (values.every(value => typeof value === 'boolean') ? 'boolean' : values.every(value => typeof value === 'number') ? 'number' : values.every(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) ? 'date' : 'string')
    const realDates = dataType === 'date' && values.length > 0 && values.every(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))
    return [{ id, label: labels[id] || id, dataType, semanticType: dataType === 'number' ? 'measure' : dataType === 'date' ? 'time' : 'dimension', filterable: true, filterDataType: dataType === 'date' && !realDates ? 'string' : dataType, preferredFilterType: realDates ? 'date-range' : 'multi-select', filterTypes: realDates ? ['select', 'multi-select', 'date-range'] : ['select', 'multi-select'], ...hint }]
  })
}
function dataset(id, label, rows, hints) { return { id, label, rows, fields: createFieldCatalog(rows, hints) } }
const numberHint = { dataType: 'number', semanticType: 'measure' }
const monthHint = { dataType: 'date', semanticType: 'time', granularities: ['raw'], label: '统计月份（原始粒度）' }
const dimensionHint = { dataType: 'string', semanticType: 'dimension' }
const records = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : []

export function createWidgetBindingDatasets(source, { result, demo = false, months = [] } = {}) {
  if (!demo && result) {
    // Do not reuse createDashboardSources' common trend for each summary metric.
    const summaryKey = source?.code?.replace(/^dashboard-summary-/, '')
    const current = summaryKey && Object.hasOwn(result.summaryCards || {}, summaryKey) ? [{ value: result.summaryCards[summaryKey] }] : []
    return [
      dataset('current', `${source?.name || '指标'} · 当前汇总`, current, { value: { ...numberHint, label: source?.name || '指标值' } }),
      dataset('trend', '看板月度结果 · 不等同于选中汇总指标', records(result.monthlyTrend), { [records(result.monthlyTrend).some(row => Object.hasOwn(row, 'month')) ? 'month' : 'period']: monthHint, value: numberHint }),
      dataset('departments', '看板科室结果 · 独立快照', records(result.departmentRanking), { value: numberHint })
    ]
  }
  if (!demo || !source) return []
  return [
    dataset('current', `${source.name} · 演示当前值`, [{ value: source.currentValue }], { value: { ...numberHint, unit: source.unit || '' } }),
    dataset('trend', `${source.name} · 演示月度序列`, (source.trendData || []).map((value, index) => ({ month: source.trendLabels?.[index] ?? months[index], value })), { month: monthHint, value: { ...numberHint, unit: source.unit || '' } }),
    dataset('departments', `${source.name} · 演示科室快照`, (source.departmentData || []).map(row => ({ departmentName: row.name, value: row.value })), { departmentName: dimensionHint, value: { ...numberHint, unit: source.unit || '' } }),
    dataset('distribution', `${source.name} · 演示构成`, (source.pieData || []).map(row => ({ category: row.name, value: row.value })), { category: dimensionHint, value: numberHint })
  ]
}
