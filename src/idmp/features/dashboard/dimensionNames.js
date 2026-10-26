import { transformResultRows } from './resultRows.js'

// Member codes remain query keys. Display fields and labels never replace them.
export const DEPARTMENT_FIELD_PAIRS = [
  ['科室', '科室名称'], ['科室编码', '科室名称'], ['出院科室编码', '出院科室名称'],
  ['OUT_DEPT_CODE', 'OUT_DEPT_NAME'], ['OUT_DEPT_ID', 'OUT_DEPT_NAME'],
  ['DEPARTMENT_CODE', 'DEPARTMENT_NAME'], ['departmentCode', 'departmentName'],
  ['deptCode', 'deptName'], ['outDeptCode', 'outDeptName'], ['department', 'departmentName'],
  ['IN_DEPT_CODE', 'IN_DEPT_NAME'], ['CHANGE_DEPT_CODE', 'CHANGE_DEPT_NAME'],
  ['DEPT_CODE', 'DEPT_NAME'], ['DEPTCODE', 'DEPTNAME'], ['DEPARTMENTCODE', 'DEPARTMENTNAME'],
  ['INDEPTCODE', 'INDEPTNAME'], ['NOWDEPTCODE', 'NOWDEPTNAME'], ['REG_DEPT_CODE', 'REG_DEPT_NAME'],
  ['COST_DEPT_ID', 'COST_DEPT_NAME'], ['EXEC_DEPT_CODE', 'EXEC_DEPT_NAME']
]
const departmentPairs = DEPARTMENT_FIELD_PAIRS
const text = value => value == null ? '' : String(value).trim()
export const isMemberName = (value, code) => Boolean(text(value) && text(value) !== text(code) && !/^\d+$/.test(text(value)) && text(value) !== '-')

export function dimensionFieldValue(row, field) {
  for (const values of [row, row?.dimensions, row?.dimensionValues]) {
    if (values && Object.hasOwn(values, field) && values[field] != null) return values[field]
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
  return resolveDepartmentIdentity(row, departmentMappings(paths).reverse())
}

function resolveDepartmentIdentity(row, mappings) {
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
  const mappings = departmentMappings(paths).reverse()
  for (const row of rows) {
    const { code, name } = resolveDepartmentIdentity(row, mappings)
    if (code && name) names.set(code, name)
  }
  return names
}

export function normalizeDepartmentDataset(dataset, { paths = [], names = new Map(), diagnostics = [] } = {}) {
  if (!dataset) return dataset
  const missing = new Set()
  const mappings = departmentMappings(paths).reverse()
  const sourceRows = dataset.rows || []
  const rows = transformResultRows(sourceRows, `department:${JSON.stringify([paths, [...names]])}`, () => {
    const localNames = collectDepartmentNames(sourceRows, paths)
    const normalized = sourceRows.map(row => {
      const { code, name, displayField } = resolveDepartmentIdentity(row, mappings)
      if (!code) return row
      const candidate = names.get(code) || name || localNames.get(code)
      if (candidate === dimensionFieldValue(row, displayField)) return row
      const resolved = isMemberName(candidate, code) ? candidate : ''
      if (!resolved) return row
      if (dataset.rowMode === 'PROJECTED') return row
      const field = Object.keys(row).find(key => key.toLowerCase() === String(displayField).toLowerCase()) || displayField || 'departmentName'
      return { ...row, [field]: resolved }
    })
    return normalized.every((row, index) => row === sourceRows[index]) ? sourceRows : normalized
  })
  // PROJECTED 行保留原始身份；诊断同时检查绘图时使用的字典名称。
  for (const row of rows) {
    const { code, name } = resolveDepartmentIdentity(row, mappings)
    if (code && !name && !isMemberName(names.get(code), code)) missing.add(code)
  }
  const displayFields = { ...dimensionDisplayFields(paths), ...dataset.dimensionDisplayFields }
  const identifiers = new Set([...Object.keys(displayFields), ...Object.values(displayFields)].map(field => String(field).toLowerCase()))
  return {
    ...dataset, rows,
    departmentNames: Object.fromEntries(names),
    fields: dataset.fields?.map(field => identifiers.has(String(field.id).toLowerCase()) ? { ...field, semanticType: 'dimension' } : field),
    dimensionDisplayFields: displayFields,
    departmentFields: [...new Set([...departmentMappings(paths).map(([field]) => field), ...(dataset.departmentFields || [])])],
    nameDiagnostics: [...new Set([...diagnostics, ...(missing.size ? [`${missing.size} 个科室未返回名称，暂显示科室编码。`] : [])])]
  }
}

export function visibleDimensionName(row, dimension, dataset = {}) {
  const field = dimension.field
  const raw = dimensionFieldValue(row, field)
  const labels = row.dimensionLabels || {}
  const labelKey = Object.keys(labels).find(key => key.toLowerCase() === String(field).toLowerCase())
  if (labelKey !== undefined) return labels[labelKey]
  const identity = departmentIdentity(row)
  if ([identity.field, identity.displayField].some(key => key && key.toLowerCase() === String(field).toLowerCase())) {
    const dictionaryName = dataset.departmentNames?.[identity.code]
    if (isMemberName(dictionaryName, identity.code)) return dictionaryName
  }
  const mapping = { ...dimensionDisplayFields(), ...dataset.dimensionDisplayFields }
  const displayField = dimension.displayField || Object.entries(mapping).find(([key]) => key.toLowerCase() === String(field).toLowerCase())?.[1]
    || (/_CODE$|_ID$/i.test(field) ? field.replace(/_(?:CODE|ID)$/i, '_NAME') : /(?:Code|Id)$/.test(field) ? field.replace(/(?:Code|Id)$/, 'Name') : '')
  const name = dimensionFieldValue(row, displayField)
  if (isMemberName(name, raw)) return name
  if (text(row.dimensionKey) === text(raw)) {
    const label = [row.dimensionName, row.dimensionLabel].find(value => isMemberName(value, raw))
    if (label) return label
  }
  if (identity.code === text(raw) && identity.name) return identity.name
  const isDepartment = (dataset.departmentFields || []).some(key => key.toLowerCase() === String(field).toLowerCase())
  if ((identity.code === text(raw) && !identity.name || isDepartment) && /^\d+$/.test(text(raw))) return `科室编码：${raw}`
  return raw
}

export function namedDrillRecord(row, level = {}, names = new Map()) {
  const code = text(row.dimensionKey ?? dimensionFieldValue(row, level.memberKeyFieldCode || level.dimensionFieldCode))
  if (row.dimensionLabelSource === 'DICTIONARY') return { ...row, dimensionKey: code, dimensionLabel: text(row.dimensionName) || code }
  const name = [isDepartmentLevel(level) ? names.get(code) : '', dimensionFieldValue(row, level.displayFieldCode),
    row.dimensionName, row.dimensionLabel].find(name => isMemberName(name, code))
  return { ...row, dimensionKey: code, dimensionLabel: text(name) || `${level.levelName || (isDepartmentLevel(level) ? '科室' : '成员')}编码：${code}` }
}
