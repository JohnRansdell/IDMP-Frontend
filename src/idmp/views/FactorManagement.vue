<template>
  <div class="idmp-page factor-management">
    <PageHeader
      title="因子管理"
      status-label="演示目录 + 后端新增流程"
      status-tone="info"
    >
      <template #actions>
        <div class="page-toolbar">
          <el-button @click="router.push('/factor/templates')">模板管理</el-button>
          <el-button type="primary" :icon="Plus" @click="openFactorEditor('new')">
            新增因子
          </el-button>
          <el-button @click="router.push('/factor/recycle-bin')">回收站</el-button>
          <el-button :icon="Upload" @click="showUnavailable('批量导入')">批量导入</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="filter-card factor-filter" aria-label="因子筛选">
      <el-form :inline="true" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="form.code"
            clearable
            placeholder="因子编码"
            aria-label="按因子编码筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            clearable
            placeholder="因子名称"
            aria-label="按因子名称筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" clearable placeholder="因子类型" aria-label="按因子类型筛选">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" clearable placeholder="业务分类" aria-label="按业务分类筛选">
            <el-option
              v-for="category in categoryOptions"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.status" clearable placeholder="发布状态" aria-label="按发布状态筛选">
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

    <section class="surface-card factor-table-card" aria-label="因子列表">
      <div class="table-card-head">
        <div>
          <h2>因子目录</h2>
          <p>维护可被指标公式引用的计算因子，发布后的版本进入正式计算链路。</p>
        </div>
        <el-tag type="info" effect="plain">{{ sourceMode === 'live' ? '列表来自后端因子接口' : '后端不可用时显示演示目录' }}</el-tag>
      </div>

      <div class="table-scroll">
        <el-table
          :data="pagedRows"
          v-loading="tableLoading"
          table-layout="fixed"
          empty-text="暂无符合条件的因子"
          class="factor-table"
        >
          <el-table-column type="expand" width="46">
            <template #default="{ row }">
              <div class="factor-expand">
                <dl>
                  <div>
                    <dt>因子 ID</dt>
                    <dd class="mono-data">{{ row.id || '-' }}</dd>
                  </div>
                  <div>
                    <dt>已发布版本 ID</dt>
                    <dd class="mono-data">{{ row.publishedVersionId || '-' }}</dd>
                  </div>
                  <div>
                    <dt>聚合方式</dt>
                    <dd>{{ getAggregationLabel(row.aggregation) }}</dd>
                  </div>
                  <div>
                    <dt>引用次数</dt>
                    <dd>{{ row.references ?? 0 }}</dd>
                  </div>
                  <div>
                    <dt>数据域</dt>
                    <dd>{{ row.domain || '-' }}</dd>
                  </div>
                  <div>
                    <dt>状态</dt>
                    <dd>{{ row.status ? getStatusLabel(row.status) : '-' }}</dd>
                  </div>
                </dl>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="code" label="因子编码" width="156">
            <template #default="{ row }">
              <button class="code-link" type="button" @click="openFactorEditor(row.id || row.code)">
                {{ row.code }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="因子名称" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="factor-name-text">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="业务分类" width="110" />
          <el-table-column prop="domain" label="数据域" min-width="170" show-overflow-tooltip />
          <el-table-column label="发布状态" width="112">
            <template #default="{ row }">
              <StatusBadge
                :status="factorStatusCode(row.status)"
                :label="row.status ? getStatusLabel(row.status) : '-'"
              />
            </template>
          </el-table-column>
           <el-table-column label="操作" width="180" fixed="right">
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

      <div class="table-footer">
        <span v-if="hasActiveFilters">筛选到 {{ filteredRows.length }} 条因子</span>
        <span v-else>共 {{ sourceRows.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[8, 12, 20]"
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
  import StatusBadge from '@/idmp/components/StatusBadge.vue'
 import ResourceDeleteDialog from '@/idmp/components/ResourceDeleteDialog.vue'
 import { deleteFactor, fetchFactorDeletionImpact, fetchFactors } from '@/idmp/api/modules/factors'
import { factorRows } from '@/idmp/data/demo'
import { getStatusLabel } from '@/idmp/design/status'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'

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
const pageSize = ref(8)
const deleteTarget = ref(null)

const sourceRows = computed(() => sourceMode.value === 'live' ? backendFactorRows.value : factorRows)
const categoryOptions = computed(() => [...new Set(sourceRows.value.map((item) => item.category).filter(Boolean))])

const hasActiveFilters = computed(() => Object.values(filters).some(Boolean))

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
  margin-bottom: 16px;
  padding: 16px;

  :deep(.el-form) {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  :deep(.el-form-item) {
    margin: 0;
  }

  :deep(.el-input) {
    width: 178px;
  }

  :deep(.el-select) {
    width: 140px;
  }
}

.filter-actions {
  margin-left: 2px !important;
}

.factor-table-card {
  min-width: 0;
  padding: 16px 16px 12px;
}

.table-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 4px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
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

.factor-expand {
  padding: 6px 12px 12px 58px;
  background: var(--idmp-layer-02);

  dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 14px;
    margin: 0;
  }

  div {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--idmp-border-subtle);
    border-radius: var(--idmp-radius-sm);
    background: var(--idmp-layer-01);
  }

  dt {
    margin-bottom: 5px;
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--idmp-text-primary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

.reference-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  color: var(--idmp-support-info);
  font-size: 12px;
  line-height: 22px;
  background: var(--idmp-support-info-bg);
  border-radius: var(--idmp-radius-sm);
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  padding: 11px 4px 0;
  color: var(--idmp-text-helper);
  font-size: 13px;
  gap: 16px;
}

.table-footer__hint {
  color: var(--idmp-text-disabled);
}

@media (max-width: 1450px) {
  .factor-filter {
    :deep(.el-input) {
      width: 158px;
    }
  }
}
</style>
