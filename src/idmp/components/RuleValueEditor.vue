<template>
  <el-input v-if="parameter === 'period'" model-value="由下方“本次试算周期”自动传入" disabled />
  <div v-else-if="isContinuous" class="continuous-range">
    <el-date-picker v-if="isDate" :model-value="rangeValue" :type="field?.dataType === 'DATE' ? 'daterange' : 'datetimerange'" :value-format="field?.dataType === 'DATE' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss'" start-placeholder="开始值" end-placeholder="结束值" @update:model-value="updateDateRange" />
    <template v-else><el-input :model-value="rangeValue.start" placeholder="开始值" @update:model-value="updateRange('start', $event)" /><span>至（不含）</span><el-input :model-value="rangeValue.end" placeholder="结束值" @update:model-value="updateRange('end', $event)" /></template>
    <small>{{ continuousHint }}</small>
  </div>
  <el-date-picker v-else-if="field?.kind === 'DATETIME' && operator === 'BETWEEN'" :model-value="modelValue" type="datetimerange" unlink-panels value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" @update:model-value="$emit('update:modelValue', $event)" />
  <el-date-picker v-else-if="field?.kind === 'DATETIME'" :model-value="modelValue" type="datetime" placeholder="选择时间" value-format="YYYY-MM-DDTHH:mm:ss" @update:model-value="$emit('update:modelValue', $event)" />
  <el-select v-else-if="(field?.kind === 'CODE' || field?.kind === 'VALUE_SET') && field.options?.length" :model-value="modelValue" :multiple="operator === 'IN' || operator === 'IN_VALUE_SET'" filterable clearable placeholder="选择业务值" @update:model-value="$emit('update:modelValue', $event)"><el-option v-for="option in field.options" :key="option.value ?? option.code ?? option" :label="option.label ? `${option.label}（${option.code || option.value || ''}）` : (option.name ?? option)" :value="operator === 'IN_VALUE_SET' ? (option.code ?? option.value ?? option) : (option.value ?? option.code ?? option)" /></el-select>
  <el-input v-else-if="field?.kind === 'VALUE_SET'" model-value="" disabled placeholder="暂无可用值集" />
  <el-input v-else-if="!field" model-value="" disabled placeholder="请先选择字段" />
  <el-input v-else :model-value="modelValue" placeholder="输入值" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ field: Object, operator: String, parameter: String, modelValue: [String, Number, Array, Object] })
const emit = defineEmits(['update:modelValue'])
const isContinuous = computed(() => props.operator === 'BETWEEN' && String(props.field?.valueSetMatchMode || props.field?.valueSetBinding?.matchMode || '').toUpperCase() === 'CONTINUOUS')
const isDate = computed(() => ['DATE', 'DATETIME'].includes(String(props.field?.dataType || '').toUpperCase()))
const rangeValue = computed(() => ({ start: props.modelValue?.start || '', end: props.modelValue?.end || '' }))
const continuousHint = computed(() => { const spec = props.field?.continuousSpec || props.field?.valueSetBinding?.continuousSpec || {}; const range = [spec.minimumValue, spec.maximumValue].filter((value) => value != null && value !== '').join(' 至 '); const precision = spec.scale != null ? `，最多 ${spec.scale} 位小数` : ''; return `${spec.unit ? `单位：${spec.unit}` : '连续值'}${range ? `，合法范围：${range}` : ''}${precision}；按 [开始值, 结束值) 筛选` })
function updateRange(key, value) { emit('update:modelValue', { ...rangeValue.value, [key]: value }) }
function updateDateRange(value) { emit('update:modelValue', { start: value?.[0] || '', end: value?.[1] || '' }) }
</script>
<style scoped>.continuous-range{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.continuous-range .el-input{width:130px}.continuous-range small{width:100%;color:#8c8c8c;font-size:12px}</style>
