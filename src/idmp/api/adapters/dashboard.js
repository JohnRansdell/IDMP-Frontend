import { normalizeDashboardSchema } from '../../features/dashboard/schema.js'

const FRONTEND_TYPE_BY_REMOTE = Object.freeze({
  KPI: { type: 'kpi', visualType: 'kpi' },
  TEXT: { type: 'text', visualType: 'text' },
  WARNING: { type: 'warnings', visualType: 'warnings' },
  WARNINGS: { type: 'warnings', visualType: 'warnings' },
  RANKING: { type: 'ranking', visualType: 'ranking' }
})

const REMOTE_TYPE_BY_FRONTEND = Object.freeze({
  kpi: 'KPI', text: 'TEXT', warnings: 'WARNINGS', ranking: 'RANKING',
  line: 'LINE', bar: 'BAR', pie: 'PIE', table: 'TABLE', gauge: 'GAUGE',
  radar: 'RADAR', funnel: 'FUNNEL', scatter: 'SCATTER', heatmap: 'HEATMAP', map: 'MAP'
})

const RESULT_SHAPE_BY_FRONTEND = Object.freeze({
  kpi: 'OVERVIEW', gauge: 'OVERVIEW', line: 'TREND',
  bar: 'COMPARISON', pie: 'COMPARISON', table: 'COMPARISON', ranking: 'COMPARISON',
  radar: 'COMPARISON', funnel: 'COMPARISON', heatmap: 'COMPARISON', map: 'COMPARISON'
})

const stringId = value => value === null || value === undefined ? '' : String(value)
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const MOCK_MODE = 'MOCK'
const MOCK_WIDGET_KEY = '__idmpMockWidget'
const METRIC_GROUP_KEY = '__idmpMetricGroup'

export function dashboardSummaryToCatalogEntry(item = {}) {
  return {
    id: stringId(item.id), code: String(item.code || ''), name: String(item.name || '未命名看板'),
    description: String(item.description || ''), dashboardType: normalizeDashboardType(item.type),
    category: String(item.category || ''), scope: normalizeScope(item.applicableScope),
    updatedAt: item.updatedAt || item.createdAt || new Date(0).toISOString(), origin: 'remote',
    status: item.status || 'DRAFT', currentPublishedVersionId: stringId(item.currentPublishedVersionId),
    workingVersionId: stringId(item.workingVersionId), resourceVersion: Number(item.resourceVersion ?? 0)
  }
}

export function dashboardDetailToSchema(detail = {}) {
  const dashboard = object(detail.dashboard)
  const version = object(detail.version)
  return normalizeDashboardSchema({
    version: 1,
    id: stringId(dashboard.id || version.dashboardId || dashboard.code),
    name: dashboard.name || '', description: dashboard.description || '',
    dashboardType: normalizeDashboardType(dashboard.type), category: dashboard.category || '',
    scope: normalizeScope(dashboard.applicableScope),
    sceneCode: dashboard.sceneCode || '', layout: { engine: 'gridstack', columns: Number(version.layout?.columns || 24), float: Boolean(version.layout?.float) },
    appearance: { theme: version.theme?.name || version.theme || 'default', ...(object(version.style).appearance || {}) },
    presentation: object(version.style).presentation || {},
    globalFilters: Array.isArray(version.globalFilters) ? version.globalFilters : [],
    widgets: (Array.isArray(version.widgets) ? version.widgets : []).map(remoteWidgetToSchemaWidget)
  })
}

export function dashboardDetailMeta(detail = {}) {
  const dashboard = object(detail.dashboard), version = object(detail.version)
  return {
    dashboardId: stringId(dashboard.id || version.dashboardId), dashboardCode: String(dashboard.code || ''),
    workingVersionId: stringId(dashboard.workingVersionId || version.id),
    currentPublishedVersionId: stringId(dashboard.currentPublishedVersionId),
    resourceVersion: Number(version.resourceVersion ?? dashboard.resourceVersion ?? 0),
    publicationStatus: String(version.publicationStatus || dashboard.workingVersionStatus || dashboard.status || 'DRAFT')
  }
}

