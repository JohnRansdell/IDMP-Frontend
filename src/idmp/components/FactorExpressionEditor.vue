<template>
  <div class="field-expression" :class="{ nested: depth > 0 }">
    <el-select v-if="!rangeOnly" :model-value="modelValue?.expressionType" aria-label="表达式类型" @update:model-value="changeType">
      <el-option label="物理字段" value="FIELD" /><el-option label="固定常量" value="LITERAL" /><el-option label="四则运算 / 时间差" value="BINARY" :disabled="depth >= 10" /><el-option label="文本函数" value="FUNCTION" :disabled="depth >= 10" /><el-option v-if="allowRange || modelValue?.expressionType === 'RANGE'" label="范围" value="RANGE" />
    </el-select>
    <SemanticFieldSelector v-if="modelValue?.expressionType === 'FIELD'" :model-value="referenceCode" :fields="fields" @update:model-value="patch({ fieldCode: $event, fieldRef: undefined })" />
    <template v-else-if="modelValue?.expressionType === 'LITERAL'">
      <el-select :model-value="modelValue.dataType" aria-label="常量类型" @update:model-value="patch({ dataType: $event, value: '' })"><el-option v-for="item in literalTypes" :key="item[0]" :value="item[0]" :label="item[1]" /></el-select>
      <el-select v-if="templateParameters !== null" :model-value="modelValue.value?.parameterRef !== undefined ? 'TEMPLATE' : 'FIXED'" aria-label="常量来源" @update:model-value="patch({ value: $event === 'TEMPLATE' ? { parameterRef: '' } : '' })"><el-option label="固定值" value="FIXED" /><el-option label="模板参数" value="TEMPLATE" /></el-select>
      <el-select v-if="modelValue.value?.parameterRef !== undefined" :model-value="modelValue.value.parameterRef" aria-label="表达式模板参数" @update:model-value="patch({ value: { parameterRef: $event } })"><el-option v-for="item in templateParameters || []" :key="item.code" :value="item.code" :label="item.displayName || item.code" /></el-select>
      <el-date-picker v-else-if="['DATE', 'DATETIME'].includes(modelValue.dataType)" :model-value="modelValue.value" :type="modelValue.dataType === 'DATE' ? 'date' : 'datetime'" :value-format="modelValue.dataType === 'DATE' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm:ss'" aria-label="常量值" @update:model-value="patch({ value: $event })" />
      <el-select v-else-if="modelValue.dataType === 'BOOLEAN'" :model-value="String(modelValue.value)" aria-label="布尔常量" @update:model-value="patch({ value: $event === 'true' })"><el-option label="是" value="true" /><el-option label="否" value="false" /></el-select>
      <el-input v-else :model-value="modelValue.value" aria-label="常量值" placeholder="常量值" @update:model-value="patch({ value: $event })" />
      <el-select v-if="modelValue.dataType === 'DURATION'" :model-value="modelValue.unit || 'HOUR'" aria-label="时长单位" @update:model-value="patch({ unit: $event })"><el-option v-for="item in durationUnits" :key="item[0]" :value="item[0]" :label="item[1]" /></el-select>
    </template>
    <template v-else-if="modelValue?.expressionType === 'BINARY'">
      <el-select :model-value="modelValue.operator" aria-label="算术运算" @update:model-value="patch({ operator: $event })"><el-option v-for="item in arithmetic" :key="item[0]" :value="item[0]" :label="item[1]" /></el-select>
      <div class="expression-operands"><FactorExpressionEditor :model-value="modelValue.left" :fields="fields" :template-parameters="templateParameters" :depth="depth + 1" @update:model-value="patch({ left: $event })" /><FactorExpressionEditor :model-value="modelValue.right" :fields="fields" :template-parameters="templateParameters" :depth="depth + 1" @update:model-value="patch({ right: $event })" /></div>
    </template>
    <template v-else-if="modelValue?.expressionType === 'FUNCTION'">
      <el-select :model-value="modelValue.function" aria-label="文本函数" @update:model-value="changeFunction"><el-option v-for="item in functions" :key="item[0]" :value="item[0]" :label="item[1]" /></el-select>
      <div class="expression-operands"><FactorExpressionEditor v-for="(argument, index) in modelValue.arguments" :key="index" :model-value="argument" :fields="fields" :template-parameters="templateParameters" :depth="depth + 1" @update:model-value="updateArgument(index, $event)" /></div>
      <el-checkbox v-if="modelValue.function === 'SUBSTRING'" :model-value="modelValue.arguments.length === 3" @update:model-value="patch({ arguments: $event ? [...modelValue.arguments, literal('INTEGER', 1)] : modelValue.arguments.slice(0, 2) })">指定截取长度</el-checkbox>
    </template>
    <template v-else-if="modelValue?.expressionType === 'RANGE'">
      <el-select :model-value="modelValue.bounds || 'CLOSED'" aria-label="范围边界" @update:model-value="patch({ bounds: $event })"><el-option label="包含两端 [开始, 结束]" value="CLOSED" /><el-option label="不含结束 [开始, 结束)" value="HALF_OPEN" /><el-option label="不含开始 (开始, 结束]" value="HALF_CLOSED" /><el-option label="不含两端 (开始, 结束)" value="OPEN" /></el-select>
      <div class="expression-operands"><FactorExpressionEditor :model-value="modelValue.start" :fields="fields" :template-parameters="templateParameters" :depth="depth + 1" @update:model-value="patch({ start: $event })" /><FactorExpressionEditor :model-value="modelValue.end" :fields="fields" :template-parameters="templateParameters" :depth="depth + 1" @update:model-value="patch({ end: $event })" /></div>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import SemanticFieldSelector from './SemanticFieldSelector.vue'
