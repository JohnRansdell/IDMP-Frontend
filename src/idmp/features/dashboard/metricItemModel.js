import { compileWidgetData, formatDashboardKpiMetric } from './bindingEngine.js'
import { createDefaultBinding } from './smartDefaultBinding.js'
import { queryWidgetDatasetWithRuntime } from './queryAdapter.js'
import { metricGroupItemWidget } from './metricGroup.js'

// Both the metric strip and indicator ranking read the same formal KPI result.
export function metricItemModel(group, item, getWidgetKpi, getDatasets, runtime) {
  const virtual = metricGroupItemWidget(group, item)
  const fallback = getWidgetKpi(virtual)
  const datasets = getDatasets(virtual)
  const binding = item.dataBinding || createDefaultBinding('kpi', datasets)
  const source = binding ? datasets.find(dataset => dataset.id === binding.dataset) : datasets[0]
  const pending = datasets.find(dataset => ['LOADING', 'ERROR'].includes(dataset.status))
  if (!binding || !source) return { ...fallback, ...item, value: pending?.status === 'LOADING' ? '加载中' : pending?.status === 'ERROR' ? '加载失败' : fallback.value, unit: item.unit || fallback.unit, message: pending?.message || '', loadStatus: pending?.status || 'EMPTY', numericValue: null }
  if (source.componentQueryScope) virtual.config.backendQuery = source.componentQueryScope
  const dataset = queryWidgetDatasetWithRuntime(source, virtual, runtime)
  const model = compileWidgetData('kpi', binding, dataset)
  if (model.status !== 'ready') return { ...fallback, ...item, value: dataset?.status === 'LOADING' ? '加载中' : dataset?.status === 'ERROR' ? '加载失败' : '暂无数据', unit: '', status: 'info', message: dataset?.message || model.message || '请配置数据字段', loadStatus: dataset?.status || 'EMPTY', numericValue: null }
  const measure = binding.measures?.[0]
  const row = measure?.aggregation === 'direct' && dataset?.rows?.length === 1 ? dataset.rows[0] : null
  const display = formatDashboardKpiMetric(model.value, { unit: item.unit || model.unit || '', displayValue: String(measure?.field || '').toLowerCase() === 'value' ? row?.displayValue : null })
  return { ...fallback, ...item, value: display.value, unit: display.unit, status: fallback.status || 'info', loadStatus: 'READY', numericValue: model.value !== null && model.value !== undefined && Number.isFinite(Number(model.value)) ? Number(model.value) : null, periodStart: row?.periodStart || source.componentQueryScope?.periodStart || '', periodEnd: row?.periodEnd || source.componentQueryScope?.periodEnd || '' }
}
