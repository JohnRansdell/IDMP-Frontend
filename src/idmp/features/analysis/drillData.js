const departments = [
  { key: 'DEPT_CARDIO', label: '心外科', rate: '5.2%', numerator: 26, denominator: 500, status: '超标', nextLevel: 'MEDICAL_GROUP' },
  { key: 'DEPT_NEURO', label: '神经外科', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'MEDICAL_GROUP' },
  { key: 'DEPT_ORTHO', label: '骨科', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'MEDICAL_GROUP' },
  { key: 'DEPT_GENERAL', label: '普外科', rate: '1.8%', numerator: 9, denominator: 500, status: '达标', nextLevel: 'MEDICAL_GROUP' }
]

const groups = {
  DEPT_CARDIO: [
    { key: 'GROUP_CARDIO_1', label: '心外一组', rate: '5.6%', numerator: 14, denominator: 250, status: '超标', nextLevel: 'DOCTOR' },
    { key: 'GROUP_CARDIO_2', label: '心外二组', rate: '4.8%', numerator: 12, denominator: 250, status: '超标', nextLevel: 'DOCTOR' }
  ],
  DEPT_NEURO: [{ key: 'GROUP_NEURO_1', label: '神经外科一组', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'DOCTOR' }],
  DEPT_ORTHO: [{ key: 'GROUP_ORTHO_1', label: '骨科关节组', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'DOCTOR' }]
}

const doctors = {
  GROUP_CARDIO_1: [
    { key: 'DOC_001', label: '张医生', rate: '6.1%', numerator: 7, denominator: 115, status: '超标', nextLevel: 'PATIENT' },
    { key: 'DOC_002', label: '李医生', rate: '5.2%', numerator: 4, denominator: 77, status: '超标', nextLevel: 'PATIENT' }
  ],
  GROUP_CARDIO_2: [{ key: 'DOC_003', label: '王医生', rate: '4.8%', numerator: 12, denominator: 250, status: '超标', nextLevel: 'PATIENT' }],
  GROUP_NEURO_1: [{ key: 'DOC_004', label: '赵医生', rate: '4.1%', numerator: 18, denominator: 439, status: '超标', nextLevel: 'PATIENT' }],
  GROUP_ORTHO_1: [{ key: 'DOC_005', label: '陈医生', rate: '3.0%', numerator: 15, denominator: 500, status: '预警', nextLevel: 'PATIENT' }]
}

export function createMockDrillResult(resultId, payload = {}) {
  const currentLevel = payload.currentLevel || 'HOSPITAL'
  const parentKeys = payload.parentKeys || {}
  const rows = currentLevel === 'HOSPITAL'
    ? departments
    : currentLevel === 'DEPARTMENT'
      ? (groups[parentKeys.departmentKey] || [])
      : currentLevel === 'MEDICAL_GROUP'
        ? (doctors[parentKeys.medicalGroupKey] || [])
        : []
  const nextLevels = rows.length && rows[0].nextLevel !== 'PATIENT' ? [rows[0].nextLevel] : []
  const breadcrumb = buildBreadcrumb(currentLevel, parentKeys)
  const records = rows.map((row) => ({
    dimensionKey: row.key,
    dimensionLabel: row.label,
    indicatorValue: row.rate,
    numerator: row.numerator,
    denominator: row.denominator,
    qualityStatus: row.status,
    nextLevel: row.nextLevel
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
      { field: 'dimensionLabel', label: levelLabel(currentLevel), sortable: true },
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

function buildBreadcrumb(level, parentKeys) {
  const result = [{ level: 'HOSPITAL', label: '全院', key: 'HOSPITAL' }]
  if (level === 'DEPARTMENT' || level === 'MEDICAL_GROUP' || level === 'DOCTOR') result.push({ level: 'DEPARTMENT', label: parentKeys.departmentLabel || '心外科', key: parentKeys.departmentKey || 'DEPT_CARDIO' })
  if (level === 'MEDICAL_GROUP' || level === 'DOCTOR') result.push({ level: 'MEDICAL_GROUP', label: parentKeys.medicalGroupLabel || '心外一组', key: parentKeys.medicalGroupKey || 'GROUP_CARDIO_1' })
  if (level === 'DOCTOR') result.push({ level: 'DOCTOR', label: parentKeys.doctorLabel || '张医生', key: parentKeys.doctorKey || 'DOC_001' })
  return result
}

function levelLabel(level) {
  return { HOSPITAL: '科室', DEPARTMENT: '医疗组', MEDICAL_GROUP: '医师', DOCTOR: '病例' }[level] || '维度'
}
