import { canonicalDrillRootResultId, legacyProjectedOrganizationLevels, limitDrillNextLevels, normalizeDrillLevelDefinition, normalizeOrganizationDrillLevel } from '../../api/adapters/drill.js'
import { buildDrillRequest, drillMemberField, drillScope, nextDrillNavigation } from '../analysis/drillContext.js'
import { isDepartmentLevel, namedDrillRecord } from './dimensionNames.js'
import { numericValue } from './fieldCatalog.js'
import { resultChartNumber } from '../shared/resultPresentation.js'
import { normalizeOrganizationPath, organizationLevelName } from '../../utils/organizationDrill.js'

const PAGE_SIZE = 200
const MAX_CHART_ROWS = 500
const LEVEL_NAME = { OUT_DEPT: '科室', MEDICAL_GROUP: '医疗组', ATTENDING_DOCTOR: '医生' }

export function chartDrillLevelName(level, root) {
  return organizationLevelName(root?.pathCode || 'ORGANIZATION', level,
    root?.levels?.find(item => item.levelCode === level)?.levelName || LEVEL_NAME[normalizeOrganizationDrillLevel(level)] || '组织')
}

export function resolveChartDrillPath(paths = [], field = '') {
  const normalized = paths.map(normalizeOrganizationPath).map(path => {
    const levels = path.levels?.map(normalizeDrillLevelDefinition)
    return !levels || levels.every((level, index) => level === path.levels[index]) ? path : { ...path, levels }
  })
  return normalized.find(path => (path.levels || []).some(level => [level.dimensionFieldCode, level.memberKeyFieldCode, level.displayFieldCode].includes(field)))
    || normalized.find(path => path.pathCode === 'ORGANIZATION')
    || normalized.find(path => (path.levels || []).some(isDepartmentLevel))
}

export function initialBackendChartNavigation(root) {
  if (root.initialNavigation) return root.initialNavigation
  if (root.levels) {
    const level = root.levels.find(isDepartmentLevel) || root.levels[1]
    if (!level) throw new Error('当前下钻路径没有可展示的成员层级')
    return { currentLevel: level.levelCode, parentKeys: { ...root.parentKeys }, label: `全部${level.levelName || '科室'}` }
  }
  return { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: root.hospitalCode }, label: '全部科室' }
}

export function projectedDrillNavigation(row, path, context) {
  const levels = path?.levels?.length ? path.levels.map(normalizeDrillLevelDefinition)
    : path?.pathCode === 'ORGANIZATION' ? legacyProjectedOrganizationLevels(context.fieldLevels) : []
  const keys = new Map(Object.keys(row).map(field => [field.toLowerCase(), field]))
  const parents = { ...context.parentKeys }
  let index = Math.max(0, levels.findIndex(level => level.levelCode === context.currentLevel))
  const maxIndex = levels.findIndex(level => level.levelCode === path?.maxLevel)
  const lastIndex = maxIndex < 0 ? levels.length - 1 : maxIndex
  while (index < lastIndex) {
    const level = levels[index]
    const identity = level.memberKeyFieldCode || level.dimensionFieldCode
    if (!identity) { index += 1; continue }
    const value = row[keys.get(String(identity).toLowerCase())] ?? parents[identity]
    if (value === null || value === undefined || value === '') break
    parents[identity] = String(value)
    // Display names can change independently of the frozen result snapshot.
    // Only the configured member identity is a navigation key.
    index += 1
  }
  const scope = drillScope({ ...context, parentKeys: parents }, path)
  const filters = Object.fromEntries(Object.entries(scope.filters).filter(([field, values]) => {
    const parent = Object.entries(parents).find(([key]) => key.toLowerCase() === field.toLowerCase())?.[1]
    return parent === undefined || !(Array.isArray(values) ? values : [values]).some(value => String(value) === String(parent))
  }))
  return { filters, ...(levels[index] ? { initialNavigation: { currentLevel: levels[index].levelCode, parentKeys: scope.parentKeys, label: '所选成员' } } : {}) }
}

