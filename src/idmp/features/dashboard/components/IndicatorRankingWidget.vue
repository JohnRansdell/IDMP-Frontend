<template>
  <article class="indicator-ranking" :style="themeStyle">
    <header><h2>{{ widget.title || config.title || '指标排名' }}</h2><span>{{ config.items.length }} 项</span></header>
    <p v-if="groups.length > 1" class="indicator-ranking__hint">不同单位或统计周期分组排名</p>
    <div v-if="config.items.length" class="indicator-ranking__body">
      <section v-for="group in groups" :key="group.key">
        <h3 v-if="groups.length > 1">{{ group.unit || '无单位' }}<span v-if="group.period"> · {{ group.period }}</span></h3>
        <ol><li v-for="(item, index) in group.items" :key="item.id" :class="{ 'is-selected': designer && item.id === selectedItemId }" @click.stop="designer && emit('select-item', item.id)">
          <span class="indicator-ranking__rank">{{ item.numericValue === null ? '—' : index + 1 }}</span>
          <div class="indicator-ranking__name"><span :title="item.label">{{ item.label }}</span><small v-if="item.message" :title="item.message">{{ item.message }}</small><small v-else-if="item.periodStart">{{ formatResultPeriod(item.periodStart, item.periodEnd) }}</small></div>
          <strong>{{ item.value }}<small>{{ item.unit }}</small></strong>
          <button v-if="item.loadStatus === 'ERROR'" type="button" @pointerdown.stop @click.stop="emit('retry', item.id)">重试</button>
        </li></ol>
      </section>
    </div>
    <button v-else-if="designer" class="indicator-ranking__empty" type="button" @click="emit('add')">+ 添加排名指标</button>
    <p v-else class="indicator-ranking__hint">尚未添加排名指标</p>
  </article>
</template>

<script setup>
import { computed, inject } from 'vue'
import { formatResultPeriod } from '../../../utils/periodRange.js'
import { normalizeMetricGroupConfig } from '../metricGroup.js'
import { metricItemModel } from '../metricItemModel.js'
import { resolveWidgetVisualStyle } from '../visualStyle.js'
const props = defineProps({ widget: { type: Object, required: true }, getWidgetKpi: { type: Function, required: true }, designer: Boolean, selectedItemId: { type: String, default: '' } })
const emit = defineEmits(['select-item', 'add', 'retry'])
const getDatasets = inject('dashboardBindingDatasets', () => [])
const filters = inject('dashboardFilterContext', { definitions: { value: [] }, values: { value: {} }, interactions: { value: {} } })
const config = computed(() => normalizeMetricGroupConfig(props.widget.config?.metricGroup))
const themeStyle = computed(() => { const style = resolveWidgetVisualStyle(props.widget); return { '--ranking-title': style.kpi.titleColor || 'var(--db-text,#25343b)', '--ranking-value': style.kpi.valueColor || 'var(--db-accent,#1261a6)' } })
const groups = computed(() => {
  const result = new Map()
  for (const item of config.value.items) {
    const model = metricItemModel(props.widget, item, props.getWidgetKpi, getDatasets, { definitions: filters.definitions.value, values: filters.values.value, interactions: filters.interactions?.value || {} })
    const key = JSON.stringify([model.unit, model.periodStart, model.periodEnd])
    if (!result.has(key)) result.set(key, { key, unit: model.unit, period: model.periodStart?.slice(0, 10), items: [] })
    result.get(key).items.push(model)
  }
  const direction = props.widget.config?.ranking?.direction === 'asc' ? 1 : -1
  for (const group of result.values()) group.items.sort((a, b) => a.numericValue === null ? b.numericValue === null ? 0 : 1 : b.numericValue === null ? -1 : direction * (a.numericValue - b.numericValue))
  return [...result.values()]
})
</script>

<style scoped>
.indicator-ranking { display:flex; flex-direction:column; box-sizing:border-box; height:100%; min-height:0; padding:14px 16px; color:var(--ranking-title); }
.indicator-ranking header { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.indicator-ranking h2 { margin:0; font-size:13px; }
.indicator-ranking header>span,.indicator-ranking__hint { color:var(--db-muted,#78878e); font-size:11px; }
.indicator-ranking__hint { margin:6px 0; }
.indicator-ranking__body { flex:1; min-height:0; overflow:auto; }
.indicator-ranking h3 { margin:10px 0 0; font-size:11px; font-weight:500; }
.indicator-ranking ol { margin:0; padding:0; list-style:none; }
.indicator-ranking li { display:flex; align-items:center; gap:8px; padding:10px 0; border-bottom:1px solid var(--db-border,#e3e9eb); }
.indicator-ranking li.is-selected { outline:2px solid var(--db-accent,#1261a6); outline-offset:-2px; }
.indicator-ranking__rank { display:grid; flex:0 0 24px; place-items:center; height:24px; border-radius:5px; background:color-mix(in srgb,var(--ranking-value) 10%,transparent); color:var(--ranking-value); font-size:12px; }
.indicator-ranking__name { flex:1; min-width:0; font-size:12px; }
.indicator-ranking__name>span,.indicator-ranking__name>small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.indicator-ranking__name>small { margin-top:3px; color:var(--db-muted,#78878e); font-size:10px; }
.indicator-ranking strong { color:var(--ranking-value); font-size:15px; white-space:nowrap; }
.indicator-ranking strong small { margin-left:2px; font-size:10px; font-weight:400; }
.indicator-ranking button { border:0; background:transparent; color:var(--ranking-value); cursor:pointer; font-size:11px; }
.indicator-ranking__empty { flex:1; margin-top:10px; border:1px dashed var(--db-border,#e3e9eb)!important; border-radius:6px; }
</style>
