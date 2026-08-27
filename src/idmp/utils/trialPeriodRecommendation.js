export function normalizeTrialPeriodRecommendation(payload = {}) {
  const data = payload?.data ?? payload ?? {}
  return {
    factorVersionId: toText(data.factorVersionId),
    availabilityStatus: String(data.availabilityStatus || '').toUpperCase(),
    sourceTimeColumn: toText(data.sourceTimeColumn),
    earliestDataDate: toText(data.earliestDataDate),
    latestDataDate: toText(data.latestDataDate),
    recommendedPeriodStart: toText(data.recommendedPeriodStart),
    recommendedPeriodEnd: toText(data.recommendedPeriodEnd),
    estimatedMatchedRecordCount: toNumberOrNull(data.estimatedMatchedRecordCount),
    targetMaxRecordCount: toNumberOrNull(data.targetMaxRecordCount),
    recommendedWindowDays: toNumberOrNull(data.recommendedWindowDays),
    maxWindowDays: toNumberOrNull(data.maxWindowDays),
    targetExceeded: data.targetExceeded === true || data.targetExceeded === 'true',
    recommendationReason: toText(data.recommendationReason)
  }
}

export function isCompleteTrialPeriod(period) {
  return Array.isArray(period) && period.length === 2 && Boolean(period[0]) && Boolean(period[1]) && String(period[0]) < String(period[1])
}

export function recommendationPeriod(recommendation) {
  const period = [recommendation?.recommendedPeriodStart || '', recommendation?.recommendedPeriodEnd || '']
  return isCompleteTrialPeriod(period) ? period : []
}

export function resolveTrialPeriod(selectedPeriod, recommendation) {
  if (isCompleteTrialPeriod(selectedPeriod)) return { period: [...selectedPeriod], source: 'USER_OR_VISIBLE' }
  const period = recommendationPeriod(recommendation)
  return period.length ? { period, source: 'RECOMMENDED' } : { period: [], source: '' }
}

function toText(value) { return value === undefined || value === null ? '' : String(value) }
function toNumberOrNull(value) { return value === undefined || value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value) }