defineOptions({ name: 'FactorExpressionEditor' })
const props = defineProps({ modelValue: Object, fields: { type: Array, default: () => [] }, depth: { type: Number, default: 0 }, allowRange: Boolean, rangeOnly: Boolean, templateParameters: { type: Array, default: null } })
const emit = defineEmits(['update:modelValue'])
const literalTypes = [['STRING', '文本'], ['CODE', '编码'], ['INTEGER', '整数'], ['DECIMAL', '小数'], ['BOOLEAN', '布尔值'], ['DATE', '日期'], ['DATETIME', '日期时间'], ['DURATION', '时长']]
const durationUnits = [['SECOND', '秒'], ['MINUTE', '分钟'], ['HOUR', '小时'], ['DAY', '天']]
const arithmetic = [['ADD', '加'], ['SUBTRACT', '减 / 时间差'], ['MULTIPLY', '乘'], ['DIVIDE', '除']]
const functions = [['LEFT', '取左侧字符'], ['SUBSTRING', '截取文本'], ['TRIM', '去除两端空格'], ['UPPER', '转大写'], ['LOWER', '转小写']]
const referenceCode = computed(() => { const ref = props.modelValue?.fieldRef; return ref ? `${ref.sourceAlias ? `${ref.sourceAlias}.` : ''}${ref.fieldName || ref.fieldCode || ''}` : props.modelValue?.fieldCode || '' })
const field = () => ({ expressionType: 'FIELD', fieldCode: '' })
const literal = (dataType = 'DECIMAL', value = '') => ({ expressionType: 'LITERAL', dataType, value })
function patch(value) { emit('update:modelValue', { ...props.modelValue, ...value }) }
function changeType(type) {
  if (type === 'FIELD') emit('update:modelValue', field())
  else if (type === 'LITERAL') emit('update:modelValue', literal())
  else if (type === 'BINARY') emit('update:modelValue', { expressionType: type, operator: 'SUBTRACT', left: field(), right: field() })
  else if (type === 'FUNCTION') changeFunction('TRIM')
  else emit('update:modelValue', { expressionType: type, bounds: 'HALF_OPEN', start: literal(), end: literal() })
}
function changeFunction(name) { emit('update:modelValue', { expressionType: 'FUNCTION', function: name, arguments: ['LEFT', 'SUBSTRING'].includes(name) ? [field(), literal('INTEGER', 1)] : [field()] }) }
function updateArgument(index, value) { const args = [...props.modelValue.arguments]; args[index] = value; patch({ arguments: args }) }
</script>
<style scoped>
.field-expression{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;width:100%}.field-expression.nested{padding:8px 0 8px 12px;border-left:2px solid #dce3e9}.field-expression>.el-select,.field-expression>.el-input{width:180px;max-width:100%}.expression-operands{display:grid;gap:8px;width:100%;min-width:0}.field-expression :deep(.el-date-editor){max-width:100%}
</style>
