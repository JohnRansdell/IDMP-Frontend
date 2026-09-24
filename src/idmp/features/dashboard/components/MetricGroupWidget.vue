<template>
  <article class="metric-group" :style="groupStyle" data-testid="metric-group-widget">
    <header class="metric-group__header"><div><h2>{{ config.title }}</h2><p v-if="config.subtitle">{{ config.subtitle }}</p></div><span>{{ items.length }} 项</span></header>
    <div v-if="items.length" class="metric-group__grid" :class="[`is-columns-${config.layout.columns}`, `is-appearance-${config.itemAppearance}`]" :style="{ gap: `${config.layout.gap}px` }" @dragover.prevent>
      <section v-for="item in items" :key="item.id" class="metric-group__item" :class="[`is-${item.status}`, `is-${item.emphasis}`, `is-align-${item.align}`, { 'is-selected': designer && item.id === selectedItemId }]" :style="{ gridColumn: `span ${item.layout.span}` }" :draggable="designer" @click.stop="select(item.id)" @dragstart="draggedId = item.id" @dragover.prevent @drop="drop(item.id)">
        <div v-if="designer" class="metric-group__item-tools"><button type="button" class="metric-group__drag" aria-label="拖动排序" title="拖动排序">⋮⋮</button><button type="button" aria-label="复制指标" title="复制指标" @click.stop="$emit('duplicate', item.id)">⧉</button><button type="button" aria-label="删除指标" title="删除指标" @click.stop="$emit('remove', item.id)">×</button></div>
        <div class="metric-group__item-head"><span>{{ item.label }}</span><i :class="`is-${item.status}`" /></div>
        <strong>{{ item.value }}<small v-if="item.unit">{{ item.unit }}</small></strong>
        <div class="metric-group__comparison" :class="`is-${clinicalTrendTone(item.status)}`"><span v-if="item.mom !== undefined">环比 {{ comparison(item.mom, item.unit) }}</span><span v-if="item.yoy !== undefined">同比 {{ comparison(item.yoy, item.unit) }}</span><span v-if="item.mom === undefined && item.yoy === undefined">{{ item.change || '暂无比较数据' }}</span></div>
      </section>
    </div>
    <button v-else-if="designer" class="metric-group__empty" type="button" @click="$emit('add')">添加第一个指标</button>
  </article>
</template>

<script setup>
import { computed, inject, ref } from 'vue'
import { compileWidgetData, formatDashboardMetric } from '../bindingEngine.js'
import { queryWidgetDatasetWithRuntime } from '../queryAdapter.js'
import { clinicalTrendTone } from '../chartTheme.js'
import { formatKpiComparison } from '../visualization.js'
import { metricGroupItemWidget, normalizeMetricGroupConfig } from '../metricGroup.js'
import { resolveWidgetVisualStyle } from '../visualStyle.js'

const props = defineProps({ widget: { type: Object, required: true }, getWidgetKpi: { type: Function, required: true }, designer: { type: Boolean, default: false }, selectedItemId: { type: String, default: '' } })
const emit = defineEmits(['select-item', 'duplicate', 'remove', 'add', 'reorder'])
const getDatasets = inject('dashboardBindingDatasets', () => [])
const filters = inject('dashboardFilterContext', { definitions: { value: [] }, values: { value: {} }, interactions: { value: {} } })
const draggedId = ref('')
const config = computed(() => normalizeMetricGroupConfig(props.widget.config?.metricGroup))
const style = computed(() => resolveWidgetVisualStyle(props.widget))
const groupStyle = computed(() => ({ '--metric-value': style.value.kpi.valueColor || '#153b5d', '--metric-title': style.value.kpi.titleColor || '#52636c', '--metric-border': props.widget.config?.style?.borderColor || '#e3e9eb' }))
const items = computed(() => config.value.items.map(item => {
  const virtual = metricGroupItemWidget(props.widget, item); const fallback = props.getWidgetKpi(virtual)
  if (!item.dataBinding) return { ...fallback, ...item, unit: item.unit || fallback.unit }
  const source = getDatasets(virtual).find(dataset => dataset.id === item.dataBinding.dataset)
  const dataset = queryWidgetDatasetWithRuntime(source, virtual, { definitions: filters.definitions.value, values: filters.values.value, interactions: filters.interactions?.value || {} })
  const model = compileWidgetData('kpi', item.dataBinding, dataset)
  return model.status === 'ready' ? { ...fallback, ...item, value: formatDashboardMetric(model.value), unit: item.unit || model.unit || '', status: fallback.status || 'info' } : { ...fallback, ...item, value: '暂无数据', unit: item.unit || '', status: 'info', change: model.message || '请配置数据字段' }
}))
const comparison = formatKpiComparison
function select(id) { if (props.designer) emit('select-item', id) }
function drop(targetId) { if (props.designer && draggedId.value && draggedId.value !== targetId) emit('reorder', { itemId: draggedId.value, targetId }); draggedId.value = '' }
</script>

