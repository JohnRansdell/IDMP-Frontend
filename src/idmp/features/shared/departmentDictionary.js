const CODE_FIELDS = new Set([
  'out_dept_code', 'out_dept_id', 'in_dept_code', 'change_dept_code', 'dept_code', 'deptcode',
  'department_code', 'departmentcode', 'department', 'outdeptcode', 'indeptcode', 'nowdeptcode',
  'reg_dept_code', 'cost_dept_id', 'exec_dept_code', '科室', '科室编码', '出院科室编码'
])
export const isDepartmentCodeField = field => CODE_FIELDS.has(String(field || '').toLowerCase())

// The dictionary endpoint is permission-filtered; never reuse it across sessions.
export function createDepartmentDictionaryLoader(fetchPage, { now = Date.now, ttl = 300000, scopeKey = () => '' } = {}) {
  let pending, cached, expires = 0, scope
  return async () => {
    const currentScope = scopeKey()
    if (scope !== currentScope) {
      scope = currentScope
      pending = cached = undefined
      expires = 0
    }
    const assertScope = () => {
      if (scopeKey() !== currentScope) {
        const error = new Error('登录账号已切换，请重新加载科室')
        error.name = 'AbortError'
        throw error
      }
    }
    if (cached && now() < expires) return cached
    if (!pending) {
      const job = (async () => {
        const entries = [], codes = new Set()
        let expectedTotal
        for (let page = 1; ; page++) {
          const result = await fetchPage({ page, size: 500 })
          assertScope()
          const total = Number(result?.total)
          if (!Array.isArray(result?.records) || !Number.isSafeInteger(total) || total < 0
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
      })().finally(() => { if (pending === job) pending = null })
      pending = job
    }
    return pending
  }
}