// The current backend stores widget style as an opaque JSON object, but does
// not yet expose a first-class Mock data source.  A MOCK board therefore uses
// legal TEXT widgets as storage carriers and keeps its original frontend
// widget contract in style.__idmpMockWidget.  This is deliberately isolated so
// it can be removed once the backend adds native MOCK/LIVE data modes.
export function isMockDashboardDetail(detail = {}) {
  return String(object(object(detail).version).style?.dataMode || '').toUpperCase() === MOCK_MODE
}

export function schemaToMockDashboardPayload(schema, { resourceVersion } = {}) {
  const toMockWidget = widget => {
    const config = object(widget.config)
    return {
      code: String(widget.id),
      title: String(widget.title || '演示组件'),
      type: 'TEXT',
      position: { ...widget.layout },
      fieldBindings: {},
      query: { resultShape: 'OVERVIEW' },
      filterBindings: object(config.interaction).clickFilter || {},
      drill: object(config.interaction).drill || {},
      chart: { text: object(config.text), chartKind: 'mock' },
      style: { ...object(config.style), [MOCK_WIDGET_KEY]: {
        type: widget.type, sourceCode: widget.sourceCode || '', sourceName: widget.sourceName || '',
        kpiIndex: widget.kpiIndex, chartKind: widget.chartKind, visualType: widget.visualType,
        preset: widget.preset, config
      } }
    }
  }
  return {
    ...(resourceVersion === undefined ? {} : { resourceVersion }),
    name: schema.name, description: schema.description || null, type: String(schema.dashboardType || 'CUSTOM').toUpperCase(),
    category: schema.category || null, applicableScope: { scope: schema.scope, sceneCode: schema.sceneCode || undefined },
    layout: { columns: schema.layout.columns, float: schema.layout.float }, theme: { name: schema.appearance?.theme || 'default' },
    style: { appearance: schema.appearance || {}, presentation: schema.presentation || {}, dataMode: MOCK_MODE, mockDatasetVersion: 'frontend-fixture-v1' },
    globalFilters: schema.globalFilters || [], interactions: {}, widgets: schema.widgets.map(toMockWidget)
  }
}

export function schemaToDashboardPayload(schema, { resourceVersion, dataSources = [] } = {}) {
  const sources = new Map((Array.isArray(dataSources) ? dataSources : []).map(item => [item.code, item]))
  const sourceOf = widget => sources.get(widget.sourceCode) || object(widget.config?.dataSource)
  const toWidget = widget => {
    const kind = widget.type === 'chart' ? widget.chartKind || 'line' : widget.type
    const source = sourceOf(widget)
    const config = object(widget.config)
    if (widget.type === 'metric-group') {
      return {
        code: String(widget.id), title: String(widget.title || '指标组'), type: 'TEXT', position: { ...widget.layout },
        fieldBindings: {}, query: { resultShape: 'OVERVIEW' }, filterBindings: {}, drill: {}, chart: { chartKind: 'metric-group' },
        style: { ...object(config.style), [METRIC_GROUP_KEY]: { config } }
      }
    }
    return {
      code: String(widget.id), title: String(widget.title || source.name || '未命名组件'),
      type: REMOTE_TYPE_BY_FRONTEND[kind] || String(kind || 'KPI').toUpperCase(),
      ...(widget.type === 'text' ? {} : {
        dataSourceCode: widget.sourceCode || null,
        indicatorVersionId: numericId(source.indicatorVersionId || source.analysisIndicatorVersionId)
      }),
      position: { ...widget.layout }, fieldBindings: config.dataBinding || {},
      query: { ...object(config.backendQuery), resultShape: RESULT_SHAPE_BY_FRONTEND[kind] || 'COMPARISON' },
      filterBindings: object(config.interaction).clickFilter || {}, drill: object(config.interaction).drill || {},
      chart: { ...(object(config.chart)), ...(widget.type === 'text' ? { text: object(config.text) } : {}), chartKind: kind }, style: object(config.style)
    }
  }
  return {
    ...(resourceVersion === undefined ? {} : { resourceVersion }),
    name: schema.name, description: schema.description || null, type: String(schema.dashboardType || 'CUSTOM').toUpperCase(),
    category: schema.category || null, applicableScope: { scope: schema.scope, sceneCode: schema.sceneCode || undefined },
    layout: { columns: schema.layout.columns, float: schema.layout.float }, theme: { name: schema.appearance?.theme || 'default' },
    style: { appearance: schema.appearance || {}, presentation: schema.presentation || {} },
    globalFilters: schema.globalFilters || [], interactions: {}, widgets: schema.widgets.map(toWidget)
  }
}

