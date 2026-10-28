<template>
  <form v-query-enter @submit.prevent="queries++">
    <section><label>字段</label><SemanticFieldSelector v-model="field" :fields="fields" /><output id="field">{{ field }}</output></section>
    <section><label>多选</label><el-select v-model="multiple" multiple filterable default-first-option aria-label="多选科室"><el-option v-for="option in options" :key="option.value" v-bind="option" /></el-select><output id="multiple">{{ JSON.stringify(multiple) }}</output></section>
    <section><label>远程</label><el-select v-model="remote" filterable remote default-first-option :remote-method="search" :loading="loading" aria-label="远程科室"><el-option v-for="option in remoteOptions" :key="option.value" v-bind="option" /></el-select><output id="remote">{{ remote }}</output><output id="remote-query">{{ completedQuery }}</output></section>
    <section><label>虚拟列表</label><el-select-v2 v-model="virtual" filterable default-first-option :options="options" aria-label="虚拟科室" /><output id="virtual">{{ virtual }}</output></section>
    <section><label>分类</label><SearchableCascader v-model="category" :options="categories" aria-label="指标分类" /><output id="category">{{ JSON.stringify(category) }}</output></section>
    <button type="submit">查询</button><output id="queries">{{ queries }}</output>
  </form>
</template>
<script setup>
import { ref } from 'vue'
import SemanticFieldSelector from '/src/idmp/components/SemanticFieldSelector.vue'
import SearchableCascader from '/src/idmp/components/SearchableCascader.vue'
const field = ref(''), multiple = ref([]), remote = ref(''), virtual = ref(''), category = ref([]), queries = ref(0)
const fields = [{ code: 'DEPT', label: '科室编码' }, { code: 'DEPT_NAME', label: '科室名称' }, { code: 'DOCTOR', label: '医生编码' }]
const options = [{ value: 'disabled', label: '科室停用', disabled: true }, { value: '1', label: '科室一' }, { value: '2', label: '科室二' }, { value: '3', label: '科室三' }]
const remoteOptions = ref([]), loading = ref(false)
const completedQuery = ref('')
let generation = 0
async function search(query) {
  const current = ++generation
  loading.value = true
  completedQuery.value = ''
  await new Promise(resolve => setTimeout(resolve, 100))
  if (current !== generation) return
  remoteOptions.value = options.filter(option => option.label.includes(query))
  loading.value = false
  completedQuery.value = `${current}:${query}`
}
const categories = [{ value: 'quality', label: '医疗质量', children: [{ value: 'disabled', label: '质量停用', disabled: true }, { value: 'inpatient', label: '住院质量' }, { value: 'surgery', label: '手术质量' }, { value: 'emergency', label: '急诊质量' }] }]
</script>
<style scoped>
form { max-width: 600px; padding: 32px; }
section { display: grid; gap: 8px; margin-bottom: 20px; }
output { min-height: 24px; }
</style>
