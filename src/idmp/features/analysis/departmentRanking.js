function fieldText(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text.toLowerCase() === 'null' ? '' : text
}

function legacyField(dimensions, field) {
  const key = Object.keys(dimensions || {}).find((key) => key.toLowerCase() === field)
  return fieldText(key == null ? null : dimensions[key])
}

export function normalizeDepartmentComparisons(rows, dimensionRows = [], namesByCode = {}) {
  const directRows = Array.isArray(rows) ? rows : []
  const fallbackRows = Array.isArray(dimensionRows) ? dimensionRows : []
  const normalize = (items) => items.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const departmentCode = fieldText(row.departmentCode)
      || legacyField(row.dimensions, 'out_dept_code')
      || legacyField(row.dimensions, 'out_dept_id')
    if (!departmentCode) return []
    const departmentName = fieldText(row.departmentName)
      || legacyField(row.dimensions, 'out_dept_name')
      || fieldText(namesByCode[departmentCode]) || departmentCode
    return [{ ...row, departmentCode, departmentName }]
  })
  const normalizedDirect = normalize(directRows)
  return normalizedDirect.length ? normalizedDirect : normalize(fallbackRows)
}
