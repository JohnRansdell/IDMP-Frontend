const dashboardResultId = 'MOCK-RESULT-SURGERY-COMPLICATION'

const hospital = { key: 'HOSPITAL_MAIN', label: '全院', rate: '2.3%', numerator: 286, denominator: 12458, status: '达标' }

const departments = [
  { key: 'DEPT_CARDIO', label: '心外科', rate: '5.2%', numerator: 26, denominator: 500, status: '超标', nextLevel: 'DEPARTMENT' },
  { key: 'DEPT_NEURO', label: '神经外科', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'DEPARTMENT' },
  { key: 'DEPT_ORTHO', label: '骨科', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'DEPARTMENT' },
  { key: 'DEPT_GENERAL', label: '普外科', rate: '1.8%', numerator: 9, denominator: 500, status: '达标', nextLevel: 'DEPARTMENT' },
  { key: 'DEPT_UROLOGY', label: '泌尿外科', rate: '1.5%', numerator: 6, denominator: 400, status: '达标', nextLevel: 'DEPARTMENT' },
  { key: 'DEPT_THORACIC', label: '胸外科', rate: '1.2%', numerator: 5, denominator: 417, status: '达标', nextLevel: 'DEPARTMENT' }
]

const groups = {
  DEPT_CARDIO: [
    { key: 'GROUP_CARDIO_1', label: '心外一组', rate: '5.6%', numerator: 14, denominator: 250, status: '超标', nextLevel: 'MEDICAL_GROUP' },
    { key: 'GROUP_CARDIO_2', label: '心外二组', rate: '4.8%', numerator: 12, denominator: 250, status: '超标', nextLevel: 'MEDICAL_GROUP' }
  ],
  DEPT_NEURO: [{ key: 'GROUP_NEURO_1', label: '神经外科一组', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'MEDICAL_GROUP' }],
  DEPT_ORTHO: [{ key: 'GROUP_ORTHO_1', label: '骨科关节组', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'MEDICAL_GROUP' }],
  DEPT_GENERAL: [{ key: 'GROUP_GENERAL_1', label: '普外科一组', rate: '1.8%', numerator: 9, denominator: 500, status: '达标', nextLevel: 'MEDICAL_GROUP' }],
  DEPT_UROLOGY: [
    { key: 'GROUP_UROLOGY_1', label: '泌尿外科一组', rate: '1.7%', numerator: 4, denominator: 235, status: '达标', nextLevel: 'MEDICAL_GROUP' },
    { key: 'GROUP_UROLOGY_2', label: '泌尿外科二组', rate: '1.2%', numerator: 2, denominator: 165, status: '达标', nextLevel: 'MEDICAL_GROUP' }
  ],
  DEPT_THORACIC: [
    { key: 'GROUP_THORACIC_1', label: '胸外科一组', rate: '1.4%', numerator: 3, denominator: 214, status: '达标', nextLevel: 'MEDICAL_GROUP' },
    { key: 'GROUP_THORACIC_2', label: '胸外科二组', rate: '1.0%', numerator: 2, denominator: 203, status: '达标', nextLevel: 'MEDICAL_GROUP' }
  ]
}

const doctors = {
  GROUP_CARDIO_1: [
    { key: 'DOC_001', label: '张医生', rate: '6.1%', numerator: 7, denominator: 115, status: '超标', nextLevel: 'DOCTOR' },
    { key: 'DOC_002', label: '李医生', rate: '5.2%', numerator: 4, denominator: 77, status: '超标', nextLevel: 'DOCTOR' }
  ],
  GROUP_CARDIO_2: [{ key: 'DOC_003', label: '王医生', rate: '4.8%', numerator: 12, denominator: 250, status: '超标', nextLevel: 'DOCTOR' }],
  GROUP_NEURO_1: [{ key: 'DOC_004', label: '赵医生', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'DOCTOR' }],
  GROUP_ORTHO_1: [{ key: 'DOC_005', label: '陈医生', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'DOCTOR' }],
  GROUP_GENERAL_1: [
    { key: 'DOC_GENERAL_001', label: '刘医生', rate: '2.0%', numerator: 5, denominator: 250, status: '达标', nextLevel: 'DOCTOR' },
    { key: 'DOC_GENERAL_002', label: '黄医生', rate: '1.6%', numerator: 4, denominator: 250, status: '达标', nextLevel: 'DOCTOR' }
  ],
  GROUP_UROLOGY_1: [
    { key: 'DOC_UROLOGY_001', label: '周医生', rate: '1.8%', numerator: 2, denominator: 111, status: '达标', nextLevel: 'DOCTOR' },
    { key: 'DOC_UROLOGY_002', label: '吴医生', rate: '1.6%', numerator: 2, denominator: 124, status: '达标', nextLevel: 'DOCTOR' }
  ],
  GROUP_UROLOGY_2: [{ key: 'DOC_UROLOGY_003', label: '郑医生', rate: '1.2%', numerator: 2, denominator: 165, status: '达标', nextLevel: 'DOCTOR' }],
  GROUP_THORACIC_1: [
    { key: 'DOC_THORACIC_001', label: '孙医生', rate: '1.5%', numerator: 2, denominator: 132, status: '达标', nextLevel: 'DOCTOR' },
    { key: 'DOC_THORACIC_002', label: '钱医生', rate: '1.2%', numerator: 1, denominator: 82, status: '达标', nextLevel: 'DOCTOR' }
  ],
  GROUP_THORACIC_2: [{ key: 'DOC_THORACIC_003', label: '许医生', rate: '1.0%', numerator: 2, denominator: 203, status: '达标', nextLevel: 'DOCTOR' }]
}

