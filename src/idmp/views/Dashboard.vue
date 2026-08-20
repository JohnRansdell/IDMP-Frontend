<template>
  <div class="idmp-page dashboard-page">
    <PageHeader
      title="医疗质量指标总览"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': dashboardStatus === 'ready' }">
          {{ dashboardSourceLabel }}
        </span>
        <span>数据期间：{{ period }}</span>
        <span>统计范围：{{ department }}</span>
      </template>
      <template #actions>
        <el-select v-model="period" class="dashboard-filter" aria-label="年度">
          <el-option v-for="option in periodOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select v-model="department" class="dashboard-filter" aria-label="科室">
          <el-option v-for="option in departmentOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <template v-if="isEditing">
          <el-button :icon="RefreshLeft" @click="resetDashboardLayout">恢复默认</el-button>
          <el-button :icon="Close" @click="cancelDashboardEdit">取消</el-button>
          <el-button type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
        </template>
        <el-button v-else type="primary" :icon="Edit" @click="startDashboardEdit">编辑看板</el-button>
        <el-button v-if="dashboardStatus === 'unpublished'" @click="loadDashboard">重新加载</el-button>
      </template>
    </PageHeader>

    <div v-if="dashboardLoadMessage" class="notice-strip is-warning dashboard-notice">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ dashboardLoadMessage }}</span>
    </div>

    <StatePanel
      v-if="dashboardStatus === 'loading'"
      type="loading"
      title="正在加载质量看板"
      description="正在读取已发布看板定义和当前筛选条件下的正式结果。"
    />
    <StatePanel
      v-else-if="dashboardStatus === 'error'"
      type="error"
      title="质量看板加载失败"
      :description="dashboardLoadMessage || '未展示演示数据，请检查后端看板是否已发布后重试。'"
    >
      <template #actions><el-button type="primary" @click="loadDashboard">重新加载</el-button></template>
    </StatePanel>
    <StatePanel
      v-else-if="dashboardStatus === 'empty'"
      type="empty"
      title="当前条件暂无正式结果"
      description="后端已返回看板，但当前统计周期和范围没有可展示的正式数据。"
    >
      <template #actions><el-button @click="loadDashboard">重新加载</el-button></template>
    </StatePanel>

    <template v-else-if="dashboardStatus === 'ready' || dashboardStatus === 'demo'">
    <section v-if="isEditing" class="surface-card dashboard-editor-panel">
      <div class="dashboard-editor-panel__left">
        <span class="dashboard-editor-panel__label">数据组件</span>
        <el-select
          v-model="selectedDataCode"
          class="dashboard-editor-panel__data-select"
          aria-label="指标数据"
            :loading="dashboardLoading"
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

    <div class="dashboard-board-scroll">
      <section
        ref="boardRef"
        class="editable-dashboard"
        :class="{ 'is-editing': isEditing }"
        :style="{ height: `${boardHeight}px`, minWidth: `${DASHBOARD_MIN_WIDTH}px` }"
        aria-label="可编辑指标看板"
        @pointerdown.self="activeWidgetId = ''"
      >
      <div
        v-for="widget in effectiveDashboardLayout"
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
          v-if="widget.type === 'primary'"
          class="surface-card primary-metric"
          :class="{ 'is-clickable': !isEditing }"
          :role="isEditing ? undefined : 'button'"
          :tabindex="isEditing ? -1 : 0"
          :aria-disabled="isEditing || undefined"
          @click.stop="goPrimaryMetricAnalysis"
          @keydown.enter.prevent.stop="goPrimaryMetricAnalysis"
          @keydown.space.prevent.stop="goPrimaryMetricAnalysis"
        >
          <div class="primary-metric__head">
            <div>
              <span class="primary-metric__eyebrow">重点关注</span>
              <h2>{{ visibleKpis[0].title }}</h2>
            </div>
            <span class="status-pill" :class="`is-${visibleKpis[0].status}`">
              {{ visibleKpis[0].status === 'danger' ? '超出目标' : visibleKpis[0].status === 'info' ? '待配置' : '在目标内' }}
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

        <article v-else-if="widget.type === 'supporting'" class="surface-card supporting-metrics">
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
            :tabindex="isEditing ? -1 : 0"
            @click.stop="goIndicatorAnalysis(item.code)"
          >
            <span class="supporting-metric__name">{{ item.title }}</span>
            <strong class="clinical-metric">{{ item.value }}</strong>
            <span class="supporting-metric__change" :class="`is-${item.status}`">{{ item.change }}</span>
            <span class="supporting-metric__target">{{ item.target }}</span>
          </button>
        </article>

        <article
          v-else-if="isKpiWidget(widget)"
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

        <article
          v-else-if="isChartWidget(widget)"
          class="surface-card chart-card"
          :inert="isEditing"
        >
          <div class="section-title">
            <div>
              <h2>
                <el-icon><component :is="getWidgetIcon(widget)" /></el-icon>
                {{ getWidgetTitle(widget) }}
              </h2>
              <p v-if="getWidgetDescription(widget)" class="section-title__description">
                {{ getWidgetDescription(widget) }}
              </p>
            </div>
          </div>
          <IdmpChart
            :option="getWidgetChartOption(widget)"
            :empty="isChartEmpty(widget)"
            height="100%"
            fit-container
            :aria-label="`${getWidgetTitle(widget)}图表`"
            :updated-at="dashboardQueryLabel"
          >
            <template #table>
              <table
                class="dashboard-chart-table"
                :class="{ 'is-wide': getWidgetTableColumns(widget).length > 2 }"
              >
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
            </template>
          </IdmpChart>
        </article>

        <article v-else-if="widget.type === 'warnings'" class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><Bell /></el-icon>预警指标</h2>
            <button type="button" class="action-link" :tabindex="isEditing ? -1 : 0" @click.stop="goAlerts">查看全部</button>
          </div>
          <ul v-if="dashboardWarnings.length" class="warning-list">
            <li v-for="warning in dashboardWarnings" :key="warning.text">
              <span class="warning-icon" :class="`is-${warning.level}`">
                <el-icon><WarningFilled v-if="warning.level !== 'info'" /><InfoFilled v-else /></el-icon>
              </span>
              <span class="warning-text">{{ warning.text }}</span>
              <time>{{ warning.time }}</time>
            </li>
          </ul>
          <StatePanel v-else type="empty" title="暂无预警数据" description="当前看板查询接口未返回预警事件。" />
        </article>

        <article v-else-if="widget.type === 'ranking'" class="surface-card list-card">
          <div class="section-title">
            <h2><el-icon><TrophyBase /></el-icon>科室指标排名</h2>
          </div>
          <ol class="ranking-list">
            <li v-for="row in departmentRanking" :key="row.department">
              <span class="rank" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span>
              <span class="department">{{ row.department }}</span>
              <span class="rank-bar">
                <i :style="{ width: `${Math.max(14, row.rawValue * 16)}%` }" />
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
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import StatePanel from '@/idmp/components/StatePanel.vue'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchDashboardBootstrap } from '@/idmp/api/modules/analysisDashboard'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import { dashboardTrend, dashboardWarnings as mockDashboardWarnings, departmentRanking as mockDepartmentRanking } from '@/idmp/data/demo'
import { mockIndicatorDataSources } from '@/idmp/features/dashboard/mockData'
import { applyMortalityReadonlyChain } from '@/idmp/features/dashboard/mortalityAdapter'
import {
  DASHBOARD_CODE,
  DASHBOARD_DESIGN_WIDTH,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  DASHBOARD_MIN_WIDTH,
  DEFAULT_DASHBOARD_HEIGHT,
  OBSOLETE_DASHBOARD_LAYOUT_STORAGE_KEYS,
  resizeHandles,
  widgetTypeOptions
} from '@/idmp/features/dashboard/constants'
import {
  cloneLayout,
  constrainWidget,
  createDefaultLayout,
  getWidgetConstraints,
  normalizeLayout,
  widgetStyle
} from '@/idmp/features/dashboard/layout'
import {
  createDashboardChartOption,
  createKpiData,
  getVisualizationTitle
} from '@/idmp/features/dashboard/visualization'

