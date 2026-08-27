<template>
  <div class="idmp-page factor-management">
    <PageHeader
      title="因子管理"
      status-label="演示目录 + 后端新增流程"
      status-tone="info"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': sourceMode === 'live' }">
          {{ sourceMode === 'live' ? '接口数据' : '演示数据' }}
        </span>
        <span>共 {{ filteredRows.length }} 条</span>
      </template>
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="openFactorEditor('new')">
            新建因子
          </el-button>
          <el-button @click="router.push('/factor/templates')">
            从模板创建因子
          </el-button>
          <el-button v-if="canUseAdvancedCreation" @click="openAdvancedFactorEditor">
            高级自定义创建
          </el-button>
          <el-button @click="router.push('/factor/recycle-bin')">回收站</el-button>
          <el-button :icon="Upload" @click="showUnavailable('批量导入')">批量导入</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="surface-card filter-card factor-filter" aria-label="因子筛选">
      <el-form :inline="true" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="form.code"
            class="filter-code"
            clearable
            placeholder="因子编码"
            aria-label="按因子编码筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            class="filter-name"
            clearable
            placeholder="因子名称"
            aria-label="按因子名称筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" class="filter-select" clearable placeholder="因子类型" aria-label="按因子类型筛选">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
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
      <StatePanel
        v-if="!tableLoading && !filteredRows.length"
        type="empty"
        title="没有符合条件的因子"
        description="调整筛选条件或新建因子后再查看。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
          <el-button type="primary" @click="openFactorEditor('new')">新建因子</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table
          :data="pagedRows"
          v-loading="tableLoading"
          row-key="code"
          table-layout="fixed"
          class="factor-table"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="code" label="因子编码" width="140">
            <template #default="{ row }">
              <button class="action-link code-link" type="button" @click="openFactorEditor(row.id || row.code)">
                {{ row.code }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="因子名称" min-width="230" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="factor-name-text">{{ row.name }}</span>
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
            <template #default="{ row }">{{ row.references ?? 0 }}</template>
          </el-table-column>
           <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="openFactorEditor(row.id || row.code)">
                查看
              </button>
               <button class="action-link" type="button" @click="openFactorEditor(row.id || row.code)">
                 编辑
               </button>
               <button v-if="sourceMode === 'live' && row.id" class="action-link danger-link" type="button" @click="openDelete(row)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="pagination-row">
        <span>共 {{ filteredRows.length }} 条<span v-if="selectedRows.length">，已选 {{ selectedRows.length }} 条</span></span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[6, 9, 12]"
          :total="filteredRows.length"
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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
  import StatusBadge from '@/idmp/components/StatusBadge.vue'
 import ResourceDeleteDialog from '@/idmp/components/ResourceDeleteDialog.vue'
 import { deleteFactor, fetchFactorDeletionImpact, fetchFactors } from '@/idmp/api/modules/factors'
import { factorRows } from '@/idmp/data/demo'
import { getStatusLabel } from '@/idmp/design/status'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'
import { hasPermission, sessionState } from '@/idmp/auth/session'

const router = useRouter()

const emptyFilters = () => ({
  code: '',
  name: '',
  type: '',
  category: '',
  status: ''
})

const form = reactive(emptyFilters())
const filters = reactive(emptyFilters())
const backendFactorRows = ref([])
const sourceMode = ref('demo')
const tableLoading = ref(false)
const currentPage = ref(1)
const pageSize = ref(9)
const selectedRows = ref([])
const deleteTarget = ref(null)
const canUseAdvancedCreation = computed(() => {
  const designerRoles = ['SYSTEM_ADMIN', 'DATA_ADMIN', 'IMPLEMENTATION_ENGINEER', 'SYSTEM_ARCHITECT']
  return designerRoles.some(role => sessionState.roles.includes(role)) || hasPermission('factor:advanced:create') || hasPermission('factor:template:manage')
})

const sourceRows = computed(() => sourceMode.value === 'live' ? backendFactorRows.value : factorRows)
const categoryOptions = computed(() => [...new Set(sourceRows.value.map((item) => item.category).filter(Boolean))])

const filteredRows = computed(() => {
  const code = filters.code.toLowerCase()
  const name = filters.name.toLowerCase()

  return sourceRows.value.filter((row) => {
    return (
      (!code || row.code.toLowerCase().includes(code)) &&
      (!name || row.name.toLowerCase().includes(name)) &&
      (!filters.type || row.type === filters.type) &&
      (!filters.category || row.category === filters.category) &&
      (!filters.status || getStatusLabel(row.status) === filters.status)
    )
  })
})

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

const applyFilters = () => {
  Object.assign(filters, form)
  currentPage.value = 1
}

const resetFilters = () => {
  Object.assign(form, emptyFilters())
  Object.assign(filters, emptyFilters())
  currentPage.value = 1
}

watch(filteredRows, () => {
  if ((currentPage.value - 1) * pageSize.value >= filteredRows.value.length) {
    currentPage.value = 1
  }
})

const openFactorEditor = (id) => {
  router.push(`/factor/edit/${encodeURIComponent(id)}`)
}

const openAdvancedFactorEditor = () => {
  router.push('/factor/edit/new?mode=advanced')
}

const showUnavailable = (capability) => {
  ElMessage.info(`${capability}尚未接入真实接口，当前演示列表不会伪造操作结果。`)
}

const openDelete = row => { deleteTarget.value = row }
const closeDelete = () => { deleteTarget.value = null }
const reloadAfterDelete = async () => { closeDelete(); await loadBackendFactors() }

async function loadBackendFactors() {
  tableLoading.value = true
  try {
    const payload = await fetchFactors({ page: 1, size: 100 })
    const rows = normalizeList(payload).map(toFactorRow)
    backendFactorRows.value = rows
    sourceMode.value = 'live'
  } catch (error) {
    backendFactorRows.value = []
    sourceMode.value = 'demo'
    ElMessage.warning(error?.message || '因子列表接口暂不可用，已显示演示目录')
  } finally {
    tableLoading.value = false
  }
}

function toFactorRow(item) {
  return {
    id: item.id ?? item.factorId ?? '',
    code: item.code || item.factorCode || '',
    name: item.name || item.factorName || '',
    type: item.type || '原子因子',
    category: item.category || '后端因子',
    aggregation: item.aggregation || item.output?.dimension || '-',
    domain: item.domain || item.domainCode || '-',
    references: item.references ?? item.referenceCount ?? 0,
    status: item.status || 'UNKNOWN',
    publishedVersionId: item.publishedVersionId
  }
}

function factorStatusCode(status) {
  return { 已发布: 'PUBLISHED', 草稿: 'DRAFT', 已校验: 'VALIDATED' }[status] || status
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

onMounted(loadBackendFactors)
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
