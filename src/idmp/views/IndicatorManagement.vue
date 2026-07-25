<template>
  <div class="idmp-page indicator-page">
    <PageHeader title="指标管理">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="openEditor('new')">新增指标</el-button>
        <el-button :icon="Upload" @click="unavailable">批量导入</el-button>
        <el-button :icon="Download" @click="unavailable">批量导出</el-button>
        <el-button-group class="view-switch">
          <el-button
            :type="viewMode === 'table' ? 'primary' : 'default'"
            :icon="Menu"
            aria-label="表格视图"
            @click="viewMode = 'table'"
          />
          <el-button
            :type="viewMode === 'card' ? 'primary' : 'default'"
            :icon="Grid"
            aria-label="卡片视图"
            @click="viewMode = 'card'"
          />
        </el-button-group>
      </template>
    </PageHeader>

    <section class="surface-card filter-card">
      <el-form :model="filters" aria-label="指标筛选">
        <el-form-item>
          <el-input v-model="filters.code" placeholder="指标编码" clearable class="filter-code" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="filters.name" placeholder="指标名称（模糊搜索）" clearable class="filter-name" />
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.category" placeholder="指标分类" clearable class="filter-select">
            <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.attribute" placeholder="指标属性" clearable class="filter-select small">
            <el-option label="定量" value="定量" />
            <el-option label="定性" value="定性" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.status" placeholder="状态" clearable class="filter-select small">
            <el-option v-for="item in statuses" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.direction" placeholder="指标导向" clearable class="filter-select">
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
      <div class="table-scroll">
        <el-table
          :data="pagedRows"
          v-loading="tableLoading"
          row-key="code"
          @selection-change="selectedRows = $event"
        >
          <el-table-column type="selection" width="46" />
          <el-table-column prop="code" label="指标编码" width="140">
            <template #default="{ row }">
              <button type="button" class="action-link" @click="showDetails(row)">{{ row.code }}</button>
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
              <span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="scenes" label="场景数" width="78" align="center" />
          <el-table-column label="操作" width="178" fixed="right">
            <template #default="{ row }">
              <button type="button" class="action-link" @click="showDetails(row)">查看</button>
              <button type="button" class="action-link" @click="openEditor(row.code)">编辑</button>
              <button type="button" class="action-link" @click="showMore(row)">更多</button>
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
          :page-sizes="[6, 8, 12]"
          :total="filteredRows.length"
        />
      </div>
    </section>

    <section v-else class="indicator-card-wrap">
      <div v-if="pagedRows.length" class="indicator-card-grid">
        <article v-for="row in pagedRows" :key="row.code" class="surface-card indicator-card">
          <div class="indicator-card__head">
            <button type="button" class="indicator-code" @click="showDetails(row)">{{ row.code }}</button>
            <span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span>
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
            <el-button @click="showDetails(row)">查看详情</el-button>
            <el-button type="primary" plain @click="openEditor(row.code)">编辑</el-button>
          </div>
        </article>
      </div>
      <div v-else class="surface-card empty-panel">没有符合条件的指标</div>
      <div class="pagination-row card-pagination">
        <span>共 {{ filteredRows.length }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          layout="prev, pager, next, sizes"
          :page-sizes="[6, 8, 12]"
          :total="filteredRows.length"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Grid, Menu, Plus, RefreshLeft, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { fetchIndicators } from '@/idmp/api/modules/indicators'
import { indicatorRows } from '@/idmp/data/demo'

const router = useRouter()
const viewMode = ref('table')
const currentPage = ref(1)
const pageSize = ref(8)
const selectedRows = ref([])
const tableLoading = ref(false)
const backendIndicatorRows = ref([])

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
const sourceRows = computed(() => backendIndicatorRows.value.length ? backendIndicatorRows.value : indicatorRows)
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
  try {
    const rows = await fetchIndicators()
    backendIndicatorRows.value = Array.isArray(rows) ? rows.map(toIndicatorRow) : []
  } catch {
    backendIndicatorRows.value = []
  } finally {
    tableLoading.value = false
  }
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
  id: item.id
})

const openEditor = id => router.push(`/indicator/edit/${id}`)
const unavailable = () => ElMessage.info('演示版暂不可用')
const showDetails = row => ElMessage.success(`正在查看：${row.name}`)
const showMore = row => {
  ElMessageBox.confirm(`对“${row.name}”执行更多操作？`, '操作确认', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => ElMessage.success('演示操作已确认')).catch(() => {})
}

const statusClass = status => ({
  '草稿': 'is-warning',
  '待审核': 'is-info',
  '已停用': 'is-muted',
  DRAFT: 'is-warning',
  PUBLISHED: '',
  DISABLED: 'is-muted'
}[status] || '')

const directionClass = direction => {
  if (direction.includes('提高')) return 'direction-up'
  if (direction.includes('降低')) return 'direction-down'
  return 'direction-neutral'
}

onMounted(() => {
  loadBackendIndicators()
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

.direction-up { color: #52c41a; }
.direction-down { color: #f5222d; }
.direction-neutral { color: #1890ff; }

.indicator-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.indicator-card {
  min-height: 252px;
  padding: 18px;
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
  color: #1890ff;
  cursor: pointer;
  font-weight: 600;
}

.indicator-card h2 {
  min-height: 48px;
  margin: 14px 0 12px;
  color: #262626;
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
  color: #8c8c8c;
}

.indicator-card dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #595959;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indicator-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #f0f0f0;
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
