<template>
  <el-select :model-value="modelValue" filterable clearable placeholder="选择字段" @update:model-value="$emit('update:modelValue', $event)">
    <el-option v-for="field in fields" :key="field.code" :label="fieldOptionLabel(field)" :value="field.code" />
  </el-select>
</template>
<script setup>
defineProps({ modelValue: String, fields: { type: Array, default: () => [] } })
defineEmits(['update:modelValue'])
function fieldOptionLabel(field) {
  const name = String(field?.label || '').trim()
  const code = String(field?.code || '').trim()
  const label = name && name !== code ? `${name}（${code}）` : code || name || '未命名字段'
  return field?.sensitive ? `${label}（敏感）` : label
}
</script>
