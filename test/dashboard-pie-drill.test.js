import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDrillResult } from '../src/idmp/api/adapters/drill.js'
import { createMockDrillResult, MOCK_SURGERY_DRILL_CONTEXT } from '../src/idmp/features/analysis/drillData.js'
import { createPieDrillRequestGate, getPieNextNavigation, loadPieDrillLevel, numericPieValue, resolvePieDrillRoot } from '../src/idmp/features/dashboard/pieDrill.js'

const target = {
  resultId: 'result-root', snapshotId: 'snapshot', indicatorId: 'indicator', indicatorVersionId: 'version',
  indicatorCode: 'I001', indicatorName: '指标', currentLevel: 'MEDICAL_GROUP',
  parentKeys: { HOSPITAL_CODE: 'hospital', OUT_DEPT_CODE: 'dept' }, period: '过去六个月'
}
const root = resolvePieDrillRoot([target])
const navigation = { currentLevel: 'OUT_DEPT', parentKeys: root.parentKeys, label: '全部科室' }

function rows(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({ dimensionKey: `dept-${offset + index}`, dimensionLabel: `科室${offset + index}`, numerator: 1, denominator: 100, indicatorValue: '1%', nextLevel: 'MEDICAL_GROUP' }))
}

function response(records, payload = {}, overrides = {}) {
  return adaptDrillResult({
    context: { ...target, currentLevel: payload.currentLevel || 'OUT_DEPT', parentKeys: payload.parentKeys || navigation.parentKeys },
    records,
    summary: { numerator: records.length },
    nextLevels: ['MEDICAL_GROUP'],
    pageInfo: { pageNum: payload.pageNum || 1, pageSize: payload.pageSize || 200, total: records.length, totalPages: records.length ? 1 : 0 },
    ...overrides
  })
}

function pagedSearch(allRows, mutate = (value) => value) {
  const calls = []
  const search = async (resultId, payload, options) => {
    calls.push({ resultId, payload, options })
    const start = (payload.pageNum - 1) * payload.pageSize
    return mutate(response(allRows.slice(start, start + payload.pageSize), payload, {
      summary: { numerator: allRows.reduce((sum, row) => sum + (numericPieValue(row.numerator) || 0), 0) },
      pageInfo: { pageNum: payload.pageNum, pageSize: payload.pageSize, total: allRows.length, totalPages: Math.ceil(allRows.length / payload.pageSize) }
    }), payload)
  }
  return { search, calls }
}

test('pie root uses one consistent result, snapshot, version and hospital without department filters', () => {
  const second = { ...target, parentKeys: { ...target.parentKeys, OUT_DEPT_CODE: 'other-dept' } }
  assert.deepEqual(resolvePieDrillRoot([target, second]).parentKeys, { HOSPITAL_CODE: 'hospital' })
  assert.equal(root.currentLevel, 'OUT_DEPT')
  assert.ok(resolvePieDrillRoot([]).error)
  for (const field of ['resultId', 'snapshotId', 'indicatorId', 'indicatorVersionId']) {
    assert.ok(resolvePieDrillRoot([target, { ...second, [field]: 'other' }]).error, field)
  }
  assert.ok(resolvePieDrillRoot([target, { ...second, parentKeys: { HOSPITAL_CODE: 'other' } }]).error)
  assert.ok(resolvePieDrillRoot([target, { ...second, snapshotId: undefined }]).error)
  assert.equal(resolvePieDrillRoot([target], 'mock').source, 'mock')
  root.target.parentKeys.OUT_DEPT_CODE = 'changed-copy'
  assert.equal(target.parentKeys.OUT_DEPT_CODE, 'dept')
})

test('pie values reject missing, negative, non-finite and imprecise numbers without turning absence into zero', () => {
  for (const value of [undefined, null, '', ' ', false, true, [], {}, NaN, Infinity, -1, '1%', '0x20', '0b11', Number.MAX_SAFE_INTEGER + 1, '9007199254740993']) assert.equal(numericPieValue(value), null)
  for (const [input, expected] of [[0, 0], ['0', 0], ['12.5', 12.5], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) assert.equal(numericPieValue(input), expected)
})

test('complete layers use numerator, fixed root result, same snapshot, empty filters and no client sort', async () => {
  const { search, calls } = pagedSearch(rows(3))
  const controller = new AbortController()
  const result = await loadPieDrillLevel(search, root, navigation, { signal: controller.signal })
  assert.equal(result.chartIssue, '')
  assert.equal(result.paged, false)
  assert.equal(result.records.length, 3)
  assert.deepEqual(calls[0], {
    resultId: target.resultId,
    payload: { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: 'hospital' }, filters: {}, pageNum: 1, pageSize: 200, snapshotId: 'snapshot' },
    options: { source: 'live', signal: controller.signal }
  })
})

