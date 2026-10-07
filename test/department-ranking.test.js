import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDepartmentComparisons } from '../src/idmp/features/analysis/departmentRanking.js'

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
