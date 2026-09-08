import { normalizeOrganizationDrillLevel } from '../../api/adapters/drill.js'

const PAGE_SIZE = 200
const MAX_CHART_ROWS = 500
const LEVELS = ['OUT_DEPT', 'MEDICAL_GROUP', 'ATTENDING_DOCTOR']
const PARENT_FIELDS = { HOSPITAL: 'HOSPITAL_CODE', OUT_DEPT: 'OUT_DEPT_CODE', MEDICAL_GROUP: 'MEDICAL_GROUP_CODE' }
const CONTEXT_FIELDS = ['resultId', 'indicatorId', 'indicatorVersionId']

export function numericPieValue(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null
  if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null
}

export function resolvePieDrillRoot(targets = [], source = 'live') {
  const root = { target: null, source, currentLevel: 'OUT_DEPT', parentKeys: {}, error: '' }
  const first = targets[0]
  if (!first || CONTEXT_FIELDS.some((key) => !first[key]) || !first.parentKeys?.HOSPITAL_CODE) {
    return { ...root, error: '缺少完整的组织下钻上下文' }
  }
  if (targets.some((target) => !target || [...CONTEXT_FIELDS, 'snapshotId'].some((key) => (target[key] || '') !== (first[key] || '')) || target.parentKeys?.HOSPITAL_CODE !== first.parentKeys.HOSPITAL_CODE)) {
    return { ...root, error: '结果、指标版本、快照或医院不一致，不能合并下钻' }
  }
  return { ...root, target: { ...first, parentKeys: { ...first.parentKeys } }, parentKeys: { HOSPITAL_CODE: first.parentKeys.HOSPITAL_CODE } }
}

export function createPieDrillRequestGate() {
  let active
  const cancel = () => {
    active?.abort()
    active = undefined
  }
  return {
    cancel,
    begin: () => {
      cancel()
      const controller = new AbortController()
      active = controller
      return { signal: controller.signal, isCurrent: () => active === controller && !controller.signal.aborted }
    }
  }
}

export async function loadPieDrillLevel(search, root, navigation, { signal, pageNum = 1, tableOnly = false } = {}) {
  if (root.error || !root.target) throw contextError(root.error || '缺少下钻根结果')
  const currentLevel = normalizeOrganizationDrillLevel(navigation.currentLevel)
  const parentKeys = cleanParentKeys(navigation.parentKeys)
  if (!LEVELS.includes(currentLevel) || parentKeys.HOSPITAL_CODE !== root.parentKeys.HOSPITAL_CODE || (currentLevel !== 'OUT_DEPT' && !parentKeys.OUT_DEPT_CODE)) {
    throw contextError('组织层级或父级上下文无效')
  }
  if (!Number.isSafeInteger(pageNum) || pageNum < 1) throw new Error('分页参数无效')
  let snapshotId = navigation.snapshotId || root.target.snapshotId || ''
  if (navigation.snapshotId && root.target.snapshotId && navigation.snapshotId !== root.target.snapshotId) throw contextError('快照已变化，请重新加载')

  const loadPage = async (number) => {
    signal?.throwIfAborted()
    const result = await search(root.target.resultId, {
      currentLevel,
      parentKeys: { ...parentKeys },
      filters: {},
      pageNum: number,
      pageSize: PAGE_SIZE,
      ...(snapshotId ? { snapshotId } : {})
    }, { source: root.source, signal })
    signal?.throwIfAborted()
    validateContext(result, root, currentLevel, parentKeys, snapshotId)
    snapshotId = result.context.snapshotId
    return result
  }

  const first = await loadPage(tableOnly ? pageNum : 1)
  const fallback = (chartIssue) => ({ ...first, chartIssue, paged: true })
  const firstIssue = paginationIssue(first, tableOnly ? pageNum : 1)
  if (firstIssue) return fallback(firstIssue)
  if (tableOnly) return fallback('当前层使用分页表格展示')
  // ponytail: cap a full layer at 500 rows; larger organizations need a server-side aggregate, not a partial pie.
  if (first.pageInfo.total > MAX_CHART_ROWS) return fallback('当前层超过 500 条，请使用分页表格查看完整数据')

  const records = [...first.records]
  const pageCount = Math.ceil(first.pageInfo.total / first.pageInfo.pageSize)
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await loadPage(page)
    const issue = paginationIssue(result, page)
    if (issue || result.pageInfo.total !== first.pageInfo.total || result.pageInfo.pageSize !== first.pageInfo.pageSize) return fallback(issue || '分页统计发生变化，无法确认整层数据完整')
    if (differentNumber(result.summary?.numerator, first.summary?.numerator)) return fallback('分页汇总不一致，无法绘制构成图')
    records.push(...result.records)
  }
  const issue = chartIssue(records, first.summary?.numerator, navigation.expectedNumerator)
  if (issue) return fallback(issue)
  return { ...first, records, chartIssue: '', paged: false }
}