test('all pages are collected in server order through exactly the 500-row boundary', async () => {
  for (const count of [200, 201, 400, 500]) {
    const sourceRows = rows(count)
    const { search, calls } = pagedSearch(sourceRows)
    const result = await loadPieDrillLevel(search, root, navigation)
    assert.equal(result.chartIssue, '', String(count))
    assert.deepEqual(result.records.map((row) => row.dimensionKey), sourceRows.map((row) => row.dimensionKey))
    assert.equal(calls.length, Math.ceil(count / 200))
    assert.ok(calls.every((call) => call.payload.pageSize <= 200 && call.resultId === target.resultId))
  }
})

test('over 500 rows stays paged and table navigation requests only the selected page', async () => {
  const { search, calls } = pagedSearch(rows(501))
  const result = await loadPieDrillLevel(search, root, navigation)
  assert.equal(result.paged, true)
  assert.match(result.chartIssue, /500/)
  assert.equal(result.records.length, 200)
  assert.equal(calls.length, 1)
  const last = await loadPieDrillLevel(search, root, navigation, { tableOnly: true, pageNum: 3 })
  assert.equal(last.records.length, 101)
  assert.equal(last.pageInfo.pageNum, 3)
  assert.equal(last.paged, true)
  assert.equal(calls.length, 2)
})

test('pagination defaults, absent pages, duplicates and changing totals never become partial pies', async () => {
  const mutations = [
    (result) => ({ ...result, pageInfo: { ...result.pageInfo, hasTotal: false } }),
    (result) => ({ ...result, pageInfo: { ...result.pageInfo, hasPageNum: false } }),
    (result) => ({ ...result, pageInfo: { ...result.pageInfo, hasPageSize: false } }),
    (result) => ({ ...result, pageInfo: { ...result.pageInfo, totalPages: 8 } }),
    (result, payload) => payload.pageNum === 2 ? { ...result, records: [] } : result,
    (result, payload) => payload.pageNum === 2 ? { ...result, pageInfo: { ...result.pageInfo, pageNum: 1 } } : result,
    (result, payload) => payload.pageNum === 2 ? { ...result, pageInfo: { ...result.pageInfo, total: 202 } } : result,
    (result, payload) => payload.pageNum === 2 ? { ...result, records: [{ ...result.records[0], dimensionKey: 'dept-0' }] } : result,
    (result, payload) => payload.pageNum === 2 ? { ...result, summary: { numerator: 900 } } : result
  ]
  for (const mutate of mutations) {
    const { search } = pagedSearch(rows(201), mutate)
    const result = await loadPieDrillLevel(search, root, navigation)
    assert.ok(result.chartIssue)
    assert.equal(result.paged, true)
    assert.equal(result.pageInfo.pageNum, 1)
    assert.equal(result.records.length, 200)
  }
})

test('missing numerator, invalid keys, all-zero values and mismatched sums fall back to a table', async () => {
  for (const records of [
    [{ ...rows(1)[0], numerator: undefined }],
    [{ ...rows(1)[0], numerator: -1 }],
    [{ ...rows(1)[0], numerator: 0 }],
    [{ ...rows(1)[0], dimensionKey: '' }],
    [rows(1)[0], rows(1)[0]]
  ]) {
    const { search } = pagedSearch(records)
    const result = await loadPieDrillLevel(search, root, navigation)
    assert.ok(result.chartIssue)
    assert.equal(result.paged, true)
  }
  const { search } = pagedSearch(rows(2))
  assert.match((await loadPieDrillLevel(search, root, { ...navigation, expectedNumerator: 3 })).chartIssue, /汇总/)
  assert.equal((await loadPieDrillLevel(pagedSearch([]).search, root, navigation)).records.length, 0)
  for (const value of [-1, '', 'invalid']) {
    const invalidSummary = pagedSearch(rows(2), (result) => ({ ...result, summary: { numerator: value } }))
    assert.match((await loadPieDrillLevel(invalidSummary.search, root, navigation)).chartIssue, /汇总/)
  }
})

