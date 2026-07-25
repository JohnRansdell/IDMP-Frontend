import { requestJson } from '@/idmp/api/request'
import { mockDashboardCatalog, mockDashboardDefinition, mockDashboardQueryResult } from '@/idmp/features/dashboard/mockData'

const DEFAULT_DASHBOARD_CODE = 'quality-overview'

export function fetchDashboardCatalog() {
  return requestJson('/analysis/dashboards')
}

export function fetchDashboardDefinition(code = DEFAULT_DASHBOARD_CODE) {
  return requestJson(`/analysis/dashboards/${code}`)
}

export function queryDashboard(code = DEFAULT_DASHBOARD_CODE, payload = {}) {
  return requestJson(`/analysis/dashboards/${code}/query`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function fetchDashboardBootstrap(code = DEFAULT_DASHBOARD_CODE, query = {}) {
  try {
    const [catalog, definition, queryResult] = await Promise.all([
      fetchDashboardCatalog(),
      fetchDashboardDefinition(code),
      queryDashboard(code, query)
    ])
    return { catalog, definition, queryResult, mocked: false }
  } catch {
    return {
      catalog: mockDashboardCatalog,
      definition: mockDashboardDefinition,
      queryResult: mockDashboardQueryResult,
      mocked: true
    }
  }
}