const router = useRouter()
const periodOptions = [
  { label: '全部期间', value: '' },
  { label: '2025 年 12 月', value: '2025-12' }
]
const departmentOptions = [{ label: '全院', value: '' }]
const period = ref('2025-12')
const department = ref('')
const boardRef = ref()
const boardWidth = ref(0)
const isEditing = ref(false)
const activeWidgetId = ref('')
const selectedDataCode = ref('')
const addWidgetType = ref('kpi')
const indicatorDataSources = ref(cloneDashboardSources(mockIndicatorDataSources))
const dashboardStatus = ref('loading')
const dashboardLoadMessage = ref('')
const dashboardLayout = ref(createDefaultLayout())
const editSnapshot = ref([])
const dashboardDefinition = ref(null)
const dashboardQueryResult = ref(null)
let dashboardAbortController
let boardResizeObserver

const dashboardLoading = computed(() => dashboardStatus.value === 'loading')
const dashboardQueryLabel = computed(() => {
  const selectedPeriod = periodOptions.find((item) => item.value === period.value)?.label || '全部期间'
  return `查询条件：${selectedPeriod} · ${department.value ? department.value : '全院'}`
})
const dashboardWarnings = computed(() => dashboardStatus.value === 'ready' ? [] : mockDashboardWarnings)
const departmentRanking = computed(() => {
  const rows = normalizeRanking(dashboardQueryResult.value?.departmentRanking)
  return rows.length ? rows : mockDepartmentRanking.map((item) => ({ ...item, rawValue: Number.parseFloat(item.value) }))
})

