const CODE_FIELDS = new Set([
  'out_dept_code', 'out_dept_id', 'in_dept_code', 'change_dept_code', 'dept_code', 'deptcode',
  'department_code', 'departmentcode', 'department', 'outdeptcode', 'indeptcode', 'nowdeptcode',
  'reg_dept_code', 'cost_dept_id', 'exec_dept_code', '科室', '科室编码', '出院科室编码'
])
export const isDepartmentCodeField = field => CODE_FIELDS.has(String(field || '').toLowerCase())

// Cache master data only, never clinical results or access permissions.
export function createDepartmentDictionaryLoader(fetchPage, { now = Date.now, ttl = 300000 } = {}) {
  let pending, cached, expires = 0
  return async () => {
    if (cached && now() < expires) return cached
    if (!pending) pending = (async () => {
      const entries = [], codes = new Set()
      let expectedTotal
      for (let page = 1; ; page++) {
        const result = await fetchPage({ page, size: 500 })
        const total = Number(result?.total)
        if (!Array.isArray(result?.records) || !Number.isSafeInteger(total) || total < 1
          || Number(result.pageNum) !== page || (expectedTotal != null && expectedTotal !== total)) {
          throw new Error('科室字典分页数据异常，请重试')
        }
        expectedTotal = total
        for (const entry of result.records) {
          if (typeof entry.code !== 'string' || !entry.code || typeof entry.name !== 'string' || !entry.name || codes.has(entry.code))
            throw new Error('科室字典存在无效或重复编码，请重试')
          codes.add(entry.code); entries.push(Object.freeze({ ...entry }))
        }
        if (entries.length === total) break
        if (!result.records.length || entries.length > total) throw new Error('科室字典尚未加载完整，请重试')
      }
      cached = Object.freeze(entries)
      expires = now() + ttl
      return cached
    })().finally(() => { pending = null })
    return pending
  }
}
