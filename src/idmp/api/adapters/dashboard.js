import { normalizeDashboardSchema } from '../../features/dashboard/schema.js'
import { createDefaultBinding, preferredMeasureAggregation } from '../../features/dashboard/smartDefaultBinding.js'

const FRONTEND_TYPE_BY_REMOTE = Object.freeze({
  KPI: { type: 'kpi', visualType: 'kpi' },
  KPI_CARD: { type: 'kpi', visualType: 'kpi' },
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

export function selectDashboardVersion(detail = {}, versions = [], { editing = false } = {}) {
  const dashboard = object(detail.dashboard)
  const fallback = object(detail.version)
  const targetId = stringId(editing ? dashboard.workingVersionId : dashboard.currentPublishedVersionId)
  if (!targetId) return fallback
  return (Array.isArray(versions) ? versions : []).find(version => stringId(version?.id) === targetId) || fallback
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
    const indicatorBindings = Array.isArray(config.indicatorBindings) ? config.indicatorBindings : []
    const indicatorVersionIds = indicatorBindings
      .map(binding => sources.get(binding?.sourceCode)?.indicatorVersionId || sources.get(binding?.sourceCode)?.analysisIndicatorVersionId)
      .map(numericId)
      .filter(Boolean)
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
        indicatorVersionId: numericId(source.indicatorVersionId || source.analysisIndicatorVersionId),
        ...(indicatorVersionIds.length > 1 ? { indicatorVersionIds } : {})
      }),
      position: { ...widget.layout }, fieldBindings: config.dataBinding || {},
      query: { ...object(config.backendQuery), resultShape: RESULT_SHAPE_BY_FRONTEND[kind] || 'COMPARISON' },
      filterBindings: object(config.interaction).clickFilter || {}, drill: object(config.interaction).drill || {},
      chart: { ...(object(config.chart)), ...(indicatorBindings.length ? { indicatorBindings } : {}), ...(widget.type === 'text' ? { text: object(config.text) } : {}), chartKind: kind }, style: object(config.style)
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
    unit: source.unit || '',
    yoy: source.yoy ?? null, mom: source.mom ?? null,
    comparisonUnit: source.comparisonUnit || source.changeUnit || '',
    trendDirection: source.trendDirection || null,
    origin: 'dashboard-data-source', originLabel: '已发布指标',
    indicatorId: stringId(source.indicatorId), indicatorCode: String(source.code || ''),
    indicatorVersionId: stringId(source.indicatorVersionId), analysisIndicatorId: stringId(source.indicatorId),
    analysisIndicatorVersionId: stringId(source.indicatorVersionId), analysisEnabled: true,
    filterable: source.filterable === true, drillable: source.drillable === true,
    trendData: [], trendLabels: [], departmentData: [], pieData: []
  }
}

export function sortDashboardDataSourcesByIndicatorCreatedAt(sources = [], indicators = []) {
  const indicatorMetadata = new Map((Array.isArray(indicators) ? indicators : []).map((indicator, index) => [
    stringId(indicator?.id || indicator?.indicatorId),
    { index, createdAt: indicator?.createdAt || '' }
  ]))
  const ranked = (Array.isArray(sources) ? sources : []).map((source, index) => {
    const indicator = indicatorMetadata.get(stringId(source?.indicatorId))
    const createdTime = indicator?.createdAt ? Date.parse(indicator.createdAt) : NaN
    return { source, index, indicatorIndex: indicator?.index, createdTime }
  })
  return ranked.sort((left, right) => {
    const leftHasTime = Number.isFinite(left.createdTime)
    const rightHasTime = Number.isFinite(right.createdTime)
    if (leftHasTime !== rightHasTime) return leftHasTime ? -1 : 1
    if (leftHasTime && left.createdTime !== right.createdTime) return right.createdTime - left.createdTime
    if (left.indicatorIndex !== undefined && right.indicatorIndex !== undefined && left.indicatorIndex !== right.indicatorIndex) {
      return left.indicatorIndex - right.indicatorIndex
    }
    return left.index - right.index
  }).map(item => item.source)
}

export function dashboardFieldsToFrontend(fields = []) {
  const dataTypes = { DECIMAL: 'number', INTEGER: 'number', LONG: 'number', DOUBLE: 'number', DATETIME: 'date', DATE: 'date', BOOLEAN: 'boolean' }
  const normalizeAggregation = value => String(value || '').toUpperCase() === 'NONE' ? 'direct' : String(value || '').toLowerCase()
  return (Array.isArray(fields) ? fields : []).map(field => {
    const dataType = dataTypes[String(field.dataType || '').toUpperCase()] || 'string'
    const semanticType = String(field.role || field.semanticType || '').toUpperCase() === 'MEASURE'
      ? 'measure'
      : String(field.role || field.semanticType || '').toUpperCase() === 'TIME' || dataType === 'date' ? 'time' : 'dimension'
    const filterTypes = (Array.isArray(field.supportedFilterTypes) ? field.supportedFilterTypes : field.filterTypes || [])
      .map(value => String(value).toLowerCase().replaceAll('_', '-'))
    const defaultAggregation = normalizeAggregation(field.defaultAggregation || field.recommendedAggregation)
    const granularities = (field.supportedGranularities || field.granularities || []).map(value => String(value).toLowerCase())
    return {
      id: String(field.code || ''), label: field.name || field.code || '', dataType, semanticType,
      businessSemanticType: String(field.semanticType || '').toUpperCase() || null,
      unit: field.unit || '', filterable: field.filterable === true, sortable: field.sortable === true, groupable: field.groupable === true,
      // Published indicator rows are already calculated by the backend. Its
      // NONE capability means "do not aggregate again", which is `direct` in
      // the frontend binding engine.
      aggregations: (Array.isArray(field.supportedAggregations) ? field.supportedAggregations : field.aggregations || []).map(normalizeAggregation).filter(Boolean),
      ...(defaultAggregation ? { defaultAggregation } : {}),
      granularities: granularities.length ? granularities : semanticType === 'time' ? ['raw'] : [],
      filterTypes: filterTypes.length ? filterTypes : dataType === 'date' ? ['date-range'] : ['select', 'multi-select'],
      preferredFilterType: filterTypes[0] || (dataType === 'date' ? 'date-range' : 'multi-select'),
      dictionaryCode: field.dictionaryCode || null,
      drillable: field.drillable === true, drillLevel: field.drillLevel || null
    }
  }).filter(field => field.id)
}

