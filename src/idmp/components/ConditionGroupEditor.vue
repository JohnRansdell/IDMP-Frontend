<template>
  <div class="rule-group" :class="{ nested: depth > 0 }">
    <div class="rule-group__head"><el-select :model-value="combinationMode" aria-label="条件组合方式" @update:model-value="changeCombination"><el-option label="满足全部（且）" value="AND" /><el-option label="满足任一（或）" value="OR" /><el-option label="不满足全部（非且）" value="NOT_AND" /><el-option label="不满足任一（非或）" value="NOT_OR" /></el-select></div>
    <div v-for="(child, index) in contentNode.children" :key="childKey(child)" class="rule-row">
      <div class="rule-row__head">
        <button type="button" class="rule-toggle" :aria-expanded="isExpanded(child)" :aria-label="`${isExpanded(child) ? '收起' : '展开'}${childLabel(child, index)}`" @click="toggleChild(child)">
          <el-icon class="rule-toggle__arrow" :class="{ expanded: isExpanded(child) }"><ArrowRight /></el-icon>
          <span>{{ childLabel(child, index) }}</span>
          <span v-if="isGroup(child)" class="rule-toggle__count">{{ (child.nodeType === 'NOT' ? child.child : child).children.length }} 项</span>
        </button>
        <el-button link type="danger" :aria-label="`删除${childLabel(child, index)}`" @click="removeChild(index)">{{ isGroup(child) ? '删除条件组' : '删除条件' }}</el-button>
      </div>
      <div v-if="isExpanded(child)" class="rule-row__body" role="region" :aria-label="childLabel(child, index)">
        <FactorPredicateEditor v-if="child.nodeType === 'PREDICATE'" :condition="child" :fields="fields" @update="emitUpdate" />
        <span v-else-if="child.nodeType === 'TRUE'">全部记录</span>
        <ConditionGroupEditor v-else :node="child" :fields="fields" :depth="depth + 1" @update="emitUpdate" />
      </div>
    </div>
    <div class="rule-actions"><el-button link type="primary" @click="addPredicate">添加条件</el-button><el-button link :disabled="depth >= 10" @click="addGroup">添加条件组</el-button></div>
  </div>
</template>
<script setup>
import { computed, shallowRef } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import FactorPredicateEditor from './FactorPredicateEditor.vue'
defineOptions({ name: 'ConditionGroupEditor' })
const props = defineProps({ node: { type: Object, required: true }, fields: { type: Array, default: () => [] }, depth: { type: Number, default: 0 } })
const emit = defineEmits(['update'])
const contentNode = computed(() => props.node.nodeType === 'NOT' ? props.node.child : props.node)
const combinationMode = computed(() => props.node.nodeType === 'NOT' ? `NOT_${contentNode.value.nodeType}` : props.node.nodeType)
const expandedChildren = shallowRef(new Set())
const childKeys = new WeakMap()
let nextChildKey = 0
function childKey(child) {
  if (!childKeys.has(child)) childKeys.set(child, ++nextChildKey)
  return childKeys.get(child)
}
const isGroup = child => !['PREDICATE', 'TRUE'].includes(child.nodeType)
const childLabel = (child, index) => `${isGroup(child) ? '条件组' : '条件'} ${index + 1}`
const isExpanded = child => expandedChildren.value.has(child)
function toggleChild(child) {
  const expanded = new Set(expandedChildren.value)
  if (expanded.has(child)) expanded.delete(child)
  else expanded.add(child)
  expandedChildren.value = expanded
}
const id = () => `rule-${Date.now()}-${Math.random()}`
const predicate = () => ({ id: id(), nodeType: 'PREDICATE', fieldCode: '', operator: 'EQ', value: '', itemCodes: [] })
const group = () => ({ id: id(), nodeType: 'AND', children: [predicate()] })
function emitUpdate() { emit('update') }
function changeCombination(mode) {
  const children = contentNode.value.children
  if (mode.startsWith('NOT_')) {
    props.node.nodeType = 'NOT'
    props.node.child = { nodeType: mode.slice(4), children }
    delete props.node.children
  } else {
    props.node.nodeType = mode
    props.node.children = children
    delete props.node.child
  }
  emitUpdate()
}
function addPredicate() { contentNode.value.children.push(predicate()); emitUpdate() }
function addGroup() { contentNode.value.children.push(group()); emitUpdate() }
function removeChild(index) {
  const child = contentNode.value.children[index]
  if (isExpanded(child)) toggleChild(child)
  contentNode.value.children.splice(index, 1)
  emitUpdate()
}
</script>
<style scoped>
.rule-group{width:100%;min-width:0;padding:12px 0}.rule-group.nested{padding:0}.rule-group__head,.rule-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.rule-group__head{margin-bottom:8px}.rule-group__head>.el-select{width:200px;max-width:100%}.rule-row{border-top:1px solid #edf0f3}.rule-row__head{display:flex;align-items:center;gap:12px;min-height:40px}.rule-row__head>.el-button{flex-shrink:0;margin-left:0}.rule-toggle{display:flex;align-items:center;gap:8px;flex:1;min-width:0;min-height:36px;padding:6px 4px;border:0;border-radius:4px;background:transparent;color:#303b49;font:inherit;font-size:13px;text-align:left;cursor:pointer}.rule-toggle:hover{background:#f4f7fa}.rule-toggle:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:1px}.rule-toggle__arrow{flex-shrink:0;font-size:12px;color:#748193}.rule-toggle__arrow.expanded{transform:rotate(90deg)}.rule-toggle__count{color:#87919f;font-size:12px}.rule-row__body{min-width:0;margin:0 0 10px 9px;padding:8px 0 8px 14px;border-left:1px solid #dce3e9}.rule-actions{margin-top:8px}.rule-actions .el-button+.el-button{margin-left:0}
</style>
