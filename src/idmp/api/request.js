import { sanitizeResponseMessages, toUserMessage } from '../utils/userMessage.js'

export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || '/api/v1'
const AUTH_TOKEN_STORAGE_KEY = 'idmp_access_token'
const QUERY_CACHE_MAX_ENTRIES = 80
const QUERY_CACHE_MAX_CHARS = 24_000_000
const QUERY_CACHE_MAX_ENTRY_CHARS = 1_000_000
const queryCache = new Map()
let queryCacheChars = 0
let queryCacheGeneration = 0
let sessionRecoveryHandler = null

function clearQueryCache() {
  queryCache.clear()
  queryCacheChars = 0
  queryCacheGeneration += 1
}

function cacheTtl(path, method) {
  if (/^\/(?:auth|async-tasks|calc|compile-artifacts|sql-imports)(?:\/|\?|$)/.test(path)
    || /^\/me\/notifications(?:\/|\?|$)/.test(path)
    || /^\/analysis\/warnings(?:\/|\?|$)/.test(path)
    || /\/trials(?:\/|\?|$)/.test(path)
    || /\/oauth\/callback(?:\?|$)/.test(path)) return 0
  if (method === 'GET') return 30_000
  if (method === 'POST' && /^\/analysis\/dashboards\/[^/]+\/query$/.test(path)) return 30_000
  if (method === 'POST' && /^\/(?:factor|indicator)-versions\/[^/]+\/query$/.test(path)) return 30_000
  return 0
}

function isReadOnlyPost(path) {
  return /^\/analysis\/dashboards\/[^/]+\/query$/.test(path)
    || /^\/(?:factor|indicator)-versions\/[^/]+\/query$/.test(path)
    || /^\/analysis\/dashboard-(?:query\/preview|data-sources\/[^/]+\/filter-options)$/.test(path)
    || /^\/analysis\/results\/[^/]+\/drill\/search$/.test(path)
    || /^\/transform-rule-versions\/[^/]+\/preview$/.test(path)
    || /^\/indicator-versions\/drill-capabilities$/.test(path)
}

function readQueryCache(key) {
  const entry = queryCache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    queryCache.delete(key)
    queryCacheChars -= entry.size
    return undefined
  }
  queryCache.delete(key)
  queryCache.set(key, entry)
  return structuredClone(entry.value)
}

function saveQueryCache(key, value, size, ttl) {
  if (size > QUERY_CACHE_MAX_ENTRY_CHARS) return
  const previous = queryCache.get(key)
  if (previous) queryCacheChars -= previous.size
  queryCache.delete(key)
  queryCache.set(key, { value: structuredClone(value), size, expiresAt: Date.now() + ttl })
  queryCacheChars += size
  while (queryCache.size > QUERY_CACHE_MAX_ENTRIES || queryCacheChars > QUERY_CACHE_MAX_CHARS) {
    const oldestKey = queryCache.keys().next().value
    const oldest = queryCache.get(oldestKey)
    queryCacheChars -= oldest.size
    queryCache.delete(oldestKey)
  }
}

export function setSessionRecoveryHandler(handler) {
  sessionRecoveryHandler = typeof handler === 'function' ? handler : null
}

export function getAccessToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || ''
}

export function setAccessToken(token) {
  clearQueryCache()
  if (token) {
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  } else {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  }
}

