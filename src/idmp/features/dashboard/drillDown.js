import { applyFilters } from './filterEngine.js'

export const DRILLABLE_KINDS = new Set(['bar', 'pie', 'line'])
export function normalizeDrillHierarchy(value) {
  const fields = Array.isArray(value) ? value.filter(field => typeof field === 'string' && field) : []
  return [...new Set(fields)].slice(0, 3)
}
export function resolveDrillHierarchy(value, fields = []) {
  const catalog = new Map((Array.isArray(fields) ? fields : []).map(field => [String(field?.id || '').toLowerCase(), String(field?.id || '')]).filter(([key]) => key))
  const aliases = {
    department: ['department', 'OUT_DEPT_CODE', 'DEPARTMENT_CODE', '科室', '科室编码', 'OUT_DEPT_NAME', '科室名称'],
    medicalgroup: ['medicalGroup', 'MEDICAL_GROUP_CODE', '医疗组', 'MEDICAL_GROUP_NAME', '医疗组名称'],
    doctor: ['doctor', 'ATTENDING_DOCTOR', 'ATTENDING_DOCTOR_CODE', '医生', '医师', 'ATTENDING_DOCTOR_NAME', '医生名称']
  }
  const resolved = normalizeDrillHierarchy(value).flatMap(field => {
    const exact = catalog.get(String(field).toLowerCase())
    if (exact) return [exact]
    return (aliases[String(field).toLowerCase()] || []).map(candidate => catalog.get(candidate.toLowerCase())).filter(Boolean).slice(0, 1)
  })
  return [...new Set(resolved)].slice(0, 3)
}
export function initialDrillState() { return { path: [] } }
// Axis labels may be companion names while branch filters use department codes.
export function resolveDrillClickValue(params, effective, model) {
  const field = effective?.hierarchy?.[effective.path?.length || 0]
  if (!field) return undefined
  const index = params?.dataIndex
  const tuple = params?.data?.dimensionValues || (Number.isInteger(index) ? model?.dimensionTuples?.[index] : null)
  return tuple?.[field] ?? params?.name
}
export function effectiveDrill(widget, dataset, state = initialDrillState()) {
  const hierarchy = resolveDrillHierarchy(widget.config?.interaction?.drill?.hierarchy, dataset?.fields)
  if (!hierarchy.length || !dataset) return { dataset, binding: widget.config?.dataBinding, hierarchy, path: [] }
  const path = (state.path || []).slice(0, Math.max(0, hierarchy.length - 1))
  const conditions = path.map((value, index) => ({ field: hierarchy[index], operator: 'equals', value }))
  const filtered = applyFilters(dataset.rows, conditions, dataset.fields)
  const field = hierarchy[path.length]
  const configured = widget.config.dataBinding?.dimensions?.find(dimension => dimension.field === field)
  const binding = { ...widget.config.dataBinding, dimensions: [{ ...configured, field, displayField: configured?.displayField || dataset.dimensionDisplayFields?.[field] }], series: [], sort: widget.config.dataBinding.sort || [] }
  return { dataset: { ...dataset, rows: filtered.rows, filterDiagnostics: [...(dataset.filterDiagnostics || []), ...filtered.diagnostics] }, binding, hierarchy, path }
}
export function advanceDrill(widget, dataset, state, value) {
  const current = effectiveDrill(widget, dataset, state)
  if (!current.hierarchy.length || current.path.length >= current.hierarchy.length - 1 || value === null || value === undefined) return state
  return { path: [...current.path, value] }
}
export function drillBreadcrumb(state) { return ['全院', ...(state?.path || [])] }
