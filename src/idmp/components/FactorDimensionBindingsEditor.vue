<template>
  <section v-if="fields.length" class="bindings" aria-label="逐因子维度字段映射">
    <h3>因子维度字段映射</h3>
    <div v-for="factor in factors" :key="factor.versionId" class="bindings__factor">
      <strong>{{ factor.name || factor.factorName || factor.versionId }}</strong>
      <el-form label-position="top" class="bindings__fields">
        <el-form-item v-for="field in fields" :key="field" :label="field">
          <el-select :model-value="modelValue[factor.versionId]?.[field] || ''" filterable clearable :disabled="disabled" :aria-label="`${factor.name || factor.versionId} ${field}物理字段`" placeholder="选择对应的物理字段" @update:model-value="value => update(factor.versionId, field, value)">
            <el-option v-for="option in optionsFor(factor.versionId)" :key="option.fieldReference || option.fieldCode" :value="option.fieldReference || option.fieldCode" :label="`${option.tableName || ''}.${option.columnName} (${option.fieldReference || option.fieldCode})`" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
  </section>
</template>
<script setup>
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, fields: { type: Array, default: () => [] }, factors: { type: Array, default: () => [] }, fieldOptions: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
function optionsFor(id) { return props.fieldOptions.find(item => String(item.factorVersionId) === String(id))?.fields || [] }
function update(id, field, value) {
  const bindings = { ...props.modelValue[id], [field]: value }
  if (!value) delete bindings[field]
  emit('update:modelValue', { ...props.modelValue, [id]: bindings })
}
</script>
<style scoped>
h3 { font-size: 15px; margin: 16px 0 12px; }
.bindings__factor { border-top: 1px solid var(--idmp-border-subtle); padding: 14px 0; }
.bindings__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.bindings__fields :deep(.el-select) { width: 100%; }
@media (max-width: 650px) { .bindings__fields { grid-template-columns: minmax(0, 1fr); } }
</style>
