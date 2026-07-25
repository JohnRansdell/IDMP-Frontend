<template>
  <div class="idmp-page alert-center">
    <PageHeader
      eyebrow="总览与分析 / 预警中心"
      title="预警中心"
      description="查看指标异常、触发阈值与处理状态；当前标记仅保存在本次演示会话。"
      status-label="演示数据"
      status-tone="info"
    >
      <template #meta>
        <span class="data-source-badge">本地静态数据</span>
        <span>样例预警 {{ rows.length }} 条</span>
        <span>统计口径 演示总览</span>
      </template>
    </PageHeader>

    <div class="notice-strip alert-notice" role="note">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>
        页面数据来自本地演示配置。查看操作只呈现样例摘要，标记处理只修改当前页面状态；刷新后会恢复，且不会写入后端或产生审计记录。
      </span>
    </div>

    <section class="surface-card alert-summary" aria-labelledby="alert-summary-title">
      <div class="alert-summary__lead">
        <span id="alert-summary-title">预警总览</span>
        <strong class="clinical-metric">{{ overviewTotal }}</strong>
        <small>演示统计口径，不等同于下方 {{ rows.length }} 条样例</small>
      </div>
      <dl class="alert-summary__metrics">
        <div v-for="item in alertStats" :key="item.label">
          <dt>
            <StatusBadge :label="item.label" :tone="summaryTone(item.tone)" />
          </dt>
          <dd class="clinical-metric">{{ item.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="surface-card filter-card alert-filter" aria-label="预警筛选">
      <el-form :model="filters" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="filters.keyword"
            clearable
            :prefix-icon="Search"
            placeholder="指标、类型或场景"
            aria-label="指标、类型或场景"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.level" clearable placeholder="预警级别" aria-label="预警级别">
            <el-option v-for="item in alertLevels" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.status" clearable placeholder="处理状态" aria-label="处理状态">
            <el-option v-for="item in alertStatuses" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item class="alert-filter__actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="surface-card alert-table-card" aria-labelledby="alert-table-title">
      <div class="alert-table-heading">
        <div>
          <h2 id="alert-table-title">预警列表</h2>
          <p>共 {{ filteredRows.length }} 条匹配记录；按演示预警时间倒序展示。</p>
        </div>
        <span class="data-source-badge">本地样例</span>
      </div>

      <StatePanel
        v-if="!filteredRows.length"
        type="empty"
        title="没有匹配的预警"
        description="请调整指标关键词、预警级别或处理状态。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
        </template>
      </StatePanel>

      <div v-else class="table-scroll alert-table-scroll">
        <el-table :data="filteredRows" table-layout="fixed" class="alert-table">
          <el-table-column label="预警级别" width="112">
            <template #default="{ row }">
              <StatusBadge :label="row.level" :tone="levelTone(row.level)" />
            </template>
          </el-table-column>
          <el-table-column prop="type" label="预警类型" width="132" />
          <el-table-column
            prop="indicator"
            label="指标名称"
            min-width="220"
            show-overflow-tooltip
          />
          <el-table-column prop="scene" label="所属场景" width="126" />
          <el-table-column label="实际值" width="122">
            <template #default="{ row }">
              <strong class="clinical-metric">{{ row.actual }}</strong>
            </template>
          </el-table-column>
          <el-table-column
            prop="threshold"
            label="预警阈值"
            min-width="148"
            show-overflow-tooltip
          />
          <el-table-column prop="time" label="预警时间" width="128">
            <template #default="{ row }">
              <span class="mono-data">{{ row.time }}</span>
            </template>
          </el-table-column>
          <el-table-column label="处理状态" width="116">
            <template #default="{ row }">
              <StatusBadge :status="statusCode(row.status)" :label="row.status" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="184" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="viewAlert(row)">
                查看摘要
              </button>
              <button
                class="action-link"
                type="button"
                :disabled="row.status === '已确认'"
                @click="confirmHandled(row)"
              >
                {{ row.status === '已确认' ? '已处理' : '会话内标记' }}
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { InfoFilled, RefreshLeft, Search } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { alertRows, alertStats } from '@/idmp/data/demo'

const rows = ref(alertRows.map((item) => ({ ...item })))

const emptyFilters = () => ({
  keyword: '',
  level: '',
  status: ''
})

const filters = reactive(emptyFilters())
const appliedFilters = ref(emptyFilters())

const overviewTotal = computed(() =>
  alertStats
    .filter((item) => item.label !== '待处理')
    .reduce((total, item) => total + Number(item.value || 0), 0)
)

const alertLevels = computed(() => [...new Set(rows.value.map((item) => item.level))])
const alertStatuses = computed(() => [...new Set(rows.value.map((item) => item.status))])

const filteredRows = computed(() => {
  const query = appliedFilters.value
  const keyword = query.keyword.toLowerCase()

  return rows.value.filter((row) => {
    const matchesKeyword = !keyword || [
      row.indicator,
      row.type,
      row.scene
    ].some((value) => String(value).toLowerCase().includes(keyword))

    return matchesKeyword
      && (!query.level || row.level === query.level)
      && (!query.status || row.status === query.status)
  })
})

const summaryTone = (tone) => {
  if (tone === 'danger') return 'danger'
  if (tone === 'warning' || tone === 'pending') return 'warning'
  return 'info'
}

const levelTone = (level) => {
  if (level === '严重') return 'danger'
  if (level === '警告') return 'warning'
  return 'info'
}

const statusCode = (status) => {
  if (status === '待处理') return 'PENDING'
  if (status === '处理中') return 'RUNNING'
  return 'SUCCEEDED'
}

const applyFilters = () => {
  appliedFilters.value = { ...filters }
}

const resetFilters = () => {
  Object.assign(filters, emptyFilters())
  appliedFilters.value = emptyFilters()
}

const viewAlert = (row) => {
  ElMessage.info(
    `${row.indicator}：${row.type}，实际值 ${row.actual}，阈值 ${row.threshold}。当前为本地演示摘要。`
  )
}

const confirmHandled = async (row) => {
  if (row.status === '已确认') return

  try {
    await ElMessageBox.confirm(
      `仅在当前演示会话中将“${row.indicator}”标记为已处理？`,
      '会话内标记',
      {
        confirmButtonText: '标记为已处理',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    row.status = '已确认'
    ElMessage.info('已更新当前页面状态；刷新页面后会恢复，未写入后端。')
  } catch {
    // 用户取消时保持原状态。
  }
}
</script>

<style scoped lang="scss">
.alert-center {
  min-width: 0;
}

.alert-notice,
.alert-summary,
.alert-filter {
  margin-bottom: var(--idmp-space-4);
}

.alert-summary {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2.2fr);
}

.alert-summary__lead {
  display: grid;
  align-content: center;
  min-height: 104px;
  padding: var(--idmp-space-4);
  gap: var(--idmp-space-1);
  border-right: 1px solid var(--idmp-border-subtle);
}

.alert-summary__lead > span {
  color: var(--idmp-text-secondary);
  font-weight: 600;
}

.alert-summary__lead strong {
  color: var(--idmp-text-primary);
  font-size: 28px;
  line-height: 32px;
}

.alert-summary__lead small {
  color: var(--idmp-text-helper);
  line-height: 18px;
}

.alert-summary__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.alert-summary__metrics > div {
  display: grid;
  align-content: center;
  min-width: 0;
  padding: var(--idmp-space-3) var(--idmp-space-4);
  border-right: 1px solid var(--idmp-border-soft);
}

.alert-summary__metrics > div:last-child {
  border-right: 0;
}

.alert-summary__metrics dt {
  min-height: 24px;
}

.alert-summary__metrics dd {
  margin: var(--idmp-space-2) 0 0;
  color: var(--idmp-text-primary);
  font-size: 20px;
  font-weight: 650;
}

.alert-filter :deep(.el-input) {
  width: 248px;
}

.alert-filter :deep(.el-select) {
  width: 144px;
}

.alert-filter__actions {
  margin-left: auto !important;
}

.alert-table-card {
  padding: 0;
  overflow: hidden;
}

.alert-table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--idmp-space-4);
  gap: var(--idmp-space-4);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.alert-table-heading h2 {
  margin: 0;
  color: var(--idmp-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.alert-table-heading p {
  margin: var(--idmp-space-1) 0 0;
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.alert-table-scroll {
  padding: 0 var(--idmp-space-4) var(--idmp-space-4);
}

.alert-table {
  min-width: 1200px;
}

.action-link:disabled {
  color: var(--idmp-text-disabled);
  cursor: not-allowed;
}

.action-link:disabled:hover {
  color: var(--idmp-text-disabled);
}

@media (max-width: 1280px) {
  .alert-summary {
    grid-template-columns: 1fr;
  }

  .alert-summary__lead {
    min-height: 88px;
    border-right: 0;
    border-bottom: 1px solid var(--idmp-border-subtle);
  }
}
</style>