const selectedDataSource = computed(() =>
  indicatorDataSources.value.find((source) => source.code === selectedDataCode.value)
)

const dashboardSourceLabel = computed(() => ({
  loading: '正在加载正式数据',
  ready: '正式接口数据',
  empty: '正式接口数据（暂无结果）',
  demo: '演示数据（正式接口不可用）',
  error: '正式接口数据加载失败'
}[dashboardStatus.value] || '正在加载正式数据'))

const effectiveDashboardLayout = computed(() =>
  normalizeLayout(dashboardLayout.value, getDashboardIndicatorSource, getBoardScale())
)

const activeWidget = computed(() =>
  effectiveDashboardLayout.value.find((widget) => widget.id === activeWidgetId.value)
)

const activeWidgetName = computed(() => {
  if (!activeWidget.value) return '未选中组件'
  const widget = activeWidget.value
  return `已选中：${getWidgetTitle(widget)}。位置 ${widget.x}, ${widget.y}；尺寸 ${widget.w} × ${widget.h}。方向键移动，Shift 加方向键调整尺寸，Delete 删除。`
})

const visibleKpis = computed(() => indicatorDataSources.value.map(createKpiData))

const trendTableRows = computed(() => {
  const rows = normalizeMonthlyTrend(dashboardQueryResult.value?.monthlyTrend)
  return rows.length ? rows : dashboardTrend.months.map((period, index) => ({ period, value: dashboardTrend.mortality[index] }))
})

const boardHeight = computed(() => {
  const maxBottom = effectiveDashboardLayout.value.reduce(
    (max, widget) => Math.max(max, widget.y + widget.h),
    0
  )
  return Math.max(DEFAULT_DASHBOARD_HEIGHT, maxBottom)
})

const trendOption = computed(() => ({
  color: [IDMP_CHART_COLORS[0]],
  tooltip: { trigger: 'axis' },
  legend: { show: false },
  grid: { top: 12, left: 44, right: 44, bottom: 46, containLabel: false },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: trendTableRows.value.map((item) => item.period)
  },
  yAxis: [{ type: 'value' }],
  series: [
    {
      name: '指标值',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: trendTableRows.value.map((item) => item.value)
    }
  ]
}))

const rateOption = computed(() => ({
  color: IDMP_CHART_COLORS,
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
        data: departmentRanking.value.map((item) => ({ name: item.department, value: item.rawValue }))
    }
  ]
}))

function isKpiWidget(widget) {
  return widget.type === 'kpi'
}

function isChartWidget(widget) {
  return widget.type === 'chart'
}

function getWidgetKpi(widget) {
  if (typeof widget.kpiIndex === 'number') {
    return visibleKpis.value[widget.kpiIndex] || createKpiData(indicatorDataSources.value[0])
  }
  return createKpiData(getDashboardIndicatorSource(widget.sourceCode) || indicatorDataSources.value[0])
}

function getDashboardIndicatorSource(code) {
  return indicatorDataSources.value.find((source) => source.code === code)
}

function getWidgetIndicatorCode(widget) {
  if (widget.sourceCode) return widget.sourceCode
  if (typeof widget.kpiIndex === 'number') return visibleKpis.value[widget.kpiIndex]?.code || ''
  return widget.data?.code || ''
}

