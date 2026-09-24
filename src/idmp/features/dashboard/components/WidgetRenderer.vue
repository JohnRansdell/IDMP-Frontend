<template>
  <MetricGroupWidget v-if="widget.type === 'metric-group'" :widget="widget" :get-widget-kpi="getWidgetKpi" :designer="designer" :selected-item-id="selectedMetricItemId" @select-item="emit('metric-item-select', $event)" @duplicate="emit('metric-item-duplicate', $event)" @remove="emit('metric-item-remove', $event)" @add="emit('metric-item-add')" @reorder="emit('metric-item-reorder', $event)" />
  <BindingWidget v-else-if="hasDataBinding(widget)" :widget="widget" :title="getTitle(widget)" :inert="widget.type === 'chart' && !interactive && editing" @chart-click="interactive && emit('chart-click', widget, $event)" />
  <article v-else-if="widget.type === 'primary'" class="dashboard-renderer-card db-primary-metric" :class="{ 'is-clickable': interactive }" @click="interactive && emit('primary-analysis')">
    <div class="db-primary-metric__head"><div><span class="db-primary-metric__eyebrow">重点关注</span><h2>{{ primaryKpi?.title || '重点指标' }}</h2></div><span class="status-pill" :class="`is-${primaryKpi?.status || 'info'}`">{{ primaryKpi?.status === 'danger' ? '超出目标' : primaryKpi?.status === 'info' ? '待配置' : '在目标内' }}</span></div>
    <div class="db-primary-metric__value clinical-metric">{{ primaryKpi?.value || '暂无数据' }}</div>
    <div class="db-primary-metric__change" :class="`is-${clinicalTrendTone(primaryKpi?.status)}`">较上期 {{ primaryKpi?.change || '暂无数据' }}</div>
    <dl class="db-primary-metric__meta"><div><dt>管理目标</dt><dd>{{ primaryKpi?.target || '-' }}</dd></div><div><dt>当前范围</dt><dd>{{ department || '全院' }}</dd></div><div><dt>结果口径</dt><dd>活动结果优先</dd></div></dl>
  </article>

  <article v-else-if="widget.type === 'supporting'" class="dashboard-renderer-card db-supporting-metrics" :class="{ 'is-editing': editing }">
    <div class="db-section-title db-supporting-metrics__title"><div><h2>其他核心指标</h2><p class="db-section-title__description">按当前场景和统计范围展示</p></div></div>
    <button v-for="item in supportingKpis" :key="item.title" type="button" class="db-supporting-metric" :disabled="!interactive && !editing" :tabindex="editing ? -1 : 0" @click="interactive && emit('indicator-analysis', item.code)"><span class="db-supporting-metric__name">{{ item.title }}</span><strong class="clinical-metric">{{ item.value }}</strong><span class="db-supporting-metric__change" :class="`is-${item.status}`">{{ item.change }}</span><span class="db-supporting-metric__target">{{ item.target }}</span></button>
  </article>

  <article v-else-if="widget.type === 'text'" class="dashboard-renderer-card db-text-card" :style="textStyle"><h2 v-if="widget.config?.text?.title">{{ widget.config.text.title }}</h2><p>{{ widget.config?.text?.body || '请输入看板说明、数据口径或业务提示。' }}</p></article>

  <article v-else-if="widget.type === 'kpi'" class="dashboard-renderer-card db-kpi-card" :class="[{ 'is-clickable': interactive }, `is-variant-${kpiVariant}`]" @click="interactive && emit('widget-analysis', widget)">
    <div class="db-kpi-card__top" :style="kpiTitleStyle"><span>{{ widgetKpi.title }}</span><span class="db-kpi-dot" :class="`is-${widgetKpi.status}`" /></div><strong :style="kpiValueStyle">{{ widgetKpi.value }}</strong><div class="db-kpi-change" :class="`is-${trendTone}`" :style="kpiTrendStyle">{{ widgetKpi.change }}</div><div v-if="widgetKpi.mom !== undefined || widgetKpi.yoy !== undefined" class="db-kpi-comparisons" :style="kpiTrendStyle"><span>环比 {{ formatKpiComparison(widgetKpi.mom, widgetKpi.unit) }}</span><span>同比 {{ formatKpiComparison(widgetKpi.yoy, widgetKpi.unit) }}</span><b :aria-label="`趋势：${trendLabel}`">{{ trendArrow }}</b></div><div class="db-kpi-target">{{ widgetKpi.target }}</div>
  </article>

  <article v-else-if="widget.type === 'chart' && widget.chartKind === 'table'" class="dashboard-renderer-card db-chart-card" :class="{ 'is-table-zebra': visualStyle.table.zebra, 'is-table-compact': visualStyle.table.compact }" :style="{ '--table-header-background': visualStyle.table.headerBackground }">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2></div></div>
    <div class="dashboard-chart-table-wrap"><table class="dashboard-chart-table" data-testid="widget-renderer-table"><thead><tr><th v-for="column in getTableColumns(widget)" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in getTableRows(widget)" :key="`${widget.id}-${index}`"><td v-for="column in getTableColumns(widget)" :key="column.key">{{ row[column.key] }}</td></tr></tbody></table></div>
  </article>
  <article v-else-if="widget.type === 'chart' && widget.chartKind === 'pie' && getPieDrillTargets(widget).length" class="dashboard-renderer-card db-chart-card">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2><p v-if="getDescription(widget)" class="db-section-title__description">{{ getDescription(widget) }}</p></div></div>
    <DashboardDrillPie :targets="getPieDrillTargets(widget)" :source="getPieDrillSource(widget)" :title="getTitle(widget)" :disabled="editing" />
  </article>
  <article v-else-if="widget.type === 'chart'" class="dashboard-renderer-card db-chart-card" :class="{ 'is-dark-surface': surfaceTone === 'dark' }" :inert="!interactive && editing">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2><p v-if="getDescription(widget)" class="db-section-title__description">{{ getDescription(widget) }}</p></div></div>
    <IdmpChart :option="themedChartOption" :empty="isChartEmpty(widget)" height="100%" fit-container :aria-label="getChartAriaLabel(widget)" :updated-at="updatedAt" @chart-click="interactive && emit('chart-click', widget, $event)">
      <template #table><table class="dashboard-chart-table"><thead><tr><th v-for="column in getTableColumns(widget)" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in getTableRows(widget)" :key="`${widget.id}-${index}`"><td v-for="column in getTableColumns(widget)" :key="column.key">{{ row[column.key] }}</td></tr></tbody></table></template>
    </IdmpChart>
  </article>

  <article v-else-if="widget.type === 'warnings'" class="dashboard-renderer-card db-list-card"><div class="db-section-title"><h2><el-icon><Bell /></el-icon>预警指标</h2><button v-if="interactive" type="button" class="db-action-link" @click="emit('alerts')">查看全部</button></div><ul v-if="warnings.length" class="db-warning-list"><li v-for="warning in warnings" :key="warning.text"><span class="db-warning-icon" :class="`is-${warning.level}`"><el-icon><WarningFilled v-if="warning.level !== 'info'" /><InfoFilled v-else /></el-icon></span><span class="db-warning-text">{{ warning.text }}</span><time>{{ warning.time }}</time></li></ul><StatePanel v-else type="empty" title="暂无预警数据" description="当前看板查询接口未返回预警事件。" /></article>

  <article v-else-if="widget.type === 'ranking'" class="dashboard-renderer-card db-list-card"><div class="db-section-title"><h2><el-icon><TrophyBase /></el-icon>科室指标排名</h2></div><ol class="db-ranking-list"><li v-for="row in ranking" :key="row.department"><span class="rank" :class="{ 'is-top': row.rank <= 3 }">{{ row.rank }}</span><span class="department">{{ row.department }}</span><span class="db-rank-bar"><i :style="{ width: `${Math.max(14, row.rawValue * 16)}%` }" /></span><strong>{{ row.value }}</strong></li></ol></article>
