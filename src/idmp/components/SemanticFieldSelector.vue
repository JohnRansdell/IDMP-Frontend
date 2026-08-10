<template>
  <el-select :model-value="modelValue" filterable clearable placeholder="选择字段" @update:model-value="$emit('update:modelValue', $event)">
    <el-option v-for="field in fields" :key="field.code" :label="field.sensitive ? `${field.label}（敏感）` : field.label" :value="field.code" />
  </el-select>
</template>
<script setup>
defineProps({ modelValue: String, fields: { type: Array, default: () => [] } })
defineEmits(['update:modelValue'])
</script>
