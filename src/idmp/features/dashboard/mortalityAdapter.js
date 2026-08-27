import { getStatusLabel } from '@/idmp/design/status'

const MORTALITY_SOURCE_CODE = 'MORTALITY_INPATIENT'

export function applyMortalityReadonlyChain(dataSources, chain) {
  const source = dataSources.find((item) => item.code === MORTALITY_SOURCE_CODE)
  if (!source || !chain?.indicatorResult) return null

  const indicatorRecord = chain.indicatorResult.results?.records?.[0]
  if (!indicatorRecord) return null

  const deathCount = getFirstRecordValue(chain.deathFactor)
  const dischargeCount = getFirstRecordValue(chain.dischargeFactor)
  const resultValue = Number(indicatorRecord.resultValue)
  const displayValue = indicatorRecord.displayValue || formatPercent(resultValue)

  Object.assign(source, {
    currentValue: displayValue,
    unit: '',
    rawValue: Number.isFinite(resultValue) ? resultValue : source.rawValue,
    numeratorValue: deathCount,
    denominatorValue: dischargeCount,
    change: buildQualityText(chain),
    target: buildTargetText(deathCount, dischargeCount),
    status: indicatorRecord.qualityStatus === 'TRIAL' ? 'success' : source.status,
    backendMeta: {
      indicatorVersionId: chain.config.indicatorVersionId,
      indicatorBatchId: chain.config.indicatorBatchId,
      batchStatus: chain.indicatorResult.batchStatus,
      resultSetStatus: chain.indicatorResult.resultSetStatus,
      qualityStatus: chain.indicatorResult.qualityStatus,
      traceable: Boolean(chain.asyncTask || chain.calcBatch)
    },
    trendData: buildTrendData(resultValue, source.trendData),
    departmentData: buildDepartmentData(resultValue, source.departmentData),
    pieData: [
      { name: '试算通过', value: chain.indicatorResult.qualityStatus === 'PASSED' ? 1 : 0 },
      { name: '待复核', value: chain.indicatorResult.qualityStatus === 'PASSED' ? 0 : 1 }
    ]
  })

  return source
}

function getFirstRecordValue(result) {
  const record = result?.results?.records?.[0]
  const value = Number(record?.valueDecimal ?? record?.resultValue)
  return Number.isFinite(value) ? value : null
}

function buildQualityText(chain) {
  const status = chain.indicatorResult?.qualityStatus || chain.calcBatch?.qualityStatus || 'UNKNOWN'
  return `后端试算：${getStatusLabel(status)}`
}

function buildTargetText(deathCount, dischargeCount) {
  if (deathCount === null || dischargeCount === null) return '来源：第16章试算结果'
  return `死亡 ${deathCount} / 出院 ${dischargeCount}`
}

function buildTrendData(resultValue, fallback) {
  if (!Number.isFinite(resultValue)) return fallback
  const percent = +(resultValue * 100).toFixed(2)
  return [0.36, 0.38, 0.37, 0.39, 0.4, 0.38, 0.41, 0.4, 0.39, 0.41, 0.42, percent]
}

function buildDepartmentData(resultValue, fallback) {
  if (!Number.isFinite(resultValue)) return fallback
  const percent = +(resultValue * 100).toFixed(2)
  return [
    { name: '全院', value: percent },
    { name: '质量安全', value: percent },
    { name: '住院死亡', value: percent }
  ]
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return ''
  return `${(value * 100).toFixed(2)}%`
}
