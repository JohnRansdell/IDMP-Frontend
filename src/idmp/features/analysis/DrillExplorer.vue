<template>
  <div class="drill-explorer">
    <div class="drill-context-bar">
      <div class="drill-context-bar__filters">
        <el-select v-model="dimension" size="small" aria-label="下钻维度" class="drill-dimension-select" :disabled="!availablePaths.length" placeholder="未配置下钻路径">
          <el-option v-for="path in availablePaths" :key="path.pathCode" :label="path.pathName || (path.pathCode === 'ORGANIZATION' ? '组织维度' : '自定义路径')" :value="path.pathCode" />
        </el-select>
        <span class="drill-context-bar__period">统计周期：{{ resolvedPeriod }}</span>

        <el-button v-access="'result.factor.read'" v-if="source !== 'mock' && !isFactorTraceMode" size="small" @click="showFactorTrace">
          {{ factorTrace ? '刷新因子追溯' : '查看因子追溯' }}
        </el-button>
        <el-button v-if="isFactorTraceMode" size="small" @click="returnToDrill">返回下钻</el-button>
      </div>
    </div>

    <StatePanel v-if="!isFactorTraceMode && !availablePaths.length" type="empty" title="该指标未配置下钻路径" />
    <template v-else-if="!isFactorTraceMode">
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
      <div><span>指标值</span><strong>{{ formatResultValue(result.summary.indicatorValue, { displayValue: result.summary.displayValue, unit: result.summary.unit || result.context.unit }) }}</strong></div>
      <div v-if="result.summary.numerator != null"><span>分子</span><strong>{{ formatResultNumber(result.summary.numerator) }}</strong></div>
      <div v-if="result.summary.denominator != null"><span>分母</span><strong>{{ formatResultNumber(result.summary.denominator) }}</strong></div>
      <div><span>质量状态</span><strong>{{ result.summary.qualityStatus ? getStatusLabel(result.summary.qualityStatus) : '-' }}</strong></div>
    </div>

    <div class="drill-table-heading">
      <div>
        <h3>当前层：{{ currentLevelLabel }}</h3>
        <p>按已配置的路径查看下一层结果。</p>
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
      <el-table v-loading="loading" :data="memberRecords" table-layout="fixed" class="analysis-table drill-data-table" @sort-change="changeSort">
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
            <span v-else-if="['displayValue', 'indicatorValue'].includes(column.field)">{{ formatResultValue(row.indicatorValue, { displayValue: row.displayValue, unit: row.unit || result.context.unit }) }}</span>
            <span v-else-if="['numerator', 'denominator'].includes(column.field)">{{ formatResultNumber(row[column.field]) }}</span>
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

    <div v-if="!errorMessage && !statusRecord && Number(result.pageInfo.total) > 0" class="drill-pagination">
      <el-pagination
        :current-page="pageNum"
        :page-size="pageSize"
        :total="Number(result.pageInfo.total) || 0"
        :page-sizes="[20, 50, 100]"
        :disabled="loading"
        layout="total, prev, pager, next, sizes"
        @current-change="changePage"
        @size-change="changePageSize"
      />
    </div>

    <div v-if="currentLevel === 'DOCTOR' || currentLevel === 'CASE'" class="drill-access-hint">
      患者或业务记录仅在授权范围内提供，访问须遵守脱敏和审计要求。
    </div>
    </template>

    <section v-if="source !== 'mock' && (isFactorTraceMode || factorTrace)" class="factor-trace-panel" aria-label="因子结果追溯">
      <div class="drill-table-heading">
        <div><h3>因子结果追溯</h3><p>从当前指标结果追溯到公式中的各个参与因子。</p></div>
        <span class="drill-table-heading__count">{{ factorTrace?.factors?.length || 0 }} 个因子</span>
      </div>
      <StatePanel v-if="factorTraceLoading" type="loading" title="正在加载因子追溯" />
      <StatePanel v-else-if="errorMessage" type="error" title="因子追溯加载失败" :description="errorMessage">
        <template #actions><el-button size="small" @click="loadFactorTrace">重试</el-button></template>
      </StatePanel>
      <template v-else-if="factorTrace">
        <div v-if="traceBatchId" class="factor-trace-batch" aria-label="所属计算批次">
          <div class="factor-trace-batch__identifier">
            <span>所属批次</span>
            <strong class="mono-data">{{ traceBatchId }}</strong>
          </div>
          <el-button v-access="'calc.calculation.read'" size="small" @click="openTraceBatch">查看计算批次</el-button>
        </div>
        <FactorTraceTree :key="`${factorTrace.context?.resultId}-${factorTrace.context?.configSnapshotId}`" :result-id="String(factorTrace.context?.resultId || activeResultId)" :factors="factorTrace.factors || []" />
      </template>
    </section>
  </div>
