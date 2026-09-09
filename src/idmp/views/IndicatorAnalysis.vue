<template>
  <div class="idmp-page indicator-analysis">
    <PageHeader
      :title="`指标分析 / ${currentProfile.name}`"
      :status-label="analysisSourceLabel"
      status-tone="info"
    >
      <template #meta>
        <span>报告期 <strong>{{ reportPeriodLabel }}</strong></span>
        <span>统计粒度 <strong>{{ period }}</strong></span>
        <span>更新时间 <strong>{{ analysisUpdatedAt }}</strong></span>
      </template>
      <template #actions>
        <div class="page-toolbar">
          <el-select
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
                <small>{{ item.backendCode || item.code }} · {{ item.source }}</small>
              </div>
            </el-option>
          </el-select>
          <el-button type="primary" @click="switchIndicatorAnalysis">查看分析</el-button>
          <el-button :icon="Connection" @click="scrollToSceneComparison">场景对比</el-button>
          <el-button :icon="Download" @click="showUnavailable('PDF 导出')">导出PDF</el-button>
        </div>
      </template>
    </PageHeader>

    <el-alert
      v-if="analysisErrorMessage"
      class="analysis-error-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="analysisErrorMessage"
    />
    <section v-if="selectedBackendIndicator" class="surface-card report-context" aria-label="当前报告期">
      <div class="report-context__title">
        <span>源数据可用范围：<strong>{{ availablePeriodText || '暂未获取' }}</strong></span>
        <small>选择时间范围后，更新本期指标值、排名和下钻结果</small>
      </div>
      <div class="report-context__controls">
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
          />
        </div>
        <el-button type="primary" :loading="mortalityChainLoading" @click="applyReportPeriod">查询</el-button>
        <el-button @click="showDataDiagnostics = true">数据说明</el-button>
      </div>
    </section>
    <section v-if="analysisNotice" class="analysis-state-notice" :class="`is-${analysisAvailability.status.toLowerCase()}`">
      <div><strong>{{ analysisNotice.title }}</strong><p>{{ analysisNotice.message }}</p></div>
      <el-button size="small" @click="showDataDiagnostics = true">查看数据诊断</el-button>
    </section>

    <section class="metric-overview" :class="{ 'is-single': !summaryMetrics.length }" aria-label="指标核心数据">
      <article class="surface-card primary-metric">
        <div>
          <span>{{ primaryMetric.label }}</span>
          <StatusBadge :status="primaryMetric.status" :label="primaryMetric.statusLabel" />
        </div>
        <strong>{{ primaryMetric.value }}</strong>
        <p>{{ primaryMetric.periodLabel }}<template v-if="currentProfile.targetLabel"> · {{ currentProfile.targetLabel }}</template></p>
      </article>
      <div v-if="summaryMetrics.length" class="metric-summary-grid" :class="summaryMetricGridClass">
        <article v-for="item in summaryMetrics" :key="item.label" class="surface-card metric-summary-card">
          <div class="metric-summary-card__header">
            <span>{{ item.label }}</span>
          </div>
          <strong :class="metricToneClass(item.tone)">{{ item.value }}</strong>
          <p>{{ item.description || ' ' }}</p>
        </article>
      </div>
    </section>

    <section ref="sceneComparisonRef" class="surface-card scene-comparison" aria-label="不同场景计算值对比">
      <div class="scene-comparison__head">
        <div class="scene-comparison__label"><span>不同场景对比</span><small>并列展示各场景的原始统计周期，不跨场景重算或强制聚合。</small></div>
        <div class="scene-comparison__controls">
          <el-select v-model="scenarioComparisonSelectedIds" multiple collapse-tags collapse-tags-tooltip clearable filterable placeholder="全部关联场景" :disabled="!scenarioComparisonTarget || !scenarioComparisonOptions.length">
            <el-option v-for="scene in scenarioComparisonOptions" :key="scene.value" :label="scene.label" :value="scene.value" />
          </el-select>
          <div class="date-range-fields" aria-label="场景对比时间范围"><el-date-picker v-model="scenarioComparisonPeriodRange" type="daterange" unlink-panels value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" /></div>
          <el-button size="small" type="primary" :loading="scenarioComparisonLoading" :disabled="!scenarioComparisonTarget" @click="applyScenarioComparisonFilters">应用筛选</el-button>
          <el-button size="small" :loading="scenarioComparisonLoading" :disabled="!scenarioComparisonTarget" @click="loadScenarioComparison">刷新对比</el-button>
        </div>
      </div>
      <StatePanel v-if="!scenarioComparisonTarget" type="unavailable" title="请选择已发布指标版本后查看场景对比" description="场景对比仅适用于已发布指标版本关联的已发布场景。" />
      <StatePanel v-else-if="scenarioComparisonLoading" type="loading" title="正在读取场景正式结果" />
      <StatePanel v-else-if="scenarioComparisonError" type="error" title="场景对比加载失败" :description="scenarioComparisonError" />
      <StatePanel v-else-if="scenarioComparisonLoaded && !scenarioComparisonScenarios.length" type="empty" title="暂无已发布场景结果" description="请确认场景已发布、已关联当前指标版本，并已完成场景化正式计算。" />
      <div v-if="scenarioComparisonScenarios.length" class="scenario-result-grid">
        <article v-for="scene in scenarioComparisonScenarios" :key="sceneKey(scene)" class="scenario-result-card" :class="{ 'is-clickable': canViewScenarioPeriods(scene), 'has-notice': scenePointNotice(latestScenePoint(scene)) }" :role="canViewScenarioPeriods(scene) ? 'button' : undefined" :tabindex="canViewScenarioPeriods(scene) ? 0 : undefined" @click="openScenarioPeriodsFromCard(scene)" @keydown.enter.prevent="openScenarioPeriodsFromCard(scene)">
          <div class="scenario-result-card__head"><strong :title="sceneTitle(scene)">{{ scene.scenarioName || scene.name || scene.scenarioCode || '未命名场景' }}</strong><StatusBadge :status="scene.resultAvailability" /></div>
          <div v-if="String(scene.resultAvailability).toUpperCase() === 'NO_ACTIVE_RESULT'" class="scenario-result-card__empty"><span>尚未生成已激活的正式结果。</span><el-button type="primary" plain @click.stop="openScenarioCalculation(scene)">创建场景计算</el-button></div>
          <template v-else>
            <div class="scenario-result-card__latest"><strong>{{ scenePointValue(latestScenePoint(scene)) }}</strong></div>
            <p v-if="scenePointNotice(latestScenePoint(scene))" class="scenario-result-card__notice">{{ scenePointNotice(latestScenePoint(scene)) }}</p>
            <div class="scenario-result-card__actions"><span>{{ scenarioPeriodTypeLabel(scene.configuredPeriodType) }} · {{ scenePointCount(scene) }} 个结果</span><span class="scenario-result-card__open">详情 ›</span></div>
          </template>
        </article>
      </div>
    </section>

    <el-drawer v-model="scenarioPeriodDrawerOpen" :title="selectedScenarioName" size="560px" append-to-body destroy-on-close>
      <template v-if="selectedScenarioForPeriods">
        <div class="scenario-period-drawer__summary"><div><span>统计周期</span><strong>{{ scenarioPeriodTypeLabel(selectedScenarioForPeriods.configuredPeriodType) }}</strong></div><div><span>结果点</span><strong>{{ selectedScenarioPointTotal }}</strong></div><StatusBadge :status="selectedScenarioForPeriods.resultAvailability" /></div>
        <p class="scenario-period-drawer__hint">周期明细仅用于查看该场景的原始正式结果，不与其他场景强制对齐。</p>
        <el-table :data="selectedScenarioPointRows" size="small" max-height="calc(100vh - 300px)" empty-text="暂无正式结果点"><el-table-column label="周期" min-width="200"><template #default="{ row }">{{ formatPeriodLabel(row.periodStart, row.periodEnd) }}</template></el-table-column><el-table-column label="结果" width="104"><template #default="{ row }">{{ scenePointValue(row) }}</template></el-table-column><el-table-column label="状态" width="108"><template #default="{ row }"><StatusBadge :status="row.outcomeStatus || row.qualityStatus" /></template></el-table-column><el-table-column label="操作" width="70"><template #default="{ row }"><el-button v-if="row.resultId" link type="primary" @click="openScenarioPointDrill(row)">下钻</el-button></template></el-table-column></el-table>
        <div v-if="selectedScenarioPointTotal > scenarioPeriodPageSize" class="scenario-period-drawer__pagination"><span>共 {{ selectedScenarioPointTotal }} 条</span><el-pagination v-model:current-page="scenarioPeriodPage" small background layout="prev, pager, next" :page-size="scenarioPeriodPageSize" :total="selectedScenarioPointTotal" /></div>
      </template>
    </el-drawer>

    <section v-if="showMortalityChainPanel" class="surface-card chain-panel" aria-label="住院死亡率计算链路">
      <div class="chain-panel__header">
        <div>
          <h2>住院死亡率计算链路</h2>
          <p>展示第16章后端链路中的数据域、因子试算、公式结果、异步任务与编译状态</p>
        </div>
        <StatusBadge
          :status="mortalityChainLoading ? 'RUNNING' : mortalityChainBatchStatus"
          :label="mortalityChainLoading ? '同步中' : mortalityChainStatusText"
        />
      </div>

      <div class="chain-equation">
        <span>死亡患者记录数</span>
        <strong>{{ chainDeathValue }}</strong>
        <em>÷</em>
        <span>出院病案记录数</span>
        <strong>{{ chainDischargeValue }}</strong>
        <em>=</em>
        <span>住院死亡率</span>
        <strong>{{ chainDisplayValue }}</strong>
      </div>

      <div class="chain-grid">
        <article v-for="node in mortalityChainNodes" :key="node.label" class="chain-node">
          <span>{{ node.label }}</span>
          <strong>{{ node.value }}</strong>
          <small>{{ node.meta }}</small>
        </article>
      </div>
    </section>

    <section class="surface-card analysis-panel">
      <el-tabs v-model="activeTab" class="analysis-tabs">
        <el-tab-pane label="趋势分析" name="trend">
          <div class="trend-toolbar">
            <div>
              <h2>指标变化趋势</h2>
              <p>{{ hasPeerTrend ? '展示本院实际值与同级医院均值的周期变化' : '展示本院实际值的周期变化；同级医院基准数据暂未接入' }}</p>
            </div>
            <div class="trend-controls">
              <div class="date-range-fields trend-period-picker" aria-label="趋势时间范围"><el-date-picker v-model="trendPeriodDraft" type="daterange" unlink-panels format="YYYY-MM-DD" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="small" /></div>
              <el-button size="small" type="primary" @click="applyTrendConditions">应用</el-button>
              <el-button size="small" :disabled="!trendPeriodDraft.some(Boolean) && !analysisPeriodRange.some(Boolean)" @click="clearTrendPeriod">全部时间</el-button>
              <el-radio-group v-model="period" size="small" aria-label="趋势统计粒度" @change="applyTrendGranularity">
                <el-radio-button v-for="item in analysisPeriodOptions" :key="item" :value="item">{{ item }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <IdmpChart
            :option="trendOption"
            :empty="!trendTableRows.length"
            height="338px"
            :updated-at="analysisUpdatedAt"
            :aria-label="hasPeerTrend ? `${currentProfile.name}趋势图；本院实际值与同级医院均值对比` : `${currentProfile.name}趋势图；本院实际值`"
            table-label="查看趋势数据表"
          >
            <template #table>
              <div class="chart-table-scroll">
                <table class="chart-data-table">
                  <thead>
                    <tr>
                      <th scope="col">周期</th>
                      <th scope="col">本院实际值</th>
                      <th v-if="hasPeerTrend" scope="col">同级医院均值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in trendTableRows" :key="row.label">
                      <th scope="row">{{ row.label }}</th>
                      <td>{{ row.actual }}{{ currentProfile.unit }}</td>
                      <td v-if="hasPeerTrend">{{ row.peer }}{{ currentProfile.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </IdmpChart>
        </el-tab-pane>

        <el-tab-pane label="科室排名" name="rank">
          <div class="table-heading">
            <div>
              <h2>科室指标排名</h2>
              <p v-if="hasBackendRankData">后端维度对比数据，按 {{ currentProfile.name }} 由高到低排列。</p>
              <p v-else>当前指标暂无正式科室维度结果。</p>
            </div>
            <StatusBadge :status="hasBackendRankData ? 'ACTIVE' : 'NO_DATA'" :label="hasBackendRankData ? '后端维度数据' : '暂无正式数据'" tone="neutral" />
          </div>
          <div class="table-scroll rank-table-scroll">
            <el-table
              :data="rankTableData"
              empty-text="暂无正式科室维度结果"
              table-layout="fixed"
              class="analysis-table rank-table"
            >
              <el-table-column label="排名" width="90" align="center">
                <template #default="{ row }">
                  <span class="rank-number" :class="{ 'is-top': row.rank <= 3 }">
                    {{ row.rank }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="department" label="科室" min-width="190" />
              <el-table-column label="指标值" width="135">
                <template #default="{ row }">
                  <strong :class="{ 'text-danger': row.status === '超标' }">
                    {{ row.rate }}
                  </strong>
                </template>
              </el-table-column>
              <el-table-column prop="numerator" label="分子" width="130" />
              <el-table-column prop="denominator" label="分母" width="130" />
              <el-table-column label="较上期" width="120">
                <template #default="{ row }">
                  <span :class="changeClass(row.change)">{{ row.change }}</span>
                </template>
              </el-table-column>
              <el-table-column label="达标状态" width="120">
                <template #default="{ row }">
                  <StatusBadge :label="row.status" :tone="rankStatusTone(row.status)" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="112" fixed="right">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="action-link"
                    @click="openDepartmentDrill(row)"
                  >
                    查看明细
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <el-tab-pane label="下钻分析" name="drill">
          <DrillExplorer
            v-if="drillResultId"
            :result-id="drillResultId"
            :path-result-ids="drillPathResultIds"
            :indicator-name="currentProfile.name"
            :period="drillPeriod"
            :start-level="drillStartLevel"
            :start-parent-keys="drillParentKeys"
            :max-levels="drillMaxLevels"
            embedded
          />
          <div v-else class="analysis-empty-state">
            {{ analysisErrorMessage || '当前指标尚无可下钻的已激活结果；待结果批次生成后将自动显示组织、疾病和因子下钻路径。' }}
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
    <el-drawer v-model="showDataDiagnostics" title="数据诊断" size="520px" destroy-on-close>
      <p class="diagnostics-intro">这里用于解释当前报告期没有结果的原因，以及依赖数据可用情况；正常分析时无需关注。</p>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, Download } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import ResultAvailabilityPanel from '@/idmp/components/ResultAvailabilityPanel.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchIndicatorAnalysis, fetchIndicatorAvailablePeriod, fetchIndicatorScenarioComparison, fetchIndicatorScenarios, fetchIndicators, fetchIndicatorVersion, fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { deriveDrillPathResultIds, reconcileScenarioPointWithRoot } from '@/idmp/api/adapters/drill'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { resolveResultAvailability } from '@/idmp/features/analysis/resultAvailability'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import { getStatusLabel } from '@/idmp/design/status'
import { periodOptions } from '@/idmp/features/analysis/indicatorProfiles'

const route = useRoute()
const router = useRouter()
const activeTab = ref('trend')
const period = ref('月度')
const reportGranularity = ref('MONTHLY')
const backendAnalysis = ref(null)
const trendBackendAnalysis = ref(null)
const backendIndicatorVersion = ref(null)
const availablePeriod = ref(null)
let analysisRefreshSequence = 0
const analysisErrorMessage = ref('')
const mortalityChain = ref(null)
const mortalityChainLoading = ref(false)
const selectedIndicatorCode = ref(String(route.query.indicator || ''))
const backendIndicators = ref([])
const indicatorOptionsLoading = ref(false)
const sceneComparisonRef = ref()
const scenarioComparison = ref(null)
const scenarioComparisonLoading = ref(false)
const scenarioComparisonError = ref('')
const scenarioComparisonLoaded = ref(false)
let scenarioComparisonSequence = 0
const scenarioComparisonSelectedIds = ref(initialScenarioVersionIds())
const scenarioComparisonPeriodRange = ref([])
const scenarioComparisonOptions = ref([])
const scenarioComparisonIdByCode = ref(new Map())
const scenarioPeriodDrawerOpen = ref(false)
const selectedScenarioForPeriods = ref(null)
const scenarioPeriodPage = ref(1)
const scenarioPeriodPageSize = 10
const selectedDrillDepartment = ref('')
const drillStartLevel = ref('HOSPITAL')
const drillParentKeys = ref({})
const analysisPeriodRange = ref(initialAnalysisPeriodRange())
const reportPeriodRange = ref(initialReportPeriodRange())
const trendPeriodDraft = ref([...analysisPeriodRange.value])
const showDataDiagnostics = ref(false)

const indicatorCode = computed(() => String(route.query.indicator || ''))
const analysisPeriodOptions = computed(() => periodOptions)
const analysisIndicatorOptions = computed(() =>
  createBackendAnalysisOptions(backendIndicators.value)
)
const selectedBackendIndicator = computed(() => backendIndicators.value.find((item) => {
  const key = getBackendIndicatorKey(item)
  return [key, item.id, item.indicatorId, item.code].some((value) => String(value || '') === indicatorCode.value)
}))
const currentProfile = computed(() => {
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator) return createGenericAnalysisProfile({
    code: indicatorCode.value,
    name: route.query.indicatorName || indicatorCode.value || '未选择指标',
    unit: ''
  })

  return createGenericAnalysisProfile({
    ...backendIndicator,
    unit: backendIndicator.unit || backendIndicator.displayUnit || ''
  })
})
const backendAnalysisGranularity = computed(() => reportGranularity.value)
const trendAnalysisGranularity = computed(() => {
  if (period.value === '日度') return 'DAILY'
  if (period.value === '月度') return 'MONTHLY'
  if (period.value === '年度') return 'YEARLY'
  if (period.value === '季度') return 'QUARTERLY'
  return 'MONTHLY'
})
const analysisOverview = computed(() => {
  const comparisons = Array.isArray(backendAnalysis.value?.dimensionComparison)
    ? backendAnalysis.value.dimensionComparison
    : []
  return comparisons.find((item) => {
    const dimensions = item?.dimensions || {}
    return Boolean(dimensions.hospital_code || dimensions.hospital_id) &&
      !dimensions.out_dept_code && !dimensions.out_dept_id &&
      !dimensions.department_code && !dimensions.department_id
  }) || backendAnalysis.value?.overview || null
})
const hasBackendAnalysisData = computed(() => Boolean(backendAnalysis.value?.dataAvailable && analysisOverview.value))
const hasLiveAnalysisResponse = computed(() => Boolean(backendAnalysis.value && selectedBackendIndicator.value))
const analysisAvailability = computed(() => backendAnalysis.value ? resolveResultAvailability(backendAnalysis.value) : null)
const reportPeriodLabel = computed(() => formatAnalysisPeriod(analysisOverview.value) || formatRange(reportPeriodRange.value) || '由最新正式结果确定')
const analysisNotice = computed(() => {
  const availability = analysisAvailability.value
  if (!availability || availability.status === 'ACTIVE_RESULT') return null
  const title = {
    CALCULATION_IN_PROGRESS: '该报告期正在生成指标结果',
    WAITING_FOR_CALCULATION: '该报告期有数据，尚未生成指标结果',
    NO_DATA: '该报告期暂无符合口径的数据',
    INCOMPLETE_DATA: '该报告期缺少部分依赖数据，暂时无法计算',
    NOT_CALCULABLE: '该报告期的数据不满足计算条件',
    CALCULATION_ERROR: '该报告期的指标计算未完成',
    UNKNOWN: '暂时无法确认该报告期是否可计算'
  }[availability.status] || '该报告期暂无可展示结果'
  return { title, message: availability.message }
})
const backendDepartmentComparisons = computed(() =>
  (Array.isArray(backendAnalysis.value?.dimensionComparison) ? backendAnalysis.value.dimensionComparison : [])
    .filter((item) => item?.dimensions?.out_dept_code || item?.dimensions?.out_dept_id)
)
const backendDimensionResults = computed(() =>
  (Array.isArray(backendAnalysis.value?.dimensionComparison) ? backendAnalysis.value.dimensionComparison : [])
    .filter((item) => Object.keys(item?.dimensions || {}).length > 0)
)
const hasBackendRankData = computed(() => backendDepartmentComparisons.value.length > 0)
const backendTrend = computed(() => createTrendFromBackendAnalysis(trendBackendAnalysis.value || backendAnalysis.value, currentProfile.value.unit))
const currentTrend = computed(() => backendTrend.value || emptyTrend())
// 同级医院均值必须来自正式分析接口；后端接入 peerTrend 后再由适配层填充 backendTrend.peer。
const hasPeerTrend = computed(() => Boolean(backendTrend.value?.peer?.some(isChartNumber)))
const primaryMetric = computed(() => {
  const overview = analysisOverview.value
  if (hasBackendAnalysisData.value) {
    return {
      label: `${formatAnalysisPeriod(overview) || '当前报告期'}指标值`,
      value: resolveCurrentMetricValue(),
      tone: overview.qualityStatus === 'PASSED' ? 'success' : 'warning',
      status: overview.outcomeStatus || 'ACTIVE',
      statusLabel: '已发布结果',
      periodLabel: formatAnalysisPeriod(overview) || '结果周期未返回'
    }
  }
  if (hasLiveAnalysisResponse.value) return { label: `${formatRange(reportPeriodRange.value) || '当前报告期'}指标值`, value: '-', tone: 'neutral', status: analysisAvailability.value?.status || 'UNKNOWN', statusLabel: '暂无正式结果', periodLabel: formatRange(reportPeriodRange.value) || '请先选择报告期' }
  return { label: '当前指标值', value: '-', tone: 'neutral', status: 'NO_DATA', statusLabel: '暂无正式结果', periodLabel: '尚未读取到已激活结果' }
})
const summaryMetrics = computed(() => {
  if (selectedBackendIndicator.value) {
    const metrics = []
    if (!backendAnalysis.value) {
      return [
        { label: '分析状态', value: mortalityChainLoading.value ? '正在读取' : '暂无正式结果', description: analysisErrorMessage.value || '后端尚未返回可展示的指标结果' },
        { label: '分子 / 分母', value: '-', description: '后端结果未返回' },
        { label: '维度分析', value: '-', description: '后端维度结果未返回' }
      ]
    }
    if (analysisOverview.value?.numerator !== undefined && analysisOverview.value?.numerator !== null) metrics.push({ label: '分子', value: formatCount(analysisOverview.value.numerator), description: '计入事件数' })
    if (analysisOverview.value?.denominator !== undefined && analysisOverview.value?.denominator !== null) metrics.push({ label: '分母', value: formatCount(analysisOverview.value.denominator), description: '统计对象总量' })
    const dimensions = backendDimensionResults.value
    const configured = Object.keys(drillMaxLevels.value).length > 0
    metrics.push(dimensions.length
      ? { label: '维度结果', value: `${dimensions.length} 个`, description: '本报告期已生成的维度成员数' }
      : { label: '维度分析', value: configured ? '本期暂无结果' : '未配置', description: configured ? '该报告期未生成维度结果' : '该指标未配置维度分析' })
    if (hasBackendAnalysisData.value) {
      metrics.push(
        { label: '质量状态', value: displayStatus(analysisOverview.value?.qualityStatus), tone: analysisOverview.value?.qualityStatus === 'PASSED' ? 'success' : 'warning' },
        { label: '结果口径', value: analysisOverview.value?.dimensions && Object.keys(analysisOverview.value.dimensions).length ? '指定维度' : '全院汇总' }
      )
    } else {
      metrics.push(
        { label: '分析状态', value: displayStatus(analysisAvailability.value?.status) },
        { label: '结果说明', value: analysisAvailability.value?.message || '请打开数据说明查看原因' }
      )
    }
    return metrics
  }
  return []
})
const summaryMetricGridClass = computed(() => `is-${Math.min(Math.max(summaryMetrics.value.length, 1), 6)}`)
const trendTableRows = computed(() =>
  currentTrend.value.labels.map((label, index) => ({
    label,
    actual: currentTrend.value.actual[index] ?? '-',
    peer: currentTrend.value.peer[index] ?? '-'
  }))
)
const rankTableData = computed(() => {
  const comparisons = backendDepartmentComparisons.value
  if (Array.isArray(comparisons) && comparisons.length > 0) {
    return comparisons.map((item, index) => ({
      rank: index + 1,
      departmentKey: item.dimensions?.out_dept_code || item.dimensions?.out_dept_id || `DEPT_${index + 1}`,
      department: item.dimensions?.out_dept_name || item.dimensions?.out_dept_code || `科室${index + 1}`,
      rate: item.displayValue || (item.value != null ? String(item.value) : '-'),
      numerator: '-',
      denominator: '-',
      change: '-',
      status: item.qualityStatus === 'PASSED' ? '达标' : '预警'
    }))
  }
  return []
})

const hasBackendMortalityData = computed(() => Boolean(
  mortalityChain.value?.indicatorResult ||
  mortalityChain.value?.deathFactor ||
  mortalityChain.value?.dischargeFactor ||
  mortalityChain.value?.calcBatch
))
const showMortalityChainPanel = computed(() => isMortalityIndicator(selectedBackendIndicator.value) && hasBackendMortalityData.value)
const analysisSourceLabel = computed(() => hasBackendAnalysisData.value ? '已发布结果' : hasBackendMortalityData.value ? '计算链路摘要' : '暂无正式结果')
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
  const chain = mortalityChain.value
  const config = chain?.config || {}
  const context = backendAnalysis.value?.resultContext || {}
  return {
    version: hasBackendAnalysisData.value
      ? String(backendAnalysis.value.indicatorVersionId || currentIndicatorVersionId.value || '后端未返回')
      : selectedBackendIndicator.value
        ? String(currentIndicatorVersionId.value || '未激活结果')
      : hasBackendMortalityData.value ? String(config.indicatorVersionId || '后端未返回') : '-',
    batch: hasBackendAnalysisData.value
      ? String(context.batchId || '后端未返回')
      : hasBackendMortalityData.value ? String(config.indicatorBatchId || '后端未返回') : '-',
    watermark: resolveChainWatermark(chain),
  }
})
const analysisUpdatedAt = computed(() => {
  const chain = mortalityChain.value
  const context = backendAnalysis.value?.resultContext || {}
  if (hasBackendAnalysisData.value) {
    return firstPresent(context.activatedAt, analysisOverview.value?.periodEnd, '后端未返回更新时间')
  }
  return firstPresent(
    chain?.indicatorResult?.updatedAt,
    chain?.indicatorResult?.finishedAt,
    chain?.calcBatch?.finishedAt,
    chain?.asyncTask?.finishedAt,
    hasBackendMortalityData.value ? '后端未返回更新时间' : '-'
  )
})
const mortalityChainBatchStatus = computed(() =>
  mortalityChain.value?.indicatorResult?.batchStatus ||
  mortalityChain.value?.calcBatch?.batchStatus ||
  (hasBackendMortalityData.value ? 'READY' : 'DRAFT')
)
const drillPathResultIds = computed(() => deriveDrillPathResultIds(backendAnalysis.value || {}))
const drillResultId = computed(() => String(
  drillPathResultIds.value.ORGANIZATION || drillPathResultIds.value.DISEASE ||
  backendAnalysis.value?.overview?.resultId || backendAnalysis.value?.resultContext?.resultId || ''
))
const drillPeriod = computed(() => String(
  route.query.period || formatAnalysisPeriod(analysisOverview.value) || backendAnalysis.value?.resultContext?.period ||
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
const scenarioComparisonTarget = computed(() => {
  const indicator = selectedBackendIndicator.value
  const indicatorId = indicator?.id || indicator?.indicatorId
  const indicatorVersionId = currentIndicatorVersionId.value
  return indicatorId && indicatorVersionId
    ? { indicatorId: String(indicatorId), indicatorVersionId: String(indicatorVersionId) }
    : null
})
const scenarioComparisonScenarios = computed(() => Array.isArray(scenarioComparison.value?.scenarios)
  ? scenarioComparison.value.scenarios
  : [])
const selectedScenarioName = computed(() => selectedScenarioForPeriods.value?.scenarioName || selectedScenarioForPeriods.value?.name || selectedScenarioForPeriods.value?.scenarioCode || '场景周期详情')
const selectedScenarioPoints = computed(() => [...(selectedScenarioForPeriods.value?.points || [])]
  .sort((left, right) => String(right?.periodEnd || right?.periodStart || '').localeCompare(String(left?.periodEnd || left?.periodStart || ''))))
const selectedScenarioPointTotal = computed(() => selectedScenarioPoints.value.length)
const selectedScenarioPointRows = computed(() => {
  const start = (scenarioPeriodPage.value - 1) * scenarioPeriodPageSize
  return selectedScenarioPoints.value.slice(start, start + scenarioPeriodPageSize)
})

const trendSeries = computed(() => {
  const actualValues = currentTrend.value.actual
  const actualSeries = {
    name: '本院实际值',
    type: 'line',
    smooth: actualValues.length > 1,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: actualValues.length <= 1 ? 10 : 7,
    lineStyle: { width: 3 },
    itemStyle: { borderWidth: 2 },
    label: actualValues.length <= 1
      ? { show: true, position: 'top', formatter: ({ value }) => `${value}${currentProfile.value.unit || ''}` }
      : { show: false },
    data: actualValues
  }
  if (Number.isFinite(Number(currentProfile.value.markLineValue))) {
    actualSeries.markLine = {
      silent: true,
      symbol: 'none',
      label: { formatter: currentProfile.value.targetLabel, color: '#b4232c', position: 'insideEndTop' },
      lineStyle: { color: '#b4232c', type: 'dashed', width: 1 },
      data: [{ yAxis: Number(currentProfile.value.markLineValue) }]
    }
  }
  if (!hasPeerTrend.value) return [actualSeries]
  return [actualSeries, {
    name: '同级医院均值',
    type: 'line',
    smooth: true,
    showSymbol: true,
    symbol: 'circle',
    symbolSize: 5,
    lineStyle: { width: 2, type: 'dashed' },
    data: currentTrend.value.peer
  }]
})

const trendOption = computed(() => ({
  animationDuration: 450,
  color: [IDMP_CHART_COLORS[0], IDMP_CHART_COLORS[4]],
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) => `${value}${currentProfile.value.unit || ''}`
  },
  legend: {
    top: 2,
    right: 8,
    itemWidth: 18,
    itemHeight: 8,
    textStyle: { fontSize: 12 },
    data: trendSeries.value.map((item) => item.name)
  },
  grid: { top: 44, left: 50, right: 26, bottom: 40 },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: currentTrend.value.labels,
    axisTick: { show: false },
    axisLabel: { margin: 12 }
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: currentProfile.value.yAxisMax,
    name: currentProfile.value.unit ? `单位：${currentProfile.value.unit}` : '指标值',
    nameTextStyle: { padding: [0, 0, 4, 0] },
    axisLabel: { formatter: `{value}${currentProfile.value.unit || ''}` },
    splitLine: { lineStyle: { type: 'dashed' } }
  },
  series: trendSeries.value
}))

