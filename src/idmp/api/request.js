const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })

  const payload = await response.json().catch(() => null)
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
