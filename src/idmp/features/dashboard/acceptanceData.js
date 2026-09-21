// Fixed, auditable observations for Dashboard acceptance. They never mix with API data.
const rows = [
['2026-07','呼吸内科','慢阻肺','质量安全监测','呼吸质量',54],['2026-07','呼吸内科','肺炎','质量安全监测','呼吸质量',50],['2026-07','心内科','冠心病','医院评审','心血管质量',48],['2026-07','心内科','心衰','医院评审','心血管质量',46],['2026-07','普外科','阑尾炎','绩效考核','手术质量',44],['2026-07','普外科','胆囊炎','绩效考核','手术质量',42],
['2026-08','呼吸内科','慢阻肺','质量安全监测','呼吸质量',56],['2026-08','呼吸内科','肺炎','质量安全监测','呼吸质量',52],['2026-08','心内科','冠心病','医院评审','心血管质量',49],['2026-08','心内科','心衰','医院评审','心血管质量',47],['2026-08','普外科','阑尾炎','绩效考核','手术质量',46],['2026-08','普外科','胆囊炎','绩效考核','手术质量',43],
['2026-09','呼吸内科','慢阻肺','质量安全监测','呼吸质量',58],['2026-09','呼吸内科','肺炎','质量安全监测','呼吸质量',54],['2026-09','心内科','冠心病','医院评审','心血管质量',50],['2026-09','心内科','心衰','医院评审','心血管质量',48],['2026-09','普外科','阑尾炎','绩效考核','手术质量',47],['2026-09','普外科','胆囊炎','绩效考核','手术质量',45]
]
const drillIdentity = {
  '呼吸内科': { medicalGroup: '呼吸一组', doctor: '张医生' },
  '心内科': { medicalGroup: '心内一组', doctor: '王医生' },
  '普外科': { medicalGroup: '普外一组', doctor: '陈医生' }
}
// Keep the field catalog contract used by the existing binding/drill examples;
// these extra dimensions are deterministic fixture metadata, not another dataset.
export const dashboardAcceptanceRows = rows.map(([month, department, disease, scene, indicatorCategory, indicatorValue]) => ({
  year: '2026', quarter: 'Q3', month,
  date: `${month}-${month.endsWith('07') || month.endsWith('08') ? '31' : '30'}`,
  department, ...drillIdentity[department], disease, scene, indicatorCategory,
  numerator: indicatorValue, denominator: 100, indicatorValue, targetValue: 50, mom: 0, yoy: 0
}))
export const dashboardAcceptanceKpis = Object.freeze([
  { name: '男性出院患者占比', currentValue: 52.63, unit: '%', mom: 1.24, yoy: 3.18, trendDirection: 'up', target: '≥ 50%', status: 'success' },
  { name: '住院患者死亡率', currentValue: 0.68, unit: '%', mom: -0.12, yoy: -0.20, trendDirection: 'down', target: '≤ 0.80%', status: 'success' },
  { name: '手术并发症发生率', currentValue: 1.10, unit: '%', mom: 0, yoy: 0.02, trendDirection: 'flat', target: '≤ 1.20%', status: 'info' }
])
export const dashboardAcceptanceDrillRows = Object.freeze([
  ['呼吸内科','呼吸一组','张医生',58],['呼吸内科','呼吸一组','周医生',55],['呼吸内科','呼吸二组','李医生',54],['呼吸内科','呼吸二组','孙医生',52],['心内科','心内一组','王医生',50],['心内科','心内一组','钱医生',48],['心内科','心内二组','赵医生',48],['心内科','心内二组','吴医生',46],['普外科','普外一组','陈医生',47],['普外科','普外一组','郑医生',45],['普外科','普外二组','刘医生',45],['普外科','普外二组','冯医生',43]
].map(([department, medicalGroup, doctor, value]) => ({ department, medicalGroup, doctor, value })))
export const dashboardAcceptanceMapRows = Object.freeze([{ region: '东区', value: 82 }, { region: '西区', value: 67 }, { region: '南区', value: 74 }, { region: '北区', value: 59 }])
export const dashboardAcceptanceDualAxisRows = Object.freeze([
  { month: '2026-07', actualValue: 47.33, targetValue: 50 },
  { month: '2026-08', actualValue: 48.83, targetValue: 50 },
  { month: '2026-09', actualValue: 50.33, targetValue: 50 }
])
export const dashboardAcceptanceText = Object.freeze({ title: '医疗质量安全指标说明', body: '本看板数据仅用于前端功能验收。\n当前内容均为 Mock 数据。' })

// These are frontend-only sources. Their stable labels make UAT selection
// unambiguous and keep them separate from the published-indicator catalog.
export const dashboardAcceptanceSources = Object.freeze([
  { ...dashboardAcceptanceKpis[0], code: 'UAT_KPI_MALE_DISCHARGE', name: '[UAT] 男性出院患者占比（趋势↑）', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'current' },
  { ...dashboardAcceptanceKpis[1], code: 'UAT_KPI_MORTALITY', name: '[UAT] 住院患者死亡率（趋势↓）', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'current' },
  { ...dashboardAcceptanceKpis[2], code: 'UAT_KPI_SURGERY_COMPLICATION', name: '[UAT] 手术并发症发生率（趋势↔）', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'current' },
  { code: 'UAT_QUALITY_SAFETY_Q3', name: '[UAT] 质量安全综合数据（2026 Q3 · 18条）', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'acceptance', unit: '%', currentValue: 50.33 },
  { code: 'UAT_ORGANIZATION_DRILL', name: '[UAT] 组织层级下钻数据', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'drill', unit: '', currentValue: 0 },
  { code: 'UAT_REGION_DISTRIBUTION', name: '[UAT] 区域分布数据', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'map', unit: '', currentValue: 0 },
  { code: 'UAT_DUAL_AXIS_MONTHLY', name: '[UAT] 双 Y 轴月度数据', category: '验收数据', origin: 'acceptance', acceptanceDataset: 'dual-axis', unit: '', currentValue: 50.33 }
])
