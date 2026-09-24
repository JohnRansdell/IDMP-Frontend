<template>
  <section v-if="capability" class="binding-inspector" aria-label="字段绑定">
    <p v-if="!datasets.length" data-testid="binding-dataset-unavailable">当前数据源未提供可绑定的行级数据；可继续使用预设展示，但不能配置字段绑定或全局筛选兼容性。</p>
    <h3>数据源</h3>
    <select aria-label="绑定数据源" data-testid="binding-dataset" :value="datasetId" @change="changeDataset($event.target.value)"><option v-for="item in datasets" :key="item.id" :value="item.id">{{ item.label }}</option></select>
    <p v-if="!hasDataBinding(widget)">当前为预设展示。首次添加字段后启用字段绑定。</p>
    <h3>字段</h3>
    <input v-model="search" aria-label="搜索字段" placeholder="搜索字段…" />
    <p>先点击配置槽，再点击字段添加。</p>
    <div class="binding-fields"><button v-for="field in filteredFields" :key="field.id" type="button" :data-testid="`binding-field-${field.id}`" :disabled="!canAdd(field)" @click="add(field)"><span>{{ icon(field) }} {{ field.label }}</span><small>{{ field.semanticType === 'measure' ? '度量' : field.semanticType === 'time' ? '时间' : '维度' }}</small></button></div>
    <h3>字段配置</h3>
    <p v-if="isMap">Map 需要 1 个区域维度 + 1 个数值度量。</p>
    <section v-for="slot in slots" :key="slot.id" class="binding-slot" :class="{ 'is-active': target === slot.id }">
      <button type="button" class="binding-slot-heading" :data-testid="`binding-slot-${slot.id}`" :aria-pressed="target === slot.id" @click="target = slot.id">{{ slot.label }} <span>＋</span></button>
      <p v-if="slot.id === 'measures' && dualAxisSupported" class="binding-axis-help">添加多个度量后，可分别指定左 Y 轴或右 Y 轴。</p>
      <p v-if="!binding[slot.id]?.length">点击此槽，再从上方添加字段</p>
      <div v-for="(item, index) in binding[slot.id] || []" :key="item.field" class="binding-chip" :data-testid="`binding-chip-${slot.id}-${item.field}`">
        <span>{{ item.label || item.field }}</span><button type="button" :aria-label="`移除${item.label || item.field}`" @click="remove(slot.id, index)">×</button>
        <select v-if="slot.id === 'measures'" :aria-label="`${item.label}聚合方式`" :data-testid="`binding-aggregation-${item.field}`" :value="item.aggregation" @change="patchItem(slot.id, index, { aggregation: $event.target.value })"><option v-for="(label, value) in AGGREGATIONS" :key="value" :value="value">{{ label }}</option></select>
        <label v-if="slot.id === 'measures' && dualAxisSupported" class="binding-axis-select">坐标轴<select :aria-label="`${item.label}坐标轴`" :data-testid="`binding-axis-${item.field}`" :value="item.axis || 'left'" @change="patchItem(slot.id, index, { axis: $event.target.value })"><option value="left">左 Y 轴</option><option value="right">右 Y 轴</option></select></label>
        <span v-if="fields.find(field => field.id === item.field)?.semanticType === 'time'" class="binding-granularity">原始时间粒度（不补造日期）</span>
      </div>
    </section>
    <h3>排序</h3>
    <select data-testid="binding-sort-field" aria-label="排序字段" :value="binding.sort?.[0]?.field || ''" @change="setSort($event.target.value, binding.sort?.[0]?.direction || 'asc')"><option value="">原始顺序</option><option v-for="item in [...(binding.dimensions || []), ...(binding.measures || [])]" :key="item.field" :value="item.field">{{ item.label || item.field }}</option></select>
    <select v-if="binding.sort?.length" data-testid="binding-sort-direction" aria-label="排序方向" :value="binding.sort[0].direction" @change="setSort(binding.sort[0].field, $event.target.value)"><option value="asc">升序 ↑</option><option value="desc">降序 ↓</option></select>
    <p v-if="binding.series?.length">按度量排序时使用首个系列的值。</p>
    <h3>筛选条件</h3>
    <button type="button" data-testid="component-filter-add" :aria-pressed="target === 'filters'" @click="target = 'filters'">＋ 添加条件 · 从上方字段选择</button>
    <FilterConditionEditor v-for="(condition, index) in binding.filters || []" :key="index" :condition="condition" :field="filterFields.find(field => field.id === condition.field)" @change="patchCondition(index, $event)" @remove="removeCondition(index)" />
    <template v-if="hasDataBinding(widget)">
      <h3>全局筛选作用范围</h3>
      <label><input type="checkbox" data-testid="inherit-global-filters" :checked="widget.config?.query?.inheritGlobalFilters !== false" @change="emit('query-change', { ...widget.config?.query, inheritGlobalFilters: $event.target.checked })" />继承兼容的全局筛选</label>
      <label v-for="def in globalContext.definitions.value" :key="def.id" class="query-scope"><input type="checkbox" :data-ignore-filter="def.id" :checked="widget.config?.query?.ignoredGlobalFilterIds?.includes(def.id)" @change="ignoreFilter(def.id, $event.target.checked)" />忽略 {{ def.label }} <small v-if="!fields.some(field => field.id === def.field)">（当前数据不兼容）</small></label>
    </template>
    <p v-if="hasDataBinding(widget) && !validation.valid" role="status" class="binding-error">{{ validation.errors.join('；') }}</p>
    <p v-if="directValueWarning" role="status" class="binding-error binding-error--direct">{{ directValueWarning }}</p>
    <button v-if="hasDataBinding(widget)" type="button" @click="emit('change', null)">恢复预设展示</button>
  </section>
  <p v-else class="binding-inspector">此组件保持原有业务展示，不启用字段绑定。</p>
