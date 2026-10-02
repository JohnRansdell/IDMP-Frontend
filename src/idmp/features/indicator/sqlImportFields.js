export function sqlPhysicalFieldName(field = {}) {
  const table = String(field.physicalTable || '').trim()
  const column = String(field.columnName || field.fieldReference || '').split('.').at(-1).trim()
  return table && column ? `${table}.${column}` : column
}

export function sqlPhysicalFieldLabel(field, options = []) {
  const name = sqlPhysicalFieldName(field)
  // A self-JOIN can expose one physical field through multiple SQL sources.
  // Keep the selection distinct without replacing the visible real table name.
  const sources = [...new Set(options.filter(item => sqlPhysicalFieldName(item) === name)
    .map(item => item.fieldReference).filter(Boolean))]
  const reference = sources.length > 1 ? `${name}（来源 ${sources.indexOf(field.fieldReference) + 1}）` : name
  return [reference, field.columnType, field.comment].filter(Boolean).join(' · ')
}
