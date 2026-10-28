export function templateFieldOptions(definition, sourceFields = []) {
  const baseAlias = definition?.primaryDomain?.sourceAlias || 'base'
  const options = new Map()
  for (const field of sourceFields) {
    const reference = field.fieldReference || field.code
    if (!reference) continue
    const value = reference.startsWith(baseAlias + '.') ? reference.slice(baseAlias.length + 1) : reference
    options.set(value, { value, label: field.label || `${field.tableName || field.sourceName || baseAlias}.${field.columnName || field.physicalColumn || value}（${field.dataType || '字段'}）`, dataType: field.dataType })
  }
  return [...options.values()]
}

export function fieldOptionsForParameter(options, definition, code, allowedValues = []) {
  const baseAlias = definition?.primaryDomain?.sourceAlias || 'base'
  const allowed = allowedValues.map(value => typeof value === 'string' && value.startsWith(baseAlias + '.') ? value.slice(baseAlias.length + 1) : value)
  const reference = definition?.aggregation?.fieldRef || definition?.aggregation?.fieldCode
  const parameter = typeof reference === 'string' ? reference === '${' + code + '}' : reference?.parameterRef?.toUpperCase() === code.toUpperCase()
  const aggregate = parameter ? definition.aggregation.function : ''
  return options.filter(option => {
    if (allowed.length && !allowed.includes(option.value)) return false
    const numeric = ['INTEGER', 'DECIMAL', 'NUMBER', 'INT', 'BIGINT', 'DOUBLE', 'FLOAT'].includes(String(option.dataType).toUpperCase())
    const temporal = ['DATE', 'DATETIME', 'TIMESTAMP'].includes(String(option.dataType).toUpperCase())
    return ['SUM', 'AVG'].includes(aggregate) ? numeric : ['MIN', 'MAX'].includes(aggregate) ? numeric || temporal : true
  })
}

export function templateParameterFields(schema, metadata, definition) {
  const required = new Set(schema.required || [])
  const options = templateFieldOptions(definition, schema['x-fieldOptions'] || [])
  return Object.entries(schema.properties || {}).flatMap(([code, property]) => {
    const meta = metadata.find(item => item.code === code) || {}
    if (meta.exposed === false || property['x-exposed'] === false) return []
    const isField = String(property['x-dataType'] || meta.dataType).toUpperCase() === 'FIELD_REF'
    const enumValues = property.enum || meta.validation?.enum || meta.validation?.allowedValues || []
    const defaultValue = property.default ?? meta.defaultValue
    const baseAlias = definition?.primaryDomain?.sourceAlias || 'base'
    return [{ code, label: property.title || meta.displayName || code, description: property.description || meta.description || '',
      type: property.type || meta.dataType?.toLowerCase() || 'string', isField, enumValues,
      fieldOptions: isField ? fieldOptionsForParameter(options, definition, code, enumValues) : [],
      defaultValue: isField && typeof defaultValue === 'string' && defaultValue.startsWith(baseAlias + '.') ? defaultValue.slice(baseAlias.length + 1) : defaultValue,
      required: required.has(code) || meta.required === true, options: meta.options || [],
      placeholder: property.placeholder || `请输入${property.title || meta.displayName || code}` }]
  })
}
