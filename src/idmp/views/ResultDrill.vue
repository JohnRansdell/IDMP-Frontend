<template>
  <div class="idmp-page result-drill">
    <PageHeader
      :title="`${indicatorName} · 结果下钻`"
      :status-label="drillResult.dataSource === 'mock' ? '演示数据' : '接口数据'"
      status-tone="info"
    >
      <template #meta>
        <span>结果 <strong class="mono-data">{{ drillResult.context.resultId || resultId }}</strong></span>
        <span>快照 <strong class="mono-data">{{ drillResult.context.snapshotId || '-' }}</strong></span>
        <span>周期 <strong>{{ drillResult.context.period || period }}</strong></span>
      </template>
      <template #actions>
        <el-button @click="goBackToAnalysis">返回指标分析</el-button>
      </template>
    </PageHeader>

    <section class="surface-card drill-context">
      <div class="drill-context__heading">
        <div>
          <h2>下钻维度</h2>
          <p>当前先开放组织维度汇总下钻；病例与原始记录仍受权限和后端接口控制。</p>
        </div>
        <el-tag type="info">组织维度</el-tag>
      </div>
      <div class="drill-levels" aria-label="组织下钻层级">
        <span
          v-for="item in levelTrail"
          :key="item.level"
          class="drill-level"
          :class="{ 'is-current': item.level === currentLevel }"
        >
          {{ item.label }}
        </span>
      </div>
    </section>

    <section class="surface-card drill-breadcrumb" aria-label="下钻面包屑">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item
          v-for="(item, index) in drillResult.breadcrumb"
          :key="`${item.level}-${item.key}`"
        >
          <button
            v-if="index < drillResult.breadcrumb.length - 1"
            type="button"
            class="breadcrumb-button"
            @click="goToBreadcrumb(index)"
          >
            {{ item.label }}
          </button>
          <span v-else>{{ item.label }}</span>
        </el-breadcrumb-item>
      </el-breadcrumb>
    </section>

    <section class="drill-summary-grid" aria-label="当前层汇总">
      <article class="surface-card drill-summary-card">
        <span>指标值</span>
        <strong>{{ drillResult.summary.indicatorValue || '-' }}</strong>
      </article>
      <article class="surface-card drill-summary-card">
        <span>分子</span>
        <strong>{{ drillResult.summary.numerator ?? '-' }}</strong>
      </article>
      <article class="surface-card drill-summary-card">
        <span>分母</span>
        <strong>{{ drillResult.summary.denominator ?? '-' }}</strong>
      </article>
      <article class="surface-card drill-summary-card">
        <span>数据状态</span>
        <strong>{{ drillResult.summary.qualityStatus || '-' }}</strong>
      </article>
    </section>

    <section class="surface-card drill-table-panel">
      <div class="table-heading">
        <div>
          <h2>{{ currentLevelLabel }}明细</h2>
          <p>每层独立请求和分页；下一层入口由接口返回的 nextLevels 决定。</p>
        </div>
        <StatusBadge :status="loading ? 'RUNNING' : 'ACTIVE'" :label="loading ? '加载中' : `${drillResult.pageInfo.total} 条记录`" />
      </div>

      <StatePanel v-if="errorMessage" type="error" title="下钻数据加载失败" :description="errorMessage">
        <template #actions><el-button size="small" @click="loadDrill">重试</el-button></template>
      </StatePanel>
      <StatePanel v-else-if="!loading && !drillResult.records.length" type="empty" title="当前层暂无数据" description="当前口径下没有可展示的组织记录。" />
      <div v-else class="table-scroll">
        <el-table v-loading="loading" :data="drillResult.records" table-layout="fixed" class="analysis-table">
          <el-table-column
            v-for="column in drillResult.columns"
            :key="column.field"
            :prop="column.field"
            :label="column.label"
            :sortable="column.sortable ? 'custom' : false"
            min-width="150"
          >
            <template #default="{ row }">
              <span v-if="column.field === 'qualityStatus'">{{ row[column.field] || '-' }}</span>
              <strong v-else-if="column.field === 'dimensionLabel'">{{ row[column.field] || '-' }}</strong>
              <span v-else>{{ row[column.field] ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openNextLevel(row)">
                {{ row.nextLevel === 'PATIENT' ? '查看病例' : '继续下钻' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <section v-if="currentLevel === 'DOCTOR'" class="surface-card drill-security-note">
      <StatePanel
        type="permission"
        title="病例级访问暂未开放"
        description="当前仅完成组织维度的 Mock 汇总链路。患者访问还需要后端数据范围、脱敏、访问目的和审计接口。"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { searchResultDrill } from '@/idmp/api/modules/drill'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const errorMessage = ref('')
const drillResult = ref(emptyResult())

const resultId = computed(() => String(route.query.resultId || 'MOCK-RESULT-001'))
const indicatorName = computed(() => String(route.query.indicatorName || '手术患者并发症发生率'))
const period = computed(() => String(route.query.period || '2026-06'))
const currentLevel = computed(() => String(route.query.currentLevel || 'HOSPITAL'))
const currentLevelLabel = computed(() => ({ HOSPITAL: '科室', DEPARTMENT: '医疗组', MEDICAL_GROUP: '医师', DOCTOR: '病例' }[currentLevel.value] || '当前层'))
const levelTrail = [
  { level: 'HOSPITAL', label: '全院' },
  { level: 'DEPARTMENT', label: '科室' },
  { level: 'MEDICAL_GROUP', label: '医疗组' },
  { level: 'DOCTOR', label: '医师' }
]

function emptyResult() {
  return { context: {}, breadcrumb: [], summary: {}, columns: [], records: [], nextLevels: [], pageInfo: { total: 0 }, dataSource: 'mock' }
}

function parentKeysFromRoute() {
  return {
    departmentKey: route.query.departmentKey ? String(route.query.departmentKey) : '',
    departmentLabel: route.query.departmentLabel ? String(route.query.departmentLabel) : '',
    medicalGroupKey: route.query.medicalGroupKey ? String(route.query.medicalGroupKey) : '',
    medicalGroupLabel: route.query.medicalGroupLabel ? String(route.query.medicalGroupLabel) : '',
    doctorKey: route.query.doctorKey ? String(route.query.doctorKey) : '',
    doctorLabel: route.query.doctorLabel ? String(route.query.doctorLabel) : ''
  }
}

async function loadDrill() {
  loading.value = true
  errorMessage.value = ''
  try {
    drillResult.value = await searchResultDrill(resultId.value, {
      snapshotId: route.query.snapshotId ? String(route.query.snapshotId) : undefined,
      currentLevel: currentLevel.value,
      parentKeys: parentKeysFromRoute(),
      filters: { period: period.value, scenarioId: route.query.scenarioId ? String(route.query.scenarioId) : undefined },
      pageNum: Number(route.query.pageNum || 1),
      pageSize: 20,
      sort: [{ field: 'indicatorValue', direction: 'DESC' }]
    }, { source: 'mock' })
  } catch (error) {
    errorMessage.value = error?.message || '请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openNextLevel(row) {
  if (row.nextLevel === 'PATIENT') return
  const nextLevel = row.nextLevel || drillResult.value.nextLevels[0]
  if (!nextLevel) return
  const query = { ...route.query, currentLevel: nextLevel }
  if (currentLevel.value === 'HOSPITAL') Object.assign(query, { departmentKey: row.dimensionKey, departmentLabel: row.dimensionLabel })
  if (currentLevel.value === 'DEPARTMENT') Object.assign(query, { medicalGroupKey: row.dimensionKey, medicalGroupLabel: row.dimensionLabel })
  if (currentLevel.value === 'MEDICAL_GROUP') Object.assign(query, { doctorKey: row.dimensionKey, doctorLabel: row.dimensionLabel })
  router.push({ name: 'ResultDrill', query })
}

function goToBreadcrumb(index) {
  const item = drillResult.value.breadcrumb[index]
  if (!item) return
  const query = { ...route.query, currentLevel: item.level }
  if (item.level === 'HOSPITAL') {
    delete query.departmentKey; delete query.departmentLabel; delete query.medicalGroupKey; delete query.medicalGroupLabel; delete query.doctorKey; delete query.doctorLabel
  }
  if (item.level === 'DEPARTMENT') {
    delete query.medicalGroupKey; delete query.medicalGroupLabel; delete query.doctorKey; delete query.doctorLabel
  }
  if (item.level === 'MEDICAL_GROUP') {
    delete query.doctorKey; delete query.doctorLabel
  }
  router.push({ name: 'ResultDrill', query })
}

function goBackToAnalysis() {
  router.push({ path: '/analysis', query: { indicator: route.query.indicator || undefined } })
}

watch(() => route.fullPath, loadDrill)
onMounted(loadDrill)
</script>

<style scoped>
.drill-context,
.drill-breadcrumb,
.drill-table-panel,
.drill-security-note {
  margin-bottom: 16px;
}

.drill-context__heading,
.table-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.drill-context h2,
.drill-table-panel h2 {
  margin: 0;
  font-size: 16px;
}

.drill-context p,
.drill-table-panel p {
  margin: 6px 0 0;
  color: var(--idmp-text-secondary);
  font-size: 13px;
}

.drill-levels {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.drill-level {
  padding: 6px 12px;
  border: 1px solid var(--idmp-border-subtle);
  color: var(--idmp-text-secondary);
}

.drill-level.is-current {
  border-color: var(--idmp-interactive);
  color: var(--idmp-interactive);
  font-weight: 600;
}

.breadcrumb-button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--idmp-interactive);
  cursor: pointer;
}

.drill-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.drill-summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drill-summary-card span {
  color: var(--idmp-text-secondary);
  font-size: 13px;
}

.drill-summary-card strong {
  font-size: 22px;
}

.drill-security-note :deep(.state-panel) {
  margin-top: 0;
}

@media (max-width: 900px) {
  .drill-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