</template>
<script setup>
import { computed, inject, ref, watch } from 'vue'
import FilterConditionEditor from './FilterConditionEditor.vue'
import { dashboardFilterCatalog } from '../queryAdapter.js'
import { AGGREGATIONS, BINDING_CAPABILITIES, bindingKind, compileWidgetData, emptyBinding, hasDataBinding, validateWidgetBinding } from '../bindingEngine.js'
import { createDefaultBinding, isEmptyDashboardBinding } from '../smartDefaultBinding.js'
import { queryWidgetDatasetWithRuntime } from '../queryAdapter.js'
const props = defineProps({ widget: { type: Object, required: true }, datasets: { type: Array, default: () => [] } })
const emit = defineEmits(['change', 'query-change'])
const globalContext = inject('dashboardFilterContext', { definitions: { value: [] } })
const search = ref(''), target = ref('measures'), pendingDataset = ref('')
const capability = computed(() => BINDING_CAPABILITIES[bindingKind(props.widget)])
const datasetId = computed(() => {
  const preferred = props.widget.type === 'kpi' || props.widget.chartKind === 'gauge' ? 'current' : props.widget.chartKind === 'line' || props.widget.preset === 'trend' ? 'trend' : 'departments'
  return props.widget.config?.dataBinding?.dataset || pendingDataset.value || (props.datasets.some(item => item.id === preferred) ? preferred : props.datasets[0]?.id || preferred)
})
const rawBinding = computed(() => hasDataBinding(props.widget) ? props.widget.config.dataBinding : emptyBinding(datasetId.value))
// A malformed saved binding remains diagnosable, but must not crash the editor.
// This is a UI projection only; it never silently rewrites persistence.
const binding = computed(() => ({ ...emptyBinding(datasetId.value), ...rawBinding.value, ...Object.fromEntries(['dimensions', 'measures', 'series', 'sort'].map(slot => [slot, Array.isArray(rawBinding.value?.[slot]) ? rawBinding.value[slot].filter(item => item && typeof item === 'object' && typeof item.field === 'string') : []])) }))
const fields = computed(() => props.datasets.find(item => item.id === datasetId.value)?.fields || [])
const directValueWarning = computed(() => {
  const dataset = props.datasets.find(item => item.id === datasetId.value)
  if (!dataset || !binding.value.measures.some(item => item.aggregation === 'direct')) return ''
  const widget = { ...props.widget, config: { ...props.widget.config, dataBinding: binding.value } }
  const filteredDataset = queryWidgetDatasetWithRuntime(dataset, widget, {
    definitions: globalContext.definitions.value,
    values: globalContext.values?.value || {},
    interactions: globalContext.interactions?.value || {}
  })
  const preview = compileWidgetData(bindingKind(props.widget), binding.value, filteredDataset)
  return preview.status === 'invalid' && String(preview.message || '').startsWith('直接值遇到多行')
    ? '当前筛选后，同一个 X 轴与系列组合对应多条记录，直接值无法确定唯一数值。请增加区分维度，或改用平均值、求和、最大值、最小值等聚合方式。'
    : ''
})
const filterFields = computed(() => dashboardFilterCatalog(props.datasets.filter(item => item.id === datasetId.value)))
const filteredFields = computed(() => fields.value.filter(field => `${field.label} ${field.id}`.toLowerCase().includes(search.value.toLowerCase())))
const validation = computed(() => validateWidgetBinding(bindingKind(props.widget), rawBinding.value, fields.value))
const dualAxisSupported = computed(() => ['line', 'bar'].includes(bindingKind(props.widget)))
const isMap = computed(() => bindingKind(props.widget) === 'map')
const slots = computed(() => [{ id: 'dimensions', label: isMap.value ? '区域 / 维度' : 'X 轴 / 维度' }, { id: 'measures', label: isMap.value ? '数值 / 度量' : 'Y 轴 / 度量' }, { id: 'series', label: '系列' }].filter(slot => capability.value?.[slot.id]))
watch(() => props.widget.id, () => { search.value = ''; pendingDataset.value = ''; target.value = props.widget.type === 'kpi' ? 'measures' : 'dimensions' }, { immediate: true })
watch(slots, value => { if (!value.some(slot => slot.id === target.value)) target.value = 'measures' })
const icon = field => field.semanticType === 'measure' ? '∑' : field.semanticType === 'time' ? '◷' : '▣'
function canAdd(field) { return target.value === 'filters' ? field.filterable : (target.value === 'measures') === (field.semanticType === 'measure') && !(binding.value[target.value] || []).some(item => item.field === field.id) }
function add(field) {
  if (!canAdd(field)) return
  if (target.value === 'filters') { emit('change', { ...binding.value, filters: [...(binding.value.filters || []), { field: field.id, operator: 'isNotEmpty' }] }); return }
  const item = { field: field.id, label: field.label, ...(target.value === 'measures' ? { aggregation: 'direct', axis: 'left' } : field.semanticType === 'time' ? { granularity: 'raw' } : {}) }
  const old = binding.value[target.value] || []
  const next = { ...binding.value, [target.value]: capability.value[target.value] === 1 ? [item] : [...old, item] }
  next.sort = (next.sort || []).filter(sort => [...next.dimensions, ...next.measures].some(entry => entry.field === sort.field))
  emit('change', next)
}
function changeDataset(id) {
  pendingDataset.value = id
  if (!hasDataBinding(props.widget) || isEmptyDashboardBinding(props.widget.config?.dataBinding)) {
    emit('change', createDefaultBinding(bindingKind(props.widget), props.datasets, { datasetId: id }) || emptyBinding(id))
  }
}
function remove(slot, index) { const next = { ...binding.value, [slot]: binding.value[slot].filter((_, i) => i !== index) }; next.sort = next.sort.filter(sort => [...next.dimensions, ...next.measures].some(item => item.field === sort.field)); emit('change', next) }
function patchItem(slot, index, patch) { emit('change', { ...binding.value, [slot]: binding.value[slot].map((item, i) => i === index ? { ...item, ...patch } : item) }) }
function setSort(field, direction) { emit('change', { ...binding.value, sort: field ? [{ field, direction }] : [] }) }
function patchCondition(index, condition) { emit('change', { ...binding.value, filters: binding.value.filters.map((item, i) => i === index ? condition : item) }) }
function removeCondition(index) { emit('change', { ...binding.value, filters: binding.value.filters.filter((_, i) => i !== index) }) }
function ignoreFilter(id, ignored) { const query = props.widget.config?.query || {}; const ids = query.ignoredGlobalFilterIds || []; emit('query-change', { ...query, ignoredGlobalFilterIds: ignored ? [...ids, id] : ids.filter(item => item !== id) }) }
</script>
<style scoped>
.binding-inspector { font-size:12px; color:var(--db-secondary,#5c6d75); padding-bottom:16px; }.binding-inspector h3 { font-size:12px; margin:18px 0 8px; color:var(--db-text,#25343b); }.binding-inspector p { font-size:11px; line-height:1.6; }
input,select { box-sizing:border-box; width:100%; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; color:inherit; margin-bottom:5px; }
button { cursor:pointer; color:inherit; background:white; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; padding:6px; } button:disabled { opacity:.45; cursor:default; } button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid var(--db-accent,#4f8583); }
.binding-fields { max-height:180px; overflow:auto; display:grid; gap:4px; }.binding-fields button { display:flex; justify-content:space-between; text-align:left; }.binding-fields small { flex-shrink:0; }
.binding-slot { margin:8px 0; padding:6px; border:1px dashed var(--db-border,#e3e9eb); border-radius:6px; }.binding-slot.is-active { border-color:var(--db-accent,#4f8583); }.binding-slot-heading { width:100%; display:flex; justify-content:space-between; border:0; }.binding-slot p { margin:6px; }
.binding-chip { display:flex; flex-wrap:wrap; align-items:center; gap:5px; background:var(--db-accent-soft,#edf5f3); border-radius:5px; padding:6px; margin-top:5px; }.binding-chip>span { flex:1; }.binding-chip button { border:0; background:transparent; }.binding-chip select { margin:0; }.binding-axis-help { margin:4px 6px 7px; color:var(--db-muted,#78878e); }.binding-axis-select { display:flex; align-items:center; gap:4px; flex:1 1 100%; font-size:11px; }.binding-axis-select select { flex:1; }.binding-granularity { font-size:10px; flex-basis:100%!important; }.binding-error { color:var(--db-warning,#a47735); }
.binding-inspector input[type=checkbox] { width:auto; }.query-scope { display:block; margin-top:8px; }
</style>
