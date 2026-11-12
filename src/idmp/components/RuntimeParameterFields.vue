<template>
  <div class="runtime-parameter-fields">
    <div v-for="parameter in declarations" :key="parameter.code" class="runtime-parameter-field">
      <label>
        <span :title="runtimeParameterLabel(parameter)">{{ runtimeParameterLabel(parameter) }}<em v-if="parameter.required">*</em></span>
        <small v-if="showMetadata">{{ typeLabel(parameter.type) }} · {{ parameter.parameterMode === 'TEMPORARY' ? '临时重算' : '结果维度' }}</small>
      </label>
      <template v-if="isDepartmentParameter(parameter)">
        <el-select :model-value="modelValue[parameter.code]" :aria-label="runtimeParameterLabel(parameter)"
          filterable clearable default-first-option :loading="departmentLoading" placeholder="请选择科室"
          @visible-change="visible => visible && loadDepartments()" @update:model-value="value => updateValue(parameter.code, value)">
          <el-option v-for="department in departmentOptions(parameter.code)" :key="department.code" :value="department.code" :label="department.name">
            <span>{{ department.name }}</span><small class="department-option-code">{{ department.code }}</small>
          </el-option>
        </el-select>
        <span v-if="departmentError" class="department-error" role="alert">{{ departmentError }}</span>
      </template>
      <el-select v-else-if="parameter.type === 'BOOLEAN'" :model-value="modelValue[parameter.code]" clearable placeholder="请选择" @update:model-value="value => updateValue(parameter.code, value)"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select>
      <el-input-number v-else-if="parameter.type === 'INTEGER'" :model-value="modelValue[parameter.code]" :precision="0" :controls="false" placeholder="请输入整数" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-input-number v-else-if="parameter.type === 'DECIMAL'" :model-value="modelValue[parameter.code]" :controls="false" placeholder="请输入数值" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-date-picker v-else-if="parameter.type === 'DATE'" :model-value="modelValue[parameter.code]" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-date-picker v-else-if="parameter.type === 'DATETIME'" :model-value="modelValue[parameter.code]" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" placeholder="选择日期时间" @update:model-value="value => updateValue(parameter.code, value)" />
      <el-input v-else :model-value="modelValue[parameter.code]" clearable :placeholder="parameter.code.toLowerCase().includes('dept') ? '输入单个科室编码' : '请输入参数值'" @update:model-value="value => updateValue(parameter.code, value)" />
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { fetchDepartmentDictionary } from '@/idmp/api/modules/departments.js'
import { getRequestSessionRevision } from '@/idmp/api/request'
import { runtimeParameterLabel } from '@/idmp/utils/runtimeParameterLabel.js'
const props = defineProps({
  declarations: { type: Array, default: () => [] },
  modelValue: { type: Object, default: () => ({}) },
  showMetadata: { type: Boolean, default: true },
  departmentParameterCodes: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'change'])
const departments = ref([])
const departmentLoading = ref(false)
const departmentError = ref('')
let departmentGeneration = 0
function isDepartmentParameter(parameter) {
  return parameter.type === 'STRING' && props.departmentParameterCodes.includes(parameter.code)
}
function departmentOptions(code) {
  const selected = props.modelValue[code]
  if (selected == null || selected === '' || departments.value.some(item => item.code === selected)) return departments.value
  // Retain a saved code even when it no longer exists in the current dictionary.
  return [{ code: String(selected), name: String(selected) }, ...departments.value]
}
function resetDepartments() {
  departmentGeneration++
  departments.value = []
  departmentLoading.value = false
  departmentError.value = ''
}
async function loadDepartments() {
  const generation = ++departmentGeneration
  const session = getRequestSessionRevision()
  const current = () => generation === departmentGeneration && session === getRequestSessionRevision()
  departments.value = []
  departmentLoading.value = true
  departmentError.value = ''
  try {
    const rows = await fetchDepartmentDictionary()
    if (current()) departments.value = rows
  } catch (error) {
    if (current()) departmentError.value = error?.message || '科室加载失败，请重新展开下拉框重试'
  } finally {
    if (generation === departmentGeneration) departmentLoading.value = false
  }
}
watch([() => props.declarations, () => props.departmentParameterCodes.join('|')], resetDepartments)
watch([() => props.declarations, () => props.departmentParameterCodes.join('|'), () => props.modelValue], () => {
  if (!departmentLoading.value && !departments.value.length && props.declarations.some(parameter =>
    isDepartmentParameter(parameter) && props.modelValue[parameter.code] != null && props.modelValue[parameter.code] !== '')) void loadDepartments()
}, { immediate: true })
onBeforeUnmount(resetDepartments)
onDeactivated(resetDepartments)
function updateValue(code, value) {
  const next = { ...props.modelValue, [code]: value }
  emit('update:modelValue', next)
  emit('change', next)
}
function typeLabel(type) { return ({ STRING: '文本', INTEGER: '整数', DECIMAL: '小数', BOOLEAN: '布尔', DATE: '日期', DATETIME: '日期时间' })[type] || type }
</script>

<style scoped lang="scss">
.runtime-parameter-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--idmp-space-4) var(--idmp-space-5);
}

.runtime-parameter-field {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: var(--idmp-space-2);
}

.runtime-parameter-field label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--idmp-space-2);
  min-height: 20px;
  min-width: 0;
  flex-wrap: wrap;
  line-height: 20px;
}

.runtime-parameter-field label span {
  color: var(--idmp-text-helper);
  font-size: 13px;
  font-weight: 400;
  overflow-wrap: anywhere;
}

.runtime-parameter-field label small {
  color: var(--idmp-text-helper);
  white-space: nowrap;
}

.runtime-parameter-field em {
  color: var(--el-color-danger);
  font-style: normal;
}

.runtime-parameter-field :deep(.el-select),
.runtime-parameter-field :deep(.el-input),
.runtime-parameter-field :deep(.el-input-number),
.runtime-parameter-field :deep(.el-date-editor) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.department-option-code { margin-left: 12px; color: var(--idmp-text-helper); }
.department-error { color: var(--idmp-support-error); font-size: 12px; overflow-wrap: anywhere; }
</style>
