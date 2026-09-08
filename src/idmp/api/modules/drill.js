import { requestJson } from '@/idmp/api/request'
import { adaptDrillResult } from '@/idmp/api/adapters/drill'
import { createMockDrillResult } from '@/idmp/features/analysis/drillData'

export async function searchResultDrill(resultId, payload = {}, options = {}) {
  const source = options.source || 'live'
  options.signal?.throwIfAborted()
  if (source === 'mock') {
    await Promise.resolve()
    return adaptDrillResult(createMockDrillResult(resultId, payload, options))
  }
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/drill/search`, {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify(payload)
  }).then(adaptDrillResult)
}

export function fetchResultFactors(resultId) {
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/factors`)
}