const mortalityDeathRecord = computed(() => mortalityChain.value?.deathFactor?.results?.records?.[0])
const mortalityDischargeRecord = computed(() => mortalityChain.value?.dischargeFactor?.results?.records?.[0])
const mortalityIndicatorRecord = computed(() => mortalityChain.value?.indicatorResult?.results?.records?.[0])
const chainDeathValue = computed(() => formatCount(mortalityDeathRecord.value?.valueDecimal))
const chainDischargeValue = computed(() => formatCount(mortalityDischargeRecord.value?.valueDecimal))
const chainDisplayValue = computed(() => mortalityIndicatorRecord.value?.displayValue || '-')
const chainRawValue = computed(() => formatDecimal(mortalityIndicatorRecord.value?.resultValue))
const mortalityChainStatusText = computed(() => {
  if (!hasBackendMortalityData.value) return '暂无正式计算链路'
  const batchStatus = mortalityChain.value.indicatorResult?.batchStatus || mortalityChain.value.calcBatch?.batchStatus || '-'
  const qualityStatus = mortalityChain.value.indicatorResult?.qualityStatus || mortalityChain.value.calcBatch?.qualityStatus || '-'
  return `${displayStatus(batchStatus)} / ${displayStatus(qualityStatus)}`
})
const mortalityChainNodes = computed(() => {
  const chain = mortalityChain.value
  const config = chain?.config || {}
  return [
    {
      label: '死亡数据域',
      value: config.deathDomainCode || '-',
      meta: config.deathSourceTable || '-'
    },
    {
      label: '出院数据域',
      value: config.dischargeDomainCode || '-',
      meta: config.dischargeSourceTable || '-'
    },
    {
      label: '分子因子',
      value: chainDeathValue.value,
      meta: `版本 ${config.deathFactorVersionId || '-'}`
    },
    {
      label: '分母因子',
      value: chainDischargeValue.value,
      meta: `版本 ${config.dischargeFactorVersionId || '-'}`
    },
    {
      label: '公式结果',
      value: chainDisplayValue.value,
      meta: `原始值 ${chainRawValue.value}`
    },
    {
      label: '异步任务',
      value: displayStatus(chain?.asyncTask?.status),
      meta: `任务 ${config.indicatorBatchId || '-'}`
    },
    {
      label: '计算批次',
      value: displayStatus(chain?.calcBatch?.batchStatus || chain?.indicatorResult?.batchStatus),
      meta: displayStatus(chain?.calcBatch?.qualityStatus || chain?.indicatorResult?.qualityStatus)
    },
    {
      label: '编译产物',
      value: buildArtifactStatus(chain),
      meta: '死亡因子 / 出院因子 / 指标公式'
    }
  ]
})

