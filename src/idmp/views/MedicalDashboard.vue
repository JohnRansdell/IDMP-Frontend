<template>
  <main class="medical-dashboard">
    <header class="medical-header">
      <div><span class="medical-brand">IDMP</span><h1>{{ schema?.name || '指标看板' }}</h1></div>
      <div class="medical-account"><span>{{ identity?.doctorNo }}</span><span>{{ identity?.deptCode }}</span>
        <el-button v-if="schema" :icon="Back" title="返回看板目录" aria-label="返回看板目录" @click="router.push('/medical-dashboard')" />
        <el-button :icon="SwitchButton" title="退出登录" aria-label="退出登录" @click="logout" />
      </div>
    </header>
    <StatePanel v-if="initializing" type="loading" title="正在读取看板" />
    <StatePanel v-else-if="error" type="error" title="看板访问失败" :description="error">
      <template #actions><el-button @click="initialize">重试</el-button><el-button @click="router.replace('/login')">返回登录页</el-button></template>
    </StatePanel>
    <template v-else-if="schema">
      <form class="medical-toolbar" @submit.prevent="refresh">
        <el-radio-group v-model="granularity" size="small" aria-label="统计周期"><el-radio-button value="MONTHLY">月度</el-radio-button><el-radio-button value="QUARTERLY">季度</el-radio-button><el-radio-button value="YEARLY">年度</el-radio-button></el-radio-group>
        <label v-if="granularity === 'MONTHLY'">月份<input v-model="month" type="month" required /></label>
        <template v-else><label>年份<input v-model="year" type="number" min="1900" max="2200" required /></label><label v-if="granularity === 'QUARTERLY'">季度<select v-model="quarter"><option v-for="n in 4" :key="n" :value="n">第 {{ n }} 季度</option></select></label></template>
        <el-button native-type="submit" :icon="Refresh" :loading="loading">查询</el-button>
        <span v-if="updatedAt" class="medical-updated">更新于 {{ updatedAt }}</span>
      </form>
      <p v-if="queryError" class="medical-query-error" role="alert">{{ queryError }}</p>
      <section class="medical-grid" :style="{ '--columns': schema.layout.columns || 24 }" :aria-busy="loading">
        <article v-for="widget in schema.widgets" :key="`${widget.id}-${revision}`" class="medical-widget" :style="widgetStyle(widget)">
          <StatePanel v-if="!results[widget.id]" :type="queryError ? 'error' : 'loading'" :title="queryError ? '数据读取失败' : widget.title || '正在读取组件'" :description="queryError" />
          <StatePanel v-else-if="!['READY', 'EMPTY', 'NO_ACTIVE_RESULT'].includes(results[widget.id].status)" type="error" :title="widget.title" :description="results[widget.id].message || '该组件暂不可用'" />
          <BindingWidget v-else :widget="effectiveWidget(widget)" :title="widget.title" interactive />
        </article>
      </section>
    </template>
    <section v-else class="medical-catalog" aria-label="可访问看板">
      <button v-for="item in catalog" :key="item.id" type="button" @click="open(item.id)"><strong>{{ item.name }}</strong><span>{{ item.description || item.category || '指标看板' }}</span><ArrowRight :size="18" /></button>
      <StatePanel v-if="!catalog.length" type="empty" title="暂无已授权看板" />
    </section>
  </main>
