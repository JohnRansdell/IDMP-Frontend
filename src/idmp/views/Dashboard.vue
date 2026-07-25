<template>
  <div class="idmp-page dashboard-page">
    <PageHeader
      eyebrow="总览与分析"
      title="医疗质量指标总览"
      description="集中查看医院核心质量信号、趋势、预警与科室差异。点击指标可进入分析页继续下钻。"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': dashboardSourceMode === 'mixed' }">
          {{ dashboardSourceLabel }}
        </span>
        <span>数据期间：{{ period }}</span>
        <span>统计范围：{{ department }}</span>
      </template>
      <template #actions>
        <el-select v-model="period" class="dashboard-filter" aria-label="年度">
          <el-option label="2024年度" value="2024年度" />
          <el-option label="2024年Q4" value="2024年Q4" />
          <el-option label="2024年12月" value="2024年12月" />
        </el-select>
        <el-select v-model="department" class="dashboard-filter" aria-label="科室">
          <el-option label="全院" value="全院" />
          <el-option label="心外科" value="心外科" />
          <el-option label="神经外科" value="神经外科" />
        </el-select>
        <template v-if="isEditing">
          <el-button :icon="RefreshLeft" @click="resetDashboardLayout">恢复默认</el-button>
          <el-button :icon="Close" @click="cancelDashboardEdit">取消</el-button>
          <el-button type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
        </template>
        <el-button v-else type="primary" :icon="Edit" @click="startDashboardEdit">编辑看板</el-button>
      </template>
    </PageHeader>

    <div v-if="dashboardLoadMessage" class="notice-strip is-warning dashboard-notice">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ dashboardLoadMessage }}</span>
    </div>

    <section v-if="isEditing" class="surface-card dashboard-editor-panel">
      <div class="dashboard-editor-panel__left">
        <span class="dashboard-editor-panel__label">数据组件</span>
        <el-select
          v-model="selectedDataCode"
          class="dashboard-editor-panel__data-select"
          aria-label="指标数据"
          :loading="indicatorSourceLoading"
        >
          <el-option
            v-for="source in indicatorDataSources"
            :key="source.code"
            :label="source.name"
            :value="source.code"
          >
            <span>{{ source.name }}</span>
            <span class="dashboard-editor-panel__option-meta">{{ source.category }} · {{ source.originLabel }}</span>
          </el-option>
        </el-select>
        <el-select v-model="addWidgetType" class="dashboard-editor-panel__select" aria-label="展示类型">
          <el-option
            v-for="option in widgetTypeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
        <el-button :icon="Plus" :disabled="!selectedDataSource" @click="addDashboardWidget">添加组件</el-button>
      </div>
      <div class="dashboard-editor-panel__right">
        <span class="dashboard-editor-panel__hint" role="status" aria-live="polite">
          {{ activeWidgetName }}
        </span>
        <el-button :icon="Delete" :disabled="!activeWidget" @click="deleteActiveWidget">删除选中</el-button>
      </div>
    </section>

    <template v-if="!hasCustomLayout && !isEditing">
      <section class="clinical-summary-grid" aria-label="核心指标">
        <article
          class="surface-card primary-metric is-clickable"
          role="button"
          tabindex="0"
          @click="goIndicatorAnalysis(getKpiIndicatorCode(0, visibleKpis[0]))"
          @keydown.enter.prevent="goIndicatorAnalysis(getKpiIndicatorCode(0, visibleKpis[0]))"
          @keydown.space.prevent="goIndicatorAnalysis(getKpiIndicatorCode(0, visibleKpis[0]))"
        >
          <div class="primary-metric__head">
            <div>
              <span class="primary-metric__eyebrow">重点关注</span>
              <h2>{{ visibleKpis[0].title }}</h2>
            </div>
            <span class="status-pill" :class="`is-${visibleKpis[0].status}`">
              {{ visibleKpis[0].status === 'danger' ? '超出目标' : '在目标内' }}
            </span>
          </div>
          <div class="primary-metric__value clinical-metric">{{ visibleKpis[0].value }}</div>
          <div class="primary-metric__change" :class="`is-${visibleKpis[0].status}`">
            较上期 {{ visibleKpis[0].change }}
          </div>
          <dl class="primary-metric__meta">
            <div><dt>管理目标</dt><dd>{{ visibleKpis[0].target }}</dd></div>
            <div><dt>当前范围</dt><dd>{{ department }}</dd></div>
            <div><dt>结果口径</dt><dd>活动结果优先</dd></div>
          </dl>
        </article>

        <article class="surface-card supporting-metrics">
          <div class="section-title supporting-metrics__title">
            <div>
              <h2>其他核心指标</h2>
              <p class="section-title__description">按当前场景和统计范围展示</p>
            </div>
          </div>
          <button
            v-for="(item, index) in visibleKpis.slice(1)"
            :key="item.title"
            type="button"
            class="supporting-metric"
            @click="goIndicatorAnalysis(getKpiIndicatorCode(index + 1, item))"
          >
            <span class="supporting-metric__name">{{ item.title }}</span>
            <strong class="clinical-metric">{{ item.value }}</strong>
            <span class="supporting-metric__change" :class="`is-${item.status}`">{{ item.change }}</span>
            <span class="supporting-metric__target">{{ item.target }}</span>
          </button>
        </article>
      </section>

      <section class="chart-grid">
        <article class="surface-card chart-card">
          <div class="section-title">
            <div>
              <h2><el-icon><TrendCharts /></el-icon>近 12 月质量趋势</h2>
              <p class="section-title__description">比较死亡率、手术并发症率与抗菌药物使用强度</p>
            </div>
          </div>
          <IdmpChart
            :option="trendOption"
            height="278px"
            aria-label="近 12 月医疗质量指标趋势"
            updated-at="演示周期：2024 年 12 月"
          >
            <template #table>
              <div class="table-scroll">
                <table class="dashboard-chart-table">
                  <thead>
                    <tr>
                      <th scope="col">月份</th>
                      <th scope="col">住院死亡率</th>
                      <th scope="col">手术并发症率</th>
                      <th scope="col">抗菌药物使用强度</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in trendTableRows" :key="row.period">
                      <th scope="row">{{ row.period }}</th>
                      <td>{{ row.mortality }}</td>
                      <td>{{ row.complication }}</td>
                      <td>{{ row.antibiotic }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </IdmpChart>
        </article>
        <article class="surface-card chart-card">
          <div class="section-title">
            <div>
              <h2><el-icon><PieChart /></el-icon>指标目标分布</h2>
              <p class="section-title__description">达标、接近阈值与超标指标占比</p>
            </div>
          </div>
          <IdmpChart
            :option="rateOption"
            height="278px"
            aria-label="指标目标达成分布"
            updated-at="演示周期：2024 年 12 月"
          >
            <template #table>
              <table class="dashboard-chart-table">
                <thead>
                  <tr>
                    <th scope="col">状态</th>
                    <th scope="col">指标数</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in categoryRates" :key="row.name">
                    <th scope="row">{{ row.name }}</th>
                    <td>{{ row.value }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
          </IdmpChart>
        </article>
      </section>

      <section class="dashboard-bottom">
        <article class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><Bell /></el-icon>预警指标</h2>
            <button type="button" class="action-link" @click="goAlerts">查看全部</button>
          </div>
          <ul class="warning-list">
            <li v-for="warning in dashboardWarnings" :key="warning.text">
              <span class="warning-icon" :class="`is-${warning.level}`">
                <el-icon><WarningFilled v-if="warning.level !== 'info'" /><InfoFilled v-else /></el-icon>
              </span>
              <span class="warning-text">{{ warning.text }}</span>
              <time>{{ warning.time }}</time>
            </li>
          </ul>
        </article>

        <article class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><TrophyBase /></el-icon>科室指标排名（手术并发症率）</h2>
          </div>
          <ol class="ranking-list">
            <li v-for="row in departmentRanking" :key="row.department">
              <span class="rank" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
              <span class="department">{{ row.department }}</span>
              <span class="rank-bar">
                <i :style="{ width: `${Math.max(14, parseFloat(row.value) * 16)}%` }" />
              </span>
              <strong>{{ row.value }}</strong>
            </li>
          </ol>
        </article>
      </section>
    </template>

    <section
      v-else
      ref="boardRef"
      class="editable-dashboard"
      :class="{ 'is-editing': isEditing }"
      :style="{ height: `${boardHeight}px` }"
      aria-label="可编辑指标看板"
      @pointerdown.self="activeWidgetId = ''"
    >
      <div
        v-for="widget in dashboardLayout"
        :key="widget.id"
        class="editable-dashboard__item"
        :class="{ 'is-active': isEditing && activeWidgetId === widget.id }"
        :style="widgetStyle(widget)"
        :tabindex="isEditing ? 0 : -1"
        :role="isEditing ? 'group' : undefined"
        :aria-label="isEditing ? getWidgetEditLabel(widget) : undefined"
        :aria-keyshortcuts="isEditing ? 'ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight Delete Escape' : undefined"
        @pointerdown.stop="onWidgetPointerDown($event, widget)"
        @focus="isEditing && (activeWidgetId = widget.id)"
        @keydown="onWidgetKeydown($event, widget)"
      >
        <article
          v-if="isKpiWidget(widget)"
          class="surface-card kpi-card"
          :class="{ 'is-clickable': !isEditing }"
          :role="isEditing ? undefined : 'button'"
          :tabindex="isEditing ? -1 : 0"
          :aria-disabled="isEditing || undefined"
          @click.stop="goWidgetAnalysis(widget)"
          @keydown.enter.prevent.stop="goWidgetAnalysis(widget)"
          @keydown.space.prevent.stop="goWidgetAnalysis(widget)"
        >
          <div class="kpi-card__top">
            <span>{{ getWidgetKpi(widget).title }}</span>
            <span class="kpi-dot" :class="`is-${getWidgetKpi(widget).status}`" />
          </div>
          <strong>{{ getWidgetKpi(widget).value }}</strong>
          <div class="kpi-change" :class="`is-${getWidgetKpi(widget).status}`">{{ getWidgetKpi(widget).change }}</div>
          <div class="kpi-target">{{ getWidgetKpi(widget).target }}</div>
        </article>

        <article v-else-if="isChartWidget(widget)" class="surface-card chart-card">
          <div class="section-title">
            <h2>
              <el-icon><component :is="getWidgetIcon(widget)" /></el-icon>
              {{ getWidgetTitle(widget) }}
            </h2>
          </div>
          <IdmpChart
            :option="getWidgetChartOption(widget)"
            height="calc(100% - 38px)"
            :aria-label="`${getWidgetTitle(widget)}图表`"
            updated-at="演示周期：2024 年 12 月"
          >
            <template #table>
              <div class="table-scroll">
                <table class="dashboard-chart-table">
                  <thead>
                    <tr>
                      <th
                        v-for="column in getWidgetTableColumns(widget)"
                        :key="column.key"
                        scope="col"
                      >
                        {{ column.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rowIndex) in getWidgetTableRows(widget)" :key="`${widget.id}-${rowIndex}`">
                      <template
                        v-for="(column, columnIndex) in getWidgetTableColumns(widget)"
                        :key="column.key"
                      >
                        <th v-if="columnIndex === 0" scope="row">{{ row[column.key] }}</th>
                        <td v-else>{{ row[column.key] }}</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </IdmpChart>
        </article>

        <article v-else-if="widget.type === 'warnings'" class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><Bell /></el-icon>预警指标</h2>
            <button type="button" class="action-link" @click="goAlerts">查看全部</button>
          </div>
          <ul class="warning-list">
            <li v-for="warning in dashboardWarnings" :key="warning.text">
              <span class="warning-icon" :class="`is-${warning.level}`">
                <el-icon><WarningFilled v-if="warning.level !== 'info'" /><InfoFilled v-else /></el-icon>
              </span>
              <span class="warning-text">{{ warning.text }}</span>
              <time>{{ warning.time }}</time>
            </li>
          </ul>
        </article>

        <article v-else-if="widget.type === 'ranking'" class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><TrophyBase /></el-icon>科室指标排名（手术并发症率）</h2>
          </div>
          <ol class="ranking-list">
            <li v-for="row in departmentRanking" :key="row.department">
              <span class="rank" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
              <span class="department">{{ row.department }}</span>
              <span class="rank-bar">
                <i :style="{ width: `${Math.max(14, parseFloat(row.value) * 16)}%` }" />
              </span>
              <strong>{{ row.value }}</strong>
            </li>
          </ol>
        </article>

        <template v-if="isEditing && activeWidgetId === widget.id">
          <span
            v-for="handle in resizeHandles"
            :key="handle"
            class="editable-dashboard__handle"
            :class="`editable-dashboard__handle--${handle}`"
            aria-hidden="true"
            @pointerdown.stop.prevent="onResizePointerDown($event, widget, handle)"
          />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bell,
  Check,
  Close,
  Delete,
  Edit,
  Histogram,
  InfoFilled,
  PieChart,
  Plus,
  RefreshLeft,
  TrendCharts,
  TrophyBase,
  WarningFilled
} from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchDashboardBootstrap } from '@/idmp/api/modules/analysisDashboard'
import { fetchIndicators } from '@/idmp/api/modules/indicators'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import {
  categoryRates,
  dashboardKpis,
  dashboardTrend,
  dashboardWarnings,
  departmentRanking
} from '@/idmp/data/demo'
import {
  DASHBOARD_CODE,
  DASHBOARD_DESIGN_WIDTH,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  DEFAULT_DASHBOARD_HEIGHT,
  LEGACY_DASHBOARD_LAYOUT_STORAGE_KEY,
  resizeHandles,
  widgetTypeOptions
} from '@/idmp/features/dashboard/constants'
import { createDefaultLayout, cloneLayout, normalizeLayout, widgetStyle } from '@/idmp/features/dashboard/layout'
import { mockIndicatorDataSources } from '@/idmp/features/dashboard/mockData'
import { applyMortalityReadonlyChain } from '@/idmp/features/dashboard/mortalityAdapter'
import {
  createDashboardChartOption,
  createKpiData,
  getIndicatorSource,
  getVisualizationTitle
} from '@/idmp/features/dashboard/visualization'

const router = useRouter()
const period = ref('2024年度')
const department = ref('全院')
const boardRef = ref()
const isEditing = ref(false)
const hasCustomLayout = ref(false)
const activeWidgetId = ref('')
const selectedDataCode = ref(mockIndicatorDataSources[0].code)
const addWidgetType = ref('kpi')
const indicatorDataSources = ref(cloneIndicatorSources(mockIndicatorDataSources))
const indicatorSourceLoading = ref(false)
const dashboardSourceMode = ref('demo')
const dashboardLoadMessage = ref('')
const dashboardLayout = ref(createDefaultLayout())
const editSnapshot = ref([])
const backendDashboard = ref(null)
const mortalityChain = ref(null)
const dashboardKpiIndicatorCodes = [
  'MORTALITY_INPATIENT',
  'OUTPATIENT_DISCHARGE_RATIO',
  'SURGERY_COMPLICATION',
  'ANTIBIOTIC_DDDS',
  'ESSENTIAL_MEDICINE_RATIO',
  'MEDICAL_SERVICE_REVENUE_RATIO'
]

const selectedDataSource = computed(() =>
  indicatorDataSources.value.find((source) => source.code === selectedDataCode.value)
)

const dashboardSourceLabel = computed(() => (
  dashboardSourceMode.value === 'mixed' ? '接口元数据 + 演示指标值' : '演示数据'
))

const activeWidget = computed(() =>
  dashboardLayout.value.find((widget) => widget.id === activeWidgetId.value)
)

const activeWidgetName = computed(() => {
  if (!activeWidget.value) return '未选中组件'
  const widget = activeWidget.value
  return `已选中：${getWidgetTitle(widget)}。位置 ${widget.x}, ${widget.y}；尺寸 ${widget.w} × ${widget.h}。方向键移动，Shift 加方向键调整尺寸，Delete 删除。`
})

const departmentMultiplier = computed(() => {
  if (department.value === '心外科') return 1.08
  if (department.value === '神经外科') return 1.04
  return 1
})

const visibleKpis = computed(() => dashboardKpis.map((item, index) => {
  if (index === 0) {
    return createKpiData(getDashboardIndicatorSource('MORTALITY_INPATIENT') || indicatorDataSources.value[0])
  }
  if (department.value === '全院' || index > 2) return item
  const numeric = Number.parseFloat(item.value)
  if (Number.isNaN(numeric)) return item
  const suffix = item.value.replace(String(numeric), '')
  return {
    ...item,
    value: `${(numeric * departmentMultiplier.value).toFixed(index === 1 ? 1 : 2)}${suffix}`
  }
}))

const trendTableRows = computed(() =>
  dashboardTrend.months.map((month, index) => ({
    period: month,
    mortality: (dashboardTrend.mortality[index] * departmentMultiplier.value).toFixed(2),
    complication: (dashboardTrend.complication[index] * departmentMultiplier.value).toFixed(2),
    antibiotic: dashboardTrend.antibiotic[index]
  }))
)

const boardHeight = computed(() => {
  const maxBottom = dashboardLayout.value.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
  return Math.max(DEFAULT_DASHBOARD_HEIGHT, maxBottom)
})

const trendOption = computed(() => ({
  color: ['#b4232c', '#b75d00', IDMP_CHART_COLORS[0]],
  tooltip: { trigger: 'axis' },
  legend: {
    bottom: 0,
    itemWidth: 14,
    itemHeight: 8
  },
  grid: { top: 12, left: 44, right: 44, bottom: 46, containLabel: false },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: dashboardTrend.months
  },
  yAxis: [
    {
      type: 'value',
      min: 0,
      max: 4
    },
    {
      type: 'value',
      min: 0,
      max: 50,
      splitLine: { show: false }
    }
  ],
  series: [
    {
      name: '住院死亡率',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: dashboardTrend.mortality.map(value => +(value * departmentMultiplier.value).toFixed(2))
    },
    {
      name: '手术并发症率',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: dashboardTrend.complication.map(value => +(value * departmentMultiplier.value).toFixed(2))
    },
    {
      name: '抗菌药物使用强度',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      yAxisIndex: 1,
      data: dashboardTrend.antibiotic
    }
  ]
}))

