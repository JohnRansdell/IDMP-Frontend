import { requestJson } from '@/idmp/api/request'
import { expandDashboardResponse } from '../../features/dashboard/compactResponse.js'

const DEFAULT_DASHBOARD_CODE = 'quality-overview'

export function fetchDashboardCatalog(options = {}) {
  return requestJson('/analysis/dashboards', options)
}

export function createDashboard({ code: _code, ...payload }, options = {}) {
  return requestJson('/analysis/dashboards', {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchDashboardDefinition(code = DEFAULT_DASHBOARD_CODE, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(code)}`, options)
}

export function queryDashboard(code = DEFAULT_DASHBOARD_CODE, payload = {}, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(code)}/query`, {
    timeoutMs: 90000,
    ...options,
    method: 'POST',
    body: JSON.stringify({ responseFormat: 'COLUMNAR', ...payload })
  }).then(expandDashboardResponse)
}

export function saveDashboard(id, payload, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}`, {
    ...options,
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function deleteDashboard(id, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}`, { ...options, method: 'DELETE' })
}

export function copyDashboard(id, { code: _code, ...payload } = {}, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/copy`, {
    ...options,
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function publishDashboard(id, resourceVersion, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/publish`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function fetchDashboardVersions(id, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/versions`, options)
}

export function restoreDashboardVersion(id, versionId, options = {}) {
  return requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function fetchDashboardDataSources(options = {}) {
  return requestJson('/analysis/dashboard-data-sources', options)
}

export function fetchDashboardDataSourceFields(code, options = {}) {
  const { indicatorVersionId, ...requestOptions } = options
  const query = indicatorVersionId ? `?indicatorVersionId=${encodeURIComponent(indicatorVersionId)}` : ''
  return requestJson(`/analysis/dashboard-data-sources/${encodeURIComponent(code)}/fields${query}`, requestOptions)
}

export function previewDashboardWidget(payload, options = {}) {
  const { code: _code, clientKey: _clientKey, ...widget } = payload.widget
  const previewPayload = { ...payload, widget }
  return requestJson('/analysis/dashboard-query/preview', {
    ...options,
    method: 'POST',
    body: JSON.stringify({ responseFormat: 'COLUMNAR', ...previewPayload })
  }).then(result => result?.responseFormat === 'COLUMNAR' ? expandDashboardResponse(result).widgets.preview : result)
}

export function fetchDashboardDataSourcePeriods(code, options = {}) {
  return requestJson(`/analysis/dashboard-data-sources/${encodeURIComponent(code)}/available-periods`, options)
}

export function fetchDashboardFilterOptions(code, payload = {}, options = {}) {
  return requestJson(`/analysis/dashboard-data-sources/${encodeURIComponent(code)}/filter-options`, {
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
