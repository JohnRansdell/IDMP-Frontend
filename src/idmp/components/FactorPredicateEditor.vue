<template>
  <div class="predicate-editor">
    <div class="predicate-line">
      <el-select :model-value="condition.left ? 'EXPRESSION' : 'FIELD'" aria-label="筛选对象" @update:model-value="changeLeft"><el-option label="物理字段" value="FIELD" /><el-option label="字段表达式" value="EXPRESSION" /></el-select>
      <SemanticFieldSelector v-if="!condition.left" :model-value="condition.fieldCode" :fields="fields" @update:model-value="changeField" />
      <el-select :model-value="condition.operator" aria-label="判断方式" @update:model-value="changeOperator"><el-option v-for="option in operators" :key="option[0]" :value="option[0]" :label="option[1]" /></el-select>
    </div>
    <FactorExpressionEditor v-if="condition.left" :model-value="condition.left" :fields="fields" @update:model-value="set({ left: $event })" />
    <template v-if="!nullOperator">
      <div class="predicate-line">
        <el-select v-if="!governedOperator && condition.operator !== 'BETWEEN'" :model-value="valueMode" aria-label="条件值来源" @update:model-value="changeValueMode"><el-option label="固定值" value="FIXED" /><el-option label="字段 / 表达式" value="EXPRESSION" /><el-option label="运行参数" value="PARAMETER" /></el-select>
        <RuleValueEditor v-if="valueMode === 'FIXED' && !condition.right" :field="selectedField" :operator="condition.operator" :use-value-set="condition.operator === 'IN_VALUE_SET'" :model-value="condition.operator === 'IN_VALUE_SET' ? condition.itemCodes : condition.value" @update:model-value="changeValue" />
        <template v-if="valueMode === 'PARAMETER'">
          <el-input :model-value="condition.parameter" aria-label="运行参数名称" placeholder="参数名，如 minAge" maxlength="64" @update:model-value="set({ parameter: $event.trim() })" />
          <el-select :model-value="definition.type" aria-label="运行参数类型" @update:model-value="setDefinition({ type: $event })"><el-option v-for="item in parameterTypes" :key="item[0]" :value="item[0]" :label="item[1]" /></el-select>
          <el-checkbox :model-value="definition.required" @update:model-value="setDefinition({ required: $event })">必填</el-checkbox>
          <el-select :model-value="definition.parameterMode" aria-label="参数用途" @update:model-value="setDefinition({ parameterMode: $event })"><el-option label="临时筛选" value="TEMPORARY" /><el-option label="维度条件" value="DIMENSION" /></el-select>
        </template>
      </div>
      <FactorExpressionEditor v-if="condition.right" :model-value="condition.right" :fields="fields" :range-only="condition.operator === 'BETWEEN'" @update:model-value="set({ right: $event })" />
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import SemanticFieldSelector from './SemanticFieldSelector.vue'
import RuleValueEditor from './RuleValueEditor.vue'
import FactorExpressionEditor from './FactorExpressionEditor.vue'
import { runtimeParameterDefinition } from '../utils/dslBuilder.js'
const props = defineProps({ condition: { type: Object, required: true }, fields: { type: Array, default: () => [] } })
const emit = defineEmits(['update'])
const selectedField = computed(() => props.fields.find(item => item.code === props.condition.fieldCode))
const continuous = computed(() => String(selectedField.value?.valueSetMatchMode || selectedField.value?.valueSetBinding?.matchMode || '').toUpperCase() === 'CONTINUOUS')
const nullOperator = computed(() => ['IS_NULL', 'IS_NOT_NULL'].includes(props.condition.operator))
const governedOperator = computed(() => props.condition.operator === 'IN_VALUE_SET' || props.condition.operator === 'BETWEEN' && continuous.value && !props.condition.left)
const valueMode = computed(() => props.condition.valueSource === 'PARAMETER' || props.condition.parameter ? 'PARAMETER' : props.condition.right && props.condition.right.expressionType !== 'LITERAL' ? 'EXPRESSION' : 'FIXED')
const definition = computed(() => runtimeParameterDefinition(props.condition, props.fields))
const parameterTypes = [['STRING', '文本'], ['INTEGER', '整数'], ['DECIMAL', '小数'], ['BOOLEAN', '布尔值'], ['DATE', '日期'], ['DATETIME', '日期时间']]
const operators = computed(() => {
  const options = [['EQ', '等于'], ['NE', '不等于'], ['GT', '大于'], ['GTE', '大于或等于'], ['LT', '小于'], ['LTE', '小于或等于'], ['IS_NULL', '为空'], ['IS_NOT_NULL', '非空']]
  if (props.condition.left || continuous.value) options.push(['BETWEEN', continuous.value && !props.condition.left ? '位于连续范围（不含结束）' : '位于范围'])
  if (!props.condition.left && selectedField.value?.options?.length) options.push(['IN_VALUE_SET', '属于标准值'])
  if (!props.condition.left && ['STRING', 'CODE', 'VALUE_SET'].includes(selectedField.value?.kind)) options.push(['LIKE', '匹配文本'], ['NOT_LIKE', '不匹配文本'])
  return options
})
function set(patch) { Object.assign(props.condition, patch); emit('update') }
function setDefinition(patch) { set({ parameterDefinition: { ...definition.value, ...patch } }) }
function clearValue() { Object.assign(props.condition, { valueSource: undefined, parameter: undefined, parameterDefinition: undefined, right: undefined, value: '', itemCodes: [] }) }
function changeField(code) { clearValue(); set({ fieldCode: code, fieldRef: undefined, operator: 'EQ' }) }
function changeLeft(mode) { clearValue(); set({ left: mode === 'EXPRESSION' ? { expressionType: 'FIELD', fieldCode: props.condition.fieldCode || '' } : undefined, operator: 'EQ' }); if (mode === 'EXPRESSION') changeValueMode('EXPRESSION') }
function changeOperator(operator) {
  clearValue(); set({ operator })
  if (operator === 'BETWEEN' && !governedOperator.value) set({ right: { expressionType: 'RANGE', bounds: 'HALF_OPEN', start: { expressionType: 'LITERAL', dataType: 'DECIMAL', value: '' }, end: { expressionType: 'LITERAL', dataType: 'DECIMAL', value: '' } } })
  else if (operator === 'BETWEEN') set({ value: { start: '', end: '' } })
  else if (props.condition.left && !nullOperator.value) changeValueMode('FIXED')
}
function changeValueMode(mode) {
  clearValue()
  if (mode === 'PARAMETER') set({ valueSource: 'PARAMETER', parameter: 'businessValue', parameterDefinition: { type: definition.value.type, required: false, parameterMode: 'TEMPORARY' } })
  else if (mode === 'EXPRESSION') set({ right: { expressionType: 'FIELD', fieldCode: '' } })
  else if (props.condition.left) set({ right: { expressionType: 'LITERAL', dataType: selectedField.value?.dataType || 'DECIMAL', value: '' } })
  else emit('update')
}
function changeValue(value) { set(props.condition.operator === 'IN_VALUE_SET' ? { itemCodes: Array.isArray(value) ? value : [] } : { value }) }
</script>
<style scoped>
.predicate-editor{display:grid;gap:8px;min-width:0;flex:1}.predicate-line{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.predicate-line>.el-select,.predicate-line>.el-input{width:180px;max-width:100%}.predicate-line>.el-checkbox{margin-right:4px}
</style>
