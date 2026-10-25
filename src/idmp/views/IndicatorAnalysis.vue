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
          <el-button v-access="['GET', '/calc/batches/1']" :disabled="!selectedBackendIndicator || !currentIndicatorVersionId" @click="showDataDiagnostics = true">计算诊断</el-button>
          <el-button v-access="['POST', '/analysis/indicators/1/export/pdf']" :icon="Download" :loading="pdfExportLoading" :disabled="!canExportPdf" @click="exportAnalysisPdf">导出PDF</el-button>
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
      <div class="instant-query-panel__controls">
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
        <RuntimeParameterFields v-if="reportQueryMode === 'INSTANT' && indicatorRuntimeParameters.length" v-model="indicatorRuntimeParameterValues" :declarations="indicatorRuntimeParameters" :show-metadata="false" @change="invalidateReportSummary()" />
        <div class="instant-query-panel__actions">
          <el-button type="primary" :loading="rangeSummaryLoading" :disabled="reportQueryMode === 'INSTANT' && indicatorRuntimeParameterConflicts.length > 0" @click="applyReportPeriod">查询</el-button>
        </div>
      </div>
      <el-alert v-if="reportQueryMode === 'INSTANT' && indicatorRuntimeParameterConflicts.length" type="error" show-icon :closable="false" :title="`存在不兼容的同名参数：${indicatorRuntimeParameterConflicts.map(item => item.code).join('、')}`" />
      <div v-if="runtimeQueryResult" class="runtime-query-result">
        <div class="runtime-query-result__summary">
          <el-tag :type="runtimeQueryResult.executionMode === 'AD_HOC_SOURCE' ? 'warning' : 'success'">{{ runtimeQueryExecutionModeLabel }}</el-tag>
          <span>参数快照：{{ runtimeQueryParameterSnapshot }}</span>
        </div>
        <el-collapse v-model="runtimeQueryExpanded">
          <el-collapse-item name="results" :title="`查询结果明细（${runtimeQueryRows.length} 条）`">
            <el-table :data="runtimeQueryRows" border max-height="420" empty-text="当前条件没有结果">
              <el-table-column v-for="column in runtimeQueryColumns" :key="column" :prop="column" :label="column" min-width="140">
                <template #default="{ row }">{{ formatRuntimeQueryCell(row[column]) }}</template>
              </el-table-column>
            </el-table>
          </el-collapse-item>
        </el-collapse>
      </div>
    </section>
    <section v-if="analysisNotice" class="analysis-state-notice" :class="`is-${analysisAvailability.status.toLowerCase()}`">
      <div><strong>{{ analysisNotice.title }}</strong><p>{{ analysisNotice.message }}</p></div>
      <el-button v-if="analysisAvailability.status === 'NO_DATA' && isCompleteDateRange(analysisPeriodRange)" size="small" type="primary" plain @click="clearTrendPeriod">查看全部已有周期</el-button>
      <el-button v-else size="small" @click="showDataDiagnostics = true">查看计算诊断</el-button>
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

    <section class="surface-card analysis-panel">
      <el-tabs v-model="activeTab" class="analysis-tabs">
        <el-tab-pane label="趋势分析" name="trend">
          <div class="trend-toolbar">
            <div>
              <h2>指标变化趋势</h2>
              <p>{{ hasPeerTrend ? '展示本院实际值与同级医院均值的周期变化' : '展示本院实际值的周期变化；同级医院基准数据暂未接入' }}</p>
            </div>
            <div v-if="backendAnalysisGranularity !== 'STATIC'" class="trend-controls">
              <div class="date-range-fields trend-period-picker" aria-label="趋势时间范围"><el-date-picker v-model="trendMonthRange" type="monthrange" unlink-panels format="YYYY-MM" value-format="YYYY-MM" range-separator="至" start-placeholder="开始月份" end-placeholder="结束月份" size="small" /></div>
              <el-tag v-if="isSourceDefaultTrendRange" size="small" type="info" effect="plain">源数据可用范围</el-tag>
              <el-button size="small" type="primary" @click="applyTrendConditions">应用</el-button>
              <el-button size="small" :disabled="!trendPeriodDraft.some(Boolean) && !analysisPeriodRange.some(Boolean)" @click="clearTrendPeriod">全部时间</el-button>
              <el-radio-group v-model="period" size="small" aria-label="趋势统计粒度" @change="applyTrendGranularity">
                <el-radio-button v-for="item in analysisPeriodOptions" :key="item" :value="item">{{ item }}</el-radio-button>
              </el-radio-group>
            </div>
          </div>
          <el-collapse v-if="trendGrainFields.length" v-model="trendAdvancedExpanded" class="trend-advanced-filters">
            <el-collapse-item name="grain">
              <template #title>
                <span>高级筛选{{ Object.keys(trendGrainApplied).length ? '（已应用）' : '' }}</span>
                <el-tooltip content="按一组业务维度查看趋势；请选择完整组合，或清空全部条件查看整体趋势。" placement="top">
                  <span class="trend-advanced-help" tabindex="0" aria-label="高级筛选使用说明" @click.stop>说明</span>
                </el-tooltip>
              </template>
              <div class="trend-advanced-fields">
                <div v-for="field in trendGrainMetadata" :key="field.code" class="trend-grain-field">
                  <label :for="`trend-grain-${field.code}`" :title="field.code">{{ field.label }}</label>
                  <el-select
                    :id="`trend-grain-${field.code}`"
                    v-model="trendGrainDraft[field.code]"
                    filterable remote clearable
                    :remote-method="search => loadTrendGrainOptions(field.code, search)"
                    :loading="trendGrainLoading[field.code]"
                    placeholder="全部"
                    size="small"
                  >
                    <el-option v-for="item in trendGrainOptions(field.code)" :key="item.value" :label="item.label" :value="item.value">
                      <span>{{ item.label }}</span>
                      <small v-if="item.label !== item.value" class="trend-grain-option-code">{{ item.value }}</small>
                    </el-option>
                  </el-select>
                </div>
                <div class="trend-advanced-actions">
                  <el-button size="small" type="primary" @click="applyTrendConditions">应用筛选</el-button>
                  <el-button size="small" @click="clearTrendGrainFilters">清空筛选</el-button>
                </div>
              </div>
            </el-collapse-item>
          </el-collapse>
          <div v-if="!trendLoading && !trendTableRows.length && isCompleteDateRange(analysisPeriodRange)" class="trend-empty-guidance">
            <span>所选时间段没有可展示的趋势点。可查看该指标全部已生成周期。</span>
            <el-button link type="primary" @click="clearTrendPeriod">查看全部已有周期</el-button>
          </div>
          <IdmpChart
            :option="trendOption"
            :loading="trendLoading"
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
          <div v-if="backendAnalysisGranularity !== 'STATIC' && selectedBackendIndicator" class="rank-period-toolbar">
            <el-radio-group v-model="rankGranularity" size="small" aria-label="排名统计粒度" @change="loadRankPeriods()">
              <el-radio-button v-for="item in DRILL_GRANULARITIES" :key="item.value" :value="item.value">{{ item.label }}</el-radio-button>
            </el-radio-group>
            <el-select v-model="rankSelectedPeriod" filterable size="small" class="rank-period-select"
              aria-label="排名统计周期" :placeholder="rankPeriodPlaceholder" :loading="rankLoading"
              :disabled="!rankPeriodOptions.length" @change="loadSelectedRankPeriod">
              <el-option v-for="item in rankPeriodOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </div>
          <div class="table-heading">
            <div>
              <h2>科室指标排名</h2>
              <p v-if="hasBackendRankData">{{ rankPeriodDescription }}，按 {{ currentProfile.name }} 由高到低排列。</p>
              <p v-else>{{ '当前指标暂无正式科室维度结果。' }}</p>
            </div>
            <StatusBadge :status="hasBackendRankData ? 'ACTIVE' : 'NO_DATA'" :label="hasBackendRankData ? '科室正式结果' : '暂无正式数据'" tone="neutral" />
          </div>
          <StatePanel v-if="rankLoading" type="loading" title="正在读取科室排名" />
          <StatePanel v-else-if="rankErrorMessage" type="error" title="科室排名加载失败" :description="rankErrorMessage">
            <template #actions><el-button size="small" @click="retryRankPeriod">重试</el-button></template>
          </StatePanel>
          <StatePanel v-else-if="rankInitialized && !rankPeriodOptions.length" type="empty" :title="`暂无${rankGranularityLabel}正式结果`" description="该粒度尚未生成正式计算结果。" />
          <div v-else class="table-scroll rank-table-scroll">
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
          <IndicatorDrillAnalysis
            v-if="selectedBackendIndicator && backendAnalysisGranularity !== 'STATIC'"
            ref="drillExplorerRef"
            :indicator-id="selectedBackendIndicator.id || selectedBackendIndicator.indicatorId"
            :indicator-version-id="currentIndicatorVersionId"
            :indicator-name="currentProfile.name"
            :filters="reportFilters"
            :enabled="activeTab === 'drill'"
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
            :result-id="drillResultId"
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
            {{ analysisErrorMessage || '当前指标尚无可下钻的已激活结果；待结果批次生成后将自动显示组织、疾病和因子下钻路径。' }}
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
          <article v-for="operand in indicatorDataExplanation.operands" :key="operand.role" class="formula-operand">
            <span>{{ operand.role === 'NUMERATOR' ? '分子' : operand.role === 'DENOMINATOR' ? '分母' : '参与因子' }}</span>
            <strong>{{ operand.factorNames.join('、') || '-' }}</strong>
            <p>因子版本：{{ operand.factorVersionIds.join('、') || '-' }}</p>
            <template v-if="operand.role !== 'FACTOR'">
              <div class="formula-operand__result"><span>本期结果</span><strong>{{ formatExplanationOperandValue(operand) }}</strong></div>
              <p v-if="!operand.hasResultValue">当前正式结果未返回{{ operand.role === 'NUMERATOR' ? '分子' : '分母' }}值。</p>
            </template>
          </article>
        </div>
        <p v-else>当前指标版本尚未返回公式定义，暂无法识别分子、分母因子。</p>
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
import { canRequest } from '@/idmp/auth/session'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '@/idmp/utils/message'
import { Download } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import ResultAvailabilityPanel from '@/idmp/components/ResultAvailabilityPanel.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import RuntimeParameterFields from '@/idmp/components/RuntimeParameterFields.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import IndicatorDrillAnalysis from '@/idmp/features/analysis/IndicatorDrillAnalysis.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchIndicatorAnalysis, fetchIndicatorRangeSummary, fetchIndicatorAvailablePeriod, fetchIndicatorGrainOptions, fetchAllIndicators, fetchIndicatorVersion, fetchAllIndicatorVersions, queryIndicatorSummary } from '@/idmp/api/modules/indicators'
import { fetchFactorVersion } from '@/idmp/api/modules/factors'
import { collectFormulaFactorVersionIds, createIndicatorDataExplanation, extractIndicatorFormula, normalizeIndicatorInstantSummary } from '@/idmp/api/adapters/indicator'
import { deriveDrillPathResultIds } from '@/idmp/api/adapters/drill'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { fetchDepartmentNames } from '@/idmp/api/modules/departments'
import { isDepartmentCodeField } from '@/idmp/features/shared/departmentDictionary.js'
import { resolveResultAvailability } from '@/idmp/features/analysis/resultAvailability'
import { resolveIndicatorCalculationMode } from '@/idmp/features/analysis/calculationMode'
import { departmentAchievement, departmentDrillContext, loadDepartmentComparisons, normalizeDepartmentComparisons, resolveAnalysisDrillPaths } from '@/idmp/features/analysis/departmentRanking'
import { fetchDrillPathVersion } from '@/idmp/api/modules/meta'
import { DRILL_GRANULARITIES } from '@/idmp/features/analysis/drillPeriods'
import { useAnalysisPeriod } from '@/idmp/features/analysis/useAnalysisPeriod'
import CalculationDiagnostics from '@/idmp/features/analysis/CalculationDiagnostics.vue'
import { loadTrendGrainMemberNames, namedTrendGrainOptions, trendGrainField, trendGrainNames } from '@/idmp/features/analysis/trendGrain.js'
import { getStatusLabel } from '@/idmp/design/status'
import { periodOptions } from '@/idmp/features/analysis/indicatorProfiles'
import { resolvePrimaryAnalysisOverview } from '@/idmp/features/dashboard/visualization'
import { buildSqlRuntimeParameterValues, collectSqlRuntimeParameters, validateSqlRuntimeParameterValues } from '@/idmp/api/adapters/sqlImport'
import { exportIndicatorAnalysisPdf } from '@/idmp/api/modules/indicators'
import { analysisPdfFilename, buildAnalysisPdfReport, downloadAnalysisPdf, renderAnalysisChartPng } from '@/idmp/features/analysis/pdfReport'
import { analysisReportContext, resolveReportPeriod, reportPeriodQuery, normalizeAnalysisGranularity, shiftReportDate, analysisFilterParams, analysisFilters, analysisRouteKey } from '@/idmp/features/analysis/reportPeriod.js'
import { buildReportSummaryRequest } from '@/idmp/features/analysis/reportQuery.js'
import { reportOverview, reportProvenance } from '@/idmp/features/analysis/reportResult.js'

