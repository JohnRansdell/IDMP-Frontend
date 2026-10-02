export function normalizeDimensionGrain(values = []) {
  if (!Array.isArray(values)) throw new Error('组合粒度必须是字段列表')
  if (values.length > 10) throw new Error('组合粒度最多选择 10 个字段')
  const codes = values.map(value => String(value || '').trim().toUpperCase())
  if (codes.some(code => !/^[A-Z\p{Script=Han}][A-Z0-9_\p{Script=Han}]{0,127}$/u.test(code))) throw new Error('组合粒度名称只能包含中文、字母、数字和下划线，且必须以中文或字母开头，最多128个字符')
  if (codes.some(code => ['FACTOR_VALUE', 'FACTOR_STATE_SUM', 'FACTOR_STATE_COUNT', '__IDMP_GROUP_KEYS'].includes(code))) throw new Error('组合粒度名称不能使用系统计算结果字段，请换一个名称')
  if (new Set(codes).size !== codes.length) throw new Error('组合粒度不能包含重复字段')
  return codes
}

export function serializeDrillPaths(paths = []) {
  if (!Array.isArray(paths) || paths.length > 5) throw new Error('下钻路径最多选择 5 条')
  const seen = new Set()
  return paths.map(path => {
    const pathCode = String(path?.pathCode || '').trim().toUpperCase()
    const maxLevel = String(path?.maxLevel || '').trim().toUpperCase()
    if (!pathCode || !maxLevel) throw new Error('下钻路径和最大层级不能为空')
    if (seen.has(pathCode)) throw new Error('同一下钻路径只能选择一次')
    seen.add(pathCode)
    return { pathCode, maxLevel,
      ...(path.pathVersionId ? { pathVersionId: String(path.pathVersionId) } : {}),
      ...(path.pathName ? { pathName: String(path.pathName) } : {}),
      ...(Array.isArray(path.levels) && path.levels.length ? { levels: path.levels.map(level => ({ ...level })) } : {}) }
  })
}

function selectedSqlDrillLevels(paths, catalog) {
  const selected = []
  for (const path of paths) {
    if (!['ORGANIZATION', 'DISEASE'].includes(path.pathCode)) continue
    const definition = catalog.find(item => String(item.version?.id) === String(path.pathVersionId))
    const levels = definition?.levels || path.levels || []
    const end = levels.findIndex(level => level.levelCode === path.maxLevel)
    selected.push(...levels.slice(0, end + 1))
  }
  return selected
}

export function sqlImportGroupingFields(paths = [], grain = [], catalog = []) {
  const fields = new Set(normalizeDimensionGrain(grain))
  for (const level of selectedSqlDrillLevels(paths, catalog)) {
    for (const property of ['dimensionSemanticFieldCode', 'memberKeySemanticFieldCode', 'displaySemanticFieldCode']) {
      if (level[property]) fields.add(String(level[property]).toUpperCase())
    }
  }
  return [...fields].filter(code => !['HOSPITAL_CODE', 'ORG_CODE', 'TIME_YEAR', 'TIME_QUARTER', 'TIME_MONTH', 'TIME_DAY'].includes(code))
}

export function sqlImportGroupingFieldLabels(paths = [], grain = [], catalog = []) {
  const labels = new Map(normalizeDimensionGrain(grain).map(name => [name, name]))
  for (const level of selectedSqlDrillLevels(paths, catalog)) {
    const name = level.levelName || level.levelCode
    const key = String(level.memberKeySemanticFieldCode || '').toUpperCase()
    const display = String(level.displaySemanticFieldCode || '').toUpperCase()
    for (const field of [level.dimensionSemanticFieldCode, level.memberKeySemanticFieldCode, level.displaySemanticFieldCode]) {
      const code = String(field || '').toUpperCase()
      if (!code || labels.has(code)) continue
      const role = code === key && code === display ? '编码/名称' : code === key ? '编码' : code === display ? '名称' : '分组字段'
      labels.set(code, `${name}${role}`)
    }
  }
  return Object.fromEntries(labels)
}

export function selectSqlDimensionBindings(factor, fields) {
  return Object.fromEntries(fields.map(code => [code, String(factor.dimensionBindings?.[code] || '').trim()]).filter(([, value]) => value))
}

export function validateSqlDimensionBindings(factors = [], drafts = [], names = [], labels = {}) {
  const grain = normalizeDimensionGrain(names)
  for (const factor of factors) {
    const options = drafts.find(draft => draft.key === factor.key)?.dimensionFieldOptions || []
    for (const name of grain) {
      const label = labels[name] || name
      const binding = factor.dimensionBindings?.[name]
      if (!binding) return `请为因子“${factor.name || factor.key}”的“${label}”选择物理字段`
      if (!options.some(field => field.fieldReference === binding)) return `因子“${factor.name || factor.key}”的“${label}”映射字段不属于当前 SQL，请重新选择`
    }
  }
  return ''
}
