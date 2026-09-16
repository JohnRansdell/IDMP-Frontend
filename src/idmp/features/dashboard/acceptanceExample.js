import { normalizeDashboardSchema } from './schema.js'
import { createGlobalFilterDefinition } from './globalFilterDesignerModel.js'

const binding = (dimensions, measures, series = []) => ({ dataset: 'acceptance', dimensions: dimensions.map(field => ({ field })), measures: measures.map(field => ({ field, aggregation: 'avg' })), series: series.map(field => ({ field })), sort: [] })
const selectField = (id, label) => ({ id, label, filterDataType: 'string', preferredFilterType: 'multi-select', filterTypes: ['select', 'multi-select'] })
function createQualitySafetyGlobalFilters() {
  const department = createGlobalFilterDefinition(selectField('department', '科室'), [], { id: 'department' })
  const disease = { ...createGlobalFilterDefinition(selectField('disease', '病种'), [department], { id: 'disease' }), dependsOn: ['department'] }
  return [department, disease]
}
// Must match an actual entry in mockIndicatorDataSources. The acceptance dataset
// is exposed by createWidgetBindingDatasets for every demo source.
const widget = (id, title, chartKind, layout, config = {}) => ({ id, type: chartKind === 'kpi' ? 'kpi' : 'chart', ...(chartKind === 'kpi' ? {} : { chartKind }), title, sourceCode: 'MORTALITY_INPATIENT', sourceName: '住院死亡率', visualType: chartKind, layout, config })
export function createAcceptanceExampleSchema({ id = 'quality-overview', sceneCode = '' } = {}) {
  return normalizeDashboardSchema({ version: 1, id, name: '质量安全综合看板', dashboardType: 'scene', sceneCode, category: '质量安全', scope: 'hospital', layout: { engine: 'gridstack', columns: 24, float: false }, globalFilters: createQualitySafetyGlobalFilters(), widgets: [
    widget('acceptance-kpi', '质量安全综合指标', 'kpi', { x: 0, y: 0, w: 6, h: 3 }, { dataBinding: binding([], ['indicatorValue']) }),
    widget('acceptance-bar', '科室质量指标对比', 'bar', { x: 6, y: 0, w: 9, h: 6 }, { dataBinding: binding(['department'], ['indicatorValue']), interaction: { clickAction: 'cross-filter', clickFilter: { enabled: true, field: 'department', targetWidgetIds: ['acceptance-kpi', 'acceptance-line', 'acceptance-table'] } } }),
    widget('acceptance-drill', '科室质量层级分析', 'bar', { x: 15, y: 0, w: 9, h: 6 }, { dataBinding: binding(['department'], ['indicatorValue']), interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'medicalGroup', 'doctor'] } } }),
    widget('acceptance-line', '月度质量趋势', 'line', { x: 0, y: 6, w: 12, h: 7 }, { dataBinding: binding(['month'], ['indicatorValue'], ['department']) }),
    widget('acceptance-table', '质量指标明细', 'table', { x: 12, y: 6, w: 12, h: 7 }, { dataBinding: binding(['department'], ['indicatorValue']) })
  ] })
}

// Business-facing aliases retain the stable acceptance fixture identifiers used
// by automated tests without exposing those identifiers in product UI.
export function createQualitySafetyDemoSchema(options = {}) { return createAcceptanceExampleSchema(options) }
export function createQualitySafetyShowcaseSchema(options = {}) { return createQualitySafetyDemoSchema(options) }
