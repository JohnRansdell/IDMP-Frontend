import assert from 'node:assert/strict'
import test from 'node:test'
import { namedDrillRecord, normalizeDepartmentDataset, visibleDimensionName } from '../src/idmp/features/dashboard/dimensionNames.js'
import { normalizeDepartmentComparisons } from '../src/idmp/features/analysis/departmentRanking.js'

for (const [role, label, expected] of [
  ['HOSPITAL', '医院', '未知医院'], ['OUT_DEPT', '出院科室', '未知科室'],
  ['ATTENDING_DOCTOR', '主治医师', '未知医生'], ['CUSTOM_DISEASE', '病种', '未知病种'],
  ['CUSTOM_PAY', '支付方式', '未知支付方式']
]) {
  test(`${label}: missing codes, unresolved names and valid names retain their identities`, () => {
    const level = { levelCode: role, levelName: label, memberKeyFieldCode: 'CODE', displayFieldCode: 'LABEL' }
    for (const code of [null, '', '__UNASSIGNED__']) {
      const row = { dimensionKey: code, dimensionName: null, value: 0.25 }
      assert.equal(namedDrillRecord(row, level).dimensionLabel, expected)
      assert.equal(row.dimensionKey, code)
      assert.equal(row.value, 0.25)
    }
    assert.equal(namedDrillRecord({ dimensionKey: '009', dimensionName: '009' }, level).dimensionLabel, `${expected}（009）`)
    assert.equal(namedDrillRecord({ dimensionKey: '009', dimensionName: '已知名称' }, level).dimensionLabel, '已知名称')
    const dataset = normalizeDepartmentDataset({ rows: [{ CODE: null }, { CODE: '009' }] }, { paths: [{ levels: [level] }] })
    assert.equal(visibleDimensionName(dataset.rows[0], { field: 'CODE' }, dataset), expected)
    assert.equal(visibleDimensionName(dataset.rows[1], { field: 'CODE' }, dataset), `${expected}（009）`)
  })
}

test('unknown department ranking rows are retained and the query code is not the label', () => {
  for (const code of [null, '', '__UNASSIGNED__']) {
    const rows = normalizeDepartmentComparisons([{ departmentCode: code, departmentName: null, value: 0.0519129 }])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].departmentName, '未知科室')
    assert.equal(rows[0].departmentCode, '__UNASSIGNED__')
    assert.equal(rows[0].value, 0.0519129)
  }
})

test('custom natural values without separate display metadata are not mistaken for unresolved codes', () => {
  const level = { levelCode: 'CUSTOM_CLASS', levelName: '类别', memberKeyFieldCode: '类别' }
  assert.equal(namedDrillRecord({ dimensionKey: '甲类' }, level).dimensionLabel, '甲类')
  const sameField = { ...level, memberKeyFieldCode: 'CATEGORY', displayFieldCode: 'category' }
  assert.equal(namedDrillRecord({ dimensionKey: '甲类', dimensionName: '甲类' }, sameField).dimensionLabel, '甲类')
  const dataset = normalizeDepartmentDataset({ rows: [{ CATEGORY: '甲类' }] }, { paths: [{ levels: [sameField] }] })
  assert.equal(visibleDimensionName(dataset.rows[0], { field: 'CATEGORY' }, dataset), '甲类')
})

test('server fallback labels are not overwritten by stale display fields', () => {
  const row = { dimensionKey: '009', dimensionName: '未知医生（009）', dimensionLabelSource: 'FALLBACK', dimensions: { doctorName: '旧姓名' } }
  assert.equal(namedDrillRecord(row, { levelCode: 'DOCTOR', displayFieldCode: 'doctorName' }).dimensionLabel, '未知医生（009）')
})
