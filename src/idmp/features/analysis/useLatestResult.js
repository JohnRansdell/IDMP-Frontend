import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue'

export function createRequestScope() {
  let controller
  let disposed = false
  function cancel() { controller?.abort(); controller = undefined }
  function begin() {
    cancel()
    const current = new AbortController()
    controller = current
    if (disposed) current.abort()
    return { signal: current.signal, isCurrent: () => !current.signal.aborted && controller === current }
  }
  function dispose() { disposed = true; cancel() }
  if (getCurrentScope()) onScopeDispose(dispose)
  return { begin, cancel, dispose }
}

// Each query owns its result and lifecycle. Cancellation also guards APIs that ignore signals.
export function useLatestResult() {
  const data = shallowRef(null)
  const loading = ref(false)
  const error = ref('')
  const scope = createRequestScope()
  function clear() {
    scope.cancel()
    data.value = null
    error.value = ''
    loading.value = false
  }
  async function run(load, { formatError = cause => cause?.message || '暂时无法读取结果，请稍后重试。', onError } = {}) {
    clear()
    const request = scope.begin()
    if (!request.isCurrent()) return
    loading.value = true
    try {
      const result = await load(request)
      if (request.isCurrent()) { data.value = result; return result }
    } catch (cause) {
      if (request.isCurrent()) {
        error.value = formatError(cause)
        onError?.(error.value)
      }
    } finally {
      if (request.isCurrent()) loading.value = false
    }
  }
  if (getCurrentScope()) onScopeDispose(clear)
  return { data, loading, error, run, clear }
}
