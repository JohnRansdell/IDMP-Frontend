import { computed } from 'vue'
import { normalizeIndicatorInstantSummary } from '../../api/adapters/indicator.js'
import { useLatestResult } from './useLatestResult.js'

export function useReportSummary({ canRequest, fetchFormal, fetchInstant, notify }) {
  const query = useLatestResult()
  async function load(request) {
    if (!request) return query.clear()
    return query.run(async ({ signal }) => {
      if (!canRequest(request.method, request.path)) throw new Error('当前账号没有所选查询方式的访问权限')
      if (request.mode === 'FORMAL') {
        const result = await fetchFormal(request.id, request.params, { signal })
        return { summary: { ...result, executionMode: 'FORMAL_RESULTS' }, parameters: {}, runtime: null }
      }
      const result = await fetchInstant(request.id, request.payload, { signal })
      return { summary: normalizeIndicatorInstantSummary(result, ...request.range),
        parameters: result.parameterSnapshot || request.payload.parameters || {}, runtime: result }
    }, { onError: notify, formatError: cause => {
      const message = cause?.message || '请核对查询条件后重试'
      const migrationHint = message.includes('SQL业务参数不支持冒号写法')
        ? '；该指标使用了旧式 SQL 参数，请改为 [[AND 字段 = {{参数名}}]] 后重新导入并发布' : ''
      return `${request.mode === 'FORMAL' ? '正式区间查询' : '即时查询'}失败：${message}${migrationHint}`
    } })
  }
  return { load, clear: query.clear, loading: query.loading, error: query.error,
    summary: computed(() => query.data.value?.summary || null),
    parameters: computed(() => query.data.value?.parameters || {}),
    runtime: computed(() => query.data.value?.runtime || null) }
}
