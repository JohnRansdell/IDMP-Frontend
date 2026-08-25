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
        <span>当前报告期</span>
        <small>选择时间范围后，更新本期指标值、排名和下钻结果</small>
      </div>
      <el-date-picker
        v-model="reportPeriodRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        range-separator="至"
        size="default"
        class="report-period-picker"
      />
      <el-button type="primary" :loading="mortalityChainLoading" @click="applyReportPeriod">查看报告</el-button>
      <el-button link @click="showDataDiagnostics = true">数据说明</el-button>
      <small v-if="availablePeriodText" class="report-context__hint">源数据可用范围：{{ availablePeriodText }}</small>
    </section>
    <section v-if="analysisNotice" class="analysis-state-notice" :class="`is-${analysisAvailability.status.toLowerCase()}`">
      <div><strong>{{ analysisNotice.title }}</strong><p>{{ analysisNotice.message }}</p></div>
      <el-button size="small" @click="showDataDiagnostics = true">查看数据诊断</el-button>
    </section>

    <section class="metric-overview" aria-label="指标核心数据">
      <article class="surface-card primary-metric">
        <div>
          <span>{{ primaryMetric.label }}</span>
          <StatusBadge :status="primaryMetric.status" :label="primaryMetric.statusLabel" />
        </div>
        <strong>{{ primaryMetric.value }}</strong>
        <p>{{ primaryMetric.periodLabel }} · {{ currentProfile.targetLabel }}</p>
      </article>
      <div class="metric-summary-grid" :class="summaryMetricGridClass">
        <article v-for="item in summaryMetrics" :key="item.label" class="surface-card metric-summary-card">
          <span>{{ item.label }}</span>
          <strong :class="metricToneClass(item.tone)">{{ item.value }}</strong>
          <small v-if="item.description">{{ item.description }}</small>
        </article>
      </div>
    </section>

    <section ref="sceneComparisonRef" class="surface-card scene-comparison" aria-label="不同场景计算值对比">
      <div class="scene-comparison__label">
        <span>不同场景对比</span>
        <small>同一指标在不同场景下的计算口径可能存在差异</small>
      </div>
      <div class="scene-tags">
        <button
          v-for="scene in currentProfile.sceneComparisons"
          :key="scene.name"
          type="button"
          class="scene-tag"
          :class="{ 'is-current': scene.current }"
          :aria-pressed="scene.current ? 'true' : 'false'"
          @click="showSceneValue(scene)"
        >
          <span>{{ scene.name }}</span>
          <strong>{{ scene.value }}</strong>
          <em>{{ scene.difference || '当前场景' }}</em>
        </button>
      </div>
    </section>

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
              <p>展示本院实际值与同级医院均值的周期变化</p>
            </div>
            <div class="trend-controls">
              <el-date-picker v-model="analysisPeriodRange" class="trend-period-picker" type="daterange" value-format="YYYY-MM-DD" start-placeholder="趋势开始日期" end-placeholder="趋势结束日期" range-separator="至" size="small" @change="applyTrendConditions" />
              <el-radio-group v-model="period" size="small" aria-label="趋势统计粒度" @change="applyTrendConditions">
                <el-radio-button v-for="item in analysisPeriodOptions" :key="item" :value="item">{{ item }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <IdmpChart
            :option="trendOption"
            height="338px"
            :updated-at="analysisUpdatedAt"
            :aria-label="`${currentProfile.name}趋势图；本院实际值与同级医院均值对比`"
            table-label="查看趋势数据表"
          >
            <template #table>
              <div class="chart-table-scroll">
                <table class="chart-data-table">
                  <thead>
                    <tr>
                      <th scope="col">周期</th>
                      <th scope="col">本院实际值</th>
                      <th scope="col">同级医院均值</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in trendTableRows" :key="row.label">
                      <th scope="row">{{ row.label }}</th>
                      <td>{{ row.actual }}{{ currentProfile.unit }}</td>
                      <td>{{ row.peer }}{{ currentProfile.unit }}</td>
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
              <p v-else>本地配置演示排名，按 {{ currentProfile.name }} 由高到低排列；尚未接入服务端分页。</p>
            </div>
            <StatusBadge :status="hasBackendRankData ? 'ACTIVE' : 'DRAFT'" :label="hasBackendRankData ? '后端维度数据' : '演示数据 · 2024 年度'" tone="neutral" />
          </div>
          <div class="table-scroll rank-table-scroll">
            <el-table
              :data="rankTableData"
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
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Connection, Download } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import ResultAvailabilityPanel from '@/idmp/components/ResultAvailabilityPanel.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchIndicatorAnalysis, fetchIndicatorAvailablePeriod, fetchIndicators, fetchIndicatorVersion, fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { deriveDrillPathResultIds } from '@/idmp/api/adapters/drill'
import { resolveResultAvailability } from '@/idmp/features/analysis/resultAvailability'
import { fetchMortalityReadonlyChain, mortalityChainConfig } from '@/idmp/api/modules/mortality'
import { costChainConfig, COST_INDICATOR_IDS, fetchCostAnalysis } from '@/idmp/api/modules/costChain'
import { getStatusLabel } from '@/idmp/design/status'
import {
  DEFAULT_ANALYSIS_INDICATOR,
  getAnalysisProfileOptions,
  getAnalysisProfile,
  periodOptions,
  updateMortalityProfileFromChain
} from '@/idmp/features/analysis/indicatorProfiles'

