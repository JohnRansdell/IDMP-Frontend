<template>
  <div class="dashboard-period-picker" aria-label="统计周期">
    <span>统计周期</span>
    <el-select v-model="draft.type" aria-label="统计周期类型" data-testid="dashboard-period-type" size="small" class="period-type">
      <el-option label="月度" value="MONTHLY" /><el-option label="季度" value="QUARTERLY" /><el-option label="年度" value="YEARLY" /><el-option label="自定义区间" value="CUSTOM" />
    </el-select>
    <span v-if="draft.type === 'MONTHLY'" class="period-date" data-testid="dashboard-period-month"><el-date-picker v-model="draft.month" type="month" value-format="YYYY-MM" format="YYYY 年 MM 月" aria-label="统计月份" size="small" :clearable="false" /></span>
    <template v-else-if="draft.type === 'QUARTERLY' || draft.type === 'YEARLY'">
      <span class="period-date" data-testid="dashboard-period-year"><el-date-picker :model-value="String(draft.year)" type="year" value-format="YYYY" format="YYYY 年" aria-label="统计年份" size="small" :clearable="false" @update:model-value="draft.year = Number($event)" /></span>
      <el-select v-if="draft.type === 'QUARTERLY'" v-model="draft.quarter" aria-label="统计季度" data-testid="dashboard-period-quarter" size="small" class="period-quarter">
        <el-option v-for="quarter in 4" :key="quarter" :label="`第 ${quarter} 季度`" :value="quarter" />
      </el-select>
    </template>
    <template v-else>
      <span class="period-date" data-testid="dashboard-period-start"><el-date-picker v-model="draft.startMonth" type="month" value-format="YYYY-MM" format="YYYY 年 MM 月" aria-label="开始月份" size="small" :clearable="false" /></span>
      <span>至</span>
      <span class="period-date" data-testid="dashboard-period-end"><el-date-picker v-model="draft.endMonth" type="month" value-format="YYYY-MM" format="YYYY 年 MM 月" aria-label="结束月份" size="small" :clearable="false" /></span>
    </template>
    <el-button type="primary" size="small" :loading="loading" :disabled="!canApply" data-testid="dashboard-period-apply" @click="$emit('apply', { ...draft })">确定</el-button>
    <span class="period-current" data-testid="dashboard-period-current">{{ currentLabel }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { dashboardPeriodLabel, defaultDashboardPeriod, resolveDashboardPeriod } from '../statisticalPeriod.js'
const props = defineProps({ selection: { type: Object, default: () => defaultDashboardPeriod() }, loading: Boolean })
defineEmits(['apply'])
const draft = ref({ ...props.selection })
watch(() => props.selection, selection => { draft.value = { ...selection } }, { deep: true })
watch(() => draft.value.type, (_, previousType) => {
  if (JSON.stringify(draft.value) === JSON.stringify(props.selection)) return
  const previous = resolveDashboardPeriod({ ...draft.value, type: previousType })
  if (!previous) return
  const start = previous.periodStart
  const end = new Date(new Date(`${previous.periodEnd}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  Object.assign(draft.value, { month: start.slice(0, 7), year: Number(start.slice(0, 4)), quarter: Math.ceil(Number(start.slice(5, 7)) / 3), startMonth: start.slice(0, 7), endMonth: end.slice(0, 7) })
})
const canApply = computed(() => Boolean(resolveDashboardPeriod(draft.value)) && JSON.stringify(resolveDashboardPeriod(draft.value)) !== JSON.stringify(resolveDashboardPeriod(props.selection)))
const currentLabel = computed(() => dashboardPeriodLabel(resolveDashboardPeriod(props.selection)))
</script>

<style scoped>
.dashboard-period-picker { display:flex; flex-wrap:wrap; align-items:center; gap:8px; min-width:0; font-size:12px; }
.dashboard-period-picker .period-type { width:116px; }
.dashboard-period-picker .period-quarter { width:112px; }
.dashboard-period-picker :deep(.el-date-editor.el-input) { width:156px; max-width:100%; }
.period-current { color:var(--db-muted,#667085); overflow-wrap:anywhere; }
@media (max-width:600px) { .dashboard-period-picker { width:100%; }.period-current { flex-basis:100%; }.dashboard-period-picker :deep(.el-date-editor.el-input) { width:140px; } }
</style>
