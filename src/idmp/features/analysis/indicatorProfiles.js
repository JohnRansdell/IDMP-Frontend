export const DEFAULT_ANALYSIS_INDICATOR = 'SURGERY_COMPLICATION'

const periodLabels = {
  monthly: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  quarterly: ['23Q1', '23Q2', '23Q3', '23Q4', '24Q1', '24Q2', '24Q3', '24Q4'],
  yearly: ['2019', '2020', '2021', '2022', '2023', '2024']
}

export const periodOptions = ['月度', '季度', '年度']

export const analysisProfiles = {
  MORTALITY_INPATIENT: {
    code: 'MORTALITY_INPATIENT',
    name: '住院死亡率',
    unit: '%',
    targetLabel: '目标值 ≤0.8%',
    markLineValue: 0.8,
    yAxisMax: 1.6,
    summary: [
      { label: '当前值', value: '0.42%' },
      { label: '目标值', value: '≤0.8%' },
      { label: '上期值', value: '0.45%' },
      { label: '变化', value: '↓0.03%', tone: 'success' },
      { label: '分子', value: '403例' },
      { label: '分母', value: '95,755人次' }
    ],
    sceneComparisons: [
      { name: '绩效考核', value: '0.42%', difference: '当前场景', current: true },
      { name: '医院评审', value: '0.48%', difference: '较当前 +0.06%' },
      { name: '专业质控', value: '0.45%', difference: '较当前 +0.03%' }
    ],
    trends: {
      月度: createTrend('2024-01 ~ 2024-12', periodLabels.monthly, [0.39, 0.41, 0.38, 0.43, 0.44, 0.4, 0.46, 0.43, 0.42, 0.44, 0.43, 0.42], [0.58, 0.57, 0.59, 0.6, 0.58, 0.56, 0.59, 0.58, 0.57, 0.56, 0.55, 0.54]),
      季度: createTrend('2023 Q1 ~ 2024 Q4', periodLabels.quarterly, [0.52, 0.49, 0.47, 0.46, 0.44, 0.43, 0.42, 0.42], [0.66, 0.64, 0.62, 0.61, 0.6, 0.58, 0.56, 0.54]),
      年度: createTrend('2019 ~ 2024', periodLabels.yearly, [0.72, 0.66, 0.6, 0.54, 0.47, 0.42], [0.82, 0.78, 0.73, 0.68, 0.61, 0.54])
    },
    rankRows: [
      { rank: 1, department: 'ICU', rate: '1.46%', numerator: 38, denominator: 2604, change: '↑0.12%', status: '超标' },
      { rank: 2, department: '心外科', rate: '1.12%', numerator: 26, denominator: 2321, change: '↑0.06%', status: '超标' },
      { rank: 3, department: '神经外科', rate: '0.96%', numerator: 22, denominator: 2292, change: '→', status: '预警' },
      { rank: 4, department: '普外科', rate: '0.74%', numerator: 31, denominator: 4189, change: '↓0.04%', status: '达标' },
      { rank: 5, department: '骨科', rate: '0.62%', numerator: 17, denominator: 2742, change: '↓0.03%', status: '达标' }
    ],
    drillRows: [
      { subjectId: 'P***218', recordNo: 'H2024021', startDate: '2024-02-03', eventDate: '2024-02-18', level: '死亡记录', event: '住院死亡病例', occurredAt: '2024-02-18' },
      { subjectId: 'P***556', recordNo: 'H2024168', startDate: '2024-05-12', eventDate: '2024-05-30', level: '死亡记录', event: '住院死亡病例', occurredAt: '2024-05-30' },
      { subjectId: 'P***903', recordNo: 'H2024389', startDate: '2024-08-06', eventDate: '2024-08-21', level: '死亡记录', event: '住院死亡病例', occurredAt: '2024-08-21' }
    ]
  },
  OUTPATIENT_DISCHARGE_RATIO: createProfile({
    code: 'OUTPATIENT_DISCHARGE_RATIO',
    name: '门诊人次数与出院人次数比',
    unit: '',
    targetLabel: '目标值 ≥90',
    markLineValue: 90,
    yAxisMax: 140,
    current: '102.3',
    target: '≥90',
    previous: '99.1',
    change: '↑3.2%',
    numerator: '1,023,000人次',
    denominator: '10,000人次',
    monthlyActual: [96, 97, 98, 99, 101, 100, 103, 104, 101, 102, 103, 102.3],
    monthlyPeer: [92, 94, 93, 95, 96, 95, 97, 98, 98, 99, 100, 101],
    departments: [
      ['儿科', '126', 1260, 10, '↑4.1%', '达标'],
      ['内科', '112', 1120, 10, '↑2.8%', '达标'],
      ['妇产科', '108', 1080, 10, '↑1.6%', '达标'],
      ['外科', '94', 940, 10, '→', '达标'],
      ['急诊科', '87', 870, 10, '↓1.2%', '预警']
    ]
  }),
  SURGERY_COMPLICATION: createProfile({
    code: 'SURGERY_COMPLICATION',
    name: '手术患者并发症发生率',
    unit: '%',
    targetLabel: '目标值 <3%',
    markLineValue: 3,
    yAxisMax: 4,
    current: '2.3%',
    target: '<3%',
    previous: '1.8%',
    change: '↑0.5%',
    numerator: '286例',
    denominator: '12,458人',
    monthlyActual: [1.8, 1.7, 1.9, 2.0, 1.8, 2.1, 2.0, 2.2, 2.1, 2.3, 2.2, 2.1],
    monthlyPeer: [2.0, 1.9, 2.1, 2.2, 2.0, 2.3, 2.2, 2.4, 2.3, 2.5, 2.4, 2.5],
    departments: [
      ['心外科', '5.2%', 26, 500, '↑1.2%', '超标'],
      ['神经外科', '4.1%', 18, 439, '↑0.8%', '超标'],
      ['骨科', '3.0%', 15, 500, '↑0.3%', '预警'],
      ['普外科', '1.8%', 9, 500, '→', '达标'],
      ['泌尿外科', '1.5%', 6, 400, '↓0.2%', '达标']
    ],
    drillRows: [
      { subjectId: 'P***234', recordNo: 'H2024001', startDate: '2024-06-01', eventDate: '2024-06-03', level: '四级', event: '纵隔感染', occurredAt: '2024-06-10' },
      { subjectId: 'P***567', recordNo: 'H2024056', startDate: '2024-07-12', eventDate: '2024-07-14', level: '四级', event: '切口裂开', occurredAt: '2024-07-22' },
      { subjectId: 'P***891', recordNo: 'H2024089', startDate: '2024-08-20', eventDate: '2024-08-22', level: '三级', event: '肺部感染', occurredAt: '2024-08-28' }
    ]
  }),
  ANTIBIOTIC_DDDS: createProfile({
    code: 'ANTIBIOTIC_DDDS',
    name: '抗菌药物使用强度',
    unit: '',
    targetLabel: '目标值 <40',
    markLineValue: 40,
    yAxisMax: 55,
    current: '38.5',
    target: '<40',
    previous: '36.4',
    change: '↑2.1',
    numerator: '38,500 DDD',
    denominator: '1,000床日',
    monthlyActual: [35.1, 35.8, 35.4, 36.8, 36.3, 37.5, 37.1, 37.6, 36.9, 38.2, 37.7, 38.5],
    monthlyPeer: [33.6, 34.1, 34.5, 35, 35.4, 35.8, 36.2, 36.5, 36.8, 37.1, 37.3, 37.6],
    departments: [
      ['ICU', '48.7', 4870, 100, '↑3.4', '超标'],
      ['呼吸科', '42.1', 4210, 100, '↑1.6', '超标'],
      ['普外科', '39.4', 3940, 100, '↑0.8', '预警'],
      ['儿科', '34.8', 3480, 100, '↓0.5', '达标'],
      ['骨科', '31.5', 3150, 100, '→', '达标']
    ]
  }),
  ESSENTIAL_MEDICINE_RATIO: createProfile({
    code: 'ESSENTIAL_MEDICINE_RATIO',
    name: '基本药物处方占比',
    unit: '%',
    targetLabel: '目标值 ≥60%',
    markLineValue: 60,
    yAxisMax: 80,
    current: '62.1%',
    target: '≥60%',
    previous: '60.8%',
    change: '↑1.3%',
    numerator: '186,300张',
    denominator: '300,000张',
    monthlyActual: [57, 58, 59, 60, 59.5, 60.4, 61, 61.2, 61.6, 62, 62.2, 62.1],
    monthlyPeer: [55, 55.5, 56, 57, 57.5, 58, 58.5, 59, 59.3, 59.8, 60.1, 60.4],
    departments: [
      ['全科医学科', '68.4%', 6840, 10000, '↑2.1%', '达标'],
      ['儿科', '65.2%', 6520, 10000, '↑1.3%', '达标'],
      ['内科', '62.8%', 6280, 10000, '↑0.8%', '达标'],
      ['外科', '58.6%', 5860, 10000, '↓0.4%', '预警'],
      ['急诊科', '56.9%', 5690, 10000, '→', '预警']
    ]
  }),
  MEDICAL_SERVICE_REVENUE_RATIO: createProfile({
    code: 'MEDICAL_SERVICE_REVENUE_RATIO',
    name: '医疗服务收入占比',
    unit: '%',
    targetLabel: '目标值 ≥30%',
    markLineValue: 30,
    yAxisMax: 45,
    current: '31.2%',
    target: '≥30%',
    previous: '29.4%',
    change: '↑1.8%',
    numerator: '3,120万元',
    denominator: '10,000万元',
    monthlyActual: [27.8, 28.2, 28.6, 29, 29.3, 29.7, 30.1, 30.4, 30.7, 31, 31.1, 31.2],
    monthlyPeer: [26.5, 26.8, 27.2, 27.6, 28, 28.3, 28.7, 29, 29.4, 29.7, 30, 30.2],
    departments: [
      ['康复科', '38.2%', 382, 1000, '↑2.4%', '达标'],
      ['中医科', '35.6%', 356, 1000, '↑1.6%', '达标'],
      ['内科', '31.8%', 318, 1000, '↑0.9%', '达标'],
      ['外科', '29.6%', 296, 1000, '→', '预警'],
      ['检查科', '24.1%', 241, 1000, '↓0.5%', '预警']
    ]
  })
}

