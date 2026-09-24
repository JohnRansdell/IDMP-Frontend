<template>
  <section class="kpi-variant-picker" aria-label="KPI 展示样式">
    <h3>展示样式</h3>
    <div class="kpi-variant-picker__grid">
      <button v-for="variant in KPI_VARIANTS" :key="variant.id" type="button" :class="{ 'is-active': modelValue === variant.id }" @click="$emit('update:modelValue', variant.id)">
        <span class="kpi-variant-preview" :class="`is-${variant.preview}`"><i>住院患者</i><b>12.4K</b><em>↑ 3%</em></span>
        <span>{{ variant.label }}</span>
      </button>
    </div>
  </section>
</template>

<script setup>
import { KPI_VARIANTS } from '../kpiVariants.js'
defineProps({ modelValue: { type: String, default: 'standard' } })
defineEmits(['update:modelValue'])
</script>

<style scoped>
.kpi-variant-picker { display:grid; gap:6px; }.kpi-variant-picker h3 { margin:10px 0 0; font-size:12px; }.kpi-variant-picker__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.kpi-variant-picker button { display:grid; gap:4px; min-width:0; padding:6px; border:1px solid #d8e2e7; border-radius:6px; background:#fff; color:#52636c; font-size:11px; text-align:left; cursor:pointer; transition:border-color .15s ease,background-color .15s ease; }.kpi-variant-picker button:hover { border-color:#75a8c2; background:#f6fbfd; }.kpi-variant-picker button:focus-visible { outline:2px solid #1261a6; outline-offset:2px; }.kpi-variant-picker button.is-active { border-color:#1261a6; box-shadow:0 0 0 1px #1261a6; background:#edf6ff; color:#1261a6; }.kpi-variant-preview { display:grid; min-height:40px; color:#52636c; font-size:8px; line-height:1.1; }.kpi-variant-preview i,.kpi-variant-preview em { font-style:normal; }.kpi-variant-preview b { color:#153b5d; font-size:16px; line-height:1; }.kpi-variant-preview em { color:#357b62; }.kpi-variant-preview.is-hero b { font-size:22px; }.kpi-variant-preview.is-horizontal { grid-template-columns:1fr auto auto; align-items:center; gap:3px; }.kpi-variant-preview.is-horizontal i { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.kpi-variant-preview.is-status { padding-left:5px; border-left:3px solid #b45858; }.kpi-variant-preview.is-trend { grid-template-columns:1fr 1fr; }.kpi-variant-preview.is-trend i,.kpi-variant-preview.is-trend b { grid-column:span 2; }.kpi-variant-preview.is-minimal { align-content:center; text-align:center; }.kpi-variant-preview.is-minimal i { font-size:7px; }.kpi-variant-preview.is-minimal em { display:none; }
</style>
