import { normalizeSemanticField } from '../../utils/semanticField.js'

export function physicalFieldDataType(columnType, fallback = 'STRING') {
  const type = String(columnType || '').trim().toUpperCase().split(/[ (]/)[0]
  if (!type) return fallback
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME'].includes(type)) return 'DATETIME'
  if (['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'BIT'].includes(type)) return 'INTEGER'
  if (['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'].includes(type)) return 'DECIMAL'
  return 'STRING'
}

export function adaptFactorPhysicalFields(mappedFields, sourceFields, { sourceAlias = 'base', sourceName = '', isBase = false } = {}) {
  const columns = new Map(sourceFields.map(field => [field.columnName.toLowerCase(), field]))
  // Only governed fields can be compiled by the ordinary factor DSL endpoint.
  return mappedFields.filter(field => field.sourceFieldName).map(item => {
    const column = columns.get(item.sourceFieldName.toLowerCase())
    const physicalColumn = column?.columnName || item.sourceFieldName
    const field = normalizeSemanticField({
      ...item,
      code: physicalColumn,
      name: item.name || column?.comment || physicalColumn,
      dataType: physicalFieldDataType(column?.columnType, item.dataType)
    })
    return { ...field, semanticFieldCode: item.code, physicalColumn, sourceAlias, sourceName, code: isBase ? physicalColumn : `${sourceAlias}.${physicalColumn}` }
  })
}
