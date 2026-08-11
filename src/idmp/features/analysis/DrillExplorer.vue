<template>
  <div class="drill-explorer">
    <div class="drill-context-bar">
      <div class="drill-context-bar__filters">
        <el-select v-model="dimension" size="small" aria-label="下钻维度" class="drill-dimension-select">
          <el-option label="组织维度" value="ORGANIZATION" />
          <el-option label="时间维度（演示）" value="TIME" disabled />
          <el-option label="病种维度（待接入）" value="DISEASE" disabled />
          <el-option label="因子维度（待接入）" value="FACTOR" disabled />
          <el-option label="场景维度（待接入）" value="SCENARIO" disabled />
        </el-select>
        <span class="drill-context-bar__period">统计周期：{{ period }}</span>
        <span class="drill-context-bar__source">{{ result.dataSource === 'mock' ? '演示数据' : '接口数据' }}</span>
      </div>
      <el-button v-if="!embedded" size="small" @click="backToAnalysis">返回指标分析</el-button>
    </div>

    <div class="drill-breadcrumb" aria-label="下钻面包屑">
      <button
        v-for="(item, index) in result.breadcrumb"
        :key="`${item.level}-${item.key}`"
        type="button"
        class="drill-breadcrumb__item"
        :class="{ 'is-current': index === result.breadcrumb.length - 1 }"
        @click="goToBreadcrumb(index)"
      >
        {{ item.label }}<span v-if="index < result.breadcrumb.length - 1" class="drill-breadcrumb__separator">/</span>
      </button>
    </div>

    <div class="drill-summary-strip" aria-label="当前层汇总">
      <div><span>指标值</span><strong>{{ result.summary.indicatorValue || '-' }}</strong></div>
      <div><span>分子</span><strong>{{ result.summary.numerator ?? '-' }}</strong></div>
      <div><span>分母</span><strong>{{ result.summary.denominator ?? '-' }}</strong></div>
      <div><span>质量状态</span><strong>{{ result.summary.qualityStatus || '-' }}</strong></div>
    </div>

    <div class="drill-table-heading">
      <div>
        <h3>当前层：{{ currentLevelLabel }}</h3>
        <p>下一层入口由下钻配置和接口返回的 nextLevels 决定。</p>
      </div>
      <span class="drill-table-heading__count">{{ result.pageInfo.total || 0 }} 条</span>
    </div>

    <StatePanel v-if="errorMessage" type="error" title="下钻数据加载失败" :description="errorMessage">
      <template #actions><el-button size="small" @click="loadDrill">重试</el-button></template>
    </StatePanel>
    <StatePanel v-else-if="!loading && !result.records.length" type="empty" title="当前层暂无数据" description="当前口径下没有可展示的记录。" />
    <div v-else class="table-scroll">
      <el-table v-loading="loading" :data="result.records" table-layout="fixed" class="analysis-table drill-data-table">
        <el-table-column
          v-for="column in result.columns"
          :key="column.field"
          :prop="column.field"
          :label="column.label"
          :sortable="column.sortable ? 'custom' : false"
          min-width="140"
        >
          <template #default="{ row }">
            <strong v-if="column.field === 'dimensionLabel'">{{ row[column.field] || '-' }}</strong>
            <span v-else>{{ row[column.field] ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="118" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.nextLevel === 'PATIENT'" @click="openNextLevel(row)">
              {{ row.nextLevel === 'PATIENT' ? '病例权限' : '继续下钻' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="currentLevel === 'DOCTOR'" class="drill-access-hint">
      病例级访问需要后端数据范围、脱敏、访问目的和审计能力，当前仅展示医师汇总。
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { searchResultDrill } from '@/idmp/api/modules/drill'

const props = defineProps({
  resultId: { type: [String, Number], default: 'MOCK-RESULT-001' },
  indicatorName: { type: String, default: '手术患者并发症发生率' },
  period: { type: String, default: '2026-06' },
  startLevel: { type: String, default: 'HOSPITAL' },
  startParentKeys: { type: Object, default: () => ({}) },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['level-change'])
const route = useRoute()
const router = useRouter()
const dimension = ref('ORGANIZATION')
const currentLevel = ref(props.startLevel)
const parentKeys = ref({ ...props.startParentKeys })
const result = ref(emptyResult())
const loading = ref(false)
const errorMessage = ref('')

const currentLevelLabel = computed(() => ({ HOSPITAL: '科室', DEPARTMENT: '医疗组', MEDICAL_GROUP: '医师', DOCTOR: '病例' }[currentLevel.value] || '当前层'))

function emptyResult() {
  return { context: {}, breadcrumb: [{ level: 'HOSPITAL', label: '全院', key: 'HOSPITAL' }], summary: {}, columns: [], records: [], nextLevels: [], pageInfo: { total: 0 }, dataSource: 'mock' }
}

function buildPayload() {
  return {
    currentLevel: currentLevel.value,
    parentKeys: parentKeys.value,
    filters: { period: props.period },
    pageNum: 1,
    pageSize: 20,
    sort: [{ field: 'indicatorValue', direction: 'DESC' }]
  }
}

async function loadDrill() {
  loading.value = true
  errorMessage.value = ''
  try {
    result.value = await searchResultDrill(props.resultId, buildPayload(), { source: 'mock' })
  } catch (error) {
    errorMessage.value = error?.message || '请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openNextLevel(row) {
  if (row.nextLevel === 'PATIENT') return
  const nextLevel = row.nextLevel || result.value.nextLevels[0]
  if (!nextLevel) return
  if (props.embedded) {
    const nextKeys = { ...parentKeys.value }
    if (currentLevel.value === 'HOSPITAL') Object.assign(nextKeys, { departmentKey: row.dimensionKey, departmentLabel: row.dimensionLabel })
    if (currentLevel.value === 'DEPARTMENT') Object.assign(nextKeys, { medicalGroupKey: row.dimensionKey, medicalGroupLabel: row.dimensionLabel })
    if (currentLevel.value === 'MEDICAL_GROUP') Object.assign(nextKeys, { doctorKey: row.dimensionKey, doctorLabel: row.dimensionLabel })
    parentKeys.value = nextKeys
    currentLevel.value = nextLevel
    emit('level-change', { currentLevel: nextLevel, parentKeys: nextKeys })
    loadDrill()
    return
  }
  const query = { ...route.query, currentLevel: nextLevel }
  if (currentLevel.value === 'HOSPITAL') Object.assign(query, { departmentKey: row.dimensionKey, departmentLabel: row.dimensionLabel })
  if (currentLevel.value === 'DEPARTMENT') Object.assign(query, { medicalGroupKey: row.dimensionKey, medicalGroupLabel: row.dimensionLabel })
  if (currentLevel.value === 'MEDICAL_GROUP') Object.assign(query, { doctorKey: row.dimensionKey, doctorLabel: row.dimensionLabel })
  router.push({ name: 'ResultDrill', query })
}

function goToBreadcrumb(index) {
  const item = result.value.breadcrumb[index]
  if (!item || index === result.value.breadcrumb.length - 1) return
  if (props.embedded) {
    currentLevel.value = item.level
    const nextKeys = { ...parentKeys.value }
    if (item.level === 'HOSPITAL') Object.keys(nextKeys).forEach((key) => delete nextKeys[key])
    if (item.level === 'DEPARTMENT') ['medicalGroupKey', 'medicalGroupLabel', 'doctorKey', 'doctorLabel'].forEach((key) => delete nextKeys[key])
    if (item.level === 'MEDICAL_GROUP') ['doctorKey', 'doctorLabel'].forEach((key) => delete nextKeys[key])
    parentKeys.value = nextKeys
    emit('level-change', { currentLevel: currentLevel.value, parentKeys: nextKeys })
    loadDrill()
  }
}

function backToAnalysis() {
  router.push({ path: '/analysis', query: { indicator: route.query.indicator || undefined } })
}

watch(() => [props.startLevel, props.startParentKeys], ([level, keys]) => {
  currentLevel.value = level
  parentKeys.value = { ...keys }
  loadDrill()
}, { deep: true })
onMounted(loadDrill)
</script>

<style scoped>
.drill-context-bar,
.drill-table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.drill-context-bar {
  min-height: 44px;
  padding: 0 12px;
  border-bottom: 1px solid var(--idmp-border-subtle);
  background: var(--idmp-layer-02);
}

.drill-context-bar__filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.drill-context-bar__period,
.drill-context-bar__source,
.drill-table-heading__count {
  color: var(--idmp-text-secondary);
  font-size: 12px;
}

.drill-context-bar__source {
  color: var(--idmp-interactive);
}

.drill-breadcrumb {
  display: flex;
  align-items: center;
  min-height: 42px;
  padding: 0 12px;
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.drill-breadcrumb__item {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--idmp-interactive);
  cursor: pointer;
  font-size: 13px;
}

.drill-breadcrumb__item.is-current {
  color: var(--idmp-text-primary);
  cursor: default;
}

.drill-breadcrumb__separator {
  margin: 0 8px;
  color: var(--idmp-text-helper);
}

.drill-summary-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.drill-summary-strip > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-right: 1px solid var(--idmp-border-subtle);
}

.drill-summary-strip > div:last-child {
  border-right: 0;
}

.drill-summary-strip span {
  color: var(--idmp-text-secondary);
  font-size: 12px;
}

.drill-summary-strip strong {
  font-size: 16px;
}

.drill-table-heading {
  padding: 16px 0 12px;
}

.drill-table-heading h3 {
  margin: 0;
  font-size: 16px;
}

.drill-table-heading p {
  margin: 4px 0 0;
  color: var(--idmp-text-secondary);
  font-size: 12px;
}

.drill-access-hint {
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 3px solid var(--idmp-support-warning);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-secondary);
  font-size: 12px;
}

@media (max-width: 900px) {
  .drill-summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .drill-summary-strip > div:nth-child(2) {
    border-right: 0;
  }
}
</style>
