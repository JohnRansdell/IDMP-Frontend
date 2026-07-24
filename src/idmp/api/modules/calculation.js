import { requestJson } from '@/idmp/api/request'

export function createCalcBatch(payload, idempotencyKey) {
  return requestJson('/calc/batches', {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function fetchAsyncTask(taskId) {
  return requestJson(`/async-tasks/${taskId}`)
}

export function fetchCalcBatch(batchId) {
  return requestJson(`/calc/batches/${batchId}`)
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