export async function loadBackendChartRoot(search, target, { signal } = {}) {
  if (target?.queryContext) return { ...target, resultId: '', snapshotId: '',
    levels: target.path.levels, pathCode: target.path.pathCode, maxLevel: target.path.maxLevel,
    parentKeys: target.initialNavigation?.parentKeys || {}, filters: target.filters || {},
    periodRange: { periodStart: target.queryContext.periodStart, periodEnd: target.queryContext.periodEnd } }
  if (!target?.resultId) throw new Error('当前指标没有组织下钻结果')
  if (target.drillContext) {
    const context = target.drillContext
    if (!context.snapshotId) throw new Error('组件下钻快照缺失')
    const path = target.path
    const levels = path?.levels || []
    const maxIndex = levels.findIndex(level => level.levelCode === path?.maxLevel)
    const projected = target.selectedRow ? projectedDrillNavigation(target.selectedRow, path, context) : {}
    return { resultId: context.resultId, snapshotId: context.snapshotId, indicatorVersionId: target.indicatorVersionId,
      periodRange: context.periodRange,
      ...(levels.length ? { ...(path?.pathCode ? { pathCode: path.pathCode } : {}), levels: maxIndex >= 0 ? levels.slice(0, maxIndex + 1) : levels } : {}),
      ...drillScope({ ...context, ...projected, parentKeys: projected.initialNavigation?.parentKeys || context.parentKeys }, path), hospitalCode: context.parentKeys?.HOSPITAL_CODE,
      departmentNames: target.departmentNames, maxLevel: path?.maxLevel || '',
      ...projected }
  }
  if (target.path?.pathCode && target.path.pathCode !== 'ORGANIZATION') {
    const path = target.path
    const maxIndex = (path.levels || []).findIndex(level => level.levelCode === path.maxLevel)
    const levels = maxIndex >= 0 ? path.levels.slice(0, maxIndex + 1) : path.levels || []
    const rootLevel = levels[0]
    if (!rootLevel || !levels.some(isDepartmentLevel)) throw new Error('下钻路径缺少根层级或科室层级')
    const { payload } = buildDrillRequest({ resultId: target.resultId, pathCode: path.pathCode, currentLevel: rootLevel.levelCode }, { path, pageSize: PAGE_SIZE })
    const first = await search(target.resultId, payload, { source: 'live', signal })
    const resultId = canonicalDrillRootResultId(first, rootLevel.levelCode) || first.context?.resultId
    if (!resultId || !first.context?.snapshotId || first.dataSource === 'mock') throw new Error('下钻根结果缺少正式结果或快照上下文')
    const canonical = resultId === target.resultId ? first : await search(resultId, payload, { source: 'live', signal })
    if (canonical.context?.currentLevel !== rootLevel.levelCode || canonical.dataSource === 'mock' || !canonical.context?.snapshotId) throw new Error('下钻根层级或快照无效')
    if (target.indicatorVersionId && canonical.context.indicatorVersionId && canonical.context.indicatorVersionId !== target.indicatorVersionId) throw new Error('下钻结果与指标版本不一致')
    const record = canonical.records.find(row => row.levelCode === rootLevel.levelCode)
    const rootField = drillMemberField(path, rootLevel.levelCode)
    return { resultId, snapshotId: canonical.context.snapshotId, indicatorVersionId: canonical.context.indicatorVersionId,
      pathCode: path.pathCode, levels, maxLevel: path.maxLevel, departmentNames: target.departmentNames,
      parentKeys: rootField && record?.dimensionKey ? { [rootField]: record.dimensionKey } : {} }
  }
  const { payload } = buildDrillRequest({ resultId: target.resultId, currentLevel: 'HOSPITAL' }, { pageSize: PAGE_SIZE })
  const first = await search(target.resultId, payload, { source: 'live', signal })
  checkRoot(first, target)
  const canonicalId = canonicalDrillRootResultId(first, 'HOSPITAL')
  if (!canonicalId) throw new Error('全院下钻结果缺少根结果 ID')
  const canonical = canonicalId === target.resultId ? first : await search(canonicalId, payload, { source: 'live', signal })
  checkRoot(canonical, target)
  const hospital = canonical.records.find(row => normalizeOrganizationDrillLevel(row.levelCode) === 'HOSPITAL')
  if (!hospital?.dimensionKey || !canonical.context?.snapshotId) throw new Error('全院下钻结果缺少医院或快照上下文')
  return {
    resultId: canonicalId,
    snapshotId: canonical.context.snapshotId,
    indicatorVersionId: canonical.context.indicatorVersionId,
    hospitalCode: hospital.dimensionKey,
    departmentNames: target.departmentNames,
    maxLevel: target.maxLevels?.ORGANIZATION || ''
  }
}

