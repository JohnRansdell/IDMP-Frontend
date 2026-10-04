<template>
  <div class="sql-grouping">
    <h3>组合粒度</h3>
    <DimensionGrainEditor :model-value="dimensionGrain" @update:model-value="value => emit('update:dimensionGrain', value)" />
    <h3>业务下钻路径</h3>
    <el-alert v-if="error" type="error" :closable="false" :title="error" />
    <div class="path-actions"><el-button :icon="Refresh" :loading="loading" aria-label="刷新下钻路径" @click="emit('reload')">刷新路径</el-button></div>
    <el-table v-if="catalog.length" :data="catalog" border>
      <el-table-column label="启用" width="70"><template #default="{ row }"><el-checkbox :model-value="isSelected(row)" :aria-label="`启用${row.path.pathName}`" @change="checked => togglePath(row, checked)" /></template></el-table-column>
      <el-table-column label="路径" min-width="180"><template #default="{ row }">{{ row.path.pathName }}</template></el-table-column>
      <el-table-column label="版本" min-width="120"><template #default="{ row }">{{ row.version.versionNo }}</template></el-table-column>
      <el-table-column label="最大层级" min-width="200"><template #default="{ row }"><el-select :model-value="selectedLevel(row)" :disabled="!isSelected(row)" aria-label="下钻最大层级" @update:model-value="value => updateLevel(row, value)"><el-option v-for="level in row.levels" :key="level.levelCode" :label="level.levelName || level.levelCode" :value="level.levelCode" /></el-select></template></el-table-column>
    </el-table>
    <el-empty v-else-if="!loading && !error" description="暂无已发布的业务下钻路径" :image-size="48" />
    <CustomDrillPathEditor :model-value="drillPaths" @update:model-value="value => emit('update:drillPaths', value)" />
    <template v-if="requiredFields.length">
      <h3>因子维度字段映射</h3>
      <div v-for="factor in factors" :key="factor.key" class="factor-bindings">
        <strong>{{ factor.name || factor.key }}</strong>
        <el-form label-position="top" class="binding-grid">
          <el-form-item v-for="code in requiredFields" :key="code" :label="fieldLabels[code] || code" :data-field-code="code">
            <el-select :model-value="factor.dimensionBindings?.[code] || ''" filterable clearable :aria-label="`${factor.name || factor.key} ${fieldLabels[code] || code} 物理字段`" placeholder="选择对应的物理字段" @update:model-value="value => updateBinding(factor, code, value)">
              <el-option v-for="field in optionsFor(factor)" :key="field.fieldReference" :value="field.fieldReference" :label="fieldLabel(field, factor)" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import DimensionGrainEditor from './DimensionGrainEditor.vue'
import CustomDrillPathEditor from './CustomDrillPathEditor.vue'
import { sqlImportGroupingFields, sqlImportGroupingFieldLabels } from '../features/indicator/grouping.js'
import { sqlPhysicalFieldLabel } from '../features/indicator/sqlImportFields.js'
const props = defineProps({ dimensionGrain: { type: Array, default: () => [] }, drillPaths: { type: Array, default: () => [] }, factors: { type: Array, default: () => [] }, drafts: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, loading: Boolean, error: String })
const emit = defineEmits(['update:dimensionGrain', 'update:drillPaths', 'update:factors', 'reload'])
const requiredFields = computed(() => { try { return sqlImportGroupingFields(props.drillPaths, props.dimensionGrain, props.catalog) } catch { return [] } })
const fieldLabels = computed(() => { try { return sqlImportGroupingFieldLabels(props.drillPaths, props.dimensionGrain, props.catalog) } catch { return {} } })
function optionsFor(factor) { return props.drafts.find(draft => draft.key === factor.key)?.dimensionFieldOptions || [] }
function fieldLabel(field, factor) { return sqlPhysicalFieldLabel(field, optionsFor(factor)) }
function isSelected(row) { return props.drillPaths.some(path => String(path.pathVersionId) === String(row.version.id)) }
function selectedLevel(row) { return props.drillPaths.find(path => String(path.pathVersionId) === String(row.version.id))?.maxLevel || '' }
function togglePath(row, checked) {
  const rest = props.drillPaths.filter(path => path.pathCode !== row.path.pathCode)
  emit('update:drillPaths', checked ? [...rest, { pathCode: row.path.pathCode, pathVersionId: String(row.version.id), maxLevel: row.levels.at(-1)?.levelCode || '' }] : rest)
}
function updateLevel(row, maxLevel) { emit('update:drillPaths', props.drillPaths.map(path => String(path.pathVersionId) === String(row.version.id) ? { ...path, maxLevel } : path)) }
function updateBinding(factor, code, value) { emit('update:factors', props.factors.map(item => item.key === factor.key ? { ...item, dimensionBindings: { ...item.dimensionBindings, [code]: value } } : item)) }
</script>
<style scoped>
.sql-grouping { min-width: 0; }
h3 { margin: 18px 0 12px; font-size: 15px; }
.path-actions { margin: 10px 0; }
.factor-bindings { padding: 14px 0; border-bottom: 1px solid var(--idmp-border-subtle); }
.binding-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 12px; }
.binding-grid :deep(.el-select) { width: 100%; }
@media (max-width: 760px) { .binding-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
