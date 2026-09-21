import { applyFilters, filterValueType, validateFilterDefinitions } from './filterEngine.js'

// V1 filters the already queried row universe. It never invents an API filter DTO,
// joins datasets, or re-filters an aggregate/preset option.
export function queryWidgetDataset(dataset, widget, definitions = [], runtimeValues = {}) {
  if (!dataset) return dataset
  const conditions = [], diagnostics = []
  const query = widget.config?.query || {}
  if (query.inheritGlobalFilters !== false) for (const def of definitions) {
    if (def.enabled === false || query.ignoredGlobalFilterIds?.includes(def.id)) continue
    if (validateFilterDefinitions([def]).length) { diagnostics.push('全局筛选定义无效'); continue }
    const field = dataset.fields.find(item => item.id === def.field)
    if (!field?.filterable || filterValueType(field) !== def.dataType) continue // incompatible widget, by design
    const value = Object.hasOwn(runtimeValues, def.id) ? runtimeValues[def.id] : def.defaultValue
    if (value === null || value === undefined || value === '' || Array.isArray(value) && !value.length) continue
    conditions.push({ field: def.field, operator: def.type === 'multi-select' ? 'in' : def.type === 'date-range' ? 'between' : 'equals', value })
  }
  const global = applyFilters(dataset.rows, conditions, dataset.fields)
  const component = applyFilters(global.rows, widget.config?.dataBinding?.filters || [], dataset.fields)
  return { ...dataset, rows: component.rows, filterDiagnostics: [...diagnostics, ...global.diagnostics, ...component.diagnostics] }
}

export function queryWidgetDatasetWithRuntime(dataset, widget, { definitions = [], values = {}, interactions = {} } = {}) {
  const filtered = queryWidgetDataset(dataset, widget, definitions, values)
  if (!filtered) return filtered
  const query = widget.config?.query || {}
  if (query.respondToInteractionFilters === false) return filtered
  const conditions = [], diagnostics = [...(filtered.filterDiagnostics || [])]
  for (const interaction of Object.values(interactions)) {
    if (!interaction?.id || query.ignoredInteractionFilterIds?.includes(interaction.id) || !interaction.targetWidgetIds?.includes(String(widget.id))) continue
    const field = filtered.fields.find(item => item.id === interaction.field)
    if (!field?.filterable || interaction.value === null || interaction.value === undefined) continue
    conditions.push({ field: interaction.field, operator: 'equals', value: interaction.value })
  }
  const applied = applyFilters(filtered.rows, conditions, filtered.fields)
  return { ...filtered, rows: applied.rows, filterDiagnostics: [...diagnostics, ...applied.diagnostics] }
}

export function deriveDependentFilterOptions(datasets = [], definitions = [], runtimeValues = {}) {
  const output = new Map()
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]))
  const ancestorsOf = definition => {
    const result = [], seen = new Set()
    const visit = id => {
      if (seen.has(id)) return
      seen.add(id)
      const parent = definitionsById.get(id)
      if (!parent || parent.enabled === false) return
      result.push(parent)
      for (const upstreamId of parent.dependsOn || []) visit(upstreamId)
    }
    for (const id of definition.dependsOn || []) visit(id)
    return result
  }
  for (const definition of definitions) {
    const upstream = ancestorsOf(definition)
    const options = []
    for (const dataset of datasets) {
      if (definition.optionSourceCode && dataset.sourceCode !== definition.optionSourceCode) continue
      const target = dataset.fields.find(field => field.id === definition.field && field.filterable && filterValueType(field) === definition.dataType)
      if (!target) continue
      let canApplyAllParents = true
      const conditions = upstream.flatMap(def => {
        const source = dataset.fields.find(field => field.id === def.field && field.filterable && filterValueType(field) === def.dataType)
        const value = Object.hasOwn(runtimeValues, def.id) ? runtimeValues[def.id] : def.defaultValue
        const hasValue = !(value === null || value === undefined || value === '' || Array.isArray(value) && !value.length)
        // A dataset which can provide child values but cannot apply a selected
        // parent must not leak unscoped options into the dependent control.
        if (!source && hasValue) { canApplyAllParents = false; return [] }
        if (!source || !hasValue) return []
        return [{ field: def.field, operator: def.type === 'multi-select' ? 'in' : def.type === 'date-range' ? 'between' : 'equals', value }]
      })
      if (!canApplyAllParents) continue
      for (const row of applyFilters(dataset.rows, conditions, dataset.fields).rows) {
        const value = row?.[definition.field]
        if ((typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') && value !== '' && !(typeof value === 'number' && !Number.isFinite(value)) && !options.some(item => item === value)) options.push(value)
      }
    }
    output.set(definition.id, options)
  }
  return output
}

export function normalizeDependentFilterValues(definitions = [], values = {}, options = new Map()) {
  const next = { ...values }
  for (const definition of definitions) {
    if (!(definition.dependsOn || []).length) continue
    const allowed = options.get(definition.id) || []
    const value = next[definition.id]
    const valid = Array.isArray(value) ? value.every(item => allowed.includes(item)) : value === null || value === undefined || value === '' || allowed.includes(value)
    if (valid) continue
    const fallback = definition.invalidValueBehavior === 'reset-default' ? definition.defaultValue : definition.type === 'multi-select' ? [] : null
    const fallbackValid = Array.isArray(fallback) ? fallback.every(item => allowed.includes(item)) : fallback === null || allowed.includes(fallback)
    next[definition.id] = fallbackValid ? fallback : definition.type === 'multi-select' ? [] : null
  }
  return next
}

export function dashboardFilterCatalog(datasets) {
  const fields = new Map()
  for (const dataset of datasets) for (const field of dataset.fields) {
    if (!field.filterable) continue
    const previous = fields.get(field.id)
    if (previous && filterValueType(previous) !== filterValueType(field)) { previous.conflict = true; continue }
    if (!previous) fields.set(field.id, { ...field, options: [] })
    const entry = fields.get(field.id)
    for (const row of dataset.rows) {
      const value = row?.[field.id]
      if (['string', 'number', 'boolean'].includes(typeof value) && value !== '' && !(typeof value === 'number' && !Number.isFinite(value)) && !entry.options.some(item => item === value)) entry.options.push(value)
    }
  }
  return [...fields.values()].filter(field => !field.conflict)
}