export function getPieNextNavigation(result, row, navigation) {
  const currentLevel = normalizeOrganizationDrillLevel(navigation.currentLevel)
  if (!LEVELS.includes(currentLevel) || currentLevel === 'ATTENDING_DOCTOR') return null
  if (normalizeOrganizationDrillLevel(result.context?.currentLevel) !== currentLevel) return null
  const nextLevels = [...new Set((result.nextLevels || []).map(normalizeOrganizationDrillLevel))]
    .filter((level) => LEVELS.indexOf(level) > LEVELS.indexOf(currentLevel))
  const nextLevel = row.nextLevel ? normalizeOrganizationDrillLevel(row.nextLevel) : nextLevels.length === 1 ? nextLevels[0] : ''
  const dimensionKey = opaqueKey(row.dimensionKey)
  if (!nextLevels.includes(nextLevel) || !dimensionKey || (row.levelCode && normalizeOrganizationDrillLevel(row.levelCode) !== currentLevel)) return null
  const parentKeys = cleanParentKeys(navigation.parentKeys)
  if (!parentKeys.HOSPITAL_CODE || (currentLevel === 'MEDICAL_GROUP' && !parentKeys.OUT_DEPT_CODE)) return null
  parentKeys[PARENT_FIELDS[currentLevel]] = dimensionKey
  const expectedNumerator = numericPieValue(row.numerator)
  return {
    currentLevel: nextLevel,
    parentKeys,
    label: row.dimensionLabel || row.dimensionName || dimensionKey,
    ...(result.context.snapshotId ? { snapshotId: result.context.snapshotId } : {}),
    ...(expectedNumerator !== null ? { expectedNumerator } : {})
  }
}

function validateContext(result, root, currentLevel, parentKeys, snapshotId) {
  const context = result?.context || {}
  if (['resultId', 'indicatorVersionId'].some((key) => !context[key] || context[key] !== root.target[key]) || (context.indicatorId && context.indicatorId !== root.target.indicatorId)) throw contextError('返回结果与指标版本不一致，请重新加载')
  if (!context.snapshotId || (snapshotId && context.snapshotId !== snapshotId)) throw contextError('快照缺失或已变化，请重新加载')
  if (normalizeOrganizationDrillLevel(context.currentLevel) !== currentLevel) throw contextError('返回的组织层级不一致')
  if (root.source !== 'mock' && result.dataSource === 'mock') throw contextError('正式下钻不能使用演示数据')
  for (const [field, value] of Object.entries(parentKeys)) {
    const candidates = [context.parentKeys?.[field], ...(result.breadcrumb || [])
      .filter((crumb) => PARENT_FIELDS[normalizeOrganizationDrillLevel(crumb.level)] === field)
      .map((crumb) => crumb.key)]
      .filter((key) => key !== undefined && key !== null && key !== '')
    if (!candidates.length || candidates.some((key) => opaqueKey(key) !== value)) throw contextError('返回的医院或父组织上下文缺失或不一致')
  }
  for (const row of result.records || []) {
    if (['indicatorId', 'indicatorVersionId', 'snapshotId'].some((key) => row[key] !== undefined && row[key] !== (key === 'indicatorId' ? root.target.indicatorId : context[key]))) throw contextError('当前层包含其他指标版本或快照的数据')
    if (row.levelCode && normalizeOrganizationDrillLevel(row.levelCode) !== currentLevel) throw contextError('当前层包含其他组织层级的数据')
    if (Object.entries(parentKeys).some(([key, value]) => row.parentKeys?.[key] !== undefined && opaqueKey(row.parentKeys[key]) !== value)) throw contextError('当前层包含其他父组织的数据')
  }
}

function paginationIssue(result, pageNum) {
  const info = result.pageInfo || {}
  if (!info.hasTotal || !info.hasPageNum || !info.hasPageSize || !Number.isSafeInteger(info.total) || info.total < 0 || !Number.isSafeInteger(info.pageSize) || info.pageSize < 1 || info.pageSize > PAGE_SIZE) return '分页信息不完整，无法确认整层数据完整'
  const totalPages = Math.ceil(info.total / info.pageSize)
  if (info.pageNum !== pageNum || (info.hasTotalPages && info.totalPages !== totalPages) || pageNum > Math.max(1, totalPages)) return '分页位置或总页数异常，无法确认整层数据完整'
  if (!Array.isArray(result.records) || result.records.length !== Math.min(info.pageSize, Math.max(0, info.total - (pageNum - 1) * info.pageSize))) return '分页记录缺失或超出总数，无法确认整层数据完整'
  return ''
}

function chartIssue(records, summaryNumerator, expectedNumerator) {
  if ([summaryNumerator, expectedNumerator].some((value) => value !== undefined && value !== null && numericPieValue(value) === null)) return '汇总分子值无效，请使用分页表格核对'
  const keys = records.map((row) => opaqueKey(row.dimensionKey))
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) return '组织编码缺失或重复，请使用分页表格核对'
  const values = records.map((row) => numericPieValue(row.numerator))
  if (values.some((value) => value === null)) return '分子值缺失或无效，不能按指标发生率绘制构成图'
  const sum = values.reduce((total, value) => total + value, 0)
  if (numericPieValue(sum) === null || differentNumber(sum, summaryNumerator) || differentNumber(sum, expectedNumerator)) return '分子汇总与父级或当前层统计不一致，请使用分页表格核对'
  if (records.length && sum === 0) return '当前层分子值全部为 0，请使用表格查看或继续下钻'
  return ''
}

function differentNumber(left, right) {
  const first = numericPieValue(left)
  const second = numericPieValue(right)
  return first !== null && second !== null && Math.abs(first - second) > Math.max(1e-9, Math.abs(second) * 1e-6)
}

function cleanParentKeys(value = {}) {
  return Object.fromEntries(Object.values(PARENT_FIELDS).map((key) => [key, opaqueKey(value[key])]).filter(([, item]) => item))
}

function opaqueKey(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function contextError(message) {
  return Object.assign(new Error(message), { status: 409, code: 'DRILL_CONTEXT_CONFLICT' })
}
