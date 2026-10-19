import { requestJson } from '@/idmp/api/request'
import { adaptDrillResult } from '@/idmp/api/adapters/drill'

export async function searchResultDrill(resultId, payload = {}, options = {}) {
  const source = options.source || 'live'
  options.signal?.throwIfAborted()
  if (source !== 'live') throw new Error('演示下钻入口已停用，请从真实计算结果重新进入。')
  if (!String(resultId || '').trim()) throw new Error('缺少真实结果 ID，请从指标分析或看板重新进入。')
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/drill/search`, {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify(payload)
  }).then(adaptDrillResult)
}

export function fetchResultFactors(resultId, options = {}) {
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/factors`, options)
}

export function fetchResultFactorDependencies(resultId, factorResultId) {
  return requestJson(`/analysis/results/${encodeURIComponent(resultId)}/factors/${encodeURIComponent(factorResultId)}/dependencies`)
}
