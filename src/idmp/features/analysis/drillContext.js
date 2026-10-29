import { normalizeDrillLevelDefinition, normalizeOrganizationDrillLevel } from '../../api/adapters/drill.js'

export function drillLevelDefinition(path, levelCode) {
  const level = path?.levels?.find(item => item.levelCode === levelCode)
  if (!level) throw new Error('下钻路径缺少当前层级配置，请检查指标的下钻配置。')
  return normalizeDrillLevelDefinition(level)
}

export function drillMemberField(path, levelCode) {
  const level = drillLevelDefinition(path, levelCode)
  return level.memberKeyFieldCode || level.dimensionFieldCode || ''
}

const hasValue = value => value !== undefined && value !== null && value !== ''
const keyOf = (object, field) => Object.keys(object).find(key => key.toLowerCase() === field.toLowerCase())

export function drillScope(context, path) {
  const parentKeys = { ...context.parentKeys }
  const filters = Object.fromEntries(Object.entries(context.filters || {}).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
  if (!path?.levels?.length) throw new Error('下钻路径缺少层级配置，请检查指标的下钻配置。')
  const levels = path.levels.map(normalizeDrillLevelDefinition)
  for (const level of levels) {
    const identity = level.memberKeyFieldCode || level.dimensionFieldCode
    const display = level.displayFieldCode
    if (!identity || !display || identity.toLowerCase() === display.toLowerCase()) continue
    for (const values of [parentKeys, filters]) {
      const displayKey = keyOf(values, display)
      if (displayKey === undefined) continue
      const parent = parentKeys[keyOf(parentKeys, identity)]
      const selected = filters[keyOf(filters, identity)]
      if (!hasValue(parent) && !(Array.isArray(selected) ? selected.some(hasValue) : hasValue(selected))) {
        throw new Error('下钻筛选缺少成员编码，请重新选择科室或成员后重试。')
      }
      delete values[displayKey]
    }
  }
  return { parentKeys, filters }
}

export function buildDrillRequest(context, { path, pageNum = 1, pageSize = 20, sort } = {}) {
  const resultId = String(context.resultId || '')
  if (!resultId) throw new Error('缺少真实结果，请从指标分析或看板重新进入。')
  if (context.pathCode && path?.pathCode && context.pathCode !== path.pathCode) throw new Error('下钻路径与当前配置不一致，请重新进入。')
  return { resultId, payload: {
    ...drillScope(context, path),
    ...(context.pathCode || path?.pathCode ? { pathCode: context.pathCode || path.pathCode } : {}),
    ...(context.currentLevel ? { currentLevel: context.currentLevel } : {}),
    ...(context.snapshotId ? { snapshotId: String(context.snapshotId) } : {}),
    // Only explicit interval drill carries periodRange; a formal result's period is for validation.
    ...(context.periodRange ? { periodRange: { ...context.periodRange } } : {}),
    pageNum, pageSize, ...(sort ? { sort: sort.map(item => ({ ...item })) } : {})
  } }
}

export function nextDrillNavigation(context, row, nextLevel, path) {
  const field = drillMemberField(path, context.currentLevel)
  const virtualRoot = path?.levels?.[0]?.levelCode === context.currentLevel
    && ((path?.pathCode === 'ORGANIZATION' && ['HOSPITAL', 'ROOT'].includes(context.currentLevel))
      || (path?.pathCode?.startsWith('CUSTOM_') && context.currentLevel === 'ROOT'))
  if (!field && virtualRoot && nextLevel) {
    return { currentLevel: nextLevel, parentKeys: drillScope(context, path).parentKeys,
      label: row?.dimensionLabel || row?.dimensionName || path.levels[0].levelName || '全院' }
  }
  if (!field || !hasValue(row?.dimensionKey) || !nextLevel) return null
  return { currentLevel: nextLevel, parentKeys: { ...drillScope(context, path).parentKeys, [field]: String(row.dimensionKey) },
    label: row.dimensionLabel || row.dimensionName || String(row.dimensionKey) }
}

export function assertDrillResponseContext(response, expected) {
  const actual = response?.context || {}
  for (const [field, label] of [['indicatorVersionId', '指标版本'], ['snapshotId', '快照'], ['pathCode', '下钻路径']]) {
    if (hasValue(expected[field]) && hasValue(actual[field]) && String(expected[field]) !== String(actual[field])) {
      throw new Error(`下钻结果的${label}不一致，请刷新后重试。`)
    }
  }
  if (expected.currentLevel && actual.currentLevel && normalizeOrganizationDrillLevel(expected.currentLevel) !== normalizeOrganizationDrillLevel(actual.currentLevel)) {
    throw new Error('下钻结果的层级不一致，请刷新后重试。')
  }
  const period = expected.periodRange || expected.period
  if (period?.periodStart && period?.periodEnd && ['periodStart', 'periodEnd'].some(field =>
    String(actual[field] || '').slice(0, 10) !== String(period[field]).slice(0, 10))) {
    throw new Error('下钻结果的统计周期不一致，请刷新后重试。')
  }
}
