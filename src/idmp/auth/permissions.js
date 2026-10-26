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

const routes = [
  [/^\/dashboard\/manage$/, 'POST', '/analysis/dashboards'],
  [/^\/dashboard$/, 'GET', '/analysis/dashboards'],
  [/^\/indicator\/import\/sql$/, 'POST', '/sql-imports'],
  [/^\/indicator\/recycle-bin$/, 'GET', '/indicators/recycle-bin'],
  [/^\/indicator\/edit(?:\/.*)?$/, 'POST', '/indicators'],
  [/^\/indicator(?:\/view\/[^/]+)?$/, 'GET', '/indicators'],
  [/^\/factor\/templates\/new$/, 'POST', '/factor-templates'],
  [/^\/factor\/templates\/.*\/instantiate$/, 'POST', '/factor-template-versions/1/instantiate'],
  [/^\/factor\/templates\/.+$/, 'PATCH', '/factor-template-versions/1'],
  [/^\/factor\/templates$/, 'GET', '/factor-templates'],
  [/^\/factor\/recycle-bin$/, 'GET', '/factors/recycle-bin'],
  [/^\/factor\/edit(?:\/.*)?$/, 'POST', '/factors'],
  [/^\/factor(?:\/view\/[^/]+)?$/, 'GET', '/factors'],
  [/^\/scenarios\/[^/]+\/edit$/, 'POST', '/scenarios'],
  [/^\/scenarios$/, 'GET', '/scenarios'],
  [/^\/mapping(?:\/.*)?$/, 'GET', '/mappings'],
  [/^\/analysis\/drill$/, 'POST', '/analysis/results/1/drill/search'],
  [/^\/analysis$/, 'GET', '/analysis/indicators/1/analysis'],
  [/^\/alerts$/, 'GET', '/analysis/warnings'],
  [/^\/calc$/, 'GET', '/calc/batches/1'],
  [/^\/data\/sources$/, 'GET', '/meta/source-tables'],
  [/^\/data\/domains(?:\/.*)?$/, 'GET', '/meta/data-domains'],
  [/^\/data\/value-sets\/new$/, 'POST', '/meta/value-sets'],
  [/^\/data\/value-set-versions\/.+\/edit$/, 'PATCH', '/meta/value-set-versions/1'],
  [/^\/data\/value-sets(?:\/.*)?$/, 'GET', '/meta/value-sets'],
  [/^\/data\/standardization\/.*$/, 'POST', '/transform-rule-versions/1/preview'],
  [/^\/policies$/, 'GET', '/meta/policy-files'],
  [/^\/system$/, 'GET', '/system/users']
]

export function canVisit(session, target) {
  const path = typeof target === 'string' ? target.split('?')[0] : target.path
  if (path === '/forbidden') return true
  if (path === '/dashboard' && typeof target !== 'string' && target.query?.edit)
    return canAccess(session, 'PUT', '/analysis/dashboards/1')
  const rule = routes.find(([pattern]) => pattern.test(path))
  return rule ? canAccess(session, rule[1], rule[2]) : session.roles?.some(role => ['SYSTEM_ADMIN', 'ADMIN'].includes(role)) || false
}

export function firstAccessiblePath(session) {
  return ['/dashboard', '/indicator', '/factor', '/alerts', '/calc', '/data/sources', '/policies', '/system']
    .find(path => canVisit(session, path)) || '/forbidden'
}