const rateOption = computed(() => ({
  color: ['#247a4d', '#b75d00', '#b4232c'],
  tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
  legend: {
    bottom: 2,
    left: 'center',
    itemWidth: 18,
    itemHeight: 10
  },
  series: [
    {
      type: 'pie',
      radius: ['49%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        fontSize: 12,
        formatter: '{b}\n{d}%'
      },
      labelLine: { length: 12, length2: 10 },
      data: categoryRates
    }
  ]
}))

function isKpiWidget(widget) {
  return widget.type === 'kpi'
}

function isChartWidget(widget) {
  return widget.type === 'chart' || widget.type === 'trend' || widget.type === 'rate'
}

function getWidgetKpi(widget) {
  if (typeof widget.kpiIndex === 'number') {
    return visibleKpis.value[widget.kpiIndex] || createKpiData(indicatorDataSources.value[0])
  }
  if (widget.data) return widget.data
  return createKpiData(getDashboardIndicatorSource(widget.sourceCode) || indicatorDataSources.value[0])
}

function getDashboardIndicatorSource(code) {
  return indicatorDataSources.value.find((source) => source.code === code)
}

function getKpiIndicatorCode(index, item) {
  return item?.code || dashboardKpiIndicatorCodes[index] || 'SURGERY_COMPLICATION'
}

