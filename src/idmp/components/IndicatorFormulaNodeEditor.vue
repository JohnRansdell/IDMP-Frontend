<template>
  <div class="indicator-formula-node" :class="{ nested: depth > 0 }">
    <div class="node-controls">
      <el-select :model-value="modelValue?.nodeType" :disabled="disabled" aria-label="公式节点类型" @update:model-value="changeType">
        <el-option label="因子" value="FACTOR_REF" /><el-option label="数字常量" value="CONST" />
        <el-option label="四则运算" value="BINARY" :disabled="depth >= 20" /><el-option label="舍入" value="FUNCTION" :disabled="depth >= 20" />
      </el-select>
      <el-select v-if="modelValue?.nodeType === 'FACTOR_REF'" :model-value="String(modelValue.factorVersionId || '')" :disabled="disabled" filterable aria-label="引用因子" @update:model-value="patch({ factorVersionId: $event })">
        <el-option v-for="factor in factors" :key="factor.versionId" :value="String(factor.versionId)" :label="factor.name" />
      </el-select>
      <el-input v-if="modelValue?.nodeType === 'CONST'" :model-value="String(modelValue.value ?? '')" :disabled="disabled" aria-label="数字常量" @update:model-value="patch({ value: $event })" />
      <template v-if="modelValue?.nodeType === 'BINARY'">
        <el-select :model-value="modelValue.operator" :disabled="disabled" aria-label="四则运算符" @update:model-value="changeOperator"><el-option v-for="[code, label] in arithmeticOperators" :key="code" :value="code" :label="label" /></el-select>
        <el-select v-if="modelValue.operator === 'DIV'" :model-value="modelValue.zeroDenominatorPolicy || 'RETURN_NULL'" :disabled="disabled" aria-label="该节点分母为零策略" @update:model-value="patch({ zeroDenominatorPolicy: $event })"><el-option label="返回空值" value="RETURN_NULL" /><el-option label="返回 0" value="RETURN_ZERO" /><el-option label="报错" value="ERROR" /></el-select>
      </template>
      <template v-if="modelValue?.nodeType === 'FUNCTION'">
        <el-input-number :model-value="modelValue.scale" :disabled="disabled" :min="0" :max="12" :precision="0" aria-label="舍入小数位数" @update:model-value="patch({ scale: $event })" />
        <el-select :model-value="modelValue.roundingMode || 'HALF_UP'" :disabled="disabled" aria-label="舍入方式" @update:model-value="patch({ roundingMode: $event })"><el-option v-for="[code, label] in roundingModes" :key="code" :value="code" :label="label" /></el-select>
      </template>
    </div>
    <div v-if="modelValue?.nodeType === 'BINARY'" class="node-children">
      <div><span class="operand-label">左侧</span><IndicatorFormulaNodeEditor :model-value="modelValue.left" :factors="factors" :disabled="disabled" :depth="depth + 1" @update:model-value="patch({ left: $event })" /></div>
      <div><span class="operand-label">右侧</span><IndicatorFormulaNodeEditor :model-value="modelValue.right" :factors="factors" :disabled="disabled" :depth="depth + 1" @update:model-value="patch({ right: $event })" /></div>
    </div>
    <IndicatorFormulaNodeEditor v-if="modelValue?.nodeType === 'FUNCTION'" :model-value="modelValue.arguments?.[0]" :factors="factors" :disabled="disabled" :depth="depth + 1" @update:model-value="patch({ arguments: [$event] })" />
  </div>
</template>
<script setup>
import { arithmeticOperators, roundingModes, createArithmeticNode } from '@/idmp/features/indicator/arithmeticFormula'
defineOptions({ name: 'IndicatorFormulaNodeEditor' })
const props = defineProps({ modelValue: Object, factors: { type: Array, default: () => [] }, disabled: Boolean, depth: { type: Number, default: 0 } })
const emit = defineEmits(['update:modelValue'])
function patch(value) { emit('update:modelValue', { ...props.modelValue, ...value }) }
function changeType(type) { emit('update:modelValue', createArithmeticNode(type, props.modelValue)) }
function changeOperator(operator) {
  const node = { ...props.modelValue, operator }
  if (operator === 'DIV') node.zeroDenominatorPolicy ||= 'RETURN_NULL'
  else delete node.zeroDenominatorPolicy
  emit('update:modelValue', node)
}
</script>
<style scoped>
.indicator-formula-node { min-width: 0; width: 100%; }
.indicator-formula-node.nested { padding: 8px 0 8px 12px; border-left: 2px solid var(--idmp-border-subtle); }
.node-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.node-controls > .el-select, .node-controls > .el-input { width: 220px; max-width: 100%; }
.node-controls > .el-input-number { max-width: 100%; }
.node-children { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.node-children > div { min-width: 0; }
.operand-label { font-size: 12px; color: var(--idmp-text-helper); }
</style>