export function widgetResultToDataset(result = {}, fields = [], id = 'backend') {
  const mapDefinition = object(result.mapDefinition)
  const datasetFields = dashboardFieldsToFrontend(mergeDashboardFields(fields, result.fields))
  const timeComparison = object(result.timeComparison)
  const relativeChange = entry => {
    if (!entry || typeof entry !== 'object') return undefined
    const status = String(entry.status || '').toUpperCase()
    if (status && status !== 'COMPARABLE') return null
    const value = entry.relativeChangePercent
    if (value === null || value === undefined || value === '') return null
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  const timeYoy = relativeChange(timeComparison.yearOverYear)
  const timeMom = relativeChange(timeComparison.periodOverPeriod || timeComparison.monthOverMonth)
  const hasTimeComparison = timeYoy !== undefined || timeMom !== undefined
  return {
    id,
    label: '正式指标结果',
    fields: datasetFields,
    rows: (Array.isArray(result.rows) ? result.rows : []).map(row => alignDashboardRowFields(row, datasetFields)),
    comparison: {
      yoy: timeYoy !== undefined ? timeYoy : result.comparison?.yoy ?? result.yoy ?? null,
      mom: timeMom !== undefined ? timeMom : result.comparison?.mom ?? result.mom ?? null,
      unit: hasTimeComparison ? '%' : result.comparison?.unit || result.comparisonUnit || '',
      trendDirection: result.comparison?.trendDirection || result.trendDirection || null
    },
    status: result.status || 'EMPTY',
    message: result.message || '',
    resultId: stringId(result.resultId),
    snapshotId: stringId(result.snapshotId),
    mapDefinition: mapDefinition.geoJSON || mapDefinition.geoJson ? {
      name: String(mapDefinition.name || result.mapName || 'idmp-map'),
      geoJSON: mapDefinition.geoJSON || mapDefinition.geoJson
    } : null
  }
}

function mergeDashboardFields(catalogFields, resultFields) {
  const merged = new Map()
  for (const field of [...(Array.isArray(catalogFields) ? catalogFields : []), ...(Array.isArray(resultFields) ? resultFields : [])]) {
    const code = String(field?.code || '').trim()
    if (!code) continue
    const key = code.toLowerCase()
    merged.set(key, { ...(merged.get(key) || {}), ...field, code: merged.get(key)?.code || code })
  }
  return [...merged.values()]
}

function alignDashboardRowFields(row, fields) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  const keys = new Map(Object.keys(row).map(key => [key.toLowerCase(), key]))
  const aligned = { ...row }
  for (const field of fields) {
    if (Object.hasOwn(aligned, field.id)) continue
    const actual = keys.get(field.id.toLowerCase())
    if (actual !== undefined) aligned[field.id] = row[actual]
  }
  return aligned
}

// The server permits an empty fieldBindings object for simple components. The
// existing renderer needs an explicit binding, so derive only a safe display
// default. Users can subsequently replace it in the designer.
export function applyDefaultDashboardBindings(schema, fieldsBySource = {}) {
  return {
    ...schema,
    widgets: (schema.widgets || []).map(widget => {
      if (!widget.sourceCode) return widget
      const fields = dashboardFieldsToFrontend(fieldsBySource[widget.sourceCode] || [])
      if (widget.config?.dataBinding) {
        const fieldById = new Map(fields.map(field => [field.id, field]))
        const measures = widget.config.dataBinding.measures.map(measure => {
          const field = fieldById.get(measure.field)
          const supported = field?.aggregations || []
          return supported.length && !supported.includes(measure.aggregation)
            ? { ...measure, aggregation: preferredMeasureAggregation(field) }
            : measure
        })
        return { ...widget, config: { ...widget.config, dataBinding: { ...widget.config.dataBinding, measures } } }
      }
      const kind = widget.type === 'chart' ? widget.chartKind : widget.type
      const binding = createDefaultBinding(kind, [{ id: 'backend', fields }])
      if (!binding) return widget
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
    config: { ...(binding ? { dataBinding: binding } : {}), ...(widget.indicatorVersionId ? { analysisIndicatorVersionId: stringId(widget.indicatorVersionId) } : {}), ...(Array.isArray(chart.indicatorBindings) ? { indicatorBindings: chart.indicatorBindings } : {}), ...(Object.keys(query).length ? { backendQuery: query } : {}), ...(Object.keys(interaction).length ? { interaction } : {}), ...(Object.keys(chart).length ? { chart } : {}), style, ...(remoteType === 'TEXT' ? { text: object(widget.text || chart.text) } : {}) },
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
