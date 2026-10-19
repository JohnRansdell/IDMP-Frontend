<template>
  <div class="filter-value">
    <details v-if="type === 'multi-select'" ref="selection" :open="expanded" @keydown.esc.prevent.stop="closeSelection">
      <summary @click.prevent="toggleExpanded">{{ Array.isArray(modelValue) && modelValue.length ? filterValueLabel(modelValue, options) : allowAll ? '全部' : '未选择' }}</summary>
      <div class="filter-popover">
        <div class="filter-options"><label v-for="(option, index) in options" :key="index"><input type="checkbox" :data-filter-option="String(filterOptionValue(option))" :checked="selectedValues.includes(filterOptionValue(option))" @change="toggle(filterOptionValue(option), $event.target.checked)" />{{ filterOptionLabel(option) }}</label><span v-if="!options.length">暂无可选值</span></div>
        <div v-if="confirmSelection" class="filter-actions"><button v-if="allowAll" type="button" @click="draft = []">清空</button><span></span><button type="button" @click="closeSelection">取消</button><button type="button" class="filter-apply" :disabled="!allowAll && !draft.length" @click="applySelection">确定</button></div>
      </div>
    </details>
    <div v-else-if="type === 'date-range'" class="filter-range"><input type="date" aria-label="开始日期" :value="modelValue?.[0] || ''" @change="range(0, $event.target.value)" /><span>至</span><input type="date" aria-label="结束日期" :value="modelValue?.[1] || ''" @change="range(1, $event.target.value)" /><button type="button" aria-label="清空日期范围" @click="emit('update:modelValue', null)">×</button></div>
    <select v-else :value="modelValue === null || modelValue === undefined ? '' : options.findIndex(option => filterOptionValue(option) === modelValue)" aria-label="筛选值" @change="emit('update:modelValue', $event.target.value === '' ? null : filterOptionValue(options[Number($event.target.value)]))"><option value="" :disabled="!allowAll">{{ allowAll ? '全部' : '请选择' }}</option><option v-for="(option, index) in options" :key="index" :value="index">{{ filterOptionLabel(option) }}</option></select>
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { filterOptionValue, filterOptionLabel, filterValueLabel } from '../filterOptions.js'
const props = defineProps({ modelValue: { default: null }, type: { type: String, default: 'select' }, options: { type: Array, default: () => [] }, allowAll: { type: Boolean, default: true }, confirmSelection: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const selection = ref(null)
const expanded = ref(false)
const draft = ref([])
const selectedValues = computed(() => props.confirmSelection ? draft.value : Array.isArray(props.modelValue) ? props.modelValue : [])
function resetDraft() { draft.value = Array.isArray(props.modelValue) ? [...props.modelValue] : [] }
function toggleExpanded() { if (!expanded.value) resetDraft(); expanded.value = !expanded.value }
function closeSelection() { expanded.value = false; resetDraft() }
function applySelection() {
  const current = Array.isArray(props.modelValue) ? props.modelValue : []
  if (current.length !== draft.value.length || draft.value.some(value => !current.includes(value))) emit('update:modelValue', [...draft.value])
  closeSelection()
}
function dismissOutside(event) { if (expanded.value && selection.value && !selection.value.contains(event.target)) closeSelection() }
onMounted(() => document.addEventListener('pointerdown', dismissOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', dismissOutside))
watch(() => props.modelValue, resetDraft, { deep: true })
function toggle(option, checked) {
  const values = selectedValues.value
  const next = checked ? [...new Set([...values, option])] : values.filter(value => value !== option)
  if (props.confirmSelection) draft.value = next
  else emit('update:modelValue', next)
}
function range(index, value) { const next = [...(Array.isArray(props.modelValue) ? props.modelValue : ['', ''])]; next[index] = value; emit('update:modelValue', next.every(item => !item) ? null : next) }
</script>
<style scoped>
.filter-value { min-width:120px; font-size:12px; } summary,select,input[type=date] { border:1px solid var(--db-border,#e3e9eb); border-radius:5px; padding:6px 8px; color:var(--db-text,#25343b); background:white; box-sizing:border-box; } summary { cursor:pointer; max-width:220px; overflow-wrap:anywhere; } select { width:100%; } .filter-options { max-height:160px; overflow:auto; padding:6px; background:var(--db-surface,#fff); border:1px solid var(--db-border,#e3e9eb); }.filter-options label { display:flex; align-items:center; gap:6px; padding:4px; }.filter-range { display:flex; flex-wrap:wrap; align-items:center; gap:4px; } input[type=date] { width:130px; } button { border:0; background:transparent; cursor:pointer; } :focus-visible { outline:2px solid var(--db-accent,#4f8583); }
details { position:relative; }
.filter-popover { position:absolute; top:100%; left:0; min-width:100%; max-width:min(320px,80vw); z-index:30; box-sizing:border-box; background:var(--db-surface,#fff); border:1px solid var(--db-border,#e3e9eb); box-shadow:0 4px 12px #00000014; }
.filter-options { border:0; }.filter-options label { overflow-wrap:anywhere; }
.filter-actions { display:flex; align-items:center; gap:8px; padding:8px; border-top:1px solid var(--db-border,#e3e9eb); }.filter-actions span { flex:1; }.filter-actions button { padding:4px 6px; white-space:nowrap; color:var(--db-text,#25343b); }.filter-actions .filter-apply { background:var(--idmp-interactive,#1261a6); color:#fff; border-radius:3px; }.filter-actions button:disabled { opacity:.5; cursor:not-allowed; }
</style>
