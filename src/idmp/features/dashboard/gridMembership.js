export function gridWidgetId(id) {
  return (typeof id === 'string' && id.trim() || typeof id === 'number' && Number.isFinite(id)) ? String(id) : null
}
export function compareDashboardGridMembership(schema, layout = []) {
  const describe = items => {
    const ids = items.map(item => gridWidgetId(item?.id))
    const seen = new Set(), duplicates = new Set()
    ids.forEach(id => { if (id !== null && seen.has(id)) duplicates.add(id); seen.add(id) })
    return { ids, duplicates: [...duplicates], invalid: ids.flatMap((id, index) => id === null ? [index] : []) }
  }
  const left = describe(Array.isArray(schema) ? schema : schema?.widgets || [])
  const right = describe(layout)
  const missingInGrid = [...new Set(left.ids.filter(id => id !== null && !right.ids.includes(id)))]
  const extraInGrid = [...new Set(right.ids.filter(id => id !== null && !left.ids.includes(id)))]
  return {
    valid: !missingInGrid.length && !extraInGrid.length && !left.duplicates.length && !right.duplicates.length && !left.invalid.length && !right.invalid.length,
    schemaWidgetCount: left.ids.length, gridStackNodeCount: right.ids.length,
    schemaIds: left.ids, gridIds: right.ids, missingInGrid, extraInGrid,
    duplicateSchemaIds: left.duplicates, duplicateGridIds: right.duplicates,
    invalidSchemaIdIndexes: left.invalid, invalidGridIdIndexes: right.invalid
  }
}