const route = useRoute()
const router = useRouter()
const activeTab = ref('trend')
const period = ref('月度')
const initialReportContext = analysisReportContext(route.query)
const reportGranularity = ref(initialReportContext.granularity)
const reportSummaryGranularity = ref(initialReportContext.summaryGranularity)
const reportSelection = computed(() => resolveReportPeriod(reportPeriodRange.value,
  reportGranularity.value === 'STATIC' ? 'STATIC' : reportSummaryGranularity.value))
const reportQueryMode = computed(() => reportSelection.value.mode)
const reportDirty = ref(false)
const reportFilterParams = computed(() => analysisFilterParams(route.query))
const reportFilters = computed(() => analysisFilters(route.query))
const hasReportFilters = computed(() => Object.keys(reportFilters.value).length > 0)
let localReportRouteKey = ''
const reportResultModeLabel = computed(() => rangeSummary.value?.executionMode === 'FORMAL_RESULTS' ? '正式结果汇总' : '即时计算')
const backendAnalysis = ref(null)
const rangeSummary = ref(null)
const rangeSummaryLoading = ref(false)
const rangeSummaryErrorMessage = ref('')
let rangeSummaryRequestSequence = 0
const trendBackendAnalysis = ref(null)
const trendLoading = ref(false)
const backendIndicatorVersion = ref(null)
const departmentNamesByCode = ref({})
const formulaFactorVersions = ref({})
const availablePeriod = ref(null)
let analysisRefreshSequence = 0
let trendRefreshSequence = 0
const analysisErrorMessage = ref('')
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
const runtimeQueryResult = ref(null)
const runtimeQueryExpanded = ref([])
const reportParameterSnapshot = ref({})
const drillExplorerRef = ref()
const staticDrillExplorerRef = ref()
const pdfExportLoading = ref(false)
const canExportPdf = computed(() => Boolean(selectedBackendIndicator.value && currentIndicatorVersionId.value)
  && !analysisLoading.value && !rangeSummaryLoading.value && !trendLoading.value && !reportDirty.value && !rangeSummaryErrorMessage.value)

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
  }, resolveAnalysisPerformanceTarget(currentIndicatorVersionId.value, trendBackendAnalysis.value, backendAnalysis.value))
})
const backendAnalysisGranularity = computed(() => reportGranularity.value)
const indicatorRuntimeParameters = computed(() => collectSqlRuntimeParameters(
  (Array.isArray(backendIndicatorVersion.value?.factorRuntimeParameters) ? backendIndicatorVersion.value.factorRuntimeParameters : [])
    .map(group => ({ ...group, key: group.factorCode || group.factorVersionId }))
))
const indicatorRuntimeParameterConflicts = computed(() => indicatorRuntimeParameters.value.filter(item => item.conflict))
const runtimeQueryRows = computed(() => Array.isArray(runtimeQueryResult.value?.rows) ? runtimeQueryResult.value.rows : [])
const runtimeQueryColumns = computed(() => [...new Set(runtimeQueryRows.value.flatMap(row => Object.keys(row || {})))])
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
const hasLiveAnalysisResponse = computed(() => Boolean((backendAnalysis.value || rangeSummary.value) && selectedBackendIndicator.value))
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
    NOT_CALCULABLE: '该报告期的数据不满足计算条件',
    CALCULATION_ERROR: '该报告期的指标计算未完成',
    COVERAGE_INCOMPLETE: '正式结果未覆盖整个报告期',
    UNSUPPORTED_ROLLUP: '现有正式结果无法精确汇总',
    RESULT_LIMIT_EXCEEDED: '报告期内正式结果过多',
    VALUE_NOT_CALCULABLE: '该报告期的指标值无法计算',
    UNKNOWN: '暂时无法确认该报告期是否可计算'
  }[availability.status] || '该报告期暂无可展示结果'
  return { title, message: availability.message }
})
const backendDepartmentComparisons = computed(() =>
  normalizeDepartmentComparisons(
    (rankInitialized.value ? rankAnalysis.value : backendAnalysis.value)?.departmentComparison,
    rankInitialized.value ? [] : backendAnalysis.value?.dimensionComparison,
    departmentNamesByCode.value
  )
)
const backendDimensionResults = computed(() =>
  (Array.isArray(backendAnalysis.value?.dimensionComparison) ? backendAnalysis.value.dimensionComparison : [])
    .filter((item) => Object.keys(item?.dimensions || {}).length > 0)
)
const hasBackendRankData = computed(() => backendDepartmentComparisons.value.length > 0)
const backendTrend = computed(() => {
  const fromTrendRequest = createTrendFromBackendAnalysis(trendBackendAnalysis.value, currentProfile.value.unit)
  if (fromTrendRequest) return fromTrendRequest
  // 独立趋势查询暂时无响应时，仅在没有时间/组合粒度筛选的情况下复用概览结果。
  if ((!isCompleteDateRange(analysisPeriodRange.value) || isSourceDefaultTrendRange.value)
    && !Object.keys(trendGrainApplied.value).length) {
    return createTrendFromBackendAnalysis(backendAnalysis.value, currentProfile.value.unit)
  }
  return null
})
const currentTrend = computed(() => backendTrend.value || emptyTrend())
// 同级医院均值必须来自正式分析接口；后端接入 peerTrend 后再由适配层填充 backendTrend.peer。
const hasPeerTrend = computed(() => Boolean(backendTrend.value?.peer?.some(isChartNumber)))
const primaryMetric = computed(() => {
  if (reportDirty.value) return { label: `${formatRange(reportPeriodRange.value)}指标值`, value: '-', tone: 'neutral', status: 'PENDING_QUERY', statusLabel: '待查询', periodLabel: formatRange(reportPeriodRange.value) }
  if (rangeSummaryLoading.value || rangeSummaryErrorMessage.value) return {
    label: `${formatRange(reportPeriodRange.value)}指标值`, value: '-', tone: 'neutral',
    status: rangeSummaryLoading.value ? 'LOADING' : 'UNKNOWN', statusLabel: rangeSummaryLoading.value ? '查询中' : '查询失败',
    periodLabel: formatRange(reportPeriodRange.value)
  }
  if (rangeSummary.value) {
    const result = rangeSummary.value
    const ready = result.status === 'READY'
    return {
      label: `${rangeSummaryPeriodLabel.value}指标值`,
      value: ready ? (isUsableDisplayValue(result.displayValue) ? result.displayValue : formatMetricValue(result.value, currentProfile.value.unit)) : '-',
      tone: ready && result.qualityStatus === 'PASSED' ? 'success' : 'neutral',
      status: ready ? 'ACTIVE' : result.status,
      statusLabel: ready ? reportResultModeLabel.value : '区间结果不可用',
      periodLabel: rangeSummaryPeriodLabel.value
    }
  }
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
  if (reportDirty.value) return [{ label: '查询状态', value: '待查询' }]
  if (rangeSummaryLoading.value || rangeSummaryErrorMessage.value) return [{ label: '查询状态', value: rangeSummaryLoading.value ? '查询中' : '查询失败', description: rangeSummaryErrorMessage.value }]
  if (selectedBackendIndicator.value) {
    if (rangeSummary.value) {
      const result = rangeSummary.value
      if (result.status !== 'READY') return [
        { label: reportResultModeLabel.value, value: '不可用', description: result.message || '未返回可用结果' }
      ]
      return [
        { label: '分子', value: result.numeratorValue == null ? '-' : formatCount(result.numeratorValue), description: '计入事件数' },
        { label: '分母', value: result.denominatorValue == null ? '-' : formatCount(result.denominatorValue), description: '统计对象总量' },
        { label: '质量状态', value: displayStatus(result.qualityStatus), tone: result.qualityStatus === 'PASSED' ? 'success' : 'warning' },
        { label: '结果来源', value: result.executionMode === 'AD_HOC_SOURCE' ? '源数据即时计算' : '正式结果复用' }
      ]
    }
    const metrics = []
    if (!backendAnalysis.value) {
      return [
        { label: '分析状态', value: analysisLoading.value || rangeSummaryLoading.value ? '正在读取' : '暂无正式结果', description: analysisErrorMessage.value || '后端尚未返回可展示的指标结果' },
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
    return [...comparisons].sort((left, right) => {
      const leftValue = Number(left.value)
      const rightValue = Number(right.value)
      if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue !== rightValue) return rightValue - leftValue
      return String(left.departmentName).localeCompare(String(right.departmentName), 'zh-CN')
    }).map((item, index) => ({
      rank: index + 1,
      departmentKey: item.departmentCode,
      department: item.departmentName,
      hospitalCode: item.dimensions?.hospital_code || item.dimensions?.HOSPITAL_CODE || '',
      departmentCode: item.departmentCode,
      rate: item.displayValue || (item.value != null ? String(item.value) : '-'),
      numerator: item.numeratorValue == null ? '-' : formatCount(item.numeratorValue),
      denominator: item.denominatorValue == null ? '-' : formatCount(item.denominatorValue),
      change: '-',
      status: departmentAchievement(item, (rankInitialized.value ? rankAnalysis.value : backendAnalysis.value) || {}),
      drillContext: departmentDrillContext(item, backendIndicatorVersion.value?.drillConfig?.drillPaths || [],
        rankInitialized.value ? rankGranularity.value : backendAnalysisGranularity.value)
    }))
  }
  return []
})

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
  if (rangeSummary.value) return '后端未返回更新时间'
  const context = backendAnalysis.value?.resultContext || {}
  return hasBackendAnalysisData.value ? firstPresent(context.activatedAt, '后端未返回更新时间') : '-'
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
  drillPathResultIds.value.ORGANIZATION || drillPathResultIds.value.DISEASE ||
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
    get enabled() { return rankPeriodProps.value.enabled }
  }, async (indicatorId, params) => {
    const data = await fetchIndicatorAnalysis(indicatorId, params)
    const paths = backendIndicatorVersion.value?.drillConfig?.drillPaths || []
    return { ...data, departmentComparison: await loadDepartmentComparisons(data, paths, searchResultDrill, analysisFilters(params)) }
  })
