import { deriveDrillPathResultIds, normalizeDrillLevelDefinition } from '../../api/adapters/drill.js'
import { drillPeriodKey } from './drillPeriods.js'
import { formatResultNumber, formatResultValue, hasResultDisplay } from '../shared/resultPresentation.js'
import { assertDrillResponseContext, buildDrillRequest, drillMemberField, drillScope } from './drillContext.js'

export async function resolveAnalysisDrillPaths(paths = [], fetchPathVersion) {
  return Promise.all(paths.map(async path => {
    if (path.levels?.length) return { ...path, levels: path.levels.map(normalizeDrillLevelDefinition) }
    if (!path.pathVersionId) return path
    const metadata = await fetchPathVersion(path.pathVersionId)
    if (!metadata?.levels?.length) throw new Error('指标绑定的下钻路径未返回层级配置')
    return { ...path, levels: metadata.levels.map(normalizeDrillLevelDefinition) }
  }))
}

export function createDepartmentRankRows({ comparisons, analysis = {}, paths = [], granularity, unit, display }) {
  if (Array.isArray(comparisons) && comparisons.length > 0) {
    return [...comparisons].sort((left, right) => {
      const leftValue = Number(left.value)
      const rightValue = Number(right.value)
      if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue !== rightValue) return rightValue - leftValue
      return String(left.departmentName).localeCompare(String(right.departmentName), 'zh-CN')
    }).map((item, index) => ({
      rank: index + 1,
      departmentKey: item.departmentCode,
      department: item.departmentName,
      hospitalCode: item.dimensions?.hospital_code || item.dimensions?.HOSPITAL_CODE || '',
      departmentCode: item.departmentCode,
      rate: hasResultDisplay(item.displayValue) ? item.displayValue : formatResultValue(item.value, { unit, display }),
      numerator: item.numeratorValue == null ? '-' : formatResultNumber(item.numeratorValue, { maximumFractionDigits: 3 }),
      denominator: item.denominatorValue == null ? '-' : formatResultNumber(item.denominatorValue, { maximumFractionDigits: 3 }),
      change: '-',
      status: departmentAchievement(item, analysis),
      drillContext: departmentDrillContext(item, paths, granularity)
    }))
  }
  return []
}

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
    const departmentName = fieldText(namesByCode[departmentCode]) || fieldText(row.departmentName)
      || legacyField(row.dimensions, 'out_dept_name')
      || fieldText(namesByCode[departmentCode]) || departmentCode
    return [{ ...row, departmentCode, departmentName }]
  })
  const normalizedDirect = normalize(directRows)
  return normalizedDirect.length ? normalizedDirect : normalize(fallbackRows)
}

export function departmentAchievement(row, analysis = {}) {
  const assessment = (analysis.targetAssessments || []).find(item => row.resultId != null && String(item.resultId) === String(row.resultId))?.assessment
  const labels = { MET: '达标', NOT_MET: '未达标', NOT_CONFIGURED: '未配置目标', NOT_CALCULABLE: '无法判定' }
  if (labels[assessment?.status]) return labels[assessment.status]
  const target = analysis.performanceTarget
  if (target?.targetValue == null || !['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'].includes(target.improvementDirection)) return '未配置目标'
  if (row.value == null || !Number.isFinite(Number(row.value)) || !Number.isFinite(Number(target.targetValue))) return '无法判定'
  const met = target.improvementDirection === 'HIGHER_IS_BETTER'
    ? Number(row.value) >= Number(target.targetValue) : Number(row.value) <= Number(target.targetValue)
  return met ? '达标' : '未达标'
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

export async function loadDepartmentComparisons(analysis, paths, searchDrill, filters = {}, options = {}) {
  options.signal?.throwIfAborted()
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
    const context = { resultId: anchor, indicatorVersionId: analysis.indicatorVersionId, period: analysis.overview,
      pathCode: definition.path.pathCode,
      currentLevel: definition.level.levelCode,
      parentKeys: {}, filters }
    const request = buildDrillRequest(context, { path: definition.path, pageNum, pageSize: 100, sort: [{ field: 'indicatorValue', direction: 'DESC' }] })
    options.signal?.throwIfAborted()
    const result = await searchDrill(request.resultId, request.payload, options)
    options.signal?.throwIfAborted()
    assertDrillResponseContext(result, context)
    receivedCount += result.records.length
    rows.push(...result.records.filter(row => row.recordType !== 'CALCULATION_STATUS').map(row => ({
      ...row,
      snapshotId: row.snapshotId || (String(row.resultId) === String(result.context.resultId) ? result.context.snapshotId : undefined),
      indicatorVersionId: row.indicatorVersionId || result.context.indicatorVersionId,
      periodStart: row.periodStart || result.context.periodStart,
      periodEnd: row.periodEnd || result.context.periodEnd,
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
  const key = drillMemberField(path, level.levelCode)
  if (!key || row.departmentCode == null || row.departmentCode === '') return null
  return {
    period: { periodStart: row.periodStart, periodEnd: row.periodEnd }, granularity,
    resultId: String(row.resultId || ''), pathCode: path.pathCode,
    ...(row.snapshotId ? { snapshotId: String(row.snapshotId) } : {}),
    ...(row.indicatorVersionId ? { indicatorVersionId: String(row.indicatorVersionId) } : {}),
    currentLevel: next?.levelCode || level.levelCode,
    ...drillScope({ filters: { [key]: row.departmentCode }, parentKeys: { ...(row.parentKeys || {}), [key]: row.departmentCode } }, path)
  }
}
