export const defaultCategoryPath = ['医疗质量', '质量安全']
export const indicatorCategoryOptions = [
  {
    value: '医疗质量',
    label: '医疗质量',
    children: [
      {
        value: '质量安全',
        label: '质量安全',
        children: [
          { value: '手术安全', label: '手术安全' },
          { value: '围术期安全', label: '围术期安全' },
          { value: '患者安全', label: '患者安全' }
        ]
      },
      {
        value: '功能定位',
        label: '功能定位',
        children: [
          { value: '门诊服务', label: '门诊服务' },
          { value: '住院服务', label: '住院服务' },
          { value: '日间医疗', label: '日间医疗' }
        ]
      },
      {
        value: '合理用药',
        label: '合理用药',
        children: [
          { value: '抗菌药物', label: '抗菌药物' },
          { value: '药品结构', label: '药品结构' }
        ]
      }
    ]
  },
  {
    value: '运营效率',
    label: '运营效率',
    children: [
      { value: '服务流程', label: '服务流程' },
      { value: '收支结构', label: '收支结构' },
      { value: '经济管理', label: '经济管理' }
    ]
  },
  {
    value: '专项指标',
    label: '专项指标',
    children: [
      { value: '住院死亡类', label: '住院死亡类' },
      { value: '评审指标', label: '评审指标' }
    ]
  }
]
export const indicatorCategoryProps = {
  checkStrictly: true,
  emitPath: true
}

export function findCategoryPath(target, options, trail = []) {
  const needle = String(target || '').trim()
  if (!needle) return []

  for (const option of options) {
    const nextTrail = [...trail, option.value]
    if (option.value === needle || option.label === needle) return nextTrail
    if (Array.isArray(option.children) && option.children.length) {
      const matched = findCategoryPath(needle, option.children, nextTrail)
      if (matched.length) return matched
    }
  }

  return []
}

export function normalizeCategoryPath(source) {
  if (Array.isArray(source)) {
    return source.map(segment => String(segment || '').trim()).filter(Boolean)
  }

  if (!source || typeof source !== 'object') return []

  const explicitPath = Array.isArray(source.categoryPath) ? source.categoryPath : []
  if (explicitPath.length) {
    return explicitPath.map(segment => String(segment || '').trim()).filter(Boolean)
  }

  const categoryText = String(source.category || '').trim()
  if (categoryText.includes('/')) {
    const parsedPath = categoryText.split('/').map(segment => segment.trim()).filter(Boolean)
    if (parsedPath.length) return parsedPath
  }

  const categoryMain = String(source.categoryMain || categoryText).trim()
  const categorySub = String(source.categorySub || '').trim()
  if (!categoryMain && !categorySub) return []

  if (categorySub) {
    const subPath = findCategoryPath(categorySub, indicatorCategoryOptions)
    if (subPath.length && (!categoryMain || subPath[0] === categoryMain || subPath.includes(categoryMain))) {
      return subPath
    }
  }

  if (!categoryMain) return [categorySub]

  const matchedPath = findCategoryPath(categoryMain, indicatorCategoryOptions)
  const path = matchedPath.length ? matchedPath : [categoryMain]
  if (categorySub && path[path.length - 1] !== categorySub) {
    path.push(categorySub)
  }
  return path
}

export function resolveCategoryPath(source, fallback = defaultCategoryPath) {
  const path = normalizeCategoryPath(source)
  return path.length ? path : [...fallback]
}
