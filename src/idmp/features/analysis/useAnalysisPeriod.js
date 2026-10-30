import { computed, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue'
import { createRequestScope } from './useLatestResult.js'
import { DRILL_GRANULARITIES, drillPeriodKey, drillPeriodOptions } from './drillPeriods.js'
import { serializeAnalysisFilters, shiftReportDate } from './reportPeriod.js'

export function useAnalysisPeriod(props, fetchIndicatorAnalysis) {
  const granularity = ref('MONTHLY')
  const selectedPeriod = ref('')
  const periodOptions = ref([])
  const analysis = shallowRef(null)
  const loading = ref(false)
  const errorMessage = ref('')
  const loadingStage = ref('periods')
  const initialized = ref(false)
  const useInitialContext = ref(false)
  const granularityLabel = computed(() => DRILL_GRANULARITIES.find(item => item.value === granularity.value)?.label)
  const periodPlaceholder = computed(() => DRILL_GRANULARITIES.find(item => item.value === granularity.value)?.placeholder)
  const selectedPeriodLabel = computed(() => periodOptions.value.find(item => item.value === selectedPeriod.value)?.label || '')
  let contextKey = ''
  const scope = createRequestScope()
  let inactive = false
  let interrupted = false
  const cache = new Map()

  function begin() {
    interrupted = false
    return { ...scope.begin(), indicatorId: props.indicatorId, granularity: granularity.value,
      initialGranularity: props.initialGranularity, initialPeriod: props.initialPeriod,
      params: { ...(props.indicatorVersionId ? { indicatorVersionId: props.indicatorVersionId } : {}),
        ...serializeAnalysisFilters(props.filters || {}) } }
  }

  async function fetchAnalysis(params, request) {
    request.signal.throwIfAborted()
    const key = JSON.stringify(params)
    if (cache.has(key)) return cache.get(key)
    const data = await fetchIndicatorAnalysis(request.indicatorId, { ...params, ...request.params }, { signal: request.signal })
    if (request.isCurrent()) cache.set(key, data)
    return data
  }

  async function loadPeriods(preferredPeriod = '', restoreContext = false) {
    const currentRequest = begin()
    const requestedGranularity = currentRequest.granularity
    loading.value = true
    errorMessage.value = ''
    loadingStage.value = 'periods'
    analysis.value = null
    periodOptions.value = []
    selectedPeriod.value = ''
    useInitialContext.value = false
    try {
      const data = await fetchAnalysis({ granularity: requestedGranularity, sections: 'TREND' }, currentRequest)
      if (!currentRequest.isCurrent()) return
      periodOptions.value = drillPeriodOptions(data, requestedGranularity)
      const initial = !initialized.value && requestedGranularity === currentRequest.initialGranularity
        ? drillPeriodKey(currentRequest.initialPeriod) : ''
      const preferred = preferredPeriod || initial
      selectedPeriod.value = periodOptions.value.find(item => item.value === preferred)?.value
        || (preferredPeriod ? '' : periodOptions.value[0]?.value || '')
      useInitialContext.value = (!initialized.value || restoreContext) && Boolean(preferred && preferred === selectedPeriod.value)
      initialized.value = true
      await resolveSelectedPeriod(currentRequest)
    } catch (error) {
      if (currentRequest.isCurrent()) errorMessage.value = error?.message || '暂时无法读取正式结果，请稍后重试。'
    } finally {
      if (currentRequest.isCurrent()) loading.value = false
    }
  }

  async function resolveSelectedPeriod(currentRequest) {
    const selected = periodOptions.value.find(item => item.value === selectedPeriod.value)
    if (!selected) return
    loadingStage.value = 'results'
    // Period discovery never loads members; resolve ranking and drill anchors for one selected period.
    const data = await fetchAnalysis({ granularity: currentRequest.granularity,
      periodStart: selected.periodStart, periodEnd: shiftReportDate(selected.periodEnd, -1),
      sections: 'OVERVIEW,DEPARTMENT_COMPARISON,CALCULATION_TARGETS' }, currentRequest)
    if (currentRequest.isCurrent()) analysis.value = data
  }

  async function loadSelectedPeriod() {
    const currentRequest = begin()
    loading.value = true
    analysis.value = null
    errorMessage.value = ''
    useInitialContext.value = false
    try {
      await resolveSelectedPeriod(currentRequest)
    } catch (error) {
      if (currentRequest.isCurrent()) errorMessage.value = error?.message || '暂时无法读取该周期结果，请稍后重试。'
    } finally {
      if (currentRequest.isCurrent()) loading.value = false
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
      scope.cancel()
      interrupted = false
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
    if (!props.enabled) suspend()
    else resume()
  }, { immediate: true })
  function suspend() {
    interrupted = interrupted || loading.value
    scope.cancel()
    loading.value = false
  }
  function resume() {
    if (inactive || !props.enabled || !props.indicatorId || loading.value) return
    if (interrupted) loadPeriods(selectedPeriod.value, useInitialContext.value)
    else if (!initialized.value) loadPeriods()
  }
  onDeactivated(() => { inactive = true; suspend() })
  onActivated(() => { inactive = false; resume() })

  return { granularity, selectedPeriod, periodOptions, analysis, loading, errorMessage, loadingStage, initialized, useInitialContext,
    granularityLabel, periodPlaceholder, selectedPeriodLabel, loadPeriods, loadSelectedPeriod, focusPeriod, retryPeriod }
}