export function clearAccessToken() {
  clearQueryCache()
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
  const method = String(fetchOptions.method || 'GET').toUpperCase()
  const ttl = cacheTtl(path, method)
  const cacheable = ttl > 0 && !['no-store', 'reload'].includes(fetchOptions.cache)
    && !Object.keys(optionHeaders || {}).length
  const cacheKey = cacheable ? `${method}:${path}:${fetchOptions.body || ''}` : ''
  if (cacheable && !externalSignal?.aborted) {
    const cached = readQueryCache(cacheKey)
    if (cached !== undefined) return cached
  }
  const cacheGeneration = queryCacheGeneration

  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  let didTimeout = false
  const timeoutId = controller && timeoutMs > 0 ? globalThis.setTimeout(() => { didTimeout = true; controller.abort() }, timeoutMs) : null
  const abortFromExternalSignal = () => controller?.abort()
  if (controller && externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true })
  }

  let response
  let responseText
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
      credentials: fetchOptions.credentials || 'include',
      ...(controller ? { signal: controller.signal } : {})
    })
    // Keep the timeout active until the body has been fully received. Fetch
    // resolves at headers, so clearing it immediately after fetch can leave
    // callers waiting forever on a stalled response stream.
    responseText = await response.text()
  } catch (error) {
    if (error?.name === 'AbortError' && didTimeout) {
      const timeoutError = new Error('请求超时，请稍后重试。')
      timeoutError.status = 408
      timeoutError.code = 'REQUEST_TIMEOUT'
      timeoutError.path = path
      throw timeoutError
    }
    if (error instanceof TypeError) {
      const networkError = new Error('无法连接服务，请检查网络后重试。')
      networkError.code = 'NETWORK_ERROR'
      networkError.path = path
      networkError.cause = error
      throw networkError
    }
    throw error
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
    if (externalSignal && controller) externalSignal.removeEventListener('abort', abortFromExternalSignal)
  }

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
    const error = new Error(/^\s*(?:<!doctype html|<html)/i.test(responseText || '')
      ? '服务暂时无法返回数据，请稍后重试；若持续出现请联系管理员。'
      : '服务返回的数据暂时无法读取，请稍后重试。')
    error.path = path
    error.status = response.status
    throw error
  }

  if (payload && payload.code !== undefined && payload.code !== '0' && payload.code !== 'OK') {
    throw createApiError(Number(payload.status || 422), payload, path)
  }

  const result = sanitizeResponseMessages(payload?.data ?? payload)
  if (cacheable && queryCacheGeneration === cacheGeneration) {
    saveQueryCache(cacheKey, result, responseText.length, ttl)
  } else if (!cacheable && method !== 'GET' && !path.startsWith('/auth/') && !isReadOnlyPost(path)) {
    clearQueryCache()
  }
  return result
}

export function createApiError(status, payload = {}, path = '') {
  const serverMessage = typeof payload?.message === 'string' ? payload.message
    : typeof payload?.error === 'string' ? payload.error : ''
  const fallback = status === 401 ? '登录状态已失效，请重新登录。'
      : status === 403 ? '当前账号没有权限执行此操作。'
        : status === 404 ? '请求的内容不存在或已失效。'
          : status === 408 || status === 504 ? '请求超时，请稍后重试。'
            : status === 429 ? '请求过于频繁，请稍后重试。'
              : status >= 500 ? '服务暂时不可用，请稍后重试。' : '请求未能完成，请检查输入后重试。'
  const traceId = payload?.traceId || payload?.traceID || payload?.requestId || ''
  const error = new Error(toUserMessage(serverMessage, fallback))
  error.status = Number(status) || 0
  error.code = payload?.code
  error.traceId = traceId
  error.path = path
  error.payload = payload
  error.rawMessage = serverMessage
  return error
}

export async function requestPdf(path, body, { timeoutMs = 60000, skipSessionRecovery = false } = {}) {
  const controller = new AbortController()
  let didTimeout = false
  const timer = setTimeout(() => { didTimeout = true; controller.abort() }, timeoutMs)
  try {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST', credentials: 'include', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    const contentType = response.headers.get('Content-Type') || ''
    if (!response.ok || !contentType.toLowerCase().startsWith('application/pdf')) {
      const text = await response.text()
      const payload = parseJsonPreservingLargeIntegers(text) || {
        message: response.status === 413 ? '导出内容过大，请缩小分析时间范围后重试。' : 'PDF 导出失败，请稍后重试。'
      }
      if (response.status === 401) {
        if (!skipSessionRecovery && sessionRecoveryHandler && await sessionRecoveryHandler()) {
          return requestPdf(path, body, { timeoutMs, skipSessionRecovery: true })
        }
        clearAccessToken()
        if (!skipSessionRecovery && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('idmp:unauthorized', { detail: { path } }))
      }
      throw createApiError(response.ok ? 422 : response.status, payload, path)
    }
    const blob = await response.blob()
    if (!blob.size || blob.size > 20_000_000 || await blob.slice(0, 5).text() !== '%PDF-') {
      throw new Error('服务未返回有效的 PDF 文件，请稍后重试。')
    }
    return blob
  } catch (error) {
    if (error?.name === 'AbortError' && didTimeout) throw new Error('PDF 导出超时，请缩小分析范围后重试。')
    if (error instanceof TypeError) throw new Error('无法连接服务，请检查网络后重试。')
    throw error
  } finally { clearTimeout(timer) }
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