export function dashboardDataSourceToFrontend(source = {}) {
  return {
    code: String(source.code || ''), name: String(source.name || '未命名指标'), description: source.description || '', category: source.category || '指标目录',
    unit: source.unit || '', origin: 'dashboard-data-source', originLabel: '已发布指标',
    indicatorId: stringId(source.indicatorId), indicatorCode: String(source.code || ''),
    indicatorVersionId: stringId(source.indicatorVersionId), analysisIndicatorId: stringId(source.indicatorId),
    analysisIndicatorVersionId: stringId(source.indicatorVersionId), analysisEnabled: true,
    filterable: source.filterable === true, drillable: source.drillable === true,
    trendData: [], trendLabels: [], departmentData: [], pieData: []
  }
}

export function dashboardFieldsToFrontend(fields = []) {
  const dataTypes = { DECIMAL: 'number', INTEGER: 'number', LONG: 'number', DOUBLE: 'number', DATETIME: 'date', DATE: 'date', BOOLEAN: 'boolean' }
  return (Array.isArray(fields) ? fields : []).map(field => ({
    id: String(field.code || ''), label: field.name || field.code || '', dataType: dataTypes[String(field.dataType || '').toUpperCase()] || 'string',
    semanticType: String(field.role || '').toUpperCase() === 'MEASURE' ? 'measure' : String(field.dataType || '').toUpperCase().includes('DATE') || String(field.dataType || '').toUpperCase().includes('TIME') ? 'time' : 'dimension',
    unit: field.unit || '', filterable: field.filterable === true, groupable: field.groupable === true,
    aggregations: Array.isArray(field.aggregations) ? field.aggregations.map(value => String(value).toLowerCase()) : [], drillable: field.drillable === true,
    drillLevel: field.drillLevel || null
  })).filter(field => field.id)
}

export function widgetResultToDataset(result = {}, fields = [], id = 'backend') {
  return { id, label: '正式指标结果', fields: dashboardFieldsToFrontend(result.fields?.length ? result.fields : fields), rows: Array.isArray(result.rows) ? result.rows : [], status: result.status || 'EMPTY', message: result.message || '', resultId: stringId(result.resultId), snapshotId: stringId(result.snapshotId) }
}

// The server permits an empty fieldBindings object for simple components. The
// existing renderer needs an explicit binding, so derive only a safe display
// default. Users can subsequently replace it in the designer.
export function applyDefaultDashboardBindings(schema, fieldsBySource = {}) {
  return {
    ...schema,
    widgets: (schema.widgets || []).map(widget => {
      if (widget.config?.dataBinding || !widget.sourceCode) return widget
      const fields = dashboardFieldsToFrontend(fieldsBySource[widget.sourceCode] || [])
      const measure = fields.find(field => field.id === 'value' && field.semanticType === 'measure') || fields.find(field => field.semanticType === 'measure')
      const dimensions = fields.filter(field => field.semanticType === 'dimension' || field.semanticType === 'time')
      if (!measure) return widget
      const kind = widget.type === 'chart' ? widget.chartKind : widget.type
      const dimension = kind === 'line' ? dimensions.find(field => field.id === 'periodStart') || dimensions[0] : dimensions[0]
      const binding = {
        dataset: 'backend', dimensions: dimension && kind !== 'kpi' && kind !== 'gauge' ? [{ field: dimension.id }] : [],
        measures: [{ field: measure.id, aggregation: 'direct' }], series: [], sort: []
      }
      return { ...widget, config: { ...widget.config, dataBinding: binding } }
    })
  }
}

