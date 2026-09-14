import { requestJson } from '@/idmp/api/request'

export function previewSqlIndicatorImport(payload, options = {}) {
  return requestJson('/sql-imports/indicators/preview', {
    method: 'POST',
    signal: options.signal,
    timeoutMs: options.timeoutMs || 60000,
    body: JSON.stringify(payload)
  })
}

export function createSqlIndicatorImport(payload, idempotencyKey) {
  return requestJson('/sql-imports/indicators', {
    method: 'POST',
    // The endpoint creates an asynchronous, resumable import task. Do not
    // keep this request open while the worker compiles and trials resources.
    timeoutMs: 30000,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function fetchSqlIndicatorImport(importId, options = {}) {
  return requestJson(`/sql-imports/indicators/${encodeURIComponent(importId)}`, {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 30000
  })
}

export function retrySqlIndicatorImport(importId, idempotencyKey) {
  return requestJson(`/sql-imports/indicators/${encodeURIComponent(importId)}/retry`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({})
  })
}

export function abandonSqlIndicatorImport(importId, reason, idempotencyKey) {
  return requestJson(`/sql-imports/indicators/${encodeURIComponent(importId)}/abandon`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({ reason: String(reason || '').trim() })
  })
}
