import test from 'node:test'
import assert from 'node:assert/strict'
import { expandDashboardResponse } from '../src/idmp/features/dashboard/compactResponse.js'

function fixture() {
  return {
    generatedAt: '2026-10-07T16:00:00+08:00', responseFormat: 'COMPACT', formatVersion: 1,
    widgets: {
      bar: { status: 'READY', dataSetId: 'd1', resultId: null, snapshotId: '102027642463093213' },
      table: { status: 'READY', dataSetId: 'd1', resultId: null, snapshotId: '102027642463093213' },
      error: { status: 'ERROR', dataSetId: 'd2', errorCode: 'COMMON-40000', message: '筛选字段不支持' },
    },
    dataSets: {
      d1: { fields: [{ code: '科室' }], rows: [{ 科室: '14', value: 0, numeratorValue: 0, denominatorValue: 10, snapshotId: '102027642463093214' }, { 科室: null, value: null }],
        rowDrillContexts: [{ contextId: 'c1', filters: { 科室: '14', 病种: ['A', 'B'] } }, { contextId: 'c1', filters: { 科室: '__UNASSIGNED__' } }],
        drillContexts: { c1: { resultId: '102027642463093215', snapshotId: '102027642463093213', drillPathVersionId: '102027642463093216', currentLevel: 'DOCTOR', parentKeys: { 医院: '1' }, filters: {}, fieldLevels: { 科室: 1, 医生: 2 } } },
      },
      d2: { fields: [], rows: [], rowDrillContexts: [], drillContexts: {} },
    },
  }
}

test('expands every row losslessly and shares dataset objects between widgets', () => {
  const result = expandDashboardResponse(fixture())
  assert.equal(result.generatedAt, '2026-10-07T16:00:00+08:00')
  assert.equal(result.widgets.bar.rows, result.widgets.table.rows)
  assert.equal(result.widgets.bar.fields, result.widgets.table.fields)
  assert.deepEqual(result.widgets.bar.rows[0].drillContext.filters, { 科室: '14', 病种: ['A', 'B'] })
  assert.deepEqual(result.widgets.bar.rows[1].drillContext.filters, { 科室: '__UNASSIGNED__' })
  assert.equal(result.widgets.bar.rows[0].drillContext.resultId, '102027642463093215')
  assert.equal(result.widgets.bar.rows[0].snapshotId, '102027642463093214')
  assert.equal(result.widgets.bar.rows[0].value, 0)
  assert.equal(result.widgets.bar.rows[1].value, null)
  assert.equal(result.widgets.error.status, 'ERROR')
  assert.deepEqual(result.widgets.error.rows, [])
  assert.ok(!Object.hasOwn(result, 'dataSets'))
  assert.ok(!Object.hasOwn(result.widgets.bar, 'dataSetId'))
})

test('does not mutate the compact response or leak row scopes into each other', () => {
  const input = fixture()
  const original = structuredClone(input)
  const output = expandDashboardResponse(input)
  assert.deepEqual(input, original)
  assert.notEqual(output.widgets.bar.rows[0].drillContext, output.widgets.bar.rows[1].drillContext)
  assert.deepEqual(input.dataSets.d1.drillContexts.c1.filters, {})
})

test('supports rows without drill contexts and preserves explicit null filters', () => {
  const input = fixture()
  input.dataSets.d1.rowDrillContexts[0] = null
  input.dataSets.d1.rowDrillContexts[1].filters = null
  const result = expandDashboardResponse(input)
  assert.ok(!Object.hasOwn(result.widgets.bar.rows[0], 'drillContext'))
  assert.equal(result.widgets.bar.rows[1].drillContext.filters, null)
})

test('keeps old backend and explicitly full responses unchanged', () => {
  for (const input of [null, undefined, { widgets: {} }, { responseFormat: 'FULL', widgets: {} }]) {
    assert.equal(expandDashboardResponse(input), input)
  }
})

test('rejects malformed compact references with a readable error', () => {
  const mutations = [
    input => { input.formatVersion = 2 },
    input => { delete input.dataSets.d1 },
    input => { input.dataSets.d1.rowDrillContexts.pop() },
    input => { input.dataSets.d1.rowDrillContexts[0].contextId = 'unknown' },
    input => { delete input.dataSets.d1.rowDrillContexts[0].filters },
    input => { input.widgets.bar = null },
    input => { input.dataSets.d1 = null },
    input => { input.dataSets.d1.drillContexts.c1 = null },
  ]
  for (const mutate of mutations) {
    const input = fixture()
    mutate(input)
    assert.throws(() => expandDashboardResponse(input), /看板数据格式不完整/)
  }
})
