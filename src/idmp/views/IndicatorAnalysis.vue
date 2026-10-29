<template>
  <div class="idmp-page indicator-analysis">
    <PageHeader
      :title="`指标分析 / ${currentProfile.name}`"
      :status-label="analysisSourceLabel"
      status-tone="info"
    >
      <template #meta>
        <span>报告期 <strong>{{ reportPeriodLabel }}</strong></span>
        <span v-if="rangeSummary">查询方式 <strong>{{ reportResultModeLabel }}</strong></span>
        <span v-else>统计粒度 <strong>{{ backendAnalysisGranularity === 'STATIC' ? '静态' : period }}</strong></span>
        <span>更新时间 <strong>{{ analysisUpdatedAt }}</strong></span>
      </template>
      <template #actions>
        <div v-query-enter class="page-toolbar">
          <el-select default-first-option
            v-model="selectedIndicatorCode"
            filterable
            class="header-indicator-select"
            placeholder="请选择指标"
            aria-label="选择要查看的分析指标"
            :loading="indicatorOptionsLoading"
          >
            <el-option
              v-for="item in analysisIndicatorOptions"
              :key="item.optionKey || item.code"
              :label="item.name"
              :value="item.code"
              :disabled="item.disabled"
            >
              <div class="indicator-option">
                <span>{{ item.name }}</span>
                <small>{{ item.source }}</small>
              </div>
            </el-option>
          </el-select>
          <el-button data-query-submit type="primary" @click="switchIndicatorAnalysis">查看分析</el-button>
          <el-button v-access="'calc.calculation.read'" :disabled="!selectedBackendIndicator || !currentIndicatorVersionId" @click="showDataDiagnostics = true">计算诊断</el-button>
          <el-button v-access="'indicator.export.pdf.create'" :icon="Download" :loading="pdfExportLoading" :disabled="!canExportPdf" @click="exportAnalysisPdf">导出PDF</el-button>
        </div>
      </template>
    </PageHeader>

    <el-alert
      v-if="analysisErrorMessage || rangeSummaryErrorMessage"
      class="analysis-error-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="analysisErrorMessage || rangeSummaryErrorMessage"
    />
    <section v-if="($can('POST', '/analysis/indicator-versions/1/instant-summary') || $can('GET', '/analysis/indicators/1/range-summary')) && selectedBackendIndicator && (backendAnalysisGranularity !== 'STATIC' || indicatorRuntimeParameters.length)" class="surface-card instant-query-panel" aria-label="查询条件">
      <div class="instant-query-panel__header">
        <h2>查询条件</h2>
        <div v-if="backendAnalysisGranularity !== 'STATIC'" class="instant-query-panel__context">
          <span>源数据可用范围：<strong>{{ availablePeriodText || '暂未获取' }}</strong></span>
        </div>
      </div>
      <div v-query-enter class="instant-query-panel__controls">
        <div v-if="backendAnalysisGranularity !== 'STATIC'" class="instant-query-panel__period">
          <label>报告期</label>
          <div class="date-range-fields report-period-picker" aria-label="报告期范围">
            <el-date-picker
              v-model="reportPeriodRange"
              type="daterange"
              unlink-panels
              value-format="YYYY-MM-DD"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              size="default"
              @change="invalidateReportSummary()"
            />
          </div>
        </div>
        <div v-if="hasReportFilters" class="instant-query-panel__period">
          <label>筛选范围</label>
          <span v-for="(values, field) in reportFilters" :key="field">{{ field }}：{{ Array.isArray(values) ? values.join('、') : values }}</span>
        </div>
        <RuntimeParameterFields v-if="indicatorRuntimeParameters.length" v-model="indicatorRuntimeParameterValues" :declarations="indicatorRuntimeParameters" :show-metadata="false" @change="invalidateReportSummary()" />
        <div class="instant-query-panel__actions">
          <el-button data-query-submit type="primary" :loading="reportSubmitting || rangeSummaryLoading" :disabled="indicatorRuntimeParameterConflicts.length > 0" @click="applyReportPeriod">查询</el-button>
        </div>
      </div>
      <el-alert v-if="indicatorRuntimeParameterConflicts.length" type="error" show-icon :closable="false" :title="`存在不兼容的同名参数：${indicatorRuntimeParameterConflicts.map(item => item.code).join('、')}`" />
      <div v-if="runtimeQueryResult" class="runtime-query-result">
        <div class="runtime-query-result__summary">
          <el-tag :type="runtimeQueryResult.executionMode === 'AD_HOC_SOURCE' ? 'warning' : 'success'">{{ runtimeQueryExecutionModeLabel }}</el-tag>
          <span>参数快照：{{ runtimeQueryParameterSnapshot }}</span>
        </div>
      </div>
    </section>
    <section v-if="analysisNotice" class="analysis-state-notice" :class="`is-${analysisAvailability.status.toLowerCase()}`">
      <div><strong>{{ analysisNotice.title }}</strong><p>{{ analysisNotice.message }}</p></div>
      <el-button v-if="analysisAvailability.status === 'NO_DATA' && isCompleteDateRange(analysisPeriodRange)" size="small" type="primary" plain @click="clearTrendPeriod">查看全部已有周期</el-button>
      <el-button v-else size="small" @click="showDataDiagnostics = true">查看计算诊断</el-button>
    </section>

    <AnalysisOverview :model="overviewPresentation" :target-label="currentProfile.targetLabel" />

    <section class="surface-card analysis-panel">
      <el-tabs v-model="activeTab" class="analysis-tabs">
        <el-tab-pane label="趋势分析" name="trend">
          <AnalysisTrend
            v-model:months="trendMonthRange"
            v-model:period="period"
            v-model:grain="trendGrainDraft"
            v-model:expanded="trendAdvancedExpanded"
            :model="trendPresentation"
            :indicator-name="currentProfile.name"
            :static-mode="backendAnalysisGranularity === 'STATIC'"
            :trend-loading="trendLoading"
            :trend-error-message="trendErrorMessage"
            :analysis-updated-at="analysisUpdatedAt"
            :grain-fields="trendGrainControls"
            :has-applied-grain="Boolean(Object.keys(trendGrainApplied).length)"
            :has-range="isCompleteDateRange(analysisPeriodRange)"
            :can-clear-range="trendPeriodDraft.some(Boolean) || analysisPeriodRange.some(Boolean)"
            :is-source-default-trend-range="isSourceDefaultTrendRange"
            @apply="applyTrendConditions"
            @clear-range="clearTrendPeriod"
            @change-period="applyTrendGranularity"
            @clear-grain="clearTrendGrainFilters"
            @search-grain="({ code, search }) => loadTrendGrainOptions(code, search)"
            @retry="refreshTrendAnalysis"
          />
        </el-tab-pane>

        <el-tab-pane label="科室排名" name="rank">
          <AnalysisDepartmentRanking
            v-model:granularity="rankGranularity"
            v-model:selected-period="rankSelectedPeriod"
            :rank-table-data="rankTableData"
            :indicator-name="currentProfile.name"
            :rank-period-description="rankPeriodDescription"
            :show-period-controls="backendAnalysisGranularity !== 'STATIC' && Boolean(selectedBackendIndicator)"
            :rank-loading="rankLoading"
            :rank-error-message="rankErrorMessage"
            :rank-initialized="rankInitialized"
            :rank-period-options="rankPeriodOptions"
            :rank-granularity-label="rankGranularityLabel"
            :rank-period-placeholder="rankPeriodPlaceholder"
            @change-granularity="loadRankPeriods()"
            @change-period="loadSelectedRankPeriod"
            @retry="retryRankPeriod"
            @drill="openDepartmentDrill"
          />
        </el-tab-pane>

        <el-tab-pane label="下钻分析" name="drill">
          <IndicatorDrillAnalysis
            v-if="selectedBackendIndicator && backendAnalysisGranularity !== 'STATIC'"
            ref="drillExplorerRef"
            :indicator-id="selectedBackendIndicator.id || selectedBackendIndicator.indicatorId"
            :indicator-version-id="currentIndicatorVersionId"
            :indicator-name="currentProfile.name"
            :filters="reportFilters"
            :enabled="activeTab === 'drill' && !analysisLoading"
            :initial-period="backendAnalysis?.overview || {}"
            :initial-granularity="backendAnalysisGranularity"
            :initial-result-id="route.query.drillResultId || ''"
            :start-level="drillStartLevel"
            :start-parent-keys="drillParentKeys"
            :max-levels="drillMaxLevels"
            :configured-paths="backendIndicatorVersion?.drillConfig?.drillPaths || []"
          />
          <DrillExplorer
            ref="staticDrillExplorerRef"
            v-else-if="drillResultId"
            :enabled="activeTab === 'drill' && !analysisLoading"
            :result-id="drillResultId"
            :indicator-version-id="currentIndicatorVersionId"
            :path-result-ids="drillPathResultIds"
            :start-filters="reportFilters"
            :indicator-name="currentProfile.name"
            :period="drillPeriod"
            :granularity="backendAnalysisGranularity"
            :start-level="drillStartLevel"
            :start-parent-keys="drillParentKeys"
            :max-levels="drillMaxLevels"
            :configured-paths="backendIndicatorVersion?.drillConfig?.drillPaths || []"
            embedded
          />
          <div v-else class="analysis-empty-state">
            {{ analysisErrorMessage || '当前没有可下钻的结果，请确认指标已配置下钻路径，并检查所选统计周期是否有数据。' }}
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
    <el-drawer v-model="showDataDiagnostics" title="计算诊断" size="620px" destroy-on-close>
      <CalculationDiagnostics
        v-if="showDataDiagnostics && selectedBackendIndicator && currentIndicatorVersionId"
        :indicator-id="String(selectedBackendIndicator.id || selectedBackendIndicator.indicatorId)"
        :indicator-version-id="String(currentIndicatorVersionId)"
        :period-range="reportPeriodRange"
        :granularity="backendAnalysisGranularity"
        :instant-result="rangeSummary"
        :has-runtime-parameters="Boolean(indicatorRuntimeParameters.length)"
        :pending="analysisLoading || rangeSummaryLoading"
        @open-batch="openCalculationBatch"
      />
      <p class="diagnostics-intro">这里说明当前指标的计算口径、结果可用性和追溯信息。</p>
      <section class="diagnostics-section diagnostics-explanation">
        <h3>指标计算口径</h3>
        <p>{{ indicatorDataExplanation.formulaText }}</p>
        <div v-if="indicatorDataExplanation.operands.length" class="formula-operands">
          <article v-for="operand in indicatorDataExplanation.operands" :key="operand.key || operand.role" class="formula-operand">
            <span>{{ operand.role === 'NUMERATOR' ? '分子' : operand.role === 'DENOMINATOR' ? '分母' : '参与因子' }}</span>
            <strong>{{ operand.factorNames.join('、') || '-' }}</strong>
            <p>因子版本：{{ operand.factorVersionIds.join('、') || '-' }}</p>
            <template v-if="operand.role !== 'FACTOR'">
              <div class="formula-operand__result"><span>本期结果</span><strong>{{ formatExplanationOperandValue(operand) }}</strong></div>
              <p v-if="!operand.hasResultValue && operand.role !== 'FACTOR'">当前结果未提供{{ operand.role === 'NUMERATOR' ? '分子' : '分母' }}值。</p>
            </template>
          </article>
        </div>
        <p v-else>当前指标版本暂无可展示的参与因子。</p>
      </section>
      <ResultAvailabilityPanel v-if="analysisAvailability" :availability="analysisAvailability" @open-batch="openCalculationBatch" />
      <section v-if="availablePeriod" class="diagnostics-section">
        <h3>可用数据范围</h3>
        <p>{{ availablePeriodDetailText }}</p>
        <el-table v-if="availablePeriod.factors?.length" :data="availablePeriod.factors" size="small">
          <el-table-column prop="factorVersionId" label="因子版本" min-width="150" />
          <el-table-column prop="availabilityStatus" label="状态" width="110" />
          <el-table-column label="可用日期" min-width="160"><template #default="{ row }">{{ row.earliestDataDate || '-' }} 至 {{ row.latestDataDate || '-' }}</template></el-table-column>
          <el-table-column prop="message" label="说明" min-width="180" />
        </el-table>
      </section>
      <section class="diagnostics-section">
        <h3>结果追溯</h3>
        <p :title="`指标版本：${analysisMetadata.version}；结果批次：${analysisMetadata.batch}；数据水位：${analysisMetadata.watermark}`">
          指标版本：{{ compactId(analysisMetadata.version) }}；结果批次：{{ compactId(analysisMetadata.batch) }}；数据水位：{{ compactId(analysisMetadata.watermark) }}
        </p>
      </section>
    </el-drawer>
  </div>
