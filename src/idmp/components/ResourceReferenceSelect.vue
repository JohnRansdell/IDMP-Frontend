<template>
  <IndicatorVersionPicker v-if="kind === 'INDICATOR_VERSION' && !multiple" :model-value="modelValue" :options="indicatorVersions" :loading="loading" @refresh="load" @update:model-value="value => emit('update:modelValue', value)" />
  <el-select v-else default-first-option :model-value="modelValue" :multiple="multiple" filterable clearable :loading="loading" :placeholder="placeholder" :aria-label="placeholder" @visible-change="visible => visible && load()" @update:model-value="value => emit('update:modelValue', value)">
    <el-option v-for="item in options" :key="item.value" :value="item.value" :label="item.label" />
    <el-option v-for="value in unresolved" :key="value" :value="value" label="所选记录暂不可用" disabled />
  </el-select>
  <span v-if="error" role="alert" class="reference-error">{{ error }} <el-button link type="primary" @click="load">重试</el-button></span>
</template>

<script setup>
import IndicatorVersionPicker from '@/idmp/components/IndicatorVersionPicker.vue'
import { computed, ref, watch } from 'vue'
import { fetchAllIndicatorVersions } from '@/idmp/api/modules/indicators'
import { fetchAllScenarios, fetchScenarioVersions } from '@/idmp/api/modules/scenarios'
import { fetchWarningRules } from '@/idmp/api/modules/warnings'
import { fetchAllPages } from '@/idmp/api/pagination.js'
import { referenceOptions } from '@/idmp/utils/resourceReference.js'
import { toUserMessage } from '@/idmp/utils/userMessage.js'

const props = defineProps({ modelValue: [String, Array], kind: { type: String, required: true }, multiple: Boolean, placeholder: { type: String, default: '请选择' } })
const emit = defineEmits(['update:modelValue'])
const options = ref([]), loading = ref(false), error = ref(''), loaded = ref(false)
const indicatorVersions = ref([])
const unresolved = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : props.modelValue ? [props.modelValue] : []).filter(value => !options.value.some(item => item.value === String(value))))
async function load() {
  if (loading.value || loaded.value) return
  loading.value = true; error.value = ''
  try {
    let records
    if (props.kind === 'INDICATOR_VERSION') records = await fetchAllIndicatorVersions({ publicationStatus: 'PUBLISHED', size: 200 })
    else if (props.kind === 'RULE') records = await fetchAllPages(fetchWarningRules, { size: 200 })
    else {
      records = []
      const scenarios = await fetchAllScenarios({ size: 100 })
      for (const scenario of scenarios) {
        const result = await fetchScenarioVersions(scenario.id)
        const versions = Array.isArray(result) ? result : result.items || result.records || []
        records.push(...versions.filter(version => (version.publicationStatus || version.status) === 'PUBLISHED').map(version => ({ ...version, scenarioName: scenario.name })))
      }
    }
    if (props.kind === 'INDICATOR_VERSION') indicatorVersions.value = records
    options.value = referenceOptions(records, props.kind); loaded.value = true
  } catch (cause) { error.value = toUserMessage(cause, '选项加载失败，请重试。') }
  finally { loading.value = false }
}
watch(() => props.modelValue, value => { if (Array.isArray(value) ? value.length : value) load() }, { immediate: true })
</script>

<style scoped>
.reference-error { color:var(--el-color-danger); font-size:12px; overflow-wrap:anywhere; }
</style>