const route = useRoute()
const router = useRouter()
const activeTab = ref('trend')
const period = ref('月度')
const reportGranularity = ref('MONTHLY')
const profileRefreshVersion = ref(0)
const backendAnalysis = ref(null)
const trendBackendAnalysis = ref(null)
const backendIndicatorVersion = ref(null)
const availablePeriod = ref(null)
const analysisErrorMessage = ref('')
const mortalityChain = ref(null)
const mortalityChainLoading = ref(false)
const selectedIndicatorCode = ref(String(route.query.indicator || DEFAULT_ANALYSIS_INDICATOR))
const backendIndicators = ref([])
const indicatorOptionsLoading = ref(false)
const sceneComparisonRef = ref()
const selectedDrillDepartment = ref('')
const drillStartLevel = ref('HOSPITAL')
const drillParentKeys = ref({})
const analysisPeriodRange = ref(initialAnalysisPeriodRange())
const reportPeriodRange = ref(initialReportPeriodRange())
const showDataDiagnostics = ref(false)

const indicatorCode = computed(() => String(route.query.indicator || DEFAULT_ANALYSIS_INDICATOR))
const localAnalysisOptions = computed(() => getAnalysisProfileOptions())
const analysisPeriodOptions = computed(() => ['日度', ...periodOptions])
const analysisIndicatorOptions = computed(() =>
  createBackendAnalysisOptions(backendIndicators.value, localAnalysisOptions.value)
)
const selectedBackendIndicator = computed(() => backendIndicators.value.find((item) => {
  const key = getBackendIndicatorKey(item)
  return [key, item.id, item.indicatorId, item.code].some((value) => String(value || '') === indicatorCode.value)
}))
const currentProfile = computed(() => {
  profileRefreshVersion.value
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator) return getAnalysisProfile(indicatorCode.value)

  const profile = matchAnalysisProfile(backendIndicator, localAnalysisOptions.value)
  if (profile) {
    return {
      ...getAnalysisProfile(profile.code),
      code: indicatorCode.value,
      name: backendIndicator.name || profile.name,
      unit: backendIndicator.unit || backendIndicator.displayUnit || profile.unit
    }
  }
  return createGenericAnalysisProfile(backendIndicator)
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
const currentTrend = computed(() => backendTrend.value || (hasLiveAnalysisResponse.value ? emptyTrend() : currentProfile.value.trends?.[period.value] || emptyTrend()))
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
  return { ...(currentProfile.value.summary?.[0] || { label: '当前指标值', value: '-', tone: 'neutral' }), status: 'ACTIVE', statusLabel: '演示结果', periodLabel: '演示数据' }
})
const summaryMetrics = computed(() => {
  if (hasLiveAnalysisResponse.value) {
    const metrics = []
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
  return (currentProfile.value.summary?.slice(1) || []).filter((item) => item.label !== '记录数')
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
  if (hasLiveAnalysisResponse.value) return []
  return (currentProfile.value.rankRows || []).map((row, index) => ({
    ...row,
    departmentKey: row.departmentKey || `DEPT_${index + 1}`
  }))
})

const showMortalityChainPanel = computed(() => indicatorCode.value === 'MORTALITY_INPATIENT')
const hasBackendMortalityData = computed(() => Boolean(
  mortalityChain.value?.indicatorResult ||
  mortalityChain.value?.deathFactor ||
  mortalityChain.value?.dischargeFactor ||
  mortalityChain.value?.calcBatch
))
const analysisSourceLabel = computed(() => hasBackendAnalysisData.value ? '已发布结果' : hasLiveAnalysisResponse.value ? '暂无正式结果' : hasBackendMortalityData.value ? '计算链路摘要' : '演示数据')
const availablePeriodText = computed(() => {
  const value = availablePeriod.value
  if (!value) return ''
  if (value.earliestDataDate && value.latestDataDate) return `${value.earliestDataDate} 至 ${value.latestDataDate}`
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
      : hasBackendMortalityData.value ? String(config.indicatorVersionId || '后端未返回') : '演示配置（无版本 ID）',
    batch: hasBackendAnalysisData.value
      ? String(context.batchId || '后端未返回')
      : hasBackendMortalityData.value ? String(config.indicatorBatchId || '后端未返回') : '未接入',
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
    hasBackendMortalityData.value ? '后端未返回更新时间' : '2024-12-31（演示快照）'
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
  (reportGranularity.value === 'YEARLY' ? '2026' : reportGranularity.value === 'QUARTERLY' ? '2026-Q2' : '2026-06')
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
    data: ['本院实际值', '同级医院均值']
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
  series: [
    {
      name: '本院实际值',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 3 },
      itemStyle: { borderWidth: 2 },
      data: currentTrend.value.actual,
      markLine: {
        silent: true,
        symbol: 'none',
        label: {
          formatter: currentProfile.value.targetLabel,
          color: '#b4232c',
          position: 'insideEndTop'
        },
        lineStyle: { color: '#b4232c', type: 'dashed', width: 1 },
        data: [{ yAxis: currentProfile.value.markLineValue }]
      }
    },
    {
      name: '同级医院均值',
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { width: 2, type: 'dashed' },
      data: currentTrend.value.peer
    }
  ]
}))

