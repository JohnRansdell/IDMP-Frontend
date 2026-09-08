<template>
  <section class="dashboard-drill-pie" :aria-label="`${title}原地下钻`" :aria-busy="loading">
    <nav class="pie-navigation" aria-label="图表下钻路径">
      <div class="pie-breadcrumb">
        <template v-for="(item, index) in history" :key="index">
          <span v-if="index" aria-hidden="true">/</span>
          <button
            type="button"
            :disabled="disabled || index === history.length - 1"
            :aria-current="index === history.length - 1 ? 'location' : undefined"
            :title="item.label"
            @click="goBack(index)"
          >{{ item.label }}</button>
        </template>
      </div>
      <button v-if="history.length > 1" type="button" class="action-link" @click="goBack(history.length - 2)">返回上一级</button>
    </nav>

    <div class="pie-context" role="status" aria-live="polite">
      <span :class="{ 'is-demo': source === 'mock' }">{{ source === 'mock' ? '演示数据' : '正式接口数据' }}</span>
      <span>{{ levelLabel }} · {{ numeratorLabel }}</span>
      <span v-if="result?.context.period">结果期间：{{ result.context.period }}</span>
      <span v-if="isLeaf && !loading && !error">已到末级</span>
    </div>

    <StatePanel v-if="disabled" type="unavailable" title="编辑模式" description="保存或取消编辑后可下钻。" />
    <StatePanel v-else-if="loading" type="loading" title="正在加载当前层" description="正在校验完整分布与结果快照。" />
    <StatePanel
      v-else-if="error"
      :type="error.status === 403 ? 'permission' : 'error'"
      :title="error.status === 409 ? '结果上下文不一致' : error.status === 401 ? '登录状态已失效' : ''"
      :description="error.message"
    >
      <template #actions><el-button size="small" @click="loadLevel(pageNum, tableOnlyMode)">重新加载</el-button></template>
    </StatePanel>
    <template v-else-if="result">
      <p v-if="result.chartIssue" class="pie-notice" role="status">{{ result.chartIssue }}</p>
      <IdmpChart
        v-else
        class="pie-chart"
        :option="chartOption"
        :empty="!result.records.length"
        height="100%"
        fit-container
        :aria-label="`${currentNavigation.label}，${levelLabel}${numeratorLabel}分布，可通过数据表下钻`"
        @chart-click="onChartClick"
      />
      <div class="pie-table-toolbar">
        <span class="pie-result-meta" :title="resultMetadata">{{ resultMetadata }}</span>
        <button
          v-if="!result.chartIssue"
          type="button"
          class="action-link"
          :aria-expanded="tableExpanded"
          :aria-controls="tableId"
          @click="tableExpanded = !tableExpanded"
        >{{ tableExpanded ? '收起数据表' : '查看数据表' }}</button>
      </div>
      <div
        v-show="tableExpanded || result.chartIssue"
        :id="tableId"
        class="pie-table-panel"
        :class="{ 'is-table-only': result.chartIssue }"
        role="region"
        :aria-label="`${currentNavigation.label}数据表`"
        tabindex="0"
      >
        <table class="pie-table">
          <thead><tr><th scope="col">{{ levelLabel }}</th><th scope="col">{{ numeratorLabel }}</th><th scope="col">分母</th><th scope="col">指标值</th><th scope="col">操作</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in result.records" :key="`${row.dimensionKey}-${index}`">
              <th scope="row">{{ row.dimensionLabel }}</th>
              <td>{{ displayNumber(row.numerator) }}{{ numeratorUnit }}</td>
              <td>{{ displayNumber(row.denominator) }}</td>
              <td>{{ displayIndicator(row) }}</td>
              <td>
                <button v-if="nextNavigation(row)" type="button" class="action-link" :aria-label="`下钻${row.dimensionLabel}`" @click="openRow(row)">下钻</button>
                <span v-else>不可下钻</span>
              </td>
            </tr>
            <tr v-if="!result.records.length"><td colspan="5">当前层暂无数据</td></tr>
          </tbody>
        </table>
      </div>
      <div v-if="result.paged" class="pie-pagination" aria-label="数据表分页">
        <button type="button" class="action-link" :disabled="pageNum <= 1" @click="loadLevel(pageNum - 1, true)">上一页</button>
        <span>第 {{ pageNum }} 页<span v-if="reliableTotal !== null">，共 {{ reliableTotal }} 条</span></span>
        <button type="button" class="action-link" :disabled="!hasNextPage" @click="loadLevel(pageNum + 1, true)">下一页</button>
      </div>
    </template>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { normalizeOrganizationDrillLevel } from '@/idmp/api/adapters/drill'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import {
  createPieDrillRequestGate,
  getPieNextNavigation,
  loadPieDrillLevel,
  numericPieValue,
  resolvePieDrillRoot
} from './pieDrill.js'

