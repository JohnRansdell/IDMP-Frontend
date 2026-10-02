<template>
  <el-form-item label="组合粒度">
    <el-select :model-value="modelValue" multiple filterable :allow-create="allowCreate" default-first-option clearable :multiple-limit="10" :disabled="disabled" placeholder="不选表示不增加组合粒度" aria-label="组合粒度" @update:model-value="value => emit('update:modelValue', value)">
      <el-option v-for="code in choices" :key="code" :value="code" :label="code" />
    </el-select>
  </el-form-item>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, options: { type: Array, default: () => [] }, allowCreate: Boolean, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const choices = computed(() => [...new Set([...props.options, ...props.modelValue].map(value => String(value).toUpperCase()))])
</script>
<style scoped>
.el-select { width: 100%; min-width: 0; }
</style>
