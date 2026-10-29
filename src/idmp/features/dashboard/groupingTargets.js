const key = value => String(value || '').toUpperCase()
const isTime = field => field?.semanticType === 'time'

export function selectedGroupingTarget(binding, targets = [], fields = []) {
  const catalog = new Map(fields.map(field => [field.id, field]))
  const dimensions = [...(binding.dimensions || []), ...(binding.series || [])]
    .filter(item => !isTime(catalog.get(item.field))).map(item => key(item.field))
  return targets.find(target => {
    const normalized = new Set(dimensions.map(field => key(target.aliases?.[field] || field)))
    return normalized.size === target.fields.length && target.fields.every(field => normalized.has(key(field)))
  })?.code || ''
}

export function bindGroupingTarget(binding, target, fields = []) {
  const catalog = new Map(fields.map(field => [key(field.id), field]))
  const time = (binding.dimensions || []).filter(item => isTime(catalog.get(key(item.field))))
  const dimensions = target.fields.map(code => {
    const field = catalog.get(key(code))
    return { field: field?.id || code, label: field?.label || code }
  })
  const next = { ...binding, groupingTarget: target.code, dimensions: [...time, ...dimensions], series: [], sort: [] }
  return next
}