const rankStatusTone = (status) => {
  if (status === '超标') return 'danger'
  if (status === '预警') return 'warning'
  return 'success'
}

const changeClass = (change) => {
  if (change.startsWith('↑')) return 'text-danger'
  if (change.startsWith('↓')) return 'text-success'
  return 'text-muted'
}

const metricToneClass = (tone) => {
  if (tone === 'danger') return 'text-danger'
  if (tone === 'success') return 'text-success'
  return ''
}

const showUnavailable = (capability) => {
  ElMessage.info(`${capability}尚未接入真实接口。`)
}

const scrollToSceneComparison = () => {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  sceneComparisonRef.value?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'center'
  })
}

function applyScenarioComparisonFilters() {
  if (!validateOptionalDateRange(scenarioComparisonPeriodRange.value, '场景对比时间')) return
  loadScenarioComparison()
}

async function loadScenarioComparison() {
  if (!validateOptionalDateRange(scenarioComparisonPeriodRange.value, '场景对比时间')) return
  const target = scenarioComparisonTarget.value
  const sequence = ++scenarioComparisonSequence
  scenarioComparison.value = null
  scenarioComparisonError.value = ''
  scenarioComparisonLoaded.value = false
  if (!target) return
  scenarioComparisonLoading.value = true
  try {
    const response = await fetchIndicatorScenarioComparison(target.indicatorId, {
      indicatorVersionId: target.indicatorVersionId,
      ...(scenarioComparisonSelectedIds.value.length ? { scenarioVersionIds: scenarioComparisonSelectedIds.value } : {}),
      ...(isCompleteDateRange(scenarioComparisonPeriodRange.value)
        ? { periodStart: scenarioComparisonPeriodRange.value[0], periodEnd: scenarioComparisonPeriodRange.value[1] }
        : {})
    })
    const result = await reconcileScenarioComparisonRoots(response)
    if (sequence !== scenarioComparisonSequence) return
    scenarioComparison.value = result
    mergeScenarioComparisonOptions(result?.scenarios)
    void loadScenarioComparisonOptions(target)
    scenarioComparisonLoaded.value = true
  } catch (error) {
    if (sequence !== scenarioComparisonSequence) return
    scenarioComparisonError.value = error?.message || '无法读取场景正式结果'
  } finally {
    if (sequence === scenarioComparisonSequence) scenarioComparisonLoading.value = false
  }
}