const props = defineProps({
  targets: { type: Array, required: true },
  source: { type: String, default: 'live' },
  title: { type: String, default: '科室指标分布' },
  numeratorLabel: { type: String, default: '分子值' },
  numeratorUnit: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})
const tableId = `pie-drill-table-${useId()}`
const history = ref([])
const root = ref(null)
const result = ref(null)
const loading = ref(false)
const error = ref(null)
const tableExpanded = ref(false)
const pageNum = ref(1)
const tableOnlyMode = ref(false)
const requestGate = createPieDrillRequestGate()
const currentNavigation = computed(() => history.value.at(-1) || {})
const levelLabel = computed(() => ({
  OUT_DEPT: '科室', MEDICAL_GROUP: '医疗组', ATTENDING_DOCTOR: '医师'
}[normalizeOrganizationDrillLevel(currentNavigation.value.currentLevel)] || '组织'))
const isLeaf = computed(() => result.value?.records.length && !result.value.records.some((row) => nextNavigation(row)))
const reliableTotal = computed(() => {
  const info = result.value?.pageInfo
  return info?.hasTotal && Number.isSafeInteger(info.total) && info.total >= 0 ? info.total : null
})
const hasNextPage = computed(() => {
  const info = result.value?.pageInfo || {}
  return reliableTotal.value === null
    ? result.value?.records.length >= (info.pageSize || 200)
    : pageNum.value * (info.pageSize || 200) < reliableTotal.value
})
const resultMetadata = computed(() => {
  const context = result.value?.context || {}
  return [
    `快照：${context.snapshotId || '未提供'}`,
    `版本：${context.indicatorVersionId || '未提供'}`,
    context.batchId && `批次：${context.batchId}`,
    context.dataWatermark && `水位：${context.dataWatermark}`,
    `更新：${context.updatedAt || result.value?.updatedAt || '接口未提供'}`
  ].filter(Boolean).join(' · ')
})
const chartOption = computed(() => ({
  color: IDMP_CHART_COLORS,
  tooltip: {
    trigger: 'item',
    renderMode: 'richText',
    confine: true,
    formatter: ({ data }) => {
      const row = data.row
      return `${row.dimensionLabel}\n${props.numeratorLabel}：${displayNumber(row.numerator)}${props.numeratorUnit}\n分母：${displayNumber(row.denominator)}\n指标值：${displayIndicator(row)}`
    }
  },
  legend: { type: 'scroll', bottom: 0, left: 'center', itemWidth: 12, itemHeight: 9 },
  series: [{
    id: 'organization-numerator',
    type: 'pie',
    radius: ['44%', '68%'],
    center: ['50%', '43%'],
    stillShowZeroSum: false,
    minShowLabelAngle: 2,
    avoidLabelOverlap: true,
    label: { fontSize: 11, formatter: ({ data }) => `${data.name}\n${displayNumber(data.value)}${props.numeratorUnit}` },
    labelLine: { length: 8, length2: 6 },
    itemStyle: { borderColor: '#fff', borderWidth: 1 },
    emphasis: { scaleSize: 5 },
    data: (result.value?.records || []).map((row) => ({
      id: row.dimensionKey,
      name: row.dimensionLabel,
      value: numericPieValue(row.numerator),
      cursor: nextNavigation(row) ? 'pointer' : 'default',
      row
    }))
  }]
}))

function displayNumber(value) {
  const numeric = numericPieValue(value)
  return numeric === null ? '-' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(numeric)
}

function displayIndicator(row) {
  const value = row.displayValue ?? row.indicatorValue
  if (value === null || value === undefined || value === '') return '-'
  const unit = row.unit || ''
  return `${value}${unit && !String(value).endsWith(unit) ? unit : ''}`
}

