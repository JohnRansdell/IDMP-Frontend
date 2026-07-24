export const sceneOptions = ['绩效考核', '医院评审', '质量安全监测', '专业质控']

export const dashboardKpis = [
  {
    title: '住院死亡率',
    value: '0.85%',
    change: '↑ 0.12%',
    target: '目标：≤0.8%',
    status: 'danger'
  },
  {
    title: '门诊人次数与出院人次数比',
    value: '102.3万',
    change: '↑ 3.2%',
    target: '目标：>90万',
    status: 'success'
  },
  {
    title: '手术患者并发症发生率',
    value: '2.3%',
    change: '↑ 0.5%',
    target: '目标：<3%',
    status: 'warning'
  },
  {
    title: '抗菌药物使用强度(DDDs)',
    value: '38.5',
    change: '↑ 2.1',
    target: '目标：<40',
    status: 'danger'
  },
  {
    title: '基本药物处方占比',
    value: '62.1%',
    change: '↓ 1.3%',
    target: '目标：>60%',
    status: 'success'
  },
  {
    title: '医疗服务收入占比',
    value: '31.2%',
    change: '↑ 1.8%',
    target: '目标：>30%',
    status: 'success'
  }
]

export const dashboardTrend = {
  months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  mortality: [0.72, 0.74, 0.71, 0.76, 0.77, 0.73, 0.79, 0.76, 0.78, 0.77, 0.81, 0.85],
  complication: [1.8, 1.7, 1.9, 2.0, 1.8, 2.1, 2.0, 2.2, 2.1, 2.3, 2.2, 2.3],
  antibiotic: [35.1, 35.8, 35.4, 36.8, 36.3, 37.5, 37.1, 37.6, 36.9, 38.2, 37.7, 38.5]
}

export const categoryRates = [
  { name: '达标', value: 85.71 },
  { name: '接近阈值', value: 8.93 },
  { name: '超标', value: 5.36 }
]

export const dashboardWarnings = [
  { level: 'danger', text: '住院死亡率 0.85% 超阈值（目标≤0.8%）', time: '2小时前' },
  { level: 'danger', text: '手术并发症率连续3月上升趋势', time: '1天前' },
  { level: 'warning', text: '抗菌药物使用强度 38.5 接近阈值（<40）', time: '2天前' },
  { level: 'info', text: '基本药物处方占比波动异常', time: '3天前' }
]

export const departmentRanking = [
  { rank: 1, department: '心外科', value: '5.2%' },
  { rank: 2, department: '神经外科', value: '4.1%' },
  { rank: 3, department: '骨科', value: '3.0%' },
  { rank: 4, department: '普外科', value: '1.8%' },
  { rank: 5, department: '泌尿外科', value: '1.5%' },
  { rank: 6, department: '胸外科', value: '1.2%' }
]

export const indicatorRows = [
  { code: 'KH-01', name: '门诊人次数与出院人次数比', category: '功能定位', attribute: '定量', version: 'V2024', direction: '监测比较', source: 'HIS', status: '已启用', scenes: 3 },
  { code: 'KH-02', name: '手术患者并发症发生率', category: '质量安全', attribute: '定量', version: 'V2024', direction: '↓逐步降低', source: 'HIS/手麻', status: '已启用', scenes: 4 },
  { code: 'KH-03', name: '抗菌药物使用强度（DDDs）', category: '合理用药', attribute: '定量', version: 'V2024', direction: '↓逐步降低', source: '药事', status: '草稿', scenes: 2 },
  { code: 'KH-04', name: '基本药物处方占比', category: '合理用药', attribute: '定量', version: 'V2024', direction: '↑逐步提高', source: '药事/HIS', status: '已启用', scenes: 3 },
  { code: 'KH-05', name: '医疗服务收入占比', category: '收支结构', attribute: '定量', version: 'V2024', direction: '↑逐步提高', source: '财务', status: '已启用', scenes: 2 },
  { code: 'KH-06', name: '日间手术占择期手术比例', category: '功能定位', attribute: '定量', version: 'V2024', direction: '↑逐步提高', source: 'HIS/手麻', status: '已启用', scenes: 3 },
  { code: 'KH-07', name: '资产负债率', category: '经济管理', attribute: '定量', version: 'V2024', direction: '↓逐步降低', source: '财务', status: '已启用', scenes: 1 },
  { code: 'KH-08', name: '门诊患者平均预约诊疗率', category: '服务流程', attribute: '定量', version: 'V2024', direction: '↑逐步提高', source: 'HIS', status: '待审核', scenes: 2 },
  { code: '2011-MORT-01', name: '住院总死亡率', category: '住院死亡类', attribute: '定量', version: 'V2011', direction: '↓逐步降低', source: 'HIS/病案', status: '已启用', scenes: 3 },
  { code: '2011-MORT-03', name: '手术患者住院死亡率', category: '住院死亡类', attribute: '定量', version: 'V2011', direction: '↓逐步降低', source: 'HIS/手麻', status: '已启用', scenes: 2 },
  { code: 'ZK-12', name: '非计划再次手术率', category: '质量安全', attribute: '定量', version: 'V2024', direction: '↓逐步降低', source: 'HIS/手麻', status: '已停用', scenes: 2 },
  { code: 'YS-2.3.1', name: '手术安全相关指标', category: '质量安全', attribute: '定性', version: 'V2025', direction: '监测比较', source: 'HIS', status: '待审核', scenes: 1 }
]

