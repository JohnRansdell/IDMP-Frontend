import { getStatusLabel } from '../design/status.js'

export function calculationResultFields(dimensionFields = [], records = []) {
  const fields = new Map()
  for (const field of [...dimensionFields, ...records.flatMap(row => Object.keys(row.dimensions || {}))]) {
    const key = field.toLowerCase()
    if (!fields.has(key)) fields.set(key, field)
  }
  return [...fields.values()]
}

export function calculationDimensionValue(row, field) {
  const dimensions = row.dimensions || {}
  const key = Object.hasOwn(dimensions, field) ? field : Object.keys(dimensions).find(key => key.toLowerCase() === field.toLowerCase())
  return dimensions[key] ?? '-'
}

export function calculationResultValue(row) {
  if (row?.displayValue !== undefined && row.displayValue !== null && row.displayValue !== '') return String(row.displayValue)
  if (row?.value === undefined || row.value === null) return '无有效值'
  if (typeof row.value === 'boolean') return row.value ? '是' : '否'
  return String(row.value)
}

export function nodeResultLabel(node) {
  if (node?.status !== 'SUCCEEDED') return node?.status === 'FAILED' ? '本次执行无结果' : '尚未生成结果'
  const summary = node.resultSummary
  if (!summary) return '暂未返回结果'
  if (summary.status === 'QUALITY') return summary.conclusion ? getStatusLabel(summary.conclusion) : '校验已完成'
  if (summary.status === 'EMPTY') return '暂无结果行'
  if (summary.status !== 'AVAILABLE') return '本次执行无可用结果'
  if (String(summary.rowCount) === '1' && summary.singleResult) return calculationResultValue(summary.singleResult)
  return `共 ${summary.rowCount ?? '-'} 条结果`
}