function remoteWidgetToSchemaWidget(widget = {}) {
  const remoteType = String(widget.type || '').toUpperCase()
  const mapped = FRONTEND_TYPE_BY_REMOTE[remoteType] || { type: 'chart', chartKind: remoteType.toLowerCase() || 'line', visualType: remoteType.toLowerCase() || 'line' }
  const chart = object(widget.chart), query = object(widget.query), style = object(widget.style)
  const metricGroup = object(style[METRIC_GROUP_KEY])
  if (remoteType === 'TEXT' && chart.chartKind === 'metric-group' && metricGroup.config) {
    const restoredStyle = { ...style }
    delete restoredStyle[METRIC_GROUP_KEY]
    return { id: String(widget.code), type: 'metric-group', title: widget.title || '指标组', visualType: 'metric-group', config: { ...object(metricGroup.config), style: restoredStyle }, layout: { x: Number(widget.position?.x || 0), y: Number(widget.position?.y || 0), w: Number(widget.position?.w || 12), h: Number(widget.position?.h || 5) } }
  }
  const mockWidget = object(style[MOCK_WIDGET_KEY])
  if (mockWidget.type) {
    const restoredStyle = { ...style }
    delete restoredStyle[MOCK_WIDGET_KEY]
    return {
      id: String(widget.code), type: mockWidget.type, sourceCode: mockWidget.sourceCode || '', sourceName: mockWidget.sourceName || '',
      ...(mockWidget.kpiIndex === undefined ? {} : { kpiIndex: mockWidget.kpiIndex }),
      ...(mockWidget.chartKind ? { chartKind: mockWidget.chartKind } : {}),
      ...(mockWidget.visualType ? { visualType: mockWidget.visualType } : {}),
      ...(mockWidget.preset ? { preset: mockWidget.preset } : {}), title: widget.title || '',
      config: { ...object(mockWidget.config), style: restoredStyle },
      layout: { x: Number(widget.position?.x || 0), y: Number(widget.position?.y || 0), w: Number(widget.position?.w || 4), h: Number(widget.position?.h || 3) }
    }
  }
  const interaction = {
    ...(Object.keys(object(widget.filterBindings)).length ? { clickFilter: widget.filterBindings } : {}),
    ...(Object.keys(object(widget.drill)).length ? { drill: widget.drill } : {})
  }
  if (Object.keys(interaction).length) interaction.clickAction = interaction.drill?.hierarchy ? 'drill' : interaction.clickFilter?.enabled ? 'cross-filter' : 'none'
  const binding = frontendBinding(widget.fieldBindings)
  return {
    id: String(widget.code), type: mapped.type, ...(mapped.chartKind ? { chartKind: chart.chartKind || mapped.chartKind } : {}),
    visualType: mapped.visualType, sourceCode: widget.dataSourceCode || '', sourceName: widget.dataSourceName || '', title: widget.title || '',
    config: { ...(binding ? { dataBinding: binding } : {}), ...(Object.keys(query).length ? { backendQuery: query } : {}), ...(Object.keys(interaction).length ? { interaction } : {}), ...(Object.keys(chart).length ? { chart } : {}), style, ...(remoteType === 'TEXT' ? { text: object(widget.text || chart.text) } : {}) },
    layout: { x: Number(widget.position?.x || 0), y: Number(widget.position?.y || 0), w: Number(widget.position?.w || 4), h: Number(widget.position?.h || 3) }
  }
}

function normalizeDashboardType(value) {
  const type = String(value || '').toLowerCase().replaceAll('_', '-')
  return ['hospital-overview', 'topic', 'scene', 'department', 'custom'].includes(type) ? type : 'custom'
}
function normalizeScope(value) {
  const scope = typeof value === 'string' ? value : object(value).scope
  return ['hospital', 'department', 'personal'].includes(String(scope || '').toLowerCase()) ? String(scope).toLowerCase() : 'hospital'
}
function numericId(value) { return value === null || value === undefined || value === '' ? null : String(value) }
function frontendBinding(value) {
  const binding = object(value)
  if (!Array.isArray(binding.dimensions) || !Array.isArray(binding.measures) || !Array.isArray(binding.series) || !Array.isArray(binding.sort)) return null
  return { ...binding, dataset: binding.dataset || 'backend' }
}
