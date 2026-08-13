export const semanticFieldMap = { DEATH_DATETIME: { label: '死亡时间', type: 'DATETIME' }, SURGERY_CODE: { label: '手术编码', type: 'CODE' }, SURGERY_FLAG: { label: '是否发生手术', type: 'CODE' }, SEX: { label: '性别', type: 'CODE' }, DEPT_CODE: { label: '科室', type: 'CODE' }, DIAGNOSTIC_CODE: { label: '疾病编码', type: 'VALUE_SET' } }

export function normalizeSemanticField(item = {}) {
  const code = item.code ?? item.fieldCode
  const dataType = String(item.dataType ?? item.fieldType ?? 'STRING').toUpperCase()
  return {
    code,
    label: item.displayName || item.label || item.name || semanticFieldMap[code]?.label || code,
    dataType,
    kind: normalizeFieldKind(dataType),
    options: item.options || item.values || item.enumValues || [],
    semanticRole: item.semanticRole || item.role || '',
    groupable: item.groupable,
    aggregatable: item.aggregatable,
    filterable: item.filterable,
    sensitive: item.sensitive === true || item.sensitive === 1 || item.sensitive === '1' || item.sensitive === 'true',
    sourceFieldName: item.sourceFieldName || item.sourceField || item.columnName || ''
  }
}

export function normalizeFieldKind(dataType = '') {
  const type = String(dataType).toUpperCase()
  if (type.includes('DATE') || type.includes('TIME')) return 'DATETIME'
  if (type.includes('VALUE_SET')) return 'VALUE_SET'
  if (type.includes('CODE') || type.includes('ENUM')) return 'CODE'
  if (['INTEGER', 'NUMBER', 'DECIMAL', 'LONG', 'DOUBLE'].includes(type)) return 'NUMBER'
  return 'STRING'
}

export function fieldByCode(fields = [], code) {
  return fields.find((field) => field.code === code)
}