</template>

<script setup>
import { userStorage } from '@/idmp/auth/userStorage.js'
const localStorage = userStorage()
import { canRequest } from '@/idmp/auth/session'
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '@/idmp/utils/message'
import { Download } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import ResultAvailabilityPanel from '@/idmp/components/ResultAvailabilityPanel.vue'
import RuntimeParameterFields from '@/idmp/components/RuntimeParameterFields.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import IndicatorDrillAnalysis from '@/idmp/features/analysis/IndicatorDrillAnalysis.vue'
import { fetchIndicatorAnalysis, fetchIndicatorRangeSummary, fetchIndicatorAvailablePeriod, fetchIndicatorGrainOptions, fetchAllIndicators, fetchIndicatorVersion, fetchAllIndicatorVersions, queryIndicatorSummary } from '@/idmp/api/modules/indicators'
import { fetchFactorVersion } from '@/idmp/api/modules/factors'
import { collectFormulaFactorVersionIds, createIndicatorDataExplanation, extractIndicatorFormula } from '@/idmp/api/adapters/indicator'
import { deriveDrillPathResultIds } from '@/idmp/api/adapters/drill'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { fetchDepartmentNames } from '@/idmp/api/modules/departments'
import { isDepartmentCodeField } from '@/idmp/features/shared/departmentDictionary.js'
import { resolveResultAvailability } from '@/idmp/features/analysis/resultAvailability'
import { resolveIndicatorCalculationMode } from '@/idmp/features/analysis/calculationMode'
import { createDepartmentRankRows, loadDepartmentComparisons, normalizeDepartmentComparisons, resolveAnalysisDrillPaths } from '@/idmp/features/analysis/departmentRanking'
import { fetchDrillPathVersion } from '@/idmp/api/modules/meta'
import { useAnalysisPeriod } from '@/idmp/features/analysis/useAnalysisPeriod'
import CalculationDiagnostics from '@/idmp/features/analysis/CalculationDiagnostics.vue'
import { loadTrendGrainMemberNames, namedTrendGrainOptions, trendGrainField, trendGrainNames } from '@/idmp/features/analysis/trendGrain.js'
import { resolvePrimaryAnalysisOverview } from '@/idmp/features/dashboard/visualization'
import { buildSqlRuntimeParameterValues, collectSqlRuntimeParameters, validateSqlRuntimeParameterValues } from '@/idmp/api/adapters/sqlImport'
import { exportIndicatorAnalysisPdf } from '@/idmp/api/modules/indicators'
import { analysisPdfFilename, buildAnalysisPdfReport, downloadAnalysisPdf, renderAnalysisChartPng } from '@/idmp/features/analysis/pdfReport'
import { formatPeriodLabel, analysisReportContext, resolveReportPeriod, reportPeriodQuery, normalizeAnalysisGranularity, shiftReportDate, analysisFilterParams, analysisFilters, analysisRouteKey, sourceAvailableReportRange } from '@/idmp/features/analysis/reportPeriod.js'
import { formatResultPeriod } from '@/idmp/utils/periodRange.js'
import { buildReportSummaryRequest } from '@/idmp/features/analysis/reportQuery.js'
import { createRequestScope, useLatestResult } from '@/idmp/features/analysis/useLatestResult.js'
import { useReportSummary } from '@/idmp/features/analysis/useReportSummary.js'
import { reportOverview, reportProvenance } from '@/idmp/features/analysis/reportResult.js'
import { formatResultNumber } from '@/idmp/features/shared/resultPresentation.js'

import AnalysisOverview from '@/idmp/features/analysis/AnalysisOverview.vue'
import AnalysisTrend from '@/idmp/features/analysis/AnalysisTrend.vue'
import AnalysisDepartmentRanking from '@/idmp/features/analysis/AnalysisDepartmentRanking.vue'
import { createAnalysisProfile, createOverviewPresentation, resolveAnalysisPerformanceTarget } from '@/idmp/features/analysis/overviewPresentation.js'
import { createAnalysisTrendPresentation } from '@/idmp/features/analysis/trendPresentation.js'

const route = useRoute()
const router = useRouter()
const activeTab = ref('trend')
const period = ref('月度')
const initialReportContext = analysisReportContext(route.query)
const reportGranularity = ref(initialReportContext.granularity)
const reportSummaryGranularity = ref(initialReportContext.summaryGranularity)
const reportSelection = computed(() => resolveReportPeriod(reportPeriodRange.value,
  reportGranularity.value === 'STATIC' ? 'STATIC' : reportSummaryGranularity.value,
  { parameters: buildSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value) }))
const reportDirty = ref(false)
const reportSubmitting = ref(false)
const reportFilterParams = computed(() => analysisFilterParams(route.query))
const reportFilters = computed(() => analysisFilters(route.query))
const hasReportFilters = computed(() => Object.keys(reportFilters.value).length > 0)
let localReportRouteKey = ''
let localTrendRouteKey = ''
const reportResultModeLabel = computed(() => rangeSummary.value?.executionMode === 'FORMAL_RESULTS' ? '正式结果汇总' : '即时计算')
const overviewQuery = useLatestResult()
const trendQuery = useLatestResult()
const initializationScope = createRequestScope()
const directoryScope = createRequestScope()
let pageInactive = false
const reportQuery = useReportSummary({ canRequest, fetchFormal: fetchIndicatorRangeSummary,
  fetchInstant: queryIndicatorSummary, notify: message => ElMessage.warning(message) })
const { data: backendAnalysis, error: analysisErrorMessage } = overviewQuery
const { data: trendBackendAnalysis, loading: trendLoading, error: trendErrorMessage } = trendQuery
const { summary: rangeSummary, loading: rangeSummaryLoading, error: rangeSummaryErrorMessage,
  runtime: reportRuntimeResult, parameters: reportParameterSnapshot } = reportQuery
