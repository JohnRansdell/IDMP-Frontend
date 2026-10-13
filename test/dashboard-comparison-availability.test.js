import test from 'node:test'
import assert from 'node:assert/strict'
import { explainComparisonAvailability } from '../src/idmp/features/dashboard/comparisonAvailability.js'
import { widgetEmptyGuidance } from '../src/idmp/features/dashboard/widgetGuidance.js'

const widget = { type: 'chart', chartKind: 'bar', config: { dataBinding: { dimensions: [{ field: '科室', label: '科室' }], measures: [{ field: 'value' }] } } }
const fields = [{ id: '科室', semanticType: 'dimension' }, { id: 'value', semanticType: 'measure' }]
const overview = value => ({ status: 'READY', fields, rows: [{ value }] })

test('summary-only indicators explain the missing comparison and offer KPI conversion without inventing chart rows', async () => {
  const raw = { status: 'EMPTY', fields, rows: [] }
  const result = await explainComparisonAvailability(widget, raw, async () => overview(12))
  assert.equal(result.comparisonAvailability.status, 'SUMMARY_ONLY')
  assert.equal(result.rows, raw.rows)
  const guidance = widgetEmptyGuidance({ status: 'empty' }, result)
  assert.equal(guidance.action, 'kpi')
  assert.match(guidance.description, /汇总值/)
  assert.equal(raw.comparisonAvailability, undefined)
})

test('zero comparisons and zero summaries are valid data', async () => {
  const zero = { status: 'READY', fields, rows: [{ 科室: 'A', value: 0 }] }
  assert.equal(await explainComparisonAvailability(widget, zero, async () => { throw new Error('should not request overview') }), zero)
  const summary = await explainComparisonAvailability(widget, { status: 'EMPTY', fields, rows: [] }, async () => overview(0))
  assert.equal(summary.comparisonAvailability.status, 'SUMMARY_ONLY')
})

test('missing classification and missing values lead to field-specific guidance', async () => {
  const noDimension = await explainComparisonAvailability(widget, { status: 'READY', fields, rows: [{ value: 12 }] }, async () => overview(null))
  assert.equal(noDimension.comparisonAvailability.status, 'NO_DIMENSION_VALUES')
  assert.equal(widgetEmptyGuidance({ status: 'empty' }, noDimension, { binding: widget.config.dataBinding }).action, 'configure')
  const noValue = await explainComparisonAvailability(widget, { status: 'READY', fields, rows: [{ 科室: 'A', value: null }] }, async () => { throw new Error('unnecessary overview') })
  assert.equal(noValue.comparisonAvailability.status, 'NO_MEASURE_VALUES')
  assert.match(widgetEmptyGuidance({ status: 'empty' }, noValue).title, /缺少指标值/)
})

test('empty results and failed diagnostic requests do not claim a summary exists', async () => {
  for (const load of [async () => overview(null), async () => { throw new Error('timeout') }]) {
    const result = await explainComparisonAvailability(widget, { status: 'EMPTY', fields, rows: [] }, load)
    assert.equal(result.comparisonAvailability.status, 'NO_COMPARISON_ROWS')
    assert.equal(widgetEmptyGuidance({ status: 'empty' }, result).action, 'filters')
  }
})

test('invalid bindings and primary request failures retain their existing repair actions', async () => {
  const load = async () => { throw new Error('must not probe') }
  const invalid = { status: 'READY', fields: [], rows: [{ value: 12 }] }
  assert.equal(await explainComparisonAvailability(widget, invalid, load), invalid)
  const failed = { status: 'ERROR', fields, rows: [], message: '原请求失败' }
  assert.equal(await explainComparisonAvailability(widget, failed, load), failed)
  assert.equal(widgetEmptyGuidance({ status: 'empty' }, failed).action, 'retry')
})
