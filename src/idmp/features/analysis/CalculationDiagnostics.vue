<template>
  <section class="calculation-diagnostics" aria-label="当前指标计算链路">
    <div class="diagnostic-head"><h3>当前结果计算链路</h3><el-button size="small" link type="primary" :loading="loading" :disabled="pending" @click="loadResults">刷新</el-button></div>
    <p class="diagnostic-hint">仅追溯当前指标版本、报告期内的正式结果；每条结果沿用其计算时的冻结快照。</p>
    <p v-if="instantResult?.executionMode === 'AD_HOC_SOURCE'" class="diagnostic-hint">当前即时查询结果尚未入库。{{ hasRuntimeParameters ? '不能用未核实业务参数的正式结果代替其计算链路。' : '以下正式结果链路独立展示，不代表即时汇总值的计算过程。' }}</p>
    <p v-if="pending || loading" role="status">正在读取当前版本和报告期的结果…</p>
    <div v-else-if="error" role="status" class="diagnostic-error"><span>{{ error }}</span><el-button link type="primary" @click="loadResults">重试</el-button></div>
    <p v-else-if="!results.length" role="status">{{ emptyMessage }}</p>
    <template v-else>
      <label class="diagnostic-selector">选择正式结果
        <el-select-v2 v-model="selectedId" :options="options" filterable placeholder="选择报告期内的一条正式结果查看链路" @change="loadTrace" />
      </label>
      <p v-if="traceLoading" role="status">正在读取结果因子与批次…</p>
      <div v-else-if="traceError" class="diagnostic-error" role="status"><span>{{ traceError }}</span><el-button link type="primary" @click="loadTrace">重试</el-button></div>
      <template v-else-if="trace">
        <dl class="diagnostic-context">
          <div><dt>指标版本</dt><dd>{{ trace.context.indicatorVersionId }}</dd></div>
          <div><dt>结果周期</dt><dd>{{ tracePeriod }}</dd></div>
          <div><dt>结果 ID</dt><dd>{{ trace.context.resultId }}</dd></div>
          <div><dt>冻结快照</dt><dd>{{ trace.context.configSnapshotId || '-' }}</dd></div>
          <div><dt>计算批次</dt><dd><el-button v-if="batchId" link type="primary" @click="emit('open-batch', batchId)">{{ batchId }}</el-button><template v-else>后端未返回</template></dd></div>
          <div><dt>批次状态</dt><dd>{{ batch ? getStatusLabel(batch.batchStatus || batch.status) : batchError || '后端未返回' }}</dd></div>
        </dl>
        <p v-if="trace.formula?.displayText">计算公式：{{ trace.formula.displayText }}</p>
        <div class="diagnostic-values"><span>分子：{{ valueText(trace.indicatorResult?.numeratorValue) }}</span><span>分母：{{ valueText(trace.indicatorResult?.denominatorValue) }}</span><strong>指标值：{{ trace.indicatorResult?.displayValue ?? valueText(trace.indicatorResult?.value) }}</strong></div>
        <FactorTraceTree v-if="trace.factors?.length" :key="selectedId" :result-id="selectedId" :factors="trace.factors" />
        <p v-else>当前结果未返回匹配的因子追溯信息。</p>
      </template>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchIndicatorAnalysis } from '@/idmp/api/modules/indicators'
import { fetchResultFactors } from '@/idmp/api/modules/drill'
import { fetchCalcBatch } from '@/idmp/api/modules/calculation'
import FactorTraceTree from '@/idmp/components/FactorTraceTree.vue'
import { getStatusLabel } from '@/idmp/design/status'
import { diagnosticPeriodQuery, diagnosticResultLabel, diagnosticResults, validateDiagnosticTrace } from './calculationDiagnostics.js'

const props = defineProps({
  indicatorId: { type: String, required: true }, indicatorVersionId: { type: String, required: true },
  periodRange: { type: Array, default: () => [] }, granularity: { type: String, default: 'MONTHLY' },
  instantResult: { type: Object, default: null }, hasRuntimeParameters: Boolean, pending: Boolean
})
const emit = defineEmits(['open-batch'])
const results = ref([]), selectedId = ref(''), trace = ref(null), batch = ref(null)
const loading = ref(false), error = ref(''), emptyMessage = ref(''), traceLoading = ref(false), traceError = ref(''), batchError = ref('')
let generation = 0, traceGeneration = 0, resultController, traceController
const options = computed(() => results.value.map(row => ({ value: String(row.resultId), label: diagnosticResultLabel(row) })))
const batchId = computed(() => String(trace.value?.context?.calculationBatchId || ''))
const tracePeriod = computed(() => trace.value?.context?.periodStart
  ? `${trace.value.context.periodStart.slice(0, 10)} ～ ${trace.value.context.periodEnd?.slice(0, 10) || '-'}（结束不含）` : '静态结果')
