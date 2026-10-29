import { requestJson } from '@/idmp/api/request'
import { expandDashboardResponse } from '../../features/dashboard/compactResponse.js'
import { completeDashboardSourceBindings } from '../adapters/dashboardSourceIdentity.js'

const DEFAULT_DASHBOARD_CODE = 'quality-overview'

export function fetchIndicatorGroupingTargets(versionId, options = {}) {
  return requestJson(`/analysis/indicator-versions/${encodeURIComponent(versionId)}/grouping-targets`, options)
}

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

async function completeVersions(versions, options) {
  return completeDashboardSourceBindings(versions, {
    fetchVersion: id => requestJson(`/indicator-versions/${encodeURIComponent(id)}`, options),
    fetchIndicator: id => requestJson(`/indicators/${encodeURIComponent(id)}`, options),
    signal: options.signal
  })
}

async function completeDefinition(detail, options) {
  if (!detail?.version) return detail
  const [version] = await completeVersions([detail.version], options)
  return { ...detail, version }
}

export async function fetchDashboardDefinition(code = DEFAULT_DASHBOARD_CODE, options = {}) {
  return completeDefinition(await requestJson(`/analysis/dashboards/${encodeURIComponent(code)}`, options), options)
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

export async function fetchDashboardVersions(id, options = {}) {
  return completeVersions(await requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/versions`, options), options)
}

export async function restoreDashboardVersion(id, versionId, options = {}) {
  return completeDefinition(await requestJson(`/analysis/dashboards/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, {
    ...options,
    method: 'POST',
    body: JSON.stringify({})
  }), options)
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