</template>

<script setup>
import { computed, inject } from 'vue'
import BindingWidget from './BindingWidget.vue'
import MetricGroupWidget from './MetricGroupWidget.vue'
import DashboardDrillPie from '../DashboardDrillPie.vue'
import { hasDataBinding } from '../bindingEngine.js'
import { createDashboardChartTheme, clinicalTrendTone } from '../chartTheme.js'
import { formatKpiComparison } from '../visualization.js'
import { applyWidgetVisualStyle, resolveWidgetVisualStyle } from '../visualStyle.js'
import { resolveWidgetSurfaceTone } from '../backgroundAssets.js'
import { Bell, InfoFilled, TrophyBase, WarningFilled } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'

const props = defineProps({
  widget: { type: Object, required: true }, primaryKpi: { type: Object, default: null }, supportingKpis: { type: Array, default: () => [] }, warnings: { type: Array, default: () => [] }, ranking: { type: Array, default: () => [] }, department: { type: String, default: '' }, updatedAt: { type: String, default: '' }, interactive: { type: Boolean, default: false }, editing: { type: Boolean, default: false }, designer: { type: Boolean, default: false }, selectedMetricItemId: { type: String, default: '' },
  getWidgetKpi: { type: Function, required: true }, getTitle: { type: Function, required: true }, getDescription: { type: Function, required: true }, getIcon: { type: Function, required: true }, getChartOption: { type: Function, required: true }, isChartEmpty: { type: Function, required: true }, getChartAriaLabel: { type: Function, required: true }, getTableColumns: { type: Function, required: true }, getTableRows: { type: Function, required: true }, getPieDrillTargets: { type: Function, default: () => [] }, getPieDrillSource: { type: Function, default: () => 'live' }
})
const emit = defineEmits(['primary-analysis', 'indicator-analysis', 'widget-analysis', 'chart-click', 'alerts', 'metric-item-select', 'metric-item-duplicate', 'metric-item-remove', 'metric-item-add', 'metric-item-reorder'])
const widgetKpi = computed(() => props.getWidgetKpi(props.widget))
const dashboardSurfaceTone = inject('dashboardSurfaceTone', computed(() => 'light'))
const surfaceTone = computed(() => resolveWidgetSurfaceTone(props.widget, dashboardSurfaceTone.value))
const themedChartOption = computed(() => props.widget.type === 'chart' ? createDashboardChartTheme(applyWidgetVisualStyle(props.widget, props.getChartOption(props.widget)), surfaceTone.value) : {})
const visualStyle = computed(() => resolveWidgetVisualStyle(props.widget))
const kpiValueStyle = computed(() => ({ color: visualStyle.value.kpi.valueColor || undefined }))
const kpiTitleStyle = computed(() => ({ color: visualStyle.value.kpi.titleColor || undefined }))
const kpiTrendStyle = computed(() => ({ color: visualStyle.value.kpi.trendColor || undefined }))
const trendTone = computed(() => clinicalTrendTone(widgetKpi.value.status))
const kpiVariant = computed(() => ['standard', 'hero', 'horizontal', 'status', 'trend', 'minimal'].includes(props.widget.config?.style?.kpiVariant) ? props.widget.config.style.kpiVariant : 'standard')
const trendArrow = computed(() => ({ up: '↑', down: '↓', flat: '↔' }[widgetKpi.value.trendDirection] || '↔'))
const trendLabel = computed(() => ({ up: '上升', down: '下降', flat: '持平' }[widgetKpi.value.trendDirection] || '持平'))
const textStyle = computed(() => ({ textAlign: props.widget.config?.text?.align || 'left', color: props.widget.config?.text?.color || 'inherit', fontSize: `${Number(props.widget.config?.text?.fontSize) || 14}px`, fontWeight: props.widget.config?.text?.fontWeight || 400 }))
</script>

