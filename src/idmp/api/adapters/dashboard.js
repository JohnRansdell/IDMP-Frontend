import { normalizeDashboardSchema } from '../../features/dashboard/schema.js'
import { createDefaultBinding, preferredMeasureAggregation } from '../../features/dashboard/smartDefaultBinding.js'
import { singleIndicatorTemplatePlan } from '../../features/dashboard/templateBinding.js'
import { dashboardWidgetResultShape, isPeriodField, normalizePeriodDataset } from '../../features/dashboard/periodFields.js'
import { immutableResultRows, transformResultRows } from '../../features/dashboard/resultRows.js'

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

const stringId = value => value === null || value === undefined ? '' : String(value)
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const MOCK_MODE = 'MOCK'
const MOCK_WIDGET_KEY = '__idmpMockWidget'
const METRIC_GROUP_KEY = '__idmpMetricGroup'
const INDICATOR_RANKING_KEY = '__idmpIndicatorRanking'
const TEMPLATE_SLOT_KEY = '__idmpTemplateSlot'
const CLICK_ACTION_KEY = '__idmpClickAction'

export function dashboardSummaryToCatalogEntry(item = {}) {
  return {
    id: stringId(item.id), code: String(item.code || ''), name: String(item.name || '未命名看板'),
    description: String(item.description || ''), dashboardType: normalizeDashboardType(item.type),
    category: String(item.category || ''), scope: normalizeScope(item.applicableScope),
    updatedAt: item.updatedAt || item.createdAt || new Date(0).toISOString(), origin: 'remote',
    status: item.status || 'DRAFT', currentPublishedVersionId: stringId(item.currentPublishedVersionId),
    workingVersionId: stringId(item.workingVersionId), workingVersionStatus: String(item.workingVersionStatus || ''),
    resourceVersion: Number(item.resourceVersion ?? 0)
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
    widgets: (Array.isArray(version.widgets) ? version.widgets : []).map(widget => {
      const restored = remoteWidgetToSchemaWidget(widget)
      restored.config.persistedWidgetCode = String(widget.code)
      return restored
    })
  })
}

