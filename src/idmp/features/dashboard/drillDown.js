import { applyFilters } from './filterEngine.js'

export const DRILLABLE_KINDS = new Set(['bar', 'pie', 'line'])
export function normalizeDrillHierarchy(value) {
  const fields = Array.isArray(value) ? value.filter(field => typeof field === 'string' && field) : []
  return [...new Set(fields)].slice(0, 3)
}
export function resolveDrillHierarchy(value, fields = []) {
  const catalog = new Map((Array.isArray(fields) ? fields : []).map(field => [String(field?.id || '').toLowerCase(), String(field?.id || '')]).filter(([key]) => key))
  const aliases = {
    department: ['department', 'OUT_DEPT_CODE', 'DEPARTMENT_CODE', 'OUT_DEPT_NAME'],
    medicalgroup: ['medicalGroup', 'MEDICAL_GROUP_CODE', 'MEDICAL_GROUP_NAME'],
    doctor: ['doctor', 'ATTENDING_DOCTOR', 'ATTENDING_DOCTOR_CODE', 'ATTENDING_DOCTOR_NAME']
  }
  const resolved = normalizeDrillHierarchy(value).flatMap(field => {
    const exact = catalog.get(String(field).toLowerCase())
    if (exact) return [exact]
    return (aliases[String(field).toLowerCase()] || []).map(candidate => catalog.get(candidate.toLowerCase())).filter(Boolean).slice(0, 1)
  })
  return [...new Set(resolved)].slice(0, 3)
}
export function initialDrillState() { return { path: [] } }
export function effectiveDrill(widget, dataset, state = initialDrillState()) {
  const hierarchy = resolveDrillHierarchy(widget.config?.interaction?.drill?.hierarchy, dataset?.fields)
  if (!hierarchy.length || !dataset) return { dataset, binding: widget.config?.dataBinding, hierarchy, path: [] }
  const path = (state.path || []).slice(0, Math.max(0, hierarchy.length - 1))
  const conditions = path.map((value, index) => ({ field: hierarchy[index], operator: 'equals', value }))
  const filtered = applyFilters(dataset.rows, conditions, dataset.fields)
  const binding = { ...widget.config.dataBinding, dimensions: [{ field: hierarchy[path.length] }], series: [], sort: widget.config.dataBinding.sort || [] }
  return { dataset: { ...dataset, rows: filtered.rows, filterDiagnostics: [...(dataset.filterDiagnostics || []), ...filtered.diagnostics] }, binding, hierarchy, path }
}
export function advanceDrill(widget, dataset, state, value) {
  const current = effectiveDrill(widget, dataset, state)
  if (!current.hierarchy.length || current.path.length >= current.hierarchy.length - 1 || value === null || value === undefined) return state
  return { path: [...current.path, value] }
}
export function drillBreadcrumb(state) { return ['全院', ...(state?.path || [])] }
