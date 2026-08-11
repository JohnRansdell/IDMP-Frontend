import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDrillResult } from '../src/idmp/api/adapters/drill.js'
import { createMockDrillResult } from '../src/idmp/features/analysis/drillData.js'

test('drill adapter normalizes opaque ids and paged response fields', () => {
  const result = adaptDrillResult({
    data: {
      context: { resultId: 9001, snapshotId: 6001, indicatorVersionId: 501 },
      breadcrumb: [{ level: 'HOSPITAL', name: '全院', key: 1 }],
      columns: [{ code: 'dimensionLabel', name: '科室', sortable: true }],
      records: [{ dimensionLabel: '心外科' }],
      pageInfo: { page: 2, size: 20, total: 41 },
      nextLevels: ['MEDICAL_GROUP']
    }
  })

  assert.equal(result.context.resultId, '9001')
  assert.equal(result.context.snapshotId, '6001')
  assert.equal(result.context.indicatorVersionId, '501')
  assert.equal(result.breadcrumb[0].label, '全院')
  assert.equal(result.columns[0].field, 'dimensionLabel')
  assert.equal(result.pageInfo.pageNum, 2)
  assert.deepEqual(result.nextLevels, ['MEDICAL_GROUP'])
})

test('mock drill follows organization levels and stops before patient access', () => {
  const hospital = createMockDrillResult('R001', { currentLevel: 'HOSPITAL' })
  assert.equal(hospital.dataSource, 'mock')
  assert.equal(hospital.records[0].dimensionLabel, '心外科')
  assert.deepEqual(hospital.nextLevels, ['MEDICAL_GROUP'])

  const department = createMockDrillResult('R001', {
    currentLevel: 'DEPARTMENT',
    parentKeys: { departmentKey: 'DEPT_CARDIO' }
  })
  assert.equal(department.records[0].dimensionLabel, '心外一组')
  assert.deepEqual(department.nextLevels, ['DOCTOR'])

  const group = createMockDrillResult('R001', {
    currentLevel: 'MEDICAL_GROUP',
    parentKeys: { medicalGroupKey: 'GROUP_CARDIO_1' }
  })
  assert.equal(group.records[0].dimensionLabel, '张医生')
  assert.deepEqual(group.nextLevels, [])
})
