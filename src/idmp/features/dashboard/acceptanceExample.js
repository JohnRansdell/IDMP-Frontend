import { normalizeDashboardSchema } from './schema.js'

const binding = (dimensions, measures, series = []) => ({ dataset: 'acceptance', dimensions: dimensions.map(field => ({ field })), measures: measures.map(field => ({ field, aggregation: 'avg' })), series: series.map(field => ({ field })), sort: [] })
// Must match an actual entry in mockIndicatorDataSources. The acceptance dataset
// is exposed by createWidgetBindingDatasets for every demo source.
const widget = (id, title, chartKind, layout, config = {}) => ({ id, type: chartKind === 'kpi' ? 'kpi' : 'chart', ...(chartKind === 'kpi' ? {} : { chartKind }), title, sourceCode: 'MORTALITY_INPATIENT', sourceName: '住院死亡率', visualType: chartKind, layout, config })
export function createAcceptanceExampleSchema({ id = 'quality-overview', sceneCode = '' } = {}) {
  return normalizeDashboardSchema({ version: 1, id, name: '验收演示看板', dashboardType: 'scene', sceneCode, category: '本地验收', scope: 'hospital', layout: { engine: 'gridstack', columns: 24, float: false }, globalFilters: [
    { id: 'department', label: '科室', field: 'department', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true },
    { id: 'disease', label: '病种', field: 'disease', dataType: 'string', type: 'multi-select', defaultValue: [], enabled: true, dependsOn: ['department'] }
  ], widgets: [
    widget('acceptance-kpi', '全院指标值', 'kpi', { x: 0, y: 0, w: 6, h: 3 }, { dataBinding: binding([], ['indicatorValue']) }),
    widget('acceptance-bar', '科室指标对比', 'bar', { x: 6, y: 0, w: 9, h: 6 }, { dataBinding: binding(['department'], ['indicatorValue']), interaction: { clickAction: 'cross-filter', clickFilter: { enabled: true, field: 'department', targetWidgetIds: ['acceptance-kpi', 'acceptance-line', 'acceptance-table'] } } }),
    widget('acceptance-drill', '组织层级下钻', 'bar', { x: 15, y: 0, w: 9, h: 6 }, { dataBinding: binding(['department'], ['indicatorValue']), interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'medicalGroup', 'doctor'] } } }),
    widget('acceptance-line', '月度指标趋势', 'line', { x: 0, y: 6, w: 12, h: 7 }, { dataBinding: binding(['month'], ['indicatorValue'], ['department']) }),
    widget('acceptance-table', '指标明细', 'table', { x: 12, y: 6, w: 12, h: 7 }, { dataBinding: binding(['department'], ['indicatorValue']) })
  ] })
}
