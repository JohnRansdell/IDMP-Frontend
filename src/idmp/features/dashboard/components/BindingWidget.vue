<template>
  <article class="dashboard-renderer-card" :class="kind === 'kpi' ? 'db-kpi-card' : 'db-chart-card'" data-testid="binding-widget" :data-binding-status="model.status">
    <div class="db-section-title"><h2>{{ title }}</h2></div>
    <p v-if="dataset?.filterDiagnostics?.length" role="status" class="filter-diagnostic">{{ dataset.filterDiagnostics.join('；') }}</p>
    <div v-if="model.status !== 'ready'" class="binding-state" role="status" :data-testid="`binding-${model.status}`"><strong>{{ model.status === 'invalid' ? '请配置数据字段' : '暂无数据' }}</strong><p v-if="model.status === 'invalid'">{{ model.message }}</p></div>
    <strong v-else-if="kind === 'kpi'" data-testid="binding-kpi-value">{{ model.value }}{{ model.unit }}</strong>
    <ol v-else-if="kind === 'ranking'" class="binding-ranking"><li v-for="(item, index) in model.items" :key="item.name"><span>{{ index + 1 }}</span><span>{{ item.name }}</span><strong>{{ item.value }}</strong></li></ol>
    <div v-else-if="kind === 'table'" class="binding-table-wrap"><table data-testid="binding-table"><thead><tr><th>维度</th><th v-for="series in model.series" :key="series.name">{{ series.name }}</th></tr></thead><tbody><tr v-for="(category, index) in model.categories" :key="category"><td>{{ category }}</td><td v-for="series in model.series" :key="series.name">{{ series.values[index] ?? '—' }}</td></tr></tbody></table></div>
    <IdmpChart v-else :option="option" height="100%" fit-container :aria-label="`${title}，${model.series?.length || 1} 个系列`" @chart-click="emit('chart-click', $event)">
      <template #table><table><thead><tr><th>维度</th><th v-for="series in model.series" :key="series.name">{{ series.name }}</th></tr></thead><tbody><tr v-for="(category, index) in model.categories" :key="category"><td>{{ category }}</td><td v-for="series in model.series" :key="series.name">{{ series.values[index] ?? '—' }}</td></tr></tbody></table></template>
    </IdmpChart>
  </article>
</template>
<script setup>
import { computed, inject } from 'vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import { bindingKind, compileWidgetData, bindingChartOption } from '../bindingEngine.js'
import { createDashboardChartTheme } from '../chartTheme.js'
import { queryWidgetDatasetWithRuntime } from '../queryAdapter.js'
const props = defineProps({ widget: { type: Object, required: true }, title: String })
const emit = defineEmits(['chart-click'])
const getDatasets = inject('dashboardBindingDatasets', () => [])
const filters = inject('dashboardFilterContext', { definitions: { value: [] }, values: { value: {} }, interactions: { value: {} } })
const kind = computed(() => bindingKind(props.widget))
const dataset = computed(() => queryWidgetDatasetWithRuntime(getDatasets(props.widget).find(item => item.id === props.widget.config.dataBinding?.dataset), props.widget, { definitions: filters.definitions.value, values: filters.values.value, interactions: filters.interactions?.value || {} }))
const model = computed(() => compileWidgetData(kind.value, props.widget.config.dataBinding, dataset.value))
const option = computed(() => createDashboardChartTheme(bindingChartOption(kind.value, model.value)))
</script>
<style scoped>
.binding-state { margin:auto; padding:12px; text-align:center; color:var(--db-muted,#78878e); font-size:12px; }
.binding-state strong { font-size:13px; }.binding-state p { line-height:1.6; }
.filter-diagnostic { margin:0 0 6px; font-size:11px; color:var(--db-warning,#a47735); }
table { width:100%; font-size:12px; border-collapse:collapse; } td,th { padding:6px; text-align:left; }
.binding-table-wrap { overflow:auto; max-height:100%; }.binding-table-wrap th { position:sticky; top:0; background:var(--db-surface,#fff); }.binding-table-wrap td,.binding-table-wrap th { border-bottom:1px solid var(--db-border,#e3e9eb); white-space:nowrap; }
.binding-ranking { padding:0; list-style:none; overflow:auto; }.binding-ranking li { display:grid; grid-template-columns:24px 1fr auto; gap:12px; padding:10px 0; }
.db-section-title { min-height:30px; margin-bottom:12px; }.db-section-title h2 { font-size:13px; font-weight:550; margin:0; }
.db-kpi-card>strong { display:block; font-size:32px; font-weight:550; line-height:1.2; margin:12px 0 8px; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
@container (max-height:150px) { .db-kpi-card .db-section-title { min-height:20px; margin-bottom:6px; }.db-kpi-card>strong { font-size:28px; margin:6px 0; } }
@container (max-height:110px) { .db-kpi-card>strong { font-size:26px; }.db-section-title h2 { font-size:12px; } }
</style>