const valueText = value => value === null || value === undefined ? '未返回' : typeof value === 'object' ? JSON.stringify(value) : String(value)

function clearTrace() {
  traceGeneration += 1
  traceController?.abort()
  trace.value = null; batch.value = null; traceError.value = ''; batchError.value = ''; traceLoading.value = false
}

async function loadResults() {
  const token = ++generation
  resultController?.abort(); clearTrace()
  results.value = []; selectedId.value = ''; error.value = ''; loading.value = false
  if (props.pending) return
  const query = diagnosticPeriodQuery(props.indicatorVersionId, props.periodRange, props.granularity)
  if (!query) { emptyMessage.value = '请选择完整报告期后查看计算链路。'; return }
  // The analysis API has no business-parameter snapshot matching contract.
  // A parameterized instantaneous result cannot be traced through unrelated saved rows.
  if (props.hasRuntimeParameters) { emptyMessage.value = '当前指标使用业务运行参数，分析接口未提供与本次参数快照匹配的正式结果 ID。可查看下方计算口径和本次查询明细，暂不展示结果级链路。'; return }
  resultController = new AbortController()
  loading.value = true
  try {
    const analysis = await fetchIndicatorAnalysis(props.indicatorId, query, { signal: resultController.signal })
    if (token !== generation) return
    results.value = diagnosticResults(analysis, query)
    emptyMessage.value = '当前版本、报告期未返回可追溯的正式结果 ID。聚合值或未入库的即时结果不能替代正式结果链路。'
    // Only select a true overview automatically. Dimension results require an
    // explicit selection so a department/case is never shown as the hospital total.
    if (analysis.overview?.resultId && results.value.some(row => String(row.resultId) === String(analysis.overview.resultId))) {
      selectedId.value = String(analysis.overview.resultId)
      await loadTrace()
    }
  } catch (cause) {
    if (token === generation && !resultController.signal.aborted) error.value = cause?.message || '计算诊断读取失败，请重试'
  } finally { if (token === generation) loading.value = false }
}

async function loadTrace() {
  clearTrace()
  const row = results.value.find(item => String(item.resultId) === selectedId.value)
  if (!row) return
  const token = traceGeneration, versionId = props.indicatorVersionId
  traceController = new AbortController()
  traceLoading.value = true
  try {
    const data = await fetchResultFactors(selectedId.value, { signal: traceController.signal })
    if (token !== traceGeneration) return
    trace.value = validateDiagnosticTrace(data, row, versionId)
    if (batchId.value) {
      try {
        const detail = await fetchCalcBatch(batchId.value, { signal: traceController.signal })
        if (token === traceGeneration) batch.value = detail
      } catch (cause) {
        if (token === traceGeneration) batchError.value = cause?.message || '批次详情暂不可用'
      }
    }
  } catch (cause) {
    if (token === traceGeneration && !traceController.signal.aborted) traceError.value = cause?.message || '结果链路已失效或读取失败，请刷新正式结果后重试'
  } finally { if (token === traceGeneration) traceLoading.value = false }
}

watch(() => JSON.stringify([props.indicatorId, props.indicatorVersionId, props.periodRange, props.granularity, props.pending, props.hasRuntimeParameters, props.instantResult?.executionMode]), loadResults, { immediate: true })
onBeforeUnmount(() => { generation += 1; resultController?.abort(); clearTrace() })
</script>

<style scoped>
.calculation-diagnostics { padding-bottom: 20px; border-bottom: 1px solid var(--idmp-border-subtle); }
.diagnostic-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.diagnostic-head h3 { margin: 0; font-size: 15px; }
.diagnostic-hint { color: var(--idmp-text-secondary); font-size: 13px; line-height: 1.6; }
.diagnostic-selector { display: grid; gap: 8px; font-size: 13px; }
.diagnostic-selector :deep(.el-select-v2) { width: 100%; }
.diagnostic-context { display: grid; gap: 10px; font-size: 13px; }
.diagnostic-context div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; }
.diagnostic-context dt { color: var(--idmp-text-secondary); }
.diagnostic-context dd { margin: 0; overflow-wrap: anywhere; }
.diagnostic-context dd :deep(.el-button) { white-space: normal; text-align: left; height: auto; }
.diagnostic-values { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 12px 0; font-size: 13px; }
.diagnostic-error { color: var(--el-color-danger); font-size: 13px; }
</style>
