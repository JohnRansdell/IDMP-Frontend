import { normalizeDimensionGrain } from './grouping.js'
import { normalizeOrganizationPath } from '../../utils/organizationDrill.js'

const departmentRoles = new Set(['DEPARTMENT', 'DEPT', 'IN_DEPT', 'OUT_DEPT', 'CHANGE_DEPT'])
const departmentLevel = () => ({ levelCode: 'DEPARTMENT', levelName: '科室', dimensionFieldCode: '科室', memberKeyFieldCode: '科室' })
const doctorLevel = () => ({ levelCode: 'ATTENDING_DOCTOR', levelName: '医生', dimensionFieldCode: '医生', memberKeyFieldCode: '医生' })

export const organizationPath = paths => paths.find(path => path.pathCode === 'ORGANIZATION')

export function activeOrganizationLevels(path) {
  if (!path?.levels?.length) return []
  const end = path.levels.findIndex(level => level.levelCode === path.maxLevel)
  return end < 0 ? [] : path.levels.slice(0, end + 1)
}

export function replaceOrganizationPath(paths, levels) {
  const previous = organizationPath(paths)
  const next = normalizeOrganizationPath({ pathCode: 'ORGANIZATION', pathName: previous?.pathName || '组织下钻路径', maxLevel: levels.at(-1)?.levelCode || 'HOSPITAL', levels })
  return previous ? paths.map(path => path === previous ? next : path) : [...paths, next]
}

export function codeOnlyOrganizationPaths(paths) {
  const path = organizationPath(paths)
  if (!path?.levels?.some(level => level.displayFieldCode || level.displaySemanticFieldCode || level.displaySemanticFieldId)) return paths
  const levels = activeOrganizationLevels(path).map(level => {
    const { displayFieldCode, displaySemanticFieldCode, displaySemanticFieldId, ...identity } = level
    return identity
  })
  return replaceOrganizationPath(paths, levels)
}

export function setOrganizationEnabled(paths, enabled) {
  if (!enabled) return paths.filter(path => path.pathCode !== 'ORGANIZATION')
  if (organizationPath(paths)) return paths.map(normalizeOrganizationPath)
  return replaceOrganizationPath(paths, [
    { levelCode: 'HOSPITAL', levelName: '医院' },
    departmentLevel()
  ])
}

export function setOrganizationDepth(paths, depth) {
  if (!['DEPARTMENT', 'ATTENDING_DOCTOR'].includes(depth)) throw new Error('组织下钻仅支持医院、科室、医生层级')
  const current = activeOrganizationLevels(organizationPath(paths))
  const levels = [
    { levelCode: 'HOSPITAL', levelName: '医院' },
    { ...(current[1] || departmentLevel()), levelCode: 'DEPARTMENT', levelName: '科室' }
  ]
  if (depth === 'ATTENDING_DOCTOR') levels.push({ ...(current[2] || doctorLevel()), levelCode: 'ATTENDING_DOCTOR', levelName: '医生' })
  return codeOnlyOrganizationPaths(replaceOrganizationPath(paths, levels))
}

export function organizationConfigurationError(paths) {
  const path = organizationPath(paths)
  if (!path) return ''
  const levels = activeOrganizationLevels(path)
  if (levels.length < 2 || !['ROOT', 'HOSPITAL'].includes(levels[0]?.levelCode)) return '启用组织下钻后，至少需要配置到科室层级'
  if (levels.length > 3 || !departmentRoles.has(levels[1].levelCode)
    || levels.length === 3 && !['ATTENDING_DOCTOR', 'DOCTOR'].includes(levels[2].levelCode)) return '组织下钻链路必须为医院 → 科室 → 医生'
  const dimensions = new Set()
  for (const level of levels.slice(1)) {
    const key = level.memberKeyFieldCode || level.dimensionFieldCode
    if (!key || !level.dimensionFieldCode) return `请填写“${level.levelName}”的编码维度`
    try { normalizeDimensionGrain([level.dimensionFieldCode]); normalizeDimensionGrain([key]); if (level.displayFieldCode) normalizeDimensionGrain([level.displayFieldCode]) } catch (error) { return error.message }
    if (dimensions.has(level.dimensionFieldCode)) return '组织下钻的编码维度不能重复'
    dimensions.add(level.dimensionFieldCode)
  }
  return ''
}
