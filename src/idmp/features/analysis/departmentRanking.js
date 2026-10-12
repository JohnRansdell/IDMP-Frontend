import { deriveDrillPathResultIds } from '../../api/adapters/drill.js'
import { drillPeriodKey } from './drillPeriods.js'

function fieldText(value) {
  if (value == null) return ''
  const text = String(value).trim()
  return text.toLowerCase() === 'null' ? '' : text
}

function legacyField(dimensions, field) {
  const key = Object.keys(dimensions || {}).find((key) => key.toLowerCase() === field)
  return fieldText(key == null ? null : dimensions[key])
}

export function normalizeDepartmentComparisons(rows, dimensionRows = [], namesByCode = {}) {
  const directRows = Array.isArray(rows) ? rows : []
  const fallbackRows = Array.isArray(dimensionRows) ? dimensionRows : []
  const normalize = (items) => items.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const departmentCode = fieldText(row.departmentCode)
      || legacyField(row.dimensions, 'out_dept_code')
      || legacyField(row.dimensions, 'out_dept_id')
    if (!departmentCode) return []
    const departmentName = fieldText(row.departmentName)
      || legacyField(row.dimensions, 'out_dept_name')
      || fieldText(namesByCode[departmentCode]) || departmentCode
    return [{ ...row, departmentCode, departmentName }]
  })
  const normalizedDirect = normalize(directRows)
  return normalizedDirect.length ? normalizedDirect : normalize(fallbackRows)
}

export function departmentDrillDefinition(paths = []) {
  for (const path of paths) {
    const index = (path.levels || []).findIndex(level =>
      ['OUT_DEPT_CODE', 'OUT_DEPT_ID', 'DEPARTMENT_CODE'].includes(String(level.memberKeyFieldCode || level.dimensionFieldCode || '').toUpperCase())
      || ['OUT_DEPT', 'DEPARTMENT'].includes(level.levelCode)
    )
    if (index >= 0) return { path, level: path.levels[index], index }
  }
  return null
}

export async function loadDepartmentComparisons(analysis, paths, searchDrill) {
  const period = drillPeriodKey(analysis?.overview)
  const direct = normalizeDepartmentComparisons((analysis?.departmentComparison || []).filter(row => drillPeriodKey(row) === period))
  if (direct.length) return direct
  const definition = departmentDrillDefinition(paths)
  const anchor = definition && deriveDrillPathResultIds(analysis, paths)[definition.path.pathCode]
  if (!definition || !anchor) {
    // 只复用科室单一粒度的结果，不能把科室与病种等组合结果当作科室汇总。
    const dimensions = (analysis?.dimensionComparison || []).filter(row => drillPeriodKey(row) === period
      && Object.keys(row.dimensions || {}).every(key => ['out_dept_code', 'out_dept_id', 'out_dept_name', 'department_code', 'department_name', 'hospital_code', 'hospital_name'].includes(key.toLowerCase())))
    return normalizeDepartmentComparisons([], dimensions)
  }
  const rows = []
  let receivedCount = 0
  for (let pageNum = 1; pageNum <= 100; pageNum += 1) {
    const result = await searchDrill(anchor, {
      ...(definition.path.pathCode.startsWith('CUSTOM_') ? { pathCode: definition.path.pathCode } : {}),
      currentLevel: definition.level.levelCode,
      parentKeys: {}, filters: {}, pageNum, pageSize: 100,
      sort: [{ field: 'indicatorValue', direction: 'DESC' }]
    })
    if (drillPeriodKey(result.context) !== period) throw new Error('科室结果的统计周期不一致，请刷新后重试。')
    receivedCount += result.records.length
    rows.push(...result.records.filter(row => row.recordType !== 'CALCULATION_STATUS').map(row => ({
      ...row,
      departmentCode: row.dimensionKey,
      departmentName: row.dimensionName || row.dimensionLabel,
      value: row.indicatorValue ?? row.value,
      numeratorValue: row.numeratorValue ?? row.numerator,
      denominatorValue: row.denominatorValue ?? row.denominator
    })))
    const hasMore = pageNum < Number(result.pageInfo.totalPages || 1) || receivedCount < Number(result.pageInfo.total || 0)
    if (!hasMore) return normalizeDepartmentComparisons(rows)
    if (!result.records.length) throw new Error('科室结果尚未读取完整，请稍后重试。')
  }
  throw new Error('科室结果数量过多，暂时无法完整展示排名。')
}

export function departmentDrillContext(row, paths, granularity) {
  const definition = departmentDrillDefinition(paths)
  if (!definition) return null
  const { path, level, index } = definition
  const maximumIndex = path.levels.findIndex(item => item.levelCode === path.maxLevel)
  const next = (maximumIndex < 0 || index < maximumIndex) ? path.levels[index + 1] : null
  const key = level.memberKeyFieldCode || level.dimensionFieldCode || 'OUT_DEPT_CODE'
  return {
    period: { periodStart: row.periodStart, periodEnd: row.periodEnd }, granularity,
    resultId: String(row.resultId || ''), pathCode: path.pathCode,
    currentLevel: next?.levelCode || level.levelCode,
    filters: { [key]: row.departmentCode },
    parentKeys: { ...(row.parentKeys || {}), [key]: row.departmentCode }
  }
}