export const factorRows = [
  { code: 'F-001', name: '出院手术患者人数', type: '原子因子', category: '手术', aggregation: 'COUNT_DISTINCT', domain: '住院就诊+手术', references: 5, status: '已发布' },
  { code: 'F-002', name: '手术患者并发症发生例数', type: '原子因子', category: '手术', aggregation: 'COUNT', domain: '手术并发症', references: 3, status: '已发布' },
  { code: 'F-003', name: '住院死亡患者人数', type: '原子因子', category: '死亡', aggregation: 'COUNT_DISTINCT', domain: '住院+死亡', references: 8, status: '已发布' },
  { code: 'F-004', name: '出院患者人数', type: '原子因子', category: '住院', aggregation: 'COUNT_DISTINCT', domain: '住院就诊', references: 12, status: '已发布' },
  { code: 'F-005', name: '抗菌药物使用DDD数', type: '原子因子', category: '用药', aggregation: 'SUM', domain: '抗菌药物', references: 2, status: '已发布' },
  { code: 'F-010', name: '医疗服务收入（不含药品耗材检查）', type: '组合因子', category: '费用', aggregation: 'SUM', domain: '费用明细', references: 2, status: '已发布' },
  { code: 'F-011', name: '急诊抢救室滞留时间（中位数）', type: '原子因子', category: '急诊', aggregation: 'MEDIAN', domain: '急诊就诊', references: 1, status: '草稿' }
]

export const editorFactors = [
  { code: 'F-001', name: '同期出院手术患者人数', aggregation: 'COUNT_DISTINCT', category: '手术', domain: '住院就诊+手术' },
  { code: 'F-002', name: '手术患者并发症发生例数', aggregation: 'COUNT', category: '手术', domain: '手术并发症' },
  { code: 'F-003', name: '住院死亡患者人数', aggregation: 'COUNT_DISTINCT', category: '死亡', domain: '住院+死亡' },
  { code: 'F-004', name: '出院患者人数', aggregation: 'COUNT_DISTINCT', category: '住院', domain: '住院就诊' },
  { code: 'F-005', name: '抗菌药物使用DDD数', aggregation: 'SUM', category: '用药', domain: '抗菌药物' },
  { code: 'F-006', name: '出院患者平均住院日', aggregation: 'AVG', category: '住院', domain: '住院就诊' },
  { code: 'F-007', name: '门诊挂号人次数', aggregation: 'COUNT', category: '门诊', domain: '门诊就诊' },
  { code: 'F-008', name: '医疗收入总额', aggregation: 'SUM', category: '费用', domain: '费用明细' }
]

export const editorSceneRows = [
  { name: '三级公立医院绩效考核', code: 'KH', exclusion: '默认', override: '默认', report: '按年度上报' },
  { name: '三级医院评审', code: 'YS', exclusion: '+自定义', override: '有覆盖', report: '按病种分别统计' },
  { name: '专业质控', code: 'ZK', exclusion: '默认', override: '默认', report: '按季度上报' }
]

export const editorPolicyRows = [
  { policy: '国家三级公立医院绩效考核操作手册', version: '2024版', code: 'KH-02', originalName: '手术患者并发症发生率', chapter: '医疗质量-质量安全', relation: '主要来源' },
  { policy: '三级综合医院医疗质量管理与控制指标', version: '2011版', code: 'MORT-03', originalName: '手术患者并发症发生率', chapter: '住院死亡类指标', relation: '参考' }
]

export const sceneIndicators = [
  { code: 'KH-01', name: '门诊人次数与出院人次数比', version: 'V2024', exclusion: '默认', override: '无', report: '按年度', latest: '1.82', tone: 'normal' },
  { code: 'KH-02', name: '手术患者并发症发生率', version: 'V2024', exclusion: '+自定义', override: '有覆盖', report: '按年度', latest: '2.3% ↑', tone: 'warning' },
  { code: 'KH-03', name: '抗菌药物使用强度（DDDs）', version: 'V2024', exclusion: '默认', override: '无', report: '按季度', latest: '38.5', tone: 'normal' }
]

export const mappingStats = [
  { label: '总映射', value: 186, tone: 'blue' },
  { label: '完全一致', value: 120, tone: 'green' },
  { label: '部分重叠', value: 45, tone: 'orange' },
  { label: '待审核', value: 12, tone: 'gold' },
  { label: '未映射', value: 23, tone: 'red' }
]

