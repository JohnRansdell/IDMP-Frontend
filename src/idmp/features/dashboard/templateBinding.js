import { bindingKind } from './bindingEngine.js'
import { createDefaultBinding } from './smartDefaultBinding.js'

export function singleIndicatorTemplatePlan(widget, datasets) {
  const slot = widget.config?.templateSlot
  if (!slot) return null
  const kind = slot.binding === 'period' ? slot.visualType || (widget.type === 'chart' ? bindingKind(widget) : 'line') : bindingKind(widget)
  const timeAvailable = datasets.some(dataset => dataset.fields?.some(field => field.semanticType === 'time'))
  const useKpi = slot.binding === 'period' && !timeAvailable
  const binding = createDefaultBinding(useKpi ? 'kpi' : kind, datasets, { preferTime: slot.binding === 'period' })
  return { type: useKpi ? 'kpi' : slot.binding === 'period' ? 'chart' : widget.type, chartKind: useKpi ? undefined : slot.binding === 'period' ? kind : widget.chartKind, visualType: useKpi ? 'kpi' : kind, binding, fallback: useKpi }
}
