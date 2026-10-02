<template>
  <div class="dimension-names" role="group" aria-label="组合粒度">
    <div class="name-entry">
      <el-input v-model="newName" :disabled="disabled || modelValue.length >= 10" :maxlength="128" placeholder="维度名称，例如科室" aria-label="新增组合粒度名称" @keydown.enter="onEnter" />
      <el-button :icon="Plus" :disabled="disabled || !newName.trim() || modelValue.length >= 10" @click="addName">新增维度</el-button>
    </div>
    <div v-if="modelValue.length" class="name-list">
      <el-tag v-for="name in modelValue" :key="name" :closable="!disabled" size="large" @close="removeName(name)">{{ name }}</el-tag>
    </div>
    <span v-if="error" class="name-error" role="alert">{{ error }}</span>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { normalizeDimensionGrain } from '../features/indicator/grouping.js'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const newName = ref(''), error = ref('')
function onEnter(event) {
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  addName()
}
function addName() {
  if (props.disabled || !newName.value.trim()) return
  try {
    const name = newName.value.trim().toUpperCase()
    if (name.startsWith('TIME_') || ['HOSPITAL_CODE', 'ORG_CODE'].includes(name)) throw new Error('该名称已用于系统时间或全院维度，请换一个名称')
    emit('update:modelValue', normalizeDimensionGrain([...props.modelValue, newName.value]))
    newName.value = ''; error.value = ''
  } catch (failure) { error.value = failure.message }
}
function removeName(name) {
  emit('update:modelValue', props.modelValue.filter(item => item !== name))
  error.value = ''
}
</script>
<style scoped>
.dimension-names { width: 100%; min-width: 0; }
.name-entry { display: flex; gap: 8px; }
.name-entry .el-input { flex: 1; min-width: 0; }
.name-entry .el-button { flex: none; }
.name-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.name-list :deep(.el-tag) { max-width: 100%; height: auto; min-height: 32px; }
.name-list :deep(.el-tag__content) { overflow-wrap: anywhere; white-space: normal; }
.name-error { display: block; margin-top: 6px; color: var(--el-color-danger); line-height: 1.5; }
</style>
