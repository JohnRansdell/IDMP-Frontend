import test from 'node:test'
import assert from 'node:assert/strict'
import { isCompleteTrialPeriod, normalizeTrialPeriodRecommendation, recommendationPeriod, resolveTrialPeriod } from '../src/idmp/utils/trialPeriodRecommendation.js'

test('trial recommendation normalizes the 3.5 response without changing its half-open end', () => {
  const recommendation = normalizeTrialPeriodRecommendation({ data: {
    factorVersionId: 102027642460303040,
    availabilityStatus: 'AVAILABLE',
    recommendedPeriodStart: '2026-03-21T00:00:00',
    recommendedPeriodEnd: '2026-04-07T00:00:00',
    estimatedMatchedRecordCount: 954,
    targetExceeded: false
  } })
  assert.equal(recommendation.factorVersionId, '102027642460303040')
  assert.deepEqual(recommendationPeriod(recommendation), ['2026-03-21T00:00:00', '2026-04-07T00:00:00'])
})

test('recommended period is used when the user has not selected a complete period', () => {
  const recommendation = { recommendedPeriodStart: '2026-03-21T00:00:00', recommendedPeriodEnd: '2026-04-07T00:00:00' }
  assert.deepEqual(resolveTrialPeriod([], recommendation), { period: ['2026-03-21T00:00:00', '2026-04-07T00:00:00'], source: 'RECOMMENDED' })
})

test('a visible user period takes precedence over the recommendation', () => {
  const recommendation = { recommendedPeriodStart: '2026-03-21T00:00:00', recommendedPeriodEnd: '2026-04-07T00:00:00' }
  assert.deepEqual(resolveTrialPeriod(['2026-01-01T00:00:00', '2026-02-01T00:00:00'], recommendation), { period: ['2026-01-01T00:00:00', '2026-02-01T00:00:00'], source: 'USER_OR_VISIBLE' })
  assert.equal(isCompleteTrialPeriod(['2026-02-01T00:00:00', '2026-01-01T00:00:00']), false)
})
