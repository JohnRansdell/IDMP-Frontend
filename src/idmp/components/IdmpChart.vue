<template>
  <div
    class="idmp-chart-frame"
    :class="{ 'is-fit-container': fitContainer }"
    :style="frameStyle"
    :aria-busy="loading"
  >
    <StatePanel
      v-if="loading"
      class="idmp-chart__state"
      type="loading"
      title="正在加载图表"
      description="正在获取最新指标数据。"
      :style="stateStyle"
    />
    <StatePanel
      v-else-if="permissionDenied"
      class="idmp-chart__state"
      type="permission"
      :style="stateStyle"
    />
    <StatePanel
      v-else-if="error"
      class="idmp-chart__state"
      type="error"
      title="图表加载失败"
      :description="error"
      :style="stateStyle"
    >
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </StatePanel>
    <StatePanel
      v-else-if="empty"
      class="idmp-chart__state"
      type="empty"
      title="暂无图表数据"
      description="当前筛选条件下没有可用于绘图的数据。"
      :style="stateStyle"
    />
    <div
      v-else
      ref="chartEl"
      class="idmp-chart"
      :style="chartStyle"
      role="img"
      :aria-label="ariaLabel"
    />

    <div v-if="updatedAt || $slots.table" class="idmp-chart__footer">
      <div class="idmp-chart__footer-row">
        <span
          v-if="updatedAt"
          class="idmp-chart__updated-at"
          :title="`数据更新：${updatedAt}`"
        >
          数据更新：{{ updatedAt }}
        </span>
        <button
          v-if="$slots.table"
          type="button"
          class="idmp-chart__table-toggle"
          :aria-expanded="tableExpanded"
          :aria-controls="tablePanelId"
          @click="toggleTable"
        >
          <span
            class="idmp-chart__table-caret"
            :class="{ 'is-expanded': tableExpanded }"
            aria-hidden="true"
          >
            ▾
          </span>
          {{ tableLabel }}
        </button>
      </div>
      <div
        v-if="$slots.table"
        v-show="tableExpanded"
        :id="tablePanelId"
        class="idmp-chart__table-panel"
        role="region"
        :aria-label="tableLabel"
      >
        <slot name="table" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, useId, watch } from 'vue'
import * as echarts from 'echarts'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { IDMP_CHART_THEME, normalizeChartOption } from '@/idmp/charts/theme'
import { withCategoryViewport } from '@/idmp/charts/categoryViewport.js'

const THEME_NAME = 'idmp-clinical'
echarts.registerTheme(THEME_NAME, IDMP_CHART_THEME)

const props = defineProps({
  option: {
    type: Object,
    required: true
  },
  height: {
    type: String,
    default: '320px'
  },
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  permissionDenied: { type: Boolean, default: false },
  error: { type: String, default: '' },
  updatedAt: { type: String, default: '' },
  ariaLabel: { type: String, default: '指标数据图表' },
  tableLabel: { type: String, default: '查看数据表' },
  fitContainer: { type: Boolean, default: false }
})

const emit = defineEmits(['chart-click'])
const chartEl = ref()
const tableExpanded = ref(false)
const tablePanelId = `idmp-chart-table-${useId()}`
const frameStyle = computed(() => (
  props.fitContainer ? { height: props.height } : undefined
))
const chartStyle = computed(() => (
  props.fitContainer ? undefined : { height: props.height }
))
const stateStyle = computed(() => (
  props.fitContainer ? undefined : { minHeight: props.height }
))
let chart
let resizeObserver
let active = true
let disposed = false
let renderPending = true
let resizeFrame
let chartWidth = 0
let chartHeight = 0

const observeChart = () => {
  if (!active || disposed || !chartEl.value?.isConnected || !('ResizeObserver' in window)) return
  resizeObserver?.disconnect()
  resizeObserver ||= new ResizeObserver(resizeChart)
  resizeObserver.observe(chartEl.value)
}