const mortalityDeathRecord = computed(() => mortalityChain.value?.deathFactor?.results?.records?.[0])
const mortalityDischargeRecord = computed(() => mortalityChain.value?.dischargeFactor?.results?.records?.[0])
const mortalityIndicatorRecord = computed(() => mortalityChain.value?.indicatorResult?.results?.records?.[0])
const chainDeathValue = computed(() => formatCount(mortalityDeathRecord.value?.valueDecimal))
const chainDischargeValue = computed(() => formatCount(mortalityDischargeRecord.value?.valueDecimal))
const chainDisplayValue = computed(() => mortalityIndicatorRecord.value?.displayValue || currentProfile.value.summary?.[0]?.value || '-')
const chainRawValue = computed(() => formatDecimal(mortalityIndicatorRecord.value?.resultValue))
const mortalityChainStatusText = computed(() => {
  if (!hasBackendMortalityData.value) return '接口无可用结果 / 演示摘要'
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
      value: config.deathDomainCode || 'INPATIENT_DEATH_RECORD',
      meta: config.deathSourceTable || 'vmq_deathpatientdetail'
    },
    {
      label: '出院数据域',
      value: config.dischargeDomainCode || 'INPATIENT_DISCHARGE_RECORD',
      meta: config.dischargeSourceTable || 'vmq_basicinformationba'
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

const showSceneValue = (scene) => {
  ElMessage.info(`${scene.name}为本地演示场景值：${scene.value}，尚未接入场景结果接口。`)
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
  if (
    !payload?.dataAvailable ||
    !Array.isArray(payload.trend) ||
    !payload.trend.length ||
    payload.granularity !== trendAnalysisGranularity.value
  ) return null

  return {
    range: analysisPeriodRange.value.length === 2
      ? `展示所选范围：${formatPeriodLabel(analysisPeriodRange.value[0], analysisPeriodRange.value[1])}`
      : payload.granularity === 'YEARLY' ? '展示全部可用年度结果' : '展示全部可用周期结果',
    labels: payload.trend.map((item) => formatPeriodLabel(item.periodStart, item.periodEnd)),
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
  if (!hasBackendMortalityData.value) return '2024-12-31（演示快照）'
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
  router.push({
    path: '/analysis',
    query: { indicator: selectedIndicatorCode.value }
  })
}

function applyReportPeriod() {
  const query = { ...route.query }
  if (Array.isArray(reportPeriodRange.value) && reportPeriodRange.value.length === 2) {
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
  const query = { ...route.query }
  if (Array.isArray(analysisPeriodRange.value) && analysisPeriodRange.value.length === 2) {
    query.trendStart = analysisPeriodRange.value[0]
    query.trendEnd = analysisPeriodRange.value[1]
    rememberAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value, analysisPeriodRange.value)
  } else {
    delete query.trendStart
    delete query.trendEnd
  }
  router.replace({ path: '/analysis', query })
  refreshMortalityAnalysis()
}

function openCalculationBatch(batchId) {
  router.push({ path: '/calc', query: { batchId: String(batchId) } })
}

async function loadBackendAnalysisIndicators() {
  indicatorOptionsLoading.value = true
  try {
    const [indicators, publishedVersions] = await Promise.all([
      fetchIndicators({ page: 1, size: 100 }),
      fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 100 })
    ])
    backendIndicators.value = mergePublishedAnalysisIndicators(
      normalizeList(indicators),
      normalizeList(publishedVersions)
    )
    if (selectedBackendIndicator.value) await refreshMortalityAnalysis()
  } catch {
    backendIndicators.value = []
    ElMessage.warning('后端已发布指标列表暂不可用，当前没有可选指标')
  } finally {
    indicatorOptionsLoading.value = false
  }
}

function createBackendAnalysisOptions(indicators, profileOptions) {
  const mappedOptions = indicators.filter(isPublishedIndicator).map((item) => {
    const profile = matchAnalysisProfile(item, profileOptions)
    const key = getBackendIndicatorKey(item)
    return {
      optionKey: key,
      code: key,
      name: item.name || profile?.name || item.code || '未命名指标',
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
  return publishedVersions.map((version) => {
    const versionIndicator = version.indicator || {}
    const indicatorId = String(version.indicatorId || versionIndicator.id || '')
    const code = String(version.indicatorCode || version.code || versionIndicator.code || '')
    const indicator = indicatorsById.get(indicatorId) || indicatorsByCode.get(code) || {}
    const versionId = version.id || version.versionId || version.indicatorVersionId || ''
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
  }).filter((item) => item.code || item.indicatorId || item.id)
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
  if (Array.isArray(range) && range.length === 2) {
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

function matchAnalysisProfile(indicator, profileOptions) {
  const code = String(indicator?.code || '')
  const name = String(indicator?.name || '')
  const exact = profileOptions.find((item) => item.code === code)
  if (exact) return exact
  if (/MORTALITY|DEATH/i.test(code) || normalizeText(name).includes('住院死亡')) {
    return profileOptions.find((item) => item.code === 'MORTALITY_INPATIENT')
  }
  return profileOptions.find((item) => {
    const profileName = normalizeText(item.name)
    const indicatorName = normalizeText(name)
    return indicatorName && (profileName.includes(indicatorName) || indicatorName.includes(profileName))
  })
}

function normalizeText(value) {
  return String(value || '').replace(/\s/g, '').replace(/[（）()]/g, '')
}

async function refreshMortalityAnalysis() {
  mortalityChainLoading.value = true
  backendAnalysis.value = null
  trendBackendAnalysis.value = null
  backendIndicatorVersion.value = null
  availablePeriod.value = null
  analysisErrorMessage.value = ''
  mortalityChain.value = null
  try {
    const granularity = backendAnalysisGranularity.value
    const backendIndicator = selectedBackendIndicator.value
    const backendIndicatorId = String(backendIndicator?.id || backendIndicator?.indicatorId || indicatorCode.value)
    const isCostIndicator = COST_INDICATOR_IDS.some(id => String(id) === String(indicatorCode.value)) ||
      [costChainConfig.avgCostIndicatorCode, costChainConfig.antiCostIndicatorCode].includes(indicatorCode.value)

    let analysisResult, chain

    if (indicatorCode.value === 'MORTALITY_INPATIENT') {
      const [reportResult, trendResult, chainResult] = await Promise.allSettled([
        granularity
          ? fetchIndicatorAnalysis(mortalityChainConfig.indicatorId, buildAnalysisParams(reportPeriodRange.value, mortalityChainConfig.indicatorVersionId))
          : Promise.resolve(null),
        fetchIndicatorAnalysis(mortalityChainConfig.indicatorId, buildAnalysisParams(analysisPeriodRange.value, mortalityChainConfig.indicatorVersionId, trendAnalysisGranularity.value)),
        fetchMortalityReadonlyChain()
      ])
      analysisResult = reportResult
      if (trendResult.status === 'fulfilled') trendBackendAnalysis.value = trendResult.value
      chain = chainResult
    } else if (isCostIndicator) {
      analysisResult = await Promise.allSettled([
        granularity ? fetchCostAnalysis(indicatorCode.value, granularity) : Promise.resolve(null)
      ])
      chain = { status: 'rejected', reason: null }
    } else if (backendIndicator) {
      const reportParams = buildAnalysisParams(reportPeriodRange.value)
      const trendParams = buildAnalysisParams(analysisPeriodRange.value, currentIndicatorVersionId.value, trendAnalysisGranularity.value)
      const [reportResult, trendResult] = await Promise.allSettled([
        fetchIndicatorAnalysis(backendIndicatorId, reportParams),
        fetchIndicatorAnalysis(backendIndicatorId, trendParams)
      ])
      analysisResult = [reportResult]
      if (trendResult.status === 'fulfilled') trendBackendAnalysis.value = trendResult.value
      chain = { status: 'rejected', reason: null }
    } else {
      mortalityChainLoading.value = false
      return
    }

    const analysisData = Array.isArray(analysisResult) ? analysisResult[0] : analysisResult
    if (backendIndicator && analysisData?.status === 'rejected') throw analysisData.reason
    if (analysisData?.status === 'fulfilled' && analysisData?.value) {
      backendAnalysis.value = analysisData.value
      if (!trendBackendAnalysis.value) trendBackendAnalysis.value = analysisData.value
      if (analysisData.value?.granularity) reportGranularity.value = String(analysisData.value.granularity)
      if (!reportPeriodRange.value.length && analysisData.value?.overview?.periodStart && analysisData.value?.overview?.periodEnd) {
        reportPeriodRange.value = [analysisData.value.overview.periodStart, analysisData.value.overview.periodEnd]
      }
      const versionId = analysisData.value.indicatorVersionId || currentIndicatorVersionId.value
      if (backendIndicator && versionId) {
        try {
          backendIndicatorVersion.value = await fetchIndicatorVersion(versionId)
        } catch {
          backendIndicatorVersion.value = null
        }
        try {
          availablePeriod.value = await fetchIndicatorAvailablePeriod(versionId)
          if (!analysisPeriodRange.value.length && availablePeriod.value?.recommendedPeriodStart && availablePeriod.value?.recommendedPeriodEnd) {
            analysisPeriodRange.value = [availablePeriod.value.recommendedPeriodStart, availablePeriod.value.recommendedPeriodEnd]
          }
        } catch {
          availablePeriod.value = null
        }
      }
    }

    if (indicatorCode.value === 'MORTALITY_INPATIENT') {
      if (chain.status !== 'fulfilled' && (analysisData?.status !== 'fulfilled' || !analysisData?.value)) {
        throw chain.reason
      }
      if (chain.status === 'fulfilled') {
        const chainValue = chain.value
        mortalityChain.value = chainValue
        updateMortalityProfileFromChain(chainValue)
      } else {
        mortalityChain.value = null
      }
    } else {
      mortalityChain.value = null
    }
    profileRefreshVersion.value += 1
    mortalityChainLoading.value = false
  } catch (error) {
    mortalityChain.value = null
    mortalityChainLoading.value = false
    if (COST_INDICATOR_IDS.some(id => String(id) === String(indicatorCode.value)) ||
      [costChainConfig.avgCostIndicatorCode, costChainConfig.antiCostIndicatorCode].includes(indicatorCode.value)) {
      ElMessage.warning('费用指标后端结果暂不可用，已使用演示数据')
    } else if (selectedBackendIndicator.value) {
      analysisErrorMessage.value = error?.message
        ? `指定周期正式结果暂不可用：${error.message}`
        : '指定周期尚无已激活正式结果，请先生成正式计算批次。'
      ElMessage.warning(analysisErrorMessage.value)
    } else {
      ElMessage.warning('住院死亡率后端结果暂不可用，已使用演示数据')
    }
  }
}

onMounted(() => {
  loadBackendAnalysisIndicators()
  refreshMortalityAnalysis()
})

watch(indicatorCode, () => {
  selectedIndicatorCode.value = indicatorCode.value
  analysisPeriodRange.value = initialAnalysisPeriodRange()
  reportPeriodRange.value = initialReportPeriodRange()
  period.value = '月度'
  refreshMortalityAnalysis()
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
  if (typeof localStorage === 'undefined' || !Array.isArray(range) || range.length !== 2) return
  const value = JSON.stringify({ periodStart: String(range[0]), periodEnd: String(range[1]) })
  if (indicatorId) localStorage.setItem(`idmp:analysis-period:indicator:${indicatorId}`, value)
  if (versionId) localStorage.setItem(`idmp:analysis-period:version:${versionId}`, value)
}

function formatAnalysisPeriod(result) {
  if (!result?.periodStart || !result?.periodEnd) return ''
  return `${String(result.periodStart).slice(0, 10)} ～ ${String(result.periodEnd).slice(0, 10)}`
}

function formatRange(range) {
  return Array.isArray(range) && range.length === 2 ? formatPeriodLabel(range[0], range[1]) : ''
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
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  padding: 13px 16px;
  background: var(--idmp-surface-subtle, #f8fafc);
}

.report-context__title {
  display: grid;
  flex: 1 1 220px;
  gap: 2px;
}

.report-context__title > span {
  color: var(--idmp-text-primary);
  font-size: 14px;
  font-weight: 600;
}

.report-context__title > small,
.report-context__hint {
  color: var(--idmp-text-secondary, #667085);
  font-size: 12px;
}

.report-context__hint {
  flex-basis: 100%;
}

.report-period-picker {
  width: 280px;
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
  align-items: center;
  justify-content: center;
  flex-direction: column;
  grid-column: span 2;
  min-width: 0;
  min-height: 96px;
  padding: var(--idmp-space-4);
  text-align: center;

  span,
  small {
    display: block;
    color: var(--idmp-text-helper);
    font-size: 13px;
    line-height: 18px;
  }

  strong {
    display: block;
    min-width: 0;
    margin: var(--idmp-space-2) 0 var(--idmp-space-1);
    color: var(--idmp-text-primary);
    font-size: 22px;
    font-weight: 650;
    line-height: 26px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}

.metric-summary-grid.is-1 .metric-summary-card { grid-column: span 6; }
.metric-summary-grid.is-2 .metric-summary-card,
.metric-summary-grid.is-4 .metric-summary-card { grid-column: span 3; }
.metric-summary-grid.is-5 .metric-summary-card:nth-child(-n + 2) { grid-column: span 3; }

.scene-comparison {
  display: flex;
  min-height: 80px;
  align-items: center;
  gap: 22px;
  margin-bottom: 16px;
  padding: 13px 16px;
}

.scene-comparison__label {
  display: flex;
  flex: 0 0 178px;
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
  flex-wrap: wrap;
}

.trend-period-picker {
  width: 280px;
}

.trend-controls :deep(.el-radio-group) {
  margin-left: auto;
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
    gap: 14px;
  }

  .scene-comparison__label {
    flex-basis: 158px;
  }

  .scene-tag {
    grid-template-columns: minmax(76px, 1fr) auto;

    em {
      display: none;
    }
  }
}

@media (max-width: 1180px) {
  .metric-overview {
    grid-template-columns: 1fr;
  }

  .primary-metric {
    min-height: 150px;
  }

  .trend-controls {
    justify-content: flex-start;
  }

  .trend-controls :deep(.el-radio-group) {
    margin-left: 0;
  }
}

@media (max-width: 720px) {
  .report-context :deep(.el-date-editor) {
    width: 100%;
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

  .trend-controls :deep(.el-date-editor) {
    width: 100%;
  }
}
</style>
