const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const MOCK_MODE = 'MOCK'
const MOCK_WIDGET_KEY = '__idmpMockWidget'
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

\n