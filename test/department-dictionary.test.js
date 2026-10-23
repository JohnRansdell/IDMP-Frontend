import test from 'node:test'
import assert from 'node:assert/strict'
import { createDepartmentDictionaryLoader } from '../src/idmp/features/shared/departmentDictionary.js'
import { normalizeDepartmentDataset, namedDrillRecord } from '../src/idmp/features/dashboard/dimensionNames.js'
import { normalizeDepartmentComparisons } from '../src/idmp/features/analysis/departmentRanking.js'

test('loads every dictionary page, deduplicates concurrent requests and expires the cache', async () => {
  let clock = 0, calls = 0
  const load = createDepartmentDictionaryLoader(async ({ page }) => {
    calls++
    return { total: '3', pageNum: page, records: page === 1
      ? [{ code: '0101', name: '测试门诊' }, { code: '21', name: '临床心理科' }] : [{ code: '22', name: '泌尿外科' }] }
  }, { now: () => clock, ttl: 10 })
  const [a, b] = await Promise.all([load(), load()])
  assert.strictEqual(a, b); assert.equal(calls, 2)
  assert.equal(a.length, 3); assert.equal(a[0].code, '0101')
  await load(); assert.equal(calls, 2)
  clock = 11; await load(); assert.equal(calls, 4)
})

test('rejects incomplete or duplicate dictionaries and retries after failure', async () => {
  let fails = true
  const load = createDepartmentDictionaryLoader(async ({ page }) => {
    if (fails) throw new Error('不可用')
    return { total: '1', pageNum: page, records: [{ code: '01', name: '门诊' }] }
  })
  await assert.rejects(load(), /不可用/)
  fails = false; assert.equal((await load())[0].code, '01')
  await assert.rejects(createDepartmentDictionaryLoader(async ({ page }) => ({ total: '2', pageNum: page,
    records: page === 1 ? [{ code: '01', name: '门诊' }] : [] }))(), /尚未加载完整/)
  await assert.rejects(createDepartmentDictionaryLoader(async ({ page }) => ({ total: '2', pageNum: page,
    records: [{ code: '01', name: 'A' }, { code: '01', name: 'B' }] }))(), /重复编码/)
})

test('dictionary names override result labels without changing codes, values or persisted rows', () => {
  const row = { OUT_DEPT_CODE: '22', OUT_DEPT_NAME: '旧名称', value: 0.5 }
  const dataset = normalizeDepartmentDataset({ rows: [row] }, { names: new Map([['22', '泌尿外科']]) })
  assert.equal(dataset.rows[0].OUT_DEPT_NAME, '泌尿外科')
  assert.equal(dataset.rows[0].OUT_DEPT_CODE, '22'); assert.equal(dataset.rows[0].value, 0.5)
  assert.equal(row.OUT_DEPT_NAME, '旧名称')
  assert.equal(namedDrillRecord({ dimensionKey: '22', dimensionName: '旧名称' }, { levelName: '科室' },
    new Map([['22', '泌尿外科']])).dimensionLabel, '泌尿外科')
  assert.equal(normalizeDepartmentComparisons([{ departmentCode: '22', departmentName: '旧名称', value: 0.5 }], [],
    { 22: '泌尿外科' })[0].departmentName, '泌尿外科')
})
