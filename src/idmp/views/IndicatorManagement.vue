<template>
  <div class="idmp-page indicator-page">
    <PageHeader
      title="指标目录"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': sourceMode === 'live' }">
          {{ sourceMode === 'live' ? '接口数据' : sourceMode === 'demo' ? '演示数据' : '正在加载' }}
        </span>
        <span>共 {{ filteredRows.length }} 条</span>
      </template>
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openEditor('new')">新增指标</el-button>
        <el-button @click="router.push('/indicator/recycle-bin')">回收站</el-button>
        <el-tooltip content="当前后端尚未提供指标导入接口">
          <span
            class="disabled-tooltip-trigger"
            tabindex="0"
            aria-label="批量导入不可用：当前后端尚未提供指标导入接口"
          >
            <el-button :icon="Upload" disabled>批量导入</el-button>
          </span>
        </el-tooltip>
        <el-tooltip content="大导出任务接口尚未接入">
          <span
            class="disabled-tooltip-trigger"
            tabindex="0"
            aria-label="批量导出不可用：大导出任务接口尚未接入"
          >
            <el-button :icon="Download" disabled>批量导出</el-button>
          </span>
        </el-tooltip>
        <el-button-group class="view-switch">
          <el-button
            :type="viewMode === 'table' ? 'primary' : 'default'"
            :icon="Menu"
            aria-label="表格视图"
            :aria-pressed="viewMode === 'table' ? 'true' : 'false'"
            @click="viewMode = 'table'"
          />
          <el-button
            :type="viewMode === 'card' ? 'primary' : 'default'"
            :icon="Grid"
            aria-label="卡片视图"
            :aria-pressed="viewMode === 'card' ? 'true' : 'false'"
            @click="viewMode = 'card'"
          />
        </el-button-group>
      </template>
    </PageHeader>

    <div v-if="loadError" class="notice-strip is-warning indicator-source-notice">
      <span>{{ loadError }} 当前已明确切换为演示数据，不代表后端真实指标目录。</span>
      <el-button link type="primary" :loading="tableLoading" @click="loadBackendIndicators">重试接口</el-button>
    </div>

    <section class="surface-card filter-card">
        <el-form :model="filters" aria-label="指标筛选">
          <el-form-item>
            <el-input
              v-model="filters.code"
              placeholder="指标编码"
              clearable
              class="filter-code"
              aria-label="按指标编码筛选"
            />
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="filters.name"
              placeholder="指标名称（模糊搜索）"
              clearable
              class="filter-name"
              aria-label="按指标名称筛选"
            />
          </el-form-item>
          <el-form-item>
            <el-select
              v-model="filters.category"
              placeholder="指标分类"
              clearable
              class="filter-select"
              aria-label="按指标分类筛选"
            >
              <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-select
              v-model="filters.attribute"
              placeholder="指标属性"
              clearable
              class="filter-select small"
              aria-label="按指标属性筛选"
            >
              <el-option label="定量" value="定量" />
              <el-option label="定性" value="定性" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-select
              v-model="filters.status"
              placeholder="状态"
              clearable
              class="filter-select small"
              aria-label="按指标状态筛选"
            >
              <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-select
              v-model="filters.direction"
              placeholder="指标导向"
              clearable
              class="filter-select"
              aria-label="按指标导向筛选"
            >
            <el-option label="逐步提高↑" value="↑逐步提高" />
            <el-option label="逐步降低↓" value="↓逐步降低" />
            <el-option label="监测比较" value="监测比较" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="applyFilters">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section v-if="viewMode === 'table'" class="surface-card table-card">
      <StatePanel
        v-if="!tableLoading && !filteredRows.length"
        type="empty"
        title="没有符合条件的指标"
        description="调整筛选条件或新建指标后再查看。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
          <el-button type="primary" @click="openEditor('new')">新增指标</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table
          :data="pagedRows"
          v-loading="tableLoading"
          row-key="code"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="code" label="指标编码" width="140">
            <template #default="{ row }">
              <button type="button" class="action-link" @click="openDetail(row)">{{ row.code }}</button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="指标名称" min-width="230" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="version" label="版本" width="86" />
          <el-table-column prop="direction" label="导向" width="116">
            <template #default="{ row }">
              <span :class="directionClass(row.direction)">{{ row.direction }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="source" label="数据来源" width="110" />
          <el-table-column prop="status" label="状态" width="92">
            <template #default="{ row }">
              <StatusBadge :status="row.status" :label="row.status" :tone="statusTone(row.status)" />
            </template>
          </el-table-column>
          <el-table-column prop="scenes" label="场景数" width="78" align="center" />
           <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <button type="button" class="action-link" @click="openDetail(row)">查看</button>
               <button type="button" class="action-link" @click="openEditor(row.code)">编辑</button>
              <button v-if="sourceMode === 'live' && row.indicatorId" type="button" class="action-link danger-link" @click="openDelete(row)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div ref="paginationRowRef" class="pagination-row">
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

    <section v-else class="indicator-card-wrap">
      <div v-if="pagedRows.length" class="indicator-card-grid">
        <article v-for="row in pagedRows" :key="row.code" class="surface-card indicator-card">
          <div class="indicator-card__head">
            <button type="button" class="indicator-code" @click="openDetail(row)">{{ row.code }}</button>
            <StatusBadge :status="row.status" :label="row.status" :tone="statusTone(row.status)" />
          </div>
          <h2>{{ row.name }}</h2>
          <dl>
            <div><dt>分类</dt><dd>{{ row.category }}</dd></div>
            <div><dt>版本</dt><dd>{{ row.version }}</dd></div>
            <div><dt>导向</dt><dd>{{ row.direction }}</dd></div>
            <div><dt>来源</dt><dd>{{ row.source }}</dd></div>
            <div><dt>关联场景</dt><dd>{{ row.scenes }} 个</dd></div>
          </dl>
          <div class="indicator-card__actions">
            <el-button @click="openDetail(row)">查看详情</el-button>
            <el-button type="primary" plain @click="openEditor(row.code)">编辑</el-button>
          </div>
        </article>
      </div>
      <StatePanel
        v-else
        type="empty"
        title="没有符合条件的指标"
        description="调整筛选条件或新建指标后再查看。"
      />
      <div ref="paginationRowRef" class="pagination-row card-pagination">
        <span>共 {{ filteredRows.length }} 条</span>
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
      resource-label="指标"
      :load-impact="() => fetchIndicatorDeletionImpact(deleteTarget.indicatorId)"
      :perform-delete="payload => deleteIndicator(deleteTarget.indicatorId, payload)"
      @update:model-value="value => { if (!value) closeDelete() }"
      @success="reloadAfterDelete"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Download, Grid, Menu, Plus, RefreshLeft, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
 import ResourceDeleteDialog from '@/idmp/components/ResourceDeleteDialog.vue'
 import { deleteIndicator, fetchIndicatorDeletionImpact, fetchIndicators, fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { indicatorRows } from '@/idmp/data/demo'

const router = useRouter()
const viewMode = ref('table')
const currentPage = ref(1)
const pageSize = ref(9)
const selectedRows = ref([])
const tableLoading = ref(false)
const backendIndicatorRows = ref([])
const sourceMode = ref('loading')
const loadError = ref('')
const paginationRowRef = ref()
const deleteTarget = ref(null)

const emptyFilters = () => ({
  code: '',
  name: '',
  category: '',
  attribute: '',
  status: '',
  direction: ''
})

const filters = reactive(emptyFilters())
const appliedFilters = ref(emptyFilters())
const sourceRows = computed(() => (
  sourceMode.value === 'live'
    ? backendIndicatorRows.value
    : sourceMode.value === 'demo'
      ? indicatorRows
      : []
))
const categories = computed(() => [...new Set(sourceRows.value.map(item => item.category).filter(Boolean))])
const statuses = computed(() => [...new Set(sourceRows.value.map(item => item.status).filter(Boolean))])

const filteredRows = computed(() => sourceRows.value.filter(row => {
  const query = appliedFilters.value
  return (!query.code || row.code.toLowerCase().includes(query.code.toLowerCase()))
    && (!query.name || row.name.includes(query.name))
    && (!query.category || row.category === query.category)
    && (!query.attribute || row.attribute === query.attribute)
    && (!query.status || row.status === query.status)
    && (!query.direction || row.direction === query.direction)
}))

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value)
})

