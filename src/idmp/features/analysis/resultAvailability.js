const STATUS_COPY = Object.freeze({
  ACTIVE_RESULT: '已有已激活的正式指标结果。',
  CALCULATION_IN_PROGRESS: '已有相关计算任务正在执行，请稍后刷新或查看批次详情。',
  WAITING_FOR_CALCULATION: '探测到完整源数据，尚未生成已激活的正式指标结果。',
  NO_DATA: '当前周期没有匹配的源数据。',
  INCOMPLETE_DATA: '只有部分依赖因子命中源数据，无法形成完整指标结果。',
  NOT_CALCULABLE: '指标公式返回空值。',
  CALCULATION_ERROR: '源数据存在，但计算执行或公式计算发生异常。',
  UNKNOWN: '源数据画像尚未完成，不能据此判定为无数据。'
})

export function resultAvailabilityGuidance(status, message = '') {
  const states = {
    NO_DATA: ['该统计周期无源数据', '所选周期没有符合指标条件的源数据。', ''],
    EMPTY: ['当前筛选条件下暂无数据', '当前统计周期与筛选条件下没有匹配的结果。', 'filters'],
    NOT_CALCULABLE: ['该统计周期无法计算指标值', STATUS_COPY.NOT_CALCULABLE, ''],
    VALUE_NOT_CALCULABLE: ['该统计周期无法计算指标值', STATUS_COPY.NOT_CALCULABLE, ''],
    INCOMPLETE_DATA: ['该统计周期的计算输入不完整', STATUS_COPY.INCOMPLETE_DATA, ''],
    CALCULATION_ERROR: ['该统计周期计算失败', '请查看计算记录了解失败原因。', ''],
    CALCULATION_IN_PROGRESS: ['该统计周期正在计算', STATUS_COPY.CALCULATION_IN_PROGRESS, ''],
    WAITING_FOR_CALCULATION: ['该统计周期尚待计算', STATUS_COPY.WAITING_FOR_CALCULATION, ''],
    UNSUPPORTED_PERIOD: ['该区间暂不支持整体结果查询', '请选择支持的统计周期。', 'scope']
  }
  const [title, description, action] = states[status] || ['该统计周期暂无可用结果', '请查看计算记录确认该周期的结果状态。', 'scope']
  return { title, description: message || description, action }
}

export function normalizeFactorDataProfiles(profiles = []) {
  return (Array.isArray(profiles) ? profiles : []).map((item) => ({
    ...item,
    factorVersionId: toId(item.factorVersionId),
    executionStatus: normalizeStatus(item.executionStatus),
    sourceDataStatus: normalizeStatus(item.sourceDataStatus),
    sourceRecordCount: item.sourceRecordCount ?? null,
    errorMessage: item.errorMessage || null
  }))
}

export function resolveResultAvailability(payload = {}) {
  const data = payload?.data || payload || {}
  const availability = data.resultAvailability || {}
  const target = Array.isArray(data.calculationTargets) ? data.calculationTargets[0] || {} : {}
  const profiles = normalizeFactorDataProfiles(
    availability.factorDataProfiles || target.factorDataProfiles || data.factorDataProfiles || []
  )
  const executionStatus = normalizeStatus(target.executionStatus || data.executionStatus || data.batchStatus || data.targetStatus)
  const outcomeStatus = normalizeStatus(
    availability.outcomeStatus || data.overview?.outcomeStatus || target.resultOutcomeStatus || data.resultOutcomeStatus || data.outcomeStatus
  )
  const hasResultRecords = Boolean(
    (Array.isArray(data.results?.records) && data.results.records.length) ||
    (Array.isArray(data.targets) && data.targets.some((item) => Array.isArray(item?.results?.records) && item.results.records.length))
  )
  let status = normalizeStatus(availability.status)
  if ((!status || status === 'ACTIVE_RESULT') && data.overview
    && ['NOT_CALCULABLE', 'NO_DATA', 'INCOMPLETE_DATA', 'CALCULATION_ERROR'].includes(outcomeStatus)) status = outcomeStatus
  if (!status) {
    if (data.dataAvailable || (hasResultRecords && outcomeStatus === 'CALCULATED')) status = 'ACTIVE_RESULT'
    else if (executionStatus === 'FAILED' || outcomeStatus === 'CALCULATION_ERROR') status = 'CALCULATION_ERROR'
    else if (outcomeStatus === 'NOT_CALCULABLE') status = 'NOT_CALCULABLE'
    else if (executionStatus === 'RUNNING' || executionStatus === 'QUEUED') status = 'CALCULATION_IN_PROGRESS'
    else if (profiles.length && profiles.every((item) => item.sourceDataStatus === 'NO_DATA')) status = 'NO_DATA'
    else if (profiles.some((item) => item.sourceDataStatus === 'HAS_DATA') && profiles.some((item) => item.sourceDataStatus === 'NO_DATA')) status = 'INCOMPLETE_DATA'
    else if (profiles.some((item) => item.sourceDataStatus === 'HAS_DATA')) status = 'WAITING_FOR_CALCULATION'
    else status = 'UNKNOWN'
  }
  return {
    status,
    message: (normalizeStatus(availability.status) === status ? availability.message : '') || target.errorMessage || data.errorMessage || STATUS_COPY[status] || STATUS_COPY.UNKNOWN,
    executionStatus,
    outcomeStatus,
    profiles,
    batchId: toId(data.resultContext?.batchId || target.batchId || data.batchId),
    canRetry: status === 'CALCULATION_ERROR',
    canCreateBatch: status === 'WAITING_FOR_CALCULATION'
  }
}

export function isStatusRecord(record = {}) {
  return String(record.recordType || '').toUpperCase() === 'CALCULATION_STATUS'
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase()
}

function toId(value) {
  return value === undefined || value === null || value === '' ? '' : String(value)
}
