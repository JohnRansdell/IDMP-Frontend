const TEMPORAL_TYPE = /(?:DATE|TIME|TIMESTAMP)/i
const TEMPORAL_NAME = /(?:^|_)(?:date|datetime|time|timestamp)(?:$|_)/i

export function defaultTimeFieldOptions(mappedFields = [], sourceFields = [], currentCode = '') {
  const sources = new Map(sourceFields.map(field => [String(field.columnName || '').toLowerCase(), field]))
  return mappedFields.filter(field => {
    if (!field.code) return false
    if (field.code === currentCode) return true
    if (!field.sourceFieldName) return false
    const source = sources.get(String(field.sourceFieldName).toLowerCase())
    if (!source) return false
    if (['DATE', 'DATETIME'].includes(String(field.dataType || '').toUpperCase())) return true
    return TEMPORAL_TYPE.test(String(source.columnType || ''))
      || TEMPORAL_NAME.test(String(source.columnName || ''))
  }).map(field => {
    const source = sources.get(String(field.sourceFieldName).toLowerCase())
    const textDate = Boolean(source) && !TEMPORAL_TYPE.test(String(source.columnType || ''))
    return { ...field, timeFieldHint: textDate ? '所选字段的源列是文本，请确认时间值格式一致。' : '' }
  })
}

export function applySemanticFieldDetails(mappedFields, detailsById) {
  return mappedFields.map(field => {
    const detail = detailsById.get(field.id)
    return detail ? {
      ...field,
      dataType: detail.valueType || field.dataType,
      sourceDataType: detail.sourceDataType || field.sourceDataType,
      conversionFormat: detail.conversionFormat || field.conversionFormat,
      semanticKind: String(detail.semanticKind || field.semanticKind || '').toUpperCase(),
      sensitive: detail.sensitivityLevel ? detail.sensitivityLevel !== 'NONE' : field.sensitive
    } : field
  })
}
