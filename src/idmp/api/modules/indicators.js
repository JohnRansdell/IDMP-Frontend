import { requestJson, requestPdf } from '@/idmp/api/request'
import { normalizeIndicatorAnalysisParams, normalizeIndicatorRangeSummaryParams } from '@/idmp/api/adapters/indicator'
import { fetchAllPages } from '../pagination.js'

export const fetchAllIndicators = (params = {}, options = {}) => fetchAllPages(page => fetchIndicators(page, options), params)
export const fetchAllIndicatorVersions = (params = {}) => fetchAllPages(fetchIndicatorVersionList, params)
export const fetchAllIndicatorScenarios = (id, params = {}) => fetchAllPages(page => fetchIndicatorScenarios(id, page), params)

export function fetchIndicators(params = {}, options = {}) {
  return requestJson(withQuery('/indicators', params), options)
}

export function fetchIndicator(indicatorId) {
  return requestJson(`/indicators/${indicatorId}`)
}

export function fetchIndicatorVersions(indicatorId, options = {}) {
  return requestJson(`/indicators/${indicatorId}/versions`, options)
}

export function fetchIndicatorVersionList(params = {}) {
  return requestJson(withQuery('/indicator-versions', params))
}

export function fetchIndicatorVersion(versionId, options = {}) {
  return requestJson(`/indicator-versions/${versionId}`, options)
}

export function preflightIndicatorDrillCapabilities(formula, options = {}) {
  return requestJson('/indicator-versions/drill-capabilities', {
    method: 'POST',
    signal: options.signal,
    body: JSON.stringify({ formula, ...(options.drillPaths !== undefined ? { drillPaths: options.drillPaths } : {}), ...(options.factorDimensionBindings !== undefined ? { factorDimensionBindings: options.factorDimensionBindings } : {}) })
  })
}

export function createIndicator(payload) {
  return requestJson('/indicators', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateIndicator(indicatorId, payload) {
  return requestJson(`/indicators/${indicatorId}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function fetchIndicatorDeletionImpact(indicatorId) {
  return requestJson(`/indicators/${encodeURIComponent(indicatorId)}/deletion-impact`)
}

export function deleteIndicator(indicatorId, payload) {
  return requestJson(`/indicators/${encodeURIComponent(indicatorId)}`, {
    method: 'DELETE',
    body: JSON.stringify(payload)
  })
}

export function fetchIndicatorRecycleBin(params = {}) {
  return requestJson(withQuery('/indicators/recycle-bin', params))
}

export function fetchIndicatorRecycleDetail(indicatorId) {
  return requestJson(`/indicators/recycle-bin/${encodeURIComponent(indicatorId)}`)
}

export function restoreIndicator(indicatorId, resourceVersion) {
  return requestJson(`/indicators/recycle-bin/${encodeURIComponent(indicatorId)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ resourceVersion })
  })
}

export function createIndicatorVersion(indicatorId, payload = {}) {
  return requestJson(`/indicators/${indicatorId}/versions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function saveIndicatorFormula(versionId, payload) {
  return requestJson(`/indicator-versions/${versionId}/formula`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function compileIndicatorFormula(versionId, payload) {
  return requestJson(`/indicator-versions/${versionId}/formula/compile`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function trialIndicatorVersion(versionId, payload, idempotencyKey) {
  return requestJson(`/indicator-versions/${versionId}/trial`, {
    method: 'POST',
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify(payload)
  })
}

export function queryIndicatorVersion(versionId, payload, options = {}) {
  return requestJson(`/indicator-versions/${encodeURIComponent(versionId)}/query`, {
    method: 'POST',
    timeoutMs: 120000,
    cache: options.cache,
    body: JSON.stringify(payload)
  })
}

export function publishIndicatorVersion(versionId, idempotencyKey) {
  return requestJson(`/indicator-versions/${versionId}/publish`, {
    method: 'POST',
    timeoutMs: 60000,
    headers: idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({})
  })
}

export function fetchIndicatorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/indicator-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}

export function fetchIndicatorScenarios(indicatorId, params = {}) {
  return requestJson(withQuery(`/indicators/${encodeURIComponent(indicatorId)}/scenarios`, params), { cache: 'no-store' })
}

export function fetchIndicatorAvailablePeriod(versionId) {
  return requestJson(`/indicator-versions/${encodeURIComponent(versionId)}/available-period`)
}

export function fetchIndicatorAnalysis(indicatorId, params = {}, options = {}) {
  return requestJson(withQuery(
    `/analysis/indicators/${indicatorId}/analysis`,
    normalizeIndicatorAnalysisParams(params)
  ), options)
}

export function exportIndicatorAnalysisPdf(indicatorId, report) {
  return requestPdf(`/analysis/indicators/${encodeURIComponent(indicatorId)}/export/pdf`, report)
}

export function fetchIndicatorGrainOptions(indicatorId, params = {}) {
  return requestJson(withQuery(
    `/analysis/indicators/${encodeURIComponent(indicatorId)}/grain-options`,
    normalizeIndicatorAnalysisParams(params)
  ))
}

export function fetchIndicatorRangeSummary(indicatorId, params = {}) {
  return requestJson(withQuery(
    `/analysis/indicators/${encodeURIComponent(indicatorId)}/range-summary`,
    normalizeIndicatorRangeSummaryParams(params)
  ))
}

export function fetchIndicatorScenarioComparison(indicatorId, params = {}) {
  return requestJson(withQuery(
    `/analysis/indicators/${encodeURIComponent(indicatorId)}/scenario-comparison`,
    normalizeIndicatorAnalysisParams(params)
  ))
}

function withQuery(path, params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.filter(item => item !== undefined && item !== null && item !== '').forEach(item => query.append(key, String(item)))
      return
    }
    query.set(key, String(value))
  })
  const queryText = query.toString()
  return queryText ? `${path}?${queryText}` : path
}