export async function loadBackendChartLevel(search, root, navigation, { signal } = {}) {
  const level = root.levels ? navigation?.currentLevel : normalizeOrganizationDrillLevel(navigation?.currentLevel)
  if (root.levels ? !root.levels.some(item => item.levelCode === level) : !LEVEL_NAME[level]) throw new Error('不支持的组织下钻层级')
  const parentKeys = navigation.parentKeys || {}
  if (!root.levels && (parentKeys.HOSPITAL_CODE !== root.hospitalCode || (level !== 'OUT_DEPT' && !parentKeys.OUT_DEPT_CODE))) throw new Error('下钻父级上下文不完整')
  if (root.levels) for (const parent of root.levels.slice(0, root.levels.findIndex(item => item.levelCode === level))) {
    const field = drillMemberField(root, parent.levelCode)
    if (field && (parentKeys[field] === undefined || parentKeys[field] === '')) throw new Error('下钻父级上下文不完整')
  }
  let records = []
  let first
  let total
  for (let pageNum = 1; ; pageNum += 1) {
    signal?.throwIfAborted()
    const result = root.queryContext
      ? await root.instantSearch({ context: { ...root.queryContext, filters: root.filters }, pathCode: root.pathCode,
        currentLevel: level, parentKeys, pageNum, pageSize: PAGE_SIZE }, { signal })
      : await (async () => {
        const request = buildDrillRequest({ ...root, currentLevel: level, parentKeys }, { path: root, pageNum, pageSize: PAGE_SIZE })
        return search(request.resultId, request.payload, { source: 'live', signal })
      })()
    checkLevel(result, root, level, parentKeys)
    const pageInfo = result.pageInfo || {}
    if (!pageInfo.hasTotal || !pageInfo.hasPageNum || !pageInfo.hasPageSize || pageInfo.pageNum !== pageNum || pageInfo.pageSize < 1 || pageInfo.pageSize > PAGE_SIZE) throw new Error('下钻分页信息不完整，无法绘制完整图表')
    if (total === undefined) {
      first = result
      total = pageInfo.total
      if (total > MAX_CHART_ROWS) throw new Error('当前层超过 500 条，无法在图表中完整展示')
    } else if (pageInfo.total !== total || pageInfo.pageSize !== first.pageInfo.pageSize) throw new Error('下钻分页统计发生变化，请重试')
    if (result.records.length !== Math.min(pageInfo.pageSize, Math.max(0, total - records.length))) throw new Error('下钻分页记录不完整，请重试')
    records = records.concat(result.records)
    if (records.length >= total) break
  }
  if (records.some(row => !row.dimensionKey)) throw new Error('下钻组织编码缺失，不能绘制图表')
  const definition = root.levels?.find(item => item.levelCode === level) || { levelCode: level, levelName: LEVEL_NAME[level], displayFieldCode: level === 'OUT_DEPT' ? 'OUT_DEPT_NAME' : level === 'ATTENDING_DOCTOR' ? 'ATTENDING_DOCTOR_NAME' : 'MEDICAL_GROUP_NAME' }
  const names = new Map(Object.entries(root.departmentNames || {}))
  return { ...first, records: records.map(row => namedDrillRecord(row, definition, names)) }
}

export function nextBackendChartNavigation(result, row, navigation, maxLevel = '', root) {
  if (root?.levels) {
    const index = root.levels.findIndex(level => level.levelCode === navigation?.currentLevel)
    const current = root.levels[index]
    const next = root.levels[index + 1]
    const field = current && drillMemberField(root, current.levelCode)
    if (!field || !row?.dimensionKey || !next || !(result?.nextLevels || []).includes(next.levelCode)) return null
    return nextDrillNavigation(navigation, row, next.levelCode, root)
  }
  const currentLevel = normalizeOrganizationDrillLevel(navigation?.currentLevel)
  const field = drillMemberField(undefined, currentLevel)
  if (!field || !row?.dimensionKey) return null
  const available = limitDrillNextLevels(result?.nextLevels, 'ORGANIZATION', maxLevel).map(normalizeOrganizationDrillLevel)
  const nextLevel = row.nextLevel ? normalizeOrganizationDrillLevel(row.nextLevel) : available[0]
  if (!LEVEL_NAME[nextLevel] || !available.includes(nextLevel)) return null
  return nextDrillNavigation({ ...navigation, currentLevel }, row, nextLevel)
}

