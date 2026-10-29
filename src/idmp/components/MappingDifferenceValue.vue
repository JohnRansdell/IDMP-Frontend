<template>
  <div class="mapping-difference-value">
    <ol v-if="Array.isArray(value) && value.length" class="difference-items">
      <li v-for="(item, index) in value" :key="index"><MappingDifferenceValue :value="item" :counterpart="Array.isArray(counterpart) ? counterpart[index] : undefined" /></li>
    </ol>
    <span v-else-if="Array.isArray(value)">无配置</span>
    <dl v-else-if="value && typeof value === 'object' && visibleDifferenceEntries(value).length" class="difference-fields">
      <div v-for="[key, item] in visibleDifferenceEntries(value)" :key="key">
        <dt>{{ differenceFieldLabel(key) }}</dt><dd><MappingDifferenceValue :value="item" :counterpart="counterpart?.[key]" /></dd>
      </div>
    </dl>
    <span v-else-if="value && typeof value === 'object'">无业务配置</span>
    <span v-else :class="{ 'is-different': !sameDifferenceValue(value, counterpart) }">{{ differenceScalar(value) }}</span>
  </div>
</template>
<script setup>
import { differenceFieldLabel, differenceScalar, visibleDifferenceEntries, sameDifferenceValue } from '@/idmp/features/mapping/differenceContent.js'
defineProps({ value: null, counterpart: null })
</script>
<style scoped>
.mapping-difference-value { min-width:0; white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.6; }
.difference-items { margin:0; padding-left:20px; }.difference-items > li + li { margin-top:16px; }
.difference-fields { margin:0; }.difference-fields > div { margin:0 0 8px; }
dt { color:var(--idmp-text-helper); font-size:12px; } dd { margin:0 0 0 8px; }
.is-different { background:var(--el-color-warning-light-9); text-decoration:underline; text-decoration-color:var(--el-color-warning); text-underline-offset:3px; }
</style>
