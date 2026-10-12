import { limitDrillNextLevels, normalizeOrganizationDrillLevel } from '../../api/adapters/drill.js'

const PAGE_SIZE = 200
const MAX_CHART_ROWS = 500
const PARENT_FIELD = { HOSPITAL: 'HOSPITAL_CODE', OUT_DEPT: 'OUT_DEPT_CODE', MEDICAL_GROUP: 'MEDICAL_GROUP_CODE' }
const LEVEL_NAME = { OUT_DEPT: '科室', MEDICAL_GROUP: '医疗组', ATTENDING_DOCTOR: '医师' }

export function chartDrillLevelName(level) { return LEVEL_NAME[normalizeOrganizationDrillLevel(level)] || '组织' }

export async function loadBackendChartRoot(search, target, { signal } = {}) {
  if (!target?.resultId) throw new Error('当前指标没有组织下钻结果')
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
    maxLevel: target.maxLevels?.ORGANIZATION || ''
  }
}

export async function loadBackendChartLevel(search, root, navigation, { signal } = {}) {
  const level = normalizeOrganizationDrillLevel(navigation?.currentLevel)
  if (!LEVEL_NAME[level]) throw new Error('不支持的组织下钻层级')
  const parentKeys = navigation.parentKeys || {}
  if (parentKeys.HOSPITAL_CODE !== root.hospitalCode || (level !== 'OUT_DEPT' && !parentKeys.OUT_DEPT_CODE)) throw new Error('下钻父级上下文不完整')
  let records = []
  let first
  let total
  for (let pageNum = 1; ; pageNum += 1) {
    signal?.throwIfAborted()
    const result = await search(root.resultId, {
      currentLevel: level, parentKeys, filters: {}, pageNum, pageSize: PAGE_SIZE, snapshotId: root.snapshotId
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
  return { ...first, records }
}

export function nextBackendChartNavigation(result, row, navigation, maxLevel = '') {
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
    ...['OUT_DEPT_CODE', 'out_dept_code', 'department', 'MEDICAL_GROUP_CODE', 'medicalGroup', 'ATTENDING_DOCTOR', 'doctor'].map(key => values[key])]
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
  if (result?.dataSource === 'mock' || context.resultId !== root.resultId || context.snapshotId !== root.snapshotId || context.indicatorVersionId !== root.indicatorVersionId || normalizeOrganizationDrillLevel(context.currentLevel) !== level) throw new Error('下钻结果版本、快照或层级不一致')
  for (const [field, value] of Object.entries(parentKeys)) {
    const actual = context.parentKeys?.[field] ?? result.breadcrumb?.find(crumb => PARENT_FIELD[normalizeOrganizationDrillLevel(crumb.level)] === field)?.key
    if (actual !== undefined && String(actual) !== String(value)) throw new Error('下钻结果父级上下文不一致')
  }
  if (result.records.some(row => row.levelCode && normalizeOrganizationDrillLevel(row.levelCode) !== level)) throw new Error('下钻结果包含其他组织层级')
}
