const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const AUTH_TOKEN_STORAGE_KEY = 'idmp_access_token'

export function getAccessToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
}

export function setAccessToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  }
}

export function clearAccessToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

export async function requestJson(path, options = {}) {
  const token = getAccessToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...options
  })

  const responseText = await response.text().catch(() => '')
  const payload = parseJsonPreservingLargeIntegers(responseText)
  if (!response.ok) {
    const message = payload?.message || `HTTP ${response.status}`
    throw new Error(message)
  }

  if (!payload) {
    throw new Error('Invalid API response')
  }

  if (payload && payload.code !== undefined && payload.code !== '0' && payload.code !== 'OK') {
    throw new Error(payload.message || payload.code)
  }

  return payload?.data ?? payload
}

function parseJsonPreservingLargeIntegers(text) {
  if (!text) return null

  try {
    return JSON.parse(quoteUnsafeIntegers(text))
  } catch {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
}

function quoteUnsafeIntegers(text) {
  return text.replace(/(:\s*)(-?\d{16,})(\s*[,}\]])/g, '$1"$2"$3')
}
