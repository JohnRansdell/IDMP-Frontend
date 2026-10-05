<template>
  <section class="surface-card dependency-panel" aria-label="因子依赖关系">
    <div class="dependency-heading"><h2>因子依赖关系</h2><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div>
    <el-radio-group v-model="mode" @change="load"><el-radio-button label="upstream">上游依赖</el-radio-button><el-radio-button label="downstream">下游影响</el-radio-button></el-radio-group>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table v-loading="loading" :data="rows" empty-text="暂无依赖关系">
      <el-table-column prop="factorName" label="因子" min-width="200" />
      <el-table-column prop="factorVersionId" label="版本 ID" min-width="180" />
      <el-table-column label="关系" width="120"><template #default="{row}">{{ relation(row) }}</template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{ row }">{{ getStatusLabel(row.status) }}</template></el-table-column>
      <el-table-column label="操作" width="110"><template #default="{ row }"><el-button link type="primary" @click="open(row)">查看因子</el-button></template></el-table-column>
    </el-table>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { fetchFactorDependencyGraph, fetchFactorImpactAnalysis, fetchFactorVersion } from '@/idmp/api/modules/factors'
import { getStatusLabel } from '@/idmp/design/status'
import { ElMessage } from '@/idmp/utils/message'
const props = defineProps({ versionId: { type: String, required: true }, artifactId: String })
const router = useRouter(), mode = ref('upstream'), graph = ref(null), loading = ref(false), error = ref('')
let sequence = 0
const rows = computed(() => (graph.value?.nodes || []).filter(item => String(item.factorVersionId) !== props.versionId))
function relation(row) {
  const direct = (graph.value?.edges || []).some(edge => mode.value === 'upstream'
    ? String(edge.factorVersionId) === props.versionId && String(edge.dependsOnFactorVersionId) === String(row.factorVersionId)
    : String(edge.dependsOnFactorVersionId) === props.versionId && String(edge.factorVersionId) === String(row.factorVersionId))
  return direct ? '直接依赖' : '间接依赖'
}
async function load() {
  const token = ++sequence; loading.value = true; error.value = ''; graph.value = null
  try {
    const data = await (mode.value === 'upstream' ? fetchFactorDependencyGraph : fetchFactorImpactAnalysis)(props.versionId)
    if (token === sequence) graph.value = data
  } catch (e) { if (token === sequence) error.value = e?.message || '依赖关系加载失败，请重试' }
  finally { if (token === sequence) loading.value = false }
}
async function open(row) {
  try { const version = await fetchFactorVersion(row.factorVersionId); await router.push({ path: `/factor/edit/${version.factorId}`, query: { factorVersionId: String(row.factorVersionId) } }) }
  catch (e) { ElMessage.error(e?.message || '因子版本读取失败') }
}
watch(() => [props.versionId, props.artifactId], load, { immediate: true })
</script>
<style scoped>
.dependency-panel { margin-bottom: 16px; padding: 18px; }
.dependency-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
h2 { margin: 0; font-size: 16px; } .el-radio-group { margin-bottom: 12px; }
</style>