export function getAnalysisProfile(code) {
  return analysisProfiles[code] || analysisProfiles[DEFAULT_ANALYSIS_INDICATOR]
}

export function getAnalysisProfileOptions() {
  return Object.values(analysisProfiles).map(({ code, name }) => ({ code, name }))
}

export function updateMortalityProfileFromChain(chain) {
  const profile = analysisProfiles.MORTALITY_INPATIENT
  const indicatorRecord = chain?.indicatorResult?.results?.records?.[0]
  const deathRecord = chain?.deathFactor?.results?.records?.[0]
  const dischargeRecord = chain?.dischargeFactor?.results?.records?.[0]
  const displayValue = indicatorRecord?.displayValue
  const deathValue = formatNumber(deathRecord?.valueDecimal)
  const dischargeValue = formatNumber(dischargeRecord?.valueDecimal)

  if (displayValue) profile.summary[0] = { ...profile.summary[0], value: displayValue }
  if (deathValue) profile.summary[4] = { ...profile.summary[4], value: `${deathValue}例` }
  if (dischargeValue) profile.summary[5] = { ...profile.summary[5], value: `${dischargeValue}人次` }
  if (displayValue) profile.sceneComparisons[0] = { ...profile.sceneComparisons[0], value: displayValue }
}

function createProfile(config) {
  const tone = config.change.startsWith('↑') && Number.parseFloat(config.current) > config.markLineValue ? 'danger' : undefined
  return {
    ...config,
    summary: [
      { label: '当前值', value: config.current, tone },
      { label: '目标值', value: config.target },
      { label: '上期值', value: config.previous },
      { label: '变化', value: config.change, tone },
      { label: '分子', value: config.numerator },
      { label: '分母', value: config.denominator }
    ],
    sceneComparisons: [
      { name: '绩效考核', value: config.current, difference: '当前场景', current: true },
      { name: '医院评审', value: shiftDisplayValue(config.current, 0.2, config.unit), difference: '较当前 +0.2' + config.unit },
      { name: '专业质控', value: shiftDisplayValue(config.current, 0.1, config.unit), difference: '较当前 +0.1' + config.unit }
    ],
    trends: {
      月度: createTrend('2024-01 ~ 2024-12', periodLabels.monthly, config.monthlyActual, config.monthlyPeer),
      季度: createTrend('2023 Q1 ~ 2024 Q4', periodLabels.quarterly, sampleTrend(config.monthlyActual, [0, 2, 4, 5, 7, 8, 10, 11]), sampleTrend(config.monthlyPeer, [0, 2, 4, 5, 7, 8, 10, 11])),
      年度: createTrend('2019 ~ 2024', periodLabels.yearly, sampleTrend(config.monthlyActual, [0, 2, 4, 7, 10, 11]), sampleTrend(config.monthlyPeer, [0, 2, 4, 7, 10, 11]))
    },
    rankRows: config.departments.map(([department, rate, numerator, denominator, change, status], index) => ({
      rank: index + 1,
      department,
      rate,
      numerator,
      denominator,
      change,
      status
    })),
    drillRows: config.drillRows || createDrillRows(config.name)
  }
}

function createTrend(range, labels, actual, peer) {
  return { range, labels, actual, peer }
}

function sampleTrend(values, indexes) {
  return indexes.map((index) => values[index])
}

function createDrillRows(name) {
  return [
    { subjectId: 'D***001', recordNo: 'R2024001', startDate: '2024-03-01', eventDate: '2024-03-31', level: '月度记录', event: `${name}明细`, occurredAt: '2024-03-31' },
    { subjectId: 'D***002', recordNo: 'R2024068', startDate: '2024-06-01', eventDate: '2024-06-30', level: '月度记录', event: `${name}明细`, occurredAt: '2024-06-30' },
    { subjectId: 'D***003', recordNo: 'R2024120', startDate: '2024-12-01', eventDate: '2024-12-31', level: '月度记录', event: `${name}明细`, occurredAt: '2024-12-31' }
  ]
}

function shiftDisplayValue(value, delta, unit) {
  const numeric = Number.parseFloat(value)
  if (Number.isNaN(numeric)) return value
  return `${(numeric + delta).toFixed(1)}${unit || ''}`
}

function formatNumber(value) {
  const numeric = Number(value)
  if (Number.isNaN(numeric)) return ''
  return numeric.toLocaleString('zh-CN')
}
