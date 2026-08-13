<template>
  <div class="drill-explorer">
    <div class="drill-context-bar">
      <div class="drill-context-bar__filters">
        <el-select v-model="dimension" size="small" aria-label="下钻维度" class="drill-dimension-select">
          <el-option label="组织维度" value="ORGANIZATION" :disabled="!pathAvailable('ORGANIZATION')" />
          <el-option label="病种维度" value="DISEASE" :disabled="!pathAvailable('DISEASE')" />
          <el-option label="因子结果追溯" value="FACTOR_TRACE" />
          <el-option label="时间维度（待接入）" value="TIME" disabled />
          <el-option label="场景维度（待接入）" value="SCENARIO" disabled />
        </el-select>
        <span class="drill-context-bar__period">统计周期：{{ resolvedPeriod }}</span>
        <span class="drill-context-bar__source">{{ result.dataSource === 'mock' ? '演示数据' : '真实接口' }}</span>
        <el-button v-if="!isFactorTraceMode" size="small" @click="showFactorTrace">
          {{ factorTrace ? '刷新因子追溯' : '查看因子追溯' }}
        </el-button>
      </div>
      <el-button v-if="!embedded" size="small" @click="backToAnalysis">返回指标分析</el-button>
    </div>

    <template v-if="!isFactorTraceMode">
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
      <div><span>指标值</span><strong>{{ result.summary.displayValue || result.summary.indicatorValue || '-' }}</strong></div>
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
            <strong v-if="column.field === 'dimensionLabel' || column.field === 'dimensionName'">{{ row[column.field] || '-' }}</strong>
            <span v-else>{{ row[column.field] ?? '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="118" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="!row.nextLevel && !result.nextLevels.length" @click="openNextLevel(row)">
              {{ row.nextLevel || result.nextLevels.length ? '查看下一级' : '已到末级' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="currentLevel === 'DOCTOR' || currentLevel === 'CASE'" class="drill-access-hint">
      患者或业务记录级访问需要后端数据范围、脱敏、访问目的和审计能力；当前页面先展示后端返回的受控结果。
    </div>
    </template>

    <section v-if="isFactorTraceMode || factorTrace" class="factor-trace-panel" aria-label="因子结果追溯">
      <div class="drill-table-heading">
        <div><h3>因子结果追溯</h3><p>从当前指标结果追溯到公式中的分子、分母因子。</p></div>
        <span class="drill-table-heading__count">{{ factorTrace?.factors?.length || 0 }} 个因子</span>
      </div>
      <StatePanel v-if="factorTraceLoading" type="loading" title="正在加载因子追溯" />
      <StatePanel v-else-if="errorMessage" type="error" title="因子追溯加载失败" :description="errorMessage">
        <template #actions><el-button size="small" @click="loadFactorTrace">重试</el-button></template>
      </StatePanel>
      <el-table v-else-if="factorTrace" :data="factorTrace.factors || []" table-layout="fixed">
        <el-table-column prop="formulaRole" label="公式角色" width="120" />
        <el-table-column prop="factorName" label="因子" min-width="220" show-overflow-tooltip />
        <el-table-column prop="factorVersionId" label="因子版本" min-width="180" />
        <el-table-column label="结果匹配" width="110">
          <template #default="{ row }">{{ row.resultMatched ? '已匹配' : '未匹配' }}</template>
        </el-table-column>
        <el-table-column label="结果值" width="130">
          <template #default="{ row }">{{ row.result?.displayValue ?? row.result?.value ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="质量状态" width="130">
          <template #default="{ row }">{{ row.result?.qualityStatus || '-' }}</template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { fetchResultFactors, searchResultDrill } from '@/idmp/api/modules/drill'

const props = defineProps({
  resultId: { type: [String, Number], default: 'MOCK-RESULT-001' },
  snapshotId: { type: [String, Number], default: '' },
  pathResultIds: { type: Object, default: () => ({}) },
  indicatorName: { type: String, default: '手术患者并发症发生率' },
  period: { type: String, default: '2026-06' },
  startLevel: { type: String, default: 'HOSPITAL' },
  startParentKeys: { type: Object, default: () => ({}) },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['level-change'])
const route = useRoute()
const router = useRouter()
const initialDimension = inferDimensionFromLevel(props.startLevel)
const dimension = ref(initialDimension)
const lastDrillDimension = ref(initialDimension)
const currentLevel = ref(props.startLevel)
const parentKeys = ref({ ...props.startParentKeys })
const result = ref(emptyResult())
const loading = ref(false)
const errorMessage = ref('')
const factorTrace = ref(null)
const factorTraceLoading = ref(false)
const isFactorTraceMode = computed(() => dimension.value === 'FACTOR_TRACE')
const activeResultId = computed(() => String(
  props.pathResultIds?.[lastDrillDimension.value] || props.resultId || ''
))
const resolvedPeriod = computed(() => {
  const start = result.value.context?.periodStart
  const end = result.value.context?.periodEnd
  return start && end ? `${start} ～ ${end}` : (props.period || '由结果快照确定')
})

const currentLevelLabel = computed(() => ({
  HOSPITAL: '医院',
  OUT_DEPT: '科室',
  DEPARTMENT: '科室',
  MEDICAL_GROUP: '医疗组',
  ATTENDING_DOCTOR: '主治医师',
  DOCTOR: '医师',
  ALL_SINGLE_DISEASE: '全部病种',
  SINGLE_DISEASE: '单病种',
  CASE: '病例',
  PATIENT: '患者'
}[currentLevel.value] || '当前层'))

function emptyResult() {
  return { context: {}, breadcrumb: [], summary: {}, columns: [], records: [], nextLevels: [], pageInfo: { total: 0 }, dataSource: 'live' }
}

function buildPayload() {
  const payload = {
    parentKeys: parentKeys.value,
    filters: {},
    pageNum: 1,
    pageSize: 20,
    sort: [{ field: 'indicatorValue', direction: 'DESC' }]
  }
  if (currentLevel.value) payload.currentLevel = currentLevel.value
  return payload
}

async function loadDrill() {
  if (!activeResultId.value || isFactorTraceMode.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    result.value = await searchResultDrill(activeResultId.value, buildPayload(), { source: 'live' })
    currentLevel.value = result.value.context.currentLevel || currentLevel.value
  } catch (error) {
    errorMessage.value = error?.message || '请稍后重试。'
  } finally {
    loading.value = false
  }
}

function openNextLevel(row) {
  const nextLevel = row.nextLevel || result.value.nextLevels[0]
  if (!nextLevel) return
  const nextKeys = { ...parentKeys.value }
  const parentKey = parentKeyForLevel(currentLevel.value)
  if (parentKey && row.dimensionKey) nextKeys[parentKey] = row.dimensionKey
  parentKeys.value = nextKeys
  currentLevel.value = nextLevel
  emit('level-change', { currentLevel: nextLevel, parentKeys: nextKeys })
  if (!props.embedded) syncRouteContext()
  loadDrill()
}

function parentKeyForLevel(level) {
  return {
    HOSPITAL: 'HOSPITAL_CODE',
    OUT_DEPT: 'OUT_DEPT_CODE',
    DEPARTMENT: 'DEPARTMENT_CODE',
    MEDICAL_GROUP: 'MEDICAL_GROUP_CODE',
    ATTENDING_DOCTOR: 'ATTENDING_DOCTOR_CODE',
    ALL_SINGLE_DISEASE: 'HOSPITAL_CODE',
    SINGLE_DISEASE: 'SINGLE_DISEASE_CODE'
  }[level] || ''
}

async function loadFactorTrace() {
  if (!activeResultId.value) return
  factorTraceLoading.value = true
  errorMessage.value = ''
  try {
    factorTrace.value = await fetchResultFactors(activeResultId.value)
  } catch (error) {
    errorMessage.value = error?.message || '因子追溯加载失败。'
  } finally {
    factorTraceLoading.value = false
  }
}

function showFactorTrace() {
  dimension.value = 'FACTOR_TRACE'
}

function goToBreadcrumb(index) {
  const item = result.value.breadcrumb[index]
  if (!item || index === result.value.breadcrumb.length - 1) return
  currentLevel.value = item.level
  const nextKeys = {}
  result.value.breadcrumb.slice(0, index).forEach((ancestor) => {
    const key = parentKeyForLevel(ancestor.level)
    if (key && ancestor.key) nextKeys[key] = ancestor.key
  })
  parentKeys.value = nextKeys
  emit('level-change', { currentLevel: currentLevel.value, parentKeys: nextKeys })
  if (!props.embedded) syncRouteContext()
  loadDrill()
}

function syncRouteContext() {
  const query = Object.fromEntries(Object.entries(route.query).filter(([key]) => !key.endsWith('_CODE')))
  Object.assign(query, parentKeys.value, {
    resultId: activeResultId.value,
    currentLevel: currentLevel.value
  })
  router.replace({ name: 'ResultDrill', query })
}

function pathAvailable(path) {
  const configuredPaths = Object.keys(props.pathResultIds || {})
  if (configuredPaths.length) return Boolean(props.pathResultIds[path])
  return path === initialDimension
}

function inferDimensionFromLevel(level) {
  return ['ALL_SINGLE_DISEASE', 'SINGLE_DISEASE', 'CASE', 'PATIENT'].includes(String(level))
    ? 'DISEASE'
    : 'ORGANIZATION'
}

function backToAnalysis() {
  router.push({ path: '/analysis', query: { indicator: route.query.indicator || undefined } })
}

watch(() => [props.startLevel, props.startParentKeys], ([level, keys]) => {
  currentLevel.value = level
  parentKeys.value = { ...keys }
  if (isFactorTraceMode.value) loadFactorTrace()
  else loadDrill()
}, { deep: true })
watch(() => [props.resultId, props.pathResultIds], () => {
  if (!pathAvailable(lastDrillDimension.value)) {
    const nextDimension = pathAvailable('ORGANIZATION') ? 'ORGANIZATION' : 'DISEASE'
    dimension.value = nextDimension
    lastDrillDimension.value = nextDimension
    currentLevel.value = nextDimension === 'DISEASE' ? 'ALL_SINGLE_DISEASE' : 'HOSPITAL'
    parentKeys.value = {}
  }
  if (isFactorTraceMode.value) loadFactorTrace()
  else loadDrill()
}, { deep: true })
watch(dimension, (value) => {
  factorTrace.value = null
  errorMessage.value = ''
  if (value === 'FACTOR_TRACE') {
    loadFactorTrace()
    return
  }
  lastDrillDimension.value = value
  if (value === 'DISEASE') {
    currentLevel.value = 'ALL_SINGLE_DISEASE'
    parentKeys.value = {}
    loadDrill()
  } else if (value === 'ORGANIZATION') {
    currentLevel.value = 'HOSPITAL'
    parentKeys.value = {}
    loadDrill()
  }
})
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
  height: auto;
  box-sizing: border-box;
  padding: 6px 12px;
  border-bottom: 1px solid var(--idmp-border-subtle);
  background: var(--idmp-layer-02);
}

.drill-context-bar__filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  min-height: 32px;
}

.drill-dimension-select {
  flex: 0 0 150px;
}

.drill-dimension-select :deep(.el-select__wrapper) {
  min-height: 32px;
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

.factor-trace-panel {
  margin-top: 16px;
  padding: 0 12px 14px;
  border-top: 1px solid var(--idmp-border-subtle);
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
