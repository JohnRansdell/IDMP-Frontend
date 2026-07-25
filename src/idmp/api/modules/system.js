import { clearAccessToken, requestJson, setAccessToken } from '@/idmp/api/request'

export function fetchHealth() {
  return requestJson('/health')
}

export async function login(payload) {
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  setAccessToken(result.accessToken)
  return result
}

export async function logout() {
  try {
    return await requestJson('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({})
    })
  } finally {
    clearAccessToken()
  }
}

export function fetchSystemUsers() {
  return requestJson('/system/users')
}

export function createSystemRole(payload) {
  return requestJson('/system/roles', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
