import { limitDrillNextLevels, normalizeOrganizationDrillLevel } from '../../api/adapters/drill.js'
import { isDepartmentLevel, namedDrillRecord } from './dimensionNames.js'

const PAGE_SIZE = 200
const MAX_CHART_ROWS = 500
const PARENT_FIELD = { HOSPITAL: 'HOSPITAL_CODE', OUT_DEPT: 'OUT_DEPT_CODE', MEDICAL_GROUP: 'MEDICAL_GROUP_CODE' }
const LEVEL_NAME = { OUT_DEPT: '科室', MEDICAL_GROUP: '医疗组', ATTENDING_DOCTOR: '医师' }

export function chartDrillLevelName(level, root) { return root?.levels?.find(item => item.levelCode === level)?.levelName || LEVEL_NAME[normalizeOrganizationDrillLevel(level)] || '组织' }

export function resolveChartDrillPath(paths = [], field = '') {
  return paths.find(path => (path.levels || []).some(level => [level.dimensionFieldCode, level.memberKeyFieldCode, level.displayFieldCode].includes(field)))
    || paths.find(path => path.pathCode === 'ORGANIZATION')
    || paths.find(path => (path.levels || []).some(isDepartmentLevel))
}

export function initialBackendChartNavigation(root) {
  if (root.levels) {
    const level = root.levels.find(isDepartmentLevel) || root.levels[1]
    if (!level) throw new Error('当前下钻路径没有可展示的成员层级')
    return { currentLevel: level.levelCode, parentKeys: { ...root.parentKeys }, label: `全部${level.levelName || '科室'}` }
  }
  return { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: root.hospitalCode }, label: '全部科室' }
}

export async function loadBackendChartRoot(search, target, { signal } = {}) {
  if (!target?.resultId) throw new Error('当前指标没有组织下钻结果')
  if (target.path?.pathCode && target.path.pathCode !== 'ORGANIZATION') {
    const path = target.path
    const maxIndex = (path.levels || []).findIndex(level => level.levelCode === path.maxLevel)
    const levels = maxIndex >= 0 ? path.levels.slice(0, maxIndex + 1) : path.levels || []
    const rootLevel = levels[0]
    if (!rootLevel || !levels.some(isDepartmentLevel)) throw new Error('下钻路径缺少根层级或科室层级')
    const payload = { pathCode: path.pathCode, currentLevel: rootLevel.levelCode, parentKeys: {}, filters: {}, pageNum: 1, pageSize: PAGE_SIZE }
    const first = await search(target.resultId, payload, { source: 'live', signal })
    const rootRecord = first.records.find(row => row.levelCode === rootLevel.levelCode && row.resultId)
    const resultId = rootRecord?.resultId || first.context?.resultId
    if (!resultId || !first.context?.snapshotId || first.dataSource === 'mock') throw new Error('下钻根结果缺少正式结果或快照上下文')
    const canonical = resultId === target.resultId ? first : await search(resultId, payload, { source: 'live', signal })
    if (canonical.context?.currentLevel !== rootLevel.levelCode || canonical.dataSource === 'mock' || !canonical.context?.snapshotId) throw new Error('下钻根层级或快照无效')
    if (target.indicatorVersionId && canonical.context.indicatorVersionId && canonical.context.indicatorVersionId !== target.indicatorVersionId) throw new Error('下钻结果与指标版本不一致')
    const record = canonical.records.find(row => row.levelCode === rootLevel.levelCode)
    const rootField = rootLevel.memberKeyFieldCode || rootLevel.dimensionFieldCode
    return { resultId, snapshotId: canonical.context.snapshotId, indicatorVersionId: canonical.context.indicatorVersionId,
      pathCode: path.pathCode, levels, maxLevel: path.maxLevel, departmentNames: target.departmentNames,
      parentKeys: rootField && record?.dimensionKey ? { [rootField]: record.dimensionKey } : {} }
  }
  const payload = { currentLevel: 'HOSPITAL', parentKeys: {}, filters: {}, pageNum: 1, pageSize: PAGE_SIZE }
  const first = await search(target.resultId, payload, { source: 'live', signal })
  checkRoot(first, target)
  const canonicalId = first.records.find(row => normalizeOrganizationDrillLevel(row.levelCode) === 'HOSPITAL' && row.resultId)?.resultId
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
    const field = parent.memberKeyFieldCode || parent.dimensionFieldCode
    if (field && (parentKeys[field] === undefined || parentKeys[field] === '')) throw new Error('下钻父级上下文不完整')
  }
  let records = []
  let first
  let total
  for (let pageNum = 1; ; pageNum += 1) {
    signal?.throwIfAborted()
    const result = await search(root.resultId, {
      ...(root.pathCode ? { pathCode: root.pathCode } : {}), currentLevel: level, parentKeys, filters: {}, pageNum, pageSize: PAGE_SIZE, snapshotId: root.snapshotId
    }, { source: 'live', signal })
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
    const field = current?.memberKeyFieldCode || current?.dimensionFieldCode
    if (!field || !row?.dimensionKey || !next || !(result?.nextLevels || []).includes(next.levelCode)) return null
    return { currentLevel: next.levelCode, parentKeys: { ...navigation.parentKeys, [field]: row.dimensionKey }, label: row.dimensionLabel || row.dimensionName || row.dimensionKey }
  }
  const currentLevel = normalizeOrganizationDrillLevel(navigation?.currentLevel)
  const field = PARENT_FIELD[currentLevel]
  if (!field || !row?.dimensionKey) return null
  const available = limitDrillNextLevels(result?.nextLevels, 'ORGANIZATION', maxLevel).map(normalizeOrganizationDrillLevel)
  const nextLevel = row.nextLevel ? normalizeOrganizationDrillLevel(row.nextLevel) : available[0]
  if (!LEVEL_NAME[nextLevel] || !available.includes(nextLevel)) return null
  return {
    currentLevel: nextLevel,
    parentKeys: { ...navigation.parentKeys, [field]: row.dimensionKey },
    label: row.dimensionLabel || row.dimensionName || row.dimensionKey
  }
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

