import { describeWarningCondition } from '../../api/adapters/warning.js'
import { formatResultPeriod } from '../../utils/periodRange.js'
import { isDepartmentCodeField } from '../shared/departmentDictionary.js'

const TIME_KEYS = new Set(['time_year', 'time_quarter', 'time_month', 'time_day', 'time_week'])
const SCOPE_LABELS = { MAIN: '总体结果', GROUPED: '分组结果', ALL: '全部结果' }
const PERIOD_LABELS = { DAILY: '日度', MONTHLY: '月度', QUARTERLY: '季度', YEARLY: '年度' }
const FIELD_LABELS = {
  out_dept_code: '出院科室编码', out_dept_name: '出院科室名称',
  in_dept_code: '入院科室编码', in_dept_name: '入院科室名称',
  dept_code: '科室编码', dept_name: '科室名称', department_code: '科室编码', department_name: '科室名称',
  attending_doctor: '主治医生编码', attending_doctor_code: '主治医生编码', attending_doctor_name: '主治医生名称',
  hospital_code: '医院编码', hospital_name: '医院名称'
}

const valueText = value => value === null ? '空值' : value === '' ? '空字符串' : String(value)

export function warningEventDimensions(event, departmentNames = new Map()) {
  return Object.entries(event.comparisonContext?.dimensionSnapshot || {})
    .filter(([field]) => !TIME_KEYS.has(field.toLowerCase()))
    .map(([field, value]) => {
      const name = isDepartmentCodeField(field) ? departmentNames.get(String(value)) : ''
      const label = FIELD_LABELS[field.toLowerCase()]
      return { field, label: label ? `${label}（${field}）` : field,
        value: `${valueText(value)}${name ? `（${name}）` : ''}` }
    })
}

export function warningEventScope(event) {
  const context = event.comparisonContext || {}
  const hasSnapshot = context.dimensionSnapshot && typeof context.dimensionSnapshot === 'object'
    && !Array.isArray(context.dimensionSnapshot)
  return {
    rule: SCOPE_LABELS[context.resultScope?.mode] || '全部结果',
    result: hasSnapshot ? warningEventDimensions(event).length ? '分组结果' : '总体结果' : '未记录'
  }
}

export function warningEventPeriod(event) {
  if (event.comparisonContext?.periodType === 'STATIC') return '静态结果'
  if (!event.periodStart || !event.periodEnd) return '未记录统计周期'
  const label = PERIOD_LABELS[event.comparisonContext?.periodType]
  return `${label ? `${label} · ` : ''}${formatResultPeriod(event.periodStart, event.periodEnd)}`
}

export function warningEventCondition(event) {
  const context = event.comparisonContext || {}
  const condition = context.condition || (event.thresholdValue != null && context.operator
    ? { operator: context.operator, threshold: event.thresholdValue } : null)
  if (!condition) return '未记录触发条件'
  return describeWarningCondition(condition, event.warningType)
}
