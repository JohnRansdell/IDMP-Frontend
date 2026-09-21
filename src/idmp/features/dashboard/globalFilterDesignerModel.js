import { filterValueType } from './filterEngine.js'

const emptyDefaultValue = type => type === 'multi-select' ? [] : null

export function createGlobalFilterDefinition(field, definitions = [], options = {}) {
  if (!field?.id || definitions.some(definition => definition.field === field.id)) return null
  const base = `filter-${field.id}`
  let id = options.id || base
  let suffix = 1
  while (definitions.some(definition => definition.id === id)) id = `${base}-${suffix++}`
  const type = field.preferredFilterType
  return {
    id,
    label: field.label,
    field: field.id,
    dataType: filterValueType(field),
    type,
    defaultValue: emptyDefaultValue(type),
    dependsOn: [],
    invalidValueBehavior: 'clear',
    ...(options.optionSourceCode ? { optionSourceCode: options.optionSourceCode } : {}),
    enabled: true
  }
}

export function changeGlobalFilterField(definition, field) {
  if (!definition || !field?.id) return definition
  const type = field.filterTypes?.includes(definition.type) ? definition.type : field.preferredFilterType
  return {
    ...definition,
    label: field.label,
    field: field.id,
    dataType: filterValueType(field),
    type,
    defaultValue: emptyDefaultValue(type)
  }
}

export function globalFilterScopeTargetIds(widgets = [], filterId, compatibleWidgetIds = null) {
  const compatible = compatibleWidgetIds === null ? null : new Set(compatibleWidgetIds.map(String))
  return widgets
    .filter(widget => compatible === null || compatible.has(String(widget.id)))
    .filter(widget => !widget.config?.query?.ignoredGlobalFilterIds?.includes(filterId))
    .map(widget => String(widget.id))
}

export function applyGlobalFilterScope(widgets = [], filterId, targetWidgetIds = null, compatibleWidgetIds = null) {
  const targets = targetWidgetIds === null ? null : new Set(targetWidgetIds.map(String))
  const compatible = compatibleWidgetIds === null ? null : new Set(compatibleWidgetIds.map(String))
  return widgets.map(widget => {
    const query = widget.config?.query || {}
    const ignored = query.ignoredGlobalFilterIds || []
    const shouldIgnore = targets !== null && (compatible === null || compatible.has(String(widget.id))) && !targets.has(String(widget.id))
    const nextIgnored = shouldIgnore
      ? [...ignored.filter(id => id !== filterId), filterId]
      : ignored.filter(id => id !== filterId)
    if (JSON.stringify(nextIgnored) === JSON.stringify(ignored)) return widget
    const nextQuery = { ...query }
    if (nextIgnored.length) nextQuery.ignoredGlobalFilterIds = nextIgnored
    else delete nextQuery.ignoredGlobalFilterIds
    return { ...widget, config: { ...widget.config, query: nextQuery } }
  })
}

export function removeGlobalFilter(definitions = [], widgets = [], filterId) {
  return {
    definitions: definitions.filter(definition => definition.id !== filterId),
    widgets: applyGlobalFilterScope(widgets, filterId, null)
  }
}
