<template>
  <section v-if="definitions.some(def => def.enabled)" class="dashboard-filter-bar" :class="{ 'is-compact': compact }" data-testid="dashboard-filter-bar" aria-label="看板筛选">
    <div v-for="def in definitions.filter(item => item.enabled)" :key="def.id" class="filter-control" :data-filter-field="def.field">
      <label>{{ def.label }}</label>
      <span v-if="loadingById[def.id]" role="status">正在加载筛选选项</span>
      <FilterValue v-else-if="field(def)" :type="def.type" confirm-selection :options="optionsById?.[def.id] || field(def).options" :model-value="values[def.id]" @update:model-value="emit('change', { ...values, [def.id]: $event })" />
      <span v-else role="status">字段不可用：{{ def.field }}</span>
      <small v-if="errorsById[def.id]" role="alert">{{ errorsById[def.id] }} <button type="button" @click="emit('retry')">重试</button></small>
    </div>
    <button type="button" data-testid="dashboard-filter-reset" @click="emit('change', initialFilterValues(definitions))">重置</button>
    <small>筛选作用于兼容组件；科室显示名称，查询使用各指标对应的科室编码。</small>
  </section>
</template>
<script setup>
import FilterValue from './FilterValue.vue'
import { initialFilterValues, filterValueType } from '../filterEngine.js'
const props = defineProps({ definitions: { type: Array, default: () => [] }, values: { type: Object, default: () => ({}) }, catalog: { type: Array, default: () => [] }, optionsById: { type: Object, default: () => ({}) }, errorsById: { type: Object, default: () => ({}) }, loadingById: { type: Object, default: () => ({}) }, compact: { type: Boolean, default: false } })
const emit = defineEmits(['change', 'retry'])
const field = def => props.catalog.find(item => item.id === def.field && filterValueType(item) === def.dataType)
</script>
<style scoped>
.dashboard-filter-bar { display:flex; flex-wrap:wrap; align-items:end; gap:12px; padding:12px 16px; border:1px solid var(--idmp-border-subtle,#d9e0e6); border-radius:var(--idmp-radius-lg,4px); background:var(--idmp-layer-01,#fff); color:var(--idmp-text-primary,#17212b); }.dashboard-filter-bar.is-compact { padding:0; border:0; border-radius:0; background:transparent; }.filter-control>label { display:block; font-size:12px; margin-bottom:4px; color:var(--idmp-text-secondary,#52606d); }.dashboard-filter-bar>button { min-height:32px; padding:6px 10px; border:1px solid var(--idmp-border-subtle,#d9e0e6); border-radius:var(--idmp-radius-md,3px); background:var(--idmp-layer-01,#fff); color:var(--idmp-interactive,#1261a6); cursor:pointer; }.dashboard-filter-bar small { flex-basis:100%; font-size:11px; color:var(--idmp-text-helper,#6b7785); } button:focus-visible { outline:2px solid var(--idmp-focus,#2563eb); }
@media (max-width: 1199px) { .filter-control { flex:1 1 180px; min-width:0; } }
@media (max-width: 767px) { .dashboard-filter-bar { align-items:stretch; padding:10px 12px; gap:10px; }.filter-control { flex-basis:100%; }.filter-control :deep(input),.filter-control :deep(select) { width:100%; box-sizing:border-box; }.dashboard-filter-bar>button { align-self:flex-start; }.dashboard-filter-bar small { line-height:1.45; } }
</style>
