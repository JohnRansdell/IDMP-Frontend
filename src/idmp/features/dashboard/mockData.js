import { dashboardTrend, departmentRanking } from '@/idmp/data/demo'

export const mockDashboardCatalog = [
  {
    code: 'quality-overview',
    name: '质量分析首页',
    description: '医疗质量指标总览',
    status: 'PUBLISHED'
  }
]

export const mockDashboardDefinition = {
  code: 'quality-overview',
  name: '质量分析首页',
  description: '医疗质量指标总览',
  versionNo: 1,
  filters: ['year', 'month', 'deptCode'],
  widgets: [
    {
      code: 'summaryCards',
      name: '汇总指标',
      type: 'SUMMARY',
      dataQueryCode: 'quality-overview',
      config: {}
    }
  ]
}

export const mockDashboardQueryResult = {
  summaryCards: {
    outpatientNum: 1200,
    dischargeNum: 300,
    deathNum: 2
  },
  departmentRanking: [
    { deptCode: 'D001', deptName: '内科', value: 100 }
  ],
  monthlyTrend: [
    { month: 12, value: 300 }
  ]
}

export const mockIndicatorDataSources = [
  {
    code: 'MORTALITY_INPATIENT',
    name: '住院死亡率',
    category: '质量安全',
    unit: '%',
    currentValue: 0.85,
    change: '↑ 0.12%',
    target: '目标：≤0.8%',
    status: 'danger',
    trendData: [0.72, 0.74, 0.71, 0.76, 0.77, 0.73, 0.79, 0.76, 0.78, 0.77, 0.81, 0.85],
    departmentData: [
      { name: '心外科', value: 1.12 },
      { name: '神经外科', value: 0.96 },
      { name: '骨科', value: 0.62 },
      { name: '普外科', value: 0.74 },
      { name: 'ICU', value: 1.46 }
    ],
    pieData: [
      { name: '达标', value: 72 },
      { name: '预警', value: 18 },
      { name: '超标', value: 10 }
    ]
  },
  {
    code: 'OUTPATIENT_DISCHARGE_RATIO',
    name: '门诊人次数与出院人次数比',
    category: '功能定位',
    unit: '',
    currentValue: 102.3,
    change: '↓ 3.2%',
    target: '目标：≥90',
    status: 'success',
    trendData: [96, 97, 98, 99, 101, 100, 103, 104, 101, 102, 103, 102.3],
    departmentData: [
      { name: '内科', value: 112 },
      { name: '外科', value: 94 },
      { name: '妇产科', value: 108 },
      { name: '儿科', value: 126 },
      { name: '急诊科', value: 87 }
    ],
    pieData: [
      { name: '高于目标', value: 66 },
      { name: '接近目标', value: 24 },
      { name: '低于目标', value: 10 }
    ]
  },
  {
    code: 'SURGERY_COMPLICATION',
    name: '手术患者并发症发生率',
    category: '质量安全',
    unit: '%',
    currentValue: 2.3,
    change: '↑ 0.5%',
    target: '目标：≤3%',
    status: 'warning',
    trendData: [1.8, 1.7, 1.9, 2.0, 1.8, 2.1, 2.0, 2.2, 2.1, 2.3, 2.2, 2.3],
    departmentData: departmentRanking.map((row) => ({ name: row.department, value: Number.parseFloat(row.value) })),
    pieData: [
      { name: 'Ⅰ级', value: 41 },
      { name: 'Ⅱ级', value: 34 },
      { name: 'Ⅲ级', value: 18 },
      { name: 'Ⅳ级', value: 7 }
    ]
  },
  {
    code: 'ANTIBIOTIC_DDDS',
    name: '抗菌药物使用强度',
    category: '合理用药',
    unit: '',
    currentValue: 38.5,
    change: '↑ 2.1',
    target: '目标：<40',
    status: 'danger',
    trendData: dashboardTrend.antibiotic,
    departmentData: [
      { name: '呼吸科', value: 42.1 },
      { name: 'ICU', value: 48.7 },
      { name: '普外科', value: 39.4 },
      { name: '骨科', value: 31.5 },
      { name: '儿科', value: 34.8 }
    ],
    pieData: [
      { name: '限制级', value: 22 },
      { name: '非限制级', value: 61 },
      { name: '特殊级', value: 17 }
    ]
  },
  {
    code: 'ESSENTIAL_MEDICINE_RATIO',
    name: '基本药物处方占比',
    category: '合理用药',
    unit: '%',
    currentValue: 62.1,
    change: '↑1.3%',
    target: '目标：≥60%',
    status: 'success',
    trendData: [57, 58, 59, 60, 59.5, 60.4, 61, 61.2, 61.6, 62, 62.2, 62.1],
    departmentData: [
      { name: '全科医学科', value: 68.4 },
      { name: '儿科', value: 65.2 },
      { name: '内科', value: 62.8 },
      { name: '外科', value: 58.6 },
      { name: '急诊科', value: 56.9 }
    ],
    pieData: [
      { name: '达标', value: 72 },
      { name: '预警', value: 22 },
      { name: '未达标', value: 6 }
    ]
  },
  {
    code: 'MEDICAL_SERVICE_REVENUE_RATIO',
    name: '医疗服务收入占比',
    category: '收支结构',
    unit: '%',
    currentValue: 31.2,
    change: '↑1.8%',
    target: '目标：≥30%',
    status: 'success',
    trendData: [27.8, 28.2, 28.6, 29, 29.3, 29.7, 30.1, 30.4, 30.7, 31, 31.1, 31.2],
    departmentData: [
      { name: '康复科', value: 38.2 },
      { name: '中医科', value: 35.6 },
      { name: '内科', value: 31.8 },
      { name: '外科', value: 29.6 },
      { name: '检查科', value: 24.1 }
    ],
    pieData: [
      { name: '医疗服务', value: 31.2 },
      { name: '药品耗材', value: 37.8 },
      { name: '检查检验', value: 31 }
    ]
  },
  {
    code: 'BED_USAGE',
    name: '床位使用率',
    category: '运行效率',
    unit: '%',
    currentValue: 89.6,
    change: '↑ 2.8%',
    target: '目标：85%~93%',
    status: 'warning',
    trendData: [84, 86, 87, 88, 89, 88, 90, 91, 89, 90, 91, 89.6],
    departmentData: [
      { name: '心内科', value: 93 },
      { name: '神经内科', value: 91 },
      { name: '骨科', value: 86 },
      { name: '普外科', value: 88 },
      { name: '康复科', value: 82 }
    ],
    pieData: [
      { name: '高负荷', value: 28 },
      { name: '合理', value: 58 },
      { name: '低负荷', value: 14 }
    ]
  }
]
