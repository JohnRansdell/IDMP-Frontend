import { requestJson } from '../request'
import { adaptDrillResult } from '../adapters/drill'

const read = { cache: 'no-store', credentials: 'omit', skipSessionRecovery: true }
const post = (path, body, options = {}) => requestJson(path, { ...read, ...options, method: 'POST', body: JSON.stringify(body) })
const dashboardPath = id => `/medical/dashboards/${encodeURIComponent(id)}`
export const exchangeMedicalToken = (token, entry = 'PLATFORM') => post('/auth/sso/exchange', { token, entry })
export const fetchMedicalSession = () => requestJson('/medical/session', read)
export const exchangeDashboardAccess = parameters => post('/medical/dashboard-access/exchange', parameters)
export const openMedicalDashboard = id => post(`${dashboardPath(id)}/open`, {})
export const fetchMedicalCatalog = () => requestJson('/medical/dashboards', read)
export const fetchMedicalDashboard = (id, options = {}) => requestJson(dashboardPath(id), { ...read, ...options })
export const fetchMedicalDashboardMetadata = (id, options = {}) => requestJson(`${dashboardPath(id)}/metadata`, { ...read, ...options })
export const queryMedicalDashboard = (id, body, options = {}) => post(`${dashboardPath(id)}/query`, body, options)
export const fetchMedicalFilterOptions = (id, code, body) => post(`${dashboardPath(id)}/widgets/${encodeURIComponent(code)}/filter-options`, body)
export const fetchMedicalPeriods = (id, code) => requestJson(`${dashboardPath(id)}/widgets/${encodeURIComponent(code)}/periods`, read)
export const fetchMedicalGroupingTargets = (id, code) => requestJson(`${dashboardPath(id)}/widgets/${encodeURIComponent(code)}/grouping-targets`, read)
export const searchMedicalQueryDrill = (id, code, payload, options = {}) => post(`${dashboardPath(id)}/widgets/${encodeURIComponent(code)}/query-drill`, payload, { timeoutMs: 120000, ...options }).then(adaptDrillResult)
export const fetchMedicalDrillPath = (id, ticket, resultId) => requestJson(`${dashboardPath(id)}/drill-path?${new URLSearchParams({ drillTicket: ticket, resultId })}`, read)
export function searchMedicalDrill(id, ticket, resultId, payload, options = {}) {
  return requestJson(`${dashboardPath(id)}/drill`, {
    ...read, ...options, method: 'POST', body: JSON.stringify({ ...payload, pathCode: undefined, resultId, drillTicket: ticket })
  }).then(adaptDrillResult)
}