const updateChart = () => {
  resizeFrame = undefined
  const element = chartEl.value
  if (!active || disposed || !element?.isConnected) return
  const width = element.clientWidth
  const height = element.clientHeight
  if (width <= 0 || height <= 0) return
  if (!chart) {
    chart = echarts.init(element, THEME_NAME)
    chart.on('click', (params) => emit('chart-click', params))
    chartWidth = width
    chartHeight = height
  }
  const sizeChanged = width !== chartWidth || height !== chartHeight
  if (renderPending || sizeChanged) {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const previousStart = renderPending ? 0 : chart.getOption()?.dataZoom?.find(item => item.id === 'idmp-category-slider')?.startValue
    const chartOption = withCategoryViewport(normalizeChartOption({
      animation: !reducedMotion,
      ...props.option
    }), width, height, previousStart)
    const mapDefinition = chartOption.__mapDefinition
    if (mapDefinition?.name && mapDefinition.geoJSON) echarts.registerMap(mapDefinition.name, mapDefinition.geoJSON)
    delete chartOption.__mapDefinition
    chartOption.aria = { ...chartOption.aria, enabled: false }
    chart.setOption(chartOption, { notMerge: true })
    element.setAttribute('aria-label', props.ariaLabel)
    renderPending = false
  }
  if (width !== chartWidth || height !== chartHeight) {
    chart.resize({ width, height })
    chartWidth = width
    chartHeight = height
  }
}

const resizeChart = () => {
  if (!active || disposed || resizeFrame !== undefined) return
  resizeFrame = window.requestAnimationFrame(updateChart)
}

const renderChart = async () => {
  renderPending = true
  await nextTick()
  observeChart()
  resizeChart()
}

const pauseChart = () => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  if (resizeFrame !== undefined) window.cancelAnimationFrame(resizeFrame)
  resizeFrame = undefined
}

const toggleTable = async () => {
  tableExpanded.value = !tableExpanded.value
  await nextTick()
  resizeChart()
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onDeactivated(() => {
  active = false
  pauseChart()
})

onActivated(async () => {
  if (active) return
  active = true
  window.addEventListener('resize', resizeChart)
  await nextTick()
  observeChart()
  resizeChart()
})

watch(
  () => [props.option, props.loading, props.empty, props.permissionDenied, props.error, props.ariaLabel],
  () => {
    if (props.loading || props.empty || props.permissionDenied || props.error) {
      pauseChart()
      chart?.dispose()
      chart = undefined
      renderPending = true
      return
    }
    if (active && !disposed) window.addEventListener('resize', resizeChart)
    renderChart()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  disposed = true
  pauseChart()
  chart?.dispose()
  chart = undefined
})
</script>

<style scoped lang="scss">
.idmp-chart-frame {
  width: 100%;
  min-width: 0;

  &.is-fit-container {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
}

.idmp-chart {
  width: 100%;
  min-width: 0;
}

.idmp-chart-frame.is-fit-container .idmp-chart,
.idmp-chart-frame.is-fit-container .idmp-chart__state {
  flex: 1 1 auto;
  min-height: 0;
}

.idmp-chart-frame.is-fit-container .idmp-chart {
  min-height: min(160px, calc(100% - 28px));
}

.idmp-chart__footer {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding-top: 6px;
  color: var(--idmp-text-helper);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.idmp-chart-frame.is-fit-container .idmp-chart__footer {
  flex: 0 1 auto;
  max-height: calc(45% + 28px);
  overflow: hidden;
}

.idmp-chart__footer-row {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
  min-height: 22px;
  gap: 16px;
}

.idmp-chart__updated-at {
  min-width: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idmp-chart__table-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--idmp-interactive);
  cursor: pointer;
  font: inherit;
  white-space: nowrap;

  &:focus-visible {
    border-radius: 2px;
    outline: 2px solid var(--idmp-focus, var(--idmp-interactive));
    outline-offset: 2px;
  }
}

.idmp-chart__table-caret {
  display: inline-block;
  margin-right: 3px;
  transition: transform 0.16s ease;
  transform: rotate(-90deg);

  &.is-expanded {
    transform: rotate(0);
  }
}

.idmp-chart__table-panel {
  align-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  max-height: 280px;
  margin-top: 6px;
  overflow: auto;
  color: var(--idmp-text-secondary);
  overscroll-behavior: contain;
}

.idmp-chart-frame.is-fit-container .idmp-chart__table-panel {
  flex: 1 1 auto;
  max-height: none;
}
</style>
