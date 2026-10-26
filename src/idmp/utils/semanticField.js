import { normalizeSemanticFieldBase } from './semanticFieldModel.js'
export const semanticFieldMap = { DEATH_DATETIME: { label: '死亡时间', type: 'DATETIME' }, SURGERY_CODE: { label: '手术编码', type: 'CODE' }, SURGERY_FLAG: { label: '是否发生手术', type: 'CODE' }, SEX: { label: '性别', type: 'CODE' }, DEPT_CODE: { label: '科室', type: 'CODE' }, DIAGNOSTIC_CODE: { label: '疾病编码', type: 'VALUE_SET' } }

export function normalizeSemanticField(item = {}) {
  const base = normalizeSemanticFieldBase(item)
  const code = base.code
  const dataType = String(item.dataType ?? item.fieldType ?? 'STRING').toUpperCase()
  return {
    ...base,
    label: item.displayName || item.label || item.name || semanticFieldMap[code]?.label || code,
    name: item.name || item.displayName || item.label || semanticFieldMap[code]?.label || code,
    dataType, kind: normalizeFieldKind(dataType)
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