function getWidgetIndicatorCode(widget) {
  if (widget.sourceCode) return widget.sourceCode
  if (typeof widget.kpiIndex === 'number') return getKpiIndicatorCode(widget.kpiIndex, visibleKpis.value[widget.kpiIndex])
  return widget.data?.code || 'SURGERY_COMPLICATION'
}

function goWidgetAnalysis(widget) {
  if (isEditing.value) return
  goIndicatorAnalysis(getWidgetIndicatorCode(widget))
}

function getWidgetTitle(widget) {
  if (isKpiWidget(widget)) return getWidgetKpi(widget).title
  if (widget.type === 'warnings') return '预警指标'
  if (widget.type === 'ranking') return '科室指标排名'
  if (widget.preset === 'trend' || widget.type === 'trend') return '指标趋势（近12月）'
  if (widget.preset === 'rate' || widget.type === 'rate') return '分类达标率'
  if (widget.sourceName) return getVisualizationTitle(widget.sourceName, widget.chartKind)
  return widget.title || widgetTypeOptions.find((item) => item.value === widget.chartKind)?.label || '图表'
}

function getWidgetIcon(widget) {
  if (widget.chartKind === 'bar') return Histogram
  if (widget.chartKind === 'pie' || widget.type === 'rate') return PieChart
  return TrendCharts
}

