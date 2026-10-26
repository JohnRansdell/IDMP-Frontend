import { requestJson } from '@/idmp/api/request'
import {
  hydrateCurrentUser,
  loginWithPassword,
  logoutSession,
  refreshSession,
  restoreSession
} from '@/idmp/auth/session'

export function fetchHealth() {
  return requestJson('/health', { cache: 'no-store' })
}

export const login = loginWithPassword
export const restoreLoginSession = restoreSession
export const refreshLoginSession = refreshSession
export const fetchCurrentUser = hydrateCurrentUser

export function logout() { return logoutSession(false) }
export function logoutAll() { return logoutSession(true) }

export function fetchSystemUsers() {
  return requestJson('/system/users', { cache: 'no-store' })
}

export function fetchSystemRoles() {
  return requestJson('/system/roles', { cache: 'no-store' })
}

export function fetchSystemUser(userId) {
  return requestJson(`/system/users/${encodeURIComponent(userId)}`, { cache: 'no-store' })
}

export async function assignSystemUserRoles(userId, roleIds) {
  // Read current profile fields so a role-only edit does not restore stale user details.
  const detail = await fetchSystemUser(userId)
  return requestJson(`/system/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...detail.user, roleIds })
  })
}

export function setUserNotificationBinding(userId, provider, payload) {
  return requestJson(`/system/users/${encodeURIComponent(userId)}/notification-bindings/${encodeURIComponent(provider)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}
