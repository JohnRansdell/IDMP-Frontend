import { createDefaultBinding } from './smartDefaultBinding.js'

const SOURCE_FREE_TYPES = new Set(['text', 'metric-group', 'warnings'])

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

export function widgetEmptyGuidance(model = {}, dataset = {}) {
  if (dataset.status === 'LOADING') return { title: '正在读取数据', description: '正在读取当前字段配置的预览结果。', action: '' }
  if (dataset.status === 'ERROR') return { title: '数据预览失败', description: dataset.message || '数据请求失败，请重试。', action: 'retry' }
  if (model.status === 'invalid') return {
    title: String(model.message || '').startsWith('直接值遇到多行') ? '直接值无法显示' : '字段配置不完整',
    description: model.message || '请选择数据源并配置图表所需的字段。',
    action: 'configure'
  }
  const reason = dataset.message || model.message
  return { title: '当前预览没有数据', description: `${reason ? `${reason}；` : ''}可在画布顶部切换统计周期或调整筛选条件。`, action: 'filters' }
}
