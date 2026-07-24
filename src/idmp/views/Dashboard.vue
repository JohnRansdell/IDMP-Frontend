<template>
  <div class="idmp-page dashboard-page">
    <PageHeader title="指标看板">
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

    <section v-if="isEditing" class="surface-card dashboard-editor-panel">
      <div class="dashboard-editor-panel__left">
        <span class="dashboard-editor-panel__label">数据组件</span>
        <el-select v-model="selectedDataCode" class="dashboard-editor-panel__data-select" aria-label="指标数据">
          <el-option
            v-for="source in indicatorDataSources"
            :key="source.code"
            :label="source.name"
            :value="source.code"
          >
            <span>{{ source.name }}</span>
            <span class="dashboard-editor-panel__option-meta">{{ source.category }}</span>
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
        <span class="dashboard-editor-panel__hint">{{ activeWidgetName }}</span>
        <el-button :icon="Delete" :disabled="!activeWidget" @click="deleteActiveWidget">删除选中</el-button>
      </div>
    </section>

    <template v-if="!hasCustomLayout && !isEditing">
      <section class="kpi-grid" aria-label="核心指标">
        <article
          v-for="(item, index) in visibleKpis"
          :key="item.title"
          class="surface-card kpi-card is-clickable"
          role="button"
          tabindex="0"
          @click="goIndicatorAnalysis(getKpiIndicatorCode(index, item))"
          @keydown.enter.prevent="goIndicatorAnalysis(getKpiIndicatorCode(index, item))"
          @keydown.space.prevent="goIndicatorAnalysis(getKpiIndicatorCode(index, item))"
        >
          <div class="kpi-card__top">
            <span>{{ item.title }}</span>
            <span class="kpi-dot" :class="`is-${item.status}`" />
          </div>
          <strong>{{ item.value }}</strong>
          <div class="kpi-change" :class="`is-${item.status}`">{{ item.change }}</div>
          <div class="kpi-target">{{ item.target }}</div>
        </article>
      </section>

      <section class="chart-grid">
        <article class="surface-card chart-card">
          <div class="section-title">
            <h2><el-icon><TrendCharts /></el-icon>指标趋势（近12月）</h2>
          </div>
          <IdmpChart :option="trendOption" height="278px" />
        </article>
        <article class="surface-card chart-card">
          <div class="section-title">
            <h2><el-icon><PieChart /></el-icon>分类达标率</h2>
          </div>
          <IdmpChart :option="rateOption" height="278px" />
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
        @pointerdown.stop="onWidgetPointerDown($event, widget)"
      >
        <article
          v-if="isKpiWidget(widget)"
          class="surface-card kpi-card"
          :class="{ 'is-clickable': !isEditing }"
          role="button"
          tabindex="0"
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
          <IdmpChart :option="getWidgetChartOption(widget)" height="calc(100% - 38px)" />
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
import { fetchDashboardBootstrap } from '@/idmp/api/modules/analysisDashboard'
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

const activeWidget = computed(() =>
  dashboardLayout.value.find((widget) => widget.id === activeWidgetId.value)
)

