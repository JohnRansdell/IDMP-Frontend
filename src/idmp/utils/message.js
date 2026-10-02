import { ElMessage as Message } from 'element-plus'
import { toUserMessage } from './userMessage.js'

export function normalizeMessageOptions(options, type) {
  if (typeof options === 'string') return toUserMessage(options)
  if (options && typeof options.message === 'string' && ['error', 'warning'].includes(type || options.type)) return { ...options, message: toUserMessage(options.message) }
  return options
}

export function ElMessage(options, context) {
  return Message(normalizeMessageOptions(options), context)
}
for (const type of ['error', 'warning']) ElMessage[type] = (options, context) => Message[type](normalizeMessageOptions(options, type), context)
for (const type of ['success', 'info']) ElMessage[type] = (...args) => Message[type](...args)
ElMessage.closeAll = (...args) => Message.closeAll(...args)
