import { normalizeSemanticField } from '../../utils/semanticField.js'

export function physicalFieldDataType(columnType, fallback = 'STRING') {
  const type = String(columnType || '').trim().toUpperCase().split(/[ (]/)[0]
  if (!type) return fallback
  if (['DATE', 'DATETIME', 'TIMESTAMP'].includes(type)) return 'DATETIME'
  if (['TINYINT', 'SMALLINT', 'MEDIUMINT', 'INT', 'INTEGER', 'BIGINT', 'BIT'].includes(type)) return 'INTEGER'
  if (['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE', 'REAL'].includes(type)) return 'DECIMAL'
  return 'STRING'
}

export function isFactorPeriodField(field) {
  return ['DATE', 'DATETIME', 'TIMESTAMP'].includes(String(field.dataType || '').toUpperCase()) || field.periodCandidate === true
}

export function adaptFactorPhysicalFields(mappedFields, sourceFields, { sourceAlias = 'base', sourceName = '', isBase = false, timeFieldOptions = [] } = {}) {
  const columns = new Map(sourceFields.map(field => [field.columnName.toLowerCase(), field]))
  const timeOptions = new Map(timeFieldOptions.map(field => [field.columnName.toLowerCase(), field]))
  // 普通 DSL 仍只展示已接入字段；候选标记仅用于选择周期，不修改业务字段类型。
  return mappedFields.filter(field => field.sourceFieldName).map(item => {
    const column = columns.get(item.sourceFieldName.toLowerCase())
    const physicalColumn = column?.columnName || item.sourceFieldName
    const field = normalizeSemanticField({
      ...item,
      code: physicalColumn,
      name: item.name || column?.comment || physicalColumn,
      dataType: item.sourceDataType ? item.dataType : physicalFieldDataType(column?.columnType, item.dataType)
    })
    const timeOption = timeOptions.get(physicalColumn.toLowerCase())
    return { ...field, semanticFieldCode: item.code, physicalColumn, sourceAlias, sourceName,
      periodCandidate: Boolean(timeOption), periodRequiresConfirmation: timeOption?.requiresConfirmation === true,
      code: isBase ? physicalColumn : `${sourceAlias}.${physicalColumn}` }
  })
}
