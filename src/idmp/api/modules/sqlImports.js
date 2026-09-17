import { requestJson } from '@/idmp/api/request'

export function createSqlImport(payload, idempotencyKey, options = {}) {
  return requestJson('/sql-imports', {
    method: 'POST',
    signal: options.signal,
    timeoutMs: options.timeoutMs || 30000,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function updateSqlImportMetadata(importId, payload) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}/metadata`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function trialSqlImport(importId, payload, idempotencyKey) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}/trial`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function finalizeSqlImport(importId, idempotencyKey) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}/finalize`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({})
  })
}

export function fetchSqlImport(importId, options = {}) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}`, {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 30000
  })
}

export function retrySqlImport(importId, idempotencyKey) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}/retry`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({})
  })
}

export function abandonSqlImport(importId, reason, idempotencyKey) {
  return requestJson(`/sql-imports/${encodeURIComponent(importId)}/abandon`, {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({ reason: String(reason || '').trim() })
  })
}
