const text = value => typeof value === 'string' ? value.trim() : ''

export function isActiveDashboardContextValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some(isActiveDashboardContextValue)
  return value !== undefined && value !== null && value !== ''
}

export function formatDashboardContextValue(value) {
  if (Array.isArray(value)) return value.map(formatDashboardContextValue).filter(Boolean).join('、')
  if (value && typeof value === 'object') return Object.values(value).map(formatDashboardContextValue).filter(Boolean).join('、')
  return text(String(value))
}

export function buildDashboardContext({ definitions = [], values = {}, interactions = [], drillStates = {}, widgets = [] } = {}) {
  const filters = definitions.filter(definition => definition?.enabled && isActiveDashboardContextValue(values[definition.id])).map(definition => ({ id: `filter:${definition.id}`, kind: 'filter', label: definition.label || definition.field || '筛选', value: formatDashboardContextValue(values[definition.id]) }))
  const linked = interactions.filter(item => item?.id && isActiveDashboardContextValue(item.value)).map(item => ({ id: `interaction:${item.id}`, kind: 'interaction', label: item.label || '联动', value: formatDashboardContextValue(item.value) }))
  const drills = Object.entries(drillStates).filter(([, state]) => Array.isArray(state?.path) && state.path.length).map(([widgetId, state]) => ({ id: `drill:${widgetId}`, kind: 'drill', label: widgets.find(widget => String(widget.id) === String(widgetId))?.title || '下钻', value: ['全院', ...state.path].join(' › ') }))
  return { filters, interactions: linked, drills, items: [...filters, ...linked, ...drills] }
}
