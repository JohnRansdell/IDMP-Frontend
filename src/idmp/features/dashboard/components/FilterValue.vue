<template>
  <div class="filter-value">
    <details v-if="type === 'multi-select'">
      <summary>{{ Array.isArray(modelValue) && modelValue.length ? modelValue.join('、') : allowAll ? '全部' : '未选择' }}</summary>
      <div class="filter-options"><label v-for="(option, index) in options" :key="index"><input type="checkbox" :data-filter-option="String(option)" :checked="Array.isArray(modelValue) && modelValue.includes(option)" @change="toggle(option, $event.target.checked)" />{{ String(option) }}</label><span v-if="!options.length">暂无可选值</span></div>
    </details>
    <div v-else-if="type === 'date-range'" class="filter-range"><input type="date" aria-label="开始日期" :value="modelValue?.[0] || ''" @change="range(0, $event.target.value)" /><span>至</span><input type="date" aria-label="结束日期" :value="modelValue?.[1] || ''" @change="range(1, $event.target.value)" /><button type="button" aria-label="清空日期范围" @click="emit('update:modelValue', null)">×</button></div>
    <select v-else :value="modelValue === null || modelValue === undefined ? '' : options.findIndex(option => option === modelValue)" aria-label="筛选值" @change="emit('update:modelValue', $event.target.value === '' ? null : options[Number($event.target.value)])"><option value="" :disabled="!allowAll">{{ allowAll ? '全部' : '请选择' }}</option><option v-for="(option, index) in options" :key="index" :value="index">{{ String(option) }}</option></select>
  </div>
</template>
<script setup>
const props = defineProps({ modelValue: { default: null }, type: { type: String, default: 'select' }, options: { type: Array, default: () => [] }, allowAll: { type: Boolean, default: true } })
const emit = defineEmits(['update:modelValue'])
function toggle(option, checked) { const values = Array.isArray(props.modelValue) ? props.modelValue : []; emit('update:modelValue', checked ? [...values, option] : values.filter(value => value !== option)) }
function range(index, value) { const next = [...(Array.isArray(props.modelValue) ? props.modelValue : ['', ''])]; next[index] = value; emit('update:modelValue', next.every(item => !item) ? null : next) }
</script>
<style scoped>
.filter-value { min-width:120px; font-size:12px; } summary,select,input[type=date] { border:1px solid var(--db-border,#e3e9eb); border-radius:5px; padding:6px 8px; color:var(--db-text,#25343b); background:white; box-sizing:border-box; } summary { cursor:pointer; max-width:220px; overflow-wrap:anywhere; } select { width:100%; } .filter-options { max-height:160px; overflow:auto; padding:6px; background:var(--db-surface,#fff); border:1px solid var(--db-border,#e3e9eb); }.filter-options label { display:flex; align-items:center; gap:6px; padding:4px; }.filter-range { display:flex; flex-wrap:wrap; align-items:center; gap:4px; } input[type=date] { width:130px; } button { border:0; background:transparent; cursor:pointer; } :focus-visible { outline:2px solid var(--db-accent,#4f8583); }
details { position:relative; }
.filter-options { position:absolute; top:100%; left:0; min-width:100%; z-index:30; box-sizing:border-box; }
</style>
