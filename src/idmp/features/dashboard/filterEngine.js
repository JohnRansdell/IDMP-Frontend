import { numericValue } from './fieldCatalog.js'

export const FILTER_TYPES = ['select', 'multi-select', 'date-range']
export const FILTER_OPERATORS = {
  string: ['equals', 'notEquals', 'in', 'notIn', 'isEmpty', 'isNotEmpty'],
  boolean: ['equals', 'notEquals', 'in', 'notIn', 'isEmpty', 'isNotEmpty'],
  number: ['equals', 'gt', 'gte', 'lt', 'lte', 'between', 'isEmpty', 'isNotEmpty'],
  date: ['equals', 'before', 'after', 'between', 'in', 'notIn', 'isEmpty', 'isNotEmpty']
}
export const filterValueType = field => field?.filterDataType || field?.dataType
const scalar = value => value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)
const record = value => value && typeof value === 'object' && !Array.isArray(value)
const empty = value => value === null || value === undefined || value === ''
export const copyFilterValue = value => Array.isArray(value) ? [...value] : value
export function initialFilterValues(definitions = []) {
  return Object.fromEntries(definitions.map(def => [def.id, copyFilterValue(def.defaultValue)]))
}
export function dateValue(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null
}
function normalized(value, type) {
  if (empty(value)) return null
  if (type === 'number') return numericValue(value)
  if (type === 'date') return dateValue(value)
  if (type === 'boolean') return typeof value === 'boolean' ? value : null
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}
export function validateConditions(conditions = []) {
  if (!Array.isArray(conditions)) return ['filters 必须是数组']
  return conditions.flatMap((condition, index) => {
    if (!record(condition) || typeof condition.field !== 'string' || !condition.field.trim() || !Object.values(FILTER_OPERATORS).some(list => list.includes(condition.operator))) return [`筛选条件 ${index + 1} 无效`]
    if (Object.keys(condition).some(key => !['field', 'operator', 'value'].includes(key))) return [`筛选条件 ${index + 1} 包含未知属性`]
    if (['isEmpty', 'isNotEmpty'].includes(condition.operator)) return []
    if (['in', 'notIn', 'between'].includes(condition.operator)) return !Array.isArray(condition.value) || condition.value.some(value => !scalar(value) || value === null) || condition.operator === 'between' && condition.value.length !== 2 ? [`筛选条件 ${index + 1} 值无效`] : []
    return !scalar(condition.value) || condition.value === null ? [`筛选条件 ${index + 1} 值无效`] : []
  })
}
export function validateFilterDefinitions(definitions = []) {
  if (!Array.isArray(definitions)) return ['globalFilters 必须是数组']
  const seen = new Set()
  return definitions.flatMap(def => {
    if (!record(def)) return ['全局筛选器必须是对象']
    const errors = []
    if (typeof def.id !== 'string' || !def.id.trim() || seen.has(def.id)) errors.push('筛选器 ID 缺失或重复')
    seen.add(def.id)
    if (typeof def.label !== 'string' || typeof def.field !== 'string' || !def.field.trim()) errors.push('筛选器名称或字段无效')
    if (!FILTER_TYPES.includes(def.type) || !Object.hasOwn(FILTER_OPERATORS, def.dataType) || typeof def.enabled !== 'boolean') errors.push('筛选器类型无效')
    if (Object.keys(def).some(key => !['id', 'label', 'field', 'type', 'dataType', 'enabled', 'defaultValue', 'dependsOn', 'invalidValueBehavior', 'optionSourceCode'].includes(key))) errors.push('筛选定义包含非持久化属性')
    if (def.defaultValue !== null) {
      if (def.type === 'multi-select') {
        if (!Array.isArray(def.defaultValue) || def.defaultValue.some(value => normalized(value, def.dataType) === null)) errors.push('多选默认值无效')
      } else if (def.type === 'date-range') {
        if (def.dataType !== 'date' || !Array.isArray(def.defaultValue) || def.defaultValue.length !== 2 || def.defaultValue.some(value => dateValue(value) === null) || def.defaultValue[0] > def.defaultValue[1]) errors.push('日期范围默认值无效')
      } else if (normalized(def.defaultValue, def.dataType) === null) errors.push('默认值无效')
    }
    if (def.type === 'date-range' && def.dataType !== 'date') errors.push('日期范围需要日期字段')
    if (def.dependsOn !== undefined && (!Array.isArray(def.dependsOn) || def.dependsOn.some(id => typeof id !== 'string' || !id.trim() || id === def.id) || new Set(def.dependsOn).size !== def.dependsOn.length)) errors.push('筛选器依赖无效')
    if (def.invalidValueBehavior !== undefined && !['clear', 'reset-default'].includes(def.invalidValueBehavior)) errors.push('失效值处理无效')
    if (def.optionSourceCode !== undefined && (typeof def.optionSourceCode !== 'string' || !def.optionSourceCode.trim())) errors.push('候选数据来源无效')
    return errors
  })
}
export function validateWidgetQuery(query) {
  if (query === undefined) return []
  if (!record(query)) return ['config.query 必须是对象']
  const errors = []
  if (Object.keys(query).some(key => !['inheritGlobalFilters', 'ignoredGlobalFilterIds', 'respondToInteractionFilters', 'ignoredInteractionFilterIds'].includes(key))) errors.push('query 包含未知属性')
  if (query.inheritGlobalFilters !== undefined && typeof query.inheritGlobalFilters !== 'boolean') errors.push('继承全局筛选必须是布尔值')
  if (query.ignoredGlobalFilterIds !== undefined && (!Array.isArray(query.ignoredGlobalFilterIds) || query.ignoredGlobalFilterIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(query.ignoredGlobalFilterIds).size !== query.ignoredGlobalFilterIds.length)) errors.push('忽略筛选器 ID 无效')
  if (query.respondToInteractionFilters !== undefined && typeof query.respondToInteractionFilters !== 'boolean') errors.push('响应图表筛选必须是布尔值')
  if (query.ignoredInteractionFilterIds !== undefined && (!Array.isArray(query.ignoredInteractionFilterIds) || query.ignoredInteractionFilterIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(query.ignoredInteractionFilterIds).size !== query.ignoredInteractionFilterIds.length)) errors.push('忽略交互筛选 ID 无效')
  return errors
}
export function validateWidgetInteraction(interaction) {
  if (interaction === undefined) return []
  if (!record(interaction)) return ['config.interaction 必须是对象']
  if (Object.keys(interaction).some(key => !['clickAction', 'clickFilter', 'drill'].includes(key))) return ['interaction 包含未知属性']
  if (interaction.clickAction !== undefined && !['none', 'cross-filter', 'drill'].includes(interaction.clickAction)) return ['点击行为无效']
  const click = interaction.clickFilter
  if (click !== undefined && (!record(click) || Object.keys(click).some(key => !['enabled', 'field', 'targetWidgetIds'].includes(key)) || typeof click.enabled !== 'boolean' || typeof click.field !== 'string' || !click.field.trim() || !Array.isArray(click.targetWidgetIds) || click.targetWidgetIds.some(id => typeof id !== 'string' || !id.trim()) || new Set(click.targetWidgetIds).size !== click.targetWidgetIds.length)) return ['点击筛选配置无效']
  const drill = interaction.drill
  if (drill !== undefined && (!record(drill) || Object.keys(drill).some(key => key !== 'hierarchy') || !Array.isArray(drill.hierarchy) || drill.hierarchy.length < 2 || drill.hierarchy.length > 3 || drill.hierarchy.some(field => typeof field !== 'string' || !field.trim()) || new Set(drill.hierarchy).size !== drill.hierarchy.length)) return ['下钻配置无效']
  return []
}
export function applyFilters(rows, conditions, fields) {
  const diagnostics = [], predicates = []
  if (!Array.isArray(conditions)) return { rows, diagnostics: ['筛选条件结构无效'] }
  for (const condition of conditions) {
    const field = fields.find(item => item.id === condition?.field)
    const type = filterValueType(field)
    if (!field?.filterable || !FILTER_OPERATORS[type]?.includes(condition?.operator) || validateConditions([condition]).length) { diagnostics.push(`字段不可用或条件无效：${condition?.field || '未知'}`); continue }
    const { operator, value } = condition
    const values = (Array.isArray(value) ? value : [value]).map(item => normalized(item, type))
    if (!['isEmpty', 'isNotEmpty'].includes(operator) && (values.some(item => item === null) || operator === 'between' && values[0] > values[1])) { diagnostics.push(`筛选值无效：${field.label}`); continue }
    predicates.push(row => {
      const actual = normalized(row?.[field.id], type)
      if (operator === 'isEmpty') return actual === null
      if (operator === 'isNotEmpty') return actual !== null
      if (actual === null) return false
      if (operator === 'equals') return actual === values[0]
      if (operator === 'notEquals') return actual !== values[0]
      if (operator === 'in') return values.includes(actual)
      if (operator === 'notIn') return !values.includes(actual)
      if (operator === 'gt' || operator === 'after') return actual > values[0]
      if (operator === 'gte') return actual >= values[0]
      if (operator === 'lt' || operator === 'before') return actual < values[0]
      if (operator === 'lte') return actual <= values[0]
      return actual >= values[0] && actual <= values[1]
    })
  }
  return { rows: predicates.length ? rows.filter(row => predicates.every(predicate => predicate(row))) : rows, diagnostics }
}
