import test from 'node:test'
import assert from 'node:assert/strict'
import { departmentDrillContext, loadDepartmentComparisons, normalizeDepartmentComparisons } from '../src/idmp/features/analysis/departmentRanking.js'

test('custom department identity is independent of user-defined logical field names', () => {
  const row = { departmentCode: '14', departmentName: '血管外科', dimensions: { 科室: '14', 科室名称: '血管外科' }, resultId: '102027642462836318', snapshotId: '102027642462819286', value: 0, numeratorValue: 0 }
  const [normalized] = normalizeDepartmentComparisons([row])
  assert.deepEqual(normalized, row)
  assert.equal(normalized.resultId, row.resultId)
  assert.equal(normalized.snapshotId, row.snapshotId)
})

test('legacy department fields remain readable with either casing', () => {
  const rows = normalizeDepartmentComparisons([
    { dimensions: { out_dept_code: '10', out_dept_name: '妇科' } },
    { dimensions: { OUT_DEPT_ID: '11', OUT_DEPT_NAME: '内科' } }
  ])
  assert.deepEqual(rows.map((row) => [row.departmentCode, row.departmentName]), [['10', '妇科'], ['11', '内科']])
})

test('explicit identity wins over legacy fields and missing names fall back to real codes', () => {
  const [row] = normalizeDepartmentComparisons([{ departmentCode: '14', departmentName: '血管外科', dimensions: { out_dept_code: '10', out_dept_name: '妇科' } }])
  assert.equal(row.departmentCode, '14')
  assert.equal(row.departmentName, '血管外科')
  assert.equal(normalizeDepartmentComparisons([{ departmentCode: 0 }])[0].departmentName, '0')
  assert.equal(normalizeDepartmentComparisons([{ departmentCode: '14', departmentName: 'null' }])[0].departmentName, '14')
})

test('missing identities are not replaced with invented department numbers', () => {
  assert.deepEqual(normalizeDepartmentComparisons([null, {}, { departmentCode: 'null' }, { dimensions: { 任意维度: '14' } }]), [])
  assert.deepEqual(normalizeDepartmentComparisons(null), [])
})

const period = { periodStart: '2026-03-01T00:00:00', periodEnd: '2026-04-01T00:00:00' }
const paths = [{ pathCode: 'CUSTOM_DEPT', maxLevel: 'DEPT', levels: [
  { levelCode: 'ROOT' }, { levelCode: 'DEPT', dimensionFieldCode: 'OUT_DEPT_CODE', memberKeyFieldCode: 'OUT_DEPT_CODE' }
] }]

test('ranking uses direct department formal results without additional drill requests', async () => {
  const rows = await loadDepartmentComparisons({ overview: period, departmentComparison: [{ ...period, departmentCode: '14', departmentName: '中医科' }] }, paths, () => { throw new Error('unexpected request') })
  assert.equal(rows[0].departmentName, '中医科')
})

test('ranking reads all custom department pages and preserves exact result IDs and period', async () => {
  const requests = []
  const rows = await loadDepartmentComparisons({ overview: period, dimensionComparison: [{ ...period, resultId: 'march-base', dimensions: { out_dept_code: '14' } }] }, paths, async (id, payload) => {
    requests.push({ id, payload })
    return { context: period, records: Array.from({ length: payload.pageNum === 1 ? 100 : 20 }, (_, index) => ({
      ...period, dimensionKey: String((payload.pageNum - 1) * 100 + index), dimensionName: `科室${index}`, indicatorValue: 0, numeratorValue: 0, denominatorValue: 10, resultId: `result-${payload.pageNum}-${index}`
    })), pageInfo: { totalPages: 2, total: 120 } }
  })
  assert.equal(rows.length, 120)
  assert.equal(rows[0].value, 0)
  assert.equal(rows[0].numeratorValue, 0)
  assert.deepEqual(requests.map(request => request.payload.pageNum), [1, 2])
  assert.equal(requests[0].id, 'march-base')
  assert.equal(requests[0].payload.currentLevel, 'DEPT')
})

test('ranking does not approximate a department aggregate from department/disease combination rows', async () => {
  const rows = await loadDepartmentComparisons({ overview: period, dimensionComparison: [{ ...period, dimensions: { out_dept_code: '14', disease_code: 'D1' }, value: 0.5 }] }, [], () => { throw new Error('unexpected request') })
  assert.deepEqual(rows, [])
})

test('ranking rejects mismatched drill periods rather than displaying stale department data', async () => {
  await assert.rejects(loadDepartmentComparisons({ overview: period, dimensionComparison: [{ ...period, resultId: 'march-base' }] }, paths, async () => ({ context: { periodStart: '2026-04-01', periodEnd: '2026-05-01' }, records: [], pageInfo: {} })), /统计周期不一致/)
})

test('department entry carries the ranking period, result and member key into drill', () => {
  const context = departmentDrillContext({ ...period, resultId: 'march-dept', departmentCode: '14', parentKeys: { HOSPITAL_CODE: 'H1' } }, paths, 'MONTHLY')
  assert.equal(context.resultId, 'march-dept')
  assert.equal(context.currentLevel, 'DEPT')
  assert.equal(context.pathCode, 'CUSTOM_DEPT')
  assert.deepEqual(context.period, period)
  assert.deepEqual(context.parentKeys, { HOSPITAL_CODE: 'H1', OUT_DEPT_CODE: '14' })
  assert.deepEqual(context.filters, { OUT_DEPT_CODE: '14' })
  const deeper = [{ ...paths[0], maxLevel: 'DOCTOR', levels: [...paths[0].levels, { levelCode: 'DOCTOR' }] }]
  assert.equal(departmentDrillContext({ ...period, departmentCode: '14' }, deeper, 'QUARTERLY').currentLevel, 'DOCTOR')
})

test('incomplete pages cannot silently produce an incomplete department ranking', async () => {
  await assert.rejects(loadDepartmentComparisons({ overview: period, dimensionComparison: [{ ...period, resultId: 'march-base' }] }, paths, async () => ({
    context: period, records: [], pageInfo: { totalPages: 2, total: 150 }
  })), /尚未读取完整/)
})
