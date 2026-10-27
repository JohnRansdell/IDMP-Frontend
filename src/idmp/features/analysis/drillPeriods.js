import { deriveDrillPathResultIds } from '../../api/adapters/drill.js'

export const DRILL_GRANULARITIES = [
  { value: 'MONTHLY', label: '月度', placeholder: '选择月份' },
  { value: 'QUARTERLY', label: '季度', placeholder: '选择季度' },
  { value: 'YEARLY', label: '年度', placeholder: '选择年份' }
]

export function drillPeriodKey(point) {
  const start = String(point?.periodStart || '').slice(0, 10)
  const end = String(point?.periodEnd || '').slice(0, 10)
  return start && end ? `${start}/${end}` : ''
}

export function drillPeriodOptions(analysis, granularity) {
  const periods = new Map()
  for (const point of [...(analysis?.trend || []), analysis?.overview]) {
    const key = drillPeriodKey(point)
    if (!key || periods.has(key)) continue
    const [start, end] = key.split('/')
    const match = /^(\d{4})-(\d{2})-01$/.exec(start)
    if (!match) continue
    const year = Number(match[1]), month = Number(match[2])
    const months = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[granularity]
    if (!months || month < 1 || month > 12 || (month - 1) % months !== 0) continue
    const expectedEnd = new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10)
    if (end !== expectedEnd) continue
    const label = granularity === 'MONTHLY' ? `${year}年${month}月`
      : granularity === 'QUARTERLY' ? `${year}年第${Math.ceil(month / 3)}季度` : `${year}年`
    periods.set(key, { value: key, label, periodStart: start, periodEnd: end })
  }
  return [...periods.values()].sort((left, right) => right.value.localeCompare(left.value))
}

export function drillPeriodAnchor(analysis, selectedPeriod, configuredPaths = []) {
  if (!analysis || !selectedPeriod) return { pathResultIds: {}, resultId: '' }
  const matches = point => drillPeriodKey(point) === selectedPeriod
  const scoped = {
    ...analysis,
    overview: matches(analysis?.overview) ? analysis.overview : null,
    resultContext: matches(analysis?.resultContext) ? analysis.resultContext : null,
    dimensionComparison: (analysis?.dimensionComparison || []).filter(matches),
    departmentComparison: (analysis?.departmentComparison || []).filter(matches)
  }
  const pathResultIds = deriveDrillPathResultIds(scoped, configuredPaths)
  const resultId = configuredPaths.map(path => pathResultIds[path.pathCode]).find(Boolean)
    || pathResultIds.ORGANIZATION
    || scoped.overview?.resultId || scoped.resultContext?.resultId || ''
  return { pathResultIds, resultId: String(resultId) }
}
