import { computed, reactive, readonly } from 'vue'
import { canAccess, canVisit, firstAccessiblePath } from './permissions.js'
import { setStorageUser } from './userStorage.js'
import {
  clearAccessToken,
  getAccessToken,
  requestJson,
  setAccessToken,
  isMedicalSession,
  setMedicalAccessToken,
  invalidateRequestSession,
  setSessionRecoveryHandler
} from '@/idmp/api/request'

const state = reactive({
  revision: 0,
  status: 'idle',
  user: null,
  roles: [],
  permissions: [],
  dataScopes: [],
  menus: [],
  apiRules: [],
  deniedPaths: [],
  expiresInSeconds: 0,
  csrfToken: ''
})

let refreshPromise = null
let restorePromise = null
let sessionRevision = 0

export const sessionState = readonly(state)
export const isAuthenticated = computed(() => state.status === 'authenticated' && Boolean(getAccessToken()))

export function hasPermission(permissionCode) {
  if (!permissionCode) return true
  return state.roles.some(role => ['ADMIN', 'SYSTEM_ADMIN'].includes(role)) || state.permissions.includes(permissionCode)
}

export const canRequest = (method, path) => canAccess(state, method, path)
export const canNavigate = target => canVisit(state, target)
export const accessibleHome = () => firstAccessiblePath(state)

export async function loginWithPassword(payload) {
  clearSession()
  const revision = ++sessionRevision
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipSessionRecovery: true
  })
  if (revision !== sessionRevision) throw new Error('登录状态已变更，请重新登录')
  applyLoginResult(result)
  try { await hydrateCurrentUser() }
  catch (error) { if (revision === sessionRevision) clearSession(); throw error }
  if (revision !== sessionRevision) throw new Error('登录状态已变更，请重新登录')
  return result
}

export async function loginWithMedicalToken(token, entry = 'PLATFORM') {
  setMedicalAccessToken('', entry)
  clearSession()
  const revision = sessionRevision
  const { exchangeMedicalToken } = await import('@/idmp/api/modules/medical')
  const result = await exchangeMedicalToken(token, entry)
  if (revision !== sessionRevision) throw new Error('登录状态已变更，请重新登录')
  setMedicalAccessToken(result.session.accessToken, entry)
  state.user = result.session.user
  setStorageUser(state.user)
  state.roles = asArray(result.session.user?.roles)
  state.permissions = asArray(result.session.permissions)
  state.expiresInSeconds = Number(result.session.expiresInSeconds || 0)
  state.csrfToken = ''
  state.status = 'authenticated'
  if (entry === 'PLATFORM') {
    try { await hydrateCurrentUser() }
    catch (error) { if (revision === sessionRevision) clearSession(); throw error }
    if (revision !== sessionRevision) throw new Error('登录状态已变更，请重新登录')
  }
  return result
}

export async function hydrateCurrentUser() {
  const revision = sessionRevision
  const result = await requestJson('/auth/me', { skipSessionRecovery: true })
  if (revision === sessionRevision) applyCurrentUser(result)
  return result
}

export function refreshSession() {
  if (isMedicalSession()) { expireSession(); return Promise.resolve(false) }
  if (refreshPromise) return refreshPromise
  const revision = sessionRevision
  refreshPromise = (async () => {
    await Promise.resolve()
    try {
      const csrfToken = readCsrfToken() || state.csrfToken
      if (!csrfToken) { expireSession(); return false }
      const result = await requestJson('/auth/refresh', {
        method: 'POST',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        body: JSON.stringify({}),
        skipSessionRecovery: true
      })
      if (revision !== sessionRevision) return false
      applyLoginResult(result, true)
      await hydrateCurrentUser()
      return revision === sessionRevision && isAuthenticated.value
    } catch {
      if (revision === sessionRevision) expireSession()
      return false
    } finally {
      if (revision === sessionRevision) refreshPromise = null
    }
  })()
  return refreshPromise
}

export function restoreSession() {
  if (restorePromise) return restorePromise
  const revision = sessionRevision
  restorePromise = (async () => {
    state.status = 'restoring'
    try {
      if (getAccessToken()) {
        await hydrateCurrentUser()
        return revision === sessionRevision && isAuthenticated.value
      }
      if (revision !== sessionRevision) return false
      return await refreshSession()
    } catch {
      if (revision !== sessionRevision) return false
      return await refreshSession()
    } finally {
      if (revision === sessionRevision) {
        if (state.status === 'restoring') state.status = getAccessToken() ? 'authenticated' : 'anonymous'
        restorePromise = null
      }
    }
  })()
  return restorePromise
}

export function ensureAuthenticatedSession() {
  if (isAuthenticated.value) return Promise.resolve(true)
  if (state.status === 'anonymous') return Promise.resolve(false)
  return restoreSession()
}

export function invalidateSession() { clearSession() }

export async function logoutSession(allSessions = false) {
  const revision = ++sessionRevision
  invalidateRequestSession()
  const medical = isMedicalSession()
  const csrfToken = medical ? '' : readCsrfToken() || state.csrfToken
  try {
    return await requestJson(medical ? '/medical/logout' : allSessions ? '/auth/logout-all' : '/auth/logout', {
      method: 'POST',
      credentials: medical ? 'omit' : 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: JSON.stringify({}),
      skipSessionRecovery: true
    })
  } finally {
    if (revision === sessionRevision) {
      clearSession()
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('idmp:logout'))
    }
  }
}

function applyLoginResult(result = {}, preserveSession = false) {
  setAccessToken(result.accessToken, { preserveSession })
  state.user = result.user || state.user
  setStorageUser(state.user)
  state.roles = asArray(result.user?.roles)
  state.permissions = asArray(result.permissions)
  state.expiresInSeconds = Number(result.expiresInSeconds || 0)
  state.csrfToken = result.csrfToken || state.csrfToken
  state.status = result.accessToken ? 'authenticated' : 'anonymous'
}

function applyCurrentUser(result = {}) {
  state.user = result.user || result
  setStorageUser(state.user)
  state.roles = asArray(result.roles || result.user?.roles)
  state.permissions = asArray(result.permissions)
  state.dataScopes = asArray(result.dataScopes)
  state.menus = asArray(result.menus)
  state.apiRules = asArray(result.apiRules)
  state.deniedPaths = asArray(result.deniedPaths)
  state.status = getAccessToken() ? 'authenticated' : 'anonymous'
}

function clearSession() {
  sessionRevision += 1
  state.revision += 1
  refreshPromise = null
  restorePromise = null
  clearAccessToken()
  setStorageUser(null)
  state.status = 'anonymous'
  state.user = null
  state.roles = []
  state.permissions = []
  state.dataScopes = []
  state.menus = []
  state.apiRules = []
  state.deniedPaths = []
  state.expiresInSeconds = 0
  state.csrfToken = ''
}

function expireSession() {
  const notify = state.status === 'authenticated'
  clearSession()
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event('idmp:unauthorized'))
}

function readCsrfToken() {
  if (typeof document === 'undefined') return ''
  const entry = document.cookie.split('; ').find((item) => item.startsWith('IDMP_REFRESH_CSRF='))
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : ''
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

setSessionRecoveryHandler(refreshSession)
