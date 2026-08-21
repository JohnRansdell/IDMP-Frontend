export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const AUTH_TOKEN_STORAGE_KEY = 'idmp_access_token'
let sessionRecoveryHandler = null

export function setSessionRecoveryHandler(handler) {
  sessionRecoveryHandler = typeof handler === 'function' ? handler : null
}

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
  const {
    headers: optionHeaders,
    timeoutMs = 30000,
    signal: externalSignal,
    skipSessionRecovery = false,
    ...fetchOptions
  } = options
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...optionHeaders
  }

  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timeoutId = controller && timeoutMs > 0 ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null
  if (controller && externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      credentials: fetchOptions.credentials || 'include',
      ...(controller ? { signal: controller.signal } : {})
    })
  } catch (error) {
    if (error?.name === 'AbortError' && timeoutId) {
      const timeoutError = new Error(`请求超时（${timeoutMs}ms）`)
      timeoutError.status = 408
      timeoutError.code = 'REQUEST_TIMEOUT'
      timeoutError.path = path
      throw timeoutError
    }
    throw error
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }

  const responseText = await response.text().catch(() => '')
  const payload = parseJsonPreservingLargeIntegers(responseText)
  if (!response.ok) {
    const error = createApiError(response.status, payload, path)
    if (response.status === 401) {
      const isAuthEndpoint = path.startsWith('/auth/')
      if (!skipSessionRecovery && !isAuthEndpoint && sessionRecoveryHandler) {
        const recovered = await sessionRecoveryHandler()
        if (recovered) {
          return requestJson(path, { ...options, skipSessionRecovery: true })
        }
      }
      clearAccessToken()
      if (!skipSessionRecovery && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('idmp:unauthorized', { detail: { path } }))
      }
    }
    throw error
  }

  if (!payload) {
    throw new Error('Invalid API response')
  }

  if (payload && payload.code !== undefined && payload.code !== '0' && payload.code !== 'OK') {
    throw createApiError(Number(payload.status || 422), payload, path)
  }

  return payload?.data ?? payload
}

export function createApiError(status, payload = {}, path = '') {
  const message = payload?.message || payload?.error || `HTTP ${status}`
  const traceId = payload?.traceId || payload?.traceID || payload?.requestId || ''
  const error = new Error(traceId ? `${message} (traceId: ${traceId})` : message)
  error.status = Number(status) || 0
  error.code = payload?.code
  error.traceId = traceId
  error.path = path
  error.payload = payload
  return error
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
