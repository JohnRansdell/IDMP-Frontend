import { reactive, ref } from 'vue'
import { createRequestScope } from '../analysis/useLatestResult.js'

export function useCatalogQuery(fetchPage, defaults = {}, initialSize = 20) {
  const filters = reactive({ ...defaults })
  let applied = { ...defaults }
  const rows = ref([]), total = ref(0), page = ref(1), size = ref(initialSize)
  const loading = ref(false), error = ref(null), hasLoaded = ref(false)
  const scope = createRequestScope()
  async function load() {
    const request = scope.begin()
    loading.value = true
    error.value = null
    try {
      const result = await fetchPage({ ...applied, page: page.value, size: size.value }, { signal: request.signal, cache: 'no-store' })
      if (!request.isCurrent()) return
      rows.value = result.records
      total.value = Number(result.total)
      const lastPage = Math.max(1, Math.ceil(total.value / size.value))
      if (page.value > lastPage) { page.value = lastPage; return await load() }
      hasLoaded.value = true
    } catch (cause) {
      if (request.isCurrent()) error.value = cause
    } finally { if (request.isCurrent()) loading.value = false }
  }
  function search() { applied = { ...filters }; page.value = 1; return load() }
  function reset() { Object.assign(filters, defaults); return search() }
  function resize() { page.value = 1; return load() }
  return { filters, rows, total, page, size, loading, error, hasLoaded, load, search, reset, resize }
}
