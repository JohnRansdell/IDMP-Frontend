import { requestJson } from '@/idmp/api/request'
import { adaptDrillResult } from '@/idmp/api/adapters/drill'
import { createMockDrillResult } from '@/idmp/features/analysis/drillData'

export function searchResultDrill(resultId, payload = {}, options = {}) {
  const source = options.source || 'live'
  if (source === 'mock') return Promise.resolve(adaptDrillResult(createMockDrillResult(resultId, payload)))
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/drill/search`, {
    method: 'POST',
    body: JSON.stringify(payload)
  }).then(adaptDrillResult)
}

export function fetchResultFactors(resultId) {
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/factors`)
}
