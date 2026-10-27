import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { closedPeriodToQuery, formatResultPeriod, formatResultPeriodField, resultPeriodToClosedRange } from '../src/idmp/utils/periodRange.js'
import { diagnosticPeriodQuery, diagnosticResults } from '../src/idmp/features/analysis/calculationDiagnostics.js'
import { recommendationPeriod } from '../src/idmp/utils/trialPeriodRecommendation.js'
import { targetPeriod } from '../src/idmp/utils/calculationGraph.js'
import { warningEventPeriod } from '../src/idmp/features/warnings/eventDetail.js'
import { formatTrendPeriodLabel } from '../src/idmp/features/analysis/trendPresentation.js'
import { buildReportSummaryRequest } from '../src/idmp/features/analysis/reportQuery.js'

for (const [start, end, next] of [
  ['2026-03-01', '2026-03-31', '2026-04-01'],
  ['2024-02-01', '2024-02-29', '2024-03-01'],
  ['2026-12-01', '2026-12-31', '2027-01-01'],
  ['2026-03-18', '2026-03-18', '2026-03-19']
]) {
  test(`closed dates include the entire last day and render identically across surfaces: ${start}`, () => {
    const payload = { periodStart: start, periodEnd: end, parameters: { 科室: '9012' } }
    const query = closedPeriodToQuery(payload)
    assert.deepEqual(query, { ...payload, periodStart: `${start}T00:00:00`, periodEnd: `${next}T00:00:00` })
    const label = `${start} 至 ${end}`
    assert.equal(formatResultPeriod(query.periodStart, query.periodEnd), label)
    assert.equal(warningEventPeriod(query), label)
    assert.equal(targetPeriod(query), label)
    assert.equal(formatTrendPeriodLabel(query, 'CUSTOM'), label)
    assert.equal(formatResultPeriodField('period_end', query.periodEnd), end)
    assert.deepEqual(resultPeriodToClosedRange(query.periodStart, query.periodEnd, { dates: true }), [start, end])
    const recommendation = recommendationPeriod({ recommendedPeriodStart: query.periodStart, recommendedPeriodEnd: query.periodEnd })
    assert.deepEqual(closedPeriodToQuery({ periodStart: recommendation[0], periodEnd: recommendation[1] }), { periodStart: query.periodStart, periodEnd: query.periodEnd })
    assert.equal(payload.periodEnd, end)
    const instant = buildReportSummaryRequest({ versionId: '1', range: [start, end], granularity: 'CUSTOM' })
    assert.equal(instant.payload.periodEnd, query.periodEnd)
  })
}

test('second and millisecond precision preserve both selected endpoints without including the next unit', () => {
  for (const [end, next] of [['2026-03-18T12:34:56', '2026-03-18T12:34:57'], ['2026-03-18T23:59:59', '2026-03-19T00:00:00'], ['2026-03-18T12:34:56.999', '2026-03-18T12:34:57.000']]) {
    const query = closedPeriodToQuery({ periodStart: end, periodEnd: end })
    assert.equal(query.periodEnd, next)
    const inside = Date.parse(end + 'Z'), boundary = Date.parse(next + 'Z')
    assert.ok(inside >= Date.parse(query.periodStart + 'Z') && inside < boundary)
    assert.equal(boundary < Date.parse(query.periodEnd + 'Z'), false)
  }
  assert.equal(formatResultPeriod('2026-03-18T12:00:00', '2026-03-18T12:34:57'), '2026-03-18 12:00:00 至 2026-03-18 12:34:56.999')
})

test('invalid ranges are rejected while static queries and missing labels remain unchanged', () => {
  for (const payload of [{ periodStart: '2026-02-30', periodEnd: '2026-03-01' }, { periodStart: '2026-03-02', periodEnd: '2026-03-01' }, { periodStart: '2026-03-01' }]) assert.throws(() => closedPeriodToQuery(payload))
  assert.deepEqual(closedPeriodToQuery({ parameters: { 科室: '9012' } }), { parameters: { 科室: '9012' } })
  assert.equal(formatResultPeriod(null, null), '-')
  assert.equal(targetPeriod({ periodType: 'STATIC', periodStart: '1000-01-01', periodEnd: '9999-12-31' }), '静态')
})

for (const [file, functions] of [
  ['factors', ['trialFactorVersion', 'queryFactorVersion']], ['indicators', ['trialIndicatorVersion', 'queryIndicatorVersion']],
  ['calculation', ['createCalcBatch']], ['sqlImports', ['trialSqlImport']]
]) {
  test(`${file} API boundary converts each closed user range exactly once`, async () => {
    const code = (await readFile(new URL(`../src/idmp/api/modules/${file}.js`, import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace(/^export /gm, '')
    const calls = []
    const api = Function('requestJson', 'closedPeriodToQuery', `${code}; return { ${functions.join(',')} }`)((path, options) => { calls.push({ path, ...options }); return Promise.resolve({}) }, closedPeriodToQuery)
    for (const name of functions) for (const payload of [
      { periodStart: '2026-03-01', periodEnd: '2026-03-31' },
      { periodStart: '2026-03-18T12:34:56', periodEnd: '2026-03-18T12:34:56' },
      { parameters: { 科室: '9012' } }
    ]) {
      await (name === 'createCalcBatch' ? api[name](payload) : api[name]('123', payload))
      assert.deepEqual(JSON.parse(calls.at(-1).body), closedPeriodToQuery(payload))
    }
  })
}

test('diagnostics request closed dates but match stored exclusive periods without spilling into next month', () => {
  const query = diagnosticPeriodQuery('1', ['2026-03-01', '2026-03-31'])
  assert.equal(query.periodEnd, '2026-03-31')
  const rows = [{ resultId: '2', periodStart: '2026-03-01', periodEnd: '2026-04-01' }, { resultId: '3', periodStart: '2026-04-01', periodEnd: '2026-05-01' }]
  assert.deepEqual(diagnosticResults({ indicatorVersionId: '1', trend: rows }, query), [rows[0]])
})
