<template>
  <section class="indicator-drill-analysis" aria-label="下钻分析周期">
    <div class="drill-period-toolbar">
      <el-radio-group v-model="granularity" size="small" aria-label="下钻统计粒度" @change="loadPeriods()">
        <el-radio-button v-for="item in DRILL_GRANULARITIES" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
      </el-radio-group>
      <el-select
        v-model="selectedPeriod" filterable size="small" class="drill-period-select"
        aria-label="下钻统计周期" :placeholder="periodPlaceholder" :loading="loading"
        :disabled="!periodOptions.length" @change="changePeriod"
      >
        <el-option v-for="item in periodOptions" :key="item.value" :value="item.value" :label="item.label" />
      </el-select>
    </div>
    <StatePanel v-if="loading" type="loading" title="正在读取下钻正式结果" />
    <StatePanel v-else-if="errorMessage" type="error" title="下钻周期加载失败" :description="errorMessage">
      <template #actions><el-button size="small" @click="retryPeriod">重试</el-button></template>
    </StatePanel>
    <StatePanel v-else-if="!periodOptions.length" type="empty" :title="`暂无${granularityLabel}正式结果`" description="该粒度尚未生成正式计算结果。" />
    <DrillExplorer
      v-else-if="anchor.resultId" :key="`${granularity}:${selectedPeriod}:${entrySequence}`" ref="explorer"
      :result-id="anchor.resultId" :path-result-ids="anchor.pathResultIds" :enabled="enabled"
      :indicator-version-id="indicatorVersionId"
      :snapshot-id="useEntryContext ? entryContext.snapshotId || '' : ''"
      :result-period="periodOptions.find(item => item.value === selectedPeriod) || {}"
      :indicator-name="indicatorName" :period="selectedPeriodLabel"
      :start-path-code="useEntryContext ? entryContext.pathCode : ''"
      :start-level="useEntryContext ? entryContext.currentLevel : useInitialContext ? startLevel : ''"
      :start-parent-keys="useEntryContext ? entryContext.parentKeys : useInitialContext ? startParentKeys : {}"
      :start-filters="{ ...filters, ...(useEntryContext ? entryContext.filters || {} : {}) }"
      :max-levels="maxLevels" :configured-paths="configuredPaths" embedded
    />
    <StatePanel v-else type="empty" title="该周期暂无可下钻结果" description="该周期未生成可用的下钻计算结果。" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import { fetchIndicatorAnalysis } from '@/idmp/api/modules/indicators'
import { DRILL_GRANULARITIES, drillPeriodAnchor, drillPeriodKey } from './drillPeriods'
import { useAnalysisPeriod } from './useAnalysisPeriod'

const props = defineProps({
  indicatorId: { type: [String, Number], required: true },
  indicatorVersionId: { type: [String, Number], default: '' },
  indicatorName: { type: String, default: '' },
  filters: { type: Object, default: () => ({}) },
  enabled: { type: Boolean, default: false },
  configuredPaths: { type: Array, default: () => [] },
  maxLevels: { type: Object, default: () => ({}) },
  initialPeriod: { type: Object, default: () => ({}) },
  initialGranularity: { type: String, default: 'MONTHLY' },
  initialResultId: { type: [String, Number], default: '' },
  startLevel: { type: String, default: 'HOSPITAL' },
  startParentKeys: { type: Object, default: () => ({}) }
})
const { granularity, selectedPeriod, periodOptions, analysis, loading, errorMessage, initialized, useInitialContext,
  granularityLabel, periodPlaceholder, selectedPeriodLabel, loadPeriods: readPeriods, loadSelectedPeriod, focusPeriod, retryPeriod } = useAnalysisPeriod(props, fetchIndicatorAnalysis)
const explorer = ref()
const entryContext = ref(null)
const entrySequence = ref(0)
const useEntryContext = computed(() => entryContext.value && selectedPeriod.value === drillPeriodKey(entryContext.value.period)
  && granularity.value === entryContext.value.granularity)
const anchor = computed(() => {
  const resolved = drillPeriodAnchor(analysis.value, selectedPeriod.value, props.configuredPaths)
  if (useEntryContext.value && entryContext.value.resultId) return {
    resultId: String(entryContext.value.resultId),
    pathResultIds: { ...resolved.pathResultIds, [entryContext.value.pathCode]: String(entryContext.value.resultId) }
  }
  return useInitialContext.value && props.initialResultId
    ? { ...resolved, resultId: String(props.initialResultId) }
    : resolved
})
function loadPeriods() { entryContext.value = null; return readPeriods() }
function changePeriod() { entryContext.value = null; return loadSelectedPeriod() }
watch(() => [props.indicatorId, props.indicatorVersionId, JSON.stringify(props.filters)], () => { entryContext.value = null })

function getReportSnapshot() {
  return explorer.value?.getReportSnapshot() || {
    loading: loading.value,
    section: { title: '下钻分析', description: errorMessage.value || selectedPeriodLabel.value || `暂无${granularityLabel.value}正式结果`, columns: [], rows: [] }
  }
}
function focusInitialResult() {
  if (loading.value && !initialized.value) return
  entryContext.value = null
  return focusPeriod(props.initialPeriod, props.initialGranularity)
}
function focusResult(context) {
  entryContext.value = context
  entrySequence.value += 1
  return focusPeriod(context.period, context.granularity)
}
defineExpose({ getReportSnapshot, focusInitialResult, focusResult })
</script>

<style scoped>
.drill-period-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 0 16px;
}
.drill-period-select {
  width: 200px;
  max-width: 100%;
}
</style>