function sceneKey(scene) {
  return String(scene?.scenarioVersionId || scene?.scenarioCode || scene?.scenarioName || scene?.name || '')
}

async function loadScenarioComparisonOptions(target = scenarioComparisonTarget.value) {
  if (!target?.indicatorId) return
  try {
    const records = normalizeList(await fetchIndicatorScenarios(target.indicatorId, { page: 1, size: 200 }))
    const current = new Map(scenarioComparisonOptions.value.map((scene) => [String(scene.value), scene]))
    const byCode = new Map(scenarioComparisonIdByCode.value)
    records.forEach((scene) => {
      const value = scene?.scenarioVersionId || scene?.versionId || scene?.id
      if (!value) return
      const name = scene.scenarioName || scene.name || scene.scenarioCode || String(value)
      current.set(String(value), { value: String(value), label: name })
      if (scene.scenarioCode) byCode.set(String(scene.scenarioCode), String(value))
    })
    scenarioComparisonOptions.value = [...current.values()]
    scenarioComparisonIdByCode.value = byCode
  } catch {
    // 场景选项缺失不妨碍已有结果展示；没有版本 ID 时禁用补算入口，避免误发起非场景计算。
  }
}

async function reconcileScenarioComparisonRoots(comparison = {}) {
  const scenarios = await Promise.all((Array.isArray(comparison.scenarios) ? comparison.scenarios : []).map(async (scenario) => ({
    ...scenario,
    points: await Promise.all((Array.isArray(scenario.points) ? scenario.points : []).map(resolveScenarioPointRoot))
  })))
  return { ...comparison, scenarios }
}

