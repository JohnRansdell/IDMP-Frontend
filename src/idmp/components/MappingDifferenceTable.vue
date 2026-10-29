<template>
  <div class="mapping-comparison" role="table" aria-label="业务口径对比">
    <div class="comparison-head comparison-grid" role="row">
      <div role="columnheader">对比项</div><div role="columnheader">源指标</div><div role="columnheader">目标指标</div>
    </div>
    <div v-for="row in rows" :key="row.key" class="comparison-row comparison-grid" :class="{ 'has-difference': row.different }" role="row" :data-difference-key="row.key">
      <div class="comparison-field" role="rowheader"><strong>{{ row.label }}</strong><span class="comparison-status"><i aria-hidden="true" />{{ row.different ? '有差异' : '一致' }}</span></div>
      <div v-for="side in sides" :key="side.key" class="comparison-value" role="cell">
        <span class="comparison-side-label">{{ side.label }}</span>
        <MappingDifferenceValue :value="row[side.key]" :counterpart="row[side.other]" />
      </div>
    </div>
    <div v-if="!rows.length" class="comparison-empty">当前筛选下暂无差异项</div>
  </div>
</template>
<script setup>
import MappingDifferenceValue from './MappingDifferenceValue.vue'
defineProps({ rows: { type: Array, default: () => [] } })
const sides = [{ key: 'sourceValue', other: 'targetValue', label: '源指标' }, { key: 'targetValue', other: 'sourceValue', label: '目标指标' }]
</script>
<style scoped>
.mapping-comparison { min-width:0; width:100%; border-top:1px solid var(--idmp-border-subtle); }
.comparison-grid { display:grid; grid-template-columns:140px minmax(0,1fr) minmax(0,1fr); }
.comparison-head { background:var(--idmp-layer-02, #f6f8fa); color:var(--idmp-text-helper); font-size:12px; font-weight:600; }
.comparison-head > div { padding:11px 16px; }
.comparison-row { border-bottom:1px solid var(--idmp-border-subtle); }
.comparison-field { padding:16px; display:flex; flex-direction:column; align-items:flex-start; gap:8px; font-size:13px; }
.comparison-field strong { font-weight:600; }.comparison-status { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--idmp-text-helper); white-space:nowrap; }
.comparison-status i { width:5px; height:5px; border-radius:50%; background:#96a1aa; }.has-difference .comparison-status i { background:#c38729; }
.comparison-value { padding:14px 16px; min-width:0; border-left:1px solid var(--idmp-border-subtle); }
.comparison-side-label { display:none; }.comparison-empty { padding:28px; text-align:center; color:var(--idmp-text-helper); font-size:13px; }
@media(max-width:700px) {
  .comparison-head { display:none; }.comparison-grid { grid-template-columns:minmax(0,1fr); }
  .comparison-field { flex-direction:row; justify-content:space-between; padding:12px 0 8px; }
  .comparison-value { border-left:0; padding:8px 0 12px; }.comparison-value + .comparison-value { border-top:1px dashed var(--idmp-border-subtle); }
  .comparison-side-label { display:block; color:var(--idmp-text-helper); font-size:11px; margin-bottom:6px; }
}
</style>
