const CONFLICT_CODES = {
  'FACTOR-40901': 'factor',
  'INDICATOR-40901': 'indicator'
}

export function resolveResourceConflict(error) {
  const type = CONFLICT_CODES[String(error?.code || '').toUpperCase()]
  const resource = error?.payload?.data
  if (!type || !resource || typeof resource !== 'object') return null
  return {
    type,
    resource: {
      ...resource,
      id: resource.id == null ? '' : String(resource.id),
      code: String(resource.code || resource.factorCode || resource.indicatorCode || ''),
      name: String(resource.name || resource.factorName || resource.indicatorName || ''),
      status: String(resource.status || ''),
      category: resource.category == null ? null : String(resource.category)
    }
  }
}

export function resourceConflictEditorPath(conflict) {
  if (!conflict?.resource?.id) return ''
  return conflict.type === 'factor'
    ? `/factor/edit/${encodeURIComponent(conflict.resource.id)}`
    : conflict.type === 'indicator'
      ? `/indicator/edit/${encodeURIComponent(conflict.resource.id)}`
      : ''
}
