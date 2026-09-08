import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptDrillResult, deriveDrillPathResultIds, limitDrillNextLevels, normalizeOrganizationDrillLevel } from '../src/idmp/api/adapters/drill.js'
import { createMockDrillResult, MOCK_SURGERY_DRILL_CONTEXT } from '../src/idmp/features/analysis/drillData.js'
import { mockDashboardDepartmentRanking, mockIndicatorDataSources } from '../src/idmp/features/dashboard/mockData.js'

const dashboardResultId = MOCK_SURGERY_DRILL_CONTEXT.resultId

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

test('drill adapter preserves missing values and normalizes metric and level aliases', () => {
  const result = adaptDrillResult({
    context: { currentLevel: 'DEPARTMENT' },
    nextLevels: ['DOCTOR'],
    records: [
      { dimKey: 12, numeratorValue: '7', denominatorValue: 135, value: 5.2, indicatorUnit: '%' },
      {},
      { numerator: '', numeratorValue: 10, denominator: 0, indicatorValue: 0 }
    ]
  })
  assert.equal(result.records[0].dimensionKey, '12')
  assert.equal(result.records[0].numerator, '7')
  assert.equal(result.records[0].denominator, 135)
  assert.equal(result.records[0].indicatorValue, 5.2)
  assert.equal(result.records[0].unit, '%')
  assert.equal(result.records[1].numerator, null)
  assert.equal(result.records[1].denominator, null)
  assert.equal(result.records[1].indicatorValue, null)
  assert.equal(result.records[2].numerator, '')
  assert.equal(result.records[2].denominator, 0)
  assert.equal(result.records[2].indicatorValue, 0)
  assert.equal(normalizeOrganizationDrillLevel('DEPARTMENT'), 'OUT_DEPT')
  assert.equal(normalizeOrganizationDrillLevel('DOCTOR'), 'ATTENDING_DOCTOR')
  assert.equal(normalizeOrganizationDrillLevel('MEDICAL_GROUP'), 'MEDICAL_GROUP')
  assert.equal(result.context.currentLevel, 'DEPARTMENT')
  assert.deepEqual(result.nextLevels, ['DOCTOR'])
})

test('drill pagination distinguishes explicit totals from absent or invalid metadata', () => {
  const empty = adaptDrillResult({}).pageInfo
  assert.equal(empty.total, 0)
  assert.equal(empty.hasTotal, false)
  assert.equal(empty.hasPageNum, false)
  assert.equal(empty.hasPageSize, false)
  assert.equal(empty.hasTotalPages, false)
  const explicit = adaptDrillResult({ pageInfo: { page: '1', size: '200', total: '0', pages: 0 } }).pageInfo
  assert.equal(explicit.hasTotal, true)
  assert.equal(explicit.hasPageNum, true)
  assert.equal(explicit.hasPageSize, true)
  assert.equal(explicit.hasTotalPages, true)
  for (const total of [null, '', ' ', false, -1, 1.5, Infinity, 'invalid', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(adaptDrillResult({ pageInfo: { total } }).pageInfo.hasTotal, false)
  }
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

test('dashboard mock uses one context and each child layer reconciles with its parent', () => {
  const parentKeys = { HOSPITAL_CODE: 'HOSPITAL_MAIN' }
  const root = createMockDrillResult(dashboardResultId, { currentLevel: 'OUT_DEPT', parentKeys })
  assert.equal(root.summary.numerator, 79)
  assert.equal(root.summary.denominator, 2756)
  assert.equal(root.summary.indicatorValue, '2.9%')
  const hospital = createMockDrillResult(dashboardResultId, { currentLevel: 'HOSPITAL' }).records[0]
  assert.equal(hospital.numerator, root.summary.numerator)
  assert.equal(hospital.denominator, root.summary.denominator)

  function assertLayer(result, parent) {
    for (const [key, value] of Object.entries(MOCK_SURGERY_DRILL_CONTEXT)) assert.equal(result.context[key], value)
    for (const metric of ['numerator', 'denominator']) {
      assert.equal(result.summary[metric], parent[metric])
      assert.equal(result.records.reduce((sum, row) => sum + row[metric], 0), parent[metric])
    }
    for (const row of result.records) {
      assert.equal(row.indicatorValue, `${(row.numerator / row.denominator * 100).toFixed(1)}%`)
    }
  }
  assertLayer(root, hospital)
  for (const department of root.records) {
    const departmentKeys = { ...parentKeys, OUT_DEPT_CODE: department.dimensionKey }
    const groups = createMockDrillResult(dashboardResultId, { currentLevel: 'MEDICAL_GROUP', parentKeys: departmentKeys })
    assertLayer(groups, department)
    for (const group of groups.records) {
      const doctors = createMockDrillResult(dashboardResultId, {
        currentLevel: 'ATTENDING_DOCTOR',
        parentKeys: { ...departmentKeys, MEDICAL_GROUP_CODE: group.dimensionKey }
      })
      assertLayer(doctors, group)
      assert.deepEqual(doctors.nextLevels, [])
    }
  }
  for (const row of mockDashboardDepartmentRanking) {
    for (const key of ['resultId', 'snapshotId', 'indicatorId', 'indicatorVersionId', 'period']) {
      assert.equal(row.drillTarget[key], root.context[key])
    }
  }
})

test('mock pagination slices records while retaining whole-layer totals and supports cancellation', () => {
  const query = { currentLevel: 'OUT_DEPT', parentKeys: { HOSPITAL_CODE: 'HOSPITAL_MAIN' } }
  const whole = createMockDrillResult(dashboardResultId, query)
  const pages = [1, 2, 3].map((pageNum) => createMockDrillResult(dashboardResultId, { ...query, pageNum, pageSize: 2 }))
  assert.deepEqual(pages.flatMap((page) => page.records), whole.records)
  for (const [index, page] of pages.entries()) {
    assert.deepEqual(page.summary, whole.summary)
    assert.deepEqual(page.pageInfo, { pageNum: index + 1, pageSize: 2, total: 6, totalPages: 3 })
  }
  assert.equal(createMockDrillResult(dashboardResultId, { ...query, pageSize: 300 }).pageInfo.pageSize, 200)
  assert.deepEqual(createMockDrillResult(dashboardResultId, { ...query, pageNum: 4, pageSize: 2 }).records, [])
  const controller = new AbortController()
  controller.abort()
  assert.throws(() => createMockDrillResult(dashboardResultId, query, { signal: controller.signal }), { name: 'AbortError' })
})

test('only the surgery demo adds coherent department pie drill entries', () => {
  const surgery = mockIndicatorDataSources.find((source) => source.code === 'SURGERY_COMPLICATION')
  assert.equal(surgery.numeratorLabel, '发生例数')
  assert.equal(surgery.numeratorUnit, '例')
  assert.equal(surgery.pieData.length, 6)
  assert.equal(surgery.pieData.reduce((sum, row) => sum + row.value, 0), 79)
  assert.ok(surgery.pieData.every((row) => row.drillTarget.resultId === dashboardResultId))
  for (const source of mockIndicatorDataSources.filter((item) => item !== surgery)) {
    assert.ok(source.pieData.every((row) => !row.drillTarget))
    assert.equal(source.numeratorLabel, undefined)
  }
})
