<template>
  <div class="warning-member-select">
    <el-select :model-value="modelValue" multiple filterable remote :remote-method="searchMembers"
      :loading="loading" :disabled="disabled" :reserve-keyword="false" :debounce="250"
      placeholder="全部成员" :aria-label="`${dimension} 成员`"
      no-data-text="暂无可选成员" @update:model-value="$emit('update:modelValue', $event)">
      <el-option v-for="value in visibleValues" :key="value" :value="value" :label="memberLabel(value)" />
      <template v-if="nextAfter" #footer>
        <el-button link :loading="loading" @click="load(true)">加载更多成员</el-button>
      </template>
    </el-select>
    <div v-if="error" class="member-error" role="alert">
      {{ error }} <el-button link type="primary" :disabled="loading" @click="load()">重试</el-button>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fetchWarningMemberOptions } from '@/idmp/api/modules/warnings'
import { fetchDepartmentNames } from '@/idmp/api/modules/departments'
import { isDepartmentCodeField } from '@/idmp/features/shared/departmentDictionary.js'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, indicatorVersionId: String,
  targetCode: String, dimension: String, disabled: Boolean })
defineEmits(['update:modelValue'])
const values = ref([]), nextAfter = ref(null), loading = ref(false), error = ref(''), search = ref('')
const visibleValues = computed(() => [...new Set([...props.modelValue.map(String), ...values.value])])
const departmentNames = ref(new Map())
const memberLabel = value => isDepartmentCodeField(props.dimension) && departmentNames.value.has(value)
  ? `${departmentNames.value.get(value)}（${value}）` : value
let generation = 0
async function load(more = false) {
  const current = ++generation
  loading.value = true; error.value = ''
  if (!more) { values.value = []; nextAfter.value = null }
  try {
    const page = await fetchWarningMemberOptions({ indicatorVersionId: props.indicatorVersionId,
      targetCode: props.targetCode, dimension: props.dimension, search: search.value,
      after: more ? nextAfter.value : undefined, size: 50 })
    const names = isDepartmentCodeField(props.dimension) ? await fetchDepartmentNames() : null
    if (current !== generation) return
    if (names) departmentNames.value = names
    values.value = more ? [...new Set([...values.value, ...page.values])] : page.values
    nextAfter.value = page.nextAfter
  } catch (failure) {
    if (current === generation) error.value = failure.message || '成员候选读取失败'
  } finally {
    if (current === generation) loading.value = false
  }
}
function searchMembers(query) { search.value = query; load() }
watch(() => [props.indicatorVersionId, props.targetCode, props.dimension], () => {
  generation++; values.value = []; nextAfter.value = null; error.value = ''; search.value = ''; loading.value = false
  if (props.disabled && isDepartmentCodeField(props.dimension)) {
    fetchDepartmentNames().then(names => { departmentNames.value = names }).catch(failure => {
      error.value = failure.message || '科室名称加载失败'
    })
  }
  if (props.indicatorVersionId && props.targetCode && props.dimension && !props.disabled) load()
}, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>
<style scoped>
.warning-member-select { width: 100%; min-width: 0; }
.member-error { font-size: 12px; color: var(--el-color-danger); overflow-wrap: anywhere; }
</style>
