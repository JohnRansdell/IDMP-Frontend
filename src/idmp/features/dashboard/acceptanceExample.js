import { normalizeDashboardSchema } from './schema.js'
import { createGlobalFilterDefinition } from './globalFilterDesignerModel.js'

const binding = (dimensions, measures, series = [], filters = []) => ({ dataset: 'acceptance', dimensions: dimensions.map(field => ({ field })), measures: measures.map(field => typeof field === 'string' ? ({ field, aggregation: 'avg' }) : field), series: series.map(field => ({ field })), filters, sort: [] })
const selectField = (id, label) => ({ id, label, filterDataType: 'string', preferredFilterType: 'multi-select', filterTypes: ['select', 'multi-select'] })
function createQualitySafetyGlobalFilters() {
  const source = 'UAT_QUALITY_SAFETY_Q3'
  const department = createGlobalFilterDefinition(selectField('department', '科室'), [], { id: 'department', optionSourceCode: source })
  const disease = { ...createGlobalFilterDefinition(selectField('disease', '病种'), [department], { id: 'disease', optionSourceCode: source }), dependsOn: ['department'] }
  return [department, disease]
}
// Must match an actual entry in mockIndicatorDataSources. The acceptance dataset
// is exposed by createWidgetBindingDatasets for every demo source.
const widget = (id, title, chartKind, layout, config = {}, sourceCode = 'UAT_QUALITY_SAFETY_Q3', sourceName = '[UAT] 质量安全综合数据（2026 Q3 · 18条）') => ({ id, type: chartKind === 'kpi' ? 'kpi' : 'chart', ...(chartKind === 'kpi' ? {} : { chartKind }), title, sourceCode, sourceName, visualType: chartKind, layout, config })
export function createAcceptanceExampleSchema({ id = 'quality-overview', sceneCode = '' } = {}) {
  return normalizeDashboardSchema({ version: 1, id, name: '质量安全综合看板', dashboardType: 'scene', sceneCode, category: '质量安全', scope: 'hospital', layout: { engine: 'gridstack', columns: 24, float: false }, appearance: { background: { type: 'solid', value: '#f3f6f8', intensity: 100 } }, globalFilters: createQualitySafetyGlobalFilters(), widgets: [
    widget('acceptance-kpi', '质量安全核心指标', 'kpi', { x: 0, y: 0, w: 6, h: 5 }, { style: { background: '#ffffff', borderColor: '#d9e0e6', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, shadow: 'none', padding: 0, opacity: 1 }, dataBinding: binding([], ['indicatorValue']) }),
    widget('acceptance-bar', '科室质量对比', 'bar', { x: 6, y: 0, w: 9, h: 5 }, { style: { background: '#ffffff', borderColor: '#d9e0e6', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, shadow: 'none', padding: 0, opacity: 1 }, dataBinding: binding(['department'], ['indicatorValue'], [], [{ field: 'month', operator: 'equals', value: '2026-09' }]), interaction: { clickAction: 'cross-filter', clickFilter: { enabled: true, field: 'department', targetWidgetIds: ['acceptance-table'] } } }),
    widget('acceptance-drill', '组织层级分析', 'bar', { x: 15, y: 0, w: 9, h: 5 }, { style: { background: '#ffffff', borderColor: '#d9e0e6', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, shadow: 'none', padding: 0, opacity: 1 }, dataBinding: { ...binding(['department'], ['value']), dataset: 'acceptance-drill' }, interaction: { clickAction: 'drill', drill: { hierarchy: ['department', 'medicalGroup', 'doctor'] } } }, 'UAT_ORGANIZATION_DRILL', '[UAT] 组织层级下钻数据'),
    widget('acceptance-line', '月度趋势', 'line', { x: 0, y: 5, w: 12, h: 6 }, { style: { background: '#ffffff', borderColor: '#d9e0e6', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, shadow: 'none', padding: 0, opacity: 1 }, dataBinding: binding(['month'], ['indicatorValue']) }),
    widget('acceptance-table', '质量明细', 'table', { x: 12, y: 5, w: 12, h: 6 }, { style: { background: '#ffffff', borderColor: '#d9e0e6', borderWidth: 1, borderStyle: 'solid', borderRadius: 4, shadow: 'none', padding: 0, opacity: 1 }, tableColumns: ['month', 'department', 'disease', 'indicatorValue'], dataBinding: binding(['department'], ['indicatorValue'], [], [{ field: 'month', operator: 'equals', value: '2026-09' }]) })
  ] })
}

// Business-facing aliases retain the stable acceptance fixture identifiers used
// by automated tests without exposing those identifiers in product UI.
export function createQualitySafetyDemoSchema(options = {}) { return createAcceptanceExampleSchema(options) }
export function createQualitySafetyShowcaseSchema(options = {}) { return createQualitySafetyDemoSchema(options) }
