import { requestJson } from '@/idmp/api/request'

export function previewSqlIndicatorImport(payload, options = {}) {
  return requestJson('/sql-imports/indicators/preview', {
    method: 'POST',
    signal: options.signal,
    timeoutMs: options.timeoutMs || 60000,
    body: JSON.stringify(payload)
  })
}

export function createSqlIndicatorImport(payload) {
  return requestJson('/sql-imports/indicators', {
    method: 'POST',
    timeoutMs: 120000,
    body: JSON.stringify(payload)
  })
}
