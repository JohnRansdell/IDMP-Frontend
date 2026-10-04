<template>
  <el-select :model-value="modelValue" filterable remote :remote-method="search" :loading="loading"
    placeholder="搜索已发布政策名称或编码" @update:model-value="$emit('update:modelValue', $event)" @visible-change="value => value && search('')">
    <el-option v-for="item in options" :key="item.id" :value="String(item.id)" :label="`${item.policyFileName} · 版本 ${item.versionNo}`" />
  </el-select>
</template>
<script setup>
import { ref } from 'vue'
import { ElMessage } from '@/idmp/utils/message'
import { fetchPublishedPolicyVersions } from '@/idmp/api/modules/policies'
defineProps({ modelValue: { type: String, default: '' } })
defineEmits(['update:modelValue'])
const options = ref([]), loading = ref(false)
let revision = 0
async function search(name) {
  const current = ++revision
  loading.value = true
  try {
    const result = await fetchPublishedPolicyVersions({ name, size: 50 })
    if (current === revision) options.value = result.records || []
  } catch (error) { if (current === revision) ElMessage.error(error.message) }
  finally { if (current === revision) loading.value = false }
}
</script>
