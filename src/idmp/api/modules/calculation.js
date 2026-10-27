import { requestJson } from '@/idmp/api/request'
import { closedPeriodToQuery } from '../../utils/periodRange.js'

export function createCalcBatch(payload, idempotencyKey) {
  return requestJson('/calc/batches', {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(closedPeriodToQuery(payload))
  })
}

export function fetchAsyncTask(taskId) {
  return requestJson(`/async-tasks/${taskId}`)
}

export function fetchCalcBatch(batchId, options = {}) {
  return requestJson(`/calc/batches/${batchId}`, options)
}

export function fetchCalcNodeResults(nodeId, pageNum = 1, pageSize = 20, options = {}) {
  const query = new URLSearchParams({ pageNum: String(pageNum), pageSize: String(pageSize) })
  return requestJson(`/calc/nodes/${encodeURIComponent(nodeId)}/results?${query}`, { signal: options.signal })
}

export function cancelCalcBatch(batchId) {
  return requestJson(`/calc/batches/${batchId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export function retryCalcNode(nodeId) {
  return requestJson(`/calc/nodes/${nodeId}/retry`, {
    method: 'POST',
    body: JSON.stringify({})
  })
}
