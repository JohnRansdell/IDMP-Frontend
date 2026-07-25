<template>
  <div class="idmp-page indicator-mapping">
    <PageHeader
      eyebrow="指标配置 / 指标映射"
      title="指标映射管理"
      description="核对跨政策文件的指标关系、置信度与差异说明；当前审核只保存在本次演示会话。"
      status-label="演示数据"
      status-tone="info"
    >
      <template #meta>
        <span class="data-source-badge">本地静态数据</span>
        <span>示例关系 {{ rows.length }} 条</span>
        <span>映射总览口径 {{ overviewTotal }}</span>
      </template>
      <template #actions>
        <el-tooltip content="后端尚未提供手工映射创建接口" placement="bottom">
          <span class="disabled-action">
            <el-button :icon="Plus" disabled>手动创建映射</el-button>
          </span>
        </el-tooltip>
        <el-tooltip content="后端尚未提供自动推荐接口" placement="bottom">
          <span class="disabled-action">
            <el-button :icon="MagicStick" disabled>自动推荐</el-button>
          </span>
        </el-tooltip>
      </template>
    </PageHeader>

    <div class="notice-strip mapping-notice" role="note">
      <el-icon aria-hidden="true"><InfoFilled /></el-icon>
      <span>
        页面使用演示数据。审核操作只修改浏览器内的当前列表，不会产生后端审核记录；创建、推荐、导入与报告能力均未接入。
      </span>
    </div>

    <section class="surface-card mapping-overview" aria-labelledby="mapping-overview-title">
      <div class="mapping-overview__lead">
        <span id="mapping-overview-title">映射总览</span>
        <strong class="clinical-metric">{{ overviewTotal }}</strong>
        <small>演示统计口径，不等同于下方 {{ rows.length }} 条样例</small>
      </div>
      <dl class="mapping-overview__metrics">
        <div v-for="item in overviewBreakdown" :key="item.label">
          <dt>{{ item.label }}</dt>
          <dd class="clinical-metric">{{ item.value }}</dd>
        </div>
      </dl>
    </section>

    <section class="surface-card filter-card mapping-filter" aria-label="映射筛选">
      <el-form :model="filters" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="filters.keyword"
            clearable
            :prefix-icon="Search"
            placeholder="指标编码或名称"
            aria-label="指标编码或名称"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.type" clearable placeholder="映射类型" aria-label="映射类型">
            <el-option v-for="item in mappingTypes" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="filters.status" clearable placeholder="审核状态" aria-label="审核状态">
            <el-option v-for="item in reviewStatuses" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item class="mapping-filter__actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="RefreshLeft" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section class="surface-card mapping-table-card" aria-labelledby="mapping-table-title">
      <div class="mapping-table-heading">
        <div>
          <h2 id="mapping-table-title">映射关系列表</h2>
          <p>共 {{ filteredRows.length }} 条匹配记录；会话内审核不会写入后端。</p>
        </div>
        <div class="mapping-table-heading__actions">
          <el-tooltip content="后端尚未提供映射报告生成接口" placement="bottom">
            <span class="disabled-action">
              <el-button :icon="Document" disabled>生成报告</el-button>
            </span>
          </el-tooltip>
          <el-tooltip content="后端尚未提供映射批量导入接口" placement="bottom">
            <span class="disabled-action">
              <el-button :icon="Upload" disabled>批量导入</el-button>
            </span>
          </el-tooltip>
        </div>
      </div>

      <StatePanel
        v-if="!filteredRows.length"
        type="empty"
        title="没有匹配的映射关系"
        description="请调整指标关键词、映射类型或审核状态。"
      >
        <template #actions>
          <el-button @click="resetFilters">清除筛选</el-button>
        </template>
      </StatePanel>

      <div v-else class="table-scroll mapping-table-scroll">
        <el-table :data="filteredRows" table-layout="fixed" class="mapping-table">
          <el-table-column label="源指标" min-width="250">
            <template #default="{ row }">
              <div class="indicator-cell">
                <span class="indicator-cell__code mono-data">{{ row.sourceCode }}</span>
                <span class="indicator-cell__name">{{ row.sourceName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="目标指标" min-width="250">
            <template #default="{ row }">
              <div class="indicator-cell">
                <span class="indicator-cell__code mono-data">{{ row.targetCode }}</span>
                <span class="indicator-cell__name">{{ row.targetName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="映射类型" width="142">
            <template #default="{ row }">
              <StatusBadge
                :label="row.type"
                :tone="row.type === '完全一致' ? 'success' : 'warning'"
              />
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="126">
            <template #default="{ row }">
              <div class="confidence-cell">
                <strong class="clinical-metric">{{ row.confidence }}%</strong>
                <span>{{ row.confidence >= 90 ? '高' : '需复核' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="审核状态" width="132">
            <template #default="{ row }">
              <StatusBadge
                :status="row.status === '已审核' ? 'SUCCEEDED' : 'PENDING'"
                :label="row.status"
              />
            </template>
          </el-table-column>
          <el-table-column prop="difference" label="差异说明" min-width="240" show-overflow-tooltip />
          <el-table-column label="操作" width="176" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="viewMapping(row)">
                查看
              </button>
              <button
                v-if="row.status === '待审核'"
                class="action-link"
                type="button"
                @click="reviewMapping(row)"
              >
                会话内审核
              </button>
              <span v-else class="mapping-reviewed">已审核</span>
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
import {
  Document,
  InfoFilled,
  MagicStick,
  Plus,
  RefreshLeft,
  Search,
  Upload
} from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { mappingRows, mappingStats } from '@/idmp/data/demo'

const rows = ref(mappingRows.map((item) => ({ ...item })))

const emptyFilters = () => ({
  keyword: '',
  type: '',
  status: ''
})

const filters = reactive(emptyFilters())
const appliedFilters = ref(emptyFilters())

const overviewTotal = computed(() => mappingStats[0]?.value ?? rows.value.length)
const overviewBreakdown = computed(() => mappingStats.slice(1))
const mappingTypes = computed(() => [...new Set(rows.value.map((item) => item.type))])
const reviewStatuses = computed(() => [...new Set(rows.value.map((item) => item.status))])

const filteredRows = computed(() => {
  const query = appliedFilters.value
  const keyword = query.keyword.toLowerCase()
  return rows.value.filter((row) => {
    const matchesKeyword = !keyword || [
      row.sourceCode,
      row.sourceName,
      row.targetCode,
      row.targetName
    ].some((value) => String(value).toLowerCase().includes(keyword))

    return matchesKeyword
      && (!query.type || row.type === query.type)
      && (!query.status || row.status === query.status)
  })
})

const applyFilters = () => {
  appliedFilters.value = { ...filters }
}

const resetFilters = () => {
  Object.assign(filters, emptyFilters())
  appliedFilters.value = emptyFilters()
}

const viewMapping = (row) => {
  const difference = row.difference === '—' ? '无已记录差异' : row.difference
  ElMessage.info(`${row.sourceCode} → ${row.targetCode}：${difference}`)
}

const reviewMapping = async (row) => {
  try {
    await ElMessageBox.confirm(
      `仅在当前演示会话中将 ${row.sourceCode} 与 ${row.targetCode} 标记为已审核？`,
      '会话内审核',
      {
        confirmButtonText: '标记为已审核',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    row.status = '已审核'
    ElMessage.info('已更新当前页面状态；刷新页面后会恢复，未写入后端。')
  } catch {
    // 用户取消时保持原状态。
  }
}
</script>

<style scoped lang="scss">
.indicator-mapping {
  min-width: 0;
}

.disabled-action {
  display: inline-flex;
}

.mapping-notice,
.mapping-overview,
.mapping-filter {
  margin-bottom: var(--idmp-space-4);
}

.mapping-overview {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2.2fr);
}

.mapping-overview__lead {
  display: grid;
  align-content: center;
  min-height: 104px;
  padding: var(--idmp-space-4);
  gap: var(--idmp-space-1);
  border-right: 1px solid var(--idmp-border-subtle);
}

.mapping-overview__lead > span {
  color: var(--idmp-text-secondary);
  font-weight: 600;
}

.mapping-overview__lead strong {
  color: var(--idmp-text-primary);
  font-size: 28px;
  line-height: 32px;
}

.mapping-overview__lead small {
  color: var(--idmp-text-helper);
  line-height: 18px;
}

.mapping-overview__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
}

.mapping-overview__metrics > div {
  display: grid;
  align-content: center;
  min-width: 0;
  padding: var(--idmp-space-3) var(--idmp-space-4);
  border-right: 1px solid var(--idmp-border-soft);
}

.mapping-overview__metrics > div:last-child {
  border-right: 0;
}

.mapping-overview__metrics dt {
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.mapping-overview__metrics dd {
  margin: var(--idmp-space-1) 0 0;
  color: var(--idmp-text-primary);
  font-size: 20px;
  font-weight: 650;
}

.mapping-filter :deep(.el-input) {
  width: 248px;
}

.mapping-filter :deep(.el-select) {
  width: 144px;
}

.mapping-filter__actions {
  margin-left: auto !important;
}

.mapping-table-card {
  padding: 0;
  overflow: hidden;
}

.mapping-table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--idmp-space-4);
  gap: var(--idmp-space-4);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.mapping-table-heading h2 {
  margin: 0;
  color: var(--idmp-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.mapping-table-heading p {
  margin: var(--idmp-space-1) 0 0;
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.mapping-table-heading__actions {
  display: flex;
  align-items: center;
  gap: var(--idmp-space-2);
}

.mapping-table-scroll {
  padding: 0 var(--idmp-space-4) var(--idmp-space-4);
}

.mapping-table {
  min-width: 1140px;
}

.indicator-cell {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.indicator-cell__code,
.indicator-cell__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.indicator-cell__code {
  color: var(--idmp-interactive);
  font-size: 12px;
}

.indicator-cell__name {
  color: var(--idmp-text-primary);
}

.confidence-cell {
  display: flex;
  align-items: baseline;
  gap: var(--idmp-space-2);
}

.confidence-cell strong {
  color: var(--idmp-text-primary);
}

.confidence-cell span,
.mapping-reviewed {
  color: var(--idmp-text-helper);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .mapping-overview {
    grid-template-columns: 1fr;
  }

  .mapping-overview__lead {
    min-height: 88px;
    border-right: 0;
    border-bottom: 1px solid var(--idmp-border-subtle);
  }
}
</style>