function getWidgetChartOption(widget) {
  return createDashboardChartOption(widget, {
    trendOption: trendOption.value,
    rateOption: rateOption.value
  })
}

function getWidgetTableColumns(widget) {
  if (widget.preset === 'trend' || widget.type === 'trend') {
    return [
      { key: 'period', label: '月份' },
      { key: 'mortality', label: '住院死亡率' },
      { key: 'complication', label: '手术并发症率' },
      { key: 'antibiotic', label: '抗菌药物使用强度' }
    ]
  }
  if (widget.preset === 'rate' || widget.type === 'rate') {
    return [
      { key: 'label', label: '状态' },
      { key: 'value', label: '指标数' }
    ]
  }
  return [
    { key: 'label', label: widget.chartKind === 'line' ? '月份' : '数据项' },
    { key: 'value', label: getWidgetTitle(widget) }
  ]
}

function getWidgetTableRows(widget) {
  if (widget.preset === 'trend' || widget.type === 'trend') return trendTableRows.value
  if (widget.preset === 'rate' || widget.type === 'rate') {
    return categoryRates.map((item) => ({ label: item.name, value: item.value }))
  }

  const source = widget.sourceSnapshot ||
    getDashboardIndicatorSource(widget.sourceCode) ||
    indicatorDataSources.value[0] ||
    {}

  if (widget.chartKind === 'bar') {
    return (source.departmentData || []).map((item) => ({ label: item.name, value: item.value }))
  }
  if (widget.chartKind === 'pie') {
    return (source.pieData || []).map((item) => ({ label: item.name, value: item.value }))
  }
  return dashboardTrend.months.map((month, index) => ({
    label: month,
    value: source.trendData?.[index] ?? '-'
  }))
}

