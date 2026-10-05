<template>
  <div class="expression-node">
    <div class="node-controls">
      <el-select :model-value="node.nodeType" :disabled="disabled" aria-label="公式节点类型" @update:model-value="type => emit('update:modelValue', newExpression(type))">
        <el-option v-for="[value, label] in expressionTypes" :key="value" :value="value" :label="label" />
      </el-select>
      <template v-if="node.nodeType === 'FACTOR_REF'">
        <el-select :model-value="String(node.factorVersionId || '')" filterable :disabled="disabled" aria-label="引用因子版本" placeholder="选择已发布因子版本" @update:model-value="value => update('factorVersionId', value)">
          <el-option v-for="item in versions" :key="item.id" :value="String(item.id)" :label="`${item.factorName || item.factorCode} · V${item.versionNo} · ${item.id}`" />
        </el-select>
        <el-select :model-value="node.alignmentPolicy || 'STRICT_EQUAL'" :disabled="disabled" aria-label="粒度对齐" @update:model-value="value => update('alignmentPolicy', value)">
          <el-option label="相同分组粒度" value="STRICT_EQUAL" /><el-option label="总体值广播" value="SCALAR_BROADCAST" />
        </el-select>
      </template>
      <el-input v-else-if="node.nodeType === 'CONST'" :model-value="node.value" :disabled="disabled" aria-label="数值常量" placeholder="数值常量" @update:model-value="value => update('value', value)" />
      <el-select v-else-if="node.nodeType === 'BINARY'" :model-value="node.operator" :disabled="disabled" aria-label="运算方式" @update:model-value="selectOperator">
        <el-option v-for="[value,label] in [['ADD','加'],['SUB','减'],['MUL','乘'],['DIV','除']]" :key="value" :value="value" :label="label" />
      </el-select>
      <el-select v-else-if="node.nodeType === 'UNARY'" :model-value="node.operator" :disabled="disabled" aria-label="一元运算" @update:model-value="value => update('operator', value)"><el-option label="绝对值" value="ABS" /><el-option label="取负数" value="NEGATE" /></el-select>
      <el-select v-else-if="node.nodeType === 'COMPARE'" :model-value="node.comparator" :disabled="disabled" aria-label="比较方式" @update:model-value="value => update('comparator', value)"><el-option v-for="[value,label] in [['EQ','等于'],['NE','不等于'],['GT','大于'],['GE','大于等于'],['LT','小于'],['LE','小于等于']]" :key="value" :value="value" :label="label" /></el-select>
      <el-select v-else-if="node.nodeType === 'FUNCTION'" :model-value="node.functionCode" :disabled="disabled" aria-label="函数" @update:model-value="value => update('functionCode', value)"><el-option v-for="[value,label] in [['COALESCE','空值替代'],['IF','条件选择'],['ABS','绝对值'],['ROUND','四舍五入'],['MIN','最小值'],['MAX','最大值'],['CLAMP','限定范围']]" :key="value" :value="value" :label="label" /></el-select>
      <el-select v-if="node.nodeType === 'BINARY' && node.operator === 'DIV'" :model-value="node.zeroDenominatorPolicy" :disabled="disabled" aria-label="零分母处理" @update:model-value="value => update('zeroDenominatorPolicy', value)"><el-option label="分母为零：空值" value="RETURN_NULL" /><el-option label="分母为零：零" value="RETURN_ZERO" /><el-option label="分母为零：报错" value="ERROR" /></el-select>
    </div>
    <div v-for="[key,label] in expressionChildren(node)" :key="key" class="node-operand">
      <span>{{ label }}</span><FactorExpressionNode :model-value="node[key]" :versions="versions" :disabled="disabled" @update:model-value="value => update(key, value)" />
    </div>
    <template v-if="['FUNCTION','COALESCE'].includes(node.nodeType)">
      <div v-for="(argument,index) in node.arguments || []" :key="index" class="node-operand">
        <span>参数 {{ index + 1 }}<el-button :icon="Delete" circle size="small" :disabled="disabled" title="删除参数" @click="removeArgument(index)" /></span>
        <FactorExpressionNode :model-value="argument" :versions="versions" :disabled="disabled" @update:model-value="value => replaceArgument(index, value)" />
      </div>
      <el-button :icon="Plus" size="small" :disabled="disabled" @click="update('arguments', [...(node.arguments || []), newExpression('CONST')])">添加参数</el-button>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { expressionTypes, expressionChildren, newExpression } from '@/idmp/utils/derivedFactor'
const props = defineProps({ modelValue: Object, versions: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const node = computed(() => props.modelValue || newExpression())
function update(key, value) { emit('update:modelValue', { ...node.value, [key]: value }) }
function selectOperator(operator) {
  const next = { ...node.value, operator }
  if (operator === 'DIV') next.zeroDenominatorPolicy ||= 'RETURN_NULL'
  else delete next.zeroDenominatorPolicy
  emit('update:modelValue', next)
}
function replaceArgument(index, value) { update('arguments', node.value.arguments.map((item, i) => i === index ? value : item)) }
function removeArgument(index) { update('arguments', node.value.arguments.filter((_, i) => i !== index)) }
</script>
<style scoped>
.expression-node { min-width: 0; padding: 12px 0 12px 12px; border-left: 2px solid var(--idmp-border-subtle, #e5e7eb); }
.node-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.node-controls > * { width: 160px; max-width: 100%; }
.node-controls > :nth-child(2) { flex: 1; min-width: min(220px, 100%); }
.node-operand { min-width: 0; margin-top: 12px; }
.node-operand > span { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--idmp-text-helper); }
@media (max-width: 600px) { .node-controls > * { width: 100%; } .expression-node { padding-left: 8px; } }
</style>
