export const filterOptionValue = option => option && typeof option === 'object' && Object.hasOwn(option, 'value') ? option.value : option
export const filterOptionLabel = option => String(option && typeof option === 'object' && Object.hasOwn(option, 'label') ? option.label : filterOptionValue(option))
export function filterValueLabel(value, options = []) {
  if (Array.isArray(value)) return value.map(item => filterValueLabel(item, options)).join('、')
  const option = options.find(item => filterOptionValue(item) === value)
  return option === undefined ? String(value ?? '') : filterOptionLabel(option)
}
