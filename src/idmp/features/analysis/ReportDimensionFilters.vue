<template>
  <div class="report-dimension-filters">
    <div v-for="field in controls" :key="field.code" class="report-dimension-field">
      <label :for="`report-dimension-${field.code}`">{{ field.label }}</label>
      <el-select :id="`report-dimension-${field.code}`" :model-value="selected[field.code] || []"
        :aria-label="`筛选${field.label}`" multiple filterable allow-create default-first-option clearable
        collapse-tags collapse-tags-tooltip :max-collapse-tags="2" :multiple-limit="500"
        remote :remote-method="search => load(field, search)" :loading="Boolean(loading[field.code])"
        placeholder="选择或输入取值" @visible-change="visible => visible && load(field)"
        @update:model-value="values => update(field.code, values)">
        <el-option v-for="option in fieldOptions(field.code)" :key="option.value" :value="option.value" :label="option.label" />
      </el-select>
      <span v-if="errors[field.code]" class="dimension-error" role="alert">{{ errors[field.code] }}</span>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { fetchIndicatorGrainOptions } from '../../api/modules/indicators.js'
import { fetchDepartmentDictionary } from '../../api/modules/departments.js'
import { requestJson, getRequestSessionRevision } from '../../api/request'
import { normalizeReportFilters, reportFilterFields } from './reportDimensions.js'
const props = defineProps({ modelValue: { type: Object, default: () => ({}) }, fields: { type: Array, default: () => [] }, indicatorId: [String, Number], versionId: [String, Number] })
const emit = defineEmits(['update:modelValue'])
const selected = computed(() => normalizeReportFilters(props.modelValue, props.fields))
const controls = computed(() => reportFilterFields(props.fields, selected.value))
const options = ref({}), loading = ref({}), errors = ref({})
let generation = 0
const requests = new Map()
function reset() { generation++; requests.clear(); options.value = {}; loading.value = {}; errors.value = {} }
watch(() => [props.versionId, props.fields, getRequestSessionRevision()], reset)
onBeforeUnmount(reset)
onDeactivated(reset)
function update(code, values) { emit('update:modelValue', normalizeReportFilters({ ...selected.value, [code]: values }, props.fields)) }
function fieldOptions(code) {
  return [...new Map([...(selected.value[code] || []).map(value => ({ value, label: value })), ...(options.value[code] || [])].map(item => [item.value, item])).values()]
}
async function load(field, search = '') {
  const scope = generation, session = getRequestSessionRevision(), sequence = (requests.get(field.code) || 0) + 1
  requests.set(field.code, sequence)
  const current = () => generation === scope && requests.get(field.code) === sequence && getRequestSessionRevision() === session
  loading.value[field.code] = true
  errors.value[field.code] = ''
  try {
    let result = []
    if (['DEPARTMENT', 'OUT_DEPT'].includes(field.role)) {
      result = (await fetchDepartmentDictionary()).filter(item => !search || item.name.includes(search) || item.code.includes(search))
        .map(item => ({ value: item.code, label: item.name }))
    } else if (['DOCTOR', 'ATTENDING_DOCTOR'].includes(field.role)) {
      const response = await requestJson(`/meta/doctors?${new URLSearchParams({ search, page: '1', size: '100' })}`)
      result = (response.records || []).map(item => ({ value: item.code, label: `${item.name}（${item.code}）` }))
    } else if (field.grain && props.indicatorId && props.versionId) {
      result = await fetchIndicatorGrainOptions(props.indicatorId, { indicatorVersionId: props.versionId, fieldCode: field.code, search, limit: 100 })
    }
    if (!current()) return
    const retained = (options.value[field.code] || []).filter(item => selected.value[field.code]?.includes(item.value))
    options.value[field.code] = [...new Map([...retained, ...result].map(item => [String(item.value), { value: String(item.value), label: String(item.label ?? item.value) }])).values()]
  } catch (error) {
    if (current()) errors.value[field.code] = error?.message || '候选项加载失败，请重新展开重试'
  } finally { if (current()) loading.value[field.code] = false }
}
watch(() => [props.versionId, props.fields, props.modelValue], () => {
  for (const field of controls.value) {
    if (selected.value[field.code]?.length && !options.value[field.code] && !loading.value[field.code]) void load(field)
  }
}, { immediate: true })
</script>
<style scoped>
.report-dimension-filters { display:contents; }
.report-dimension-field { flex:1 1 190px; max-width:300px; min-width:0; display:grid; gap:6px; }
label { color:var(--idmp-text-helper); font-size:13px; }
.el-select { width:100%; }
.dimension-error { color:var(--idmp-support-error); font-size:12px; overflow-wrap:anywhere; }
@media(max-width:700px) { .report-dimension-field { flex-basis:100%; max-width:100%; } }
</style>