function nextNavigation(row) {
  return result.value ? getPieNextNavigation(result.value, row, currentNavigation.value) : null
}

function onChartClick(params) {
  const row = result.value?.records.find((item) => item.dimensionKey === params?.data?.row?.dimensionKey)
  if (row) openRow(row)
}

function openRow(row) {
  if (props.disabled || loading.value) return
  const navigation = nextNavigation(row)
  if (!navigation) return
  history.value.push(navigation)
  tableExpanded.value = false
  loadLevel()
}

function goBack(index) {
  if (props.disabled || index < 0) return
  history.value = history.value.slice(0, index + 1)
  tableExpanded.value = false
  loadLevel()
}

async function loadLevel(nextPage = 1, tableOnly = false) {
  const request = requestGate.begin()
  error.value = null
  loading.value = false
  if (props.disabled) return
  if (!root.value || root.value.error) {
    error.value = new Error(root.value?.error || '未提供可靠的下钻上下文。')
    return
  }
  const previousIssue = result.value?.chartIssue
  result.value = null
  loading.value = true
  pageNum.value = nextPage
  tableOnlyMode.value = tableOnly
  try {
    const loaded = await loadPieDrillLevel(searchResultDrill, root.value, currentNavigation.value, {
      signal: request.signal, pageNum: nextPage, tableOnly
    })
    if (!request.isCurrent()) return
    if (!root.value.target.snapshotId) root.value.target.snapshotId = loaded.context.snapshotId
    result.value = { ...loaded, chartIssue: tableOnly ? previousIssue || loaded.chartIssue || '当前为分页数据表，不绘制部分总体。' : loaded.chartIssue }
  } catch (cause) {
    if (!request.isCurrent()) return
    error.value = cause
  } finally {
    if (request.isCurrent()) loading.value = false
  }
}

watch(() => JSON.stringify([props.targets, props.source, props.disabled]), () => {
  requestGate.cancel()
  root.value = resolvePieDrillRoot(props.targets, props.source)
  history.value = root.value?.error ? [] : [{ currentLevel: root.value.currentLevel, parentKeys: root.value.parentKeys, label: '全部科室' }]
  result.value = null
  tableExpanded.value = false
  loadLevel()
}, { immediate: true })

onBeforeUnmount(() => requestGate.cancel())
</script>

<style scoped lang="scss">
.dashboard-drill-pie {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  font-size: 12px;
}

.pie-navigation,
.pie-breadcrumb,
.pie-context,
.pie-table-toolbar,
.pie-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pie-navigation { justify-content: space-between; min-height: 26px; }
.pie-breadcrumb { overflow: auto; }
.pie-breadcrumb button {
  max-width: 130px;
  overflow: hidden;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--idmp-interactive);
  cursor: pointer;
  font: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pie-breadcrumb button:disabled { color: var(--idmp-text-secondary); cursor: default; }
button:focus-visible { outline: 2px solid var(--idmp-interactive); outline-offset: 2px; }
.action-link { white-space: nowrap; }
.action-link:disabled { color: var(--idmp-text-disabled); cursor: default; }
.pie-context { flex-wrap: wrap; min-height: 22px; color: var(--idmp-text-helper); font-size: 11px; }
.is-demo { color: var(--idmp-support-warning); }
.pie-chart { flex: 1 1 auto; min-height: 140px; }
.pie-notice { flex: 0 0 auto; margin: 4px 0; color: var(--idmp-support-warning); line-height: 18px; }
.pie-table-toolbar { flex: 0 0 auto; justify-content: space-between; min-height: 25px; }
.pie-result-meta { overflow: hidden; color: var(--idmp-text-helper); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.pie-table-panel { flex: 0 1 45%; min-height: 60px; overflow: auto; }
.pie-table-panel.is-table-only { flex: 1 1 auto; }
.pie-table { width: 100%; min-width: 440px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.pie-table th,
.pie-table td { padding: 6px 8px; border-bottom: 1px solid var(--idmp-border-soft); text-align: right; white-space: nowrap; }
.pie-table th:first-child { text-align: left; }
.pie-table thead { background: var(--idmp-layer-02); }
.pie-pagination { flex: 0 0 auto; justify-content: flex-end; padding-top: 6px; }
</style>
