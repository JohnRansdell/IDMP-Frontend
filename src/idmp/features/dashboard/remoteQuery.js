const organizationFields = {
  DEPARTMENT: ['OUT_DEPT_CODE', 'deptCode', 'IN_DEPT_CODE', 'departmentCode'],
  MEDICAL_GROUP: ['MEDICAL_GROUP_CODE', 'medicalGroupCode'],
  DOCTOR: ['OUT_DOCTOR_CODE', 'doctorCode', 'DOCTOR_CODE']
}

const hasValue = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)

export function resolveDashboardQueryState(result, expectedWidgetCount = 0) {
  const widgets = Object.values(result?.widgets || {})
  if (widgets.some(widget => widget?.status === 'READY')) return { status: 'ready', message: '' }
  const failure = widgets.find(widget => widget?.status === 'ERROR')
  if (failure) return { status: 'error', message: failure.message || '看板组件查询失败，请重新加载。' }
  if (expectedWidgetCount > 0 && !widgets.length) return { status: 'error', message: '看板组件没有返回结果，请重新加载。' }
  return { status: 'empty', message: '' }
}

function matchingField(fields, code) {
  return fields.find(field => field.filterable && String(field.code || field.id).toLowerCase() === String(code).toLowerCase())
}

function intersectValues(left, right) {
  const a = Array.isArray(left) ? left.map(String) : [String(left)]
  const b = Array.isArray(right) ? right.map(String) : [String(right)]
  const intersection = a.filter(value => b.includes(value))
  return intersection.length ? (intersection.length === 1 ? intersection[0] : intersection) : null
}

export function buildRemoteWidgetQuery(widget, { periodStart, periodEnd, definitions = [], values = {}, fields = [], department = '' } = {}) {
  const scope = widget?.config?.backendQuery || {}
  const filters = {}
  const localQuery = widget?.config?.query || {}
  const addFilter = (code, value, required = false) => {
    if (!hasValue(value)) return null
    const field = matchingField(fields, code)
    if (!field) return required ? `数据源不支持筛选字段 ${code}` : null
    const key = field.code || field.id
    const previous = filters[key]
    const next = hasValue(previous) ? intersectValues(previous, value) : value
    if (next === null) return '组件范围与当前筛选条件没有交集'
    filters[key] = next
    return null
  }

  if (localQuery.inheritGlobalFilters !== false) {
    for (const definition of definitions) {
      if (definition.enabled === false || localQuery.ignoredGlobalFilterIds?.includes(definition.id)) continue
      const value = Object.hasOwn(values, definition.id) ? values[definition.id] : definition.defaultValue
      if (definition.type === 'date-range') continue
      addFilter(definition.field, value)
    }
  }
  addFilter('deptCode', department)

  let start = periodStart
  let end = periodEnd
  if (localQuery.inheritGlobalFilters !== false) {
    for (const definition of definitions) {
      if (definition.enabled === false || definition.type !== 'date-range' || localQuery.ignoredGlobalFilterIds?.includes(definition.id)) continue
      const value = Object.hasOwn(values, definition.id) ? values[definition.id] : definition.defaultValue
      if (!Array.isArray(value)) continue
      if (!['periodStart', 'periodEnd'].includes(definition.field)) {
        if (matchingField(fields, definition.field) && value.some(Boolean)) return { error: `日期字段 ${definition.field} 不支持范围查询` }
        continue
      }
      if (value[0] && value[1] && value[0] > value[1]) return { error: '日期筛选起止范围无效' }
      if (value[0] && (!start || value[0] > start)) start = value[0]
      if (value[1]) {
        const nextDay = new Date(`${value[1]}T00:00:00Z`)
        nextDay.setUTCDate(nextDay.getUTCDate() + 1)
        const exclusiveEnd = nextDay.toISOString().slice(0, 10)
        if (!end || exclusiveEnd < end) end = exclusiveEnd
      }
    }
  }
  if (scope.periodMode === 'FIXED') {
    if (!scope.periodStart || !scope.periodEnd || scope.periodStart > scope.periodEnd) return { error: '组件固定周期无效' }
    const exclusiveEnd = new Date(`${scope.periodEnd}T00:00:00Z`)
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1)
    start = start && start > scope.periodStart ? start : scope.periodStart
    const fixedEnd = exclusiveEnd.toISOString().slice(0, 10)
    end = end && end < fixedEnd ? end : fixedEnd
  }
  if (start && end && start >= end) return { empty: true }

  if (scope.organizationMode === 'FIXED' && scope.organizationScope?.level !== 'HOSPITAL') {
    const level = scope.organizationScope?.level
    const ids = scope.organizationScope?.ids || []
    if (!ids.length) return { error: '组件组织范围缺少编码' }
    const field = (organizationFields[level] || []).map(code => matchingField(fields, code)).find(Boolean)
    if (!field) return { error: `数据源不支持 ${level || '未知'} 组织层级筛选` }
    const error = addFilter(field.code || field.id, ids)
    if (error) return { empty: true }
  }
  if (scope.scenarioMode === 'FIXED') {
    if (!scope.scenarioVersionIds?.length) return { error: '组件场景范围缺少版本 ID' }
    const error = addFilter('scenarioVersionId', scope.scenarioVersionIds, true)
    if (error) return error.includes('没有交集') ? { empty: true } : { error }
  }
  return {
    query: {
      periodStart: start, periodEnd: end,
      granularity: scope.periodMode === 'FIXED' ? scope.granularity || scope.periodGranularity || 'MONTHLY' : 'MONTHLY',
      widgetCodes: [String(widget.id)], filters
    }
  }
}

export function buildRemoteFilterOptionQuery(definition, definitions, values, fields, range) {
  const byId = new Map(definitions.map(item => [item.id, item]))
  const filters = {}
  let periodStart = range.periodStart
  let periodEnd = range.periodEnd
  const visited = new Set()
  const visit = id => {
    if (visited.has(id)) return
    visited.add(id)
    const parent = byId.get(id)
    if (!parent || parent.enabled === false) return
    for (const upstreamId of parent.dependsOn || []) visit(upstreamId)
    const value = Object.hasOwn(values, id) ? values[id] : parent.defaultValue
    if (!hasValue(value)) return
    if (parent.type === 'date-range' && Array.isArray(value)) {
      if (!['periodStart', 'periodEnd'].includes(parent.field)) throw new Error(`日期字段 ${parent.field} 不支持范围查询`)
      if (value[0] && (!periodStart || value[0] > periodStart)) periodStart = value[0]
      if (value[1] && (!periodEnd || value[1] < periodEnd)) periodEnd = value[1]
      return
    }
    const field = matchingField(fields, parent.field)
    if (!field) throw new Error(`候选值数据源不支持上游字段 ${parent.field}`)
    filters[field.code || field.id] = value
  }
  for (const id of definition.dependsOn || []) visit(id)
  return { fieldCode: definition.field, ...range, periodStart, periodEnd, limit: 500, filters }
}