watch([pageSize, viewMode], () => {
  currentPage.value = 1
  labelPageSizeControl()
})

const applyFilters = () => {
  appliedFilters.value = { ...filters }
  currentPage.value = 1
}

const resetFilters = () => {
  Object.assign(filters, emptyFilters())
  appliedFilters.value = emptyFilters()
  currentPage.value = 1
}

const loadBackendIndicators = async () => {
  tableLoading.value = true
  loadError.value = ''
  try {
    const [indicators, publishedVersions] = await Promise.all([
      fetchIndicators({ page: 1, size: 100 }),
      fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 100 })
    ])
    backendIndicatorRows.value = mergePublishedIndicatorVersions(
      normalizeList(indicators).map(toIndicatorRow),
      normalizeList(publishedVersions).map(toPublishedIndicatorVersionRow)
    )
    sourceMode.value = 'live'
  } catch (error) {
    backendIndicatorRows.value = []
    sourceMode.value = 'demo'
    loadError.value = error?.message || '指标目录接口暂不可用。'
  } finally {
    tableLoading.value = false
  }
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

const toIndicatorRow = item => ({
  code: item.code,
  name: item.name,
  category: item.category || '后端指标',
  attribute: item.attribute || '定量',
  version: item.versionNo ? `V${item.versionNo}` : 'V1',
  direction: item.direction || '监测比较',
  source: item.source || '后端接口',
  status: item.status || '未知',
  scenes: item.scenes || 0,
  description: item.description,
  id: item.id,
  indicatorId: item.id,
  versionId: item.currentVersionId || item.latestVersionId || item.publishedVersionId || ''
})

