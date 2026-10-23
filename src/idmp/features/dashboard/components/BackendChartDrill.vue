<template>
  <section class="backend-chart-drill" :aria-busy="loading" data-testid="backend-chart-drill">
    <nav class="backend-chart-drill__path" aria-label="图表下钻路径">
      <button type="button" @click="emit('reset')">返回原图表</button>
      <template v-for="(entry, index) in history" :key="`${entry.navigation.currentLevel}-${index}`">
        <span aria-hidden="true">/</span>
        <button type="button" :disabled="index === history.length - 1 || loading" @click="backTo(index)">{{ entry.navigation.label }}</button>
      </template>
      <span v-if="currentEntry" class="backend-chart-drill__level">{{ levelName(currentEntry.navigation.currentLevel) }}<template v-if="kind === 'pie'"> · {{ measure.label }}</template></span>
    </nav>
    <p v-if="notice" class="backend-chart-drill__notice" role="status">{{ notice }} <button v-if="failedNavigation" type="button" @click="retry">重试本层</button><button v-if="failedNavigation && history.length > 1" type="button" @click="backTo(history.length - 2)">返回上一级</button></p>
    <IdmpChart
      :option="chartOption"
      :loading="loading"
      :error="error || chartIssue"
      :empty="!loading && !error && !chartIssue && !currentEntry?.result.records.length"
      :aria-label="`${title}，${currentEntry?.navigation.label || '组织'}${levelName(currentEntry?.navigation.currentLevel)}下钻图表`"
      height="100%"
      fit-container
      @chart-click="onChartClick"
    >
      <template #actions><button type="button" class="backend-chart-drill__retry" @click="retry">重试</button></template>
      <template #table>
        <table>
          <thead><tr><th>{{ levelName(currentEntry?.navigation.currentLevel) }}</th><th>分子</th><th>分母</th><th>指标值</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in currentEntry?.result.records || []" :key="row.resultId || `${row.dimensionKey}-${index}`">
              <td><button v-if="nextNavigation(row)" type="button" @click="openRow(row)">{{ row.dimensionLabel }}</button><span v-else>{{ row.dimensionLabel }}</span></td>
              <td>{{ row.numerator ?? '—' }}</td><td>{{ row.denominator ?? '—' }}</td><td>{{ row.displayValue ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </IdmpChart>
  </section>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { createDashboardChartTheme } from '../chartTheme.js'
import { applyWidgetVisualStyle } from '../visualStyle.js'
import { resolveWidgetSurfaceTone } from '../backgroundAssets.js'
import {
  backendChartMeasure, backendChartValue, chartDrillLevelName, findBackendChartRow,
  initialBackendChartNavigation, loadBackendChartLevel, loadBackendChartRoot, nextBackendChartNavigation
} from '../backendChartDrill.js'

const props = defineProps({ widget: { type: Object, required: true }, kind: { type: String, required: true }, title: String, selectedParams: { type: Object, default: () => ({}) }, unit: { type: String, default: '' } })
const emit = defineEmits(['reset'])
const resolveTarget = inject('dashboardResolveWidgetDrill', async () => null)
const searchDrill = inject('dashboardSearchDrill', searchResultDrill)
const root = ref(null)
const history = ref([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const failedNavigation = ref(null)
let requestId = 0
let abortController
let noticeTimer
const currentEntry = computed(() => history.value.at(-1) || null)
const levelName = level => chartDrillLevelName(level, root.value)
const measure = computed(() => props.kind === 'pie' ? backendChartMeasure(props.widget) : { field: 'value', label: '指标值', error: '' })
const chartIssue = computed(() => {
  if (measure.value.error) return measure.value.error
  const rows = currentEntry.value?.result.records || []
  if (!rows.length) return ''
  const values = rows.map(row => backendChartValue(row, props.kind, props.unit, measure.value.field))
  if (values.some(value => value === null)) return props.kind === 'pie' ? `当前层${measure.value.label}存在缺失、无效或负值，无法绘制饼图；请查看数据表。` : '当前层指标值不完整，无法绘制柱状图；请查看数据表。'
  if (props.kind === 'pie' && values.every(value => value === 0)) return `当前层${measure.value.label}均为 0，无法绘制饼图；请查看数据表。`
  return ''
})
const rawOption = computed(() => {
  const rows = currentEntry.value?.result.records || []
  const data = rows.map((row, index) => ({ id: row.resultId || `${row.dimensionKey}-${index}`, name: row.dimensionLabel, value: backendChartValue(row, props.kind, props.unit, measure.value.field), row }))
  const tooltip = { trigger: props.kind === 'pie' ? 'item' : 'axis', confine: true, formatter: (params) => {
    const item = Array.isArray(params) ? params[0] : params
    const row = item?.data?.row
    return row ? `${row.dimensionLabel}<br/>指标值：${row.displayValue ?? '—'}<br/>分子：${row.numerator ?? '—'}<br/>分母：${row.denominator ?? '—'}` : ''
  } }
  if (props.kind === 'pie') return { tooltip, legend: { type: 'scroll', bottom: 0 }, series: [{ name: measure.value.label, type: 'pie', radius: ['42%', '67%'], center: ['50%', '44%'], minShowLabelAngle: 2, data }] }
  return { tooltip, grid: { top: 22, bottom: 34, left: 12, right: 16, containLabel: true }, dataZoom: rows.length > 15 ? [{ type: 'inside', start: 0, end: 15 / rows.length * 100 }, { type: 'slider', height: 12, bottom: 2, start: 0, end: 15 / rows.length * 100 }] : [], xAxis: { type: 'category', data: rows.map(row => row.dimensionLabel), axisLabel: { hideOverlap: true } }, yAxis: { type: 'value', axisLabel: { formatter: props.unit === '%' ? '{value}%' : '{value}' } }, series: [{ type: 'bar', data, barMaxWidth: 42 }] }
})
const chartOption = computed(() => createDashboardChartTheme(applyWidgetVisualStyle(props.widget, rawOption.value), resolveWidgetSurfaceTone(props.widget)))

function beginRequest() {
  clearTimeout(noticeTimer)
  abortController?.abort()
  abortController = new AbortController()
  requestId += 1
  loading.value = true
  error.value = ''
  notice.value = ''
  return { id: requestId, signal: abortController.signal }
}

async function initialize() {
  const request = beginRequest()
  root.value = null
  history.value = []
  failedNavigation.value = null
  try {
    const target = await resolveTarget(props.widget, props.selectedParams)
    if (request.id !== requestId) return
    if (!target) throw new Error('当前指标没有可用的组织下钻结果')
    const nextRoot = await loadBackendChartRoot(searchDrill, target, { signal: request.signal })
    const departmentNavigation = initialBackendChartNavigation(nextRoot)
    const departments = await loadBackendChartLevel(searchDrill, nextRoot, departmentNavigation, { signal: request.signal })
    if (request.id !== requestId) return
    root.value = nextRoot
    const namedDepartments = departments
    history.value = [{ navigation: departmentNavigation, result: namedDepartments }]
    failedNavigation.value = null
    const selected = findBackendChartRow(namedDepartments, props.selectedParams)
    const next = selected && nextBackendChartNavigation(namedDepartments, selected, departmentNavigation, nextRoot.maxLevel, nextRoot)
    if (next) await openNavigation(next)
  } catch (cause) {
    if (request.id === requestId && cause?.name !== 'AbortError') error.value = cause?.message || '下钻数据加载失败'
  } finally {
    if (request.id === requestId) loading.value = false
  }
}

function nextNavigation(row) {
  const entry = currentEntry.value
  return entry ? nextBackendChartNavigation(entry.result, row, entry.navigation, root.value?.maxLevel, root.value) : null
}

async function openRow(row) {
  if (loading.value || !currentEntry.value) return
  const navigation = nextNavigation(row)
  if (!navigation) {
    clearTimeout(noticeTimer)
    notice.value = '已到当前路径末级'
    noticeTimer = setTimeout(() => { notice.value = '' }, 2500)
    return
  }
  await openNavigation(navigation)
}

async function openNavigation(navigation) {
  const request = beginRequest()
  failedNavigation.value = navigation
  try {
    const result = await loadBackendChartLevel(searchDrill, root.value, navigation, { signal: request.signal })
    if (request.id === requestId) {
      history.value = [...history.value, { navigation, result }]
      failedNavigation.value = null
    }
  } catch (cause) {
    if (request.id === requestId && cause?.name !== 'AbortError') notice.value = `本层下钻失败：${cause?.message || '下钻数据加载失败'}`
  } finally {
    if (request.id === requestId) loading.value = false
  }
}

function onChartClick(params) {
  const row = findBackendChartRow(currentEntry.value?.result, params)
  if (row) void openRow(row)
}

function backTo(index) {
  if (loading.value) return
  clearTimeout(noticeTimer)
  history.value = history.value.slice(0, index + 1)
  error.value = ''
  notice.value = ''
  failedNavigation.value = null
}

function retry() { if (failedNavigation.value && root.value) void openNavigation(failedNavigation.value); else void initialize() }

watch(() => props.selectedParams, () => { void initialize() }, { immediate: true })
onBeforeUnmount(() => { requestId += 1; abortController?.abort(); clearTimeout(noticeTimer) })
</script>

<style scoped>
.backend-chart-drill { position:relative; display:flex; flex:1 1 auto; flex-direction:column; min-height:0; min-width:0; }
.backend-chart-drill :deep(.idmp-chart-frame) { flex:1 1 auto; min-height:0; }
.backend-chart-drill__path { display:flex; align-items:center; gap:5px; min-height:22px; margin:-8px 0 4px; font-size:11px; white-space:nowrap; overflow:auto; }
.backend-chart-drill__path button,.backend-chart-drill table button { border:0; padding:0; background:transparent; color:var(--db-accent,#1261a6); cursor:pointer; }
.backend-chart-drill__path button:disabled { color:inherit; cursor:default; }
.backend-chart-drill__level { margin-left:auto; color:var(--db-secondary,#5c6d75); }
.backend-chart-drill__notice { position:absolute; z-index:2; top:24px; right:8px; max-width:calc(100% - 16px); margin:0; padding:6px 10px; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; background:var(--db-surface,#fff); box-shadow:0 2px 8px #25343b1a; font-size:11px; color:var(--db-secondary,#5c6d75); }
.backend-chart-drill__notice button { margin-left:8px; border:0; padding:0; background:transparent; color:var(--db-accent,#1261a6); cursor:pointer; }
.backend-chart-drill table { width:100%; border-collapse:collapse; font-size:12px; }
.backend-chart-drill th,.backend-chart-drill td { padding:5px 8px; border-bottom:1px solid var(--db-border,#e3e9eb); text-align:left; }
.backend-chart-drill__retry { border:1px solid var(--db-accent,#1261a6); border-radius:4px; padding:4px 10px; background:transparent; color:var(--db-accent,#1261a6); cursor:pointer; }
</style>