const runtimeQueryResult = computed(() => indicatorRuntimeParameters.value.length ? reportRuntimeResult.value : null)
const backendIndicatorVersion = ref(null)
const metricDisplay = computed(() => extractIndicatorFormula(backendIndicatorVersion.value)?.display)
const departmentNamesByCode = ref({})
const formulaFactorVersions = ref({})
const formulaMetadataLoading = ref(false)
const availablePeriod = ref(null)
const analysisLoading = ref(false)
const selectedIndicatorCode = ref(String(route.query.indicator || ''))
const backendIndicators = ref([])
const indicatorOptionsLoading = ref(false)
const drillStartLevel = ref(String(route.query.drillStartLevel || 'HOSPITAL').toUpperCase())
const drillParentKeys = ref(parseDrillParentKeys(route.query.drillParentKeys))
const analysisPeriodRange = ref(initialAnalysisPeriodRange())
const isSourceDefaultTrendRange = ref(false)
let sourceTrendRangePending = !isCompleteDateRange(analysisPeriodRange.value)
const reportPeriodRange = ref(initialReportPeriodRange())
const trendPeriodDraft = ref([...analysisPeriodRange.value])
const trendMonthRange = computed({
  get: () => trendPeriodDraft.value.map(value => String(value).slice(0, 7)),
  set: range => { trendPeriodDraft.value = normalizeTrendMonthRange(range) }
})
const trendGrainDraft = ref({})
const trendAdvancedExpanded = ref([])
const trendGrainCandidates = ref({})
const trendGrainResolvedNames = ref({})
const trendGrainLoading = ref({})
const trendGrainRequestGenerations = new Map()
const trendGrainApplied = ref({})
const showDataDiagnostics = ref(false)
const indicatorRuntimeParameterValues = ref({})
const drillExplorerRef = ref()
const staticDrillExplorerRef = ref()
const pdfExportLoading = ref(false)
const canExportPdf = computed(() => Boolean(selectedBackendIndicator.value && currentIndicatorVersionId.value)
  && !analysisLoading.value && !formulaMetadataLoading.value && !rangeSummaryLoading.value && !trendLoading.value && !reportDirty.value
  && !rangeSummaryErrorMessage.value && !analysisErrorMessage.value && !trendErrorMessage.value)

function parseDrillParentKeys(value) {
  const text = Array.isArray(value) ? value[0] : value
  if (typeof text !== 'string' || !text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([key, item]) => (
      typeof item === 'string' || typeof item === 'number' ? [[key, String(item)]] : []
    )))
  } catch {
    return {}
  }
}

const indicatorCode = computed(() => String(route.query.indicator || ''))
const analysisIndicatorOptions = computed(() =>
  createBackendAnalysisOptions(backendIndicators.value)
)
const selectedBackendIndicator = computed(() => backendIndicators.value.find((item) => {
  const key = getBackendIndicatorKey(item)
  return [key, item.id, item.indicatorId, item.code].some((value) => String(value || '') === indicatorCode.value)
}))
const currentProfile = computed(() => createAnalysisProfile(
  selectedBackendIndicator.value || {
    code: indicatorCode.value,
    name: route.query.indicatorName || '未选择指标',
    unit: ''
  },
  selectedBackendIndicator.value
    ? resolveAnalysisPerformanceTarget(currentIndicatorVersionId.value, trendBackendAnalysis.value, backendAnalysis.value) : null,
  metricDisplay.value
))
const backendAnalysisGranularity = computed(() => reportGranularity.value)
const indicatorRuntimeParameters = computed(() => collectSqlRuntimeParameters(
  (Array.isArray(backendIndicatorVersion.value?.factorRuntimeParameters) ? backendIndicatorVersion.value.factorRuntimeParameters : [])
    .map(group => ({ ...group, key: group.factorCode || group.factorVersionId }))
))
const indicatorRuntimeParameterConflicts = computed(() => indicatorRuntimeParameters.value.filter(item => item.conflict))
const runtimeQueryExecutionModeLabel = computed(() => runtimeQueryResult.value?.executionMode === 'AD_HOC_SOURCE' ? '源数据即时重算' : '读取正式结果')
const runtimeQueryParameterSnapshot = computed(() => JSON.stringify(runtimeQueryResult.value?.parameterSnapshot || {}))
const trendAnalysisGranularity = computed(() => {
  if (period.value === '日度') return 'DAILY'
  if (period.value === '月度') return 'MONTHLY'
  if (period.value === '年度') return 'YEARLY'
  if (period.value === '季度') return 'QUARTERLY'
  return 'MONTHLY'
})
const trendGrainFields = computed(() => Array.isArray(backendIndicatorVersion.value?.dimensionGrain)
  ? backendIndicatorVersion.value.dimensionGrain.map(String).filter(Boolean) : [])
const trendGrainMetadata = computed(() => trendGrainFields.value.map(code => trendGrainField(code, backendIndicatorVersion.value?.drillConfig?.drillPaths || [])))
const trendGrainNameMaps = computed(() => {
  const maps = trendGrainNames(trendGrainMetadata.value, [backendAnalysis.value, trendBackendAnalysis.value]
    .filter(analysis => String(analysis?.indicatorVersionId || '') === String(currentIndicatorVersionId.value)))
  for (const [code, names] of Object.entries(trendGrainResolvedNames.value)) {
    if (maps[code]) for (const [value, name] of names) maps[code].set(value, name)
  }
  return maps
})

const trendGrainControls = computed(() => trendGrainMetadata.value.map(field => ({
  ...field, options: trendGrainOptions(field.code), loading: Boolean(trendGrainLoading.value[field.code])
})))

function trendGrainOptions(code) {
  const field = trendGrainMetadata.value.find(field => field.code === code)
  if (!field) return []
  return namedTrendGrainOptions(trendGrainCandidates.value[code], field, trendGrainNameMaps.value[code])
}

async function loadTrendGrainOptions(code, search = '') {
  const indicator = selectedBackendIndicator.value
  const versionId = currentIndicatorVersionId.value
  const index = trendGrainFields.value.indexOf(code)
  if (!indicator || !versionId || index < 0) return
  const params = { indicatorVersionId: versionId, fieldCode: code, search, limit: 100 }
  if (isCompleteDateRange(trendPeriodDraft.value) && !isSourceDefaultTrendRange.value) {
    params.periodStart = trendPeriodDraft.value[0]
    params.periodEnd = trendPeriodDraft.value[1]
  }
  const generation = (trendGrainRequestGenerations.get(code) || 0) + 1
  trendGrainRequestGenerations.set(code, generation)
  trendGrainLoading.value[code] = true
  try {
    let options = await fetchIndicatorGrainOptions(String(indicator.id || indicator.indicatorId), params)
    if (trendGrainRequestGenerations.get(code) !== generation || currentIndicatorVersionId.value !== versionId) return
    const definition = trendGrainMetadata.value.find(field => field.code === code)
    if (!definition) return
    const departmentNames = isDepartmentCodeField(code) ? await fetchDepartmentNames() : null
    if (trendGrainRequestGenerations.get(code) !== generation || currentIndicatorVersionId.value !== versionId) return
    if (departmentNames) trendGrainResolvedNames.value[code] = departmentNames
    const missing = namedTrendGrainOptions(options, definition, trendGrainNameMaps.value[code]).filter(item => item.nameMissing).map(item => item.value)
    if (!departmentNames && (missing.length || (search && !options?.length && definition.named && !trendGrainNameMaps.value[code]?.size))) {
      let analysis = [backendAnalysis.value, trendBackendAnalysis.value].find(analysis => String(analysis?.indicatorVersionId || '') === String(versionId) && analysis.dimensionComparison?.some(row => row.resultId))
      if (!analysis) analysis = await fetchIndicatorAnalysis(String(indicator.id || indicator.indicatorId), { ...buildTrendAnalysisParams(trendPeriodDraft.value, versionId, trendAnalysisGranularity.value) })
      const names = await loadTrendGrainMemberNames({ analysis, paths: backendIndicatorVersion.value?.drillConfig?.drillPaths || [],
        field: definition, versionId, selected: { ...trendGrainDraft.value }, requiredCodes: missing, search: searchResultDrill,
        loadAnalysis: query => fetchIndicatorAnalysis(String(indicator.id || indicator.indicatorId), query) })
      if (trendGrainRequestGenerations.get(code) !== generation || currentIndicatorVersionId.value !== versionId) return
      trendGrainResolvedNames.value[code] = new Map([...(trendGrainResolvedNames.value[code] || []), ...names])
    }
    // Some catalogs only search codes. Resolve a typed member name through
    // the current formal rows, then verify the codes against the same filters.
    if (!departmentNames && search && !options?.length) {
      const matches = [...(trendGrainNameMaps.value[code] || new Map())].filter(([value, name]) => name.includes(search) || value.includes(search)).slice(0, 10)
      const responses = await Promise.all(matches.map(([value]) => fetchIndicatorGrainOptions(String(indicator.id || indicator.indicatorId), { ...params, search: value })))
      options = responses.flat().filter(item => matches.some(([value]) => value === String(item.value)))
    }
    if (trendGrainRequestGenerations.get(code) !== generation || currentIndicatorVersionId.value !== versionId) return
    // Keep selected options available so the select never falls back to its code.
    const selected = (trendGrainCandidates.value[code] || []).filter(item => String(item.value) === String(trendGrainDraft.value[code]))
      .map(item => departmentNames?.has(String(item.value)) ? { ...item, label: departmentNames.get(String(item.value)), nameMissing: false } : item)
    const names = new Map(trendGrainNameMaps.value[code] || [])
    selected.filter(item => !item.nameMissing && item.label !== item.value).forEach(item => names.set(String(item.value), item.label))
    const field = trendGrainMetadata.value.find(field => field.code === code)
    if (!field) return
    const named = namedTrendGrainOptions(options, field, names)
    trendGrainCandidates.value[code] = [...new Map([...selected, ...named].map(item => [String(item.value), item])).values()]
  } catch {
    if (trendGrainRequestGenerations.get(code) === generation) ElMessage.warning('筛选候选项读取失败，请重新展开下拉框重试')
  } finally {
    if (trendGrainRequestGenerations.get(code) === generation) trendGrainLoading.value[code] = false
  }
}

