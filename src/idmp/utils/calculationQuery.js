export function calculationQueryIds(query = {}) {
  const id = value => typeof value === 'string' ? value.trim() : ''
  return { taskId: id(query.taskId), batchId: id(query.batchId) }
}

export function validateCalculationQueryId(value, label) {
  const id = String(value ?? '').trim()
  if (!id) return `请输入${label} ID`
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return `请输入有效的${label} ID（完整正整数）`
  return ''
}

export function calculationQueryError(error, label) {
  if (Number(error?.status) === 408 || error?.code === 'REQUEST_TIMEOUT') return `${label}查询未及时返回，请重试查询。查询超时不代表计算失败或已停止。`
  if (Number(error?.status) === 404) return `未找到该${label}，请核对 ID，并确认记录存在且对当前账号可见`
  if (Number(error?.status) === 403) return `当前账号无权查询该${label}，请联系管理员授权`
  return error?.message || `${label}查询失败`
}