const toPublishedIndicatorVersionRow = item => ({
  code: item.indicatorCode || item.code,
  name: item.indicatorName || item.name || item.indicatorCode || item.code,
  category: item.category || '后端指标',
  attribute: item.attribute || '定量',
  version: item.versionNo ? `V${item.versionNo}` : `版本 ${item.id || item.versionId || '-'}`,
  direction: item.direction || '监测比较',
  source: item.source || '已发布版本',
  status: item.status || item.publicationStatus || 'PUBLISHED',
  scenes: item.scenes || 0,
  description: item.description,
  id: item.indicatorId || item.indicator?.id || item.id,
  indicatorId: item.indicatorId || item.indicator?.id || '',
  versionId: item.id || item.versionId || item.indicatorVersionId || ''
})

function mergePublishedIndicatorVersions(indicatorRows, publishedRows) {
  const rowsByCode = new Map(indicatorRows.map(row => [row.code, { ...row }]))
  publishedRows.forEach((versionRow) => {
    if (!versionRow.code) return
    const existing = rowsByCode.get(versionRow.code)
    rowsByCode.set(versionRow.code, {
      ...(existing || {}),
      ...versionRow,
      id: versionRow.indicatorId || existing?.id || versionRow.id,
      indicatorId: versionRow.indicatorId || existing?.indicatorId || existing?.id || '',
      status: 'PUBLISHED',
      source: existing?.source || versionRow.source
    })
  })
  return Array.from(rowsByCode.values())
}

const openEditor = id => router.push(`/indicator/edit/${id}`)
const openDetail = row => router.push(`/indicator/view/${row.id || row.code}`)
const openDelete = row => { deleteTarget.value = row }
const closeDelete = () => { deleteTarget.value = null }
const reloadAfterDelete = async () => { closeDelete(); await loadBackendIndicators() }

const statusTone = status => ({
  '草稿': 'warning',
  '待审核': 'info',
  '已停用': 'neutral',
  DRAFT: 'warning',
  PUBLISHED: 'success',
  DISABLED: 'neutral'
}[status] || 'neutral')

const directionClass = direction => {
  if (direction.includes('提高')) return 'direction-up'
  if (direction.includes('降低')) return 'direction-down'
  return 'direction-neutral'
}

const labelPageSizeControl = async () => {
  await nextTick()
  paginationRowRef.value
    ?.querySelector('[role="combobox"]')
    ?.setAttribute('aria-label', '每页显示指标条数')
}

onMounted(() => {
  loadBackendIndicators()
  labelPageSizeControl()
})
</script>

<style scoped lang="scss">
.filter-code { width: 140px; }
.filter-name { width: 200px; }
.filter-select { width: 156px; }
.filter-select.small { width: 112px; }

.view-switch {
  margin-left: 2px;
}

.disabled-tooltip-trigger {
  display: inline-flex;
}

.indicator-source-notice {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.direction-up { color: var(--idmp-support-success); }
.direction-down { color: var(--idmp-support-danger); }
.direction-neutral { color: var(--idmp-support-info); }

.indicator-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.indicator-card {
  min-height: 252px;
  padding: 16px;
}

.indicator-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.indicator-code {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--idmp-interactive);
  cursor: pointer;
  font-weight: 600;
}

.indicator-card h2 {
  min-height: 48px;
  margin: 14px 0 12px;
  color: var(--idmp-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.indicator-card dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
  gap: 8px 18px;
}

.indicator-card dl div {
  display: flex;
  min-width: 0;
  gap: 8px;
}

.indicator-card dt {
  flex: 0 0 auto;
  color: var(--idmp-text-helper);
}

.indicator-card dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--idmp-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indicator-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--idmp-border-subtle);
  gap: 8px;
}

.card-pagination {
  padding: 0 4px;
}

@media (max-width: 1380px) {
  .filter-card {
    padding-right: 14px;
    padding-left: 14px;
  }

  .filter-code { width: 126px; }
  .filter-name { width: 176px; }
  .filter-select { width: 136px; }
  .filter-select.small { width: 102px; }
}
</style>