// Opening a historical demo draft preserves metadata but requires explicit real component bindings.
export function dashboardDetailToEditableSchema(detail = {}) {
  const schema = dashboardDetailToSchema(detail)
  return isMockDashboardDetail(detail)
    ? normalizeDashboardSchema({ ...schema, widgets: [], globalFilters: [] })
    : schema
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

// Detect historical demo boards so the UI can request real bindings instead of rendering fixtures.
export function isMockDashboardDetail(detail = {}) {
  const version = object(object(detail).version)
  return String(version.style?.dataMode || '').toUpperCase() === MOCK_MODE
    || (Array.isArray(version.widgets) && version.widgets.some(widget => Boolean(widget?.style?.[MOCK_WIDGET_KEY])))
}

export function schemaToDashboardPayload(schema, { resourceVersion, dataSources = [] } = {}) {
  const sources = new Map((Array.isArray(dataSources) ? dataSources : []).map(item => [item.code, item]))
  const sourceOf = widget => sources.get(widget.sourceCode) || object(widget.config?.dataSource)
  const toWidget = widget => {
    const kind = widget.type === 'chart' ? widget.chartKind || 'line' : widget.type
    const source = sourceOf(widget)
    const config = object(widget.config)
    const identity = config.persistedWidgetCode === widget.id
      ? { code: String(widget.id) }
      : { clientKey: String(widget.id) }
    const indicatorBindings = Array.isArray(config.indicatorBindings) ? config.indicatorBindings : []
    const indicatorVersionIds = indicatorBindings
      .map(binding => binding?.indicatorVersionId || sources.get(binding?.sourceCode)?.indicatorVersionId || sources.get(binding?.sourceCode)?.analysisIndicatorVersionId)
      .map(numericId)
      .filter(Boolean)
    if (widget.type === 'metric-group' || (widget.type === 'ranking' && config.ranking?.mode === 'indicators')) {
      const indicatorRanking = widget.type === 'ranking'
      return {
        ...identity, title: String(widget.title || '指标组'), type: 'TEXT', position: { ...widget.layout },
        fieldBindings: {}, query: { resultShape: 'OVERVIEW' }, filterBindings: {}, drill: {}, chart: { chartKind: indicatorRanking ? 'indicator-ranking' : 'metric-group' },
        style: { ...object(config.style), [indicatorRanking ? INDICATOR_RANKING_KEY : METRIC_GROUP_KEY]: { config } }
      }
    }
    return {
      ...identity, title: String(widget.title || source.name || '未命名组件'),
      type: REMOTE_TYPE_BY_FRONTEND[kind] || String(kind || 'KPI').toUpperCase(),
      ...(widget.type === 'text' ? {} : {
        dataSourceCode: widget.sourceCode || null,
        indicatorVersionId: numericId(config.analysisIndicatorVersionId || source.indicatorVersionId || source.analysisIndicatorVersionId),
        ...(indicatorVersionIds.length > 1 ? { indicatorVersionIds } : {})
      }),
      position: { ...widget.layout }, fieldBindings: config.dataBinding || {},
      query: { ...object(config.backendQuery), resultShape: dashboardWidgetResultShape(widget) },
      filterBindings: object(config.interaction).clickFilter || {}, drill: object(config.interaction).drill || {},
      chart: { ...(object(config.chart)), ...(Array.isArray(config.tableColumns) ? { tableColumns: config.tableColumns } : {}), ...(indicatorBindings.length ? { indicatorBindings } : {}), ...(widget.type === 'text' ? { text: object(config.text) } : {}), chartKind: kind },
      style: { ...object(config.style), ...(config.templateSlot ? { [TEMPLATE_SLOT_KEY]: config.templateSlot } : {}), ...(config.interaction?.clickAction === 'drill' ? { [CLICK_ACTION_KEY]: 'drill' } : {}) }
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
    indicatorVersionNo: String(source.indicatorVersionNo || ''),
    analysisIndicatorVersionId: stringId(source.indicatorVersionId), analysisEnabled: true,
    filterable: source.filterable === true, drillable: source.drillable === true,
    trendData: [], trendLabels: [], departmentData: [], pieData: []
  }
}

// The dashboard endpoint can retain sources after their indicator is deleted.
// Only the current management catalog authorizes a source for new selection.
export function currentPublishedDashboardDataSources(sources = [], indicators = []) {
  const current = new Map((Array.isArray(indicators) ? indicators : []).map(indicator => [String(indicator.code || ''), indicator]))
  return (Array.isArray(sources) ? sources : []).flatMap(source => {
    const indicator = current.get(String(source.code || ''))
    if (!indicator || String(indicator.status || '').toUpperCase() !== 'PUBLISHED') return []
    if (indicator.deleted === true || indicator.isDeleted === true || indicator.deletedAt) return []
    if (source.indicatorId && indicator.id && stringId(source.indicatorId) !== stringId(indicator.id)) return []
    return [{ ...source, name: indicator.name || source.name, category: indicator.category || source.category }]
  })
}

export function sortDashboardDataSourcesByIndicatorCreatedAt(sources = [], indicators = []) {
  const indicatorMetadata = new Map()
  ;(Array.isArray(indicators) ? indicators : []).forEach((indicator, index) => {
    const metadata = { index, createdAt: indicator?.createdAt || '' }
    indicatorMetadata.set(`id:${stringId(indicator?.id || indicator?.indicatorId)}`, metadata)
    if (indicator?.code) indicatorMetadata.set(`code:${indicator.code}`, metadata)
  })
  const ranked = (Array.isArray(sources) ? sources : []).map((source, index) => {
    const indicator = indicatorMetadata.get(`code:${source?.code}`) || indicatorMetadata.get(`id:${stringId(source?.indicatorId)}`)
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
      : String(field.role || field.semanticType || '').toUpperCase() === 'TIME' || dataType === 'date' || isPeriodField(field.code) ? 'time' : 'dimension'
    const filterTypes = (Array.isArray(field.supportedFilterTypes) ? field.supportedFilterTypes : field.filterTypes || [])
      .map(value => String(value).toLowerCase().replaceAll('_', '-'))
    const defaultAggregation = normalizeAggregation(field.defaultAggregation || field.recommendedAggregation)
    const granularities = (field.supportedGranularities || field.granularities || []).map(value => String(value).toLowerCase())
    return {
      id: String(field.code || ''), label: field.code === 'periodType' ? '周期类型（月度／季度／年度）' : field.name || field.code || '', dataType, semanticType,
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
      ...(field.departmentCodeField ? { departmentCodeField: field.departmentCodeField, departmentNameField: field.departmentNameField || '' } : {}),
      drillable: field.drillable === true, drillLevel: field.drillLevel || null
    }
  }).filter(field => field.id)
}

export function widgetResultToDataset(result = {}, fields = [], id = 'backend') {
  const mapDefinition = object(result.mapDefinition)
  const datasetFields = dashboardFieldsToFrontend(mergeDashboardFields(fields, result.fields))
  const sourceRows = Array.isArray(result.rows) ? result.rows : []
  const normalizedRows = transformResultRows(sourceRows, `adapter:${JSON.stringify(datasetFields.map(field => field.id))}`, () =>
    normalizePeriodDataset({ fields: datasetFields, rows: sourceRows.map(row => alignDashboardRowFields(row, datasetFields)) }).rows)
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
    fields: normalizePeriodDataset({ fields: datasetFields }).fields,
    rows: Object.isFrozen(normalizedRows) ? normalizedRows : immutableResultRows(normalizedRows),
    comparison: {
      yoy: timeYoy !== undefined ? timeYoy : result.comparison?.yoy ?? result.yoy ?? null,
      mom: timeMom !== undefined ? timeMom : result.comparison?.mom ?? result.mom ?? null,
      unit: hasTimeComparison ? '%' : result.comparison?.unit || result.comparisonUnit || '',
      trendDirection: result.comparison?.trendDirection || result.trendDirection || null,
      ...(result.periodContext || {})
    },
    periodContext: result.periodContext || null,
    status: result.status || 'EMPTY',
    rowMode: result.rowMode || 'UNPROJECTED',
    serverCalculated: true,
    appliedGlobalFilterFields: result.appliedGlobalFilterFields || [],
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
      const templatePlan = singleIndicatorTemplatePlan(widget, [{ id: 'backend', fields }])
      const binding = templatePlan?.binding || createDefaultBinding(kind, [{ id: 'backend', fields }])
      if (!binding) return widget
      return { ...widget, ...(templatePlan ? { type: templatePlan.type, chartKind: templatePlan.chartKind, visualType: templatePlan.visualType } : {}), config: { ...widget.config, dataBinding: binding } }
    })
  }
}

