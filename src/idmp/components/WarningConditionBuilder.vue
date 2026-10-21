<template>
  <div class="warning-condition" :class="{ 'is-group': isGroup }">
    <div class="condition-header">
      <span class="condition-label">{{ isGroup ? '条件组' : '条件' }}</span>
      <el-select v-if="isGroup" :model-value="kind" :disabled="disabled" aria-label="条件组逻辑" class="kind-select" @change="changeLogic">
        <el-option label="与（全部满足）" value="AND" />
        <el-option label="或（任一满足）" value="OR" />
        <el-option label="非（不满足）" value="NOT" :disabled="modelValue.children.length > 1 && depth + treeHeight(modelValue) > 8" />
      </el-select>
      <template v-if="!isGroup">
        <el-select :model-value="modelValue.operator" :disabled="disabled" aria-label="比较符" @change="patch({ operator: $event })">
          <el-option v-for="op in WARNING_OPERATORS" :key="op" :value="op" :label="warningLabel(op)" />
        </el-select>
        <el-input :model-value="modelValue.threshold" :disabled="disabled" aria-label="阈值" placeholder="阈值" @update:model-value="patch({ threshold: $event })" />
      </template>
      <el-button v-if="removable && !disabled" :icon="Delete" text title="删除条件" aria-label="删除条件" @click="$emit('remove')" />
    </div>
    <div v-if="!isGroup && warningType === 'TREND'" class="leaf-options">
      <span>比较度量</span><el-select :model-value="modelValue.measure || 'DELTA'" :disabled="disabled" @change="patch({ measure: $event })"><el-option label="变化值" value="DELTA" /><el-option label="变化率" value="CHANGE_RATE" /></el-select>
    </div>
    <div v-if="!isGroup && warningType === 'VOLATILITY'" class="leaf-options">
      <span>窗口周期数</span><el-input-number :model-value="modelValue.windowSize || 3" :min="2" :max="60" :precision="0" :disabled="disabled" @update:model-value="patch({ windowSize: $event })" />
    </div>
    <div v-if="isGroup" class="condition-children">
      <WarningConditionBuilder v-for="(child, index) in modelValue.children" :key="index" :model-value="child" :warning-type="warningType" :disabled="disabled" :depth="depth + 1" :removable="kind !== 'NOT' && modelValue.children.length > 1" @update:model-value="updateChild(index, $event)" @remove="removeChild(index)" />
      <div v-if="!disabled && kind !== 'NOT' && depth < 8" class="condition-actions">
        <el-button :icon="Plus" text @click="add(false)">添加条件</el-button>
        <el-button :icon="Plus" text :disabled="depth >= 7" @click="add(true)">添加条件组</el-button>
      </div>
      <div v-else-if="!disabled && kind === 'NOT' && depth + treeHeight(modelValue) <= 8" class="condition-actions">
        <el-button :icon="Plus" text @click="nestGroup">嵌套条件组</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { WARNING_OPERATORS, warningLabel } from '@/idmp/api/adapters/warning'
const props = defineProps({ modelValue: { type: Object, required: true }, warningType: String, disabled: Boolean, removable: Boolean, depth: { type: Number, default: 1 } })
const emit = defineEmits(['update:modelValue', 'remove'])
const kind = computed(() => props.modelValue.logic || 'COMPARE')
const isGroup = computed(() => kind.value !== 'COMPARE')
const leaf = () => ({ operator: 'GT', threshold: '', measure: 'DELTA', windowSize: 3 })
function patch(value) { emit('update:modelValue', { ...props.modelValue, ...value }) }
function treeHeight(node) { return node.logic ? 1 + Math.max(...node.children.map(treeHeight)) : 1 }
function changeLogic(value) {
  const children = props.modelValue.children
  emit('update:modelValue', { logic: value, children: value === 'NOT' && children.length > 1 ? [{ logic: kind.value, children }] : children })
}
function nestGroup() { patch({ children: [{ logic: 'AND', children: props.modelValue.children }] }) }
function updateChild(index, value) { patch({ children: props.modelValue.children.map((child, i) => i === index ? value : child) }) }
function removeChild(index) { patch({ children: props.modelValue.children.filter((_, i) => i !== index) }) }
function add(group) { patch({ children: [...props.modelValue.children, group ? { logic: 'AND', children: [leaf()] } : leaf()] }) }
</script>

<style scoped>
.warning-condition { min-width: 0; padding: 10px 0; }
.condition-header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.condition-label { font-size: 13px; color: var(--el-text-color-secondary); }
.condition-header > .el-select { width: 175px; max-width: 100%; }
.condition-header > .el-input { width: 150px; max-width: 100%; }
.condition-children { border-left: 2px solid var(--el-border-color); padding-left: 16px; margin: 10px 0 0 8px; min-width: 0; }
.condition-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.leaf-options { display: flex; gap: 12px; align-items: center; margin-top: 10px; font-size: 13px; flex-wrap: wrap; }
.leaf-options .el-select { width: 150px; }
@media(max-width: 600px) { .condition-children { padding-left: 8px; margin-left: 0; } .condition-header > .el-select, .condition-header > .el-input { width: 100%; } }
</style>