export function findBackendChartRow(result, params = {}) {
  const direct = params?.data?.row
  if (direct?.resultId) {
    const matched = result?.records?.find(row => row.resultId === direct.resultId)
    if (matched) return matched
  }
  if (direct?.dimensionKey && direct?.dimensionLabel) {
    const matched = result?.records?.find(row => row.dimensionKey === direct.dimensionKey && row.dimensionLabel === direct.dimensionLabel)
    if (matched) return matched
  }
  const values = params?.data?.dimensionValues || {}
  const candidates = [params?.data?.row?.dimensionKey, params?.data?.id, params?.name,
    ...Object.values(values)]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(String)
  return (result?.records || []).find(row => candidates.some(value => [row.dimensionKey, row.dimensionName, row.dimensionLabel].map(String).includes(value))) || null
}

const CHART_MEASURE_FIELDS = {
  value: { rowField: 'indicatorValue', label: '指标值' },
  indicatorvalue: { rowField: 'indicatorValue', label: '指标值' },
  numeratorvalue: { rowField: 'numerator', label: '分子值' },
  numerator: { rowField: 'numerator', label: '分子值' },
  denominatorvalue: { rowField: 'denominator', label: '分母值' },
  denominator: { rowField: 'denominator', label: '分母值' }
}

export function backendChartMeasure(widget = {}) {
  const binding = widget.config?.dataBinding?.measures?.[0]
  const field = binding?.field || 'value'
  const key = String(field).toLowerCase()
  const definition = Object.hasOwn(CHART_MEASURE_FIELDS, key) ? CHART_MEASURE_FIELDS[key] : null
  return { field, label: binding?.label || definition?.label || field,
    error: definition ? '' : `当前下钻结果不支持顶层绑定的度量 ${binding?.label || field}，请调整组件字段配置。` }
}

export function backendChartValue(row, kind, unit = '', field = 'value') {
  if (kind === 'pie') {
    const rowField = CHART_MEASURE_FIELDS[String(field).toLowerCase()]?.rowField
    const value = rowField ? numericValue(row?.[rowField]) : null
    return value !== null && value >= 0 ? value : null
  }
  return resultChartNumber(row?.indicatorValue, { unit: row?.unit || unit })
}

function checkRoot(result, target) {
  if (normalizeOrganizationDrillLevel(result?.context?.currentLevel) !== 'HOSPITAL' || result?.dataSource === 'mock') throw new Error('返回结果不是正式全院下钻结果')
  if (target.configuredPaths?.length && !target.configuredPaths.some(path => path.pathCode === 'ORGANIZATION')) throw new Error('指标版本未配置组织下钻路径')
  if (result.context?.indicatorVersionId && target.indicatorVersionId && result.context.indicatorVersionId !== target.indicatorVersionId) throw new Error('下钻结果与指标版本不一致')
}

function checkLevel(result, root, level, parentKeys) {
  const context = result?.context || {}
  if (root.periodRange && (context.periodStart?.slice(0, 10) !== root.periodRange.periodStart
    || context.periodEnd?.slice(0, 10) !== root.periodRange.periodEnd)) throw new Error('下钻结果与所选统计区间不一致')
  const currentLevel = root.levels ? context.currentLevel : normalizeOrganizationDrillLevel(context.currentLevel)
  if (result?.dataSource === 'mock' || context.resultId !== root.resultId || context.snapshotId !== root.snapshotId || context.indicatorVersionId !== root.indicatorVersionId || currentLevel !== level || (root.pathCode && context.pathCode && context.pathCode !== root.pathCode)) throw new Error('下钻结果版本、快照或层级不一致')
  for (const [field, value] of Object.entries(parentKeys)) {
    const actual = context.parentKeys?.[field] ?? result.breadcrumb?.find(crumb => drillMemberField(undefined, normalizeOrganizationDrillLevel(crumb.level)) === field)?.key
    if (actual !== undefined && String(actual) !== String(value)) throw new Error('下钻结果父级上下文不一致')
  }
  if (result.records.some(row => row.levelCode && (root.levels ? row.levelCode : normalizeOrganizationDrillLevel(row.levelCode)) !== level)) throw new Error('下钻结果包含其他组织层级')
}
