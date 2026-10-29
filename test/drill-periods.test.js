import assert from 'node:assert/strict'
import test from 'node:test'
import { drillPeriodAnchor, drillPeriodKey, drillPeriodOptions } from '../src/idmp/features/analysis/drillPeriods.js'

const point = (start, end, resultId) => ({ periodStart: `${start}T00:00:00`, periodEnd: `${end}T00:00:00`, resultId })

test('monthly periods are deduplicated, labelled and sorted newest first', () => {
  const march = point('2026-03-01', '2026-04-01')
  const april = point('2026-04-01', '2026-05-01')
  assert.deepEqual(drillPeriodOptions({ trend: [march, april, march], overview: april }, 'MONTHLY'), [
    { value: '2026-04-01/2026-05-01', label: '2026年4月', periodStart: '2026-04-01', periodEnd: '2026-05-01' },
    { value: '2026-03-01/2026-04-01', label: '2026年3月', periodStart: '2026-03-01', periodEnd: '2026-04-01' }
  ])
})

test('quarter and year labels handle calendar boundaries', () => {
  assert.equal(drillPeriodOptions({ overview: point('2025-10-01', '2026-01-01') }, 'QUARTERLY')[0].label, '2025年第4季度')
  assert.equal(drillPeriodOptions({ overview: point('2025-01-01', '2026-01-01') }, 'YEARLY')[0].label, '2025年')
  assert.equal(drillPeriodOptions({ overview: point('2024-02-01', '2024-03-01') }, 'MONTHLY')[0].label, '2024年2月')
})

test('does not invent periods or present a partial/incorrect period as a complete month, quarter or year', () => {
  assert.deepEqual(drillPeriodOptions({}, 'MONTHLY'), [])
  assert.deepEqual(drillPeriodOptions({ trend: [point('2026-04-01', '2026-04-07'), point('2026-13-01', '2027-02-01'), {}] }, 'MONTHLY'), [])
  assert.deepEqual(drillPeriodOptions({ overview: point('2026-02-01', '2026-05-01') }, 'QUARTERLY'), [])
  assert.deepEqual(drillPeriodOptions({ overview: point('2026-04-01', '2027-04-01') }, 'YEARLY'), [])
})

test('custom drill anchors belong to the selected period, never to a stale latest period', () => {
  const paths = [{ pathCode: 'CUSTOM_DEPT' }]
  const analysis = {
    overview: point('2026-04-01', '2026-05-01'),
    dimensionComparison: [
      { ...point('2026-04-01', '2026-05-01', 'april'), dimensions: { out_dept_code: 'A' } },
      { ...point('2026-03-01', '2026-04-01', 'march'), dimensions: { out_dept_code: 'A' } }
    ]
  }
  assert.deepEqual(drillPeriodAnchor(analysis, '2026-03-01/2026-04-01', paths), {
    resultId: 'march', pathResultIds: { CUSTOM_DEPT: 'march' }
  })
  assert.equal(drillPeriodAnchor(analysis, '2025-01-01/2025-02-01', paths).resultId, '')
  assert.equal(drillPeriodKey(null), '')
  assert.deepEqual(drillPeriodAnchor(null, '', paths), { resultId: '', pathResultIds: {} })
})