function goWidgetAnalysis(widget) {
  if (isEditing.value) return
  goIndicatorAnalysis(getWidgetIndicatorCode(widget))
}

function goPrimaryMetricAnalysis() {
  if (isEditing.value) return
  goIndicatorAnalysis(visibleKpis.value[0]?.code)
}

function getWidgetTitle(widget) {
  if (widget.type === 'primary') return visibleKpis.value[0]?.title || '重点指标'
  if (widget.type === 'supporting') return '其他核心指标'
  if (isKpiWidget(widget)) return getWidgetKpi(widget).title
  if (widget.type === 'warnings') return '预警指标'
  if (widget.type === 'ranking') return '科室指标排名'
  if (widget.preset === 'trend') return '月度指标趋势'
  if (widget.preset === 'rate') return '科室指标分布'
  if (widget.sourceName) return getVisualizationTitle(widget.sourceName, widget.chartKind)
  return widget.title || widgetTypeOptions.find((item) => item.value === widget.chartKind)?.label || '图表'
}

function getWidgetDescription(widget) {
  if (widget.preset === 'trend') return '按当前筛选条件读取已发布看板的月度数据'
  if (widget.preset === 'rate') return '按当前筛选条件读取已发布看板的科室数据'
  return ''
}

function getWidgetIcon(widget) {
  if (widget.chartKind === 'bar') return Histogram
  if (widget.chartKind === 'pie' || widget.preset === 'rate') return PieChart
  return TrendCharts
}

function getWidgetChartOption(widget) {
  return createDashboardChartOption(widget, {
    trendOption: trendOption.value,
    rateOption: rateOption.value,
    getSource: getDashboardIndicatorSource
  })
}

function isChartEmpty(widget) {
  if (widget.preset === 'trend') return !trendTableRows.value.length
  if (widget.preset === 'rate') return !departmentRanking.value.length
  const source = getDashboardIndicatorSource(widget.sourceCode)
  if (!source) return true
  if (widget.chartKind === 'bar') return !source.departmentData?.length
  if (widget.chartKind === 'pie') return !source.pieData?.length
  return !source.trendData?.length
}

function getWidgetTableColumns(widget) {
  if (widget.preset === 'trend') {
    return [
      { key: 'period', label: '月份' },
      { key: 'value', label: '指标值' }
    ]
  }
  if (widget.preset === 'rate') {
    return [
      { key: 'label', label: '科室' },
      { key: 'value', label: '指标值' }
    ]
  }
  return [
    { key: 'label', label: widget.chartKind === 'line' ? '月份' : '数据项' },
    { key: 'value', label: getWidgetTitle(widget) }
  ]
}

function getWidgetTableRows(widget) {
  if (widget.preset === 'trend') return trendTableRows.value
  if (widget.preset === 'rate') {
    return departmentRanking.value.map((item) => ({ label: item.department, value: item.value }))
  }

  const source = getDashboardIndicatorSource(widget.sourceCode) ||
    indicatorDataSources.value[0] ||
    {}

  if (widget.chartKind === 'bar') {
    return (source.departmentData || []).map((item) => ({ label: item.name, value: item.value }))
  }
  if (widget.chartKind === 'pie') {
    return (source.pieData || []).map((item) => ({ label: item.name, value: item.value }))
  }
  return trendTableRows.value.map((item, index) => ({
    label: item.period,
    value: source.trendData?.[index] ?? '-'
  }))
}

function getWidgetEditLabel(widget) {
  return `${getWidgetTitle(widget)}编辑组件，位置 ${widget.x}, ${widget.y}，尺寸 ${widget.w} × ${widget.h}。使用方向键移动，Shift 加方向键调整尺寸，Delete 删除，Escape 取消选择。`
}