</template>

<script setup>
import { fetchDepartmentNames } from '@/idmp/api/modules/departments'
import { isDepartmentLevel, namedDrillRecord } from '../dashboard/dimensionNames.js'
import { computed, onActivated, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createRequestScope } from './useLatestResult.js'
import StatePanel from '@/idmp/components/StatePanel.vue'
import FactorTraceTree from '@/idmp/components/FactorTraceTree.vue'
import { fetchResultFactors, searchResultDrill } from '@/idmp/api/modules/drill'
import { canonicalDrillRootResultId, limitDrillNextLevels } from '@/idmp/api/adapters/drill'
import { assertDrillResponseContext, buildDrillRequest, drillMemberField, nextDrillNavigation } from './drillContext.js'
import { isStatusRecord } from '@/idmp/features/analysis/resultAvailability'
import { getStatusLabel } from '@/idmp/design/status'
import { formatResultNumber, formatResultValue } from '../shared/resultPresentation.js'
import { formatResultPeriod } from '../../utils/periodRange.js'

const props = defineProps({
  resultId: { type: [String, Number], default: '' },
  snapshotId: { type: [String, Number], default: '' },
  indicatorVersionId: { type: [String, Number], default: '' },
  resultPeriod: { type: Object, default: () => ({}) },
  pathResultIds: { type: Object, default: () => ({}) },
  indicatorName: { type: String, default: '指标' },
  period: { type: String, default: '' },
  granularity: { type: String, default: '' },
  startLevel: { type: String, default: 'HOSPITAL' },
  startParentKeys: { type: Object, default: () => ({}) },
  startFilters: { type: Object, default: () => ({}) },
  maxLevels: { type: Object, default: () => ({}) },
  configuredPaths: { type: Array, default: () => [] },
  startPathCode: { type: String, default: '' },
  source: { type: String, default: 'live', validator: (value) => ['live', 'mock'].includes(value) },
  enabled: { type: Boolean, default: true },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['level-change'])
const route = useRoute()
const router = useRouter()
const availablePaths = computed(() => props.configuredPaths.filter(path => path.pathCode === 'ORGANIZATION' || path.pathCode?.startsWith('CUSTOM_')))
function preferredPathCode() {
  return availablePaths.value.find(path => path.pathCode === props.startPathCode)?.pathCode
    || availablePaths.value.find(path => path.levels?.some(level => level.levelCode === props.startLevel))?.pathCode
    || availablePaths.value[0]?.pathCode || ''
}
const initialDimension = preferredPathCode()
const dimension = ref(initialDimension)
const lastDrillDimension = ref(initialDimension)
function matchesEntry(pathCode) {
  const path = availablePaths.value.find(path => path.pathCode === pathCode)
  return path && (!props.startPathCode || props.startPathCode === pathCode)
    && (!path.levels?.length || path.levels.some(level => level.levelCode === props.startLevel))
}
const initialEntryMatches = matchesEntry(initialDimension)
const currentLevel = ref(initialEntryMatches ? props.startLevel : rootForPath(initialDimension))
const parentKeys = ref(initialEntryMatches ? { ...props.startParentKeys } : {})
const result = shallowRef(emptyResult())
const loading = ref(false)
const errorMessage = ref('')
const pageNum = ref(1)
const pageSize = ref(20)
const sort = ref([{ field: 'indicatorValue', direction: 'DESC' }])
const drillScope = createRequestScope()
let inactive = false
let interrupted = false
const factorTrace = shallowRef(null)
const traceBatchId = computed(() => String(factorTrace.value?.context?.calculationBatchId || ''))
const factorTraceLoading = ref(false)
const factorTraceScope = createRequestScope()
const resolvedPathResultIds = ref({})
const navigationAnchors = shallowRef({})
const isFactorTraceMode = ref(false)
const statusRecord = computed(() => result.value.records.find(isStatusRecord) || null)
const memberRecords = computed(() => result.value.records.filter((item) => !isStatusRecord(item)))
const visibleColumns = computed(() => result.value.columns.filter((column) => (
  String(column.field || '').toLowerCase() !== 'factorsourceprofiles'
  && (!['numerator', 'denominator'].includes(column.field) || memberRecords.value.some(row => row[column.field] != null))
)))
const activeResultId = computed(() => String(
  navigationAnchors.value[navigationKey()]?.resultId ||
  resolvedPathResultIds.value[lastDrillDimension.value] ||
  props.pathResultIds?.[lastDrillDimension.value] || props.resultId || ''
))
function navigationKey(level = currentLevel.value, keys = parentKeys.value) {
  return JSON.stringify([lastDrillDimension.value, level, Object.entries(keys).sort(([a], [b]) => a.localeCompare(b))])
}
const availableNextLevels = computed(() => {
  const pathCode = lastDrillDimension.value
  return limitDrillNextLevels(result.value.nextLevels, pathCode, props.maxLevels?.[pathCode])
})
const resolvedPeriod = computed(() => {
  if (props.granularity === 'STATIC') return '静态结果'
  const start = result.value.context?.periodStart
  const end = result.value.context?.periodEnd
  return start && end ? formatResultPeriod(start, end) : (props.period || '由结果快照确定')
})

const currentLevelLabel = computed(() => props.configuredPaths.find(path => path.pathCode === lastDrillDimension.value)?.levels?.find(level => level.levelCode === currentLevel.value)?.levelName || ({
  HOSPITAL: '医院',
  OUT_DEPT: '科室',
  DEPARTMENT: '科室',
  MEDICAL_GROUP: '医疗组',
  ATTENDING_DOCTOR: '主治医师',
  DOCTOR: '医师',
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

function selectedPath() {
  return props.configuredPaths.find(path => path.pathCode === lastDrillDimension.value)
}

function resetPaging() {
  pageNum.value = 1
  sort.value = [{ field: 'indicatorValue', direction: 'DESC' }]
}

function changePage(page) {
  if (pageNum.value === page) return
  pageNum.value = page
  loadDrill()
}

function changePageSize(size) {
  if (pageSize.value === size) return
  pageSize.value = size
  pageNum.value = 1
  loadDrill()
}

function changeSort({ prop, order }) {
  sort.value = prop && order ? [{ field: prop, direction: order === 'ascending' ? 'ASC' : 'DESC' }] : []
  pageNum.value = 1
  loadDrill()
}

async function loadDrill() {
  const ticket = drillScope.begin()
  if (inactive || !props.enabled) { interrupted = true; suspendRequests(); return }
  interrupted = false
  result.value = emptyResult()
  loading.value = false
  errorMessage.value = ''
  if (!activeResultId.value || isFactorTraceMode.value || !pathAvailable(lastDrillDimension.value)) return
  loading.value = true
  try {
    const context = { resultId: activeResultId.value, indicatorVersionId: props.indicatorVersionId,
      snapshotId: navigationAnchors.value[navigationKey()]?.snapshotId
        || (lastDrillDimension.value === (props.startPathCode || initialDimension) ? props.snapshotId : ''),
      period: props.resultPeriod, pathCode: lastDrillDimension.value,
      currentLevel: currentLevel.value, parentKeys: parentKeys.value, filters: props.startFilters }
    const request = buildDrillRequest(context, { path: selectedPath(), pageNum: pageNum.value, pageSize: pageSize.value, sort: sort.value })
    const response = await searchResultDrill(request.resultId, request.payload, { source: props.source, signal: ticket.signal })
    if (!ticket.isCurrent()) return
    assertDrillResponseContext(response, context)
    const root = selectedPath()?.levels?.[0]
    if (lastDrillDimension.value === 'ORGANIZATION' && root && !drillMemberField(selectedPath(), root.levelCode)) {
      const label = root.levelName || '医院'
      response.records = response.records.map(row => row.levelCode === root.levelCode && row.dimensionKey === '__UNASSIGNED__'
        ? { ...row, dimensionName: label, dimensionLabel: label } : row)
      response.breadcrumb = response.breadcrumb.map(item => item.level === root.levelCode && item.key === '__UNASSIGNED__'
        ? { ...item, label } : item)
    }
    const levelCode = response.context.currentLevel || currentLevel.value
    const definition = props.configuredPaths.find(path => path.pathCode === lastDrillDimension.value)?.levels?.find(level => level.levelCode === levelCode)
      || { levelCode }
    if (props.source !== 'mock' && isDepartmentLevel(definition)) {
      const names = await fetchDepartmentNames()
      response.records = response.records.map(row => {
        if (isStatusRecord(row)) return row
        const named = namedDrillRecord(row, definition, names)
        return { ...named, dimensionName: named.dimensionLabel }
      })
    }
    if (!ticket.isCurrent()) return
    result.value = response
    currentLevel.value = result.value.context.currentLevel || currentLevel.value
    resolveCanonicalRootResultId()
  } catch (error) {
    if (!ticket.isCurrent()) return
    result.value = emptyResult()
    errorMessage.value = error?.message || '请稍后重试。'
  } finally {
    if (ticket.isCurrent()) loading.value = false
  }
}

function resolveCanonicalRootResultId() {
  const rootLevel = rootForPath(lastDrillDimension.value)
  if (String(currentLevel.value).toUpperCase() !== rootLevel) return
  const canonicalResultId = canonicalDrillRootResultId(result.value, rootLevel)
  if (!canonicalResultId || canonicalResultId === activeResultId.value) return
  resolvedPathResultIds.value = {
    ...resolvedPathResultIds.value,
    [lastDrillDimension.value]: canonicalResultId
  }
  if (!props.embedded) syncRouteContext()
}

function openNextLevel(row) {
  const nextLevel = availableNextLevels.value[0]
  const navigation = nextDrillNavigation({ currentLevel: currentLevel.value, parentKeys: parentKeys.value }, row, nextLevel, selectedPath())
  if (!navigation) return
  resetPaging()
  if (row.resultId) navigationAnchors.value = {
    ...navigationAnchors.value, [navigationKey(navigation.currentLevel, navigation.parentKeys)]: {
      resultId: String(row.resultId), snapshotId: row.snapshotId ? String(row.snapshotId) : ''
    }
  }
  parentKeys.value = navigation.parentKeys
  currentLevel.value = navigation.currentLevel
  emit('level-change', navigation)
  if (!props.embedded) syncRouteContext()
  loadDrill()
}

function parentKeyForLevel(level) {
  return drillMemberField(selectedPath(), level)
}

async function loadFactorTrace() {
  const ticket = factorTraceScope.begin()
  if (inactive || !props.enabled) { interrupted = true; suspendRequests(); return }
  interrupted = false
  if (!activeResultId.value || props.source === 'mock') { factorTraceLoading.value = false; factorTrace.value = null; return }
  const resultId = activeResultId.value
  factorTraceLoading.value = true
  factorTrace.value = null
  errorMessage.value = ''
  try {
    const data = await fetchResultFactors(resultId, { signal: ticket.signal })
    if (ticket.isCurrent() && resultId === activeResultId.value) factorTrace.value = data
  } catch (error) {
    if (ticket.isCurrent() && resultId === activeResultId.value) errorMessage.value = error?.message || '因子追溯加载失败。'
  } finally {
    if (ticket.isCurrent()) factorTraceLoading.value = false
  }
}

function showFactorTrace() {
  if (props.source === 'mock') return
  drillScope.cancel()
  loading.value = false
  errorMessage.value = ''
  factorTrace.value = null
  isFactorTraceMode.value = true
  loadFactorTrace()
}

function returnToDrill() {
  factorTraceScope.cancel()
  factorTraceLoading.value = false
  factorTrace.value = null
  errorMessage.value = ''
  isFactorTraceMode.value = false
  loadDrill()
}

function openTraceBatch() {
  if (!traceBatchId.value || factorTraceLoading.value) return
  router.push({ path: '/calc', query: { batchId: traceBatchId.value }, hash: '#batch-overview' })
}

function goToBreadcrumb(index) {
  const item = result.value.breadcrumb[index]
  if (!item) return
  resetPaging()
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
  return availablePaths.value.some(item => item.pathCode === path)
}

watch([
  () => JSON.stringify([props.startPathCode, props.startLevel, props.startParentKeys, props.startFilters]),
  () => JSON.stringify([props.resultId, props.snapshotId, props.indicatorVersionId, props.resultPeriod, props.pathResultIds, props.configuredPaths]),
  () => props.startPathCode
], ([entry, target, pathCode], [previousEntry, previousTarget, previousPathCode]) => {
  resetPaging()
  if (entry !== previousEntry) {
    currentLevel.value = props.startLevel
    parentKeys.value = { ...props.startParentKeys }
    navigationAnchors.value = {}
  }
  if (target !== previousTarget) {
    resolvedPathResultIds.value = {}
    navigationAnchors.value = {}
  }
  if (!pathAvailable(lastDrillDimension.value) || (pathCode !== previousPathCode && pathAvailable(pathCode) && pathCode !== lastDrillDimension.value)) {
    const nextDimension = preferredPathCode()
    dimension.value = nextDimension
    lastDrillDimension.value = nextDimension
    currentLevel.value = matchesEntry(nextDimension) ? props.startLevel : rootForPath(nextDimension)
    parentKeys.value = matchesEntry(nextDimension) ? { ...props.startParentKeys } : {}
  } else if (selectedPath()?.levels?.length && !selectedPath().levels.some(level => level.levelCode === currentLevel.value)) {
    currentLevel.value = rootForPath(lastDrillDimension.value)
    parentKeys.value = {}
  }
  if (isFactorTraceMode.value) loadFactorTrace()
  else loadDrill()
})
watch(() => props.source, (source) => {
  resetPaging()
  factorTraceScope.cancel()
  factorTraceLoading.value = false
  factorTrace.value = null
  errorMessage.value = ''
  if (source === 'mock' && isFactorTraceMode.value) {
    isFactorTraceMode.value = false
  }
  loadDrill()
})
watch(dimension, (value) => {
  if (value === lastDrillDimension.value) return
  if (!pathAvailable(value)) { dimension.value = lastDrillDimension.value; return }
  resetPaging()
  factorTraceScope.cancel()
  factorTraceLoading.value = false
  drillScope.cancel()
  loading.value = false
  factorTrace.value = null
  errorMessage.value = ''
  isFactorTraceMode.value = false
  lastDrillDimension.value = value
  currentLevel.value = rootForPath(value)
  parentKeys.value = {}
  loadDrill()
})
onMounted(loadDrill)
function suspendRequests() {
  interrupted = interrupted || loading.value || factorTraceLoading.value
  drillScope.cancel()
  factorTraceScope.cancel()
  loading.value = false
  factorTraceLoading.value = false
}
function resumeRequests() {
  if (!inactive && props.enabled && interrupted) {
    if (isFactorTraceMode.value) loadFactorTrace()
    else loadDrill()
  }
}
watch(() => props.enabled, enabled => { if (enabled) resumeRequests(); else suspendRequests() })
onDeactivated(() => { inactive = true; suspendRequests() })
onActivated(() => { inactive = false; resumeRequests() })

function rootForPath(pathCode) {
  return availablePaths.value.find(path => path.pathCode === pathCode)?.levels?.[0]?.levelCode
    || (pathCode === 'ORGANIZATION' ? 'HOSPITAL' : pathCode.startsWith('CUSTOM_') ? 'ROOT' : '')
}
</script>

<style scoped>
.drill-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  overflow-x: auto;
}

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

.factor-trace-batch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 0 0 12px;
}

.factor-trace-batch__identifier {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  font-size: 13px;
}

.factor-trace-batch__identifier span {
  color: var(--idmp-text-secondary);
}

.factor-trace-batch__identifier strong {
  font-weight: 500;
  overflow-wrap: anywhere;
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
