<template>
  <el-input v-if="parameter === 'period'" model-value="由下方“本次试算周期”自动传入" disabled />
  <el-date-picker v-else-if="field?.kind === 'DATETIME' && operator === 'BETWEEN'" :model-value="modelValue" type="datetimerange" value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" @update:model-value="$emit('update:modelValue', $event)" />
  <el-date-picker v-else-if="field?.kind === 'DATETIME'" :model-value="modelValue" type="datetime" placeholder="选择时间" value-format="YYYY-MM-DDTHH:mm:ss" @update:model-value="$emit('update:modelValue', $event)" />
  <el-select v-else-if="(field?.kind === 'CODE' || field?.kind === 'VALUE_SET') && field.options?.length" :model-value="modelValue" :multiple="operator === 'IN' || operator === 'IN_VALUE_SET'" filterable clearable placeholder="选择业务值" @update:model-value="$emit('update:modelValue', $event)"><el-option v-for="option in field.options" :key="option.value ?? option.code ?? option" :label="option.label ? `${option.label}（${option.code || option.value || ''}）` : (option.name ?? option)" :value="operator === 'IN_VALUE_SET' ? (option.code ?? option.value ?? option) : (option.value ?? option.code ?? option)" /></el-select>
  <el-input v-else-if="field?.kind === 'VALUE_SET'" model-value="" disabled placeholder="暂无可用值集" />
  <el-input v-else-if="!field" model-value="" disabled placeholder="请先选择字段" />
  <el-input v-else :model-value="modelValue" placeholder="输入值" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup>
defineProps({ field: Object, operator: String, parameter: String, modelValue: [String, Number, Array] })
defineEmits(['update:modelValue'])
</script>