const rankPeriodDescription = computed(() => rankInitialized.value
  ? `${rankGranularityLabel.value} · ${rankSelectedPeriodLabel.value || '暂无周期'} · 科室正式结果`
  : `科室正式结果 · ${formatAnalysisPeriod(backendAnalysis.value?.overview) || '静态结果'}`)

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
  if (isChartNumber(currentProfile.value.markLineValue)) {
    actualSeries.markLine = {
      silent: true,
      symbol: 'none',
      // ECharts otherwise rounds small raw-ratio targets (e.g. 0.003) to zero.
      precision: -1,
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

const rankStatusTone = (status) => {
  if (status === '超标' || status === '未达标') return 'danger'
  if (status === '预警') return 'warning'
  return status === '达标' ? 'success' : 'neutral'
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

async function exportAnalysisPdf() {
  if (!canExportPdf.value || pdfExportLoading.value) return
  pdfExportLoading.value = true
  try {
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
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '-'
}

function formatExplanationOperandValue(operand) {
  if (!operand?.hasResultValue) return '-'
  const value = formatCount(operand.value)
  return value === '-' ? '-' : `${value}${operand.unit || ''}`
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
    range: isSourceDefaultTrendRange.value
      ? `源数据可用范围：${formatPeriodLabel(analysisPeriodRange.value[0], analysisPeriodRange.value[1])}`
      : isCompleteDateRange(analysisPeriodRange.value)
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
  if (normalizedGranularity === 'STATIC') return '静态结果'
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
  if (!currentIndicatorVersionId.value) return ElMessage.warning('当前指标没有可查询的已发布版本')
  const temporal = backendAnalysisGranularity.value !== 'STATIC'
  if (temporal) {
    if (!validateOptionalDateRange(reportPeriodRange.value, '报告期')) return
    if (!isCompleteDateRange(reportPeriodRange.value)) return ElMessage.warning('请选择完整的报告期范围')
  }
  const parameterMessage = reportQueryMode.value === 'INSTANT' && validateSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value)
  if (parameterMessage) return ElMessage.warning(parameterMessage)
  const query = { ...route.query, ...reportPeriodQuery({ ...reportSelection.value, granularity: backendAnalysisGranularity.value }) }
  if (temporal && analysisRouteKey(query) !== analysisRouteKey(route.query)) {
    reportSummaryGranularity.value = reportSelection.value.summaryGranularity
    localReportRouteKey = analysisRouteKey(query)
    await router.replace({ path: '/analysis', query })
  }
  void loadRangeSummary()
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
  if (!request) return
  if (!canRequest(request.method, request.path)) {
    rangeSummaryErrorMessage.value = '当前账号没有所选查询方式的访问权限'
    return
  }
  const requestSequence = rangeSummaryRequestSequence
  rangeSummaryLoading.value = true
  const [periodStart = '', periodEnd = ''] = request.range
  try {
    if (request.mode === 'FORMAL') {
      const result = await fetchIndicatorRangeSummary(request.id, request.params)
      if (requestSequence === rangeSummaryRequestSequence) {
        rangeSummary.value = { ...result, executionMode: 'FORMAL_RESULTS' }
        reportParameterSnapshot.value = {}
      }
      return
    }
    const result = await queryIndicatorSummary(request.id, request.payload)
    if (requestSequence === rangeSummaryRequestSequence) {
      rangeSummary.value = normalizeIndicatorInstantSummary(result, periodStart, periodEnd)
      reportParameterSnapshot.value = result.parameterSnapshot || request.payload.parameters || {}
      if (indicatorRuntimeParameters.value.length) runtimeQueryResult.value = result
    }
  } catch (error) {
    if (requestSequence === rangeSummaryRequestSequence) {
      const message = String(error?.message || '')
      const migrationHint = message.includes('SQL业务参数不支持冒号写法')
        ? '；该指标使用了旧式 SQL 参数，请改为 [[AND 字段 = {{参数名}}]] 后重新导入并发布'
        : ''
      const label = request.mode === 'FORMAL' ? '正式区间查询' : '即时查询'
      rangeSummaryErrorMessage.value = message ? `${label}失败：${message}${migrationHint}` : `${label}失败，请核对查询条件后重试`
      ElMessage.warning(rangeSummaryErrorMessage.value)
    }
  } finally {
    if (requestSequence === rangeSummaryRequestSequence) rangeSummaryLoading.value = false
  }
}

function invalidateReportSummary(dirty = true) {
  reportDirty.value = dirty
  ++rangeSummaryRequestSequence
  rangeSummary.value = null
  rangeSummaryErrorMessage.value = ''
  rangeSummaryLoading.value = false
  runtimeQueryResult.value = null
  runtimeQueryExpanded.value = []
  reportParameterSnapshot.value = {}
}

function formatRuntimeQueryCell(value) {
  if (value === undefined || value === null || value === '') return '-'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
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
  const previousRange = [...analysisPeriodRange.value]
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
    router.replace({ path: '/analysis', query })
  }
  if (JSON.stringify(previousRange) === JSON.stringify(analysisPeriodRange.value)
    && wasSourceDefault === keepSourceDefault) refreshTrendAnalysis()
  else refreshIndicatorAnalysis({ preserveRangeSummary: true })
}

function applyTrendGranularity() {
  refreshTrendAnalysis()
}

async function refreshTrendAnalysis() {
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator) return
  const requestSequence = ++trendRefreshSequence
  const analysisSequence = analysisRefreshSequence
  const granularity = backendAnalysisGranularity.value === 'STATIC' ? 'STATIC' : trendAnalysisGranularity.value
  const params = buildTrendAnalysisParams(analysisPeriodRange.value, currentIndicatorVersionId.value, granularity)
  trendLoading.value = true
  trendBackendAnalysis.value = { dataAvailable: false, trend: [] }
  try {
    const result = await fetchIndicatorAnalysis(String(backendIndicator.id || backendIndicator.indicatorId), params)
    if (requestSequence === trendRefreshSequence && analysisSequence === analysisRefreshSequence) {
      trendBackendAnalysis.value = result
    }
  } catch (error) {
    if (requestSequence === trendRefreshSequence && analysisSequence === analysisRefreshSequence) {
      trendBackendAnalysis.value = { dataAvailable: false, trend: [] }
      ElMessage.warning(error?.message ? `趋势结果暂不可用：${error.message}` : '趋势结果暂不可用')
    }
  } finally {
    if (requestSequence === trendRefreshSequence && analysisSequence === analysisRefreshSequence) {
      trendLoading.value = false
    }
  }
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
      fetchAllIndicators(),
      fetchAllIndicatorVersions({ publicationStatus: 'PUBLISHED' })
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
      await refreshIndicatorAnalysis()
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

function emptyTrend() {
  return { labels: [], actual: [], peer: [] }
}

function resolveAnalysisPerformanceTarget(versionId, ...analyses) {
  const response = analyses.find(analysis => analysis?.indicatorVersionId != null
    && String(analysis.indicatorVersionId) === String(versionId)
    && Object.hasOwn(analysis, 'performanceTarget'))
  const target = response?.performanceTarget
  return target && String(target.indicatorVersionId) === String(versionId) ? target : null
}

function createGenericAnalysisProfile(indicator, performanceTarget) {
  const name = indicator?.name || indicator?.code || '未命名指标'
  const unit = indicator?.unit || indicator?.displayUnit || ''
  const targetValue = isUsableRawValue(performanceTarget?.targetValue)
    && String(performanceTarget.targetValue).trim() !== ''
    ? normalizeTrendValue({ value: performanceTarget.targetValue }, unit) : null
  return {
    code: getBackendIndicatorKey(indicator),
    name,
    unit,
    targetLabel: targetValue === null ? '目标值未配置'
      : `目标值：${isUsableDisplayValue(performanceTarget.targetDisplayValue)
        ? performanceTarget.targetDisplayValue : formatMetricValue(performanceTarget.targetValue, unit)}`,
    markLineValue: targetValue,
    yAxisMax: null,
    summary: [{ label: '当前指标值', value: '-', tone: 'neutral' }],
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

async function refreshIndicatorAnalysis({ preserveRangeSummary = false } = {}) {
  const refreshSequence = ++analysisRefreshSequence
  if (!preserveRangeSummary) invalidateReportSummary(false)
  const trendSequence = ++trendRefreshSequence
  trendLoading.value = false
  analysisLoading.value = true
  backendAnalysis.value = null
  trendBackendAnalysis.value = null
  backendIndicatorVersion.value = null
  departmentNamesByCode.value = {}
  formulaFactorVersions.value = {}
  availablePeriod.value = null
  analysisErrorMessage.value = ''
  const backendIndicator = selectedBackendIndicator.value
  if (!backendIndicator) {
    analysisLoading.value = false
    return
  }
  const initialVersionId = currentIndicatorVersionId.value
  try {
    if (initialVersionId) {
      try {
        const version = await fetchAnalysisIndicatorVersion(initialVersionId)
        if (refreshSequence !== analysisRefreshSequence) return
        backendIndicatorVersion.value = version
      } catch {
        if (refreshSequence !== analysisRefreshSequence) return
        backendIndicatorVersion.value = null
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
      reportGranularity.value = normalizeAnalysisGranularity(route.query.granularity) === 'STATIC' ? 'MONTHLY' : normalizeAnalysisGranularity(route.query.granularity)
    }
    if (calculationMode !== 'STATIC') void loadAvailablePeriod(initialVersionId, refreshSequence)

    const granularity = backendAnalysisGranularity.value
    const backendIndicatorId = String(backendIndicator.id || backendIndicator.indicatorId)
    const useRangeSummary = !preserveRangeSummary && calculationMode !== 'STATIC' && isCompleteDateRange(reportPeriodRange.value)
      && (reportQueryMode.value === 'FORMAL' || !validateSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value))
    if (useRangeSummary) void loadRangeSummary()

    const analysisParams = buildAnalysisParams(analysisPeriodRange.value)
    const trendParams = backendAnalysisGranularity.value === 'STATIC'
      ? buildTrendAnalysisParams([], currentIndicatorVersionId.value, 'STATIC')
      : buildTrendAnalysisParams(analysisPeriodRange.value, currentIndicatorVersionId.value, trendAnalysisGranularity.value)
    const [analysisData, trendResult] = await Promise.allSettled([
      granularity ? fetchIndicatorAnalysis(backendIndicatorId, analysisParams) : Promise.resolve(null),
      fetchIndicatorAnalysis(backendIndicatorId, trendParams),
    ])

    if (refreshSequence !== analysisRefreshSequence) return
    let resolvedAnalysisData = analysisData
    if (trendSequence === trendRefreshSequence) {
      let resolvedTrend = trendResult.status === 'fulfilled' ? trendResult.value : { dataAvailable: false, trend: [] }
      // 只恢复浏览器记住的旧范围；URL 中明确指定的筛选条件仍按用户选择执行。
      if (!resolvedTrend?.trend?.length && isCompleteDateRange(analysisPeriodRange.value)
        && !route.query.trendStart && !route.query.trendEnd && !Object.keys(trendGrainApplied.value).length) {
        try {
          const unfiltered = await fetchIndicatorAnalysis(backendIndicatorId,
            buildTrendAnalysisParams([], currentIndicatorVersionId.value, trendAnalysisGranularity.value))
          if (refreshSequence !== analysisRefreshSequence || trendSequence !== trendRefreshSequence) return
          if (unfiltered?.trend?.length) {
            resolvedTrend = unfiltered
            resolvedAnalysisData = { status: 'fulfilled', value: unfiltered }
            const sourceRange = sourceAvailableTrendRange(availablePeriod.value)
            analysisPeriodRange.value = sourceRange
            trendPeriodDraft.value = [...sourceRange]
            isSourceDefaultTrendRange.value = isCompleteDateRange(sourceRange)
            sourceTrendRangePending = !isSourceDefaultTrendRange.value
            forgetAnalysisPeriod(indicatorCode.value, currentIndicatorVersionId.value)
            ElMessage.info('原先记住的趋势时间段没有正式结果，已展示源数据可用范围内的正式结果')
          }
        } catch {
          // 继续展示原查询的可用性状态。
        }
      }
      trendBackendAnalysis.value = resolvedTrend
    }
    if (resolvedAnalysisData.status === 'rejected') {
      analysisErrorMessage.value = resolvedAnalysisData.reason?.message
        ? `指定周期正式结果暂不可用：${resolvedAnalysisData.reason.message}`
        : '指定周期尚无已激活正式结果，请先生成正式计算批次。'
    }
    if (resolvedAnalysisData?.status === 'fulfilled' && resolvedAnalysisData?.value) {
      backendAnalysis.value = resolvedAnalysisData.value
      void loadDepartmentNames(resolvedAnalysisData.value, refreshSequence)
      if (!trendBackendAnalysis.value) trendBackendAnalysis.value = resolvedAnalysisData.value
      if (resolvedAnalysisData.value?.granularity) reportGranularity.value = String(resolvedAnalysisData.value.granularity)
      if (backendAnalysisGranularity.value !== 'STATIC' && !reportPeriodRange.value.length && resolvedAnalysisData.value?.overview?.periodStart && resolvedAnalysisData.value?.overview?.periodEnd) {
        reportPeriodRange.value = [
          normalizeDateValue(resolvedAnalysisData.value.overview.periodStart),
          shiftReportDate(resolvedAnalysisData.value.overview.periodEnd, -1)
        ]
      }
      const versionId = String(
        resolvedAnalysisData.value.indicatorVersionId ||
        currentIndicatorVersionId.value
      )
      if (versionId) {
        if (backendIndicator && versionId !== initialVersionId) {
          try {
            const version = await fetchAnalysisIndicatorVersion(versionId)
            if (refreshSequence !== analysisRefreshSequence) return
            backendIndicatorVersion.value = version
          } catch {
            if (refreshSequence !== analysisRefreshSequence) return
            backendIndicatorVersion.value = null
          }
        }
        // 分析响应中的版本优先级更高；若它与当前已发布版本不同，再按实际版本刷新。
        if (versionId !== initialVersionId && resolveIndicatorCalculationMode(backendIndicatorVersion.value, backendIndicator, route.query.granularity) !== 'STATIC') await loadAvailablePeriod(versionId, refreshSequence)
      }
    }

    if (backendIndicatorVersion.value) await loadAnalysisFormulaFactorVersions(backendIndicatorVersion.value, refreshSequence)

    if (refreshSequence !== analysisRefreshSequence) return
    analysisLoading.value = false
  } catch (error) {
    if (refreshSequence !== analysisRefreshSequence) return
    analysisLoading.value = false
    if (selectedBackendIndicator.value) {
      analysisErrorMessage.value = error?.message
        ? `指定周期正式结果暂不可用：${error.message}`
        : '指定周期尚无已激活正式结果，请先生成正式计算批次。'
      ElMessage.warning(analysisErrorMessage.value)
    }
  }
}

async function fetchAnalysisIndicatorVersion(versionId) {
  const version = await fetchIndicatorVersion(versionId)
  const formula = extractIndicatorFormula(version)
  const paths = await resolveAnalysisDrillPaths(version.drillConfig?.drillPaths || [], fetchDrillPathVersion)
  return { ...version, formula: formula || version?.formula || version?.formulaAst,
    drillConfig: { ...version.drillConfig, drillPaths: paths } }
}

async function loadAnalysisFormulaFactorVersions(version, refreshSequence) {
  const ids = collectFormulaFactorVersionIds(extractIndicatorFormula(version))
  if (!ids.length) {
    if (refreshSequence === analysisRefreshSequence) formulaFactorVersions.value = {}
    return
  }
  const responses = await Promise.allSettled(ids.map((id) => fetchFactorVersion(id)))
  if (refreshSequence !== analysisRefreshSequence) return
  formulaFactorVersions.value = Object.fromEntries(responses.flatMap((response, index) => (
    response.status === 'fulfilled' && response.value ? [[ids[index], response.value]] : []
  )))
}

async function loadDepartmentNames(analysis, refreshSequence) {
  try {
    const names = Object.fromEntries(await fetchDepartmentNames())
    if (refreshSequence === analysisRefreshSequence) departmentNamesByCode.value = names
  } catch {
    // 下钻名称不可用时，排名仍可显示正式结果中的科室编码和值。
  }
}

async function loadAvailablePeriod(versionId, refreshSequence) {
  if (!versionId || resolveIndicatorCalculationMode(backendIndicatorVersion.value, selectedBackendIndicator.value, route.query.granularity) === 'STATIC') return null
  try {
    const value = await fetchIndicatorAvailablePeriod(versionId)
    if (refreshSequence !== analysisRefreshSequence) return null
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
    // 不把范围探测失败伪装成“没有数据”；保留空值，由页面显示“暂未获取”。
    if (refreshSequence === analysisRefreshSequence) availablePeriod.value = null
    return null
  }
}

onMounted(loadBackendAnalysisIndicators)

watch(() => analysisRouteKey(route.query), key => {
  if (key === localReportRouteKey) { localReportRouteKey = ''; return }
  localReportRouteKey = ''
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
  runtimeQueryResult.value = null
  runtimeQueryExpanded.value = []
  period.value = '月度'
  refreshIndicatorAnalysis()
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
  if (backendAnalysisGranularity.value === 'STATIC') return '静态结果'
  if (!result?.periodStart || !result?.periodEnd) return ''
  return `${String(result.periodStart).slice(0, 10)} ～ ${String(result.periodEnd).slice(0, 10)}`
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

.trend-empty-guidance {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 12px 0;
  color: var(--idmp-text-secondary);
  font-size: 13px;
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

.scene-comparison.is-unlinked {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  min-height: 0;

  .scene-comparison__head { margin-bottom: 0; }
}

.scene-comparison__empty-inline {
  display: flex;
  flex: 1 1 280px;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  min-width: 0;
  color: var(--idmp-text-secondary);
  font-size: 13px;
  line-height: 22px;

  .el-button { flex-shrink: 0; }
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
  padding-right: 4px;
}

.trend-grain-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 170px;
  max-width: 230px;
  flex: 1 1 170px;
  font-size: 12px;
  color: var(--idmp-text-secondary);
}

.trend-advanced-filters { margin-bottom: 8px; }
.trend-advanced-filters :deep(.el-collapse-item__header) { height: 34px; line-height: 34px; }
.trend-advanced-filters :deep(.el-collapse-item__content) { padding-bottom: 8px; }
.trend-advanced-help { margin-left: 8px; color: var(--idmp-text-helper); font-size: 12px; font-weight: 400; cursor: help; }
.trend-advanced-fields { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
.trend-advanced-fields .trend-grain-field { flex: 0 1 300px; flex-direction: row; align-items: center; min-width: min(180px, 100%); max-width: min(320px, 100%); }
.trend-advanced-fields .trend-grain-field label { flex: 0 1 auto; max-width: 160px; overflow: visible; white-space: normal; overflow-wrap: anywhere; }
.trend-advanced-fields .trend-grain-field :deep(.el-select) { width: auto; min-width: 0; flex: 1 1 120px; }
.trend-advanced-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.trend-advanced-actions .el-button + .el-button { margin-left: 0; }

.trend-grain-field label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trend-grain-field :deep(.el-select) {
  min-width: 80px;
  flex: 1 1 110px;
}

.trend-grain-option-code {
  margin-left: 8px;
  color: var(--idmp-text-helper);
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

.rank-period-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
}

.rank-period-select {
  width: 200px;
  max-width: 100%;
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
  .instant-query-panel__controls { flex-wrap: wrap; }
  .instant-query-panel__controls :deep(.runtime-parameter-fields) { flex: 1 1 240px; }

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
