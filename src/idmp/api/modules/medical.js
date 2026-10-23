import { requestJson } from '../request'
import { adaptDrillResult } from '../adapters/drill'

const read = { cache: 'no-store', credentials: 'omit', skipSessionRecovery: true }
const post = (path, body) => requestJson(path, { ...read, method: 'POST', body: JSON.stringify(body) })
const dashboardPath = id => `/medical/dashboards/${encodeURIComponent(id)}`
export const exchangeMedicalToken = token => post('/auth/sso/exchange', { token })
export const fetchMedicalSession = () => requestJson('/medical/session', read)
export const exchangeDashboardAccess = parameters => post('/medical/dashboard-access/exchange', parameters)
export const openMedicalDashboard = id => post(`${dashboardPath(id)}/open`, {})
export const fetchMedicalCatalog = () => requestJson('/medical/dashboards', read)
export const fetchMedicalDashboard = id => requestJson(dashboardPath(id), read)
export const queryMedicalDashboard = (id, body) => post(`${dashboardPath(id)}/query`, body)
export const fetchMedicalPeriods = (id, code) => requestJson(`${dashboardPath(id)}/widgets/${encodeURIComponent(code)}/periods`, read)
export const fetchMedicalDrillPath = (id, ticket, resultId) => requestJson(`${dashboardPath(id)}/drill-path?${new URLSearchParams({ drillTicket: ticket, resultId })}`, read)
export function searchMedicalDrill(id, ticket, resultId, payload, options = {}) {
  return requestJson(`${dashboardPath(id)}/drill`, {
    ...read, ...options, method: 'POST', body: JSON.stringify({ ...payload, pathCode: undefined, resultId, drillTicket: ticket })
  }).then(adaptDrillResult)
}
