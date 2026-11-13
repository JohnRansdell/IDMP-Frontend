<template>
  <div class="idmp-page indicator-page">
    <PageHeader
      title="指标目录"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': sourceMode === 'live' }">
          {{ tableLoading ? '正在加载' : loadError ? '加载失败' : '已加载' }}
        </span>
        <span>共 {{ total }} 条</span>
      </template>
      <template #actions>
        <el-button v-access="'indicator.create'" type="primary" :icon="Plus" @click="openEditor('new')">新增指标</el-button>
        <el-button v-access="'indicator.recycleBin.read'" @click="router.push('/indicator/recycle-bin')">回收站</el-button>
        <el-button v-access="'sqlImport.create'" :icon="Upload" @click="router.push('/indicator/import/sql')">SQL 导入</el-button>
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

    <StatePanel v-if="tableLoading && !hasLoaded" type="loading" title="正在加载指标目录" />
    <StatePanel v-else-if="loadError" type="error" title="指标目录加载失败" :description="loadError">
      <template #actions><el-button type="primary" @click="loadBackendIndicators">重试</el-button></template>
    </StatePanel>

    <section class="surface-card filter-card">
        <el-form v-query-enter :model="filters" aria-label="指标筛选" @submit.prevent="applyFilters">

          <el-form-item>
            <el-input
              v-model="filters.name"
              placeholder="指标名称或编码"
              clearable
              class="filter-name"
              aria-label="按指标名称或编码搜索"
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
              <el-option v-for="item in statuses" :key="item" :label="getStatusLabel(item)" :value="item" />
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
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section v-if="!loadError && (hasLoaded || !tableLoading) && viewMode === 'table'" class="surface-card table-card">
      <StatePanel
        v-if="!tableLoading && !backendIndicatorRows.length"
        type="empty"
        title="没有符合条件的指标"
        description="调整筛选条件或新建指标后再查看。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
          <el-button v-access="'indicator.create'" type="primary" @click="openEditor('new')">新增指标</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table :aria-busy="tableLoading" :empty-text="tableLoading ? '正在查询…' : '暂无数据'"
          :data="backendIndicatorRows"
          v-loading="tableLoading"
          row-key="code"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="name" label="指标名称" min-width="280" show-overflow-tooltip>
            <template #default="{ row }"><button type="button" class="action-link" @click="openDetail(row)">{{ row.name }}</button></template>
          </el-table-column>
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
          <el-table-column label="分析" width="96" align="center">
            <template #default="{ row }">
              <button v-access="'indicator.analysis.read'" v-if="canOpenAnalysis(row)" type="button" class="action-link" @click="openAnalysis(row)">进入分析</button>
              <el-tooltip v-else content="指标分析仅适用于已发布且具备指标版本的指标">
                <span class="analysis-unavailable" tabindex="0" aria-label="暂不可进入指标分析">—</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="场景数" width="78" align="center"><template #default="{ row }">{{ row.scenes ?? '—' }}</template></el-table-column>
           <el-table-column label="操作" width="210" fixed="right">
            <template #default="{ row }">
              <button type="button" class="action-link" @click="openDetail(row)">查看</button>
               <button v-access="{ action: 'indicator.edit', resourceId: row.indicatorId || row.code }" type="button" class="action-link" @click="openEditor(row.indicatorId || row.code)">编辑</button>
              <button v-access="'indicator.delete'" v-if="row.indicatorId" type="button" class="action-link danger-link" @click="openDelete(row)">删除</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div ref="paginationRowRef" class="pagination-row">
        <span>共 {{ total }} 条<span v-if="selectedRows.length">，已选 {{ selectedRows.length }} 条</span></span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[6, 9, 12]"
          :total="total"
        />
      </div>
    </section>

    <section v-else-if="!loadError && (hasLoaded || !tableLoading)" v-loading="tableLoading" :aria-busy="tableLoading" class="indicator-card-wrap">
      <div v-if="backendIndicatorRows.length" class="indicator-card-grid">
        <article v-for="row in backendIndicatorRows" :key="row.code" class="surface-card indicator-card">
          <div class="indicator-card__head">
            <button type="button" class="indicator-code" @click="openDetail(row)">{{ row.name }}</button>
            <StatusBadge :status="row.status" :label="row.status" :tone="statusTone(row.status)" />
          </div>
          <dl>
            <div><dt>分类</dt><dd>{{ row.category }}</dd></div>
            <div><dt>版本</dt><dd>{{ row.version }}</dd></div>
            <div><dt>导向</dt><dd>{{ row.direction }}</dd></div>
            <div><dt>来源</dt><dd>{{ row.source }}</dd></div>
            <div><dt>关联场景</dt><dd>{{ row.scenes === null ? '—' : `${row.scenes} 个` }}</dd></div>
          </dl>
          <div class="indicator-card__actions">
            <el-button @click="openDetail(row)">查看详情</el-button>
            <el-button v-access="{ action: 'indicator.edit', resourceId: row.indicatorId || row.code }" type="primary" plain @click="openEditor(row.indicatorId || row.code)">编辑</el-button>
            <el-button v-access="'indicator.analysis.read'" v-if="canOpenAnalysis(row)" type="success" plain @click="openAnalysis(row)">指标分析</el-button>
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
        <span>共 {{ total }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[6, 9, 12]"
          :total="total"
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
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Grid, Menu, Plus, RefreshLeft, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
 import ResourceDeleteDialog from '@/idmp/components/ResourceDeleteDialog.vue'
import { deleteIndicator, fetchIndicatorDeletionImpact, fetchIndicators, fetchIndicatorCategories } from '@/idmp/api/modules/indicators'
import { getStatusLabel } from '@/idmp/design/status'
import { createRequestScope } from '@/idmp/features/analysis/useLatestResult.js'

const router = useRouter()
const viewMode = ref('table')
const currentPage = ref(1)
const pageSize = ref(9)
const selectedRows = ref([])
const tableLoading = ref(false)
const hasLoaded = ref(false)
const backendIndicatorRows = ref([])
const total = ref(0)
const categories = ref([])
const statuses = ['DRAFT', 'PUBLISHED', 'DISABLED']
const listScope = createRequestScope()
const categoryScope = createRequestScope()
const sourceMode = ref('loading')
const loadError = ref('')
const paginationRowRef = ref()
const deleteTarget = ref(null)

const emptyFilters = () => ({
  name: '',
  category: '',
  attribute: '',
  status: '',
  direction: ''
})

const filters = reactive(emptyFilters())
const appliedFilters = ref(emptyFilters())
watch([currentPage, pageSize], ([, size], [, previousSize]) => {
  if (size !== previousSize && currentPage.value !== 1) { currentPage.value = 1; return }
  loadBackendIndicators()
  labelPageSizeControl()
})
watch(viewMode, () => labelPageSizeControl())

const applyFilters = () => {
  appliedFilters.value = { ...filters }
  if (currentPage.value === 1) loadBackendIndicators()
  else currentPage.value = 1
}

const resetFilters = () => {
  Object.assign(filters, emptyFilters())
  applyFilters()
}

const loadBackendIndicators = async () => {
  const request = listScope.begin()
  tableLoading.value = true
  loadError.value = ''
  selectedRows.value = []
  try {
    const { name, ...otherFilters } = appliedFilters.value
    const result = await fetchIndicators({ ...otherFilters, keyword: name, page: currentPage.value, size: pageSize.value }, { signal: request.signal })
    if (!request.isCurrent()) return
    total.value = Number(result.total)
    if (currentPage.value > 1 && !result.records.length && total.value <= (currentPage.value - 1) * pageSize.value) {
      currentPage.value = Math.max(1, Math.ceil(total.value / pageSize.value))
      return
    }
    backendIndicatorRows.value = result.records.map(toIndicatorRow)
    hasLoaded.value = true
    sourceMode.value = 'live'
  } catch (error) {
    if (!request.isCurrent()) return
    backendIndicatorRows.value = []
    total.value = 0
    sourceMode.value = 'error'
    loadError.value = error?.message || '指标目录加载失败，请重试。'
  } finally {
    if (request.isCurrent()) tableLoading.value = false
  }
}

async function loadCategories() {
  const request = categoryScope.begin()
  try {
    const result = await fetchIndicatorCategories({ signal: request.signal })
    if (request.isCurrent()) categories.value = result
  } catch {
    // Category options must not prevent searching the catalog.
  }
}

const toIndicatorRow = (item) => ({
  code: item.code,
  name: item.name,
  category: item.category || '—',
  attribute: item.attribute || '—',
  version: item.latestPublishedVersionId && item.latestPublishedVersionNo ? `V${item.latestPublishedVersionNo}` : '未发布',
  direction: item.direction || '—',
  source: item.source || '—',
  status: item.status || '未知',
  // 场景数由指标主对象接口聚合返回；字段缺失时保留未知状态，避免误显示为 0。
  scenes: toScenarioCount(item.scenarioCount),
  description: item.description,
  id: item.id,
  indicatorId: item.id,
  versionId: item.latestPublishedVersionId || ''
})

function toScenarioCount(value) {
  if (value === undefined || value === null || value === '') return null
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : null
}

const openEditor = id => router.push(`/indicator/edit/${id}`)
const openDetail = row => router.push(`/indicator/view/${row.id || row.code}`)
const canOpenAnalysis = row => Boolean(
  row?.indicatorId &&
  row?.versionId &&
  String(row.status || '').toUpperCase() === 'PUBLISHED'
)
const openAnalysis = row => {
  if (!canOpenAnalysis(row)) return
  router.push({
    name: 'IndicatorAnalysis',
    query: {
      indicator: String(row.indicatorId),
      indicatorVersionId: String(row.versionId),
      ...(row.name ? { indicatorName: String(row.name) } : {})
    }
  })
}
const openDelete = row => { deleteTarget.value = row }
const closeDelete = () => { deleteTarget.value = null }
const reloadAfterDelete = async () => { closeDelete(); await Promise.all([loadBackendIndicators(), loadCategories()]) }

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
  loadCategories()
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

.indicator-source-notice {
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.direction-up { color: var(--idmp-support-success); }
.direction-down { color: var(--idmp-support-danger); }
.direction-neutral { color: var(--idmp-support-info); }

.analysis-unavailable {
  color: var(--idmp-text-secondary);
  cursor: help;
}

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
