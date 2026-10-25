import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { DRILL_GRANULARITIES, drillPeriodKey, drillPeriodOptions } from './drillPeriods.js'
import { shiftReportDate } from './reportPeriod.js'

export function useAnalysisPeriod(props, fetchIndicatorAnalysis) {
  const granularity = ref('MONTHLY')
  const selectedPeriod = ref('')
  const periodOptions = ref([])
  const analysis = ref(null)
  const loading = ref(false)
  const errorMessage = ref('')
  const initialized = ref(false)
  const useInitialContext = ref(false)
  const granularityLabel = computed(() => DRILL_GRANULARITIES.find(item => item.value === granularity.value)?.label)
  const periodPlaceholder = computed(() => DRILL_GRANULARITIES.find(item => item.value === granularity.value)?.placeholder)
  const selectedPeriodLabel = computed(() => periodOptions.value.find(item => item.value === selectedPeriod.value)?.label || '')
  let contextKey = ''
  let requestId = 0
  const cache = new Map()

  async function fetchAnalysis(params) {
    const key = JSON.stringify(params)
    if (cache.has(key)) return cache.get(key)
    const context = contextKey
    const data = await fetchIndicatorAnalysis(props.indicatorId, {
      ...params, ...(props.indicatorVersionId ? { indicatorVersionId: props.indicatorVersionId } : {}),
      ...Object.fromEntries(Object.entries(props.filters || {}).map(([field, value]) => [`filter.${field}`, value]))
    })
    if (context === contextKey) cache.set(key, data)
    return data
  }

  async function loadPeriods(preferredPeriod = '', restoreContext = false) {
    const currentRequest = ++requestId
    const requestedGranularity = granularity.value
    loading.value = true
    errorMessage.value = ''
    analysis.value = null
    periodOptions.value = []
    selectedPeriod.value = ''
    useInitialContext.value = false
    try {
      const data = await fetchAnalysis({ granularity: requestedGranularity })
      if (currentRequest !== requestId) return
      periodOptions.value = drillPeriodOptions(data, requestedGranularity)
      const initial = !initialized.value && requestedGranularity === props.initialGranularity
        ? drillPeriodKey(props.initialPeriod) : ''
      const preferred = preferredPeriod || initial
      selectedPeriod.value = periodOptions.value.find(item => item.value === preferred)?.value
        || (preferredPeriod ? '' : periodOptions.value[0]?.value || '')
      useInitialContext.value = (!initialized.value || restoreContext) && Boolean(preferred && preferred === selectedPeriod.value)
      initialized.value = true
      await resolveSelectedPeriod(data, currentRequest)
    } catch (error) {
      if (currentRequest === requestId) errorMessage.value = error?.message || '暂时无法读取正式结果，请稍后重试。'
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  async function resolveSelectedPeriod(allPeriods, currentRequest) {
    const selected = periodOptions.value.find(item => item.value === selectedPeriod.value)
    if (!selected) return
    // 多周期分析的维度结果只属于最新一期；旧周期必须重新定位正式结果。
    const data = drillPeriodKey(allPeriods?.overview) === selected.value ? allPeriods
      : await fetchAnalysis({ granularity: granularity.value, periodStart: selected.periodStart, periodEnd: shiftReportDate(selected.periodEnd, -1) })
    if (currentRequest === requestId) analysis.value = data
  }

  async function loadSelectedPeriod() {
    const currentRequest = ++requestId
    loading.value = true
    analysis.value = null
    errorMessage.value = ''
    useInitialContext.value = false
    try {
      await resolveSelectedPeriod(cache.get(JSON.stringify({ granularity: granularity.value })), currentRequest)
    } catch (error) {
      if (currentRequest === requestId) errorMessage.value = error?.message || '暂时无法读取该周期结果，请稍后重试。'
    } finally {
      if (currentRequest === requestId) loading.value = false
    }
  }

  function focusPeriod(point, periodGranularity) {
    granularity.value = DRILL_GRANULARITIES.some(item => item.value === periodGranularity) ? periodGranularity : 'MONTHLY'
    return loadPeriods(drillPeriodKey(point), true)
  }

  function retryPeriod() {
    return selectedPeriod.value ? loadSelectedPeriod() : loadPeriods()
  }

  watch(() => [props.indicatorId, props.indicatorVersionId, props.enabled, JSON.stringify(props.filters || {})], () => {
    const nextContext = `${props.indicatorId}:${props.indicatorVersionId}:${JSON.stringify(props.filters || {})}`
    if (nextContext !== contextKey) {
      requestId += 1
      contextKey = nextContext
      initialized.value = false
      cache.clear()
      granularity.value = 'MONTHLY'
      selectedPeriod.value = ''
      periodOptions.value = []
      analysis.value = null
      errorMessage.value = ''
      loading.value = false
    }
    if (props.enabled && props.indicatorId && !initialized.value) loadPeriods()
  }, { immediate: true })
  onBeforeUnmount(() => { requestId += 1; contextKey = '' })

  return { granularity, selectedPeriod, periodOptions, analysis, loading, errorMessage, initialized, useInitialContext,
    granularityLabel, periodPlaceholder, selectedPeriodLabel, loadPeriods, loadSelectedPeriod, focusPeriod, retryPeriod }
}
