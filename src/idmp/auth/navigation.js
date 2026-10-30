export function safeLoginRedirect(value, resolve) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
    || /[\\\u0000-\u0020\u007f]/.test(value)) return '/dashboard'
  const target = new URL(value, 'https://idmp.invalid')
  if (target.origin !== 'https://idmp.invalid'
    || /^\/(?:login|auto-login|medical-dashboard)\/?$/i.test(target.pathname)
    || ['token', 'sign', 'dashboardID'].some(key => target.searchParams.has(key))) return '/dashboard'
  if (resolve && !resolve(value).matched.some(record => !record.redirect)) return '/dashboard'
  return `${target.pathname}${target.search}${target.hash}`
}

export function createAuthenticationGuard({ ensureSession, isMedicalDashboard, isMedicalSession = () => false, resolve, canNavigate = () => true, accessibleHome = () => '/dashboard' }) {
  return async to => {
    // These isolated entry pages validate external credentials before fetching any data.
    if (to.path === '/auto-login' || to.path === '/medical-dashboard') return true
    if (isMedicalDashboard() && to.path === '/login') return true
    if (to.query.dashboardID !== undefined) {
      return { path: '/medical-dashboard', query: to.query }
    }
    if (isMedicalDashboard() && to.path !== '/login' && (to.path !== '/dashboard' || to.query.medical !== '1' || to.query.edit)) {
      return { path: '/dashboard', query: { ...(to.path === '/dashboard' && to.query.id ? { id: to.query.id } : {}), medical: '1' } }
    }
    const authenticated = await ensureSession()
    if (to.path === '/login') {
      if (!authenticated) return true
      const redirect = safeLoginRedirect(to.query.redirect, resolve)
      return canNavigate(resolve ? resolve(redirect) : { path: redirect }) ? redirect : accessibleHome()
    }
    if (!authenticated) return { path: '/login', query: { redirect: safeLoginRedirect(to.fullPath, resolve) }, replace: true }
    if (isMedicalDashboard()) return true
    return canNavigate(to) || { path: accessibleHome(), replace: true }
  }
}