async function resolveScenarioPointRoot(point) {
  if (!point?.resultId) return point
  for (const rootLevel of ['HOSPITAL', 'ALL_SINGLE_DISEASE']) {
    try {
      const drillResult = await searchResultDrill(point.resultId, {
        currentLevel: rootLevel,
        parentKeys: {},
        filters: {},
        pageNum: 1,
        pageSize: 20,
        sort: [{ field: 'indicatorValue', direction: 'DESC' }]
      })
      const resolved = reconcileScenarioPointWithRoot(point, drillResult, rootLevel)
      if (String(resolved.resultId) !== String(point.resultId) || resolved.displayValue !== point.displayValue) return resolved
    } catch {
      // 不同指标支持的路径不同；组织根不可用时继续尝试病种根。
    }
  }
  return point
}

function mergeScenarioComparisonOptions(scenes) {
  const current = new Map(scenarioComparisonOptions.value.map((scene) => [String(scene.value), scene]))
  ;(Array.isArray(scenes) ? scenes : []).forEach((scene) => {
    const value = resolveScenarioVersionId(scene)
    if (!value) return
    const name = scene.scenarioName || scene.name || scene.scenarioCode || String(value)
    current.set(String(value), { value: String(value), label: name })
  })
  scenarioComparisonOptions.value = [...current.values()]
}

function resolveScenarioVersionId(scene) {
  return scene?.scenarioVersionId || scene?.id || scenarioComparisonIdByCode.value.get(String(scene?.scenarioCode || '')) || ''
}

function latestScenePoint(scene) {
  const points = Array.isArray(scene?.points) ? scene.points : []
  return points.reduce((latest, point) => {
    if (!latest) return point
    return String(point?.periodEnd || point?.periodStart || '') > String(latest?.periodEnd || latest?.periodStart || '')
      ? point
      : latest
  }, null)
}

function scenePointValue(point) {
  if (isUsableDisplayValue(point?.displayValue)) return point.displayValue
  if (isUsableRawValue(point?.value)) return formatMetricValue(point.value, currentProfile.value.unit)
  return '—'
}

function scenePointNotice(point) {
  if (!point) return ''
  const outcome = String(point.outcomeStatus || '').toUpperCase()
  const quality = String(point.qualityStatus || '').toUpperCase()
  const flags = Array.isArray(point.qualityFlags) ? point.qualityFlags.filter(Boolean) : []
  if (flags.length) return `质量提示：${flags.join('、')}`
  if (outcome && outcome !== 'CALCULATED') return `结果状态：${displayStatus(outcome)}`
  if (quality && quality !== 'PASSED') return `质量状态：${displayStatus(quality)}`
  return ''
}

function scenePointCount(scene) {
  return Array.isArray(scene?.points) ? scene.points.length : 0
}

function sceneTitle(scene) {
  const name = scene?.scenarioName || scene?.name || scene?.scenarioCode || '未命名场景'
  const code = scene?.scenarioCode || scene?.scenarioVersionId || ''
  return code && code !== name ? `${name} · ${code}` : name
}

function canViewScenarioPeriods(scene) {
  return String(scene?.resultAvailability || '').toUpperCase() !== 'NO_ACTIVE_RESULT' && scenePointCount(scene) > 0
}

function scenarioPeriodTypeLabel(value) {
  return ({ DAILY: '日度', WEEKLY: '周度', MONTHLY: '月度', QUARTERLY: '季度', YEARLY: '年度', CUSTOM: '自定义' })[String(value || '').toUpperCase()] || '原始周期'
}

function openScenarioPeriods(scene) {
  selectedScenarioForPeriods.value = scene
  scenarioPeriodPage.value = 1
  scenarioPeriodDrawerOpen.value = true
}

function openScenarioPeriodsFromCard(scene) {
  if (canViewScenarioPeriods(scene)) openScenarioPeriods(scene)
}

function openScenarioPointDrill(point) {
  router.push({ path: '/analysis/drill', query: { resultId: String(point.resultId), period: formatPeriodLabel(point.periodStart, point.periodEnd), source: 'live' } })
}

function openScenarioCalculation(scene) {
  const scenarioVersionId = resolveScenarioVersionId(scene)
  if (!scenarioVersionId) {
    ElMessage.warning('场景对比响应未返回场景版本 ID，且无法从关联场景中匹配；为避免创建非场景计算，已阻止提交。')
    return
  }
  const point = latestScenePoint(scene)
  const selectedRange = isCompleteDateRange(scenarioComparisonPeriodRange.value) ? scenarioComparisonPeriodRange.value : reportPeriodRange.value
  const periodStart = point?.periodStart || selectedRange?.[0]
  const periodEnd = point?.periodEnd || selectedRange?.[1]
  router.push({
    path: '/calc',
    query: {
      ownerType: 'INDICATOR',
      ownerVersionId: currentIndicatorVersionId.value,
      batchType: 'FULL',
      scenarioVersionId: String(scenarioVersionId),
      returnTo: '/analysis',
      returnIndicator: indicatorCode.value,
      returnIndicatorVersionId: currentIndicatorVersionId.value,
      ...(scenarioComparisonSelectedIds.value.length ? { returnScenarioVersionIds: scenarioComparisonSelectedIds.value.join(',') } : {}),
      ...(periodStart ? { periodStart: toCalculationDateTime(periodStart) } : {}),
      ...(periodEnd ? { periodEnd: toCalculationDateTime(periodEnd) } : {})
    }
  })
}

function toCalculationDateTime(value) {
  const text = String(value || '')
  return text.includes('T') ? text : `${text}T00:00:00`
}

const openDepartmentDrill = (row) => {
  selectedDrillDepartment.value = row.department
  activeTab.value = 'drill'
  // 分析接口只保证返回维度结果，不一定携带上级组织键；从医院层开始由后端返回的路径快照驱动下钻。
  drillStartLevel.value = 'HOSPITAL'
  drillParentKeys.value = {}
}

function formatCount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '-'
}

function formatDecimal(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(8) : '-'
}

function displayStatus(value) {
  return value ? getStatusLabel(value) : '-'
}