export const mappingRows = [
  { sourceCode: 'KH-02', sourceName: '手术患者并发症发生率', targetCode: '2011-MORT-03', targetName: '手术患者并发症发生率', type: '完全一致', confidence: 95, status: '已审核', difference: '—' },
  { sourceCode: 'KH-02', sourceName: '手术患者并发症发生率', targetCode: 'YS-2.3.1', targetName: '手术安全相关指标', type: '部分重叠', confidence: 78, status: '待审核', difference: '评审场景排除一级手术' },
  { sourceCode: 'KH-09', sourceName: '非计划再次手术率', targetCode: '2011-RETURN-01', targetName: '重返手术室再次手术率', type: '完全一致', confidence: 92, status: '已审核', difference: '名称不同，本质相同' },
  { sourceCode: 'ZK-17', sourceName: '急诊抢救室滞留时间', targetCode: 'NCIS-ER-08', targetName: '急诊患者滞留时间中位数', type: '部分重叠', confidence: 68, status: '待审核', difference: '统计口径与时间范围不同' }
]

export const analysisSummary = [
  { label: '当前值', value: '2.3%', tone: 'danger' },
  { label: '目标值', value: '<3%' },
  { label: '上期值', value: '1.8%' },
  { label: '变化', value: '↑0.5%', tone: 'danger' },
  { label: '分子', value: '286例' },
  { label: '分母', value: '12,458人' }
]

export const analysisTrendByPeriod = {
  月度: {
    range: '2024-01 ~ 2024-12',
    labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    actual: [1.8, 1.7, 1.9, 2.0, 1.8, 2.1, 2.0, 2.2, 2.1, 2.3, 2.2, 2.1],
    peer: [2.0, 1.9, 2.1, 2.2, 2.0, 2.3, 2.2, 2.4, 2.3, 2.5, 2.4, 2.5]
  },
  季度: {
    range: '2023 Q1 ~ 2024 Q4',
    labels: ['23Q1', '23Q2', '23Q3', '23Q4', '24Q1', '24Q2', '24Q3', '24Q4'],
    actual: [1.6, 1.7, 1.8, 1.9, 1.8, 2.0, 2.2, 2.3],
    peer: [1.9, 2.0, 2.0, 2.1, 2.1, 2.2, 2.3, 2.4]
  },
  年度: {
    range: '2019 ~ 2024',
    labels: ['2019', '2020', '2021', '2022', '2023', '2024'],
    actual: [1.4, 1.5, 1.6, 1.8, 1.9, 2.3],
    peer: [1.8, 1.9, 2.0, 2.0, 2.1, 2.4]
  }
}

export const analysisRankRows = [
  { rank: 1, department: '心外科', rate: '5.2%', numerator: 26, denominator: 500, change: '↑1.2%', status: '超标' },
  { rank: 2, department: '神经外科', rate: '4.1%', numerator: 18, denominator: 439, change: '↑0.8%', status: '超标' },
  { rank: 3, department: '骨科', rate: '3.0%', numerator: 15, denominator: 500, change: '↓0.3%', status: '预警' },
  { rank: 4, department: '普外科', rate: '1.8%', numerator: 9, denominator: 500, change: '→', status: '达标' },
  { rank: 5, department: '泌尿外科', rate: '1.5%', numerator: 6, denominator: 400, change: '↓0.2%', status: '达标' },
  { rank: 6, department: '胸外科', rate: '1.2%', numerator: 5, denominator: 417, change: '→', status: '达标' }
]

export const analysisDrillRows = [
  { patientId: 'P***234', admissionNo: 'H2024001', admissionDate: '2024-06-01', surgeryDate: '2024-06-03', level: '四级', complication: '纵隔感染', occurredAt: '2024-06-10' },
  { patientId: 'P***567', admissionNo: 'H2024056', admissionDate: '2024-07-12', surgeryDate: '2024-07-14', level: '四级', complication: '切口裂开', occurredAt: '2024-07-22' },
  { patientId: 'P***891', admissionNo: 'H2024089', admissionDate: '2024-08-20', surgeryDate: '2024-08-22', level: '三级', complication: '肺部感染', occurredAt: '2024-08-28' },
  { patientId: 'P***123', admissionNo: 'H2024112', admissionDate: '2024-09-05', surgeryDate: '2024-09-06', level: '四级', complication: '败血症', occurredAt: '2024-09-12' }
]

export const alertStats = [
  { label: '严重', value: 3, tone: 'danger' },
  { label: '警告', value: 8, tone: 'warning' },
  { label: '提示', value: 12, tone: 'info' },
  { label: '待处理', value: 5, tone: 'pending' }
]

export const alertRows = [
  { level: '严重', type: '阈值超标', indicator: '住院死亡率', scene: '绩效考核', actual: '0.85%', threshold: '≤0.8%', time: '2024-07-15', status: '待处理' },
  { level: '严重', type: '趋势异常', indicator: '手术并发症率', scene: '绩效考核', actual: '连续3月↑', threshold: '连续上升', time: '2024-07-14', status: '处理中' },
  { level: '警告', type: '波动预警', indicator: '抗菌药物使用强度', scene: '绩效考核', actual: '38.5', threshold: '<40', time: '2024-07-13', status: '待处理' },
  { level: '提示', type: '场景差异', indicator: '手术并发症率', scene: '多场景', actual: '差 0.4%', threshold: '场景间差异>0.3%', time: '2024-07-12', status: '已确认' }
]