</template>
<script setup>
import { onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back, Refresh, SwitchButton, ArrowRight } from '@element-plus/icons-vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import BindingWidget from '@/idmp/features/dashboard/components/BindingWidget.vue'
import { dashboardDetailToSchema, widgetResultToDataset } from '@/idmp/api/adapters/dashboard'
import { getAccessToken, isMedicalSession } from '@/idmp/api/request'
import { logoutSession } from '@/idmp/auth/session'
import { signedDashboardParameters, scalarParameter } from '@/idmp/auth/medicalSso.js'
import { fetchMedicalSession, fetchMedicalCatalog, exchangeDashboardAccess, openMedicalDashboard, fetchMedicalDashboard, queryMedicalDashboard, fetchMedicalPeriods, fetchMedicalDrillPath, searchMedicalDrill } from '@/idmp/api/modules/medical'
const route = useRoute(), router = useRouter()
const identity = ref(null), schema = shallowRef(null), catalog = shallowRef([]), results = shallowRef({}), datasets = shallowRef({})
const initializing = ref(true), loading = ref(false), error = ref(''), queryError = ref(''), updatedAt = ref(''), revision = ref(0)
const granularity = ref('MONTHLY'), month = ref(''), year = ref(new Date().getFullYear()), quarter = ref(1)
let generation = 0, queryGeneration = 0, drillTicket = '', activeDashboard = '', disposed = false
provide('dashboardBindingDatasets', widget => [datasets.value[widget.id]].filter(Boolean))
provide('dashboardSupportsBackendDrill', widget => Boolean(results.value[widget.id]?.drillContext || results.value[widget.id]?.rows?.some(row => row.drillContext)))
provide('dashboardSearchDrill', (id, payload, options) => searchMedicalDrill(activeDashboard, drillTicket, id, payload, options))
provide('dashboardResolveWidgetDrill', async (widget, params) => {
  const result = results.value[widget.id]
  const dimensions = Object.entries(params?.data?.dimensionValues || {})
  const selected = params?.data?.row || (dimensions.length ? result?.rows?.find(row => dimensions.every(([field, value]) => String(row[field]) === String(value))) : null)
  const context = selected?.drillContext || result?.drillContext
  if (!context) throw new Error('当前组件没有可用的科室下钻结果')
  const path = await fetchMedicalDrillPath(activeDashboard, drillTicket, context.resultId)
  return { resultId: context.resultId, indicatorVersionId: String(widget.config.analysisIndicatorVersionId), drillContext: context, selectedRow: selected,
    path: { levels: path.levels, maxLevel: path.levels.at(-1)?.levelCode } }
})
function effectiveWidget(widget) {
  const supported = Boolean(results.value[widget.id]?.drillContext || results.value[widget.id]?.rows?.some(row => row.drillContext))
  return supported ? widget : { ...widget, config: { ...widget.config, interaction: { ...widget.config?.interaction, clickAction: 'none' } } }
}
function widgetStyle(widget) {
  const layout = widget.layout || {}
  const span = Math.min(schema.value?.layout.columns || 24, Math.max(1, Number(layout.w || 12)))
  const kpi = widget.type === 'kpi'
  return { gridColumn: `${Number(layout.x || 0) + 1} / span ${span}`, gridRow: `${Number(layout.y || 0) + 1} / span ${Number(layout.h || (kpi ? 3 : 8))}`, minHeight: kpi ? '110px' : '280px' }
}
async function initialize() {
  const current = ++generation
  ++queryGeneration
  initializing.value = true; error.value = ''; schema.value = null; results.value = {}; datasets.value = {}; queryError.value = ''
  try {
    if (!isMedicalSession() || !getAccessToken()) throw new Error('请先从医务管理系统完成单点登录')
    identity.value = await fetchMedicalSession()
    const signed = signedDashboardParameters(route.query)
    let id = scalarParameter(route.query, 'id')
    if (signed) {
      const clean = new URL(window.location.href)
      for (const key of ['doctorNo', 'deptCode', 'sign']) clean.searchParams.delete(key)
      window.history.replaceState(window.history.state, '', `${clean.pathname}${clean.search}${clean.hash}`)
      const access = await exchangeDashboardAccess(signed)
      if (current !== generation) return
      await router.replace({ path: '/medical-dashboard', query: { id: access.dashboardId } })
      return
    }
    if (!id) { catalog.value = await fetchMedicalCatalog(); return }
    const detail = await fetchMedicalDashboard(id)
    if (current !== generation) return
    schema.value = dashboardDetailToSchema(detail)
    activeDashboard = id
    const periodLists = await Promise.all((detail.version.widgets || []).filter(w => w.dataSourceCode && w.indicatorVersionId)
      .map(w => fetchMedicalPeriods(id, w.code).catch(() => [])))
    if (current !== generation) return
    const latest = periodLists.flat().filter(p => p.periodType === 'MONTHLY').map(p => String(p.periodStart || '').slice(0, 7)).filter(Boolean).sort().at(-1)
    month.value = latest || new Date().toISOString().slice(0, 7)
    year.value = Number(month.value.slice(0, 4)); quarter.value = Math.ceil(Number(month.value.slice(5, 7)) / 3)
    await refresh()
  } catch (cause) { if (current === generation) error.value = cause?.message || '看板读取失败' }
  finally { if (current === generation) initializing.value = false }
}
async function open(id) {
  try { const access = await openMedicalDashboard(id); await router.push({ path: '/medical-dashboard', query: { id: access.dashboardId } }) }
  catch (cause) { error.value = cause?.message || '看板访问失败' }
}
async function refresh() {
  if (!schema.value) return
  const current = ++queryGeneration
  loading.value = true; queryError.value = ''; results.value = {}; datasets.value = {}; drillTicket = ''; revision.value += 1
  try {
    const selectedYear = granularity.value === 'MONTHLY' ? Number(month.value.slice(0, 4)) : Number(year.value)
    const startMonth = granularity.value === 'MONTHLY' ? Number(month.value.slice(5, 7)) : granularity.value === 'QUARTERLY' ? (quarter.value - 1) * 3 + 1 : 1
    if (!Number.isInteger(selectedYear) || selectedYear < 1900 || selectedYear > 2200 || startMonth < 1 || startMonth > 12) throw new Error('请选择有效的统计周期')
    const width = granularity.value === 'MONTHLY' ? 1 : granularity.value === 'QUARTERLY' ? 3 : 12
    const start = `${selectedYear}-${String(startMonth).padStart(2, '0')}-01`
    const endDate = new Date(Date.UTC(selectedYear, startMonth - 1 + width, 0))
    const response = await queryMedicalDashboard(activeDashboard, { periodStart: start, periodEnd: endDate.toISOString().slice(0, 10), granularity: granularity.value, filters: {} })
    if (current !== queryGeneration || disposed) return
    drillTicket = response.drillTicket
    results.value = response.data.widgets
    datasets.value = Object.fromEntries(schema.value.widgets.map(w => [w.id, widgetResultToDataset(results.value[w.id] || {}, [], w.config?.dataBinding?.dataset || 'backend')]))
    updatedAt.value = new Date().toLocaleTimeString('zh-CN')
  } catch (cause) { if (current === queryGeneration) queryError.value = cause?.message || '看板查询失败' }
  finally { if (current === queryGeneration) loading.value = false }
}
async function logout() { await logoutSession().catch(() => null); await router.replace('/login') }
watch(() => route.fullPath, initialize, { immediate: true })
onBeforeUnmount(() => { disposed = true; ++generation; ++queryGeneration })
</script>
<style scoped>
.medical-dashboard { min-height:100vh; padding:20px 24px 32px; background:#f4f7f8; color:#24343c; }
.medical-header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding-bottom:16px; border-bottom:1px solid #dbe3e7; }
.medical-header > div,.medical-account { display:flex; align-items:center; gap:12px; min-width:0; }
.medical-brand { color:#16806b; font-weight:700; font-size:18px; }
h1 { margin:0; font-size:20px; overflow-wrap:anywhere; }
.medical-account { flex-shrink:0; font-size:12px; color:#5d6c75; }
.medical-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:14px; padding:16px 0; }
.medical-toolbar label { display:flex; align-items:center; gap:8px; font-size:12px; }
.medical-toolbar input,.medical-toolbar select { box-sizing:border-box; min-height:30px; max-width:150px; padding:4px 8px; border:1px solid #cad5dc; border-radius:4px; background:white; color:inherit; }
.medical-updated { margin-left:auto; color:#72818a; font-size:12px; }
.medical-grid { display:grid; grid-template-columns:repeat(var(--columns),minmax(0,1fr)); grid-auto-rows:40px; gap:8px; }
.medical-widget { min-width:0; overflow:hidden; border:1px solid #dbe3e7; border-radius:6px; background:white; }
.medical-query-error { color:#ad3535; }
.medical-catalog { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:16px; padding-top:24px; }
.medical-catalog > button { display:grid; grid-template-columns:1fr 20px; gap:12px; padding:20px; border:1px solid #dbe3e7; border-radius:6px; background:white; color:inherit; text-align:left; cursor:pointer; }
.medical-catalog strong { font-size:16px; overflow-wrap:anywhere; }
.medical-catalog span { grid-column:1; font-size:12px; color:#6c7d86; }
.medical-catalog svg { grid-column:2; grid-row:1; width:18px; }
@media(max-width:767px) { .medical-dashboard { padding:12px; } .medical-header { align-items:flex-start; flex-wrap:wrap; } h1 { font-size:17px; } .medical-grid { display:flex; flex-direction:column; } .medical-widget { height:340px; } .medical-widget:has(.kpi-presentation) { height:130px; min-height:130px!important; } .medical-updated { width:100%; margin:0; } }
</style>