function getBoardScale() {
  const currentWidth = boardWidth.value || boardRef.value?.clientWidth
  return currentWidth ? currentWidth / DASHBOARD_DESIGN_WIDTH : 1
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
    visualType: type,
    x: position.x,
    y: position.y
  }

  if (type === 'kpi') {
    dashboardLayout.value.push(constrainWidget({
      ...baseWidget,
      type: 'kpi',
      data: createKpiData(source),
      w: 240,
      h: 158
    }))
  } else {
    dashboardLayout.value.push(constrainWidget({
      ...baseWidget,
      type: 'chart',
      chartKind: type,
      title: getVisualizationTitle(source.name, type),
      w: 520,
      h: 336
    }))
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
    widget.id === id
      ? constrainWidget({ ...widget, ...partial })
      : widget
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
    const { minW, minH } = getWidgetConstraints(widget, getBoardScale())
    const widthDelta = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
    const heightDelta = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
    updateWidget(widget.id, {
      w: Math.min(
        DASHBOARD_DESIGN_WIDTH - widget.x,
        Math.max(minW, widget.w + widthDelta)
      ),
      h: Math.max(minH, widget.h + heightDelta)
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
  const { minW, minH } = getWidgetConstraints(widget, scale)

  const onMove = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / scale
    const dy = moveEvent.clientY - startY
    let nextX = start.x
    let nextY = start.y
    let nextW = start.w
    let nextH = start.h

    if (handle.includes('e')) {
      nextW = Math.min(
        DASHBOARD_DESIGN_WIDTH - start.x,
        Math.max(minW, start.w + dx)
      )
    }
    if (handle.includes('s')) nextH = Math.max(minH, start.h + dy)
    if (handle.includes('w')) {
      const right = start.x + start.w
      nextW = Math.min(right, Math.max(minW, start.w - dx))
      nextX = right - nextW
    }
    if (handle.includes('n')) {
      const bottom = start.y + start.h
      nextH = Math.min(bottom, Math.max(minH, start.h - dy))
      nextY = bottom - nextH
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
  dashboardLayout.value = normalizeLayout(
    cloneLayout(editSnapshot.value.length ? editSnapshot.value : createDefaultLayout()),
    getDashboardIndicatorSource
  )
  editSnapshot.value = []
  activeWidgetId.value = ''
  isEditing.value = false
}

function saveDashboardLayout() {
  dashboardLayout.value = normalizeLayout(
    dashboardLayout.value,
    getDashboardIndicatorSource
  )
  localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify(dashboardLayout.value))
  editSnapshot.value = []
  activeWidgetId.value = ''
  isEditing.value = false
}

function resetDashboardLayout() {
  dashboardLayout.value = createDefaultLayout()
  activeWidgetId.value = ''
}

function loadDashboardLayout() {
  OBSOLETE_DASHBOARD_LAYOUT_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key))
  try {
    const saved = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) || 'null')
    if (Array.isArray(saved) && saved.length) {
      const normalized = normalizeLayout(saved, getDashboardIndicatorSource)
      if (normalized.length) {
        dashboardLayout.value = normalized
        return
      }
      localStorage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY)
    }
  } catch {
    localStorage.removeItem(DASHBOARD_LAYOUT_STORAGE_KEY)
  }
  dashboardLayout.value = createDefaultLayout()
}

async function loadDashboard() {
  dashboardAbortController?.abort()
  const controller = new AbortController()
  dashboardAbortController = controller
  dashboardStatus.value = 'loading'
  dashboardLoadMessage.value = ''

  try {
    const { definition, queryResult } = await fetchDashboardBootstrap(
      DASHBOARD_CODE,
      buildDashboardQuery(),
      { signal: controller.signal }
    )
    if (controller.signal.aborted) return

    dashboardDefinition.value = definition
    dashboardQueryResult.value = queryResult
    indicatorDataSources.value = createDashboardSources(queryResult)
    selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
    dashboardStatus.value = indicatorDataSources.value.length ? 'ready' : 'empty'
    if (dashboardStatus.value === 'ready') {
      await nextTick()
      observeBoard()
    }
  } catch (error) {
    if (controller.signal.aborted) return
    dashboardDefinition.value = null
    dashboardQueryResult.value = null
    applyDemoDashboard(error)
  }
}

function buildDashboardQuery() {
  const [year, month] = String(period.value || '').split('-')
  return {
    year: year ? Number(year) : null,
    month: month ? Number(month) : null,
    deptCode: department.value || null
  }
}

function createDashboardSources(result = {}) {
  const summary = result?.summaryCards || {}
  const trendData = trendTableRows.value.map((item) => item.value)
  const departmentData = departmentRanking.value.map((item) => ({ name: item.department, value: item.rawValue }))
  const labels = {
    deathNum: '死亡人数',
    dischargeNum: '出院人次',
    outpatientNum: '门诊人次'
  }
  return Object.entries(labels)
    .filter(([key]) => Number.isFinite(Number(summary[key])))
    .map(([key, name]) => ({
      code: `dashboard-summary-${key}`,
      name,
      category: '质量看板汇总',
      unit: '',
      currentValue: formatNumber(summary[key]),
      change: '当前查询结果',
      target: '来源：已发布看板',
      status: 'success',
      origin: 'backend',
      originLabel: '正式结果',
      trendData,
      trendLabels: trendTableRows.value.map((item) => item.period),
      departmentData,
      pieData: departmentData
    }))
}

