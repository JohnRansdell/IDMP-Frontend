<template>
  <section class="custom-paths" aria-label="自定义业务下钻路径">
    <div class="custom-paths__heading"><strong>自定义下钻路径</strong><el-button :icon="Plus" :disabled="disabled || modelValue.length >= 5" @click="addPath">添加路径</el-button></div>
    <div v-for="path in customPaths" :key="path.pathCode" class="custom-path">
      <div class="custom-path__heading">
        <el-input :model-value="path.pathName" :disabled="disabled" :maxlength="100" aria-label="自定义路径名称" placeholder="路径名称" @update:model-value="value => updatePath(path, { pathName: value })" @keydown.enter.prevent />
        <el-tooltip content="删除路径"><el-button :icon="Delete" :disabled="disabled" aria-label="删除路径" @click="removePath(path)" /></el-tooltip>
      </div>
      <div class="custom-path__root">全院</div>
      <div v-for="(level, index) in businessLevels(path)" :key="level.levelCode" class="custom-level">
        <el-form label-position="top" class="custom-level__fields">
          <el-form-item label="层级名称"><el-input :model-value="level.levelName" :disabled="disabled" aria-label="层级名称" placeholder="如科室、医生" @update:model-value="value => updateLevel(path, level, { levelName: value })" @keydown.enter.prevent /></el-form-item>
          <el-form-item label="维度名称"><el-input :model-value="level.dimensionFieldCode" :disabled="disabled" aria-label="层级维度名称" placeholder="如科室" @update:model-value="value => updateLevel(path, level, { dimensionFieldCode: value.trim().toUpperCase() })" @keydown.enter.prevent /></el-form-item>
          <el-form-item label="成员编码维度（可选）"><el-input :model-value="level.memberKeyFieldCode" :disabled="disabled" aria-label="成员编码维度" @update:model-value="value => updateLevel(path, level, { memberKeyFieldCode: value.trim().toUpperCase() || null })" @keydown.enter.prevent /></el-form-item>
          <el-form-item label="显示名称维度（可选）"><el-input :model-value="level.displayFieldCode" :disabled="disabled" aria-label="显示名称维度" @update:model-value="value => updateLevel(path, level, { displayFieldCode: value.trim().toUpperCase() || null })" @keydown.enter.prevent /></el-form-item>
        </el-form>
        <div class="custom-level__actions">
          <el-tooltip content="上移层级"><el-button :icon="ArrowUp" :disabled="disabled || index === 0" aria-label="上移层级" @click="moveLevel(path, index, -1)" /></el-tooltip>
          <el-tooltip content="下移层级"><el-button :icon="ArrowDown" :disabled="disabled || index === businessLevels(path).length - 1" aria-label="下移层级" @click="moveLevel(path, index, 1)" /></el-tooltip>
          <el-tooltip content="删除层级"><el-button :icon="Delete" :disabled="disabled || businessLevels(path).length === 1" aria-label="删除层级" @click="removeLevel(path, level)" /></el-tooltip>
        </div>
      </div>
      <el-button :icon="Plus" :disabled="disabled || businessLevels(path).length >= 9" @click="addLevel(path)">添加层级</el-button>
    </div>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { Plus, Delete, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { createCustomDrillCode } from '../features/indicator/grouping.js'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const customPaths = computed(() => props.modelValue.filter(path => path.pathCode.startsWith('CUSTOM_')))
const code = createCustomDrillCode
const businessLevels = path => (path.levels || []).filter(level => level.levelCode !== 'ROOT')
function updatePath(path, patch) {
  const next = { ...path, ...patch }
  if (next.levels?.length) next.maxLevel = next.levels.at(-1).levelCode
  delete next.pathVersionId
  emit('update:modelValue', props.modelValue.map(item => item.pathCode === path.pathCode ? next : item))
}
function newLevel() { return { levelCode: code('LEVEL'), levelName: '', dimensionFieldCode: '', memberKeyFieldCode: null, displayFieldCode: null } }
function addPath() {
  const level = newLevel()
  emit('update:modelValue', [...props.modelValue, { pathCode: code('CUSTOM'), pathName: '', maxLevel: level.levelCode, levels: [{ levelCode: 'ROOT', levelName: '全院' }, level] }])
}
function removePath(path) { emit('update:modelValue', props.modelValue.filter(item => item.pathCode !== path.pathCode)) }
function updateLevel(path, level, patch) { updatePath(path, { levels: path.levels.map(item => item.levelCode === level.levelCode ? { ...item, ...patch } : item) }) }
function addLevel(path) { updatePath(path, { levels: [...path.levels, newLevel()] }) }
function removeLevel(path, level) { updatePath(path, { levels: path.levels.filter(item => item.levelCode !== level.levelCode) }) }
function moveLevel(path, index, direction) {
  const levels = [...businessLevels(path)]
  ;[levels[index], levels[index + direction]] = [levels[index + direction], levels[index]]
  updatePath(path, { levels: [path.levels[0], ...levels] })
}
</script>
<style scoped>
.custom-paths { margin: 16px 0; min-width: 0; }
.custom-paths__heading, .custom-path__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.custom-path { border-top: 1px solid var(--idmp-border-subtle); padding: 16px 0; margin-top: 12px; }
.custom-path__heading .el-input { max-width: 420px; }
.custom-path__root { padding: 12px 0; font-size: 14px; }
.custom-level { display: flex; align-items: center; gap: 12px; }
.custom-level__fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; flex: 1; min-width: 0; }
.custom-level__actions { display: flex; gap: 6px; }
.custom-level__actions .el-button { margin: 0; }
@media (max-width: 900px) { .custom-level__fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .custom-level { align-items: stretch; flex-direction: column; margin-bottom: 16px; } .custom-level__fields { grid-template-columns: minmax(0, 1fr); } }
</style>
