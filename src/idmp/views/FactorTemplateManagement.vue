<template>
  <div class="idmp-page">
    <PageHeader title="因子模板管理" status="ENABLED" status-label="后端模板生命周期接口">
      <template #meta><span class="header-meta">模板、版本、校验、发布及实例化均直接调用 M1A 接口</span></template>
      <template #actions><div class="page-toolbar"><el-button @click="load">刷新</el-button><el-button v-if="canManageTemplates" type="primary" @click="router.push('/factor/templates/new')">新建模板</el-button></div></template>
    </PageHeader>
    <section class="surface-card filter-card template-filter" aria-label="因子模板筛选">
      <el-form :inline="true" @submit.prevent="load">
        <el-form-item><el-input v-model.trim="filters.code" class="filter-code" placeholder="模板编码" clearable /></el-form-item>
        <el-form-item><el-input v-model.trim="filters.name" class="filter-name" placeholder="模板名称" clearable /></el-form-item>
        <el-form-item><el-select v-model="filters.publicationStatus" class="filter-select filter-select--small" placeholder="发布状态" clearable><el-option label="草稿" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" native-type="submit">查询</el-button></el-form-item>
      </el-form>
    </section>
    <section class="surface-card table-card"><el-table v-loading="loading" :data="rows" empty-text="暂无模板"><el-table-column prop="code" label="模板编码" min-width="180" /><el-table-column prop="name" label="模板名称" min-width="180" /><el-table-column prop="factorTypeScope" label="适用因子类型" min-width="140" /><el-table-column label="当前状态" width="120"><template #default="{ row }"><StatusBadge :status="row.publicationStatus || row.status" /></template></el-table-column><el-table-column label="校验状态" width="120"><template #default="{ row }">{{ row.validatedAt ? '已校验' : '-' }}</template></el-table-column><el-table-column prop="updatedAt" label="更新时间" min-width="170" /><el-table-column label="操作" width="200" fixed="right"><template #default="{ row }"><el-button v-if="row.currentPublishedVersionId" link type="primary" @click="instantiate(row)">创建因子</el-button><el-button link @click="open(row)">{{ row.currentPublishedVersionId ? '管理模板' : '管理草稿' }}</el-button></template></el-table-column></el-table></section>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { fetchFactorTemplates, fetchFactorTemplateVersions } from '@/idmp/api/modules/factors'
import { computed } from 'vue'
const router = useRouter(); const loading = ref(false); const rows = ref([]); const filters = reactive({ code: '', name: '', publicationStatus: '' })
// 当前为产品演示环境：开放模板生命周期入口，服务端仍负责最终权限校验。
const canManageTemplates = computed(() => true)
async function load() { loading.value = true; try { const result = await fetchFactorTemplates({ ...filters, page: 1, size: 100 }); rows.value = list(result) } catch (error) { rows.value = []; ElMessage.error(error?.message || '模板目录读取失败') } finally { loading.value = false } }
async function open(row) { const templateId = row.id || row.templateId; if (!templateId) return ElMessage.error('接口未返回模板 ID'); try { const versions = list(await fetchFactorTemplateVersions(templateId)); const version = canManageTemplates.value ? versions.find(item => item.publicationStatus !== 'PUBLISHED') || versions[0] : versions.find(item => item.publicationStatus === 'PUBLISHED'); if (!version) return ElMessage.info(canManageTemplates.value ? '该模板尚无版本，请先创建首个草稿' : '该模板尚未发布，暂不能用于创建因子'); router.push(`/factor/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(version.id || version.versionId)}`) } catch (error) { ElMessage.error(error?.message || '模板版本读取失败') } }
function instantiate(row) { const templateId = row.id || row.templateId; const versionId = row.currentPublishedVersionId; if (!templateId || !versionId) return ElMessage.error('接口未返回已发布模板版本 ID'); router.push(`/factor/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}/instantiate`) }
function list(value) { return Array.isArray(value) ? value : value?.records || value?.items || value?.list || [] }
onMounted(load)
</script>
<style scoped lang="scss">
.template-filter {
  :deep(.el-form) { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; }
  :deep(.el-form-item) { margin: 0; }
}
.filter-code { width: 140px; }
.filter-name { width: 200px; }
.filter-select { width: 156px; }
.filter-select--small { width: 112px; }
</style>