export function backendChartValue(row, kind, unit = '') {
  if (kind === 'pie') {
    const value = Number(row?.numerator)
    return row?.numerator !== null && row?.numerator !== undefined && Number.isFinite(value) && value >= 0 ? value : null
  }
  const displayed = String(row?.displayValue ?? '').trim()
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)\s*%$/.test(displayed)) return Number(displayed.replace('%', '').trim())
  const value = Number(row?.indicatorValue)
  if (row?.indicatorValue === null || row?.indicatorValue === undefined || !Number.isFinite(value)) return null
  return unit === '%' ? value * 100 : value
}

function checkRoot(result, target) {
  if (normalizeOrganizationDrillLevel(result?.context?.currentLevel) !== 'HOSPITAL' || result?.dataSource === 'mock') throw new Error('返回结果不是正式全院下钻结果')
  if (target.configuredPaths?.length && !target.configuredPaths.some(path => path.pathCode === 'ORGANIZATION')) throw new Error('指标版本未配置组织下钻路径')
  if (result.context?.indicatorVersionId && target.indicatorVersionId && result.context.indicatorVersionId !== target.indicatorVersionId) throw new Error('下钻结果与指标版本不一致')
}

function checkLevel(result, root, level, parentKeys) {
  const context = result?.context || {}
  const currentLevel = root.levels ? context.currentLevel : normalizeOrganizationDrillLevel(context.currentLevel)
  if (result?.dataSource === 'mock' || context.resultId !== root.resultId || context.snapshotId !== root.snapshotId || context.indicatorVersionId !== root.indicatorVersionId || currentLevel !== level || (root.pathCode && context.pathCode && context.pathCode !== root.pathCode)) throw new Error('下钻结果版本、快照或层级不一致')
  for (const [field, value] of Object.entries(parentKeys)) {
    const actual = context.parentKeys?.[field] ?? result.breadcrumb?.find(crumb => PARENT_FIELD[normalizeOrganizationDrillLevel(crumb.level)] === field)?.key
    if (actual !== undefined && String(actual) !== String(value)) throw new Error('下钻结果父级上下文不一致')
  }
  if (result.records.some(row => row.levelCode && (root.levels ? row.levelCode : normalizeOrganizationDrillLevel(row.levelCode)) !== level)) throw new Error('下钻结果包含其他组织层级')
}
