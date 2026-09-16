// Acceptance-only synthetic BI rows. They are never derived from or mixed with
// production API responses; every tuple is an explicitly present observation.
const departments = [
  ['呼吸内科', '呼吸一组', '张医生', ['COPD', '肺炎', '哮喘']],
  ['心内科', '心内一组', '李医生', ['冠心病', '心衰']]
]
const months = ['2026-01', '2026-02', '2026-03', '2026-04']

export const dashboardAcceptanceRows = months.flatMap((month, monthIndex) => departments.flatMap(([department, medicalGroup, doctor, diseases], departmentIndex) => diseases.map((disease, diseaseIndex) => {
  const denominator = 80 + monthIndex * 11 + departmentIndex * 19 + diseaseIndex * 7
  const numerator = 4 + monthIndex + departmentIndex * 2 + diseaseIndex
  return {
    year: '2026', quarter: `Q${Math.floor(monthIndex / 3) + 1}`, month, date: `${month}-15`,
    department, medicalGroup, doctor, disease,
    scene: ['绩效考核', '医院评审', '质量安全'][diseaseIndex % 3],
    indicatorCategory: departmentIndex ? '运营效率' : '医疗质量',
    indicatorValue: Number((numerator / denominator * 100).toFixed(2)), numerator, denominator,
    targetValue: departmentIndex ? 4.2 : 3.6,
    yoy: Number((1.2 + monthIndex * 0.35 - departmentIndex * 0.2).toFixed(2)),
    mom: Number((0.3 + diseaseIndex * 0.15 - monthIndex * 0.08).toFixed(2))
  }
})))