test('later-page permission/network failures propagate rather than returning a partial chart or mock', async () => {
  for (const status of [401, 403, 409, 500]) {
    const failure = Object.assign(new Error('request failed'), { status })
    const { search } = pagedSearch(rows(201), (result, payload) => {
      if (payload.pageNum === 2) throw failure
      return result
    })
    await assert.rejects(loadPieDrillLevel(search, root, navigation), (error) => error === failure)
  }
})

test('missing or mixed response contexts are errors and never leak into fallback tables', async () => {
  for (const change of [
    { resultId: '' }, { resultId: 'wrong' }, { snapshotId: '' }, { snapshotId: 'wrong' },
    { indicatorId: 'wrong' }, { indicatorVersionId: '' },
    { indicatorVersionId: 'wrong' }, { currentLevel: 'PATIENT' },
    { parentKeys: {} }, { parentKeys: { HOSPITAL_CODE: 'wrong' } }
  ]) {
    const { search } = pagedSearch(rows(1), (result) => ({ ...result, context: { ...result.context, ...change } }))
    await assert.rejects(loadPieDrillLevel(search, root, navigation), { code: 'DRILL_CONTEXT_CONFLICT' })
  }
  for (const change of [{ snapshotId: 'wrong' }, { indicatorVersionId: 'wrong' }, { levelCode: 'PATIENT' }, { parentKeys: { HOSPITAL_CODE: 'wrong' } }]) {
    const { search } = pagedSearch([{ ...rows(1)[0], ...change }])
    await assert.rejects(loadPieDrillLevel(search, root, navigation), { code: 'DRILL_CONTEXT_CONFLICT' })
  }
  await assert.rejects(loadPieDrillLevel(pagedSearch(rows(1), (result) => ({ ...result, dataSource: 'mock' })).search, root, navigation), /演示/)
})

test('contract may omit context indicatorId and rows may identify their own child results', async () => {
  const { search, calls } = pagedSearch([{ ...rows(1)[0], resultId: 'child-result' }], (result) => ({ ...result, context: { ...result.context, indicatorId: '' } }))
  const result = await loadPieDrillLevel(search, root, navigation)
  assert.equal(result.chartIssue, '')
  assert.equal(result.records[0].resultId, 'child-result')
  assert.equal(calls[0].resultId, target.resultId)
})

test('first response binds an absent snapshot across pages and exposes it to future navigation', async () => {
  const withoutSnapshot = resolvePieDrillRoot([{ ...target, snapshotId: undefined }])
  const { search, calls } = pagedSearch(rows(201))
  const result = await loadPieDrillLevel(search, withoutSnapshot, navigation)
  assert.equal('snapshotId' in calls[0].payload, false)
  assert.equal(calls[1].payload.snapshotId, 'snapshot')
  assert.equal(result.context.snapshotId, 'snapshot')
  assert.equal(withoutSnapshot.target.snapshotId, undefined)
  const bad = pagedSearch(rows(201), (value, payload) => payload.pageNum === 2 ? { ...value, context: { ...value.context, snapshotId: 'new' } } : value)
  await assert.rejects(loadPieDrillLevel(bad.search, withoutSnapshot, navigation), { code: 'DRILL_CONTEXT_CONFLICT' })
})

test('configured navigation supports full paths, skipped groups, aliases and doctor terminal level', () => {
  const result = response(rows(1))
  const next = getPieNextNavigation(result, result.records[0], navigation)
  assert.deepEqual(next, { currentLevel: 'MEDICAL_GROUP', parentKeys: { HOSPITAL_CODE: 'hospital', OUT_DEPT_CODE: 'dept-0' }, label: '科室0', expectedNumerator: 1, snapshotId: 'snapshot' })
  assert.deepEqual(navigation.parentKeys, { HOSPITAL_CODE: 'hospital' })
  const groups = response([{ ...rows(1)[0], dimensionKey: 'group', nextLevel: 'DOCTOR' }], next, { nextLevels: ['DOCTOR'] })
  const doctor = getPieNextNavigation(groups, groups.records[0], next)
  assert.equal(doctor.currentLevel, 'ATTENDING_DOCTOR')
  assert.equal(doctor.parentKeys.MEDICAL_GROUP_CODE, 'group')
  assert.equal(getPieNextNavigation(response(rows(1), doctor, { nextLevels: ['PATIENT'] }), rows(1)[0], doctor), null)
  const direct = { ...result, context: { ...result.context, currentLevel: 'DEPARTMENT' }, nextLevels: ['DOCTOR'] }
  const skipped = getPieNextNavigation(direct, { ...result.records[0], nextLevel: 'DOCTOR' }, navigation)
  assert.equal(skipped.currentLevel, 'ATTENDING_DOCTOR')
  assert.equal('MEDICAL_GROUP_CODE' in skipped.parentKeys, false)
  assert.equal(getPieNextNavigation({ ...result, nextLevels: [] }, result.records[0], navigation), null)
  assert.equal(getPieNextNavigation(result, { ...result.records[0], nextLevel: 'PATIENT' }, navigation), null)
  assert.equal(getPieNextNavigation(result, { ...result.records[0], dimensionKey: '' }, navigation), null)
  assert.equal(getPieNextNavigation({ ...result, nextLevels: ['MEDICAL_GROUP', 'ATTENDING_DOCTOR'] }, { ...result.records[0], nextLevel: '' }, navigation), null)
})

