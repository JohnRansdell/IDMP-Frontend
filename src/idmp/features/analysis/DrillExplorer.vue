<template>
  <div class="drill-explorer">
    <div class="drill-context-bar">
      <div class="drill-context-bar__filters">
        <el-select v-model="dimension" size="small" aria-label="下钻维度" class="drill-dimension-select">
          <el-option label="组织维度" value="ORGANIZATION" :disabled="!pathAvailable('ORGANIZATION')" />
          <el-option label="病种维度" value="DISEASE" :disabled="!pathAvailable('DISEASE')" />
          <el-option v-for="path in customPaths" :key="path.pathCode" :label="path.pathName || '自定义路径'" :value="path.pathCode" />
          <el-option v-if="source !== 'mock'" label="因子结果追溯" value="FACTOR_TRACE" />
          <el-option label="时间维度（待接入）" value="TIME" disabled />
          <el-option label="场景维度（待接入）" value="SCENARIO" disabled />
        </el-select>
        <span class="drill-context-bar__period">统计周期：{{ resolvedPeriod }}</span>
        <span class="drill-context-bar__source">{{ source === 'mock' ? '演示数据' : '真实接口' }}</span>
        <el-button v-if="source !== 'mock' && !isFactorTraceMode" size="small" @click="showFactorTrace">
          {{ factorTrace ? '刷新因子追溯' : '查看因子追溯' }}
        </el-button>
      </div>
    </div>

    <template v-if="!isFactorTraceMode">
    <nav class="drill-breadcrumb" aria-label="下钻层级">
      <template v-for="(item, index) in result.breadcrumb" :key="`${item.level}-${item.key}`">
        <button type="button" class="drill-breadcrumb__item" @click="goToBreadcrumb(index)">
          {{ item.label }}
        </button>
        <span class="drill-breadcrumb__separator" aria-hidden="true">/</span>
      </template>
      <span class="drill-breadcrumb__current" aria-current="location">{{ currentLevelLabel }}</span>
    </nav>

    <div class="drill-summary-strip" aria-label="当前层汇总">
      <div><span>指标值</span><strong>{{ result.summary.displayValue || result.summary.indicatorValue || '-' }}</strong></div>
      <div><span>分子</span><strong>{{ result.summary.numerator ?? '-' }}</strong></div>
      <div><span>分母</span><strong>{{ result.summary.denominator ?? '-' }}</strong></div>
      <div><span>质量状态</span><strong>{{ result.summary.qualityStatus ? getStatusLabel(result.summary.qualityStatus) : '-' }}</strong></div>
    </div>

    <div class="drill-table-heading">
      <div>
        <h3>当前层：{{ currentLevelLabel }}</h3>
        <p>下一层入口由下钻配置和接口返回的可用层级决定。</p>
      </div>
      <span class="drill-table-heading__count">{{ result.pageInfo.total || 0 }} 条</span>
    </div>

    <StatePanel v-if="errorMessage" type="error" title="下钻数据加载失败" :description="errorMessage">
      <template #actions><el-button size="small" @click="loadDrill">重试</el-button></template>
    </StatePanel>
    <section v-else-if="statusRecord" class="drill-status-record">
      <strong>当前层计算状态：{{ getStatusLabel(statusRecord.resultOutcomeStatus || statusRecord.outcomeStatus || statusRecord.sourceDataStatus) }}</strong>
      <p>{{ statusRecord.calculationErrorMessage || statusRecord.errorMessage || `源数据状态：${getStatusLabel(statusRecord.sourceDataStatus)}；源记录数：${statusRecord.sourceRecordCount ?? 0}` }}</p>
      <el-table v-if="statusRecord.factorSourceProfiles?.length" :data="statusRecord.factorSourceProfiles" size="small">
        <el-table-column prop="factorVersionId" label="因子版本" min-width="160" />
        <el-table-column label="源数据" width="120"><template #default="{ row }">{{ getStatusLabel(row.sourceDataStatus) }}</template></el-table-column>
        <el-table-column prop="sourceRecordCount" label="源记录数" width="110" />
        <el-table-column prop="errorMessage" label="诊断信息" min-width="200" />
      </el-table>
    </section>
    <StatePanel v-else-if="!loading && !memberRecords.length" type="empty" title="当前层暂无数据" description="当前口径下没有可展示的记录。" />
    <div v-else class="table-scroll">
      <el-table v-loading="loading" :data="memberRecords" table-layout="fixed" class="analysis-table drill-data-table">
        <el-table-column
          v-for="column in visibleColumns"
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
              <el-button link type="primary" :disabled="!availableNextLevels.length" @click="openNextLevel(row)">
                {{ availableNextLevels.length ? '查看下一级' : '已到末级' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div v-if="currentLevel === 'DOCTOR' || currentLevel === 'CASE'" class="drill-access-hint">
      患者或业务记录级访问需要后端数据范围、脱敏、访问目的和审计能力；当前页面先展示后端返回的受控结果。
    </div>
    </template>

    <section v-if="source !== 'mock' && (isFactorTraceMode || factorTrace)" class="factor-trace-panel" aria-label="因子结果追溯">
      <div class="drill-table-heading">
        <div><h3>因子结果追溯</h3><p>从当前指标结果追溯到公式中的分子、分母因子。</p></div>
        <span class="drill-table-heading__count">{{ factorTrace?.factors?.length || 0 }} 个因子</span>
      </div>
      <StatePanel v-if="factorTraceLoading" type="loading" title="正在加载因子追溯" />
      <StatePanel v-else-if="errorMessage" type="error" title="因子追溯加载失败" :description="errorMessage">
        <template #actions><el-button size="small" @click="loadFactorTrace">重试</el-button></template>
      </StatePanel>
      <FactorTraceTree v-else-if="factorTrace" :key="`${factorTrace.context?.resultId}-${factorTrace.context?.configSnapshotId}`" :result-id="String(factorTrace.context?.resultId || activeResultId)" :factors="factorTrace.factors || []" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatePanel from '@/idmp/components/StatePanel.vue'
import FactorTraceTree from '@/idmp/components/FactorTraceTree.vue'
import { fetchResultFactors, searchResultDrill } from '@/idmp/api/modules/drill'
import { limitDrillNextLevels } from '@/idmp/api/adapters/drill'
import { isStatusRecord } from '@/idmp/features/analysis/resultAvailability'
import { getStatusLabel } from '@/idmp/design/status'

const props = defineProps({
  resultId: { type: [String, Number], default: 'MOCK-RESULT-001' },
  snapshotId: { type: [String, Number], default: '' },
  pathResultIds: { type: Object, default: () => ({}) },
  indicatorName: { type: String, default: '手术患者并发症发生率' },
  period: { type: String, default: '2026-06' },
  startLevel: { type: String, default: 'HOSPITAL' },
  startParentKeys: { type: Object, default: () => ({}) },
  maxLevels: { type: Object, default: () => ({}) },
  configuredPaths: { type: Array, default: () => [] },
  startPathCode: { type: String, default: '' },
  source: { type: String, default: 'live', validator: (value) => ['live', 'mock'].includes(value) },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['level-change'])
const route = useRoute()
const router = useRouter()
const customPaths = computed(() => props.configuredPaths.filter(path => path.pathCode?.startsWith('CUSTOM_')))
const inferredDimension = inferDimensionFromLevel(props.startLevel)
const initialDimension = props.startPathCode || customPaths.value.find(path => path.levels?.some(level => level.levelCode === props.startLevel))?.pathCode ||
  (customPaths.value.length && !props.configuredPaths.some(path => path.pathCode === inferredDimension) ? customPaths.value[0].pathCode : inferredDimension)
const dimension = ref(initialDimension)
const lastDrillDimension = ref(initialDimension)
const initialPath = props.configuredPaths.find(path => path.pathCode === initialDimension)
const currentLevel = ref(initialPath?.levels?.length && !initialPath.levels.some(level => level.levelCode === props.startLevel) ? initialPath.levels[0].levelCode : props.startLevel)
const parentKeys = ref({ ...props.startParentKeys })
const result = ref(emptyResult())
const loading = ref(false)
const errorMessage = ref('')
let drillRequestId = 0
const factorTrace = ref(null)
const factorTraceLoading = ref(false)
let factorTraceRequestId = 0
const resolvedPathResultIds = ref({})
const isFactorTraceMode = computed(() => dimension.value === 'FACTOR_TRACE')
const statusRecord = computed(() => result.value.records.find(isStatusRecord) || null)
const memberRecords = computed(() => result.value.records.filter((item) => !isStatusRecord(item)))
const visibleColumns = computed(() => result.value.columns.filter((column) => (
  String(column.field || '').toLowerCase() !== 'factorsourceprofiles'
)))
const activeResultId = computed(() => String(
  resolvedPathResultIds.value[lastDrillDimension.value] ||
  props.pathResultIds?.[lastDrillDimension.value] || props.resultId || ''
))
const availableNextLevels = computed(() => {
  const pathCode = lastDrillDimension.value
  return limitDrillNextLevels(result.value.nextLevels, pathCode, props.maxLevels?.[pathCode])
})
const resolvedPeriod = computed(() => {
  const start = result.value.context?.periodStart
  const end = result.value.context?.periodEnd
  return start && end ? `${start} ～ ${end}` : (props.period || '由结果快照确定')
})

const currentLevelLabel = computed(() => props.configuredPaths.find(path => path.pathCode === lastDrillDimension.value)?.levels?.find(level => level.levelCode === currentLevel.value)?.levelName || ({
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

function getReportSnapshot() {
  if (isFactorTraceMode.value) return {
    loading: factorTraceLoading.value,
    section: { title: '当前因子结果追溯', description: errorMessage.value || '',
      columns: ['公式角色', '因子', '因子版本', '结果匹配', '结果值', '质量状态'],
      rows: (factorTrace.value?.factors || []).map(item => [formulaRoleLabel(item.formulaRole), item.factorName,
        item.factorVersionId, item.resultMatched ? '已匹配' : '未匹配', item.result?.displayValue ?? item.result?.value,
        item.result?.qualityStatus ? getStatusLabel(item.result.qualityStatus) : '-'].map(value => String(value ?? '-'))) }
  }
  const columns = visibleColumns.value
  return { loading: loading.value, section: {
    title: `当前下钻结果：${currentLevelLabel.value}`,
    description: errorMessage.value || `${resolvedPeriod.value}；路径：${result.value.breadcrumb.map(item => item.label).join(' / ')}；已加载 ${memberRecords.value.length} 条 / 共 ${result.value.pageInfo.total || 0} 条`,
    columns: columns.length ? columns.map(column => column.label) : ['结果'],
    rows: columns.length ? memberRecords.value.map(row => columns.map(column => String(row[column.field] ?? '-'))) : []
  } }
}
defineExpose({ getReportSnapshot })

function formulaRoleLabel(role) {
  return { NUMERATOR: '分子', DENOMINATOR: '分母' }[String(role || '').toUpperCase()] || role || '-'
}

function buildPayload() {
  const payload = {
    ...(lastDrillDimension.value.startsWith('CUSTOM_') ? { pathCode: lastDrillDimension.value } : {}),
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
  const requestId = ++drillRequestId
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await searchResultDrill(activeResultId.value, buildPayload(), { source: props.source })
    if (requestId !== drillRequestId) return
    result.value = response
    currentLevel.value = result.value.context.currentLevel || currentLevel.value
    resolveCanonicalRootResultId()
  } catch (error) {
    if (requestId !== drillRequestId) return
    errorMessage.value = error?.message || '请稍后重试。'
  } finally {
    if (requestId === drillRequestId) loading.value = false
  }
}

function resolveCanonicalRootResultId() {
  const rootLevel = rootForPath(lastDrillDimension.value)
  if (String(currentLevel.value).toUpperCase() !== rootLevel) return
  const rootRecord = result.value.records.find((record) => (
    String(record.levelCode || '').toUpperCase() === rootLevel && record.resultId
  ))
  const canonicalResultId = String(rootRecord?.resultId || '')
  if (!canonicalResultId || canonicalResultId === activeResultId.value) return
  resolvedPathResultIds.value = {
    ...resolvedPathResultIds.value,
    [lastDrillDimension.value]: canonicalResultId
  }
  if (!props.embedded) syncRouteContext()
}

function openNextLevel(row) {
  const nextLevel = availableNextLevels.value[0]
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
  const definition = props.configuredPaths.find(path => path.pathCode === lastDrillDimension.value)?.levels?.find(item => item.levelCode === level)
  if (definition) return definition.memberKeyFieldCode || definition.memberKeySemanticFieldCode || definition.dimensionFieldCode || definition.dimensionSemanticFieldCode || ''
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
  if (!activeResultId.value || props.source === 'mock') return
  const requestId = ++factorTraceRequestId
  const resultId = activeResultId.value
  factorTraceLoading.value = true
  factorTrace.value = null
  errorMessage.value = ''
  try {
    const data = await fetchResultFactors(resultId)
    if (requestId === factorTraceRequestId && resultId === activeResultId.value) factorTrace.value = data
  } catch (error) {
    if (requestId === factorTraceRequestId && resultId === activeResultId.value) errorMessage.value = error?.message || '因子追溯加载失败。'
  } finally {
    if (requestId === factorTraceRequestId) factorTraceLoading.value = false
  }
}

function showFactorTrace() {
  if (props.source === 'mock') return
  dimension.value = 'FACTOR_TRACE'
}

function goToBreadcrumb(index) {
  const item = result.value.breadcrumb[index]
  if (!item) return
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
    currentLevel: currentLevel.value,
    pathCode: lastDrillDimension.value,
    parentKeys: JSON.stringify(parentKeys.value)
  })
  router.replace({ name: 'ResultDrill', query })
}

function pathAvailable(path) {
  if (path.startsWith('CUSTOM_')) return customPaths.value.some(item => item.pathCode === path)
  const businessPaths = props.configuredPaths.filter(item => ['ORGANIZATION', 'DISEASE'].includes(item.pathCode) || item.pathCode?.startsWith('CUSTOM_'))
  if (businessPaths.length && !businessPaths.some(item => item.pathCode === path)) return false
  const configuredPaths = Object.keys(props.pathResultIds || {})
  if (configuredPaths.length) return Boolean(props.pathResultIds[path])
  return path === initialDimension
}

function inferDimensionFromLevel(level) {
  return ['ALL_SINGLE_DISEASE', 'SINGLE_DISEASE', 'CASE', 'PATIENT'].includes(String(level))
    ? 'DISEASE'
    : 'ORGANIZATION'
}

watch(() => [props.startLevel, props.startParentKeys], ([level, keys]) => {
  currentLevel.value = level
  parentKeys.value = { ...keys }
  if (isFactorTraceMode.value) loadFactorTrace()
  else loadDrill()
}, { deep: true })
watch(() => [props.resultId, props.pathResultIds, props.configuredPaths], () => {
  resolvedPathResultIds.value = {}
  if (!pathAvailable(lastDrillDimension.value)) {
    const nextDimension = customPaths.value[0]?.pathCode || (pathAvailable('ORGANIZATION') ? 'ORGANIZATION' : 'DISEASE')
    dimension.value = nextDimension
    lastDrillDimension.value = nextDimension
    currentLevel.value = rootForPath(nextDimension)
    parentKeys.value = {}
  }
  if (isFactorTraceMode.value) loadFactorTrace()
  else loadDrill()
}, { deep: true })
watch(() => props.source, (source) => {
  factorTraceRequestId += 1
  factorTraceLoading.value = false
  factorTrace.value = null
  errorMessage.value = ''
  if (source === 'mock' && isFactorTraceMode.value) {
    dimension.value = lastDrillDimension.value
    return
  }
  loadDrill()
})
watch(dimension, (value) => {
  factorTraceRequestId += 1
  factorTraceLoading.value = false
  drillRequestId += 1
  loading.value = false
  factorTrace.value = null
  errorMessage.value = ''
  if (value === 'FACTOR_TRACE') {
    loadFactorTrace()
    return
  }
  lastDrillDimension.value = value
  if (value.startsWith('CUSTOM_')) {
    currentLevel.value = rootForPath(value)
    parentKeys.value = {}
    loadDrill()
    return
  }
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

function rootForPath(pathCode) {
  return props.configuredPaths.find(path => path.pathCode === pathCode)?.levels?.[0]?.levelCode || (pathCode.startsWith('CUSTOM_') ? 'ROOT' : pathCode === 'DISEASE' ? 'ALL_SINGLE_DISEASE' : 'HOSPITAL')
}
</script>

<style scoped>
.drill-context-bar,
.drill-table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.drill-status-record { margin: 12px 0; padding: 16px; border: 1px solid var(--idmp-border, #d0d5dd); border-radius: 8px; background: #f8fafc; }
.drill-status-record p { margin: 8px 0 12px; color: var(--idmp-text-secondary, #667085); }

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

.drill-breadcrumb__current {
  color: var(--idmp-text-primary);
  font-size: 13px;
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
