<template>
  <div class="indicator-version-picker" :class="{ 'has-version': selectedIndicator }">
    <el-select :model-value="selectedIndicator || (modelValue ? 'unavailable' : '')" filterable default-first-option clearable
      :loading="loading" :disabled="disabled" :aria-label="`${label}名称`" placeholder="请选择指标"
      @visible-change="visible => visible && emit('refresh')" @update:model-value="selectIndicator">
      <el-option v-for="item in groups" :key="item.id" :value="item.id" :label="item.name" />
      <el-option v-if="modelValue && !selectedIndicator" :value="'unavailable'" label="所选指标暂不可用" disabled />
    </el-select>
    <el-select v-if="selectedIndicator" :model-value="modelValue || ''" filterable default-first-option clearable
      :disabled="disabled || !selectedIndicator" :loading="loading" :aria-label="`${label}版本`" placeholder="请选择版本"
      @update:model-value="value => emit('update:modelValue', value || '')">
      <el-option v-for="item in versions" :key="item.id" :value="item.id" :label="item.versionNo == null ? '版本号未提供' : `V${item.versionNo}`" />
      <el-option v-if="modelValue && !versions.some(item => item.id === modelValue)" :value="modelValue" label="所选版本暂不可用" disabled />
    </el-select>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { groupIndicatorVersions } from '@/idmp/utils/indicatorVersionOptions.js'
const props = defineProps({ modelValue: { type: String, default: '' }, options: { type: Array, default: () => [] }, disabled: Boolean, loading: Boolean, label: { type: String, default: '指标' } })
const emit = defineEmits(['update:modelValue', 'refresh'])
const groups = computed(() => groupIndicatorVersions(props.options))
const pendingIndicator = ref('')
const selectedIndicator = computed(() => groups.value.find(group => group.versions.some(item => item.id === props.modelValue))?.id || pendingIndicator.value)
const versions = computed(() => groups.value.find(group => group.id === selectedIndicator.value)?.versions || [])
function selectIndicator(id) {
  if (id && id === selectedIndicator.value) return
  pendingIndicator.value = id || ''
  emit('update:modelValue', '')
}
watch(() => props.modelValue, (value, old) => {
  const group = groups.value.find(group => group.versions.some(item => item.id === value))
  if (group) pendingIndicator.value = group.id
  else if (!value && groups.value.find(group => group.versions.some(item => item.id === old))?.id === pendingIndicator.value) pendingIndicator.value = ''
})
</script>

<style scoped>
.indicator-version-picker { display:grid; grid-template-columns:minmax(0,1fr); align-items:center; gap:8px; width:100%; min-width:0; }
.indicator-version-picker.has-version { grid-template-columns:minmax(0,1fr) clamp(88px,30%,112px); }
.indicator-version-picker > .el-select { width:100%; min-width:0; }
</style>