test('request gates cancel stale loads, support return/reset and isolate independent cards', async () => {
  const firstCard = createPieDrillRequestGate()
  const secondCard = createPieDrillRequestGate()
  const old = firstCard.begin()
  const separate = secondCard.begin()
  let release
  const pending = loadPieDrillLevel(() => new Promise((resolve) => { release = resolve }), root, navigation, { signal: old.signal })
  const current = firstCard.begin()
  assert.equal(old.signal.aborted, true)
  assert.equal(old.isCurrent(), false)
  assert.equal(current.isCurrent(), true)
  assert.equal(separate.isCurrent(), true)
  release(response(rows(1)))
  await assert.rejects(pending, { name: 'AbortError' })
  firstCard.cancel()
  assert.equal(current.isCurrent(), false)
  assert.equal(separate.isCurrent(), true)
  let called = false
  await assert.rejects(loadPieDrillLevel(() => { called = true }, root, navigation, { signal: current.signal }), { name: 'AbortError' })
  assert.equal(called, false)
})

test('cancellation between pages stops aggregation', async () => {
  const controller = new AbortController()
  const { search, calls } = pagedSearch(rows(201), (result) => {
    controller.abort()
    return result
  })
  await assert.rejects(loadPieDrillLevel(search, root, navigation, { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls.length, 1)
})

test('demonstration path is coherent from all departments through doctors and can return to its root', async () => {
  const mockRoot = resolvePieDrillRoot([{ ...target, ...MOCK_SURGERY_DRILL_CONTEXT, parentKeys: { HOSPITAL_CODE: 'HOSPITAL_MAIN', OUT_DEPT_CODE: 'DEPT_CARDIO' } }], 'mock')
  const mockNavigation = { currentLevel: 'OUT_DEPT', parentKeys: mockRoot.parentKeys, label: '全部科室' }
  const calls = []
  const search = async (resultId, payload, options) => {
    calls.push({ resultId, payload, options })
    return adaptDrillResult(createMockDrillResult(resultId, payload))
  }
  const departments = await loadPieDrillLevel(search, mockRoot, mockNavigation)
  assert.equal(departments.chartIssue, '')
  assert.equal(departments.records.reduce((sum, row) => sum + row.numerator, 0), departments.summary.numerator)
  for (const department of departments.records) {
    const groupNavigation = getPieNextNavigation(departments, department, mockNavigation)
    const groups = await loadPieDrillLevel(search, mockRoot, groupNavigation)
    assert.equal(groups.chartIssue, '', department.dimensionLabel)
    assert.equal(groups.records.reduce((sum, row) => sum + row.denominator, 0), department.denominator)
    for (const group of groups.records) {
      const doctorNavigation = getPieNextNavigation(groups, group, groupNavigation)
      const doctors = await loadPieDrillLevel(search, mockRoot, doctorNavigation)
      assert.equal(doctors.chartIssue, '', group.dimensionLabel)
      assert.equal(doctors.records.reduce((sum, row) => sum + row.denominator, 0), group.denominator)
      assert.equal(getPieNextNavigation(doctors, doctors.records[0], doctorNavigation), null)
    }
  }
  const returned = await loadPieDrillLevel(search, mockRoot, mockNavigation)
  assert.deepEqual(returned.records, departments.records)
  assert.ok(calls.every((call) => call.resultId === MOCK_SURGERY_DRILL_CONTEXT.resultId && call.options.source === 'mock'))
})
