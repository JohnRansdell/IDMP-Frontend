<template>
  <div class="idmp-page value-set-page">
    <PageHeader title="值集管理">
      <template #meta><span class="data-source-badge is-live">真实接口</span><span class="header-meta">维护指标计算使用的标准枚举和值集版本</span></template>
      <template #actions><el-button :loading="loading" @click="loadValueSets">刷新</el-button><el-button type="primary" @click="router.push({ name: 'ValueSetCreate' })">新建值集</el-button></template>
    </PageHeader>

    <section class="surface-card filter-card value-set-filter" aria-label="值集筛选">
      <el-form :inline="true" @submit.prevent="loadValueSets">
        <el-form-item><el-input v-model="filters.code" class="filter-code" clearable placeholder="值集编码" @keyup.enter="loadValueSets" /></el-form-item>
        <el-form-item><el-input v-model="filters.name" class="filter-name" clearable placeholder="值集名称" @keyup.enter="loadValueSets" /></el-form-item>
        <el-form-item><el-select v-model="filters.status" class="filter-select filter-select--small" clearable placeholder="状态">
          <el-option label="草稿" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" />
        </el-select></el-form-item>
        <el-form-item><el-button type="primary" native-type="submit">查询</el-button></el-form-item>
      </el-form>
    </section>
    <section class="surface-card table-card">
      <StatePanel v-if="loading" type="loading" title="正在加载值集" />
      <StatePanel v-else-if="error" type="error" title="值集加载失败" :description="error" />
      <StatePanel v-else-if="!rows.length" type="empty" title="暂无值集" description="当前筛选条件没有返回值集。" />
      <el-table v-else :data="rows" row-key="id" table-layout="fixed">
        <el-table-column prop="code" label="编码" min-width="240" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="匹配模式" width="150"><template #default="{ row }">{{ matchModeLabel(row.matchMode) || '—' }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="130"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
        <el-table-column prop="currentPublishedVersionId" label="当前发布版本" width="180" show-overflow-tooltip><template #default="{ row }">{{ row.currentPublishedVersionId || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="130" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看版本</el-button></template></el-table-column>
      </el-table>
      <div v-if="pageInfo.total" class="pagination-bar"><span>共 {{ pageInfo.total }} 个</span><el-pagination v-model:current-page="pageInfo.pageNum" :page-size="pageInfo.pageSize" :total="pageInfo.total" layout="prev, pager, next" @current-change="loadValueSets" /></div>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { fetchValueSets } from '@/idmp/api/modules/valueSets'
import { matchModeLabel } from '@/idmp/features/meta'

const router = useRouter()
const filters = reactive({ code: '', name: '', status: '' })
const rows = ref([])
const loading = ref(false)
const error = ref('')
const pageInfo = reactive({ pageNum: 1, pageSize: 20, total: 0 })

async function loadValueSets() {
  loading.value = true
  error.value = ''
  try {
    const data = await fetchValueSets({ ...filters, page: pageInfo.pageNum, size: pageInfo.pageSize })
    rows.value = data?.records || data?.items || []
    pageInfo.total = Number(data?.total || 0)
  } catch (err) {
    error.value = err?.message || '值集加载失败。'
  } finally { loading.value = false }
}

function openDetail(row) { router.push({ name: 'ValueSetDetail', params: { valueSetId: row.id } }) }
onMounted(loadValueSets)
</script>

<style scoped>
.value-set-filter :deep(.el-form) { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 12px; }
.value-set-filter :deep(.el-form-item) { margin: 0; }
.filter-code { width: 140px; }
.filter-name { width: 200px; }
.filter-select { width: 156px; }
.filter-select--small { width: 112px; }
.pagination-bar { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; color: var(--idmp-text-secondary); font-size: 12px; }
</style>
