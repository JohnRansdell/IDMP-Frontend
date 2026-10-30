import { normalizeIndicatorBindings } from './multiIndicator.js'
import { metricGroupItemWidget } from './metricGroup.js'

const codeOf = field => field.code || field.id
export const isLogicalFilterDimension = id => /^(organization:|path:)/.test(String(id || ''))

export function dashboardFilterSourceWidgets(widgets = []) {
  return widgets.flatMap(owner => {
    const items = owner.type === 'metric-group' || owner.type === 'ranking' && owner.config?.ranking?.mode === 'indicators'
      ? (owner.config?.metricGroup?.items || []).map(item => metricGroupItemWidget(owner, item)) : [owner]
    return items.flatMap(widget => normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).map(binding => ({
      ...widget, filterOwnerId: String(owner.id), sourceCode: binding.sourceCode,
      config: { ...widget.config, analysisIndicatorVersionId: binding.indicatorVersionId || widget.config?.analysisIndicatorVersionId }
    })))
  })
}

export function resolveFilterDimension(id, fields = []) {
  const matches = fields.filter(field => field.filterable && field.filterDimensions?.some(dimension => dimension.id === id))
  const unique = new Map(matches.map(field => [String(codeOf(field)).toLowerCase(), field]))
  return unique.size === 1 ? [...unique.values()][0] : undefined
}

export function dashboardDimensionCatalog(datasets = []) {
  const dimensions = new Map()
  for (const dataset of datasets) for (const field of dataset.fields || []) {
    if (!field.filterable) continue
    for (const dimension of field.filterDimensions || []) {
      if (!resolveFilterDimension(dimension.id, dataset.fields)) continue
      const existing = dimensions.get(dimension.id)
      if (existing && existing.dataType !== field.dataType) { existing.conflict = true; continue }
      if (!existing) dimensions.set(dimension.id, { ...field, id: dimension.id, code: undefined,
        label: dimension.name, filterDimensions: [], options: [] })
    }
  }
  return [...dimensions.values()].filter(item => !item.conflict)
}

// Upgrade stored field selections only when actual path metadata proves one identity.
export function normalizeGlobalFilterDimensions(definitions = [], datasets = []) {
  return definitions.map(definition => {
    if (isLogicalFilterDimension(definition.field)) return definition
    const identities = new Map()
    for (const dataset of datasets) {
      const field = dataset.fields?.find(item => String(codeOf(item)).toLowerCase() === String(definition.field).toLowerCase())
      const member = field?.departmentCodeField
        ? dataset.fields.find(item => codeOf(item) === field.departmentCodeField) : field
      for (const dimension of member?.filterDimensions || []) identities.set(dimension.id, dimension)
    }
    if (identities.size !== 1) return definition
    const dimension = [...identities.values()][0]
    return { ...definition, field: dimension.id,
      label: dimension.id === 'organization:department' ? '科室' : dimension.id === 'organization:doctor' ? '医生' : definition.label }
  })
}
