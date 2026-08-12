import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePeriodType,
  scenarioDetailToForm,
  scenarioFormToPatch
} from '../src/idmp/api/adapters/scenario.js'

test('scenario period adapter normalizes supported and legacy values', () => {
  assert.equal(normalizePeriodType(' monthly '), 'MONTHLY')
  assert.equal(normalizePeriodType('MONTH'), 'MONTHLY')
  assert.equal(normalizePeriodType('月度'), 'MONTHLY')
  assert.equal(normalizePeriodType({ code: 'YEAR' }), 'YEARLY')
})

test('scenario detail exposes an unknown period as unselected', () => {
  const form = scenarioDetailToForm({
    scenario: { id: 1 },
    version: { id: 2, defaultPeriodType: 'EVERY_TWO_MONTHS' }
  })

  assert.equal(form.defaultPeriodType, '')
})

test('scenario patch sends only an API-supported period value', () => {
  assert.equal(scenarioFormToPatch({ defaultPeriodType: '季度' }).defaultPeriodType, 'QUARTERLY')
  assert.throws(
    () => scenarioFormToPatch({ defaultPeriodType: 'EVERY_TWO_MONTHS' }),
    /默认统计周期无效/
  )
})
