import { requestJson } from '@/idmp/api/request'
import {
  hydrateCurrentUser,
  loginWithPassword,
  logoutSession,
  refreshSession,
  restoreSession
} from '@/idmp/auth/session'

export function fetchHealth() {
  return requestJson('/health')
}

export const login = loginWithPassword
export const restoreLoginSession = restoreSession
export const refreshLoginSession = refreshSession
export const fetchCurrentUser = hydrateCurrentUser

export function logout() { return logoutSession(false) }
export function logoutAll() { return logoutSession(true) }

export function fetchSystemUsers() {
  return requestJson('/system/users')
}

export function createSystemRole(payload) {
  return requestJson('/system/roles', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