<style scoped lang="scss">
.dashboard-renderer-card { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; color: var(--idmp-text-primary, #101828); background: transparent; }
.db-primary-metric { padding: 18px 22px; } .db-primary-metric__head, .db-section-title { display:flex; justify-content:space-between; gap:12px; } .db-primary-metric__eyebrow, .db-section-title__description, .db-kpi-card__top, .db-kpi-target { color:var(--idmp-text-helper,#667085); font-size:12px; } h2 { margin:4px 0; font-size:16px; } .db-primary-metric__value { margin-top:20px; font-size:42px; font-weight:650; } .db-primary-metric__change, .db-kpi-change { color:var(--idmp-support-danger,#d92d20); font-size:12px; } .db-primary-metric__meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:18px 0 0; padding-top:14px; border-top:1px solid var(--idmp-border-subtle,#eaecf0); } .db-primary-metric__meta dt { color:var(--idmp-text-helper,#667085); font-size:11px; } .db-primary-metric__meta dd { margin:3px 0 0; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.db-supporting-metrics,.db-list-card { padding:16px 18px; } .db-supporting-metric { display:grid; grid-template-columns:minmax(100px,1.4fr) 90px 72px minmax(70px,.8fr); align-items:center; width:100%; min-height:37px; gap:8px; border:0; border-top:1px solid var(--idmp-border-soft,#eaecf0); background:transparent; text-align:left; } .db-supporting-metric:not(:disabled) { cursor:pointer; } .db-supporting-metrics.is-editing .db-supporting-metric { cursor:inherit; } .db-supporting-metric strong { text-align:right; } .db-supporting-metric__target { color:var(--idmp-text-helper,#667085); font-size:11px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-kpi-card { padding:12px 14px; overflow:hidden; } .db-kpi-card.is-clickable,.db-primary-metric.is-clickable { cursor:pointer; } .db-kpi-card__top { display:flex; justify-content:space-between; min-height:24px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } .db-kpi-card strong { display:block; margin:5px 0 2px; font-size:27px; line-height:32px; } .db-kpi-dot { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--idmp-support-success,#12b76a); } .db-kpi-dot.is-danger { background:var(--idmp-support-danger,#d92d20); }
.db-kpi-comparisons { display:flex; align-items:center; gap:10px; margin-top:8px; color:var(--db-secondary,#5c6d75); font-size:11px; white-space:nowrap; }.db-kpi-comparisons b { margin-left:auto; font-size:18px; line-height:1; color:inherit; }.db-text-card { display:flex; flex-direction:column; justify-content:center; white-space:pre-wrap; line-height:1.65; }.db-text-card h2 { margin:0 0 8px; font-size:1.15em; }.db-text-card p { margin:0; }
@container (max-height: 135px) { .db-kpi-change,.db-kpi-target { display:none; } .db-kpi-card strong { margin-top:8px; } }
.db-chart-card { display:flex; flex-direction:column; padding:16px 18px 12px; } .db-chart-card :deep(.idmp-chart-frame) { flex:1 1 auto; min-height:0; } .dashboard-chart-table-wrap { min-width:0; max-width:100%; overflow-x:auto; overscroll-behavior-inline:contain; } .dashboard-chart-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:12px; } .dashboard-chart-table th,.dashboard-chart-table td { padding:8px 10px; border-bottom:1px solid var(--idmp-border-soft,#eaecf0); text-align:right; white-space:nowrap; } .dashboard-chart-table th { background:var(--table-header-background,#f3f7f8); } .is-table-zebra .dashboard-chart-table tbody tr:nth-child(even) { background:color-mix(in srgb, var(--table-header-background,#f3f7f8) 35%, transparent); } .is-table-compact .dashboard-chart-table th,.is-table-compact .dashboard-chart-table td { padding:4px 6px; } .dashboard-chart-table th:first-child,.dashboard-chart-table td:first-child { text-align:left; }
.db-warning-list,.db-ranking-list { margin:0; padding:0; list-style:none; } .db-warning-list li { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; min-height:54px; gap:10px; border-bottom:1px solid var(--idmp-border-soft,#eaecf0); } .db-warning-icon { display:grid; place-items:center; width:26px; height:26px; border-radius:4px; color:var(--idmp-support-danger,#d92d20); background:var(--idmp-support-danger-bg,#fef3f2); } .db-warning-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .db-warning-list time { color:var(--idmp-text-disabled,#98a2b3); font-size:12px; } .db-ranking-list li { display:grid; grid-template-columns:28px 80px minmax(80px,1fr) 48px; align-items:center; min-height:39px; gap:10px; } .rank { display:grid; place-items:center; width:22px; height:22px; border-radius:4px; background:var(--idmp-layer-02,#f2f4f7); font-size:12px; } .rank.is-top { color:var(--idmp-interactive,#1570ef); } .db-rank-bar { height:6px; overflow:hidden; border-radius:6px; background:var(--idmp-layer-02,#f2f4f7); } .db-rank-bar i { display:block; height:100%; background:var(--idmp-interactive,#1570ef); } .db-action-link { border:0; background:transparent; color:var(--idmp-interactive,#1570ef); cursor:pointer; }

/* Shared Clinical Light surface content. Saved outer-card styling stays in DashboardWidget. */
.dashboard-renderer-card { padding: 16px 18px; min-width: 0; min-height: 0; color: var(--db-text, #25343b); font-variant-numeric: tabular-nums; }
.dashboard-renderer-card.is-dark-surface { color:#f8fbff; }.dashboard-renderer-card.is-dark-surface .db-section-title__description { color:#d9e9f5; }
.db-section-title { min-height: 30px; align-items: start; margin-bottom: 12px; }
.db-section-title h2 { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:550; margin:0; }
.db-section-title__description { margin:5px 0 0; font-size:11px; color:var(--db-muted,#78878e); }
.db-kpi-card__top { font-size:13px; line-height:20px; white-space:normal; min-height:24px; gap:8px; }
.db-kpi-card strong { font-size:32px; font-weight:550; line-height:1.2; letter-spacing:-.6px; margin:12px 0 8px; overflow-wrap:anywhere; }
.db-kpi-change { color:var(--db-secondary,#5c6d75); font-size:12px; }
.db-kpi-change.is-success { color:var(--db-success,#357b62); }
.db-kpi-change.is-danger { color:var(--db-danger,#b45858); }
.db-kpi-change.is-warning { color:var(--db-warning,#a47735); }
.db-kpi-target { margin-top:12px; padding-top:8px; border-top:1px solid var(--db-border,#e3e9eb); font-size:11px; }
.db-primary-metric__value { font-size:36px; font-weight:550; letter-spacing:-.6px; }
.db-primary-metric__change { color:var(--db-secondary,#5c6d75); }
.db-primary-metric__change.is-danger { color:var(--db-danger,#b45858); }
.db-primary-metric__change.is-success { color:var(--db-success,#357b62); }
.db-primary-metric__change.is-warning { color:var(--db-warning,#a47735); }
.db-primary-metric .status-pill { padding:4px 7px; align-self:start; font-size:10px; border:1px solid #e8dddd; background:#faf4f3; color:#8a5c59; border-radius:6px; }
.db-supporting-metric { grid-template-columns:minmax(0,1.4fr) minmax(60px,.7fr) minmax(48px,.6fr) minmax(60px,1fr); font-size:12px; color:inherit; }
.db-ranking-list li { grid-template-columns:24px minmax(60px,1fr) minmax(40px,1fr) 50px; min-height:42px; font-size:12px; }
.db-rank-bar { height:5px; background:#edf2f2; }
.db-rank-bar i { background:#7a9b97; max-width:100%; }
.rank.is-top { color:#426c68; background:#edf5f3; }
.db-warning-icon { background:#faf0ef; color:#b45858; border-radius:6px; }
.db-warning-icon.is-warning { color:#a47735; background:#faf5e9; }
.db-warning-icon.is-info { color:#687f8b; background:#edf2f5; }
.db-warning-text { font-size:12px; white-space:normal; line-height:1.6; }
.db-warning-list time { font-size:10px; color:#78878e; }
@container (max-height: 150px) {
 .db-kpi-target, .db-primary-metric__meta { display:none; }
 .db-kpi-card { padding:10px 12px; }
 .db-kpi-card strong { font-size:28px; margin:6px 0; }
}
@container (max-height: 110px) {
 .db-kpi-change, .db-primary-metric__change { display:none; }
 .db-kpi-card__top { font-size:12px; min-height:20px; }
 .db-kpi-card strong { font-size:26px; }
}
@container (max-width: 160px) {
 .db-section-title,.db-kpi-card__top,.db-primary-metric__head,.db-primary-metric__change,.db-kpi-change,.db-kpi-target,.db-primary-metric__meta,.db-supporting-metrics__title,.db-warning-list time,.db-rank-bar { display:none; }
 .db-kpi-card,.db-primary-metric { display:grid; place-items:center; padding:4px; }
 .db-kpi-card strong,.db-primary-metric__value { margin:0; font-size:20px; line-height:1; text-align:center; }
 .db-supporting-metric { grid-template-columns:1fr; min-height:0; padding:3px; }
 .db-supporting-metric :not(strong),.db-warning-icon,.db-ranking-list li :not(strong):not(.rank) { display:none; }
 .db-warning-list li,.db-ranking-list li { min-height:0; grid-template-columns:1fr; padding:2px; }
}
@container (max-width: 420px) {
 .db-chart-card { padding:12px 10px 8px; } .db-chart-card .db-section-title { min-height:24px; margin-bottom:6px; } .db-chart-card .db-section-title__description { display:none; }
 .db-warning-list li { grid-template-columns:26px minmax(0,1fr); gap:7px; min-height:44px; } .db-warning-list time { display:none; }
 .db-ranking-list li { grid-template-columns:22px minmax(0,1fr) 44px; gap:7px; } .db-ranking-list .db-rank-bar { display:none; }
 .db-supporting-metric { grid-template-columns:minmax(0,1fr) auto; gap:6px; } .db-supporting-metric__change,.db-supporting-metric__target { display:none; }
}

/* Variants rearrange the established KPI presentation only; source values,
   comparisons and clinical trend tone remain untouched. */
.db-kpi-card.is-variant-hero { padding:clamp(16px,3cqi,28px); justify-content:center; }.db-kpi-card.is-variant-hero strong { margin:10px 0; font-size:clamp(36px,8cqi,58px); font-weight:600; line-height:1.05; }.db-kpi-card.is-variant-hero .db-kpi-card__top { font-size:12px; }.db-kpi-card.is-variant-hero .db-kpi-change { margin-top:4px; }.db-kpi-card.is-variant-hero .db-kpi-comparisons { margin-top:8px; }.db-kpi-card.is-variant-hero .db-kpi-target { display:none; }
.db-kpi-card.is-variant-horizontal { display:grid; grid-template-columns:minmax(0,1fr) auto auto; grid-template-rows:auto auto; column-gap:14px; align-items:center; padding:12px 16px; }.db-kpi-card.is-variant-horizontal .db-kpi-card__top { grid-column:1; grid-row:1 / span 2; }.db-kpi-card.is-variant-horizontal strong { grid-column:2; grid-row:1 / span 2; margin:0; font-size:clamp(24px,5cqi,36px); white-space:nowrap; }.db-kpi-card.is-variant-horizontal .db-kpi-change { grid-column:3; grid-row:1; white-space:nowrap; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { grid-column:3; grid-row:2; margin:0; gap:4px; font-size:10px; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons span:first-child { display:none; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons b { display:none; }.db-kpi-card.is-variant-horizontal .db-kpi-target { display:none; }
.db-kpi-card.is-variant-status { border-left:4px solid var(--db-border,#c8d5da); padding-left:16px; }.db-kpi-card.is-variant-status .db-kpi-dot { width:10px; height:10px; box-shadow:0 0 0 4px color-mix(in srgb,currentColor 12%,transparent); }.db-kpi-card.is-variant-status .db-kpi-card__top { padding-bottom:8px; border-bottom:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-status .db-kpi-change { margin-top:8px; font-weight:600; }.db-kpi-card.is-variant-status .db-kpi-comparisons { margin-top:auto; }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-danger) { border-left-color:var(--db-danger,#b45858); }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-warning) { border-left-color:var(--db-warning,#a47735); }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-success) { border-left-color:var(--db-success,#357b62); }
.db-kpi-card.is-variant-trend .db-kpi-change { display:none; }.db-kpi-card.is-variant-trend strong { margin-bottom:14px; }.db-kpi-card.is-variant-trend .db-kpi-comparisons { display:grid; grid-template-columns:1fr 1fr auto; gap:0; margin-top:auto; padding-top:10px; border-top:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-trend .db-kpi-comparisons span { padding-right:8px; }.db-kpi-card.is-variant-trend .db-kpi-comparisons span + span { padding-left:8px; border-left:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-trend .db-kpi-target { display:none; }
.db-kpi-card.is-variant-minimal { justify-content:center; padding:clamp(14px,3cqi,26px); }.db-kpi-card.is-variant-minimal .db-kpi-card__top { justify-content:center; min-height:auto; color:var(--db-muted,#78878e); font-size:11px; text-align:center; }.db-kpi-card.is-variant-minimal .db-kpi-dot,.db-kpi-card.is-variant-minimal .db-kpi-change,.db-kpi-card.is-variant-minimal .db-kpi-target { display:none; }.db-kpi-card.is-variant-minimal strong { margin:10px 0 0; font-size:clamp(34px,7cqi,54px); font-weight:500; line-height:1.05; text-align:center; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons { justify-content:center; margin-top:10px; font-size:10px; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons span:first-child { display:none; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons b { display:none; }
@container (max-width: 330px) { .db-kpi-card.is-variant-horizontal { display:flex; flex-wrap:wrap; align-content:center; gap:4px 8px; }.db-kpi-card.is-variant-horizontal .db-kpi-card__top { width:100%; }.db-kpi-card.is-variant-horizontal strong,.db-kpi-card.is-variant-horizontal .db-kpi-change,.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { display:block; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { margin-left:auto; }.db-kpi-card.is-variant-hero strong,.db-kpi-card.is-variant-minimal strong { font-size:30px; } }
</style>
