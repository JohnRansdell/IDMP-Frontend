import { resolveGlobalFilterField } from './departmentFilters.js'
import { unknownMemberName } from './dimensionNames.js'

export const MORTALITY_SOURCE = 'DASHBOARD_INPATIENT_MORTALITY_20260928'
export function departmentFilterOptions(options = [], rows = []) {
  const names = new Map(rows.map(row => [String(row.OUT_DEPT_CODE ?? row.out_dept_code ?? ''), row.OUT_DEPT_NAME ?? row.out_dept_name]).filter(([code, name]) => code && name))
  return options.map(option => ({ value: option.value, label: names.get(String(option.value)) || (option.label && String(option.label) !== String(option.value) ? option.label : unknownMemberName({ levelCode: 'DEPARTMENT' }, option.value)) }))
}
export function formalFiltersForWidget(widget, definitions = [], values = {}, catalogs = {}) {
  const query = widget.config?.query || {}
  if (query.inheritGlobalFilters === false) return {}
  const fields = catalogs[widget.sourceCode] || []
  return Object.fromEntries(definitions.flatMap(def => {
    const field = resolveGlobalFilterField(def, fields)
    if (def.enabled === false || query.ignoredGlobalFilterIds?.includes(def.id) || !field?.filterable) return []
    const value = Object.hasOwn(values, def.id) ? values[def.id] : def.defaultValue
    return value === null || value === undefined || value === '' || Array.isArray(value) && !value.length ? [] : [[field.code || field.id, value]]
  }))
}
