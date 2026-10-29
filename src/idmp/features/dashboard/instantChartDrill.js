import { projectedDrillNavigation } from './backendChartDrill.js'

export function instantChartDrillTarget(row, targets, { field, search, departmentNames } = {}) {
  const context = row?.queryContext
  if (!context) throw new Error('当前结果缺少下钻查询范围，请刷新看板')
  const paths = [...new Set(targets.map(target => target.pathCode).filter(Boolean))].map(pathCode => {
    const selected = targets.filter(target => target.pathCode === pathCode)
    const levels = selected.map((target, index) => {
      const previous = selected[index - 1]?.fields || []
      const identity = target.fields.find(item => !previous.includes(item))
      return { levelCode: target.levelCode, levelName: target.name.split(' / ').at(-1),
        dimensionFieldCode: identity, memberKeyFieldCode: identity }
    })
    return { pathCode, levels, maxLevel: levels.at(-1)?.levelCode }
  })
  const path = paths.find(item => item.levels.some(level => level.memberKeyFieldCode?.toUpperCase() === String(field).toUpperCase()))
    || paths.find(item => item.pathCode === 'ORGANIZATION') || paths[0]
  if (!path) throw new Error('该指标未配置下钻路径')
  const projected = projectedDrillNavigation(row, path, { currentLevel: path.levels[0].levelCode, parentKeys: {}, filters: context.filters })
  return { queryContext: context, path, indicatorVersionId: String(context.indicatorVersionId),
    departmentNames, instantSearch: search, ...projected }
}
