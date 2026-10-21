<template>
  <section class="warning-editor">
    <h3>结果范围</h3>
    <el-radio-group :model-value="scope.mode" :disabled="disabled" @change="changeMode"><el-radio-button value="MAIN">主结果</el-radio-button><el-radio-button value="GROUPED">分组结果</el-radio-button><el-radio-button value="ALL">全部结果</el-radio-button></el-radio-group>
    <template v-if="scope.mode === 'GROUPED'">
      <el-form-item v-if="loading || options.length" label="分组粒度" required>
        <el-select :model-value="selectedOption" :loading="loading" :disabled="disabled || !indicatorVersionId" placeholder="选择组合粒度或下钻层级" @change="selectOption">
          <el-option v-for="option in options" :key="option.targetCode" :value="option.targetCode" :label="`${option.label}（${option.dimensions.join(' × ')}）`" />
        </el-select>
      </el-form-item>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-empty v-else-if="!loading && !options.length" description="该指标尚未配置分组粒度或下钻路径" :image-size="50" />
      <el-form-item v-for="dimension in availableDimensions" :key="dimension" :label="`${dimension} 成员（可选）`">
        <el-select :model-value="scope.members?.[dimension] || []" multiple filterable allow-create default-first-option :disabled="disabled" placeholder="全部成员" @update:model-value="setMembers(dimension, $event)"><el-option v-for="value in scope.members?.[dimension] || []" :key="String(value)" :value="value" :label="String(value)" /></el-select>
      </el-form-item>
    </template>
    <template v-if="showConditions">
      <h3>判定条件</h3>
      <WarningConditionBuilder :model-value="rootCondition" :warning-type="warningType" :disabled="disabled" @update:model-value="$emit('update:condition', $event)" />
      <div class="condition-preview">
        <h4>当前条件</h4>
        <output aria-label="当前条件" aria-live="polite">{{ describeWarningCondition(condition, warningType) }}</output>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import WarningConditionBuilder from './WarningConditionBuilder.vue'
import { fetchWarningScopeOptions } from '@/idmp/api/modules/warnings'
import { describeWarningCondition } from '@/idmp/api/adapters/warning'
const props = defineProps({ condition: { type: Object, required: true }, scope: { type: Object, required: true }, indicatorVersionId: String, warningType: String, disabled: Boolean })
const emit = defineEmits(['update:condition', 'update:scope'])
const options = ref([]), loading = ref(false), error = ref('')
const showConditions = computed(() => props.scope.mode !== 'GROUPED' || (!loading.value && !error.value && options.value.length > 0))
const availableDimensions = computed(() => showConditions.value ? props.scope.dimensions : [])
const rootCondition = computed(() => props.condition.logic ? props.condition : { logic: 'AND', children: [props.condition] })
const selectedOption = computed(() => props.scope.targetCode || '')
watch(() => props.indicatorVersionId, async (id, previous, onCleanup) => {
  let stale = false
  onCleanup(() => { stale = true })
  options.value = []; error.value = ''; loading.value = Boolean(id)
  if (previous && previous !== id && !props.disabled) changeMode('MAIN')
  if (!id) return
  try { const data = await fetchWarningScopeOptions(id); if (!stale) options.value = data }
  catch (failure) { if (!stale) error.value = failure.message || '分组粒度读取失败' }
  finally { if (!stale) loading.value = false }
}, { immediate: true })
function changeMode(mode) { emit('update:scope', { mode, dimensions: [], members: {} }) }
function selectOption(targetCode) { const option = options.value.find(item => item.targetCode === targetCode); if (option) emit('update:scope', { mode: 'GROUPED', targetCode, dimensions: [...option.dimensions], members: {} }) }
function setMembers(dimension, values) { const members = { ...props.scope.members }; if (values.length) members[dimension] = values; else delete members[dimension]; emit('update:scope', { ...props.scope, members }) }
</script>
<style scoped>
.warning-editor { margin: 18px 0; min-width: 0; }
.warning-editor h3 { font-size: 15px; margin: 18px 0 12px; }
.warning-editor .el-radio-group { margin-bottom: 16px; }
.warning-editor :deep(.el-select) { max-width: 100%; }
.condition-preview { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--el-border-color); }
.condition-preview h4 { margin: 0 0 8px; font-size: 13px; color: var(--el-text-color-secondary); font-weight: 500; }
.condition-preview output { display: block; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
