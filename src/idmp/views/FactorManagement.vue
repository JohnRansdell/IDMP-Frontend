<template>
  <div class="idmp-page factor-management">
    <PageHeader
      title="因子管理"
      status-tone="info"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': sourceMode === 'live' }">
          {{ tableLoading ? '正在加载' : loadError ? '加载失败' : '已加载' }}
        </span>
        <span>共 {{ total }} 条</span>
      </template>
      <template #actions>
        <div class="page-toolbar">
          <el-button v-access="'factor.create'" type="primary" :icon="Plus" @click="openFactorEditor('new')">
            新建因子
          </el-button>
          <el-button v-access="'factorTemplate.read'" @click="router.push('/factor/templates')">
            从模板创建因子
          </el-button>
          <el-button v-access="'factor.recycleBin.read'" @click="router.push('/factor/recycle-bin')">回收站</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="surface-card filter-card factor-filter" aria-label="因子筛选">
      <el-form v-query-enter :inline="true" @submit.prevent="applyFilters">

        <el-form-item>
          <el-input
            v-model.trim="form.name"
            class="filter-name"
            clearable
            placeholder="因子名称或编码"
            aria-label="按因子名称或编码搜索"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" class="filter-select" clearable placeholder="因子类型" aria-label="按因子类型筛选">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="复合因子" value="复合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" class="filter-select" clearable placeholder="业务分类" aria-label="按业务分类筛选">
            <el-option
              v-for="category in categoryOptions"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.status" class="filter-select filter-select--small" clearable placeholder="发布状态" aria-label="按发布状态筛选">
            <el-option label="已发布" value="已发布" />
            <el-option label="草稿" value="草稿" />
            <el-option label="已校验" value="已校验" />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="surface-card table-card factor-table-card" aria-label="因子目录">
      <StatePanel v-if="tableLoading && !hasLoaded" type="loading" title="正在加载因子目录" />
      <StatePanel v-else-if="loadError" type="error" title="因子目录加载失败" :description="loadError">
        <template #actions><el-button type="primary" @click="loadBackendFactors">重试</el-button></template>
      </StatePanel>
      <StatePanel
        v-else-if="!pagedRows.length && !tableLoading"
        type="empty"
        title="没有符合条件的因子"
        description="调整筛选条件或新建因子后再查看。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
          <el-button v-access="'factor.create'" type="primary" @click="openFactorEditor('new')">新建因子</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table :aria-busy="tableLoading" :empty-text="tableLoading ? '正在查询…' : '暂无数据'"
          :data="pagedRows"
          v-loading="tableLoading"
          row-key="code"
          table-layout="fixed"
          class="factor-table"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="name" label="因子名称" min-width="280" show-overflow-tooltip>
            <template #default="{ row }">
              <button class="action-link factor-name-text" type="button" @click="openFactorDetail(row)">{{ row.name }}</button>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="type" label="类型" width="110" />
          <el-table-column prop="domain" label="数据域" min-width="160" show-overflow-tooltip />
          <el-table-column label="聚合方式" width="110">
            <template #default="{ row }">{{ getAggregationLabel(row.aggregation) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <StatusBadge
                :status="factorStatusCode(row.status)"
                :label="row.status ? getStatusLabel(row.status) : '-'"
              />
            </template>
          </el-table-column>
          <el-table-column label="引用数" width="78" align="center">
            <template #default="{ row }">{{ row.references ?? '—' }}</template>
          </el-table-column>
           <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="openFactorDetail(row)">
                查看
              </button>
               <button v-access="{ action: 'factor.edit', resourceId: row.id || row.code }" class="action-link" type="button" @click="openFactorEditor(row.id || row.code)">
                 编辑
               </button>
               <button v-access="'factor.delete'" v-if="row.id" class="action-link danger-link" type="button" @click="openDelete(row)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="!loadError" class="pagination-row">
        <span>共 {{ total }} 条<span v-if="selectedRows.length">，已选 {{ selectedRows.length }} 条</span></span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[6, 9, 12]"
          :total="total"
          @current-change="loadBackendFactors"
          @size-change="resize"
        />
      </div>
    </section>
    <ResourceDeleteDialog
      :model-value="Boolean(deleteTarget)"
      resource-label="因子"
      :load-impact="() => fetchFactorDeletionImpact(deleteTarget.id)"
      :perform-delete="payload => deleteFactor(deleteTarget.id, payload)"
      @update:model-value="value => { if (!value) closeDelete() }"
      @success="reloadAfterDelete"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import ResourceDeleteDialog from '@/idmp/components/ResourceDeleteDialog.vue'
