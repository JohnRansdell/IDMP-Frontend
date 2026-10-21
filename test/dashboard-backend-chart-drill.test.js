import assert from 'node:assert/strict'
import test from 'node:test'
import {
  backendChartValue, findBackendChartRow, loadBackendChartLevel,
  loadBackendChartRoot, nextBackendChartNavigation, projectedDrillNavigation
} from '../src/idmp/features/dashboard/backendChartDrill.js'

test('projected drill uses stable identities rather than refreshed display names', () => {
  const path = { maxLevel: 'DOCTOR', levels: [
    { levelCode: 'ROOT' },
    { levelCode: 'DEPT', dimensionFieldCode: '科室', memberKeyFieldCode: '科室', displayFieldCode: '科室名称' },
    { levelCode: 'DOCTOR', dimensionFieldCode: '医生', memberKeyFieldCode: '医生', displayFieldCode: '医生名称' }
  ] }
  for (const name of ['骨科（东院）', '骨科(东院)', '科室新名称']) {
    assert.deepEqual(projectedDrillNavigation({ 科室: '9012', 科室名称: name }, path, {
      currentLevel: 'DEPT', parentKeys: {}, filters: { 科室: '9012', 病种: ['A'] }
    }), { filters: { 病种: ['A'] }, initialNavigation: { currentLevel: 'DOCTOR', parentKeys: { 科室: '9012' }, label: '所选成员' } })
  }
})

test('formal chart drill resolves the canonical root and skips an absent medical group level', async () => {
  const calls = []
  const search = async (resultId, payload) => {
    calls.push({ resultId, payload })
    if (payload.currentLevel === 'HOSPITAL') return {
      context: { resultId, currentLevel: 'HOSPITAL', snapshotId: resultId === 'department-anchor' ? 'old-snapshot' : 'organization-snapshot', indicatorVersionId: 'version-1' },
      records: [{ levelCode: 'HOSPITAL', resultId: 'canonical-root', dimensionKey: 'HOSPITAL-1' }], dataSource: 'live'
    }
    if (payload.currentLevel === 'OUT_DEPT') return {
      context: { resultId, currentLevel: 'OUT_DEPT', snapshotId: 'organization-snapshot', indicatorVersionId: 'version-1' },
      breadcrumb: [{ level: 'HOSPITAL', key: 'HOSPITAL-1' }], nextLevels: ['ATTENDING_DOCTOR'], dataSource: 'live',
      pageInfo: { hasTotal: true, hasPageNum: true, hasPageSize: true, total: 3, pageNum: 1, pageSize: 200 },
      records: [
        { resultId: 'row-a', levelCode: 'OUT_DEPT', dimensionKey: '17', dimensionLabel: 'MICU', indicatorValue: 0.2, displayValue: '20%', numerator: 1 },
        { resultId: 'row-b', levelCode: 'OUT_DEPT', dimensionKey: '9008', dimensionLabel: '呼吸科(东院)', indicatorValue: 0, displayValue: '0%', numerator: 0 },
        { resultId: 'row-c', levelCode: 'OUT_DEPT', dimensionKey: '9008', dimensionLabel: '呼吸科（东院）', indicatorValue: 0, displayValue: '0%', numerator: 0 }
      ]
    }
    throw new Error('unexpected request')
  }
  const target = { resultId: 'department-anchor', indicatorVersionId: 'version-1', maxLevels: { ORGANIZATION: 'ATTENDING_DOCTOR' }, configuredPaths: [{ pathCode: 'ORGANIZATION' }] }
  const root = await loadBackendChartRoot(search, target)
  assert.equal(root.resultId, 'canonical-root')
  assert.equal(root.snapshotId, 'organization-snapshot')
  const navigation = { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: root.hospitalCode }, label: '全部科室' }
  const result = await loadBackendChartLevel(search, root, navigation)
  assert.equal(result.records.length, 3, 'duplicate department codes with distinct published rows remain visible')
  const clicked = findBackendChartRow(result, { data: { row: result.records[2] } })
  assert.equal(clicked.resultId, 'row-c')
  assert.deepEqual(nextBackendChartNavigation(result, result.records[0], navigation, root.maxLevel), {
    currentLevel: 'ATTENDING_DOCTOR', parentKeys: { HOSPITAL_CODE: 'HOSPITAL-1', OUT_DEPT_CODE: '17' }, label: 'MICU'
  })
  assert.equal(backendChartValue(result.records[0], 'bar', '%'), 20)
  assert.equal(backendChartValue(result.records[0], 'pie', '%'), 1)
  assert.equal(calls.at(-1).payload.snapshotId, 'organization-snapshot')
})