function remoteWidgetToSchemaWidget(widget = {}) {
  const remoteType = String(widget.type || '').toUpperCase()
  const mapped = FRONTEND_TYPE_BY_REMOTE[remoteType] || { type: 'chart', chartKind: remoteType.toLowerCase() || 'line', visualType: remoteType.toLowerCase() || 'line' }
  const chart = object(widget.chart), query = object(widget.query), style = { ...object(widget.style) }
  const metricGroup = object(style[METRIC_GROUP_KEY])
  const indicatorRanking = object(style[INDICATOR_RANKING_KEY])
  if (remoteType === 'TEXT' && chart.chartKind === 'indicator-ranking' && indicatorRanking.config) {
    const restoredStyle = { ...style }
    delete restoredStyle[INDICATOR_RANKING_KEY]
    return { id: String(widget.code), type: 'ranking', title: widget.title || '指标排名', visualType: 'ranking', config: { ...object(indicatorRanking.config), style: restoredStyle }, layout: { x: Number(widget.position?.x || 0), y: Number(widget.position?.y || 0), w: Number(widget.position?.w || 12), h: Number(widget.position?.h || 7) } }
  }
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
  if (style[CLICK_ACTION_KEY] === 'drill') interaction.clickAction = 'drill'
  else if (Object.keys(interaction).length) interaction.clickAction = interaction.drill?.hierarchy ? 'drill' : interaction.clickFilter?.enabled ? 'cross-filter' : 'none'
  delete style[CLICK_ACTION_KEY]
  const templateSlot = object(style[TEMPLATE_SLOT_KEY])
  delete style[TEMPLATE_SLOT_KEY]
  const binding = frontendBinding(widget.fieldBindings)
  return {
    id: String(widget.code), type: mapped.type, ...(mapped.chartKind ? { chartKind: chart.chartKind || mapped.chartKind } : {}),
    visualType: mapped.visualType, sourceCode: widget.dataSourceCode || '', sourceName: widget.dataSourceName || '', title: widget.title || '',
    config: { ...(Object.keys(templateSlot).length ? { templateSlot } : {}), ...(binding ? { dataBinding: binding } : {}), ...(widget.indicatorVersionId ? { analysisIndicatorVersionId: stringId(widget.indicatorVersionId) } : {}), ...(Array.isArray(chart.tableColumns) ? { tableColumns: chart.tableColumns } : {}), ...(Array.isArray(chart.indicatorBindings) ? { indicatorBindings: chart.indicatorBindings } : {}), ...(Object.keys(query).length ? { backendQuery: query } : {}), ...(Object.keys(interaction).length ? { interaction } : {}), ...(Object.keys(chart).length ? { chart } : {}), style, ...(remoteType === 'TEXT' ? { text: object(widget.text || chart.text) } : {}) },
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
  if (!Array.isArray(binding.dimensions) || !Array.isArray(binding.measures)) return null
  if ((binding.series != null && !Array.isArray(binding.series)) || (binding.sort != null && !Array.isArray(binding.sort))) return null
  return { ...binding, series: binding.series || [], sort: binding.sort || [], dataset: binding.dataset || 'backend' }
}
