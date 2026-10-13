// Member codes remain query keys. Display fields and labels never replace them.
const departmentPairs = [
  ['科室', '科室名称'], ['科室编码', '科室名称'], ['出院科室编码', '出院科室名称'],
  ['OUT_DEPT_CODE', 'OUT_DEPT_NAME'], ['OUT_DEPT_ID', 'OUT_DEPT_NAME'],
  ['DEPARTMENT_CODE', 'DEPARTMENT_NAME'], ['departmentCode', 'departmentName'],
  ['deptCode', 'deptName'], ['outDeptCode', 'outDeptName'], ['department', 'departmentName']
]
const text = value => value == null ? '' : String(value).trim()
export const isMemberName = (value, code) => Boolean(text(value) && text(value) !== text(code) && !/^\d+$/.test(text(value)) && text(value) !== '-')

export function dimensionFieldValue(row, field) {
  for (const values of [row, row?.dimensions, row?.dimensionValues]) {
    const key = Object.keys(values || {}).find(key => key.toLowerCase() === String(field || '').toLowerCase())
    if (key !== undefined && values[key] != null) return values[key]
  }
}

export function isDepartmentLevel(level = {}) {
  return /科室|department|dept/i.test([level.levelName, level.levelCode, level.dimensionFieldCode, level.displayFieldCode].filter(Boolean).join(' '))
}

export function dimensionDisplayFields(paths = []) {
  const pairs = [...departmentPairs, ['医生', '医生名称'], ['医师', '医师名称'], ['MEDICAL_GROUP_CODE', 'MEDICAL_GROUP_NAME'], ['ATTENDING_DOCTOR', 'ATTENDING_DOCTOR_NAME']]
  for (const path of paths) for (const level of path.levels || []) {
    const field = level.memberKeyFieldCode || level.dimensionFieldCode
    if (field && level.displayFieldCode) pairs.push([field, level.displayFieldCode])
    if (level.dimensionFieldCode && level.displayFieldCode) pairs.push([level.dimensionFieldCode, level.displayFieldCode])
  }
  return Object.fromEntries(pairs)
}

function departmentMappings(paths = []) {
  return [...departmentPairs, ...paths.flatMap(path => (path.levels || []).filter(isDepartmentLevel)
    .map(level => [level.memberKeyFieldCode || level.dimensionFieldCode, level.displayFieldCode]).filter(([field]) => field))]
}

export function departmentIdentity(row, paths = []) {
  const mappings = departmentMappings(paths).reverse()
  for (const [field, displayField] of mappings) {
    const code = dimensionFieldValue(row, field)
    if (code === undefined || code === '') continue
    const name = [dimensionFieldValue(row, displayField), row.departmentName, row.deptName,
      ...(text(row.dimensionKey) === text(code) ? [row.dimensionName, row.dimensionLabel] : [])].find(name => isMemberName(name, code))
    return { code: text(code), name: text(name), field, displayField }
  }
  for (const [field, displayField] of mappings) {
    const value = dimensionFieldValue(row, displayField)
    if (/^\d+$/.test(text(value))) return { code: text(value), name: '', field, displayField }
  }
  return { code: '', name: '', field: '', displayField: '' }
}

export function collectDepartmentNames(rows = [], paths = []) {
  const names = new Map()
  for (const row of rows) {
    const { code, name } = departmentIdentity(row, paths)
    if (code && name) names.set(code, name)
  }
  return names
}

export function normalizeDepartmentDataset(dataset, { paths = [], names = new Map(), diagnostics = [] } = {}) {
  if (!dataset) return dataset
  const localNames = collectDepartmentNames(dataset.rows, paths)
  const missing = new Set()
  const rows = (dataset.rows || []).map(row => {
    const { code, name, displayField } = departmentIdentity(row, paths)
    if (!code) return row
    if (name && isMemberName(dimensionFieldValue(row, displayField), code)) return row
    const candidate = name || localNames.get(code) || names.get(code)
    const resolved = isMemberName(candidate, code) ? candidate : ''
    if (!resolved) { missing.add(code); return row }
    const field = Object.keys(row).find(key => key.toLowerCase() === String(displayField).toLowerCase()) || displayField || 'departmentName'
    return { ...row, [field]: resolved }
  })
  const displayFields = { ...dimensionDisplayFields(paths), ...dataset.dimensionDisplayFields }
  const identifiers = new Set([...Object.keys(displayFields), ...Object.values(displayFields)].map(field => String(field).toLowerCase()))
  return {
    ...dataset, rows,
    fields: dataset.fields?.map(field => identifiers.has(String(field.id).toLowerCase()) ? { ...field, semanticType: 'dimension' } : field),
    dimensionDisplayFields: displayFields,
    departmentFields: [...new Set([...departmentMappings(paths).map(([field]) => field), ...(dataset.departmentFields || [])])],
    nameDiagnostics: [...new Set([...diagnostics, ...(missing.size ? [`${missing.size} 个科室未返回名称，暂显示科室编码。`] : [])])]
  }
}

export function visibleDimensionName(row, dimension, dataset = {}) {
  const field = dimension.field
  const raw = dimensionFieldValue(row, field)
  const mapping = { ...dimensionDisplayFields(), ...dataset.dimensionDisplayFields }
  const displayField = dimension.displayField || Object.entries(mapping).find(([key]) => key.toLowerCase() === String(field).toLowerCase())?.[1]
    || (/_CODE$|_ID$/i.test(field) ? field.replace(/_(?:CODE|ID)$/i, '_NAME') : /(?:Code|Id)$/.test(field) ? field.replace(/(?:Code|Id)$/, 'Name') : '')
  const name = dimensionFieldValue(row, displayField)
  if (isMemberName(name, raw)) return name
  if (text(row.dimensionKey) === text(raw)) {
    const label = [row.dimensionName, row.dimensionLabel].find(value => isMemberName(value, raw))
    if (label) return label
  }
  const identity = departmentIdentity(row)
  if (identity.code === text(raw) && identity.name) return identity.name
  const isDepartment = (dataset.departmentFields || []).some(key => key.toLowerCase() === String(field).toLowerCase())
  if ((identity.code === text(raw) && !identity.name || isDepartment) && /^\d+$/.test(text(raw))) return `科室编码：${raw}`
  return raw
}

export function namedDrillRecord(row, level = {}, names = new Map()) {
  const code = text(row.dimensionKey ?? dimensionFieldValue(row, level.memberKeyFieldCode || level.dimensionFieldCode))
  const name = [dimensionFieldValue(row, level.displayFieldCode), row.dimensionName, row.dimensionLabel,
    isDepartmentLevel(level) ? names.get(code) : ''].find(name => isMemberName(name, code))
  return { ...row, dimensionKey: code, dimensionLabel: text(name) || `${level.levelName || (isDepartmentLevel(level) ? '科室' : '成员')}编码：${code}` }
}