<style scoped>
.metric-group { display:flex; flex-direction:column; width:100%; height:100%; padding:16px 18px; color:var(--db-text,#25343b); container-type:inline-size; }.metric-group__header { display:flex; justify-content:space-between; gap:12px; margin-bottom:12px; }.metric-group__header h2 { margin:0; color:var(--metric-value); font-size:15px; }.metric-group__header p { margin:4px 0 0; color:var(--db-muted,#78878e); font-size:11px; }.metric-group__header>span { color:var(--db-muted,#78878e); font-size:11px; }.metric-group__grid { display:grid; flex:1; min-height:0; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); align-content:start; }.metric-group__grid.is-columns-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }.metric-group__grid.is-columns-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }.metric-group__grid.is-columns-4 { grid-template-columns:repeat(4,minmax(0,1fr)); }.metric-group__item { position:relative; min-width:0; padding:10px 11px; border:1px solid color-mix(in srgb,var(--metric-border) 62%,transparent); border-radius:8px; background:color-mix(in srgb,var(--db-surface,#fff) 82%,transparent); }.metric-group__grid.is-appearance-flat .metric-group__item { padding:8px 3px; border-color:transparent; border-radius:0; background:transparent; }.metric-group__grid.is-appearance-divider { gap:0 !important; }.metric-group__grid.is-appearance-divider .metric-group__item { padding:10px 12px; border:0; border-right:1px solid color-mix(in srgb,var(--metric-border) 72%,transparent); border-radius:0; background:transparent; }.metric-group__grid.is-appearance-divider .metric-group__item:nth-child(4n) { border-right:0; }.metric-group__item.is-selected { outline:2px solid var(--db-accent,#1261a6); outline-offset:1px; }.metric-group__item.is-emphasis { background:color-mix(in srgb,var(--db-surface,#fff) 64%,#e6f3f5); }.metric-group__grid.is-appearance-flat .metric-group__item.is-emphasis { background:transparent; }.metric-group__item.is-hero { padding:14px; background:color-mix(in srgb,var(--db-surface,#fff) 58%,#dceff3); box-shadow:0 5px 15px rgba(18,97,166,.11); }.metric-group__grid.is-appearance-flat .metric-group__item.is-hero { padding:12px 3px; box-shadow:none; }.metric-group__item.is-align-center { text-align:center; }.metric-group__item-head { display:flex; justify-content:space-between; gap:6px; color:var(--metric-title); font-size:12px; }.metric-group__item-head span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.metric-group__item-head i { width:7px; height:7px; margin-top:4px; border-radius:50%; background:#98a2b3; }.metric-group__item-head i.is-success { background:#357b62; }.metric-group__item-head i.is-warning { background:#a47735; }.metric-group__item-head i.is-danger { background:#b45858; }.metric-group__item strong { display:block; margin:7px 0 4px; color:var(--metric-value); font-size:24px; line-height:1.15; overflow-wrap:anywhere; }.metric-group__item.is-emphasis strong { font-size:29px; }.metric-group__item.is-hero strong { font-size:34px; }.metric-group__item small { margin-left:3px; font-size:11px; font-weight:500; }.metric-group__comparison { display:flex; flex-wrap:wrap; gap:7px; color:var(--db-muted,#78878e); font-size:10px; }.is-align-center .metric-group__comparison { justify-content:center; }.metric-group__comparison.is-success { color:#357b62; }.metric-group__comparison.is-warning { color:#a47735; }.metric-group__comparison.is-danger { color:#b45858; }.metric-group__item-tools { position:absolute; z-index:2; top:4px; right:4px; display:none; gap:2px; }.metric-group__item:hover .metric-group__item-tools,.metric-group__item.is-selected .metric-group__item-tools { display:flex; }.metric-group__item-tools button { width:20px; height:20px; border:0; border-radius:3px; background:rgba(255,255,255,.82); color:#52636c; cursor:pointer; line-height:1; }.metric-group__drag { cursor:grab !important; }.metric-group__empty { flex:1; border:1px dashed var(--metric-border); border-radius:8px; background:transparent; color:var(--metric-title); cursor:pointer; } @container (max-width: 380px) { .metric-group__grid.is-columns-3,.metric-group__grid.is-columns-4 { grid-template-columns:repeat(2,minmax(0,1fr)); }.metric-group__grid.is-appearance-divider .metric-group__item:nth-child(4n) { border-right:1px solid color-mix(in srgb,var(--metric-border) 72%,transparent); }.metric-group__grid.is-appearance-divider .metric-group__item:nth-child(2n) { border-right:0; } } @container (max-width: 230px) { .metric-group__grid,.metric-group__grid.is-columns-2,.metric-group__grid.is-columns-3,.metric-group__grid.is-columns-4 { grid-template-columns:1fr; }.metric-group__item { grid-column:span 1 !important; }.metric-group__grid.is-appearance-divider .metric-group__item { border-right:0; border-bottom:1px solid color-mix(in srgb,var(--metric-border) 72%,transparent); }.metric-group__header p { display:none; } }
</style>