function getWidgetEditLabel(widget) {
  return `${getWidgetTitle(widget)}编辑组件，位置 ${widget.x}, ${widget.y}，尺寸 ${widget.w} × ${widget.h}。使用方向键移动，Shift 加方向键调整尺寸，Delete 删除，Escape 取消选择。`
}

function getBoardScale() {
  if (!boardRef.value) return 1
  return boardRef.value.clientWidth / DASHBOARD_DESIGN_WIDTH || 1
}

function getNextWidgetPosition() {
  const maxBottom = dashboardLayout.value.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
  return { x: 0, y: maxBottom + 16 }
}

function addDashboardWidget() {
  const source = selectedDataSource.value
  if (!source) return
  const position = getNextWidgetPosition()
  const id = `dashboard-widget-${Date.now()}`
  const type = addWidgetType.value
  const baseWidget = {
    id,
    sourceCode: source.code,
    sourceName: source.name,
    sourceSnapshot: cloneIndicatorSource(source),
    visualType: type,
    x: position.x,
    y: position.y
  }

  if (type === 'kpi') {
    dashboardLayout.value.push({
      ...baseWidget,
      type: 'kpi',
      data: createKpiData(source),
      w: 240,
      h: 158
    })
  } else {
    dashboardLayout.value.push({
      ...baseWidget,
      type: 'chart',
      chartKind: type,
      title: getVisualizationTitle(source.name, type),
      w: 520,
      h: 336
    })
  }

  activeWidgetId.value = id
}

function deleteActiveWidget() {
  if (!activeWidgetId.value) return
  dashboardLayout.value = dashboardLayout.value.filter((widget) => widget.id !== activeWidgetId.value)
  activeWidgetId.value = ''
}

function updateWidget(id, partial) {
  dashboardLayout.value = dashboardLayout.value.map((widget) =>
    widget.id === id ? { ...widget, ...partial } : widget
  )
}

