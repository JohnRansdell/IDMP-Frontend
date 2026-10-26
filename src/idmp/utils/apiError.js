import { toUserMessage } from './userMessage.js'

export function errorStatus(error) {
  return Number(error?.status || error?.response?.status || 0)
}

export function formatApiError(error, fallback = '请求未能完成，请检查输入后重试。') {
  const status = errorStatus(error)
  const message = status === 401 ? '登录状态已失效，请重新登录。'
    : status === 403 ? '当前账号没有权限执行此操作。'
      : status === 404 ? '请求的内容不存在或已失效。'
        : status === 413 ? '文件超过允许的大小，请选择较小文件。'
          : status === 408 || status === 504 ? '请求超时，请稍后重试。'
            : status === 429 ? '请求过于频繁，请稍后重试。'
              : status >= 500 ? '服务暂时不可用，请稍后重试。' : fallback
  return toUserMessage(error?.message, message)
}

export function isPermissionDenied(error) {
  return errorStatus(error) === 403
}
