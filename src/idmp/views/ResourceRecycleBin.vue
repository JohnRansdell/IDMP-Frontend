<template>
  <div class="idmp-page recycle-bin-page">
    <PageHeader :title="`${resourceLabel}回收站`">
      <template #meta><span>仅展示已软删除且未归档的资源</span></template>
      <template #actions><el-button @click="router.back()">返回{{ resourceLabel }}管理</el-button></template>
    </PageHeader>
    <section class="surface-card filter-card">
      <el-form :inline="true" @submit.prevent="load">
        <el-form-item><el-input v-model.trim="filters.code" placeholder="编码" clearable /></el-form-item>
        <el-form-item><el-input v-model.trim="filters.name" placeholder="名称" clearable /></el-form-item>
        <el-form-item><el-button type="primary" native-type="submit">查询</el-button></el-form-item>
      </el-form>
    </section>
    <section class="surface-card">
      <el-table :data="records" v-loading="loading" empty-text="回收站为空">
        <el-table-column prop="resourceCode" label="编码" min-width="160" />
        <el-table-column prop="resourceName" label="名称" min-width="180" />
        <el-table-column label="删除前状态" width="120"><template #default="{ row }">{{ row.status ? getStatusLabel(row.status) : '-' }}</template></el-table-column>
        <el-table-column prop="deletedByName" label="删除人" width="120" />
        <el-table-column prop="deletedAt" label="删除时间" min-width="180" />
        <el-table-column prop="deleteReason" label="删除原因" min-width="220" show-overflow-tooltip />
        <el-table-column prop="versionCount" label="保留版本" width="90" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="showDetail(row)">详情</el-button><el-button link type="success" :loading="restoringId === row.resourceId" @click="restore(row)">恢复</el-button></template>
        </el-table-column>
      </el-table>
      <div class="pagination-row"><span>共 {{ total }} 条</span><el-pagination v-model:current-page="page" v-model:page-size="size" layout="prev, pager, next, sizes" :page-sizes="[10, 20, 50]" :total="total" @current-change="load" @size-change="load" /></div>
    </section>
    <el-drawer v-model="detailVisible" :title="`${resourceLabel}回收站详情`" size="520px">
      <template v-if="detail">
        <el-descriptions :column="1" border><el-descriptions-item label="编码">{{ detail.resource.resourceCode }}</el-descriptions-item><el-descriptions-item label="名称">{{ detail.resource.resourceName }}</el-descriptions-item><el-descriptions-item label="删除人">{{ detail.resource.deletedByName || detail.resource.deletedBy || '-' }}</el-descriptions-item><el-descriptions-item label="删除原因">{{ detail.resource.deleteReason }}</el-descriptions-item><el-descriptions-item label="删除时间">{{ detail.resource.deletedAt }}</el-descriptions-item></el-descriptions>
        <h3>保留版本</h3><el-table :data="detail.versions || []"><el-table-column prop="versionNo" label="版本" /><el-table-column label="状态"><template #default="{ row }">{{ row.status ? getStatusLabel(row.status) : '-' }}</template></el-table-column><el-table-column prop="createdAt" label="创建时间" /></el-table>
        <el-button class="restore-button" type="success" :loading="restoringId === detail.resource.resourceId" @click="restore(detail.resource)">恢复此资源</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { getStatusLabel } from '@/idmp/design/status'
import { formatApiError } from '@/idmp/utils/apiError'
import { fetchFactorRecycleBin, fetchFactorRecycleDetail, restoreFactor } from '@/idmp/api/modules/factors'
import { fetchIndicatorRecycleBin, fetchIndicatorRecycleDetail, restoreIndicator } from '@/idmp/api/modules/indicators'

const route = useRoute(); const router = useRouter()
const isFactor = computed(() => route.meta.resourceType === 'FACTOR')
const resourceLabel = computed(() => isFactor.value ? '因子' : '指标')
const filters = reactive({ code: '', name: '' }); const records = ref([]); const total = ref(0); const page = ref(1); const size = ref(20); const loading = ref(false); const restoringId = ref(''); const detail = ref(null); const detailVisible = ref(false)
const api = computed(() => isFactor.value ? { list: fetchFactorRecycleBin, detail: fetchFactorRecycleDetail, restore: restoreFactor } : { list: fetchIndicatorRecycleBin, detail: fetchIndicatorRecycleDetail, restore: restoreIndicator })
async function load() { loading.value = true; try { const result = await api.value.list({ ...filters, page: page.value, size: size.value }); records.value = result?.records || []; total.value = Number(result?.total || 0) } catch (error) { ElMessage.error(formatApiError(error, '回收站加载失败')) } finally { loading.value = false } }
async function showDetail(row) { try { detail.value = await api.value.detail(row.resourceId); detailVisible.value = true } catch (error) { ElMessage.error(formatApiError(error, '回收站详情加载失败')) } }
async function restore(row) { try { await ElMessageBox.confirm(`确认恢复${resourceLabel.value}“${row.resourceName}”吗？`, '恢复确认', { type: 'warning' }); restoringId.value = row.resourceId; await api.value.restore(row.resourceId, row.resourceVersion); ElMessage.success(`${resourceLabel.value}已恢复`); detailVisible.value = false; await load() } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(formatApiError(error, '恢复失败，请重新打开详情后重试')) } finally { restoringId.value = '' } }
onMounted(load)
</script>

<style scoped>
.recycle-bin-page .filter-card { margin-bottom: 16px; }
.pagination-row {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 16px;
  gap: 16px;
}

.pagination-row > span {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
}

.pagination-row :deep(.el-pagination) {
  flex: 0 1 auto;
  min-width: 0;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .pagination-row {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .pagination-row > span {
    flex-basis: 100%;
  }
}

.restore-button { margin-top: 20px; }
</style>