function clearTrendGrainFilters() {
  trendGrainDraft.value = {}
  trendGrainCandidates.value = {}
  trendGrainFields.value.forEach(code => trendGrainRequestGenerations.set(code, (trendGrainRequestGenerations.get(code) || 0) + 1))
  trendGrainLoading.value = {}
  applyTrendConditions()
}
const analysisOverview = computed(() => resolvePrimaryAnalysisOverview(backendAnalysis.value))
const currentReportOverview = computed(() => reportOverview(rangeSummary.value, analysisOverview.value,
  reportDirty.value || rangeSummaryLoading.value || Boolean(rangeSummaryErrorMessage.value)))
const indicatorDataExplanation = computed(() => createIndicatorDataExplanation({
  analysis: backendAnalysis.value || {},
  overview: currentReportOverview.value,
  version: backendIndicatorVersion.value || {},
  factorVersions: formulaFactorVersions.value
}))
const hasBackendAnalysisData = computed(() => Boolean(backendAnalysis.value?.dataAvailable && analysisOverview.value))
const rangeSummaryPeriodLabel = computed(() => rangeSummary.value
  ? formatRange([rangeSummary.value.periodStart, rangeSummary.value.periodEnd]) : '')
const analysisAvailability = computed(() => rangeSummary.value
  ? {
      status: rangeSummary.value.status === 'READY' ? 'ACTIVE_RESULT' : rangeSummary.value.status,
      message: rangeSummary.value.message || (rangeSummary.value.status === 'READY' ? `已按指定报告期取得${reportResultModeLabel.value}` : '指定报告期未取得可用结果')
    }
  : backendAnalysis.value ? resolveResultAvailability(backendAnalysis.value) : null)
const reportPeriodLabel = computed(() => (reportDirty.value || rangeSummaryLoading.value || rangeSummaryErrorMessage.value ? formatRange(reportPeriodRange.value) : '') || rangeSummaryPeriodLabel.value || formatAnalysisPeriod(analysisOverview.value) || formatRange(reportPeriodRange.value) || '由最新正式结果确定')
const analysisNotice = computed(() => {
  const availability = analysisAvailability.value
  if (!availability || availability.status === 'ACTIVE_RESULT') return null
  const title = {
    CALCULATION_IN_PROGRESS: '该报告期正在生成指标结果',
    WAITING_FOR_CALCULATION: '该报告期有数据，尚未生成指标结果',
    NO_DATA: '该报告期暂无符合口径的数据',
    INCOMPLETE_DATA: '该报告期缺少部分依赖数据，暂时无法计算',
    NOT_CALCULABLE: '该报告期指标无法计算',
    CALCULATION_ERROR: '该报告期的指标计算未完成',
    COVERAGE_INCOMPLETE: '正式结果未覆盖整个报告期',
    UNSUPPORTED_ROLLUP: '现有正式结果无法精确汇总',
    RESULT_LIMIT_EXCEEDED: '报告期内正式结果过多',
    VALUE_NOT_CALCULABLE: '该报告期的指标值无法计算',
    UNKNOWN: '暂时无法确认该报告期是否可计算'
  }[availability.status] || '该报告期暂无可展示结果'
  return { title, message: availability.message }
})
const rankingResult = computed(() => backendAnalysisGranularity.value === 'STATIC' ? backendAnalysis.value : rankAnalysis.value)
const backendDepartmentComparisons = computed(() =>
  normalizeDepartmentComparisons(
    rankingResult.value?.departmentComparison,
    backendAnalysisGranularity.value === 'STATIC' ? rankingResult.value?.dimensionComparison : [],
    departmentNamesByCode.value
  )
)
const overviewPresentation = computed(() => createOverviewPresentation({
  report: {
    dirty: reportDirty.value, loading: rangeSummaryLoading.value, error: rangeSummaryErrorMessage.value,
    periodLabel: formatRange(reportPeriodRange.value), result: rangeSummary.value,
    resultPeriodLabel: rangeSummaryPeriodLabel.value, modeLabel: reportResultModeLabel.value
  },
  formal: {
    analysis: backendAnalysis.value, overview: analysisOverview.value,
    loading: analysisLoading.value, error: analysisErrorMessage.value,
    periodLabel: formatAnalysisPeriod(analysisOverview.value), availability: analysisAvailability.value,
    dimensionCount: null, hasDrill: Object.keys(drillMaxLevels.value).length > 0
  },
  selected: Boolean(selectedBackendIndicator.value), unit: currentProfile.value.unit, display: metricDisplay.value,
  formula: extractIndicatorFormula(backendIndicatorVersion.value)
}))
const primaryMetric = computed(() => overviewPresentation.value.primary)
const summaryMetrics = computed(() => overviewPresentation.value.summaries)
const trendPresentation = computed(() => createAnalysisTrendPresentation({
  analysis: trendBackendAnalysis.value, profile: currentProfile.value, display: metricDisplay.value,
  granularity: trendAnalysisGranularity.value, range: analysisPeriodRange.value,
  sourceDefaultRange: isSourceDefaultTrendRange.value
}))
const trendTableRows = computed(() => trendPresentation.value.rows)
const hasPeerTrend = computed(() => trendPresentation.value.hasPeer)
const trendOption = computed(() => trendPresentation.value.option)
const rankTableData = computed(() => createDepartmentRankRows({
  comparisons: backendDepartmentComparisons.value, analysis: rankingResult.value || {},
  paths: backendIndicatorVersion.value?.drillConfig?.drillPaths || [],
  granularity: rankInitialized.value ? rankGranularity.value : backendAnalysisGranularity.value,
  unit: currentProfile.value.unit, display: metricDisplay.value
}))

const analysisSourceLabel = computed(() => reportDirty.value ? '待查询' : rangeSummary.value
  ? rangeSummary.value.status === 'READY' ? reportResultModeLabel.value : '区间结果不可用'
  : hasBackendAnalysisData.value ? '已发布结果' : '暂无正式结果')
const availablePeriodText = computed(() => {
  const value = availablePeriod.value
  if (!value) return ''
  if (value.earliestDataDate && value.latestDataDate) return `${value.earliestDataDate} 至 ${value.latestDataDate}`
  const status = String(value.availabilityStatus || '').toUpperCase()
  if (status === 'NO_DATA') return '暂无匹配源数据'
  if (status === 'NO_COMMON_PERIOD') return '各因子可用时间无交集'
  if (status === 'PARTIAL') return '部分因子可用范围未完成探测'
  return '暂无法确定'
})
const availablePeriodDetailText = computed(() => {
  if (!availablePeriod.value) return ''
  return availablePeriodText.value === '暂无法确定'
    ? (availablePeriod.value.message || '尚未形成共同可用数据范围。')
    : `所有依赖数据同时可用于计算的日期范围为 ${availablePeriodText.value}。`
})
const analysisMetadata = computed(() => {
  const context = backendAnalysis.value?.resultContext || {}
  return {
    version: String(rangeSummary.value?.indicatorVersionId || backendAnalysis.value?.indicatorVersionId || currentIndicatorVersionId.value || '-'),
    batch: rangeSummary.value ? '-' : String(context.batchId || context.calculationBatchId || '-'),
    watermark: rangeSummary.value ? '-' : firstPresent(context.dataWatermark, context.watermark),
  }
})
const analysisUpdatedAt = computed(() => {
  if (rangeSummary.value) return '更新时间暂不可用'
  const context = backendAnalysis.value?.resultContext || {}
  return hasBackendAnalysisData.value ? firstPresent(context.activatedAt, '更新时间暂不可用') : '-'
})
const drillPathResultIds = computed(() => {
  const derived = deriveDrillPathResultIds(
    backendAnalysis.value || {}, backendIndicatorVersion.value?.drillConfig?.drillPaths || []
  )
  const routedResultId = String(route.query.drillResultId || '')
  return routedResultId ? { ...derived, ORGANIZATION: routedResultId } : derived
})
const drillResultId = computed(() => String(
  route.query.drillResultId ||
  (backendIndicatorVersion.value?.drillConfig?.drillPaths || [])
    .map(path => drillPathResultIds.value[path.pathCode]).find(Boolean) ||
  drillPathResultIds.value.ORGANIZATION ||
  backendAnalysis.value?.overview?.resultId || backendAnalysis.value?.resultContext?.resultId || ''
))
const drillPeriod = computed(() => String(
  (backendAnalysisGranularity.value === 'STATIC' ? '静态结果' : route.query.period) || formatAnalysisPeriod(analysisOverview.value) || backendAnalysis.value?.resultContext?.period ||
  '-'
))
const drillMaxLevels = computed(() => {
  const paths = backendIndicatorVersion.value?.drillConfig?.drillPaths ||
    backendIndicatorVersion.value?.drillPaths || []
  return Object.fromEntries(paths
    .filter((item) => item?.pathCode && item?.maxLevel)
    .map((item) => [String(item.pathCode), String(item.maxLevel)]))
})
const currentIndicatorVersionId = computed(() => String(
  route.query.indicatorVersionId || selectedBackendIndicator.value?.indicatorVersionId ||
  selectedBackendIndicator.value?.currentPublishedVersionId || selectedBackendIndicator.value?.publishedVersionId ||
  selectedBackendIndicator.value?.currentVersionId || ''
))
const rankPeriodProps = computed(() => ({
  indicatorId: selectedBackendIndicator.value?.id || selectedBackendIndicator.value?.indicatorId || '',
  indicatorVersionId: currentIndicatorVersionId.value,
  filters: reportFilters.value,
  enabled: activeTab.value === 'rank' && backendAnalysisGranularity.value !== 'STATIC'
}))
const { granularity: rankGranularity, selectedPeriod: rankSelectedPeriod, periodOptions: rankPeriodOptions,
  analysis: rankAnalysis, loading: rankLoading, errorMessage: rankErrorMessage, initialized: rankInitialized,
  granularityLabel: rankGranularityLabel, periodPlaceholder: rankPeriodPlaceholder,
  selectedPeriodLabel: rankSelectedPeriodLabel, loadPeriods: loadRankPeriods,
  loadSelectedPeriod: loadSelectedRankPeriod, retryPeriod: retryRankPeriod } = useAnalysisPeriod({
    get indicatorId() { return rankPeriodProps.value.indicatorId },
    get indicatorVersionId() { return rankPeriodProps.value.indicatorVersionId },
    get filters() { return rankPeriodProps.value.filters },
    get enabled() { return rankPeriodProps.value.enabled && !analysisLoading.value }
  }, async (indicatorId, params, options) => {
    const paths = backendIndicatorVersion.value?.drillConfig?.drillPaths || []
    const data = await fetchIndicatorAnalysis(indicatorId, params, options)
    if (params.sections === 'TREND') return data
    return { ...data, departmentComparison: await loadDepartmentComparisons(data, paths, searchResultDrill, analysisFilters(params), options) }
  })
