import { DEPARTMENT_FIELD_PAIRS, isDepartmentLevel } from './dimensionNames.js'

const key = field => String(field?.code || field?.id || '').toLowerCase()
const match = (fields, name) => fields.find(field => key(field) === String(name || '').toLowerCase())
const pairs = paths => [
  ...paths.flatMap(path => (path.levels || []).filter(isDepartmentLevel).map(level => [
    level.memberKeyFieldCode || level.dimensionFieldCode, level.displayFieldCode
  ]).filter(([code]) => code)),
  ...DEPARTMENT_FIELD_PAIRS
]

// Only declared organization paths and explicit department contracts identify a code/name pair.
// A translated display label alone must never make two unrelated dimensions equivalent.
export function annotateDepartmentFilterFields(fields = [], paths = []) {
  const pair = pairs(paths).find(([code]) => match(fields, code)?.filterable)
  if (!pair) return fields
  const codeField = match(fields, pair[0])
  const nameField = match(fields, pair[1])
  return fields.map(field => field === codeField || field === nameField ? {
    ...field, departmentCodeField: codeField.code || codeField.id,
    departmentNameField: nameField?.code || nameField?.id || pair[1] || ''
  } : field)
}

export function isDepartmentFilterField(name, fields = []) {
  const lower = String(name || '').toLowerCase()
  return DEPARTMENT_FIELD_PAIRS.some(pair => pair.some(value => value.toLowerCase() === lower))
    || Boolean(match(fields, name)?.departmentCodeField)
}

export function departmentFilterBinding(fields = []) {
  const annotated = fields.find(field => field.departmentCodeField && match(fields, field.departmentCodeField)?.filterable)
  if (annotated) return { codeField: annotated.departmentCodeField, nameField: annotated.departmentNameField || '' }
  const pair = DEPARTMENT_FIELD_PAIRS.find(([code]) => match(fields, code)?.filterable)
  return pair ? { codeField: match(fields, pair[0]).code || match(fields, pair[0]).id, nameField: match(fields, pair[1])?.code || match(fields, pair[1])?.id || pair[1] } : null
}

export function resolveGlobalFilterField(definition, fields = []) {
  if (isDepartmentFilterField(definition?.field, fields)) {
    const binding = departmentFilterBinding(fields)
    return binding ? match(fields, binding.codeField) : undefined
  }
  return match(fields, definition?.field)
}

export function departmentCodeOptions(options = [], names = new Map()) {
  const named = options.map(option => {
    const value = String(option?.value ?? option)
    const supplied = option?.label && String(option.label) !== value ? String(option.label) : ''
    return { value, label: names.get(value) || supplied || `未提供名称（科室编码：${value}）` }
  })
  const codesByName = new Map()
  for (const option of named) codesByName.set(option.label, new Set([...(codesByName.get(option.label) || []), option.value]))
  return named.map(option => codesByName.get(option.label).size > 1 ? { ...option, label: `${option.label}（${option.value}）` } : option)
}

export function departmentSelectionCodes(value, options = []) {
  const convert = item => {
    if (options.some(option => String(option.value) === String(item))) return String(item)
    const matches = options.filter(option => option.label === String(item))
    if (matches.length === 1) return matches[0].value
    return item
  }
  return Array.isArray(value) ? value.map(convert) : value == null || value === '' ? value : convert(value)
}

export async function loadDepartmentCodeOptions({ fields, fetchDictionary }) {
  const binding = departmentFilterBinding(fields)
  if (!binding) throw new Error('当前数据源没有可用的科室编码字段')
  const entries = await fetchDictionary()
  return departmentCodeOptions(entries.map(entry => ({ value: entry.code, label: entry.name })))
}
