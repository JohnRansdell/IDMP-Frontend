import { hasDataBinding } from './bindingEngine.js'
import { filterValueType } from './filterEngine.js'

// A widget is globally filterable only through its bound raw dataset. Preset
// presentation data is deliberately excluded because it has no row-level field contract.
export function resolveCompatibleGlobalFilterWidgetIds(definition, widgets = [], getDatasets = () => []) {
  if (!definition?.field || !definition?.dataType) return []
  return widgets.flatMap(widget => {
    if (!hasDataBinding(widget)) return []
    const dataset = getDatasets(widget).find(item => item.id === widget.config?.dataBinding?.dataset)
    const field = dataset?.fields?.find(item => item.id === definition.field)
    return field?.filterable && filterValueType(field) === definition.dataType ? [String(widget.id)] : []
  })
}
