import { formatApiError } from '../../utils/apiError.js'

// Cancellation belongs to the page lifecycle, not to an individual chart.
export async function readDashboardPart(read, { signal } = {}) {
  try {
    signal?.throwIfAborted()
    const value = await read()
    signal?.throwIfAborted()
    return { value }
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error
    return { error: formatApiError(error, '组件暂时无法加载，请重试；若持续失败，请联系管理员。') }
  }
}

export function failedDashboardWidget(message) {
  return { status: 'ERROR', message, rows: [] }
}
