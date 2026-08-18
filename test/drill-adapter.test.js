import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDrillResult, deriveDrillPathResultIds, limitDrillNextLevels } from '../src/idmp/api/adapters/drill.js'
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

test('drill adapter uses backend column titles and derives separate multi-path anchors', () => {
  const result = adaptDrillResult({ data: { columns: [{ field: 'dimensionName', title: '医院' }] } })
  assert.equal(result.columns[0].label, '医院')

  const pathResultIds = deriveDrillPathResultIds({
    overview: { resultId: 'case-result', dimensions: { visit_id: 'V001', single_disease_code: null } },
    dimensionComparison: [
      { resultId: 'hospital-result', dimensions: { hospital_code: 'H001' } },
      { resultId: 'organization-result', dimensions: { hospital_code: 'H001', out_dept_code: 'D001', attending_doctor_code: null } },
      { resultId: 'disease-result', dimensions: { hospital_code: 'H001', single_disease_code: 'SD001' } }
    ]
  })

  assert.deepEqual(pathResultIds, {
    ORGANIZATION: 'hospital-result',
    DISEASE: 'case-result'
  })
})

test('drill adapter stops at the version configured maximum level', () => {
  assert.deepEqual(limitDrillNextLevels(['OUT_DEPT'], 'ORGANIZATION', 'OUT_DEPT'), ['OUT_DEPT'])
  assert.deepEqual(limitDrillNextLevels(['ATTENDING_DOCTOR'], 'ORGANIZATION', 'OUT_DEPT'), [])
  assert.deepEqual(limitDrillNextLevels(['ATTENDING_DOCTOR'], 'ORGANIZATION', 'ATTENDING_DOCTOR'), ['ATTENDING_DOCTOR'])
})

test('mock drill follows organization levels and stops before patient access', () => {
  const hospital = createMockDrillResult('R001', { currentLevel: 'HOSPITAL' })
  assert.equal(hospital.dataSource, 'mock')
  assert.equal(hospital.records[0].dimensionLabel, '心外科')
  assert.deepEqual(hospital.nextLevels, ['DEPARTMENT'])

  const department = createMockDrillResult('R001', {
    currentLevel: 'DEPARTMENT',
    parentKeys: { departmentKey: 'DEPT_CARDIO' }
  })
  assert.equal(department.records[0].dimensionLabel, '心外一组')
  assert.deepEqual(department.nextLevels, ['MEDICAL_GROUP'])

  const group = createMockDrillResult('R001', {
    currentLevel: 'MEDICAL_GROUP',
    parentKeys: { medicalGroupKey: 'GROUP_CARDIO_1' }
  })
  assert.equal(group.records[0].dimensionLabel, '张医生')
  assert.equal(group.records[0].nextLevel, 'DOCTOR')
  assert.deepEqual(group.nextLevels, ['DOCTOR'])
})
