<template>
  <div ref="chartEl" class="idmp-chart" :style="{ height }" />
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: {
    type: Object,
    required: true
  },
  height: {
    type: String,
    default: '320px'
  }
})

const chartEl = ref()
let chart
let resizeObserver

const renderChart = async () => {
  await nextTick()
  if (!chartEl.value) return
  if (!chart) chart = echarts.init(chartEl.value)
  chart.setOption(props.option, { notMerge: true })
}

const resizeChart = () => chart?.resize()

onMounted(() => {
  renderChart()
  window.addEventListener('resize', resizeChart)
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resizeChart)
    resizeObserver.observe(chartEl.value)
  }
})

watch(() => props.option, renderChart, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<style scoped>
.idmp-chart {
  width: 100%;
  min-width: 0;
}
</style>
