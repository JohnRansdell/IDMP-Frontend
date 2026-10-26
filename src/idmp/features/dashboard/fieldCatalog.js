// Catalogs describe available scalar columns, never a Cartesian join of snapshots.
import { normalizeDepartmentDataset } from './dimensionNames.js'
export { resultNumber as numericValue } from '../shared/resultPresentation.js'
const labels = { year: '年度', quarter: '季度', month: '统计月份', date: '统计日期', department: '科室', medicalGroup: '医疗组', doctor: '医师', disease: '病种', scene: '应用场景', indicatorCategory: '指标分类', indicatorValue: '指标值', actualValue: '实际值', targetValue: '目标值', period: '统计月份', departmentName: '科室', deptName: '科室', deptCode: '科室编码', category: '分类', value: '指标值', numerator: '分子值', denominator: '分母值', yoy: '同比', mom: '环比' }
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
const records = value => Array.isArray(value) ? value.filter(row => row && typeof row === 'object' && !Array.isArray(row)) : []

export function createWidgetBindingDatasets(source, { result } = {}) {
  if (source?.origin === 'acceptance' || source?.origin === 'demo') return []
  if (['indicator-catalog', 'dashboard-data-source'].includes(source?.origin)) {
    const currentRows = records(source.analysisCurrentRows)
    const trendRows = records(source.analysisTrendRows)
    const comparisonRows = records(source.analysisComparisonRows || source.bindingRows)
    const valueHint = { ...numberHint, unit: source.unit || '' }
    return [
      currentRows.length ? dataset('current', `${source.name || 'Published indicator'} · 当前值`, currentRows, { value: valueHint }) : null,
      trendRows.length ? dataset('trend', `${source.name || 'Published indicator'} · 趋势`, trendRows, { periodStart: monthHint, value: valueHint, numeratorValue: numberHint, denominatorValue: numberHint }) : null,
      comparisonRows.length ? dataset('departments', `${source.name || 'Published indicator'} · 维度对比`, comparisonRows, { value: valueHint, numeratorValue: numberHint, denominatorValue: numberHint }) : null,
      records(source.bindingRows).length ? dataset('analysis', `${source.name || 'Published indicator'} analysis dimensions`, records(source.bindingRows), { value: valueHint }) : null
    ].filter(Boolean).map(item => normalizeDepartmentDataset({ ...item, dimensionDisplayFields: source.analysisDimensionDisplayFields, departmentFields: source.analysisDepartmentFields }, { diagnostics: source.analysisNameDiagnostics || [] }))
  }
  if (result) {
    // Do not reuse createDashboardSources' common trend for each summary metric.
    const summaryKey = source?.dashboardSummaryKey || source?.code?.replace(/^dashboard-summary-/, '')
    const card = result.summaryCards?.[summaryKey]
    const rawValue = card?.value ?? card
    const current = summaryKey && Object.hasOwn(result.summaryCards || {}, summaryKey) ? [{ value: rawValue }] : []
    return [
      dataset('current', `${source?.name || '指标'} · 当前汇总`, current, { value: { ...numberHint, label: source?.name || '指标值' } }),
      dataset('trend', '看板月度结果 · 不等同于选中汇总指标', records(result.monthlyTrend), { [records(result.monthlyTrend).some(row => Object.hasOwn(row, 'month')) ? 'month' : 'period']: monthHint, value: numberHint }),
      dataset('departments', '看板科室结果 · 独立快照', records(result.departmentRanking), { value: numberHint })
    ]
  }
  return []
}
