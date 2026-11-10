<template>
  <div class="idmp-page">
    <PageHeader title="因子模板管理">

      <template #actions><div class="page-toolbar"><el-button @click="load">刷新</el-button><el-button v-access="'factorTemplate.create'" type="primary" @click="router.push('/factor/templates/new')">新建模板</el-button></div></template>
    </PageHeader>
    <section class="surface-card filter-card template-filter" aria-label="因子模板筛选">
      <el-form v-query-enter :inline="true" @submit.prevent="load">

        <el-form-item><el-input v-model.trim="filters.name" class="filter-name" placeholder="模板名称" clearable /></el-form-item>
        <el-form-item v-if="canManageTemplates"><el-select v-model="filters.publicationStatus" class="filter-select filter-select--small" placeholder="发布状态" clearable><el-option label="草稿" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" native-type="submit">查询</el-button></el-form-item>
      </el-form>
    </section>
    <section class="surface-card table-card"><el-table :aria-busy="loading" :empty-text="loading ? '正在查询…' : '暂无模板'" v-loading="loading" :data="rows" ><el-table-column prop="name" label="模板名称" min-width="260"><template #default="{ row }"><span>{{ row.name }}</span></template></el-table-column><el-table-column prop="factorTypeScope" label="适用因子类型" min-width="140" /><el-table-column label="当前状态" width="120"><template #default="{ row }"><StatusBadge :status="row.publicationStatus || row.status" /></template></el-table-column><el-table-column label="校验状态" width="120"><template #default="{ row }">{{ row.validatedAt ? '已校验' : '-' }}</template></el-table-column><el-table-column prop="updatedAt" label="更新时间" min-width="170" /><el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><el-button v-access="'factorTemplateVersion.instantiate'" v-if="row.currentPublishedVersionId" link type="primary" @click="instantiate(row)">创建因子</el-button><el-button v-access="'factorTemplateVersion.edit'" link @click="open(row)">{{ row.currentPublishedVersionId ? '管理模板' : '管理草稿' }}</el-button></template></el-table-column></el-table></section>
  </div>
</template>
<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/idmp/utils/message'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { fetchAllFactorTemplates as fetchFactorTemplates, fetchFactorTemplateVersions } from '@/idmp/api/modules/factors'
import { computed } from 'vue'
import { canRequest } from '@/idmp/auth/session.js'
const router = useRouter(); const loading = ref(false); const rows = ref([]); const filters = reactive({ name: '', publicationStatus: '' })
const canManageTemplates = computed(() => canRequest('PATCH', '/factor-template-versions/1'))
let listRequest = 0
let disposed = false
async function load() {
  const request = ++listRequest
  const query = { ...filters, publicationStatus: canManageTemplates.value ? filters.publicationStatus : 'PUBLISHED', page: 1, size: 100 }
  const current = () => !disposed && request === listRequest
    && filters.name === query.name && (canManageTemplates.value ? filters.publicationStatus : 'PUBLISHED') === query.publicationStatus
  loading.value = true
  try {
    const result = await fetchFactorTemplates(query)
    if (!current()) return
    rows.value = list(result).filter(row => canManageTemplates.value || row.currentPublishedVersionId)
  } catch (error) {
    if (!current()) return
    rows.value = []
    ElMessage.error(error?.message || '模板目录读取失败')
  } finally { if (!disposed && request === listRequest) loading.value = false }
}
async function open(row) {
  if (!canManageTemplates.value) return
  const templateId = row.id || row.templateId
  if (!templateId) return ElMessage.error('模板读取失败，请刷新后重试')
  try {
    const versions = list(await fetchFactorTemplateVersions(templateId))
    const version = versions.find(item => item.publicationStatus === 'DRAFT')
      || versions.find(item => item.publicationStatus === 'PUBLISHED' && String(item.id || item.versionId) === String(row.currentPublishedVersionId))
      || versions.find(item => item.publicationStatus === 'PUBLISHED')
    if (!version) return ElMessage.info('该模板暂无可管理的草稿或已发布版本')
    router.push(`/factor/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version.id || version.versionId)}`)
  } catch (error) { ElMessage.error(error?.message || '模板版本读取失败') }
}
function instantiate(row) { const templateId = row.id || row.templateId; const versionId = row.currentPublishedVersionId; if (!templateId || !versionId) return ElMessage.error('已发布模板版本读取失败，请刷新后重试'); router.push(`/factor/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/instantiate`) }
function list(value) { return Array.isArray(value) ? value : value?.records || value?.items || value?.list || [] }
onMounted(load)
onBeforeUnmount(() => { disposed = true; ++listRequest })
</script>
<style scoped lang="scss">
.template-filter {
  :deep(.el-form) { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; }
  :deep(.el-form-item) { margin: 0; }
}

.filter-name { width: 200px; }
.filter-select { width: 156px; }
.filter-select--small { width: 112px; }
</style>
