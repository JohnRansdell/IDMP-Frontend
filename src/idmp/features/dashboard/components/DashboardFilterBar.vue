<template>
  <section v-if="definitions.some(def => def.enabled)" class="dashboard-filter-bar" data-testid="dashboard-filter-bar" aria-label="看板筛选">
    <div v-for="def in definitions.filter(item => item.enabled)" :key="def.id" class="filter-control" :data-filter-field="def.field">
      <label>{{ def.label }}</label>
      <FilterValue v-if="field(def)" :type="def.type" :options="optionsById?.[def.id] || field(def).options" :model-value="values[def.id]" @update:model-value="emit('change', { ...values, [def.id]: $event })" />
      <span v-else role="status">字段不可用：{{ def.field }}</span>
    </div>
    <button type="button" data-testid="dashboard-filter-reset" @click="emit('change', initialFilterValues(definitions))">重置</button>
    <small>筛选当前查询结果中的兼容字段；预设组件不参与字段筛选。</small>
  </section>
</template>
<script setup>
import FilterValue from './FilterValue.vue'
import { initialFilterValues, filterValueType } from '../filterEngine.js'
const props = defineProps({ definitions: { type: Array, default: () => [] }, values: { type: Object, default: () => ({}) }, catalog: { type: Array, default: () => [] }, optionsById: { type: Object, default: () => ({}) } })
const emit = defineEmits(['change'])
const field = def => props.catalog.find(item => item.id === def.field && filterValueType(item) === def.dataType)
</script>
<style scoped>
.dashboard-filter-bar { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:12px 16px; background:var(--db-surface,#fff); border-bottom:1px solid var(--db-border,#e3e9eb); color:var(--db-text,#25343b); }.filter-control>label { display:block; font-size:11px; margin-bottom:4px; }.dashboard-filter-bar>button { padding:7px 10px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; cursor:pointer; }.dashboard-filter-bar small { flex-basis:100%; font-size:10px; color:var(--db-muted,#78878e); } button:focus-visible { outline:2px solid var(--db-accent,#4f8583); }
@media (max-width: 1199px) { .filter-control { flex:1 1 180px; min-width:0; } }
@media (max-width: 767px) { .dashboard-filter-bar { align-items:stretch; padding:10px 12px; gap:10px; }.filter-control { flex-basis:100%; }.filter-control :deep(input),.filter-control :deep(select) { width:100%; box-sizing:border-box; }.dashboard-filter-bar>button { align-self:flex-start; }.dashboard-filter-bar small { line-height:1.45; } }
</style>
