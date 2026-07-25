<template>
  <div class="idmp-chart-frame" :aria-busy="loading">
    <StatePanel
      v-if="loading"
      type="loading"
      title="正在加载图表"
      description="正在获取最新指标数据。"
      :style="{ minHeight: height }"
    />
    <StatePanel
      v-else-if="permissionDenied"
      type="permission"
      :style="{ minHeight: height }"
    />
    <StatePanel
      v-else-if="error"
      type="error"
      title="图表加载失败"
      :description="error"
      :style="{ minHeight: height }"
    >
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
    </StatePanel>
    <StatePanel
      v-else-if="empty"
      type="empty"
      title="暂无图表数据"
      description="当前筛选条件下没有可用于绘图的数据。"
      :style="{ minHeight: height }"
    />
    <div
      v-else
      ref="chartEl"
      class="idmp-chart"
      :style="{ height }"
      role="img"
      :aria-label="ariaLabel"
    />

    <div v-if="updatedAt || $slots.table" class="idmp-chart__footer">
      <span v-if="updatedAt">数据更新：{{ updatedAt }}</span>
      <details v-if="$slots.table" class="idmp-chart__table">
        <summary>{{ tableLabel }}</summary>
        <slot name="table" />
      </details>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { IDMP_CHART_THEME, normalizeChartOption } from '@/idmp/charts/theme'

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
  tableLabel: { type: String, default: '查看数据表' }
})

const emit = defineEmits(['chart-click'])
const chartEl = ref()
let chart
let resizeObserver

const observeChart = () => {
  if (!chartEl.value || !('ResizeObserver' in window)) return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(resizeChart)
  resizeObserver.observe(chartEl.value)
}

const renderChart = async () => {
  await nextTick()
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value, THEME_NAME)
    chart.on('click', (params) => emit('chart-click', params))
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const chartOption = normalizeChartOption({
    animation: !reducedMotion,
    ...props.option
  })
  chartOption.aria = { ...chartOption.aria, enabled: false }
  chart.setOption(chartOption, { notMerge: true })
  chartEl.value.setAttribute('aria-label', props.ariaLabel)
  observeChart()
}

const resizeChart = () => chart?.resize()

onMounted(() => {
  renderChart()
  window.addEventListener('resize', resizeChart)
})

watch(
  () => [props.option, props.loading, props.empty, props.permissionDenied, props.error, props.ariaLabel],
  () => {
    if (props.loading || props.empty || props.permissionDenied || props.error) {
      chart?.dispose()
      chart = undefined
      return
    }
    renderChart()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<style scoped lang="scss">
.idmp-chart-frame {
  width: 100%;
  min-width: 0;
}

.idmp-chart {
  width: 100%;
  min-width: 0;
}

.idmp-chart__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 28px;
  padding-top: 6px;
  gap: 16px;
  color: var(--idmp-text-helper);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.idmp-chart__table {
  color: var(--idmp-text-secondary);

  summary {
    color: var(--idmp-interactive);
    cursor: pointer;
  }
}
</style>
