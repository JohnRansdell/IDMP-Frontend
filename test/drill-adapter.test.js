import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDrillResult, deriveDrillPathResultIds, limitDrillNextLevels } from '../src/idmp/api/adapters/drill.js'
import { createMockDrillResult } from '../src/idmp/features/analysis/drillData.js'

const dashboardResultId = 'MOCK-RESULT-SURGERY-COMPLICATION'

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

test('mock drill accepts live-style department context from the dashboard', () => {
  const result = createMockDrillResult(dashboardResultId, {
    currentLevel: 'MEDICAL_GROUP',
    parentKeys: { HOSPITAL_CODE: 'HOSPITAL_MAIN', OUT_DEPT_CODE: 'DEPT_UROLOGY' }
  })

  assert.deepEqual(result.breadcrumb, [
    { level: 'HOSPITAL', label: '全院', key: 'HOSPITAL_MAIN' },
    { level: 'OUT_DEPT', label: '泌尿外科', key: 'DEPT_UROLOGY' }
  ])
  assert.equal(result.columns[0].label, '医疗组')
  assert.equal(result.records[0].dimensionLabel, '泌尿外科一组')
  assert.equal(result.records[0].nextLevel, 'ATTENDING_DOCTOR')
  assert.deepEqual(result.nextLevels, ['ATTENDING_DOCTOR'])

  const missing = createMockDrillResult(dashboardResultId, {
    currentLevel: 'MEDICAL_GROUP',
    parentKeys: { HOSPITAL_CODE: 'HOSPITAL_MAIN', OUT_DEPT_CODE: 'DEPT_UNKNOWN' }
  })
  assert.deepEqual(missing.records, [])
  assert.deepEqual(missing.nextLevels, [])
})

test('mock live-style department paths provide coherent groups and doctors', () => {
  for (const department of [
    { code: 'DEPT_CARDIO', label: '心外科' },
    { code: 'DEPT_NEURO', label: '神经外科' },
    { code: 'DEPT_ORTHO', label: '骨科' },
    { code: 'DEPT_GENERAL', label: '普外科' },
    { code: 'DEPT_UROLOGY', label: '泌尿外科' },
    { code: 'DEPT_THORACIC', label: '胸外科' }
  ]) {
    const groupsResult = createMockDrillResult(dashboardResultId, {
      currentLevel: 'MEDICAL_GROUP',
      parentKeys: { HOSPITAL_CODE: 'HOSPITAL_MAIN', OUT_DEPT_CODE: department.code }
    })
    const group = groupsResult.records[0]
    assert.ok(group, `${department.label}应提供医疗组演示数据`)

    const doctorsResult = createMockDrillResult(dashboardResultId, {
      currentLevel: 'ATTENDING_DOCTOR',
      parentKeys: {
        HOSPITAL_CODE: 'HOSPITAL_MAIN',
        OUT_DEPT_CODE: department.code,
        MEDICAL_GROUP_CODE: group.dimensionKey
      }
    })

    assert.ok(doctorsResult.records.length, `${group.dimensionLabel}应提供医师演示数据`)
    assert.equal(doctorsResult.columns[0].label, '主治医师')
    assert.deepEqual(doctorsResult.breadcrumb.map((item) => item.label), ['全院', department.label, group.dimensionLabel])
    assert.deepEqual(doctorsResult.nextLevels, [])
    assert.equal(doctorsResult.records[0].nextLevel, '')
  }
})

test('dashboard mock breadcrumb rollback keeps the live organization hierarchy', () => {
  const doctors = createMockDrillResult(dashboardResultId, {
    currentLevel: 'ATTENDING_DOCTOR',
    parentKeys: {
      HOSPITAL_CODE: 'HOSPITAL_MAIN',
      OUT_DEPT_CODE: 'DEPT_UROLOGY',
      MEDICAL_GROUP_CODE: 'GROUP_UROLOGY_1'
    }
  })
  const [hospitalCrumb, departmentCrumb] = doctors.breadcrumb

  const backToDepartments = createMockDrillResult(dashboardResultId, {
    currentLevel: departmentCrumb.level,
    parentKeys: { HOSPITAL_CODE: hospitalCrumb.key }
  })
  assert.equal(backToDepartments.records.length, 6)
  assert.equal(backToDepartments.records[0].dimensionLabel, '心外科')
  assert.deepEqual(backToDepartments.nextLevels, ['MEDICAL_GROUP'])
  assert.deepEqual(backToDepartments.breadcrumb, [hospitalCrumb])

  const backToHospital = createMockDrillResult(dashboardResultId, {
    currentLevel: hospitalCrumb.level,
    parentKeys: {}
  })
  assert.equal(backToHospital.records.length, 1)
  assert.equal(backToHospital.records[0].dimensionKey, 'HOSPITAL_MAIN')
  assert.equal(backToHospital.records[0].nextLevel, 'OUT_DEPT')
  assert.deepEqual(backToHospital.nextLevels, ['OUT_DEPT'])
  assert.deepEqual(backToHospital.breadcrumb, [])
})