function onWidgetPointerDown(event, widget) {
  if (!isEditing.value) return
  event.currentTarget?.focus()
  activeWidgetId.value = widget.id
  const scale = getBoardScale()
  const startX = event.clientX
  const startY = event.clientY
  const start = { x: widget.x, y: widget.y }

  const onMove = (moveEvent) => {
    updateWidget(widget.id, {
      x: Math.max(0, Math.round(start.x + (moveEvent.clientX - startX) / scale)),
      y: Math.max(0, Math.round(start.y + moveEvent.clientY - startY))
    })
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onWidgetKeydown(event, widget) {
  if (!isEditing.value || event.target !== event.currentTarget) return
  const supportedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Escape']
  if (!supportedKeys.includes(event.key)) return

  event.preventDefault()
  event.stopPropagation()
  activeWidgetId.value = widget.id

  if (event.key === 'Delete') {
    deleteActiveWidget()
    return
  }
  if (event.key === 'Escape') {
    activeWidgetId.value = ''
    event.currentTarget.blur()
    return
  }

  const step = event.altKey ? 1 : 8
  if (event.shiftKey) {
    const minW = widget.type === 'kpi' ? 150 : 300
    const minH = widget.type === 'kpi' ? 128 : 220
    updateWidget(widget.id, {
      w: Math.max(minW, widget.w + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
      h: Math.max(minH, widget.h + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
    })
    return
  }

  updateWidget(widget.id, {
    x: Math.max(0, widget.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
    y: Math.max(0, widget.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
  })
}

function onResizePointerDown(event, widget, handle) {
  const scale = getBoardScale()
  const startX = event.clientX
  const startY = event.clientY
  const start = { x: widget.x, y: widget.y, w: widget.w, h: widget.h }
  const minW = widget.type === 'kpi' ? 150 : 300
  const minH = widget.type === 'kpi' ? 128 : 220

  const onMove = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / scale
    const dy = moveEvent.clientY - startY
    let nextX = start.x
    let nextY = start.y
    let nextW = start.w
    let nextH = start.h

    if (handle.includes('e')) nextW = Math.max(minW, start.w + dx)
    if (handle.includes('s')) nextH = Math.max(minH, start.h + dy)
    if (handle.includes('w')) {
      nextW = Math.max(minW, start.w - dx)
      nextX = start.x + (start.w - nextW)
    }
    if (handle.includes('n')) {
      nextH = Math.max(minH, start.h - dy)
      nextY = start.y + (start.h - nextH)
    }

    updateWidget(widget.id, {
      x: Math.max(0, Math.round(nextX)),
      y: Math.max(0, Math.round(nextY)),
      w: Math.round(nextW),
      h: Math.round(nextH)
    })
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function startDashboardEdit() {
  editSnapshot.value = cloneLayout(dashboardLayout.value)
  isEditing.value = true
}

function cancelDashboardEdit() {
  dashboardLayout.value = cloneLayout(editSnapshot.value.length ? editSnapshot.value : createDefaultLayout())
  activeWidgetId.value = ''
  isEditing.value = false
}

function saveDashboardLayout() {
  localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(dashboardLayout.value))
  hasCustomLayout.value = true
  activeWidgetId.value = ''
  isEditing.value = false
}

function resetDashboardLayout() {
  dashboardLayout.value = createDefaultLayout()
  localStorage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY)
  localStorage.removeItem(LEGACY_DASHBOARD_LAYOUT_STORAGE_KEY)
  hasCustomLayout.value = false
  activeWidgetId.value = ''
}

function loadDashboardLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) || 'null')
    if (Array.isArray(saved) && saved.length) {
      dashboardLayout.value = normalizeLayout(saved, getDashboardIndicatorSource)
      hasCustomLayout.value = true
    }
  } catch {
    dashboardLayout.value = createDefaultLayout()
    hasCustomLayout.value = false
  }
}

async function loadBackendIndicatorSources() {
  indicatorSourceLoading.value = true
  try {
    const rows = await fetchIndicators()
    const backendSources = Array.isArray(rows) ? rows.map(toDashboardIndicatorSource).filter(Boolean) : []
    if (!backendSources.length) {
      dashboardSourceMode.value = 'demo'
      dashboardLoadMessage.value = '指标接口未返回可用记录，当前明确展示演示指标。演示值不代表正式计算结果。'
      return
    }

    indicatorDataSources.value = mergeIndicatorSources(backendSources, indicatorDataSources.value)
    dashboardSourceMode.value = 'mixed'
    dashboardLoadMessage.value = '当前页面混合使用接口返回的指标元数据与演示指标值；正式结果接口接入前，请勿将数值用于业务决策。'
    if (!selectedDataSource.value) {
      selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
    }
  } catch {
    indicatorDataSources.value = cloneIndicatorSources(mockIndicatorDataSources)
    dashboardSourceMode.value = 'demo'
    dashboardLoadMessage.value = '指标接口暂不可用，当前明确展示演示数据。可继续查看界面结构，但数值不代表正式计算结果。'
  } finally {
    indicatorSourceLoading.value = false
  }
}

async function loadBackendDashboardContract() {
  try {
    backendDashboard.value = await fetchDashboardBootstrap(DASHBOARD_CODE, {
      year: 2025,
      month: 12,
      deptCode: null
    })
  } catch {
    backendDashboard.value = null
  }
}

async function loadMortalityReadonlyChain() {
  try {
    const chain = await fetchMortalityReadonlyChain()
    const source = applyMortalityReadonlyChain(indicatorDataSources.value, chain)
    if (source) {
      applyMortalityReadonlyChain(mockIndicatorDataSources, chain)
      indicatorDataSources.value = indicatorDataSources.value.map((item) =>
        item.code === source.code ? { ...source } : item
      )
      mortalityChain.value = chain
      refreshMortalityWidgets(source)
    }
  } catch {
    mortalityChain.value = null
  }
}

function refreshMortalityWidgets(source) {
  dashboardLayout.value = dashboardLayout.value.map((widget) => {
    if (widget.sourceCode !== source.code) return widget
    if (widget.type !== 'kpi') return widget
    return {
      ...widget,
      data: createKpiData(source)
    }
  })
}

function cloneIndicatorSources(sources) {
  return sources.map((source) => ({
    ...source,
    trendData: Array.isArray(source.trendData) ? [...source.trendData] : source.trendData,
    departmentData: Array.isArray(source.departmentData) ? source.departmentData.map((item) => ({ ...item })) : source.departmentData,
    pieData: Array.isArray(source.pieData) ? source.pieData.map((item) => ({ ...item })) : source.pieData
  }))
}

function toDashboardIndicatorSource(item, index) {
  if (!item?.code || !item?.name) return null
  const demoSource = mockIndicatorDataSources.find((source) => source.code === item.code) ||
    mockIndicatorDataSources[index % mockIndicatorDataSources.length] ||
    mockIndicatorDataSources[0]

  return {
    ...cloneIndicatorSource(demoSource),
    code: item.code,
    name: item.name,
    category: item.category || item.categoryName || item.domainName || '后端指标',
    unit: item.unit || item.unitCode || demoSource?.unit || '',
    status: item.status === 'DISABLED' ? 'warning' : demoSource?.status || 'success',
    origin: 'backend',
    originLabel: '后端'
  }
}

function mergeIndicatorSources(backendSources, currentSources) {
  const merged = new Map()
  cloneIndicatorSources(currentSources).forEach((source) => {
    merged.set(source.code, {
      ...source,
      origin: source.origin || 'demo',
      originLabel: source.originLabel || '演示'
    })
  })
  backendSources.forEach((source) => {
    const current = merged.get(source.code)
    merged.set(source.code, current ? { ...current, ...source } : source)
  })
  return Array.from(merged.values())
}

function cloneIndicatorSource(source) {
  return {
    ...source,
    trendData: Array.isArray(source?.trendData) ? [...source.trendData] : source?.trendData,
    departmentData: Array.isArray(source?.departmentData) ? source.departmentData.map((item) => ({ ...item })) : source?.departmentData,
    pieData: Array.isArray(source?.pieData) ? source.pieData.map((item) => ({ ...item })) : source?.pieData
  }
}

const goAlerts = () => router.push('/alerts')
const goIndicatorAnalysis = (indicatorCode) => {
  router.push({
    path: '/analysis',
    query: { indicator: indicatorCode || 'SURGERY_COMPLICATION' }
  })
}

onMounted(async () => {
  loadDashboardLayout()
  await loadBackendIndicatorSources()
  await Promise.allSettled([
    loadBackendDashboardContract(),
    loadMortalityReadonlyChain()
  ])
})
</script>

<style scoped lang="scss">
.dashboard-filter {
  width: 122px;
}

.dashboard-editor-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px 14px;
  gap: 16px;
}