const rankPeriodDescription = computed(() => rankInitialized.value
  ? `${rankGranularityLabel.value} · ${rankSelectedPeriodLabel.value || '暂无周期'} · 科室正式结果`
  : `科室正式结果 · ${formatAnalysisPeriod(backendAnalysis.value?.overview) || '静态结果'}`)

async function exportAnalysisPdf() {
  if (!canExportPdf.value || pdfExportLoading.value) return
  pdfExportLoading.value = true
  const exportContext = () => JSON.stringify([analysisRouteKey(route.query), reportSelection.value, period.value, trendGrainApplied.value])
  const originalContext = exportContext()
  try {
    if (backendAnalysisGranularity.value !== 'STATIC' && !rankInitialized.value && !rankLoading.value) await loadRankPeriods()
    if (!canExportPdf.value || originalContext !== exportContext()) throw new Error('查询条件已变化，请等待当前结果加载完成后重新导出。')
    const drillExplorer = backendAnalysisGranularity.value === 'STATIC' ? staticDrillExplorerRef.value : drillExplorerRef.value
    const drill = activeTab.value === 'drill' ? drillExplorer?.getReportSnapshot() : null
    if (drill?.loading) throw new Error('下钻结果仍在加载，请稍后再导出。')
    if (rankLoading.value) throw new Error('科室排名仍在加载，请稍后再导出。')
    const indicatorId = String(selectedBackendIndicator.value.id || selectedBackendIndicator.value.indicatorId)
    const versionId = currentIndicatorVersionId.value
    const filename = analysisPdfFilename(currentProfile.value.name, versionId)
    const overview = analysisOverview.value || {}
    const report = buildAnalysisPdfReport({
      versionId, primaryMetric: primaryMetric.value, summaryMetrics: summaryMetrics.value,
      metadata: [
        ['报告期', reportPeriodLabel.value], ['结果来源', analysisSourceLabel.value],
        ['报告筛选范围', hasReportFilters.value ? JSON.stringify(reportFilters.value) : '当前账号可访问范围'],
        ['运行参数', rangeSummary.value ? JSON.stringify(reportParameterSnapshot.value) : '未执行即时查询'],
        ['趋势时间', formatRange(analysisPeriodRange.value) || '全部已加载正式周期'],
        ['趋势统计粒度', backendAnalysisGranularity.value === 'STATIC' ? '静态' : period.value],
        ['组合粒度筛选', Object.keys(trendGrainApplied.value).length ? JSON.stringify(trendGrainApplied.value) : '全部']
      ],
      trendRows: trendTableRows.value, hasPeerTrend: hasPeerTrend.value, unit: currentProfile.value.unit,
      trendDescription: `统计粒度：${backendAnalysisGranularity.value === 'STATIC' ? '静态' : period.value}；时间范围：${formatRange(analysisPeriodRange.value) || '全部已加载正式周期'}`,
      chartPng: trendTableRows.value.length ? renderAnalysisChartPng(trendOption.value) : null,
      rankRows: rankTableData.value, rankDescription: rankErrorMessage.value || rankPeriodDescription.value,
      provenance: [
        ['计算公式', indicatorDataExplanation.value.formulaText],
        ...indicatorDataExplanation.value.operands.map(item => [item.role === 'NUMERATOR' ? '分子因子版本' : item.role === 'DENOMINATOR' ? '分母因子版本' : '参与因子版本', item.factorVersionIds.join('、')]),
        ...reportProvenance(rangeSummary.value, overview),
        ['计算批次', analysisMetadata.value.batch], ['数据更新时间', analysisUpdatedAt.value],
        ['结果说明', analysisErrorMessage.value || rangeSummaryErrorMessage.value || analysisNotice.value?.message || '结果可用']
      ], drillSection: drill?.section
    })
    const blob = await exportIndicatorAnalysisPdf(indicatorId, report)
    downloadAnalysisPdf(blob, filename)
    ElMessage.success('PDF 已导出')
  } catch (error) { ElMessage.error(error?.message || 'PDF 导出失败，请稍后重试。') }
  finally { pdfExportLoading.value = false }
}

const openDepartmentDrill = (row) => {
  if (backendAnalysisGranularity.value !== 'STATIC' && row.drillContext) {
    activeTab.value = 'drill'
    nextTick(() => drillExplorerRef.value?.focusResult?.(row.drillContext))
    return
  }
  const canShowDoctors = ['ATTENDING_DOCTOR', 'DOCTOR'].includes(
    String(drillMaxLevels.value.ORGANIZATION || '').toUpperCase()
  )
  drillStartLevel.value = canShowDoctors && row.hospitalCode && row.departmentCode
    ? 'ATTENDING_DOCTOR'
    : 'HOSPITAL'
  drillParentKeys.value = drillStartLevel.value === 'ATTENDING_DOCTOR'
    ? { HOSPITAL_CODE: row.hospitalCode, OUT_DEPT_CODE: row.departmentCode }
    : {}
  activeTab.value = 'drill'
  nextTick(() => drillExplorerRef.value?.focusInitialResult?.())
}

function formatCount(value) {
  return formatResultNumber(value, { maximumFractionDigits: 3 })
}

function formatExplanationOperandValue(operand) {
  if (!operand?.hasResultValue) return '-'
  const value = formatCount(operand.value)
  return value === '-' ? '-' : `${value}${operand.unit || ''}`
}

