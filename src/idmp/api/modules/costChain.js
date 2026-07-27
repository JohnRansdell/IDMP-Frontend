import { requestJson } from '@/idmp/api/request'

export const costChainConfig = {
  // 次均费用指标
  avgCostIndicatorCode: 'IND_AVG_INPATIENT_COST_20260727_1640',
  avgCostIndicatorId: '101996817981382232',
  avgCostVersionId: '101996817981382234',
  avgCostFactorVersionId: '101996817981382014',

  // 抗菌药物费用占比指标
  antiCostIndicatorCode: 'IND_ANTIBACTERIAL_COST_RATIO_20260727_1640',
  antiCostIndicatorId: '101996817981382233',
  antiCostVersionId: '101996817981382235',
  antiCostFactorVersionId: '101996817981382016',

  periodStart: '2026-03-01',
  periodEnd: '2026-04-01'
}

export const COST_INDICATOR_IDS = [
  costChainConfig.avgCostIndicatorId,
  costChainConfig.antiCostIndicatorId
]

export const COST_INDICATOR_CODE_MAP = {
  [costChainConfig.avgCostIndicatorCode]: {
    indicatorId: costChainConfig.avgCostIndicatorId,
    indicatorVersionId: costChainConfig.avgCostVersionId
  },
  [costChainConfig.antiCostIndicatorCode]: {
    indicatorId: costChainConfig.antiCostIndicatorId,
    indicatorVersionId: costChainConfig.antiCostVersionId
  }
}

export function fetchCostAnalysis(indicatorCode, granularity) {
  const mapping = COST_INDICATOR_CODE_MAP[indicatorCode]
  if (!mapping) return Promise.resolve(null)
  return requestJson(
    `/analysis/indicators/${mapping.indicatorId}/analysis?indicatorVersionId=${mapping.indicatorVersionId}&granularity=${granularity}`
  )
}
