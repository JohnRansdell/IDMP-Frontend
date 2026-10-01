<template>
  <div class="runtime-parameter-fields">
    <div v-for="parameter in declarations" :key="parameter.code" class="runtime-parameter-field">
      <label>
        <span>{{ parameter.code }}<em v-if="parameter.required">*</em></span>
        <small v-if="showMetadata">{{ typeLabel(parameter.type) }} · {{ parameter.parameterMode === 'TEMPORARY' ? '临时重算' : '结果维度' }}</small>
      </label>
      <el-select v-if="parameter.type === 'BOOLEAN'" :model-value="modelValue[parameter.code]" clearable placeholder="请选择" @update:model-value="value => updateValue(parameter.code, value)"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select>
      <el-input-number v-else-if="parameter.type === 'INTEGER'" :model-value="modelValue[parameter.code]" :precision="0" :controls="false" placeholder="请输入整数" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-input-number v-else-if="parameter.type === 'DECIMAL'" :model-value="modelValue[parameter.code]" :controls="false" placeholder="请输入数值" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-date-picker v-else-if="parameter.type === 'DATE'" :model-value="modelValue[parameter.code]" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-date-picker v-else-if="parameter.type === 'DATETIME'" :model-value="modelValue[parameter.code]" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择日期时间" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-input v-else :model-value="modelValue[parameter.code]" clearable :placeholder="parameter.code.toLowerCase().includes('dept') ? '输入单个科室编码' : '请输入参数值'" @update:model-value="value => updateValue(parameter.code, value)" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  declarations: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  showMetadata: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'change'])
function updateValue(code, value) {
  const next = { ...props.modelValue, [code]: value }
  emit('update:modelValue', next)
  emit('change', next)
}
function typeLabel(type) { return ({ STRING: '文本', INTEGER: '整数', DECIMAL: '小数', BOOLEAN: '布尔', DATE: '日期', DATETIME: '日期时间' })[type] || type }
</script>

<style scoped lang="scss">
.runtime-parameter-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--idmp-space-4) var(--idmp-space-5);
}

.runtime-parameter-field {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--idmp-space-2);
}

.runtime-parameter-field label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--idmp-space-2);
  min-height: 20px;
}

.runtime-parameter-field label span {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.runtime-parameter-field label small {
  color: var(--idmp-text-helper);
  white-space: nowrap;
}

.runtime-parameter-field em {
  color: var(--el-color-danger);
  font-style: normal;
}

.runtime-parameter-field > .el-select,
.runtime-parameter-field > .el-input,
.runtime-parameter-field > .el-input-number,
.runtime-parameter-field > .el-date-editor {
  width: 100%;
}

@media (max-width: 1180px) {
  .runtime-parameter-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .runtime-parameter-fields {
    grid-template-columns: 1fr;
    row-gap: var(--idmp-space-3);
  }
}
</style>