import { deleteFactor, fetchFactorDeletionImpact, fetchFactors, fetchFactorCategories } from '@/idmp/api/modules/factors'
import { useCatalogQuery } from '@/idmp/features/catalog/useCatalogQuery.js'
import { getStatusLabel } from '@/idmp/design/status'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'
import { getFactorTypeLabel } from '@/idmp/utils/factorType'
import { canRequest } from '@/idmp/auth/session'
import { fetchDataDomains } from '@/idmp/api/modules/meta'
import { adaptDataDomainList } from '@/idmp/api/adapters/meta'

const router = useRouter()

const emptyFilters = () => ({
  code: '',
  name: '',
  type: '',
  category: '',
  status: ''
})

const { filters: form, rows: backendFactorRows, total, page: currentPage, size: pageSize,
  loading: tableLoading, error: queryError, hasLoaded, load: loadPage,
  search: applyFilters, reset: resetFilters, resize } = useCatalogQuery((params, options) => {
  const { name, type, status, ...rest } = params
  return fetchFactors({ ...rest, keyword: name, definitionKind: { 原子因子: 'SOURCE', 复合因子: 'DERIVED' }[type] || '', status: factorStatusCode(status) }, options)
}, emptyFilters(), 9)
const domainNames = ref({})
const sourceMode = computed(() => queryError.value ? 'error' : 'live')
const loadError = computed(() => queryError.value?.message || '')
const selectedRows = ref([])
const deleteTarget = ref(null)

const categoryOptions = ref([])
const pagedRows = computed(() => backendFactorRows.value.map(toFactorRow))

const openFactorDetail = row => router.push({ name: 'FactorDetail', params: { id: String(row.id || row.code) } })

const openFactorEditor = (id) => {
  router.push(`/factor/edit/${encodeURIComponent(id)}`)
}

const openDelete = row => { deleteTarget.value = row }
const closeDelete = () => { deleteTarget.value = null }
const reloadAfterDelete = async () => { closeDelete(); await loadBackendFactors() }

async function loadBackendFactors() {
  selectedRows.value = []
  return loadPage()
}

function toFactorRow(item) {
  return {
    id: item.id ?? item.factorId ?? '',
    code: item.code || item.factorCode || '',
    name: item.name || item.factorName || '',
    type: getFactorTypeLabel(item.definitionKind || item.factorKind || item.type),
    category: item.category || '—',
    aggregation: item.aggregation || item.output?.dimension || '-',
    domain: item.domainName || domainNames.value[item.domainCode] || '-',
    references: item.references ?? item.referenceCount ?? null,
    status: item.status || 'UNKNOWN',
    publishedVersionId: item.publishedVersionId
  }
}

function factorStatusCode(status) {
  return { 已发布: 'PUBLISHED', 草稿: 'DRAFT', 已校验: 'VALIDATED' }[status] || status
}

onMounted(() => {
  loadBackendFactors()
  fetchFactorCategories().then(items => { categoryOptions.value = items }).catch(() => {})
  if (canRequest('GET', '/meta/data-domains')) {
    fetchDataDomains().then(items => { domainNames.value = Object.fromEntries(adaptDataDomainList(items).map(item => [item.code, item.name])) }).catch(() => {})
  }
})
</script>

<style scoped lang="scss">
.factor-management {
  min-width: 0;
}

.factor-filter {
  :deep(.el-form) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
  }

  :deep(.el-form-item) {
    margin: 0;
  }

}

.filter-code { width: 140px; }
.filter-name { width: 200px; }
.filter-select { width: 156px; }
.filter-select--small { width: 112px; }

.filter-actions {
  margin-left: 2px !important;
}

.factor-table-card {
  min-width: 0;
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.factor-table {
  min-width: 960px;

  :deep(th.el-table__cell) {
    height: 46px;
    padding: 0;
    color: var(--idmp-text-primary);
    font-weight: 600;
    background: var(--idmp-layer-02);
  }

  :deep(td.el-table__cell) {
    height: 47px;
    padding: 0;
    color: var(--idmp-text-secondary);
  }

  :deep(.cell) {
    line-height: 20px;
  }
}

.factor-name-text {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: var(--idmp-text-primary);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-link,
.action-link {
  padding: 0;
  font: inherit;
  color: var(--idmp-interactive);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.code-link {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.action-link {
  margin-right: 0;

  & + & {
    margin-left: 13px;
  }
}

</style>
