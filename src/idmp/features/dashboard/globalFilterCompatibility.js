import { hasDataBinding } from './bindingEngine.js'
import { filterValueType } from './filterEngine.js'
import { resolveGlobalFilterField } from './departmentFilters.js'

// A widget is globally filterable only through its bound raw dataset. Preset
// presentation data is deliberately excluded because it has no row-level field contract.
export function resolveCompatibleGlobalFilterWidgetIds(definition, widgets = [], getDatasets = () => []) {
  if (!definition?.field || !definition?.dataType) return []
  return widgets.flatMap(widget => {
    const group = widget.type === 'metric-group' || widget.type === 'ranking' && widget.config?.ranking?.mode === 'indicators'
    if (!group && !hasDataBinding(widget)) return []
    const compatible = getDatasets(widget).filter(item => group || item.id === widget.config?.dataBinding?.dataset).some(dataset => {
      const field = resolveGlobalFilterField(definition, dataset.fields || [])
      return field?.filterable && filterValueType(field) === definition.dataType
    })
    return compatible ? [String(widget.id)] : []
  })
}
