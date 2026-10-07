function fieldText(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text.toLowerCase() === 'null' ? '' : text
}

function legacyField(dimensions, field) {
  const key = Object.keys(dimensions || {}).find((key) => key.toLowerCase() === field)
  return fieldText(key == null ? null : dimensions[key])
}

export function normalizeDepartmentComparisons(rows) {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const departmentCode = fieldText(row.departmentCode)
      || legacyField(row.dimensions, 'out_dept_code')
      || legacyField(row.dimensions, 'out_dept_id')
    if (!departmentCode) return []
    const departmentName = fieldText(row.departmentName)
      || legacyField(row.dimensions, 'out_dept_name') || departmentCode
    return [{ ...row, departmentCode, departmentName }]
  })
}