.dashboard-editor-panel__left,
.dashboard-editor-panel__right {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.dashboard-editor-panel__label {
  color: var(--idmp-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.dashboard-editor-panel__select {
  width: 132px;
}

.dashboard-editor-panel__data-select {
  width: 260px;
}

.dashboard-editor-panel__option-meta {
  float: right;
  margin-left: 16px;
  color: var(--idmp-text-disabled);
  font-size: 12px;
}

.dashboard-editor-panel__hint {
  max-width: 280px;
  overflow: hidden;
  color: var(--idmp-text-helper);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-notice {
  margin-bottom: 16px;
}

.clinical-summary-grid {
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(560px, 1.45fr);
  margin-bottom: 16px;
  gap: 16px;
}

.primary-metric {
  min-height: 246px;
  padding: 20px 22px;
}

.primary-metric.is-clickable {
  cursor: pointer;
  transition: border-color 110ms ease;

  &:hover {
    border-color: var(--idmp-interactive);
  }
}

.primary-metric__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.primary-metric__eyebrow {
  color: var(--idmp-text-helper);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.primary-metric h2 {
  margin: 4px 0 0;
  color: var(--idmp-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.primary-metric__value {
  margin-top: 24px;
  color: var(--idmp-text-primary);
  font-size: 42px;
  font-weight: 650;
  line-height: 48px;
}

.primary-metric__change {
  margin-top: 2px;
  color: var(--idmp-support-danger);
  font-size: 12px;

  &.is-success {
    color: var(--idmp-support-success);
  }

  &.is-warning {
    color: var(--idmp-support-warning);
  }
}

.primary-metric__meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 22px 0 0;
  padding-top: 14px;
  gap: 12px;
  border-top: 1px solid var(--idmp-border-subtle);

  div {
    min-width: 0;
  }

  dt {
    color: var(--idmp-text-helper);
    font-size: 11px;
  }

  dd {
    margin: 3px 0 0;
    overflow: hidden;
    color: var(--idmp-text-secondary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.supporting-metrics {
  padding: 16px 18px 12px;
}

.supporting-metrics__title {
  margin-bottom: 4px;
}

.supporting-metric {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(180px, 1.4fr) 90px 72px minmax(96px, 0.8fr);
  align-items: center;
  min-height: 38px;
  padding: 0 4px;
  gap: 12px;
  border: 0;
  border-top: 1px solid var(--idmp-border-soft);
  background: transparent;
  color: var(--idmp-text-secondary);
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--idmp-layer-hover);
  }

  strong {
    color: var(--idmp-text-primary);
    font-size: 17px;
    font-weight: 650;
    text-align: right;
  }
}

.supporting-metric__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.supporting-metric__change {
  color: var(--idmp-support-danger);
  font-size: 12px;
  text-align: right;

  &.is-success {
    color: var(--idmp-support-success);
  }

  &.is-warning {
    color: var(--idmp-support-warning);
  }
}

.supporting-metric__target {
  overflow: hidden;
  color: var(--idmp-text-helper);
  font-size: 11px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-bottom: 16px;
  gap: 16px;
}

.kpi-card {
  min-height: 158px;
  padding: 18px 16px;
}

.kpi-card.is-clickable {
  cursor: pointer;
  transition: border-color 110ms ease;

  &:hover {
    border-color: var(--idmp-interactive);
  }
}

.kpi-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 40px;
  gap: 8px;
  color: var(--idmp-text-helper);
  font-size: 13px;
  line-height: 20px;
}

.kpi-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 3px;
  border-radius: 50%;
  background: var(--idmp-support-success);

  &.is-danger { background: var(--idmp-support-danger); }
  &.is-warning { background: var(--idmp-support-warning); }
}

.kpi-card strong {
  display: block;
  margin: 7px 0 4px;
  color: var(--idmp-text-primary);
  font-size: 27px;
  font-weight: 650;
  line-height: 34px;
}

.kpi-change {
  color: var(--idmp-support-danger);
  font-size: 12px;

  &.is-success { color: var(--idmp-support-success); }
  &.is-warning { color: var(--idmp-support-warning); }
}

.kpi-target {
  margin-top: 5px;
  color: var(--idmp-text-disabled);
  font-size: 12px;
}

.chart-grid,
.dashboard-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 1fr);
  margin-bottom: 16px;
  gap: 16px;
}

.chart-card {
  min-height: 336px;
  padding: 16px 18px 12px;
}

.dashboard-chart-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  color: var(--idmp-text-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--idmp-border-soft);
    text-align: right;
    white-space: nowrap;
  }

  th:first-child,
  td:first-child {
    text-align: left;
  }

  thead th {
    background: var(--idmp-layer-02);
    color: var(--idmp-text-primary);
    font-weight: 600;
  }
}

.list-card {
  min-height: 286px;
  padding: 16px 18px;
}

.warning-list,
.ranking-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.warning-list li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 54px;
  border-bottom: 1px solid var(--idmp-border-soft);
  gap: 10px;

  &:last-child {
    border-bottom: 0;
  }

  time {
    color: var(--idmp-text-disabled);
    font-size: 12px;
  }
}

