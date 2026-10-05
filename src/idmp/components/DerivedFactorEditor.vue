<template>
  <section class="surface-card derived-editor" aria-label="复合因子定义">
    <h2>复合因子定义</h2>
    <el-form label-position="top" class="definition-fields">
      <el-form-item label="数据域"><el-select :model-value="modelValue.primaryDomain?.domainCode" filterable :disabled="disabled" @update:model-value="value => update('primaryDomain', { ...modelValue.primaryDomain, domainCode: value })"><el-option v-for="domain in domains" :key="domain.code" :value="domain.code" :label="domain.name || domain.code" /></el-select></el-form-item>
      <el-form-item label="输出分组粒度"><el-select :model-value="modelValue.output?.grain || []" multiple filterable allow-create default-first-option :disabled="disabled" placeholder="不选表示总体" @update:model-value="value => updateOutput('grain', value)"><el-option v-for="grain in grains" :key="grain" :value="grain" :label="grain" /></el-select></el-form-item>
      <el-form-item label="输出量纲"><el-input :model-value="modelValue.output?.dimension" :disabled="disabled" @update:model-value="value => updateOutput('dimension', value)" /></el-form-item>
      <el-form-item label="输出单位"><el-input :model-value="modelValue.output?.unit" :disabled="disabled" @update:model-value="value => updateOutput('unit', value)" /></el-form-item>
    </el-form>
    <div class="formula-heading"><h3>计算公式</h3><el-button :icon="Refresh" size="small" :loading="loading" @click="loadVersions">刷新已发布因子</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <FactorExpressionNode v-loading="loading" :model-value="modelValue.expression" :versions="versions" :disabled="disabled" @update:model-value="value => update('expression', value)" />
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import FactorExpressionNode from './FactorExpressionNode.vue'
import { fetchPublishedFactorVersions } from '@/idmp/api/modules/factors'
import { validateDerivedFactor } from '@/idmp/utils/derivedFactor'
const props = defineProps({ modelValue: { type: Object, required: true }, domains: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const versions = ref([]), loading = ref(false), error = ref('')
const grains = computed(() => [...new Set(versions.value.flatMap(item => item.output?.grain || item.dsl?.output?.grain || []))])
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function updateOutput(key, value) { update('output', { ...props.modelValue.output, [key]: value }) }
async function loadVersions() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try {
    versions.value = await fetchPublishedFactorVersions()
  } catch (e) { error.value = e?.message || '已发布因子加载失败，请重试' }
  finally { loading.value = false }
}
defineExpose({ validate: () => { if (error.value || loading.value) throw new Error('请先完成已发布因子的加载'); return validateDerivedFactor(props.modelValue, versions.value) } })
onMounted(loadVersions)
</script>
<style scoped>
.derived-editor { margin-bottom: 16px; padding: 18px; }
h2 { margin: 0 0 16px; font-size: 16px; } h3 { margin: 0; font-size: 15px; }
.definition-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.definition-fields :deep(.el-select) { width: 100%; }
.formula-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0; }
@media (max-width: 650px) { .definition-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