function compactId(value) {
  const text = String(value || '-')
  return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-8)}` : text
}

function resolveCurrentMetricValue() {
  const overview = analysisOverview.value
  if (isUsableDisplayValue(overview?.displayValue)) return overview.displayValue
  if (isUsableRawValue(overview?.value)) return formatMetricValue(overview.value, currentProfile.value.unit)
  return '-'
}

function isUsableDisplayValue(value) {
  return value !== undefined && value !== null && value !== ''
}

function isUsableRawValue(value) {
  const number = Number(value)
  return value !== null && value !== '' && Number.isFinite(number)
}

function formatMetricValue(value, unit) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  if (unit === '%') return `${(number * 100).toFixed(2)}%`
  return String(number)
}

function createTrendFromBackendAnalysis(payload, unit) {
  const responseGranularity = String(payload?.granularity || trendAnalysisGranularity.value).toUpperCase()
  if (
    !payload?.dataAvailable ||
    !Array.isArray(payload.trend) ||
    !payload.trend.length ||
    responseGranularity !== trendAnalysisGranularity.value
  ) return null

  return {
    range: isCompleteDateRange(analysisPeriodRange.value)
      ? `展示所选范围：${formatPeriodLabel(analysisPeriodRange.value[0], analysisPeriodRange.value[1])}`
      : responseGranularity === 'YEARLY' ? '展示全部可用年度结果' : '展示全部可用周期结果',
    labels: payload.trend.map((item) => formatTrendPeriodLabel(item, responseGranularity)),
    actual: payload.trend.map((item) => normalizeTrendValue(item, unit)),
    peer: payload.trend.map(() => null)
  }
}

function normalizeTrendValue(item, unit) {
  const value = Number(item?.value)
  if (!Number.isFinite(value)) return null
  if (unit === '%') return Number((value * 100).toFixed(2))
  return value
}

function formatTrendPeriodLabel(item, granularity) {
  const start = String(item?.periodStart || '').slice(0, 10)
  const normalizedGranularity = String(granularity || '').toUpperCase()
  if (normalizedGranularity === 'DAILY') return start || '-'
  if (normalizedGranularity === 'MONTHLY') return start.slice(0, 7) || '-'
  if (normalizedGranularity === 'YEARLY') return start.slice(0, 4) || '-'
  if (normalizedGranularity === 'QUARTERLY' && start) {
    const month = Number(start.slice(5, 7))
    return `${start.slice(0, 4)}-Q${Math.ceil(month / 3)}`
  }
  return formatPeriodLabel(item?.periodStart, item?.periodEnd)
}

function formatPeriodLabel(periodStart, periodEnd) {
  const start = String(periodStart || '').slice(0, 10)
  const end = String(periodEnd || '').slice(0, 10)
  if (start && end) return `${start} 至 ${end}`
  return start || end || '-'
}

function buildArtifactStatus(chain) {
  return [
    chain?.deathFactorArtifact?.status,
    chain?.dischargeFactorArtifact?.status,
    chain?.indicatorFormulaArtifact?.status
  ].filter(Boolean).map(displayStatus).join(' / ') || '-'
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') || '-'
}

function resolveChainWatermark(chain) {
  if (!hasBackendMortalityData.value) return '-'
  return firstPresent(
    chain?.indicatorResult?.dataWatermark,
    chain?.indicatorResult?.watermark,
    chain?.calcBatch?.dataWatermark,
    chain?.calcBatch?.watermark,
    '后端未返回数据水位'
  )
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

function applyReportPeriod() {
  if (!validateOptionalDateRange(reportPeriodRange.value, '报告期')) return
  const query = { ...route.query }
  if (isCompleteDateRange(reportPeriodRange.value)) {
    query.periodStart = reportPeriodRange.value[0]
    query.periodEnd = reportPeriodRange.value[1]
  } else {
    delete query.periodStart
    delete query.periodEnd
  }
  router.replace({ path: '/analysis', query })
  refreshMortalityAnalysis()
}

function applyTrendConditions() {
  if (!validateOptionalDateRange(trendPeriodDraft.value, '趋势时间')) return
  analysisPeriodRange.value = isCompleteDateRange(trendPeriodDraft.value) ? [...trendPeriodDraft.value] : []
  const query = { ...route.query }
  if (isCompleteDateRange(analysisPeriodRange.value)) {
    query.trendStart = analysisPeriodRange.value[0]
    query.trendEnd = analysisPeriodRange.value[1]
    rememberAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value, analysisPeriodRange.value)
  } else {
    delete query.trendStart
    delete query.trendEnd
    forgetAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value)
  }
  router.replace({ path: '/analysis', query })
  refreshMortalityAnalysis()
}

function applyTrendGranularity() {
  refreshMortalityAnalysis()
}

function clearTrendPeriod() {
  trendPeriodDraft.value = []
  applyTrendConditions()
}

function openCalculationBatch(batchId) {
  router.push({ path: '/calc', query: { batchId: String(batchId) } })
}

async function loadBackendAnalysisIndicators() {
  indicatorOptionsLoading.value = true
  try {
    const [indicators, publishedVersions] = await Promise.all([
      fetchIndicators({ page: 1, size: 200 }),
      fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 200 })
    ])
    backendIndicators.value = mergePublishedAnalysisIndicators(
      normalizeList(indicators),
      normalizeList(publishedVersions)
    )
    if (selectedBackendIndicator.value) {
      const backendName = selectedBackendIndicator.value.name || selectedBackendIndicator.value.code || ''
      if (backendName && route.query.indicatorName !== backendName) {
        await router.replace({ path: '/analysis', query: { ...route.query, indicatorName: backendName } })
      }
      await refreshMortalityAnalysis()
      void loadScenarioComparison()
    } else if (backendIndicators.value.length) {
      const firstOption = createBackendAnalysisOptions(backendIndicators.value)[0]
      if (firstOption?.code) {
        selectedIndicatorCode.value = firstOption.code
        await router.replace({ path: '/analysis', query: { ...route.query, indicator: firstOption.code, indicatorName: firstOption.name } })
      }
    } else {
      selectedIndicatorCode.value = ''
      backendAnalysis.value = null
      trendBackendAnalysis.value = null
    }
  } catch {
    backendIndicators.value = []
    ElMessage.warning('后端已发布指标列表暂不可用，当前没有可选指标')
  } finally {
    indicatorOptionsLoading.value = false
  }
}

function createBackendAnalysisOptions(indicators) {
  const mappedOptions = indicators.filter(isPublishedIndicator).map((item) => {
    const key = getBackendIndicatorKey(item)
    return {
      optionKey: key,
      code: key,
      name: item.name || item.code || '未命名指标',
      backendCode: item.code,
      source: '后端指标',
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
      name: indicator.name || version.indicatorName || version.name || code,
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
  const params = { granularity }
  if (versionId) params.indicatorVersionId = versionId
  if (isCompleteDateRange(range)) {
    params.periodStart = range[0]
    params.periodEnd = range[1]
  }
  return params
}

function emptyTrend() {
  return { labels: [], actual: [], peer: [] }
}

function createGenericAnalysisProfile(indicator) {
  const name = indicator?.name || indicator?.code || '未命名指标'
  const unit = indicator?.unit || indicator?.displayUnit || ''
  return {
    code: getBackendIndicatorKey(indicator),
    name,
    unit,
    targetLabel: '目标值未配置',
    markLineValue: null,
    yAxisMax: null,
    summary: [{ label: '当前指标值', value: '-', tone: 'neutral' }],
    sceneComparisons: [],
    trends: { 月度: emptyTrend(), 季度: emptyTrend(), 年度: emptyTrend() },
    rankRows: []
  }
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function normalizeText(value) {
  return String(value || '').replace(/\s/g, '').replace(/[（）()]/g, '')
}

function isMortalityIndicator(indicator) {
  const code = String(indicator?.code || indicator?.indicatorCode || '')
  const name = normalizeText(indicator?.name || indicator?.indicatorName)
  return /MORTALITY|DEATH/i.test(code) || name.includes('住院死亡率')
}

async function refreshMortalityAnalysis() {
  const refreshSequence = ++analysisRefreshSequence
  mortalityChainLoading.value = true
  backendAnalysis.value = null
  trendBackendAnalysis.value = null
  backendIndicatorVersion.value = null
  availablePeriod.value = null
  analysisErrorMessage.value = ''
  mortalityChain.value = null
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator) {
    mortalityChainLoading.value = false
    return
  }
  // 可用范围与“是否已经有正式计算结果”无关。始终使用后端目录中当前指标的
  // 已发布版本探测，避免前端固定 ID 覆盖用户实际选择的指标版本。
  const initialVersionId = currentIndicatorVersionId.value
  void loadAvailablePeriod(initialVersionId, refreshSequence)
  try {
    const granularity = backendAnalysisGranularity.value
    const backendIndicatorId = String(backendIndicator.id || backendIndicator.indicatorId)
    const mortalityIndicator = isMortalityIndicator(backendIndicator)

    const reportParams = buildAnalysisParams(reportPeriodRange.value)
    const trendParams = buildAnalysisParams(analysisPeriodRange.value, currentIndicatorVersionId.value, trendAnalysisGranularity.value)
    const [analysisData, trendResult, chain] = await Promise.allSettled([
      granularity ? fetchIndicatorAnalysis(backendIndicatorId, reportParams) : Promise.resolve(null),
      fetchIndicatorAnalysis(backendIndicatorId, trendParams),
      mortalityIndicator ? fetchMortalityReadonlyChain() : Promise.resolve(null)
    ])

    if (trendResult.status === 'fulfilled') trendBackendAnalysis.value = trendResult.value
    if (analysisData.status === 'rejected') throw analysisData.reason
    if (analysisData?.status === 'fulfilled' && analysisData?.value) {
      backendAnalysis.value = analysisData.value
      if (!trendBackendAnalysis.value) trendBackendAnalysis.value = analysisData.value
      if (analysisData.value?.granularity) reportGranularity.value = String(analysisData.value.granularity)
      if (!reportPeriodRange.value.length && analysisData.value?.overview?.periodStart && analysisData.value?.overview?.periodEnd) {
        reportPeriodRange.value = [analysisData.value.overview.periodStart, analysisData.value.overview.periodEnd]
      }
      const versionId = String(
        analysisData.value.indicatorVersionId ||
        currentIndicatorVersionId.value
      )
      if (versionId) {
        if (backendIndicator) {
          try {
            backendIndicatorVersion.value = await fetchIndicatorVersion(versionId)
          } catch {
            backendIndicatorVersion.value = null
          }
        }
        // 分析响应中的版本优先级更高；若它与当前已发布版本不同，再按实际版本刷新。
        if (versionId !== initialVersionId) await loadAvailablePeriod(versionId, refreshSequence)
      }
    }

    mortalityChain.value = mortalityIndicator && chain.status === 'fulfilled' ? chain.value : null
    mortalityChainLoading.value = false
  } catch (error) {
    mortalityChain.value = null
    mortalityChainLoading.value = false
    if (selectedBackendIndicator.value) {
      analysisErrorMessage.value = error?.message
        ? `指定周期正式结果暂不可用：${error.message}`
        : '指定周期尚无已激活正式结果，请先生成正式计算批次。'
      ElMessage.warning(analysisErrorMessage.value)
    }
  }
}

async function loadAvailablePeriod(versionId, refreshSequence) {
  if (!versionId) return null
  try {
    const value = await fetchIndicatorAvailablePeriod(versionId)
    if (refreshSequence !== analysisRefreshSequence) return null
    availablePeriod.value = value
    return value
  } catch {
    // 不把范围探测失败伪装成“没有数据”；保留空值，由页面显示“暂未获取”。
    if (refreshSequence === analysisRefreshSequence) availablePeriod.value = null
    return null
  }
}

onMounted(async () => {
  await loadBackendAnalysisIndicators()
  if (route.query.focus === 'scenario-comparison') {
    await nextTick()
    scrollToSceneComparison()
  }
})

watch(indicatorCode, () => {
  selectedIndicatorCode.value = indicatorCode.value
  analysisPeriodRange.value = initialAnalysisPeriodRange()
  trendPeriodDraft.value = [...analysisPeriodRange.value]
  reportPeriodRange.value = initialReportPeriodRange()
  scenarioComparisonSelectedIds.value = []
  scenarioComparisonPeriodRange.value = []
  scenarioComparisonOptions.value = []
  scenarioComparisonIdByCode.value = new Map()
  scenarioPeriodDrawerOpen.value = false
  selectedScenarioForPeriods.value = null
  period.value = '月度'
  refreshMortalityAnalysis()
  loadScenarioComparison()
})

function initialAnalysisPeriodRange() {
  return route.query.trendStart && route.query.trendEnd
    ? [normalizeDateValue(route.query.trendStart), normalizeDateValue(route.query.trendEnd)]
    : readRememberedAnalysisPeriod(route.query.indicator, route.query.indicatorVersionId)
}

function initialReportPeriodRange() {
  return route.query.periodStart && route.query.periodEnd
    ? [normalizeDateValue(route.query.periodStart), normalizeDateValue(route.query.periodEnd)]
    : []
}

function normalizeDateValue(value) {
  return String(value || '').slice(0, 10)
}

function initialScenarioVersionIds() {
  const value = route.query.scenarioVersionIds
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return values.map((item) => String(item).trim()).filter(Boolean)
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

function isChartNumber(value) {
  return value !== null && value !== '' && Number.isFinite(Number(value))
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
  if (!result?.periodStart || !result?.periodEnd) return ''
  return `${String(result.periodStart).slice(0, 10)} ～ ${String(result.periodEnd).slice(0, 10)}`
}

function formatRange(range) {
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

.report-context {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  grid-template-areas: 'title controls';
  align-items: center;
  column-gap: 24px;
  margin-bottom: 16px;
  padding: 14px 18px;
  background: var(--idmp-surface-subtle, #f8fafc);
}

.report-context__title {
  display: grid;
  grid-area: title;
  gap: 4px;
}

.report-context__title > span {
  color: var(--idmp-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.report-context__title > span strong {
  color: var(--idmp-text-secondary, #475467);
  font-weight: 600;
}

.report-context__title > small {
  color: var(--idmp-text-secondary, #667085);
  font-size: 12px;
}

.report-context__controls {
  display: flex;
  grid-area: controls;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

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

.metric-overview {
  display: grid;
  grid-template-columns: minmax(290px, 0.9fr) minmax(0, 1.6fr);
  gap: var(--idmp-space-3);
  margin-bottom: var(--idmp-space-4);
}

.primary-metric {
  min-height: 190px;
  padding: var(--idmp-space-5);
  border-left: 4px solid var(--idmp-interactive);

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--idmp-space-3);
  }

  span {
    color: var(--idmp-text-secondary);
    font-size: 14px;
    line-height: 18px;
  }

  > strong {
    display: block;
    margin: var(--idmp-space-5) 0 var(--idmp-space-2);
    color: var(--idmp-text-primary);
    font-size: 42px;
    font-weight: 650;
    line-height: 48px;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.metric-summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--idmp-space-3);
  align-content: stretch;
}

.metric-summary-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  grid-column: span 2;
  min-width: 0;
  min-height: 112px;
  padding: var(--idmp-space-5);
  text-align: left;

  .metric-summary-card__header {
    display: flex;
    min-height: 18px;
    align-items: center;
  }

  span {
    color: var(--idmp-text-secondary);
    font-size: 14px;
    line-height: 18px;
  }

  strong {
    display: block;
    min-width: 0;
    margin: var(--idmp-space-5) 0 var(--idmp-space-2);
    color: var(--idmp-text-primary);
    font-size: 24px;
    font-weight: 650;
    line-height: 32px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  p {
    margin: 0;
    min-height: 18px;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.metric-summary-grid.is-1 .metric-summary-card { grid-column: span 6; }
.metric-summary-grid.is-2 .metric-summary-card,
.metric-summary-grid.is-4 .metric-summary-card { grid-column: span 3; }
.metric-summary-grid.is-5 .metric-summary-card:nth-child(-n + 2) { grid-column: span 3; }

.scene-comparison {
  min-height: 80px;
  margin-bottom: 16px;
  padding: 13px 16px;
}

.scene-comparison__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.scene-comparison__label {
  display: flex;
  flex-direction: column;
  gap: 3px;

  span {
    color: var(--idmp-text-primary);
    font-weight: 600;
    line-height: 22px;
  }

  small {
    color: var(--idmp-text-disabled);
    font-size: 12px;
    line-height: 18px;
  }
}

.scene-comparison__controls {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.scene-comparison__controls :deep(.el-select) { width: 220px; }
.scene-comparison__controls .date-range-fields :deep(.el-date-editor) { width: 310px; }

.scenario-result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.metric-overview.is-single {
  grid-template-columns: minmax(290px, 520px);
}

.scenario-result-card {
  display: flex;
  flex-direction: column;
  min-height: 128px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-01);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.scenario-result-card.is-clickable { cursor: pointer; }
.scenario-result-card.is-clickable:hover { border-color: var(--idmp-border-strong); box-shadow: 0 4px 12px rgb(23 33 43 / 8%); }
.scenario-result-card.is-clickable:focus-visible { outline: 2px solid var(--idmp-focus); outline-offset: 2px; }

.scenario-result-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--idmp-border-soft);
  background: var(--idmp-layer-02);
}

.scenario-result-card__head strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.scenario-result-card__latest {
  display: grid;
  flex: 1;
  align-content: center;
  padding: 10px 12px;
}

.scenario-result-card__latest > strong {
  color: var(--idmp-text-primary);
  font-size: 26px;
  line-height: 30px;
}

.scenario-result-card__notice {
  margin: 0 12px 8px;
  overflow: hidden;
  padding: 5px 8px;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-warning-subtle, var(--idmp-layer-02));
  color: var(--idmp-text-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scenario-result-card__actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--idmp-border-soft); color: var(--idmp-text-helper); font-size: 12px; }
.scenario-result-card__open { display: inline-flex; align-items: center; color: var(--idmp-interactive); font-weight: 600; }
.scenario-period-drawer__summary { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); background: var(--idmp-layer-02); }
.scenario-period-drawer__summary > div { display: grid; gap: 3px; min-width: 88px; }.scenario-period-drawer__summary span { color: var(--idmp-text-helper); font-size: 12px; }.scenario-period-drawer__summary strong { color: var(--idmp-text-primary); font-size: 14px; }.scenario-period-drawer__summary :deep(.status-badge) { margin-left: auto; }
.scenario-period-drawer__hint { margin: 14px 0; color: var(--idmp-text-helper); font-size: 12px; line-height: 18px; }
.scenario-period-drawer__pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; color: var(--idmp-text-helper); font-size: 12px; }
.scene-period-collapse { border-top: 1px solid var(--idmp-border-soft); }
.scene-period-collapse :deep(.el-collapse-item__header) { height: 36px; color: var(--idmp-interactive); font-size: 12px; }
.scene-period-collapse :deep(.el-collapse-item__wrap) { border-bottom: 0; }
.scene-period-collapse :deep(.el-collapse-item__content) { padding-bottom: 0; }

.scene-period-list { display: grid; gap: 6px; padding: 0 0 10px; }
.scene-period-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px dashed var(--idmp-border-soft);
  color: var(--idmp-text-secondary);
}
.scene-period-item:first-child { border-top: 0; }
.scene-period-item.is-latest { color: var(--idmp-text-primary); }
.scene-period-item strong { color: var(--idmp-text-primary); }
.scene-period-item small { grid-column: 1 / -1; color: var(--idmp-text-helper); font-size: 12px; }

.scenario-result-card__empty {
  display: grid;
  flex: 1;
  align-content: center;
  gap: 6px;
  padding: 10px 12px;
  color: var(--idmp-text-secondary);
}
.scenario-result-card__empty .el-button { justify-self: start; margin-top: 2px; }

.scene-tags {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
}

.scene-tag {
  display: grid;
  min-width: 0;
  flex: 1 1 0;
  grid-template-columns: minmax(88px, 1fr) auto auto;
  align-items: center;
  min-height: 52px;
  padding: 8px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-secondary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;

  &:hover {
    border-color: var(--idmp-interactive);
    background: var(--idmp-layer-hover);
  }

  &.is-current {
    border-color: var(--idmp-interactive);
    background: var(--idmp-interactive-subtle);
  }

  span {
    overflow: hidden;
    color: var(--idmp-text-secondary);
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    margin-left: 10px;
    color: var(--idmp-interactive);
    font-size: 18px;
    line-height: 24px;
  }

  em {
    margin-left: 10px;
    color: var(--idmp-text-helper);
    font-size: 12px;
    font-style: normal;
    white-space: nowrap;
  }
}

.chain-panel {
  min-width: 0;
  margin-bottom: 16px;
  padding: 16px 18px;
}

.chain-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 12px;

  h2 {
    margin: 0 0 4px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.chain-equation {
  display: flex;
  min-height: 46px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-interactive-subtle);

  span,
  em {
    color: var(--idmp-text-helper);
    font-size: 12px;
    font-style: normal;
    line-height: 20px;
  }

  strong {
    color: var(--idmp-interactive);
    font-size: 18px;
    font-weight: 650;
    line-height: 24px;
  }
}

.chain-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.chain-node {
  display: flex;
  min-width: 0;
  min-height: 82px;
  flex-direction: column;
  justify-content: space-between;
  padding: 11px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-01);

  span {
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }

  strong {
    overflow: hidden;
    color: var(--idmp-text-primary);
    font-size: 16px;
    font-weight: 650;
    line-height: 22px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--idmp-text-disabled);
    font-size: 12px;
    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
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

.trend-toolbar,
.table-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 8px;
  flex-wrap: wrap;

  h2 {
    margin: 0 0 3px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.trend-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  padding-right: 4px;
}

.trend-period-picker {
  width: 292px;
  min-width: 0;
  flex: 0 0 292px;
}

.trend-period-picker :deep(.el-date-editor) {
  width: 132px;
}

.trend-controls :deep(.el-radio-group) {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  margin-left: 0;
  overflow: visible;
  white-space: nowrap;
}

.trend-controls :deep(.el-radio-button__inner) {
  box-sizing: border-box;
  padding-right: 8px;
  padding-left: 8px;
}

.trend-controls :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-right-width: 1px;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.period-control {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.period-control :deep(.el-date-editor) {
  width: 330px;
  max-width: 100%;
}

.period-control :deep(.el-radio-group) {
  display: flex;
  flex-wrap: nowrap;
  flex-shrink: 0;
  overflow: visible;
  white-space: nowrap;
}

.period-control :deep(.el-radio-button__inner) {
  box-sizing: border-box;
  padding-right: 10px;
  padding-left: 10px;
  white-space: nowrap;
}

.period-control :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-left: 1px solid var(--idmp-border-strong, var(--el-border-color));
}

.period-control :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-right: 1px solid var(--idmp-border-strong, var(--el-border-color));
}

.period-range,
.table-heading > span {
  color: var(--idmp-text-helper);
  font-size: 12px;
  white-space: nowrap;
}

.chart-table-scroll {
  max-width: min(720px, 70vw);
  max-height: 280px;
  overflow: auto;
}

.chart-data-table {
  width: 100%;
  min-width: 480px;
  border-collapse: collapse;
  color: var(--idmp-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: var(--idmp-space-2) var(--idmp-space-3);
    border-bottom: 1px solid var(--idmp-border-subtle);
    text-align: right;
  }

  th:first-child {
    text-align: left;
  }

  thead th {
    background: var(--idmp-layer-02);
    color: var(--idmp-text-primary);
    font-weight: 600;
  }

  tbody th {
    color: var(--idmp-text-secondary);
    font-weight: 500;
  }
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.analysis-table {
  min-width: 1020px;

  :deep(th.el-table__cell) {
    height: 44px;
    padding: 0;
    color: var(--idmp-text-primary);
    font-weight: 600;
    background: var(--idmp-layer-02);
  }

  :deep(td.el-table__cell) {
    height: 48px;
    padding: 0;
    color: var(--idmp-text-secondary);
  }
}

.rank-table {
  min-width: 1060px;
}

.rank-table-scroll {
  max-height: 460px;
  overflow: auto;
  overscroll-behavior: contain;
}

.rank-number {
  display: inline-grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-helper);
  font-size: 12px;

  &.is-top {
    background: var(--idmp-interactive-subtle);
    color: var(--idmp-interactive);
    font-weight: 600;
  }
}

.text-danger {
  color: var(--idmp-support-danger);
}

.text-success {
  color: var(--idmp-support-success);
}

.text-muted {
  color: var(--idmp-text-helper);
}

@media (max-width: 1450px) {
  .header-indicator-select {
    width: 260px;
  }

  .metric-overview {
    grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.55fr);
    gap: var(--idmp-space-2);
  }

  .scene-comparison {
  }

  .scene-comparison__label {
  }

  .scene-tag {
    grid-template-columns: minmax(76px, 1fr) auto;

    em {
      display: none;
    }
  }
}

@media (max-width: 1180px) {
  .report-context {
    grid-template-columns: 1fr;
    grid-template-areas:
      'title'
      'controls';
  }

  .report-context__controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .metric-overview {
    grid-template-columns: 1fr;
  }

  .primary-metric {
    min-height: 150px;
  }

  .trend-controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .trend-controls :deep(.el-radio-group) {
    margin-left: 0;
  }
}

@media (max-width: 720px) {
  .scene-comparison__head { align-items: flex-start; flex-direction: column; }
  .scenario-result-grid { grid-template-columns: 1fr; }
  .date-range-fields {
    width: 100%;
    flex-wrap: wrap;
  }

  .date-range-fields :deep(.el-date-editor) {
    width: 100%;
    flex: 1 1 100%;
  }

  .metric-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-summary-card,
  .metric-summary-grid.is-2 .metric-summary-card,
  .metric-summary-grid.is-3 .metric-summary-card,
  .metric-summary-grid.is-4 .metric-summary-card,
  .metric-summary-grid.is-5 .metric-summary-card,
  .metric-summary-grid.is-5 .metric-summary-card:nth-child(-n + 2) {
    grid-column: span 1;
  }

  .metric-summary-grid.is-1 .metric-summary-card { grid-column: span 2; }

  .trend-period-picker {
    flex-basis: 100%;
  }
}
</style>
