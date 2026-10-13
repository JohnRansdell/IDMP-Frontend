import { createDefaultBinding } from './smartDefaultBinding.js'
import { isPeriodField } from './periodFields.js'

const SOURCE_FREE_TYPES = new Set(['text', 'metric-group', 'warnings', 'ranking'])

export function widgetLibraryReadiness(type, source, datasets = []) {
  if (SOURCE_FREE_TYPES.has(type)) return { status: 'ready', label: '可直接添加' }
  if (!source) return { status: 'missing-source', label: '请先选择指标数据' }
  const fields = datasets.flatMap(dataset => dataset.fields || [])
  if (!fields.length) return { status: 'loading', label: '字段信息暂未就绪' }
  if (type === 'map') return { status: 'setup', label: '需配置区域字段及地图边界' }
  if (createDefaultBinding(type, datasets)) return { status: 'ready', label: '字段已就绪' }
  const measures = fields.filter(field => field.semanticType === 'measure').length
  const dimensions = fields.filter(field => field.semanticType === 'dimension' || field.semanticType === 'time').length
  if (type === 'scatter') return { status: 'setup', label: '需要两个数值字段' }
  if (type === 'heatmap') return { status: 'setup', label: '需要两个维度和一个数值字段' }
  if (!measures) return { status: 'setup', label: '需要数值字段' }
  if (!dimensions) return { status: 'setup', label: '需要分类或时间字段' }
  return { status: 'setup', label: '需手动配置字段' }
}

export function widgetEmptyGuidance(model = {}, dataset = {}, { binding } = {}) {
  if (dataset.status === 'LOADING') return { title: '正在读取数据', description: '正在读取当前字段配置的预览结果。', action: '' }
  if (dataset.status === 'ERROR') return { title: '数据预览失败', description: dataset.message || '数据请求失败，请重试。', action: 'retry' }
  const availability = dataset.comparisonAvailability?.status
  const axis = binding?.dimensions?.[0]
  const timeAxis = isPeriodField(axis?.field)
  const hasTimeField = (dataset.fields || []).some(field => isPeriodField(field.id))
  if (availability === 'NO_DIMENSION_VALUES' && /^periodType$/i.test(axis?.field || '')) return {
    title: '周期类型不是月份日期',
    description: '“周期类型”表示月度、季度或年度，当前结果未返回这个字段。请选择“统计开始时间”作为 X 轴，并设置包含多个已计算月份的查询范围。',
    action: hasTimeField ? 'time-axis' : 'configure'
  }
  if (availability === 'NO_DIMENSION_VALUES' && /^(scene|scenario)(code|id|name|versionid)?$/i.test(axis?.field || '')) return {
    title: '当前结果未提供场景信息',
    description: '场景轴需要带有场景标识的正式结果。可按统计时间展示现有结果，或先配置并计算对应场景。', action: hasTimeField ? 'time-axis' : 'configure'
  }
  if (availability === 'SUMMARY_ONLY' && timeAxis) return {
    title: '当前查询未返回周期结果', description: '汇总值已存在，但当前查询没有返回对应的时间结果。请检查组件周期及已生成的正式结果，或改为指标卡。', action: 'scope'
  }
  if (availability === 'SUMMARY_ONLY') return {
    title: '当前仅有指标汇总结果',
    description: '当前周期已有可用于指标卡的汇总值，但没有可用于此图表的分类对比结果。可以改为指标卡，或调整组件周期查看已生成的分类结果。',
    action: 'kpi'
  }
  if (availability === 'NO_DIMENSION_VALUES') return {
    title: timeAxis ? '当前结果缺少周期信息' : '当前结果缺少分类信息',
    description: `结果未提供所选分类字段“${binding?.dimensions?.[0]?.label || binding?.dimensions?.[0]?.field || '分类'}”的取值，请检查字段绑定及该分类的正式计算结果。`,
    action: 'configure'
  }
  if (availability === 'NO_MEASURE_VALUES') return {
    title: '当前分类结果缺少指标值', description: '已返回分类信息，但所选指标字段没有可用数值，请检查指标字段和正式结果。', action: 'configure'
  }
  if (model.status === 'invalid') return {
    title: String(model.message || '').startsWith('直接值遇到多行') ? '直接值无法显示' : '字段配置不完整',
    description: model.message || '请选择数据源并配置图表所需的字段。',
    action: 'configure'
  }
  const reason = dataset.message || model.message
  if (availability === 'NO_COMPARISON_ROWS') return { title: '当前周期暂无分类对比结果', description: `${reason ? `${reason}；` : ''}请调整组件周期或筛选条件，并检查该周期是否已生成分类计算结果。`, action: 'filters' }
  return { title: '当前预览没有数据', description: `${reason ? `${reason}；` : ''}可在画布顶部切换统计周期或调整筛选条件。`, action: 'filters' }
}
