export function sqlFactorSource(draft = {}) {
  const source = draft.dsl?.importSource || {}
  return [source.cte, source.column].filter(Boolean).join('.')
}

export function sqlFactorLabel(factor = {}, draft = {}) {
  return [factor.name, factor.factorName, draft.suggestedName, sqlFactorSource(draft)]
    .map(value => String(value || '').trim()).find(Boolean)
    || (draft.outputAlias !== draft.key ? draft.outputAlias : '')
    || '未命名因子'
}

export function sqlFactorSourceLabel(draft = {}) {
  const source = sqlFactorSource(draft)
  if (source) return `${draft.dsl?.importSource?.cte ? 'CTE 输出' : '查询输出'}：${source}`
  return draft.outputAlias && draft.outputAlias !== draft.key ? `查询输出：${draft.outputAlias}` : ''
}

export function sqlPhysicalFieldName(field = {}) {
  const table = String(field.physicalTable || '').trim()
  const column = String(field.columnName || field.fieldReference || '').split('.').at(-1).trim()
  return table && column ? `${table}.${column}` : column
}

export function sqlPhysicalFieldLabel(field, options = []) {
  const name = sqlPhysicalFieldName(field)
  // A self-JOIN can expose one physical field through multiple SQL sources.
  // Keep the selection distinct without replacing the visible real table name.
  const sources = [...new Set(options.filter(item => sqlPhysicalFieldName(item) === name)
    .map(item => item.fieldReference).filter(Boolean))]
  const reference = sources.length > 1 ? `${name}（来源 ${sources.indexOf(field.fieldReference) + 1}）` : name
  return [reference, field.columnType, field.comment].filter(Boolean).join(' · ')
}

const timeFieldReasons = {
  SQL_PERIOD_PREDICATE: '原 SQL 中此字段已有日期条件，原条件仍会保留',
  SOURCE_TIME_TYPE: '源字段为日期时间类型',
  SOURCE_VALUE_PROFILE_ISO_DATE_TIME: '已抽样确认源字段包含有效日期时间',
  SOURCE_VALUE_VALIDATION_REQUIRED: '确认时将检查此字段的值能否作为日期时间使用',
}

export function sqlTimeFieldDescription(option = {}) {
  const reasons = (option.recommendationReasons || []).map(reason => timeFieldReasons[reason]).filter(Boolean)
  return reasons.join('；') || (option.recommended
    ? '推荐时间字段，请确认符合本次统计口径。'
    : '所选字段须属于 SQL 使用的表，并包含有效日期或时间。')
}
