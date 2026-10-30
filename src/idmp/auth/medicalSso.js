export function scalarParameter(query, key) {
  const value = query?.[key]
  if (value === undefined) return ''
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('登录链接参数无效')
  return value
}

export function resolveSsoEntry(query) {
  const target = safeMedicalRedirect(scalarParameter(query, 'redirect'))
  const dashboardEntry = query.dashboardID !== undefined || query.deptCode !== undefined
    || target.startsWith('/medical-dashboard') || new URL(target, 'https://idmp.invalid').searchParams.has('dashboardID')
  if (dashboardEntry) {
    throw new Error('请使用独立的签名看板链接进入，看板访问不需要平台单点登录')
  }
  if (query.token !== undefined) throw new Error('平台登录链接已失效，请从来源系统重新进入或使用工号密码登录')
  const values = Object.fromEntries(['doctorNo', 'displayName', 'timestamp', 'nonce', 'sign'].map(key => [key, scalarParameter(query, key)]))
  if (!/^[A-Za-z0-9_@.-]{1,64}$/.test(values.doctorNo) || !values.displayName || values.displayName.length > 128
      || !/^\d{1,12}$/.test(values.timestamp) || !Number.isSafeInteger(Number(values.timestamp))
      || !/^[A-Za-z0-9_-]{16,128}$/.test(values.nonce) || !/^[0-9a-f]{64}$/.test(values.sign))
    throw new Error('登录链接参数不完整或格式错误，请从来源系统重新进入')
  return { entry: 'PLATFORM', payload: { ...values, timestamp: Number(values.timestamp) }, target }
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
  if (!value) return '/dashboard'
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
