export function errorStatus(error) {
  return Number(error?.status || error?.response?.status || 0)
}

export function formatApiError(error, fallback = '请求失败') {
  const status = errorStatus(error)
  const traceId = error?.traceId || error?.payload?.traceId || error?.payload?.traceID
  const prefix = { 401: '登录已失效，请重新登录', 403: '当前账号无权限', 409: '数据或状态冲突', 400: '请求参数校验失败', 422: '业务校验失败', 500: '服务暂时不可用，请稍后重试' }[status]
  const message = prefix || error?.message || fallback
  return traceId && !message.includes(String(traceId)) ? `${message}（traceId: ${traceId}）` : message
}

export function isPermissionDenied(error) {
  return errorStatus(error) === 403
}
