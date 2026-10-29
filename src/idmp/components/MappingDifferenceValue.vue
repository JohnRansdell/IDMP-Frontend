<template>
  <div class="mapping-difference-value">
    <ol v-if="Array.isArray(value) && value.length" class="difference-items">
      <li v-for="(item, index) in value" :key="index"><MappingDifferenceValue :value="item" :counterpart="differenceCounterpart(item, counterpart, index)" /></li>
    </ol>
    <span v-else-if="Array.isArray(value)">无配置</span>
    <template v-else-if="value && typeof value === 'object' && visibleDifferenceEntries(value).length">
      <div v-if="differenceItemTitle(value)" class="difference-item-heading"><strong>{{ differenceItemTitle(value) }}</strong><span v-if="differenceItemVersion(value)" class="difference-version">{{ differenceItemVersion(value) }}</span></div>
      <dl v-if="differenceItemEntries(value).length" class="difference-fields">
        <div v-for="[key, item] in differenceItemEntries(value)" :key="key">
          <dt>{{ differenceFieldLabel(key) }}</dt><dd><MappingDifferenceValue :value="item" :counterpart="counterpart?.[key]" /></dd>
        </div>
      </dl>
    </template>
    <span v-else-if="value && typeof value === 'object'">无业务配置</span>
    <span v-else :class="{ 'is-different': !sameDifferenceValue(value, counterpart) }">{{ differenceScalar(value) }}</span>
  </div>
</template>
<script setup>
import { differenceFieldLabel, differenceScalar, visibleDifferenceEntries, sameDifferenceValue, differenceItemTitle, differenceItemVersion, differenceItemEntries, differenceCounterpart } from '@/idmp/features/mapping/differenceContent.js'
defineProps({ value: null, counterpart: null })
</script>
<style scoped>
.mapping-difference-value { min-width:0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.65; font-size:13px; }
.difference-items { margin:0; padding:0; list-style:none; }.difference-items > li + li { border-top:1px solid var(--idmp-border-subtle); margin-top:12px; padding-top:12px; }
.difference-item-heading { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 10px; margin-bottom:6px; }
.difference-item-heading strong { font-weight:600; }.difference-version { color:var(--idmp-text-helper); font-size:12px; white-space:nowrap; }
.difference-fields { margin:0; }.difference-fields > div { display:grid; grid-template-columns:84px minmax(0,1fr); gap:10px; margin:3px 0; }
dt { color:var(--idmp-text-helper); font-size:12px; } dd { min-width:0; margin:0; }
.difference-fields :deep(.difference-fields > div) { grid-template-columns:minmax(0,1fr); gap:2px; }
.is-different { background:var(--el-color-warning-light-9); border-radius:2px; }
@media(max-width:700px) { .difference-fields > div { grid-template-columns:76px minmax(0,1fr); gap:8px; } }
</style>