const activeWidgetName = computed(() => {
  if (!activeWidget.value) return '未选中组件'
  return `已选中：${getWidgetTitle(activeWidget.value)}`
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

const boardHeight = computed(() => {
  const maxBottom = dashboardLayout.value.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0)
  return Math.max(DEFAULT_DASHBOARD_HEIGHT, maxBottom)
})

const trendOption = computed(() => ({
  animationDuration: 500,
  color: ['#f5222d', '#faad14', '#1890ff'],
  tooltip: { trigger: 'axis' },
  legend: {
    bottom: 0,
    itemWidth: 14,
    itemHeight: 8,
    textStyle: { color: '#595959', fontSize: 12 }
  },
  grid: { top: 12, left: 44, right: 44, bottom: 46, containLabel: false },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: dashboardTrend.months,
    axisLine: { lineStyle: { color: '#d9d9d9' } },
    axisLabel: { color: '#8c8c8c' }
  },
  yAxis: [
    {
      type: 'value',
      min: 0,
      max: 4,
      axisLabel: { color: '#8c8c8c' },
      splitLine: { lineStyle: { color: '#eeeeee' } }
    },
    {
      type: 'value',
      min: 0,
      max: 50,
      axisLabel: { color: '#8c8c8c' },
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
  color: ['#52c41a', '#faad14', '#f5222d'],
  tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
  legend: {
    bottom: 2,
    left: 'center',
    itemWidth: 18,
    itemHeight: 10,
    textStyle: { color: '#595959', fontSize: 12 }
  },
  series: [
    {
      type: 'pie',
      radius: ['49%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        color: '#595959',
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

async function loadBackendDashboardContract() {
  backendDashboard.value = await fetchDashboardBootstrap(DASHBOARD_CODE, {
    year: 2025,
    month: 12,
    deptCode: null
  })
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

const goAlerts = () => router.push('/alerts')
const goIndicatorAnalysis = (indicatorCode) => {
  router.push({
    path: '/analysis',
    query: { indicator: indicatorCode || 'SURGERY_COMPLICATION' }
  })
}

onMounted(() => {
  loadDashboardLayout()
  loadBackendDashboardContract()
  loadMortalityReadonlyChain()
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
  color: #595959;
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
  color: #b1b3b7;
  font-size: 12px;
}

.dashboard-editor-panel__hint {
  max-width: 280px;
  overflow: hidden;
  color: #8c8c8c;
  font-size: 13px;
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
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    border-color: #91d5ff;
    box-shadow: 0 8px 22px rgb(24 144 255 / 10%);
    transform: translateY(-1px);
  }
}

.kpi-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 40px;
  gap: 8px;
  color: #6b6f76;
  font-size: 13px;
  line-height: 20px;
}

.kpi-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 3px;
  border-radius: 50%;
  background: #52c41a;

  &.is-danger { background: #f5222d; }
  &.is-warning { background: #faad14; }
}

.kpi-card strong {
  display: block;
  margin: 7px 0 4px;
  color: #171717;
  font-size: 27px;
  font-weight: 650;
  line-height: 34px;
}

.kpi-change {
  color: #f5222d;
  font-size: 12px;

  &.is-success { color: #52c41a; }
  &.is-warning { color: #fa8c16; }
}

.kpi-target {
  margin-top: 5px;
  color: #a2a4a8;
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
  border-bottom: 1px solid #f0f0f0;
  gap: 10px;

  &:last-child {
    border-bottom: 0;
  }

  time {
    color: #b1b3b7;
    font-size: 12px;
  }
}

.warning-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 50%;
  background: #fff2f0;
  color: #f5222d;

  &.is-warning {
    background: #fffbe6;
    color: #faad14;
  }

  &.is-info {
    background: #e6f7ff;
    color: #1890ff;
  }
}

.warning-text {
  min-width: 0;
  overflow: hidden;
  color: #434343;
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
  background: #f0f2f5;
  color: #8c8c8c;
  font-size: 12px;

  &.is-top {
    background: #e6f7ff;
    color: #1890ff;
    font-weight: 600;
  }
}

.department {
  color: #434343;
}

.rank-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 6px;
  background: #f0f2f5;

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #69c0ff, #1890ff);
  }
}

.ranking-list strong {
  color: #434343;
  text-align: right;
}

.editable-dashboard {
  position: relative;
  width: 100%;
  min-height: 812px;
  margin-bottom: 16px;
}

.editable-dashboard.is-editing {
  border: 1px dashed #91caff;
  border-radius: 8px;
  background:
    linear-gradient(90deg, rgb(24 144 255 / 5%) 1px, transparent 1px),
    linear-gradient(rgb(24 144 255 / 5%) 1px, transparent 1px),
    transparent;
  background-size: 24px 24px;
}

.editable-dashboard__item {
  position: absolute;
  min-width: 0;
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
  border: 1.5px solid var(--idmp-primary);
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
  transform: translate(-50%, -50%);
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
</style>