export function createMockDrillResult(resultId, payload = {}) {
  const currentLevel = payload.currentLevel || 'HOSPITAL'
  const parentKeys = payload.parentKeys || {}
  const liveOrganizationPath = String(resultId) === dashboardResultId
  const rows = liveOrganizationPath
    ? currentLevel === 'HOSPITAL'
      ? [hospital]
      : currentLevel === 'OUT_DEPT'
        ? departments
        : currentLevel === 'MEDICAL_GROUP'
          ? (groups[parentKeys.OUT_DEPT_CODE] || [])
          : currentLevel === 'ATTENDING_DOCTOR'
            ? (doctors[parentKeys.MEDICAL_GROUP_CODE] || [])
            : []
    : currentLevel === 'HOSPITAL'
      ? departments
      : currentLevel === 'DEPARTMENT'
        ? (groups[parentKeys.departmentKey] || [])
        : currentLevel === 'MEDICAL_GROUP'
          ? (doctors[parentKeys.medicalGroupKey] || [])
          : []
  const nextLevel = liveOrganizationPath
    ? { HOSPITAL: 'OUT_DEPT', OUT_DEPT: 'MEDICAL_GROUP', MEDICAL_GROUP: 'ATTENDING_DOCTOR' }[currentLevel] || ''
    : rows[0]?.nextLevel || ''
  const nextLevels = rows.length && nextLevel && nextLevel !== 'PATIENT' ? [nextLevel] : []
  const breadcrumb = liveOrganizationPath
    ? buildLiveBreadcrumb(currentLevel, parentKeys)
    : buildBreadcrumb(currentLevel, parentKeys)
  const records = rows.map((row) => ({
    dimensionKey: row.key,
    dimensionLabel: row.label,
    indicatorValue: row.rate,
    numerator: row.numerator,
    denominator: row.denominator,
    qualityStatus: row.status,
    nextLevel
  }))
  return {
    context: {
      resultId: String(resultId || 'MOCK-RESULT-001'),
      snapshotId: 'MOCK-SNAPSHOT-20260811',
      indicatorId: 'MOCK-INDICATOR-001',
      indicatorVersionId: 'MOCK-VERSION-001',
      scenarioVersionId: 'MOCK-SCENARIO-001',
      period: payload.filters?.period || '2026-06',
      currentLevel
    },
    breadcrumb,
    summary: { indicatorValue: '2.3%', numerator: 286, denominator: 12458, qualityStatus: '演示数据' },
    columns: [
      { field: 'dimensionLabel', label: levelLabel(currentLevel, liveOrganizationPath), sortable: true },
      { field: 'indicatorValue', label: '指标值', sortable: true },
      { field: 'numerator', label: '分子', sortable: true },
      { field: 'denominator', label: '分母', sortable: true },
      { field: 'qualityStatus', label: '质量状态' }
    ],
    records,
    nextLevels,
    pageInfo: { pageNum: 1, pageSize: 20, total: records.length, totalPages: records.length ? 1 : 0 },
    lineageAvailable: false,
    exportAvailable: false,
    permissions: { patient: false, sourceRecord: false },
    dataSource: 'mock'
  }
}

function buildLiveBreadcrumb(currentLevel, parentKeys) {
  const department = departments.find((row) => row.key === parentKeys.OUT_DEPT_CODE)
  const group = Object.values(groups).flat().find((row) => row.key === parentKeys.MEDICAL_GROUP_CODE)
  const result = []
  if (currentLevel !== 'HOSPITAL' && parentKeys.HOSPITAL_CODE) result.push({ level: 'HOSPITAL', label: '全院', key: parentKeys.HOSPITAL_CODE })
  if (['MEDICAL_GROUP', 'ATTENDING_DOCTOR'].includes(currentLevel) && parentKeys.OUT_DEPT_CODE) result.push({ level: 'OUT_DEPT', label: department?.label || parentKeys.OUT_DEPT_CODE, key: parentKeys.OUT_DEPT_CODE })
  if (currentLevel === 'ATTENDING_DOCTOR' && parentKeys.MEDICAL_GROUP_CODE) result.push({ level: 'MEDICAL_GROUP', label: group?.label || parentKeys.MEDICAL_GROUP_CODE, key: parentKeys.MEDICAL_GROUP_CODE })
  return result
}

function buildBreadcrumb(level, parentKeys) {
  const result = [{ level: 'HOSPITAL', label: '全院', key: 'HOSPITAL' }]
  if (level === 'DEPARTMENT' || level === 'MEDICAL_GROUP' || level === 'DOCTOR') result.push({ level: 'DEPARTMENT', label: parentKeys.departmentLabel || '心外科', key: parentKeys.departmentKey || 'DEPT_CARDIO' })
  if (level === 'MEDICAL_GROUP' || level === 'DOCTOR') result.push({ level: 'MEDICAL_GROUP', label: parentKeys.medicalGroupLabel || '心外一组', key: parentKeys.medicalGroupKey || 'GROUP_CARDIO_1' })
  if (level === 'DOCTOR') result.push({ level: 'DOCTOR', label: parentKeys.doctorLabel || '张医生', key: parentKeys.doctorKey || 'DOC_001' })
  return result
}

function levelLabel(level, liveOrganizationPath = false) {
  if (liveOrganizationPath) return { HOSPITAL: '医院', OUT_DEPT: '科室', MEDICAL_GROUP: '医疗组', ATTENDING_DOCTOR: '主治医师' }[level] || '维度'
  return { HOSPITAL: '科室', DEPARTMENT: '医疗组', MEDICAL_GROUP: '医师', DOCTOR: '病例' }[level] || '维度'
}
