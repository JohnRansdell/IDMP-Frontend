import { computed, reactive, readonly } from 'vue'
import {
  clearAccessToken,
  getAccessToken,
  requestJson,
  setAccessToken,
  setSessionRecoveryHandler
} from '@/idmp/api/request'

const state = reactive({
  status: 'idle',
  user: null,
  roles: [],
  permissions: [],
  dataScopes: [],
  menus: [],
  expiresInSeconds: 0,
  csrfToken: ''
})

let refreshPromise = null
let restorePromise = null

export const sessionState = readonly(state)
export const isAuthenticated = computed(() => state.status === 'authenticated' && Boolean(getAccessToken()))

export function hasPermission(permissionCode) {
  if (!permissionCode) return true
  return state.roles.includes('SYSTEM_ADMIN') || state.permissions.includes(permissionCode)
}

export async function loginWithPassword(payload) {
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    skipSessionRecovery: true
  })
  applyLoginResult(result)
  await hydrateCurrentUser().catch(() => null)
  return result
}

export async function hydrateCurrentUser() {
  const result = await requestJson('/auth/me', { skipSessionRecovery: true })
  applyCurrentUser(result)
  return result
}

export function refreshSession() {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const csrfToken = readCsrfToken() || state.csrfToken
      const result = await requestJson('/auth/refresh', {
        method: 'POST',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
        body: JSON.stringify({}),
        skipSessionRecovery: true
      })
      applyLoginResult(result)
      await hydrateCurrentUser().catch(() => null)
      return true
    } catch {
      clearSession()
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export function restoreSession() {
  if (restorePromise) return restorePromise
  restorePromise = (async () => {
    state.status = 'restoring'
    try {
      if (getAccessToken()) {
        await hydrateCurrentUser()
        return true
      }
      return await refreshSession()
    } catch {
      return await refreshSession()
    } finally {
      if (state.status === 'restoring') state.status = getAccessToken() ? 'authenticated' : 'anonymous'
      restorePromise = null
    }
  })()
  return restorePromise
}

export async function logoutSession(allSessions = false) {
  const csrfToken = readCsrfToken() || state.csrfToken
  try {
    return await requestJson(allSessions ? '/auth/logout-all' : '/auth/logout', {
      method: 'POST',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      body: JSON.stringify({}),
      skipSessionRecovery: true
    })
  } finally {
    clearSession()
  }
}

function applyLoginResult(result = {}) {
  setAccessToken(result.accessToken)
  state.user = result.user || state.user
  state.permissions = asArray(result.permissions)
  state.expiresInSeconds = Number(result.expiresInSeconds || 0)
  state.csrfToken = result.csrfToken || state.csrfToken
  state.status = result.accessToken ? 'authenticated' : 'anonymous'
}

function applyCurrentUser(result = {}) {
  state.user = result.user || result
  state.roles = asArray(result.roles || result.user?.roles)
  state.permissions = asArray(result.permissions)
  state.dataScopes = asArray(result.dataScopes)
  state.menus = asArray(result.menus)
  state.status = getAccessToken() ? 'authenticated' : 'anonymous'
}

function clearSession() {
  clearAccessToken()
  state.status = 'anonymous'
  state.user = null
  state.roles = []
  state.permissions = []
  state.dataScopes = []
  state.menus = []
  state.expiresInSeconds = 0
  state.csrfToken = ''
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
