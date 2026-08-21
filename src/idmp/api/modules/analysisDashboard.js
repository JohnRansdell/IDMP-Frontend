import { requestJson } from '@/idmp/api/request'

const DEFAULT_DASHBOARD_CODE = 'quality-overview'

export function fetchDashboardCatalog(options = {}) {
  return requestJson('/analysis/dashboards', options)
}

export function fetchDashboardDefinition(code = DEFAULT_DASHBOARD_CODE, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(code)}`, options)
}

export function queryDashboard(code = DEFAULT_DASHBOARD_CODE, payload = {}, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(code)}/query`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function fetchDashboardBootstrap(code = DEFAULT_DASHBOARD_CODE, query = {}, options = {}) {
  const [definition, queryResult] = await Promise.all([
    fetchDashboardDefinition(code, options),
    queryDashboard(code, query, options)
  ])
  return { definition, queryResult }
}
