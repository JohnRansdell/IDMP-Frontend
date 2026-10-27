import { ACTION_GRANTS, PAGE_ACCESS, resolveAccessGrant } from './accessPolicy.js'
// Use the same method/path grants returned by /auth/me as the API authorization filter.
export function matchesPath(pattern, path) {
  if (!pattern || !path) return false
  const segments = pattern.split('/').filter(Boolean)
  const escaped = segments.map((segment, index) => segment === '**'
    ? index === segments.length - 1 ? '(?:/.*)?' : '(?:/[^/]+)*'
    : '/' + segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('')
  return new RegExp(`^${escaped}(?:/)?$`).test(path)
}

export function canAccess(session, method, path) {
  if (session.roles?.some(role => ['SYSTEM_ADMIN', 'ADMIN'].includes(role))) return true
  const fullPath = path.startsWith('/api/v1/') ? path : `/api/v1${path}`
  if (fullPath.startsWith('/api/v1/system/')) return false
  if (session.deniedPaths?.some(pattern => matchesPath(pattern, fullPath))) return false
  if (session.deniedPaths?.length && method !== 'GET' && fullPath === '/api/v1/analysis/warning-rules') return false
  return (session.apiRules || []).some(rule => (!rule.action || rule.action === '*' || rule.action.toUpperCase() === method.toUpperCase())
    && matchesPath(rule.resourcePattern, fullPath))
}


export function canVisit(session, target) {
  const path = typeof target === 'string' ? target.split('?')[0] : target.path
  if (path === '/forbidden') return true
  if (path === '/dashboard' && typeof target !== 'string' && target.query?.edit) {
    const id = String(target.query.id || '')
    // Browser-created drafts have no server resource yet; existing boards require their own update grant.
    if (id.startsWith('dashboard-')) return canAccess(session, ...ACTION_GRANTS['dashboard.create'])
    const grant = id ? resolveAccessGrant({ action: 'dashboard.update', resourceId: id }) : ACTION_GRANTS['dashboard.update']
    return canAccess(session, ...grant)
  }
  const rule = PAGE_ACCESS.find(rule => rule.pattern.test(path))
  if (!rule) return session.roles?.some(role => ['SYSTEM_ADMIN', 'ADMIN'].includes(role)) || false
  const grant = rule.resourceIdGroup
    ? resolveAccessGrant({ action: rule.action, resourceId: rule.pattern.exec(path)?.[rule.resourceIdGroup] })
    : resolveAccessGrant(rule.action)
  return Boolean(grant && canAccess(session, ...grant))
}

export function firstAccessiblePath(session) {
  return PAGE_ACCESS.filter(rule => rule.homePath).sort((a, b) => a.homeOrder - b.homeOrder).map(rule => rule.homePath)
    .find(path => canVisit(session, path)) || '/forbidden'
}
