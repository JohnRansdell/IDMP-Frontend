export function scalarParameter(query, key) {
  const value = query?.[key]
  if (value === undefined) return ''
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('登录链接参数无效')
  return value
}

export function signedDashboardParameters(query) {
  const keys = ['dashboardID', 'doctorNo', 'deptCode', 'sign']
  if (!keys.some(key => query?.[key] !== undefined)) return null
  const values = Object.fromEntries(keys.map(key => [key, scalarParameter(query, key)]))
  if (keys.some(key => !values[key]) || !/^[0-9a-f]{64}$/.test(values.sign)
      || ['dashboardID', 'doctorNo', 'deptCode'].some(key => values[key].length > 64)) throw new Error('看板链接不完整或签名格式错误')
  return values
}

export function safeMedicalRedirect(value) {
  if (!value) return '/medical-dashboard'
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) throw new Error('登录跳转地址无效')
  const target = new URL(value, 'https://idmp.invalid')
  if (target.origin !== 'https://idmp.invalid' || !['/dashboard', '/medical-dashboard'].includes(target.pathname)
      || target.searchParams.has('token')) throw new Error('登录跳转地址无效')
  for (const key of target.searchParams.keys()) if (target.searchParams.getAll(key).length > 1) throw new Error('登录跳转参数重复')
  return `${target.pathname}${target.search}${target.hash}`
}

export function dashboardIntegrationUrl(origin, base, id) {
  const url = new URL(`${String(base || '/').replace(/\/$/, '')}/dashboard`, origin)
  url.searchParams.set('dashboardID', String(id))
  return url.toString()
}