function compactId(value) {
  const text = String(value || '-')
  return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-8)}` : text
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '-'
}

function switchIndicatorAnalysis() {
  if (!selectedIndicatorCode.value) return
  if (selectedIndicatorCode.value === indicatorCode.value) {
    ElMessage.info('当前已是所选指标分析页')
    return
  }
  const selectedOption = analysisIndicatorOptions.value.find((item) => item.code === selectedIndicatorCode.value)
  router.push({
    path: '/analysis',
    query: {
      indicator: selectedIndicatorCode.value,
      ...(selectedOption?.name ? { indicatorName: selectedOption.name } : {})
    }
  })
}

async function applyReportPeriod() {
  if (reportSubmitting.value || rangeSummaryLoading.value) return
  if (!currentIndicatorVersionId.value) return ElMessage.warning('当前指标没有可查询的已发布版本')
  const temporal = backendAnalysisGranularity.value !== 'STATIC'
  if (temporal && !validateOptionalDateRange(reportPeriodRange.value, '报告期')) return
  const parameterMessage = validateSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value)
  if (parameterMessage) return ElMessage.warning(parameterMessage)
  reportSubmitting.value = true
  try {
    if (temporal && !isCompleteDateRange(reportPeriodRange.value)) {
      const versionId = currentIndicatorVersionId.value
      const availability = availablePeriod.value || await fetchIndicatorAvailablePeriod(versionId)
      if (currentIndicatorVersionId.value !== versionId || reportPeriodRange.value?.some(Boolean)) return
      const range = sourceAvailableReportRange(availability)
      if (!range.length) return ElMessage.warning('暂未取得可用的源数据时间范围，请稍后重试或手动选择报告期')
      reportPeriodRange.value = range
      reportSummaryGranularity.value = 'CUSTOM'
    }
    const query = { ...route.query, ...reportPeriodQuery({ ...reportSelection.value, granularity: backendAnalysisGranularity.value }) }
    if (temporal && analysisRouteKey(query) !== analysisRouteKey(route.query)) {
      reportSummaryGranularity.value = reportSelection.value.summaryGranularity
      localReportRouteKey = analysisRouteKey(query)
      await router.replace({ path: '/analysis', query })
    }
    await loadRangeSummary()
  } catch (error) {
    ElMessage.error(error?.message || '查询条件暂时无法读取，请稍后重试')
  } finally {
    reportSubmitting.value = false
  }
}

async function loadRangeSummary() {
  invalidateReportSummary(false)
  const request = buildReportSummaryRequest({
    indicatorId: selectedBackendIndicator.value?.id || selectedBackendIndicator.value?.indicatorId,
    versionId: currentIndicatorVersionId.value,
    range: reportSelection.value.range,
    granularity: reportSelection.value.summaryGranularity,
    filters: reportFilters.value,
    parameters: indicatorRuntimeParameters.value.length
      ? buildSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value) : undefined
  })
  return reportQuery.load(request)
}

function invalidateReportSummary(dirty = true) {
  reportDirty.value = dirty
  reportQuery.clear()
}

function applyTrendConditions() {
  if (!validateOptionalDateRange(trendPeriodDraft.value, '趋势时间')) return
  const selectedGrain = Object.fromEntries(trendGrainFields.value
    .map(code => [code, String(trendGrainDraft.value[code] || '').trim()])
    .filter(([, value]) => value))
  if (Object.keys(selectedGrain).length && Object.keys(selectedGrain).length !== trendGrainFields.value.length) {
    ElMessage.warning('请填写全部组合粒度字段，或全部留空以查看整体趋势')
    return
  }
  trendGrainApplied.value = selectedGrain
  const wasSourceDefault = isSourceDefaultTrendRange.value
  const keepSourceDefault = wasSourceDefault && JSON.stringify(trendPeriodDraft.value)
    === JSON.stringify(sourceAvailableTrendRange(availablePeriod.value))
  isSourceDefaultTrendRange.value = keepSourceDefault
  sourceTrendRangePending = false
  analysisPeriodRange.value = isCompleteDateRange(trendPeriodDraft.value) ? [...trendPeriodDraft.value] : []
  const query = { ...route.query }
  if (isCompleteDateRange(analysisPeriodRange.value) && !keepSourceDefault) {
    query.trendStart = analysisPeriodRange.value[0]
    query.trendEnd = analysisPeriodRange.value[1]
    rememberAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value, analysisPeriodRange.value)
  } else {
    delete query.trendStart
    delete query.trendEnd
    if (!keepSourceDefault) forgetAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value)
  }
  if (String(route.query.trendStart || '') !== String(query.trendStart || '')
    || String(route.query.trendEnd || '') !== String(query.trendEnd || '')) {
    localTrendRouteKey = analysisRouteKey(query)
    router.replace({ path: '/analysis', query })
  }
  refreshTrendAnalysis()
}

function applyTrendGranularity() {
  refreshTrendAnalysis()
}

async function refreshTrendAnalysis() {
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator || backendAnalysisGranularity.value === 'STATIC') return trendQuery.clear()
  const indicatorId = String(backendIndicator.id || backendIndicator.indicatorId)
  const params = buildTrendAnalysisParams(analysisPeriodRange.value, currentIndicatorVersionId.value, trendAnalysisGranularity.value)
  return trendQuery.run(({ signal }) => fetchIndicatorAnalysis(indicatorId, params, { signal }), {
    formatError: error => error?.message ? `趋势结果暂不可用：${error.message}` : '趋势结果暂不可用，请稍后重试。'
  })
}

function clearTrendPeriod() {
  trendPeriodDraft.value = []
  applyTrendConditions()
}

function openCalculationBatch(batchId) {
  router.push({ path: '/calc', query: { batchId: String(batchId) } })
}

async function loadBackendAnalysisIndicators() {
  const request = directoryScope.begin()
  indicatorOptionsLoading.value = true
  try {
    const [indicators, publishedVersions] = await Promise.all([
      fetchAllIndicators({}, { signal: request.signal }),
      fetchAllIndicatorVersions({ publicationStatus: 'PUBLISHED' }, { signal: request.signal })
    ])
    if (!request.isCurrent()) return
    backendIndicators.value = mergePublishedAnalysisIndicators(
      normalizeList(indicators),
      normalizeList(publishedVersions)
    )
    if (selectedBackendIndicator.value) {
      const backendName = selectedBackendIndicator.value.name || ''
      if (backendName && route.query.indicatorName !== backendName) {
        await router.replace({ path: '/analysis', query: { ...route.query, indicatorName: backendName } })
      }
      if (request.isCurrent()) await refreshIndicatorAnalysis()
    } else if (backendIndicators.value.length) {
      const firstOption = createBackendAnalysisOptions(backendIndicators.value)[0]
      if (firstOption?.code) {
        selectedIndicatorCode.value = firstOption.code
        await router.replace({ path: '/analysis', query: { ...route.query, indicator: firstOption.code, indicatorName: firstOption.name } })
        if (request.isCurrent()) await refreshIndicatorAnalysis()
      }
    } else {
      selectedIndicatorCode.value = ''
      backendAnalysis.value = null
      trendBackendAnalysis.value = null
    }
  } catch {
    if (!request.isCurrent()) return
    backendIndicators.value = []
    ElMessage.warning('指标列表加载失败，请重试')
  } finally {
    if (request.isCurrent()) indicatorOptionsLoading.value = false
  }
}

function createBackendAnalysisOptions(indicators) {
  const mappedOptions = indicators.filter(isPublishedIndicator).map((item) => {
    const key = getBackendIndicatorKey(item)
    return {
      optionKey: key,
      code: key,
      name: item.name || '未命名指标',
      backendCode: item.code,
      source: '指标',
      backendId: item.id || item.indicatorId || key,
      disabled: false
    }
  })
  return mappedOptions
}

function mergePublishedAnalysisIndicators(indicators, publishedVersions) {
  const indicatorsById = new Map(indicators.map((item) => [String(item.id || item.indicatorId || ''), item]))
  const indicatorsByCode = new Map(indicators.map((item) => [String(item.code || ''), item]))
  const directoryOrder = new Map(indicators.map((item, index) => [getIndicatorDirectoryKey(item), index]))
  const orderedVersions = [...publishedVersions].sort((left, right) => {
    const leftIndicator = left.indicator || {}
    const rightIndicator = right.indicator || {}
    const leftBase = indicatorsById.get(String(left.indicatorId || leftIndicator.id || '')) || indicatorsByCode.get(String(left.indicatorCode || left.code || leftIndicator.code || '')) || left
    const rightBase = indicatorsById.get(String(right.indicatorId || rightIndicator.id || '')) || indicatorsByCode.get(String(right.indicatorCode || right.code || rightIndicator.code || '')) || right
    const leftCreated = getIndicatorCreatedAt(leftBase)
    const rightCreated = getIndicatorCreatedAt(rightBase)
    if (leftCreated && rightCreated && leftCreated !== rightCreated) return rightCreated.localeCompare(leftCreated)
    return (directoryOrder.get(getIndicatorDirectoryKey(leftBase)) ?? Number.MAX_SAFE_INTEGER) -
      (directoryOrder.get(getIndicatorDirectoryKey(rightBase)) ?? Number.MAX_SAFE_INTEGER)
  })
  const seenIndicators = new Set()
  return orderedVersions.map((version) => {
    const versionIndicator = version.indicator || {}
    const indicatorId = String(version.indicatorId || versionIndicator.id || '')
    const code = String(version.indicatorCode || version.code || versionIndicator.code || '')
    const indicator = indicatorsById.get(indicatorId) || indicatorsByCode.get(code)
    if (!indicator) return null
    const versionId = version.id || version.versionId || version.indicatorVersionId || ''
    const directoryKey = getIndicatorDirectoryKey(indicator)
    if (!versionId || !directoryKey || seenIndicators.has(directoryKey)) return null
    seenIndicators.add(directoryKey)
    return {
      ...indicator,
      id: indicator.id || indicatorId || versionId,
      indicatorId: indicator.id || indicator.indicatorId || indicatorId,
      code: indicator.code || code,
      name: indicator.name || version.indicatorName || version.name || '未命名指标',
      status: 'PUBLISHED',
      publicationStatus: 'PUBLISHED',
      currentPublishedVersionId: versionId,
      publishedVersionId: versionId
    }
  }).filter(Boolean)
}

function getIndicatorDirectoryKey(indicator) {
  return String(indicator?.id || indicator?.indicatorId || indicator?.code || '')
}

function getIndicatorCreatedAt(indicator) {
  const value = indicator?.createdAt || indicator?.createTime || indicator?.created_at
  return value ? String(value) : ''
}

function isPublishedIndicator(indicator) {
  const status = String(indicator?.publicationStatus ?? indicator?.status ?? '').toUpperCase()
  return status === 'PUBLISHED' || Boolean(indicator?.currentPublishedVersionId || indicator?.publishedVersionId)
}

function getBackendIndicatorKey(indicator) {
  return String(indicator?.id || indicator?.indicatorId || indicator?.code || indicator?.name || '')
}

function buildAnalysisParams(range = [], versionId = currentIndicatorVersionId.value, granularity = backendAnalysisGranularity.value) {
  const params = { granularity, ...reportFilterParams.value }
  if (versionId) params.indicatorVersionId = versionId
  if (granularity !== 'STATIC' && isCompleteDateRange(range)
    && !(isSourceDefaultTrendRange.value && range === analysisPeriodRange.value)) {
    params.periodStart = range[0]
    params.periodEnd = range[1]
  }
  return params
}

function buildTrendAnalysisParams(range, versionId, granularity) {
  const params = { ...buildAnalysisParams(range, versionId, granularity), sections: 'TREND' }
  if (trendGrainFields.value.length && Object.keys(trendGrainApplied.value).length && granularity !== 'STATIC') {
    params.grainSelection = 'EXACT'
    Object.entries(trendGrainApplied.value).forEach(([code, value]) => { params[`filter.${code}`] = value })
  }
  return params
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

async function refreshIndicatorAnalysis() {
  const request = initializationScope.begin()
  invalidateReportSummary(false)
  overviewQuery.clear()
  trendQuery.clear()
  analysisLoading.value = true
  backendIndicatorVersion.value = null
  departmentNamesByCode.value = {}
  formulaFactorVersions.value = {}
  formulaMetadataLoading.value = false
  availablePeriod.value = null
  const backendIndicator = selectedBackendIndicator.value
  const initialVersionId = currentIndicatorVersionId.value
  try {
    if (!backendIndicator || !request.isCurrent()) return
    if (initialVersionId) {
      try {
        const version = await fetchAnalysisIndicatorVersion(initialVersionId, request)
        if (!request.isCurrent()) return
        backendIndicatorVersion.value = version
      } catch (error) {
        if (!request.isCurrent()) return
        throw error
      }
    }
    const calculationMode = resolveIndicatorCalculationMode(backendIndicatorVersion.value, backendIndicator, route.query.granularity)
    if (calculationMode === 'STATIC') {
      reportGranularity.value = 'STATIC'
      reportPeriodRange.value = []
      analysisPeriodRange.value = []
      trendPeriodDraft.value = []
      isSourceDefaultTrendRange.value = false
      sourceTrendRangePending = false
    } else if (reportGranularity.value === 'STATIC') {
      reportGranularity.value = normalizeAnalysisGranularity(route.query.granularity) === 'STATIC'
        ? 'MONTHLY' : normalizeAnalysisGranularity(route.query.granularity)
    }
    if (calculationMode !== 'STATIC') void loadAvailablePeriod(initialVersionId, request)
    void loadDepartmentNames(request)
    if (backendIndicatorVersion.value) void loadAnalysisFormulaFactorVersions(backendIndicatorVersion.value, request)

    const backendIndicatorId = String(backendIndicator.id || backendIndicator.indicatorId)
    if (calculationMode !== 'STATIC' && isCompleteDateRange(reportPeriodRange.value)
      && !validateSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value)) {
      void loadRangeSummary()
    }
    // Overview and trend publish independently, without waiting for one another.
    void refreshTrendAnalysis()
    const params = { ...buildAnalysisParams(reportPeriodRange.value), sections: [
      'OVERVIEW', 'CALCULATION_TARGETS', 'TIME_COMPARISON',
      ...(calculationMode === 'STATIC' ? ['DEPARTMENT_COMPARISON'] : [])
    ] }
    const result = await overviewQuery.run(({ signal }) => fetchIndicatorAnalysis(backendIndicatorId, params, { signal }), {
      formatError: error => error?.message ? `指定周期正式结果暂不可用：${error.message}`
        : '指定周期尚无已激活正式结果，请先生成正式计算批次。'
    })
    if (!request.isCurrent() || !result) return
    if (backendAnalysisGranularity.value !== 'STATIC' && !reportDirty.value && !reportPeriodRange.value.length
      && result.overview?.periodStart && result.overview?.periodEnd) {
      reportPeriodRange.value = [normalizeDateValue(result.overview.periodStart), shiftReportDate(result.overview.periodEnd, -1)]
    }
  } catch (error) {
    if (request.isCurrent()) analysisErrorMessage.value = error?.message || '指标配置暂时无法读取，请稍后重试。'
  } finally {
    if (request.isCurrent()) analysisLoading.value = false
  }
}

async function fetchAnalysisIndicatorVersion(versionId, request) {
  const options = { signal: request.signal }
  const version = await fetchIndicatorVersion(versionId, options)
  request.signal.throwIfAborted()
  const formula = extractIndicatorFormula(version)
  const paths = await resolveAnalysisDrillPaths(version.drillConfig?.drillPaths || [], id => fetchDrillPathVersion(id, options))
  return { ...version, formula: formula || version?.formula || version?.formulaAst,
    drillConfig: { ...version.drillConfig, drillPaths: paths } }
}

async function loadAnalysisFormulaFactorVersions(version, request) {
  formulaMetadataLoading.value = true
  const ids = collectFormulaFactorVersionIds(extractIndicatorFormula(version))
  const responses = await Promise.allSettled(ids.map(id => fetchFactorVersion(id, { signal: request.signal })))
  if (!request.isCurrent()) return
  formulaFactorVersions.value = Object.fromEntries(responses.flatMap((response, index) => (
    response.status === 'fulfilled' && response.value ? [[ids[index], response.value]] : []
  )))
  formulaMetadataLoading.value = false
}

async function loadDepartmentNames(request) {
  try {
    const names = Object.fromEntries(await fetchDepartmentNames())
    if (request.isCurrent()) departmentNamesByCode.value = names
  } catch {
    // The shared dictionary has its own lifecycle; only this page's consumer is invalidated.
  }
}

async function loadAvailablePeriod(versionId, request) {
  if (!versionId) return null
  try {
    const value = await fetchIndicatorAvailablePeriod(versionId, { signal: request.signal })
    if (!request.isCurrent()) return null
    availablePeriod.value = value
    if (sourceTrendRangePending && !isCompleteDateRange(analysisPeriodRange.value)
      && !trendPeriodDraft.value.some(Boolean)) {
      const sourceRange = sourceAvailableTrendRange(value)
      if (isCompleteDateRange(sourceRange)) {
        analysisPeriodRange.value = sourceRange
        trendPeriodDraft.value = [...sourceRange]
        isSourceDefaultTrendRange.value = true
        sourceTrendRangePending = false
      }
    }
    return value
  } catch {
    if (request.isCurrent()) availablePeriod.value = null
    return null
  }
}

onMounted(loadBackendAnalysisIndicators)
onDeactivated(() => {
  pageInactive = true
  directoryScope.cancel()
  initializationScope.cancel()
  overviewQuery.clear()
  trendQuery.clear()
  reportQuery.clear()
  analysisLoading.value = false
  formulaMetadataLoading.value = false
})
onActivated(() => {
  if (!pageInactive) return
  pageInactive = false
  if (backendIndicators.value.length) refreshIndicatorAnalysis()
  else loadBackendAnalysisIndicators()
})

watch(() => analysisRouteKey(route.query), key => {
  if (key === localReportRouteKey) { localReportRouteKey = ''; return }
  if (key === localTrendRouteKey) { localTrendRouteKey = ''; return }
  localReportRouteKey = ''
  localTrendRouteKey = ''
  const reportContext = analysisReportContext(route.query)
  reportGranularity.value = reportContext.granularity
  reportSummaryGranularity.value = reportContext.summaryGranularity
  selectedIndicatorCode.value = indicatorCode.value
  drillStartLevel.value = String(route.query.drillStartLevel || 'HOSPITAL').toUpperCase()
  drillParentKeys.value = parseDrillParentKeys(route.query.drillParentKeys)
  analysisPeriodRange.value = initialAnalysisPeriodRange()
  trendPeriodDraft.value = [...analysisPeriodRange.value]
  isSourceDefaultTrendRange.value = false
  sourceTrendRangePending = !isCompleteDateRange(analysisPeriodRange.value)
  trendGrainDraft.value = {}
  trendGrainApplied.value = {}
  trendAdvancedExpanded.value = []
  trendGrainCandidates.value = {}
  trendGrainLoading.value = {}
  trendGrainResolvedNames.value = {}
  trendGrainFields.value.forEach(code => trendGrainRequestGenerations.set(code, (trendGrainRequestGenerations.get(code) || 0) + 1))
  reportPeriodRange.value = initialReportPeriodRange()
  indicatorRuntimeParameterValues.value = {}
  reportQuery.clear()
  period.value = '月度'
  if (!pageInactive && !indicatorOptionsLoading.value) refreshIndicatorAnalysis()
})

function initialAnalysisPeriodRange() {
  const range = route.query.trendStart && route.query.trendEnd
    ? [normalizeDateValue(route.query.trendStart), normalizeDateValue(route.query.trendEnd)]
    : String(route.query.granularity).toUpperCase() === 'CUSTOM' ? analysisReportContext(route.query).range
      : readRememberedAnalysisPeriod(route.query.indicator, route.query.indicatorVersionId)
  return normalizeTrendMonthRange(range)
}

function normalizeTrendMonthRange(range) {
  if (!Array.isArray(range) || range.length !== 2) return []
  const months = range.map(value => String(value || '').slice(0, 7))
  if (months.some(value => !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)) || months[0] > months[1]) return []
  const end = new Date(`${months[1]}-01T00:00:00Z`)
  end.setUTCMonth(end.getUTCMonth() + 1)
  end.setUTCDate(0)
  return [`${months[0]}-01`, end.toISOString().slice(0, 10)]
}

function initialReportPeriodRange() {
  return analysisReportContext(route.query).range
}

function normalizeDateValue(value) {
  return String(value || '').slice(0, 10)
}

function sourceAvailableTrendRange(availability) {
  const start = normalizeDateValue(availability?.earliestDataDate)
  const end = normalizeDateValue(availability?.latestDataDate)
  return start && end && start <= end ? normalizeTrendMonthRange([start, end]) : []
}

function isCompleteDateRange(range) {
  return Array.isArray(range) && Boolean(range[0] && range[1])
}

function validateOptionalDateRange(range, label) {
  if (!Array.isArray(range) || !range.some(Boolean)) return true
  if (!isCompleteDateRange(range)) {
    ElMessage.warning(`请选择完整的${label}范围`)
    return false
  }
  if (String(range[0]) > String(range[1])) {
    ElMessage.warning(`${label}的开始日期不能晚于结束日期`)
    return false
  }
  return true
}

function readRememberedAnalysisPeriod(indicatorId, versionId) {
  if (typeof localStorage === 'undefined') return []
  const keys = [
    versionId && `idmp:analysis-period:version:${versionId}`,
    indicatorId && `idmp:analysis-period:indicator:${indicatorId}`
  ].filter(Boolean)
  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null')
      if (value?.periodStart && value?.periodEnd) return [normalizeDateValue(value.periodStart), normalizeDateValue(value.periodEnd)]
    } catch {
      localStorage.removeItem(key)
    }
  }
  return []
}

function rememberAnalysisPeriod(indicatorId, versionId, range) {
  if (typeof localStorage === 'undefined' || !isCompleteDateRange(range)) return
  const value = JSON.stringify({ periodStart: String(range[0]), periodEnd: String(range[1]) })
  if (indicatorId) localStorage.setItem(`idmp:analysis-period:indicator:${indicatorId}`, value)
  if (versionId) localStorage.setItem(`idmp:analysis-period:version:${versionId}`, value)
}

function formatAnalysisPeriod(result) {
  if (backendAnalysisGranularity.value === 'STATIC') return '静态结果'
  if (!result?.periodStart || !result?.periodEnd) return ''
  return formatResultPeriod(result.periodStart, result.periodEnd)
}

function formatRange(range) {
  if (backendAnalysisGranularity.value === 'STATIC') return '静态结果'
  return isCompleteDateRange(range) ? formatPeriodLabel(range[0], range[1]) : ''
}

function forgetAnalysisPeriod(indicatorId, versionId) {
  if (typeof localStorage === 'undefined') return
  if (indicatorId) localStorage.removeItem(`idmp:analysis-period:indicator:${indicatorId}`)
  if (versionId) localStorage.removeItem(`idmp:analysis-period:version:${versionId}`)
}

</script>

<style scoped lang="scss">
.indicator-analysis {
  min-width: 0;
}

.analysis-error-alert {
  margin-bottom: 16px;
}

.instant-query-panel {
  display: grid;
  gap: 14px;
  margin-bottom: var(--idmp-space-4);
  padding: 16px 20px;
}

.runtime-query-result__summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.instant-query-panel__header { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; padding-bottom: 12px; border-bottom: 1px solid var(--idmp-border-subtle); }
.instant-query-panel__header h2 { flex: 0 0 auto; margin: 0; font-size: 16px; }
.instant-query-panel__context { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; color: var(--idmp-text-helper); font-size: 12px; }
.instant-query-panel__context strong { color: var(--idmp-text-secondary); font-weight: 500; }
.instant-query-panel__controls { display: flex; align-items: flex-end; gap: 12px 16px; min-width: 0; }
.runtime-query-result__summary span { margin: 0; color: var(--idmp-text-helper); font-size: 12px; }
.instant-query-panel__period { display: flex; flex: 0 0 auto; flex-direction: column; align-items: stretch; gap: 6px; min-width: 0; }
.instant-query-panel__period label { flex: 0 0 auto; min-height: 19px; color: var(--idmp-text-primary); font-size: 13px; font-weight: 600; }
.instant-query-panel__controls :deep(.runtime-parameter-fields) { display: flex; flex: 1 1 auto; align-items: flex-end; flex-wrap: wrap; gap: 12px; min-width: 0; }
.instant-query-panel__controls :deep(.runtime-parameter-field) { flex: 1 1 170px; max-width: 280px; gap: 6px; }
.instant-query-panel__controls :deep(.runtime-parameter-field label) { min-height: 19px; font-size: 13px; }
.instant-query-panel__actions {
  display: flex;
  align-items: center;
  margin-left: auto;
}
.runtime-query-result { display: grid; gap: 12px; }
.runtime-query-result__summary { justify-content: flex-start; flex-wrap: wrap; }
.runtime-query-result__summary span { overflow-wrap: anywhere; }

.report-period-picker {
  width: 310px;
}

.date-range-fields {
  display: flex;
  align-items: center;
  gap: 6px;
}

.date-range-fields > span {
  flex: 0 0 auto;
  color: var(--idmp-text-secondary, #667085);
  font-size: 12px;
}

.date-range-fields :deep(.el-date-editor) {
  width: 310px;
}

.analysis-state-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid #fecdca;
  border-radius: 10px;
  background: #fffbfa;
}

.analysis-state-notice.is-no_data,
.analysis-state-notice.is-waiting_for_calculation,
.analysis-state-notice.is-not_calculable {
  border-color: #fedf89;
  background: #fffaeb;
}

.analysis-state-notice p,
.diagnostics-intro,
.diagnostics-section p {
  margin: 5px 0 0;
  color: var(--idmp-text-secondary, #667085);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.diagnostics-section {
  margin-top: 24px;
}

.diagnostics-section h3 {
  margin: 0;
  font-size: 15px;
}

.formula-operands {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.formula-operand {
  padding: 12px;
  border: 1px solid var(--idmp-border, #d0d5dd);
  border-radius: 8px;
  background: var(--idmp-surface-subtle, #f8fafc);
}

.formula-operand > span,
.formula-operand__result > span {
  display: block;
  color: var(--idmp-text-secondary, #667085);
  font-size: 12px;
}

.formula-operand > strong {
  display: block;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.formula-operand__result {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.formula-operand__result > strong {
  color: var(--idmp-primary, #1570ef);
}

.analysis-empty-state {
  min-height: 220px;
  display: grid;
  place-items: center;
  padding: 32px;
  color: var(--idmp-text-secondary, #667085);
  background: var(--idmp-surface-subtle, #f8fafc);
  border: 1px dashed var(--idmp-border, #d0d5dd);
  border-radius: 12px;
  text-align: center;
}

.page-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.header-indicator-select {
  width: 300px;
}

.indicator-option {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    color: var(--idmp-text-helper);
    font-size: 12px;
  }
}

.analysis-panel {
  min-width: 0;
  padding: 0 18px 16px;
  overflow: hidden;
}

.analysis-tabs {
  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap::after) {
    height: 1px;
    background: var(--idmp-border-subtle);
  }

  :deep(.el-tabs__item) {
    height: 47px;
    padding: 0 22px;
    color: var(--idmp-text-secondary);
  }

  :deep(.el-tabs__item.is-active) {
    color: var(--idmp-interactive);
    font-weight: 600;
  }

  :deep(.el-tabs__content) {
    padding-top: 15px;
  }
}

@media (max-width: 1450px) {
  .header-indicator-select { width: 260px; }
}
@media (max-width: 1180px) {
  .instant-query-panel__controls { flex-wrap: wrap; }
  .instant-query-panel__controls :deep(.runtime-parameter-fields) { flex: 1 1 240px; }
}
@media (max-width: 720px) {
  :deep(.page-heading) {
    flex-direction: column;
    gap: 12px;
  }

  :deep(.page-heading__main),
  :deep(.page-heading__actions) {
    width: 100%;
  }

  :deep(.page-heading h1) {
    font-size: 20px;
    overflow-wrap: anywhere;
    letter-spacing: 0;
  }

  .page-toolbar {
    width: 100%;
  }

  .header-indicator-select {
    width: 100%;
    min-width: 0;
  }

  .instant-query-panel {
    padding: var(--idmp-space-4);
  }

  .instant-query-panel__header { align-items: flex-start; flex-direction: column; }
  .instant-query-panel__context { justify-content: flex-start; }
  .instant-query-panel__controls { align-items: stretch; }
  .instant-query-panel__period, .instant-query-panel__controls :deep(.runtime-parameter-fields) { flex: 1 1 100%; }
  .report-period-picker { flex: 0 0 auto; width: 100%; min-width: 0; }
  .instant-query-panel__actions { width: 100%; margin-left: 0; }
  .instant-query-panel__actions .el-button { width: 100%; }
  .date-range-fields { width: 100%; flex-wrap: wrap; }
  .date-range-fields :deep(.el-date-editor) { width: 100%; flex: 1 1 100%; }
}
</style>
