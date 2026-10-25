<template>
  <section class="organization-path" aria-label="组织下钻配置">
    <div class="organization-path__heading">
      <h3>是否启用组织下钻</h3>
      <el-switch :model-value="Boolean(path)" :disabled="disabled" inline-prompt active-text="是" inactive-text="否" aria-label="是否启用组织下钻" @update:model-value="enabled => emit('update:modelValue', setOrganizationEnabled(modelValue, enabled))" />
    </div>
    <el-alert v-if="!path" :title="legacyIsolation ? '当前发布版本沿用历史科室隔离；新版本关闭组织下钻后将不按科室隔离。' : '该指标不会按科室隔离，具有指标读取权限的用户可查看全院结果。'" type="warning" :closable="false" show-icon />
    <template v-else>
      <el-form label-position="top" class="organization-path__depth">
        <el-form-item label="最深下钻层级">
          <el-select :model-value="depth" :disabled="disabled" aria-label="组织下钻最深层级" @update:model-value="value => emit('update:modelValue', setOrganizationDepth(modelValue, value))">
            <el-option label="科室" value="DEPARTMENT" />
            <el-option label="医生" value="ATTENDING_DOCTOR" />
          </el-select>
        </el-form-item>
      </el-form>
      <ol class="organization-path__chain" aria-label="组织下钻链路">
        <li>医院</li><li><el-icon><ArrowRight /></el-icon>科室</li><li v-if="depth === 'ATTENDING_DOCTOR'"><el-icon><ArrowRight /></el-icon>医生</li>
      </ol>
      <el-alert v-if="configurationError" :title="configurationError" type="warning" :closable="false" show-icon />
    </template>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { organizationPath, activeOrganizationLevels, setOrganizationEnabled, setOrganizationDepth, organizationConfigurationError } from '../features/indicator/organizationDrill.js'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, disabled: Boolean, legacyIsolation: Boolean })
const emit = defineEmits(['update:modelValue'])
const path = computed(() => organizationPath(props.modelValue))
const depth = computed(() => activeOrganizationLevels(path.value).length === 3 ? 'ATTENDING_DOCTOR' : 'DEPARTMENT')
const configurationError = computed(() => organizationConfigurationError(props.modelValue))
</script>
<style scoped>
.organization-path { min-width: 0; }
.organization-path__heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
h3 { margin: 0; font-size: 15px; font-weight: 600; }
.organization-path__depth { max-width: 320px; }
.organization-path__depth :deep(.el-select) { width: 100%; }
.organization-path__chain { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; list-style: none; margin: 0 0 16px; padding: 0; font-size: 14px; }
.organization-path__chain li { display: flex; align-items: center; gap: 12px; }
.organization-path__chain .el-icon { color: var(--idmp-text-helper); }
</style>