function applyDemoDashboard(error) {
  indicatorDataSources.value = cloneDashboardSources(mockIndicatorDataSources)
  selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
  dashboardStatus.value = 'demo'
  dashboardLoadMessage.value = `${error?.message || '未能读取已发布看板和正式结果。'} 当前展示演示数据；演示值不代表正式计算结果。`
  nextTick(observeBoard)
  void loadMortalityReadonlyChain()
}

async function loadMortalityReadonlyChain() {
  const chain = await fetchMortalityReadonlyChain().catch(() => null)
  const source = applyMortalityReadonlyChain(indicatorDataSources.value, chain)
  if (source) indicatorDataSources.value = indicatorDataSources.value.map((item) => item.code === source.code ? { ...source, origin: 'backend', originLabel: '后端试算结果' } : item)
}

function cloneDashboardSources(sources) {
  return sources.map((source) => ({
    ...source,
    origin: source.origin || 'demo',
    originLabel: source.originLabel || '演示',
    trendData: [...(source.trendData || [])],
    departmentData: (source.departmentData || []).map((item) => ({ ...item })),
    pieData: (source.pieData || []).map((item) => ({ ...item }))
  }))
}

function normalizeMonthlyTrend(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item) => ({
      period: item?.period || item?.month || '',
      value: Number(item?.value)
    }))
    .filter((item) => item.period !== '' && Number.isFinite(item.value))
}

function normalizeRanking(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item, index) => {
      const rawValue = Number(item?.value)
      return {
        rank: index + 1,
        department: item?.deptName || item?.deptCode || '未命名科室',
        rawValue,
        value: Number.isFinite(rawValue) ? formatNumber(rawValue) : '-'
      }
    })
    .filter((item) => Number.isFinite(item.rawValue))
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value))
}

function observeBoard() {
  if (typeof ResizeObserver === 'undefined' || !boardRef.value) return
  boardWidth.value = boardRef.value.clientWidth
  boardResizeObserver?.disconnect()
  boardResizeObserver = new ResizeObserver(([entry]) => {
    const nextWidth = Math.round(entry.contentRect.width)
    if (!nextWidth || nextWidth === Math.round(boardWidth.value)) return
    boardWidth.value = nextWidth
  })
  boardResizeObserver.observe(boardRef.value)
}

const goAlerts = () => router.push('/alerts')
const goIndicatorAnalysis = (indicatorCode) => {
  if (!indicatorCode) return
  router.push({
    path: '/analysis',
    query: { indicator: indicatorCode }
  })
}

watch([period, department], () => {
  loadDashboard()
})

onMounted(() => {
  loadDashboardLayout()
  loadDashboard()
})

onBeforeUnmount(() => {
  dashboardAbortController?.abort()
  boardResizeObserver?.disconnect()
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

.primary-metric {
  min-height: 246px;
  padding: 18px 22px;
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
  margin-top: 22px;
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
  margin: 18px 0 0;
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
  min-height: 37px;
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

.kpi-card {
  min-height: 158px;
  padding: 16px;
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
  margin-top: 4px;
  color: var(--idmp-text-disabled);
  font-size: 12px;
}

.chart-card {
  display: flex;
  flex-direction: column;
  min-height: 336px;
  padding: 16px 18px 12px;
}

.chart-card > .idmp-chart-frame {
  flex: 1 1 auto;
  min-height: 0;
}

.dashboard-chart-table {
  width: 100%;
  min-width: 0;
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

  &.is-wide {
    min-width: 520px;
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

.dashboard-board-scroll {
  box-sizing: border-box;
  width: calc(100% + 12px);
  margin: -6px -6px 10px;
  padding: 6px;
  overflow-x: auto;
  overflow-y: hidden;
}

.editable-dashboard {
  position: relative;
  width: 100%;
  min-height: 0;
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
  min-height: 0;
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
  .kpi-card {
    padding-right: 13px;
    padding-left: 13px;
  }

  .kpi-card strong {
    font-size: 24px;
  }
}
</style>