.warning-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-support-danger-bg);
  color: var(--idmp-support-danger);

  &.is-warning {
    background: var(--idmp-support-warning-bg);
    color: var(--idmp-support-warning);
  }

  &.is-info {
    background: var(--idmp-support-info-bg);
    color: var(--idmp-support-info);
  }
}

.warning-text {
  min-width: 0;
  overflow: hidden;
  color: var(--idmp-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-list li {
  display: grid;
  grid-template-columns: 28px 80px minmax(80px, 1fr) 48px;
  align-items: center;
  min-height: 39px;
  gap: 10px;
}

.rank {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 4px;
  background: var(--idmp-layer-02);
  color: var(--idmp-text-helper);
  font-size: 12px;

  &.is-top {
    background: var(--idmp-interactive-subtle);
    color: var(--idmp-interactive);
    font-weight: 600;
  }
}

.department {
  color: var(--idmp-text-secondary);
}

.rank-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 6px;
  background: var(--idmp-layer-02);

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--idmp-interactive);
  }
}

.ranking-list strong {
  color: var(--idmp-text-secondary);
  text-align: right;
}

.editable-dashboard {
  position: relative;
  width: 100%;
  min-height: 812px;
  margin-bottom: 16px;
}

.editable-dashboard.is-editing {
  border: 1px dashed var(--idmp-interactive);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
}

.editable-dashboard__item {
  position: absolute;
  min-width: 0;
}

.editable-dashboard__item:focus-visible {
  z-index: 4;
}

.editable-dashboard.is-editing .editable-dashboard__item {
  cursor: move;
  user-select: none;
}

.editable-dashboard__item > .surface-card {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.editable-dashboard__item > .chart-card,
.editable-dashboard__item > .list-card {
  min-height: 0;
}

.editable-dashboard.is-editing .editable-dashboard__item > .surface-card {
  pointer-events: none;
}

.editable-dashboard__item.is-active::after {
  position: absolute;
  inset: -1px;
  border: 1px solid var(--idmp-primary);
  border-radius: 8px;
  content: '';
  pointer-events: none;
}

.editable-dashboard__handle {
  position: absolute;
  z-index: 3;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border: 1.5px solid var(--idmp-primary);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-01);
}

.editable-dashboard__handle--n,
.editable-dashboard__handle--s {
  left: 50%;
  cursor: ns-resize;
}

.editable-dashboard__handle--e,
.editable-dashboard__handle--w {
  top: 50%;
  cursor: ew-resize;
}

.editable-dashboard__handle--n { top: 0; }
.editable-dashboard__handle--s { top: 100%; }
.editable-dashboard__handle--e { left: 100%; }
.editable-dashboard__handle--w { left: 0; }

.editable-dashboard__handle--ne,
.editable-dashboard__handle--se,
.editable-dashboard__handle--sw,
.editable-dashboard__handle--nw {
  cursor: nwse-resize;
}

.editable-dashboard__handle--ne {
  top: 0;
  left: 100%;
  cursor: nesw-resize;
}

.editable-dashboard__handle--se {
  top: 100%;
  left: 100%;
}

.editable-dashboard__handle--sw {
  top: 100%;
  left: 0;
  cursor: nesw-resize;
}

.editable-dashboard__handle--nw {
  top: 0;
  left: 0;
}

@media (max-width: 1420px) {
  .clinical-summary-grid {
    grid-template-columns: minmax(280px, 0.66fr) minmax(520px, 1.34fr);
    gap: 12px;
  }

  .kpi-grid {
    gap: 12px;
  }

  .kpi-card {
    padding-right: 13px;
    padding-left: 13px;
  }

  .kpi-card strong {
    font-size: 24px;
  }
}

@media (max-width: 1200px) {
  .clinical-summary-grid {
    grid-template-columns: 1fr;
  }

  .primary-metric {
    min-height: 220px;
  }
}
</style>
