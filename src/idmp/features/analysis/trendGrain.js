import { dimensionDisplayFields, dimensionFieldValue, isMemberName } from '../dashboard/dimensionNames.js'
import { deriveDrillPathResultIds } from '../../api/adapters/drill.js'
import { resultPeriodToClosedRange } from '../../utils/periodRange.js'

export function trendGrainField(code, paths = []) {
  const level = paths.flatMap(path => path.levels || []).find(level =>
    [level.memberKeyFieldCode, level.dimensionFieldCode].some(field => String(field || '').toLowerCase() === code.toLowerCase()))
  const displayFields = dimensionDisplayFields(paths)
  const knownDisplayField = Object.entries(displayFields).find(([field]) => field.toLowerCase() === code.toLowerCase())?.[1]
  const displayField = level?.displayFieldCode || knownDisplayField
    || (/_CODE$|_ID$/i.test(code) ? code.replace(/_(CODE|ID)$/i, '_NAME') : /(?:Code|Id)$/.test(code) ? code.replace(/(?:Code|Id)$/, 'Name') : `${code}_NAME`)
  const label = String(level?.levelName || '').trim() || code
  return { code, label, displayField, valueIsName: /_NAME$|名称$|Name$/i.test(code), named: Boolean(level?.displayFieldCode || knownDisplayField || /科室|医生|医师|病种|病区|医院|医疗组/.test(code)) }
}

export function trendGrainNames(fields, analyses = []) {
  const names = Object.fromEntries(fields.map(field => [field.code, new Map()]))
  for (const analysis of analyses) {
    for (const row of [analysis?.overview, ...(analysis?.dimensionComparison || []), ...(analysis?.departmentComparison || []), ...(analysis?.trend || [])]) {
      if (!row) continue
      for (const field of fields) {
        const code = dimensionFieldValue(row, field.code)
        const name = dimensionFieldValue(row, field.displayField)
        if (code != null && isMemberName(name, code)) names[field.code].set(String(code), String(name))
      }
    }
  }
  return names
}

export function namedTrendGrainOptions(items, field, names = new Map()) {
  return (Array.isArray(items) ? items : []).flatMap(item => {
    const value = item?.value == null ? '' : String(item.value)
    if (!value) return []
    const name = field.valueIsName ? item.label || value : [item.nameMissing ? '' : item.label, item.name, names.get(value)].find(label => isMemberName(label, value))
    return [{ value, label: name ? String(name) : field.named ? `名称未返回（编码：${value}）` : String(item.label ?? value), nameMissing: field.named && !name }]
  })
}

// Candidate catalogs and BASE analysis rows can contain only codes. Resolve
// labels from the configured formal drill path, using its own frozen snapshot.
export async function loadTrendGrainMemberNames(options) {
  const names = await loadTrendGrainSnapshotNames(options)
  const { analysis, requiredCodes = [], loadAnalysis, signal } = options
  if (!loadAnalysis || !requiredCodes.length || requiredCodes.every(code => names.has(String(code)))) return names
  // The candidate catalog can span many months, while analysis comparison rows
  // belong only to the latest month. Look up remaining names in the same
  // version's other formal periods, without querying a different indicator.
  const periods = [...(analysis?.trend || [])].sort((a, b) => String(b.periodStart || '').localeCompare(String(a.periodStart || '')))
  const visited = new Set([String(analysis?.overview?.periodStart || '')])
  for (const period of periods) {
    if (!period.periodStart || !period.periodEnd || visited.has(String(period.periodStart))) continue
    visited.add(String(period.periodStart))
    signal?.throwIfAborted()
    const current = await loadAnalysis({ indicatorVersionId: options.versionId, granularity: analysis.granularity || 'MONTHLY',
      periodStart: String(period.periodStart).slice(0, 10), periodEnd: resultPeriodToClosedRange(period.periodStart, period.periodEnd, { dates: true })[1] })
    if (String(current?.indicatorVersionId || '') !== String(options.versionId)) continue
    const additional = await loadTrendGrainSnapshotNames({ ...options, analysis: current, requiredCodes: requiredCodes.filter(code => !names.has(String(code))) })
    for (const [code, name] of additional) names.set(code, name)
    if (requiredCodes.every(code => names.has(String(code)))) break
  }
  return names
}

async function loadTrendGrainSnapshotNames({ analysis, paths, field, versionId, selected = {}, requiredCodes = [], search, signal }) {
  const path = paths.find(path => (path.levels || []).some(level => [level.dimensionFieldCode, level.memberKeyFieldCode]
    .some(code => String(code || '').toLowerCase() === field.code.toLowerCase())))
  if (!path) return new Map()
  const levels = path.levels || []
  const index = levels.findIndex(level => [level.dimensionFieldCode, level.memberKeyFieldCode].some(code => String(code || '').toLowerCase() === field.code.toLowerCase()))
  const level = levels[index], rootLevel = levels[0]
  const anchor = deriveDrillPathResultIds(analysis, paths)[path.pathCode]
  if (!anchor || !rootLevel || !level) return new Map()
  const rootPayload = { pathCode: path.pathCode, currentLevel: rootLevel.levelCode, parentKeys: {}, filters: {}, pageNum: 1, pageSize: 200 }
  const first = await search(anchor, rootPayload, { source: 'live', signal })
  const rootId = first.records.find(row => row.levelCode === rootLevel.levelCode && row.resultId)?.resultId || first.context?.resultId
  if (!rootId) throw new Error('名称下钻未返回根结果 ID')
  const root = String(rootId) === String(anchor) ? first : await search(rootId, rootPayload, { source: 'live', signal })
  if (String(root.context?.indicatorVersionId) !== String(versionId) || !root.context?.snapshotId || root.context?.currentLevel !== rootLevel.levelCode
    || (root.context.pathCode && root.context.pathCode !== path.pathCode) || root.dataSource === 'mock') throw new Error('名称下钻版本或快照不一致')
  const parentKeys = {}
  for (const parent of levels.slice(0, index)) {
    const key = parent.memberKeyFieldCode || parent.dimensionFieldCode
    if (!key) continue
    const value = selected[key] ?? dimensionFieldValue(selected, key) ?? root.records[0]?.dimensions?.[key]
    if (value == null || value === '') return new Map()
    parentKeys[key] = value
  }
  const names = new Map()
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    const result = await search(rootId, { pathCode: path.pathCode, currentLevel: level.levelCode, parentKeys,
      filters: {}, pageNum, pageSize: 200, snapshotId: root.context.snapshotId }, { source: 'live', signal })
    if (String(result.context?.indicatorVersionId) !== String(versionId) || String(result.context?.snapshotId) !== String(root.context.snapshotId)
      || result.context.currentLevel !== level.levelCode || (result.context.pathCode && result.context.pathCode !== path.pathCode)
      || result.dataSource === 'mock') throw new Error('名称下钻上下文已变化，请重试')
    for (const row of result.records) {
      const code = String(row.dimensionKey ?? dimensionFieldValue(row, field.code) ?? '')
      const name = [dimensionFieldValue(row, field.displayField), row.dimensionName, row.dimensionLabel].find(name => isMemberName(name, code))
      if (code && name) names.set(code, String(name))
    }
    if (requiredCodes.length && requiredCodes.every(code => names.has(String(code)))) break
    if (pageNum >= Number(result.pageInfo?.totalPages || 1) || !result.records.length) break
  }
  return names
}
