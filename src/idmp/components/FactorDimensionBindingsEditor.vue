<template>
  <section v-if="fields.length" class="bindings" aria-label="逐因子维度字段映射">
    <h3>因子维度字段映射</h3>
    <el-alert v-if="!factors.length" type="info" :closable="false" title="尚未选择因子" />
    <el-alert v-else-if="error" type="error" :closable="false" :title="error" class="bindings__status">
      <el-button :disabled="disabled" @click="emit('retry')">重新加载</el-button>
    </el-alert>
    <div v-else-if="loading" class="bindings__status" role="status">正在加载物理字段</div>
    <div v-for="factor in factors" :key="factor.versionId" class="bindings__factor">
      <strong>{{ factor.name || factor.factorName || factor.versionId }}</strong>
      <el-form label-position="top" class="bindings__fields">
        <el-form-item v-for="field in fields" :key="field" :label="field">
          <div class="bindings__selectors">
            <el-select class="bindings__table-select" :model-value="selectedTable(factor.versionId, field)" filterable clearable :loading="loading" :disabled="disabled || loading || Boolean(error)" :aria-label="`${factor.name || factor.versionId} ${field}物理表`" placeholder="选择物理表" no-data-text="该因子暂无可选物理表" @update:model-value="value => selectTable(factor.versionId, field, value)">
              <el-option v-for="table in tablesFor(factor.versionId)" :key="table.key" :value="table.key" :label="table.label" />
            </el-select>
            <el-select class="bindings__field-select" :model-value="modelValue[factor.versionId]?.[field] || ''" filterable clearable :loading="loading" :disabled="disabled || loading || Boolean(error) || !selectedTable(factor.versionId, field)" :aria-label="`${factor.name || factor.versionId} ${field}物理字段`" :placeholder="selectedTable(factor.versionId, field) ? '选择物理字段' : '先选择物理表'" no-data-text="该物理表暂无可选字段" @update:model-value="value => update(factor.versionId, field, value)">
              <el-option v-for="option in fieldsFor(factor.versionId, field)" :key="option.fieldReference" :value="option.fieldReference" :label="option.columnName || option.fieldReference" />
            </el-select>
          </div>
        </el-form-item>
      </el-form>
    </div>
  </section>
</template>
<script setup>
import { computed, reactive, watch } from 'vue'
import { dimensionFieldTableGroups, dimensionFieldTableKey } from '../utils/dimensionFieldOptions.js'
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, fields: { type: Array, default: () => [] }, factors: { type: Array, default: () => [] }, fieldOptions: { type: Array, default: () => [] }, disabled: Boolean, loading: Boolean, error: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'retry'])
const tableSelections = reactive(new Map())
const tableGroups = computed(() => new Map(props.fieldOptions.map(item => [String(item.factorVersionId), dimensionFieldTableGroups(item)])))
const selectionKey = (id, field) => JSON.stringify([String(id), field])
const tablesFor = id => tableGroups.value.get(String(id)) || []
function selectedTable(id, field) {
  const tables = tablesFor(id)
  const boundTable = dimensionFieldTableKey(tables, props.modelValue[id]?.[field])
  if (boundTable) return boundTable
  const key = selectionKey(id, field)
  if (tableSelections.has(key)) {
    const selected = tableSelections.get(key)
    return tables.some(table => table.key === selected) ? selected : ''
  }
  return tables.length === 1 ? tables[0].key : ''
}
function fieldsFor(id, field) {
  return tablesFor(id).find(table => table.key === selectedTable(id, field))?.fields || []
}
function selectTable(id, field, value) {
  tableSelections.set(selectionKey(id, field), value)
  const bound = props.modelValue[id]?.[field]
  if (bound && dimensionFieldTableKey(tablesFor(id), bound) !== value) update(id, field, '', value)
}
watch(() => props.factors.flatMap(factor => props.fields.map(field => selectionKey(factor.versionId, field))), keys => {
  const active = new Set(keys)
  for (const key of tableSelections.keys()) if (!active.has(key)) tableSelections.delete(key)
})
function update(id, field, value, table = selectedTable(id, field)) {
  tableSelections.set(selectionKey(id, field), table)
  const bindings = { ...props.modelValue[id], [field]: value }
  if (!value) delete bindings[field]
  emit('update:modelValue', { ...props.modelValue, [id]: bindings })
}
</script>
<style scoped>
h3 { font-size: 15px; margin: 16px 0 12px; }
.bindings__status { margin-bottom: 12px; font-size: 14px; color: var(--idmp-text-secondary); }
.bindings__factor { border-top: 1px solid var(--idmp-border-subtle); padding: 14px 0; }
.bindings__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
.bindings__selectors { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; width: 100%; }
.bindings__fields :deep(.el-select) { width: 100%; }
@media (max-width: 650px) { .bindings__fields { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 420px) { .bindings__selectors { grid-template-columns: minmax(0, 1fr); } }
</style>
