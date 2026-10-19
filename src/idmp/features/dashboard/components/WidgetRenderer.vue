<template>
  <MetricGroupWidget v-if="widget.type === 'metric-group'" :widget="widget" :get-widget-kpi="getWidgetKpi" :designer="designer" :selected-item-id="selectedMetricItemId" @select-item="emit('metric-item-select', $event)" @duplicate="emit('metric-item-duplicate', $event)" @remove="emit('metric-item-remove', $event)" @add="emit('metric-item-add')" @reorder="emit('metric-item-reorder', $event)" @retry="emit('metric-item-retry', widget, $event)" />
  <IndicatorRankingWidget v-else-if="widget.type === 'ranking' && widget.config?.ranking?.mode === 'indicators'" :widget="widget" :get-widget-kpi="getWidgetKpi" :designer="designer" :selected-item-id="selectedMetricItemId" @select-item="emit('metric-item-select', $event)" @add="emit('metric-item-add')" @retry="emit('metric-item-retry', widget, $event)" />
  <BindingWidget v-else-if="hasDataBinding(widget) && widget.type !== 'warnings'" :widget="widget" :title="getTitle(widget)" :interactive="interactive && !editing" :designer="designer" @analysis="interactive && !editing && emit('widget-analysis', widget)" @chart-click="interactive && emit('chart-click', widget, $event)" @action="emit('binding-action', $event)" />
  <KpiPresentation v-else-if="widget.type === 'primary'" :model="primaryKpiModel" :variant="widget.config?.style?.kpiVariant" :colors="visualStyle.kpi" :clickable="interactive" @click="emit('primary-analysis')" />

  <article v-else-if="widget.type === 'supporting'" class="dashboard-renderer-card db-supporting-metrics" :style="legacyKpiStyle" :class="[{ 'is-editing': editing }, `is-variant-${kpiVariant}`]">
    <div class="db-section-title db-supporting-metrics__title"><div><h2 :style="kpiTitleStyle">其他核心指标</h2><p class="db-section-title__description">按当前场景和统计范围展示</p></div></div>
    <button v-for="item in supportingKpis" :key="item.title" type="button" class="db-supporting-metric" :disabled="!interactive && !editing" :tabindex="editing ? -1 : 0" @click="interactive && emit('indicator-analysis', item.code)"><span class="db-supporting-metric__name" :style="kpiTitleStyle">{{ item.title }}</span><strong class="clinical-metric" :style="kpiValueStyle">{{ item.value }}</strong><span class="db-supporting-metric__change" :class="`is-${item.status}`">{{ item.change }}</span><span class="db-supporting-metric__comparisons" :style="kpiTrendStyle">同比 {{ formatKpiComparison(item.yoy, item.comparisonUnit || item.unit) }} · 环比 {{ formatKpiComparison(item.mom, item.comparisonUnit || item.unit) }}</span><span class="db-supporting-metric__target">{{ item.target }}</span></button>
  </article>

  <article v-else-if="widget.type === 'text'" class="dashboard-renderer-card db-text-card" :style="textStyle"><h2 v-if="widget.config?.text?.title" :style="textTitleStyle">{{ widget.config.text.title }}</h2><p>{{ widget.config?.text?.body || '请输入看板说明、数据口径或业务提示。' }}</p></article>

  <KpiPresentation v-else-if="widget.type === 'kpi'" :model="widgetKpi" :variant="kpiVariant" :colors="visualStyle.kpi" :clickable="interactive" @click="emit('widget-analysis', widget)" />

  <article v-else-if="widget.type === 'chart' && widget.chartKind === 'table'" class="dashboard-renderer-card db-chart-card" :class="{ 'is-table-zebra': visualStyle.table.zebra, 'is-table-compact': visualStyle.table.compact }" :style="{ '--table-header-background': visualStyle.table.headerBackground }">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2></div></div>
    <div class="dashboard-chart-table-wrap"><table class="dashboard-chart-table" data-testid="widget-renderer-table"><thead><tr><th v-for="column in getTableColumns(widget)" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in getTableRows(widget)" :key="`${widget.id}-${index}`"><td v-for="column in getTableColumns(widget)" :key="column.key">{{ row[column.key] }}</td></tr></tbody></table></div>
  </article>
  <article v-else-if="widget.type === 'chart' && widget.chartKind === 'pie' && getPieDrillTargets(widget).length" class="dashboard-renderer-card db-chart-card" :class="{ 'is-dark-surface': surfaceTone === 'dark' }">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2><p v-if="getDescription(widget)" class="db-section-title__description">{{ getDescription(widget) }}</p></div></div>
    <DashboardDrillPie :widget="widget" :surface-tone="surfaceTone" :targets="getPieDrillTargets(widget)" :source="getPieDrillSource(widget)" :title="getTitle(widget)" :disabled="editing" />
  </article>
  <article v-else-if="widget.type === 'chart'" class="dashboard-renderer-card db-chart-card" :class="{ 'is-dark-surface': surfaceTone === 'dark' }" :inert="!interactive && editing">
    <div class="db-section-title"><div><h2><el-icon><component :is="getIcon(widget)" /></el-icon>{{ getTitle(widget) }}</h2><p v-if="getDescription(widget)" class="db-section-title__description">{{ getDescription(widget) }}</p></div></div>
    <IdmpChart :option="themedChartOption" :empty="isChartEmpty(widget)" height="100%" fit-container :aria-label="getChartAriaLabel(widget)" :updated-at="updatedAt" @chart-click="interactive && emit('chart-click', widget, $event)">
      <template #table><table class="dashboard-chart-table"><thead><tr><th v-for="column in getTableColumns(widget)" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in getTableRows(widget)" :key="`${widget.id}-${index}`"><td v-for="column in getTableColumns(widget)" :key="column.key">{{ row[column.key] }}</td></tr></tbody></table></template>
    </IdmpChart>
  </article>

  <article v-else-if="widget.type === 'warnings'" class="dashboard-renderer-card db-list-card db-warning-card" :class="{ 'is-dark-surface': surfaceTone === 'dark' }" :style="warningThemeStyle">
    <div class="db-warning-header">
      <h2 :title="getTitle(widget)"><span class="db-warning-header__icon"><el-icon><Bell /></el-icon></span><span>{{ getTitle(widget) }}</span></h2>
      <span v-if="warningState.status === 'ready'" class="db-warning-count">当前筛选 {{ warningState.total ?? warnings.length }} 条</span>
      <button v-if="interactive" type="button" class="db-action-link" @pointerdown.stop @click.stop="emit('alerts')">查看全部</button>
    </div>
    <div v-if="warningState.status === 'loading' || warningState.status === 'idle'" class="db-warning-state" role="status" :aria-busy="warningState.status === 'loading'">
      <span class="db-warning-state__icon"><el-icon :class="{ 'is-loading': warningState.status === 'loading' }"><Loading v-if="warningState.status === 'loading'" /><Bell v-else /></el-icon></span>
      <div class="db-warning-state__copy"><strong>{{ warningState.status === 'loading' ? '正在读取预警事件' : '等待读取预警事件' }}</strong><p>按当前状态、级别和规则筛选</p></div>
    </div>
    <div v-else-if="warningState.status === 'error'" class="db-warning-state is-error" role="alert">
      <span class="db-warning-state__icon"><el-icon><WarningFilled /></el-icon></span>
      <div class="db-warning-state__copy"><strong>预警事件读取失败</strong><p>{{ warningState.error || '请稍后重试。' }}</p></div>
      <el-button size="small" type="primary" plain @pointerdown.stop @click.stop="emit('warning-retry')">重新读取</el-button>
    </div>
    <ul v-else-if="warnings.length" class="db-warning-list">
      <li v-for="warning in warnings" :key="warning.id || warning.text">
        <button type="button" class="db-warning-row" :class="`is-${warning.level}`" :disabled="!interactive || editing || !warning.eventId" :aria-label="warning.eventId ? `查看预警事件：${warning.text}` : undefined" @click="emit('warning-event', warning.eventId)">
          <span class="db-warning-icon" :class="`is-${warning.level}`"><el-icon><WarningFilled v-if="warning.level !== 'info'" /><InfoFilled v-else /></el-icon></span>
          <span class="db-warning-content"><span class="db-warning-content__title"><span v-if="warning.severity" class="db-warning-severity" :class="`is-${warning.level}`">{{ warningSeverityLabel(warning.severity) }}</span><span class="db-warning-text" :title="warning.name || warning.text">{{ warning.name || warning.text }}</span></span><span v-if="warning.detail" class="db-warning-detail">{{ warning.detail }}</span></span>
          <time v-if="warning.time">{{ warning.time }}</time>
        </button>
      </li>
    </ul>
    <div v-else class="db-warning-state" role="status">
      <span class="db-warning-state__icon"><el-icon><Bell /></el-icon></span>
      <div class="db-warning-state__copy"><strong>当前条件下暂无预警事件</strong><p>可调整状态、级别或规则筛选条件</p></div>
    </div>
  </article>

  <article v-else-if="widget.type === 'ranking'" class="dashboard-renderer-card db-list-card" :style="contentThemeStyle">
    <div class="db-section-title"><h2><el-icon><TrophyBase /></el-icon>{{ getTitle(widget) }}</h2></div>
    <p class="db-ranking-empty">{{ widget.sourceCode ? '请配置分类维度与指标值，再查看排名。' : '请选择指标进行科室／分类排名，或切换为多指标排名逐项添加。' }}</p>
  </article>
</template>

<script setup>
import { computed, inject } from 'vue'
import BindingWidget from './BindingWidget.vue'
import KpiPresentation from './KpiPresentation.vue'
import MetricGroupWidget from './MetricGroupWidget.vue'
import IndicatorRankingWidget from './IndicatorRankingWidget.vue'
import DashboardDrillPie from '../DashboardDrillPie.vue'
import { hasDataBinding } from '../bindingEngine.js'
import { createDashboardChartTheme, clinicalTrendTone } from '../chartTheme.js'
import { formatKpiComparison } from '../visualization.js'
import { applyWidgetVisualStyle, resolveWidgetBackgroundMode, resolveWidgetVisualStyle, widgetPalette } from '../visualStyle.js'
import { resolveWidgetSurfaceTone } from '../backgroundAssets.js'
import { Bell, InfoFilled, Loading, TrophyBase, WarningFilled } from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'

const props = defineProps({
  widget: { type: Object, required: true }, primaryKpi: { type: Object, default: null }, supportingKpis: { type: Array, default: () => [] }, warnings: { type: Array, default: () => [] }, warningState: { type: Object, default: () => ({ status: 'ready', total: 0, error: '' }) }, ranking: { type: Array, default: () => [] }, department: { type: String, default: '' }, updatedAt: { type: String, default: '' }, interactive: { type: Boolean, default: false }, editing: { type: Boolean, default: false }, designer: { type: Boolean, default: false }, selectedMetricItemId: { type: String, default: '' },
  getWidgetKpi: { type: Function, required: true }, getTitle: { type: Function, required: true }, getDescription: { type: Function, required: true }, getIcon: { type: Function, required: true }, getChartOption: { type: Function, required: true }, isChartEmpty: { type: Function, required: true }, getChartAriaLabel: { type: Function, required: true }, getTableColumns: { type: Function, required: true }, getTableRows: { type: Function, required: true }, getPieDrillTargets: { type: Function, default: () => [] }, getPieDrillSource: { type: Function, default: () => 'live' }
})
const emit = defineEmits(['primary-analysis', 'indicator-analysis', 'widget-analysis', 'chart-click', 'alerts', 'warning-retry', 'warning-event', 'metric-item-retry', 'metric-item-select', 'metric-item-duplicate', 'metric-item-remove', 'metric-item-add', 'metric-item-reorder', 'binding-action'])
const warningSeverityLabel = severity => ({ CRITICAL: '严重', HIGH: '高', MEDIUM: '中', LOW: '低', INFO: '提示' })[String(severity).toUpperCase()] || severity
const widgetKpi = computed(() => props.getWidgetKpi(props.widget))
const dashboardSurfaceTone = inject('dashboardSurfaceTone', computed(() => 'light'))
const dashboardAppearanceTheme = inject('dashboardAppearanceTheme', computed(() => 'default'))
const surfaceTone = computed(() => resolveWidgetSurfaceTone(props.widget, dashboardSurfaceTone.value))
const themedChartOption = computed(() => props.widget.type === 'chart' ? createDashboardChartTheme(applyWidgetVisualStyle(props.widget, props.getChartOption(props.widget)), surfaceTone.value, dashboardAppearanceTheme.value) : {})
const visualStyle = computed(() => resolveWidgetVisualStyle(props.widget))
const primaryKpiModel = computed(() => ({ ...(props.primaryKpi || {}), title: props.primaryKpi?.title || '重点指标', value: props.primaryKpi?.value || '暂无数据', change: props.primaryKpi?.change ? `较上期 ${props.primaryKpi.change}` : '', target: props.primaryKpi?.target || '', comparisonUnit: props.primaryKpi?.comparisonUnit || props.primaryKpi?.unit || '' }))
const kpiValueStyle = computed(() => ({ color: visualStyle.value.kpi.valueColor || undefined }))
const kpiTitleStyle = computed(() => ({ color: visualStyle.value.kpi.titleColor || undefined }))
const kpiTrendStyle = computed(() => ({ color: visualStyle.value.kpi.trendColor || undefined }))
const contentThemeStyle = computed(() => ({ '--widget-theme-title': visualStyle.value.kpi.titleColor || undefined, '--widget-theme-text': visualStyle.value.kpi.titleColor || undefined }))
// Neutral warning colors follow the widget scheme, then the dashboard theme.
const warningThemeStyle = computed(() => {
  const style = props.widget.config?.style || {}
  const dark = surfaceTone.value === 'dark'
  const accent = style.themeAccent || visualStyle.value.kpi.valueColor
    || (style.palettePreset || style.colors?.length ? widgetPalette(props.widget)[0] : '')
    || 'var(--db-accent, #1261a6)'
  const surface = resolveWidgetBackgroundMode(style) === 'solid' && style.background
    ? style.background : dark ? '#182b3a' : 'var(--db-surface, #ffffff)'
  return {
    ...contentThemeStyle.value,
    '--warning-accent': accent,
    '--warning-surface': surface,
    '--warning-foreground': dark ? '#edf6fc' : 'var(--db-text, #25343b)',
    '--warning-title': visualStyle.value.kpi.titleColor || 'var(--warning-foreground)',
    '--warning-muted': 'color-mix(in srgb, var(--warning-foreground) 65%, var(--warning-surface))',
    '--warning-ink': 'color-mix(in srgb, var(--warning-accent) 70%, var(--warning-foreground))',
    '--warning-soft': 'color-mix(in srgb, var(--warning-accent) 10%, var(--warning-surface))',
    '--warning-border': 'color-mix(in srgb, var(--warning-accent) 22%, var(--warning-surface))'
  }
})
const legacyKpiStyle = computed(() => ({ color: visualStyle.value.kpi.titleColor || undefined }))
const trendTone = computed(() => clinicalTrendTone(widgetKpi.value.status))
const kpiVariant = computed(() => ['standard', 'hero', 'horizontal', 'status', 'trend', 'minimal'].includes(props.widget.config?.style?.kpiVariant) ? props.widget.config.style.kpiVariant : 'standard')
const trendArrow = computed(() => ({ up: '↑', down: '↓', flat: '↔' }[widgetKpi.value.trendDirection] || '↔'))
const trendLabel = computed(() => ({ up: '上升', down: '下降', flat: '持平' }[widgetKpi.value.trendDirection] || '持平'))
const textStyle = computed(() => ({ textAlign: props.widget.config?.text?.align || 'left', color: visualStyle.value.text.bodyColor || props.widget.config?.text?.color || 'inherit', fontSize: `${Number(props.widget.config?.text?.fontSize) || 14}px`, fontWeight: props.widget.config?.text?.fontWeight || 400 }))
const textTitleStyle = computed(() => ({ color: visualStyle.value.text.titleColor || undefined }))
</script>

<style scoped lang="scss">
.dashboard-renderer-card { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; color: var(--idmp-text-primary, #101828); background: transparent; }
.db-primary-metric { padding: 18px 22px; } .db-primary-metric__head, .db-section-title { display:flex; justify-content:space-between; gap:12px; } .db-primary-metric__eyebrow, .db-section-title__description, .db-kpi-card__top, .db-kpi-target { color:var(--idmp-text-helper,#667085); font-size:12px; } h2 { margin:4px 0; font-size:16px; } .db-primary-metric__value { margin-top:20px; font-size:42px; font-weight:650; } .db-primary-metric__change, .db-kpi-change { color:var(--idmp-support-danger,#d92d20); font-size:12px; } .db-primary-metric__meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin:18px 0 0; padding-top:14px; border-top:1px solid var(--idmp-border-subtle,#eaecf0); } .db-primary-metric__meta dt { color:var(--idmp-text-helper,#667085); font-size:11px; } .db-primary-metric__meta dd { margin:3px 0 0; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.db-supporting-metrics,.db-list-card { padding:16px 18px; } .db-supporting-metric { display:grid; grid-template-columns:minmax(100px,1.3fr) 90px 72px minmax(145px,1.25fr) minmax(70px,.8fr); align-items:center; width:100%; min-height:37px; gap:8px; border:0; border-top:1px solid var(--idmp-border-soft,#eaecf0); background:transparent; text-align:left; } .db-supporting-metric:not(:disabled) { cursor:pointer; } .db-supporting-metrics.is-editing .db-supporting-metric { cursor:inherit; } .db-supporting-metric strong { text-align:right; } .db-supporting-metric__comparisons { color:var(--idmp-text-helper,#667085); font-size:11px; white-space:nowrap; } .db-supporting-metric__target { color:var(--idmp-text-helper,#667085); font-size:11px; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-kpi-card { display:flex; flex-direction:column; padding:12px 14px; overflow:hidden; } .db-kpi-card.is-clickable,.db-primary-metric.is-clickable { cursor:pointer; } .db-kpi-card__top { display:flex; justify-content:space-between; min-height:24px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; } .db-kpi-card strong { display:block; margin:5px 0 2px; font-size:27px; line-height:32px; } .db-kpi-dot { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--idmp-support-success,#12b76a); } .db-kpi-dot.is-danger { background:var(--idmp-support-danger,#d92d20); }
.db-kpi-comparisons { display:flex; align-items:center; gap:10px; margin-top:8px; color:var(--db-secondary,#5c6d75); font-size:11px; white-space:nowrap; }.db-kpi-comparisons b { margin-left:auto; font-size:18px; line-height:1; color:inherit; }.db-text-card { display:flex; flex-direction:column; justify-content:center; white-space:pre-wrap; line-height:1.65; }.db-text-card h2 { margin:0 0 8px; font-size:1.15em; }.db-text-card p { margin:0; }
@container (max-height: 135px) { .db-kpi-change,.db-kpi-target { display:none; } .db-kpi-card strong { margin-top:8px; } }
.db-chart-card { display:flex; flex-direction:column; padding:16px 18px 12px; } .db-chart-card :deep(.idmp-chart-frame) { flex:1 1 auto; min-height:0; } .dashboard-chart-table-wrap { min-width:0; max-width:100%; overflow-x:auto; overscroll-behavior-inline:contain; } .dashboard-chart-table { width:max-content; min-width:100%; border-collapse:collapse; font-size:12px; } .dashboard-chart-table th,.dashboard-chart-table td { padding:8px 10px; border-bottom:1px solid var(--idmp-border-soft,#eaecf0); text-align:right; white-space:nowrap; } .dashboard-chart-table th { background:var(--table-header-background,#f3f7f8); } .is-table-zebra .dashboard-chart-table tbody tr:nth-child(even) { background:color-mix(in srgb, var(--table-header-background,#f3f7f8) 35%, transparent); } .is-table-compact .dashboard-chart-table th,.is-table-compact .dashboard-chart-table td { padding:4px 6px; } .dashboard-chart-table th:first-child,.dashboard-chart-table td:first-child { text-align:left; }
.db-list-card { display:flex; flex-direction:column; overflow:hidden; }.db-warning-list,.db-ranking-list { flex:1 1 auto; min-height:0; margin:0; padding:0; overflow:auto; list-style:none; } .db-warning-list li { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; min-height:54px; gap:10px; border-bottom:1px solid var(--idmp-border-soft,#eaecf0); } .db-warning-icon { display:grid; place-items:center; width:26px; height:26px; border-radius:4px; color:var(--idmp-support-danger,#d92d20); background:var(--idmp-support-danger-bg,#fef3f2); } .db-warning-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .db-warning-list time { color:var(--idmp-text-disabled,#98a2b3); font-size:12px; } .db-ranking-list li { display:grid; grid-template-columns:28px 80px minmax(80px,1fr) 48px; align-items:center; min-height:39px; gap:10px; } .rank { display:grid; place-items:center; width:22px; height:22px; border-radius:4px; background:var(--idmp-layer-02,#f2f4f7); font-size:12px; } .rank.is-top { color:var(--idmp-interactive,#1570ef); } .db-rank-bar { height:6px; overflow:hidden; border-radius:6px; background:var(--idmp-layer-02,#f2f4f7); } .db-rank-bar i { display:block; height:100%; background:var(--idmp-interactive,#1570ef); } .db-action-link { border:0; background:transparent; color:var(--idmp-interactive,#1570ef); cursor:pointer; }
.db-warning-row { display:grid; grid-column:1 / -1; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; gap:10px; width:100%; min-height:54px; padding:0; border:0; background:transparent; color:inherit; font:inherit; text-align:left; }
.db-warning-row:not(:disabled) { cursor:pointer; }
.db-warning-row:not(:disabled):hover { background:var(--db-accent-soft,#edf5f3); }
.db-warning-row:focus-visible { outline:2px solid var(--db-accent,#4f8583); outline-offset:-2px; }
.db-supporting-metrics.is-variant-hero { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; align-content:start; }.db-supporting-metrics.is-variant-hero .db-section-title { grid-column:1 / -1; }.db-supporting-metrics.is-variant-hero .db-supporting-metric:first-of-type { grid-column:1 / -1; min-height:68px; background:color-mix(in srgb,var(--db-surface,#fff) 55%,#e6f3f5); }.db-supporting-metrics.is-variant-hero .db-supporting-metric:first-of-type strong { font-size:28px; }.db-supporting-metrics.is-variant-horizontal .db-supporting-metric { grid-template-columns:minmax(80px,1fr) auto auto; min-height:48px; }.db-supporting-metrics.is-variant-horizontal .db-supporting-metric__comparisons,.db-supporting-metrics.is-variant-horizontal .db-supporting-metric__target { display:none; }.db-supporting-metrics.is-variant-status .db-supporting-metric { padding-left:10px; border-left:3px solid var(--db-border,#c8d5da); }.db-supporting-metrics.is-variant-trend .db-supporting-metric { grid-template-columns:minmax(90px,1fr) auto minmax(150px,1fr); }.db-supporting-metrics.is-variant-trend .db-supporting-metric__change,.db-supporting-metrics.is-variant-trend .db-supporting-metric__target { display:none; }.db-supporting-metrics.is-variant-minimal .db-section-title,.db-supporting-metrics.is-variant-minimal .db-supporting-metric__change,.db-supporting-metrics.is-variant-minimal .db-supporting-metric__comparisons,.db-supporting-metrics.is-variant-minimal .db-supporting-metric__target { display:none; }.db-supporting-metrics.is-variant-minimal { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; align-content:center; }.db-supporting-metrics.is-variant-minimal .db-supporting-metric { display:grid; grid-template-columns:1fr; min-height:58px; border:0; text-align:center; }.db-supporting-metrics.is-variant-minimal .db-supporting-metric strong { text-align:center; font-size:26px; }

/* Shared Clinical Light surface content. Saved outer-card styling stays in DashboardWidget. */
.dashboard-renderer-card { padding: 16px 18px; min-width: 0; min-height: 0; color: var(--db-text, #25343b); font-variant-numeric: tabular-nums; }
.dashboard-renderer-card.is-dark-surface { color:#f8fbff; }.dashboard-renderer-card.is-dark-surface .db-section-title__description { color:#d9e9f5; }
.db-section-title { min-height: 30px; align-items: start; margin-bottom: 12px; }
.db-section-title h2 { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:550; margin:0; }
.db-list-card .db-section-title h2 { color:var(--widget-theme-title,inherit); }
.db-section-title__description { margin:5px 0 0; font-size:11px; color:var(--db-muted,#78878e); }
.db-kpi-card__top { font-size:13px; line-height:20px; white-space:normal; min-height:24px; gap:8px; }
.db-kpi-card strong { font-size:32px; font-weight:550; line-height:1.2; letter-spacing:-.6px; margin:12px 0 8px; overflow-wrap:anywhere; }
.db-kpi-change { color:var(--db-secondary,#5c6d75); font-size:12px; }
.db-kpi-change.is-success { color:var(--db-success,#357b62); }
.db-kpi-change.is-danger { color:var(--db-danger,#b45858); }
.db-kpi-change.is-warning { color:var(--db-warning,#a47735); }
.db-kpi-target { margin-top:12px; padding-top:8px; border-top:1px solid var(--db-border,#e3e9eb); font-size:11px; }
.db-primary-metric__value { font-size:36px; font-weight:550; letter-spacing:-.6px; }.db-primary-metric__comparisons { margin-top:8px; }
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
.db-warning-text { display:-webkit-box; overflow:hidden; font-size:12px; line-height:1.6; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.db-warning-text,.db-ranking-list .department { color:var(--widget-theme-text,inherit); }
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
@container (max-height: 130px) {
 .db-list-card .db-section-title { margin-bottom:4px; }
 .db-warning-list li,.db-ranking-list li { min-height:32px; }
 .db-warning-text { -webkit-line-clamp:1; }
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
@container (max-height: 130px) { .db-warning-row { min-height:32px; } }
@container (max-width: 420px) { .db-warning-row { grid-template-columns:26px minmax(0,1fr); gap:7px; min-height:44px; } }
@container (max-width: 160px) { .db-warning-row { grid-template-columns:1fr; min-height:0; } }

/* Variants rearrange the established KPI presentation only; source values,
   comparisons and clinical trend tone remain untouched. */
.db-kpi-card.is-variant-hero { padding:clamp(16px,3cqi,28px); justify-content:center; }.db-kpi-card.is-variant-hero strong { margin:10px 0; font-size:clamp(36px,8cqi,58px); font-weight:600; line-height:1.05; }.db-kpi-card.is-variant-hero .db-kpi-card__top { font-size:12px; }.db-kpi-card.is-variant-hero .db-kpi-change { margin-top:4px; }.db-kpi-card.is-variant-hero .db-kpi-comparisons { margin-top:8px; }.db-kpi-card.is-variant-hero .db-kpi-target { display:none; }
.db-kpi-card.is-variant-horizontal { display:grid; grid-template-columns:minmax(0,1fr) auto auto; grid-template-rows:auto auto; column-gap:14px; align-items:center; padding:12px 16px; }.db-kpi-card.is-variant-horizontal .db-kpi-card__top { grid-column:1; grid-row:1 / span 2; }.db-kpi-card.is-variant-horizontal strong { grid-column:2; grid-row:1 / span 2; margin:0; font-size:clamp(24px,5cqi,36px); white-space:nowrap; }.db-kpi-card.is-variant-horizontal .db-kpi-change { grid-column:3; grid-row:1; white-space:nowrap; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { grid-column:3; grid-row:2; margin:0; gap:4px; font-size:10px; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons span:first-child { display:none; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons b { display:none; }.db-kpi-card.is-variant-horizontal .db-kpi-target { display:none; }
.db-kpi-card.is-variant-status { border-left:4px solid var(--db-border,#c8d5da); padding-left:16px; }.db-kpi-card.is-variant-status .db-kpi-dot { width:10px; height:10px; box-shadow:0 0 0 4px color-mix(in srgb,currentColor 12%,transparent); }.db-kpi-card.is-variant-status .db-kpi-card__top { padding-bottom:8px; border-bottom:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-status .db-kpi-change { margin-top:8px; font-weight:600; }.db-kpi-card.is-variant-status .db-kpi-comparisons { margin-top:auto; }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-danger) { border-left-color:var(--db-danger,#b45858); }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-warning) { border-left-color:var(--db-warning,#a47735); }.db-kpi-card.is-variant-status:has(.db-kpi-dot.is-success) { border-left-color:var(--db-success,#357b62); }
.db-kpi-card.is-variant-trend .db-kpi-change { display:none; }.db-kpi-card.is-variant-trend strong { margin-bottom:14px; }.db-kpi-card.is-variant-trend .db-kpi-comparisons { display:grid; grid-template-columns:1fr 1fr auto; gap:0; margin-top:auto; padding-top:10px; border-top:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-trend .db-kpi-comparisons span { padding-right:8px; }.db-kpi-card.is-variant-trend .db-kpi-comparisons span + span { padding-left:8px; border-left:1px solid var(--db-border,#e3e9eb); }.db-kpi-card.is-variant-trend .db-kpi-target { display:none; }
.db-kpi-card.is-variant-minimal { justify-content:center; padding:clamp(14px,3cqi,26px); }.db-kpi-card.is-variant-minimal .db-kpi-card__top { justify-content:center; min-height:auto; color:var(--db-muted,#78878e); font-size:11px; text-align:center; }.db-kpi-card.is-variant-minimal .db-kpi-dot,.db-kpi-card.is-variant-minimal .db-kpi-change,.db-kpi-card.is-variant-minimal .db-kpi-target { display:none; }.db-kpi-card.is-variant-minimal strong { margin:10px 0 0; font-size:clamp(34px,7cqi,54px); font-weight:500; line-height:1.05; text-align:center; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons { justify-content:center; margin-top:10px; font-size:10px; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons span:first-child { display:none; }.db-kpi-card.is-variant-minimal .db-kpi-comparisons b { display:none; }
@container (max-width: 330px) { .db-kpi-card.is-variant-horizontal { display:flex; flex-wrap:wrap; align-content:center; gap:4px 8px; }.db-kpi-card.is-variant-horizontal .db-kpi-card__top { width:100%; }.db-kpi-card.is-variant-horizontal strong,.db-kpi-card.is-variant-horizontal .db-kpi-change,.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { display:block; }.db-kpi-card.is-variant-horizontal .db-kpi-comparisons { margin-left:auto; }.db-kpi-card.is-variant-hero strong,.db-kpi-card.is-variant-minimal strong { font-size:30px; } }
.db-kpi-card.is-variant-horizontal .db-kpi-comparisons span:first-child,
.db-kpi-card.is-variant-minimal .db-kpi-comparisons span:first-child { display:inline !important; }
/* Keep warning states compact without implying a healthy system. */
.db-warning-card { padding:12px; gap:10px; }
.db-warning-header { display:flex; flex:0 0 auto; flex-wrap:wrap; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--warning-border); border-radius:8px; background:linear-gradient(110deg,var(--warning-soft),color-mix(in srgb,var(--warning-accent) 5%,var(--warning-surface))); }
.db-warning-header h2 { display:flex; flex:1 1 110px; min-width:0; align-items:center; gap:7px; margin:0; color:var(--warning-title); font-size:13px; font-weight:600; }
.db-warning-header h2 > span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.db-warning-header__icon { display:grid; flex:0 0 auto; place-items:center; width:24px; height:24px; border-radius:6px; color:var(--warning-ink); background:color-mix(in srgb,var(--warning-accent) 16%,var(--warning-surface)); }
.db-warning-count { padding:3px 6px; border-radius:4px; color:var(--warning-ink); background:var(--warning-surface); font-size:11px; white-space:nowrap; }
.db-warning-header .db-action-link { flex:0 0 auto; padding:2px 0; color:var(--warning-ink); font-size:12px; white-space:nowrap; }
.db-warning-state { display:flex; flex:0 1 auto; align-items:center; gap:10px; min-height:0; padding:12px; border:1px solid var(--warning-border); border-radius:8px; background:color-mix(in srgb,var(--warning-accent) 5%,var(--warning-surface)); overflow:auto; }
.db-warning-state__icon { display:grid; flex:0 0 auto; place-items:center; width:32px; height:32px; border-radius:8px; background:var(--warning-soft); color:var(--warning-ink); font-size:18px; }
.db-warning-state__copy { flex:1; min-width:0; }
.db-warning-state__copy strong { color:var(--warning-title); font-size:12px; font-weight:500; }
.db-warning-state__copy p { margin:4px 0 0; color:var(--warning-muted); font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
.db-warning-state.is-error { flex-wrap:wrap; border-color:#f3dec3; background:#fffaf2; }
.db-warning-state.is-error .db-warning-state__icon { background:#fff0d9; color:#b77922; }
.db-warning-state.is-error .db-warning-state__copy strong { color:#8f6229; }
.db-warning-card .db-warning-list li { display:block; min-height:0; border-bottom:1px solid var(--warning-border); }
.db-warning-card .db-warning-list li:last-child { border-bottom:0; }
.db-warning-card .db-warning-row { box-sizing:border-box; grid-template-columns:26px minmax(0,1fr) auto; gap:8px; min-height:52px; padding:8px 6px; border-left:3px solid var(--warning-accent); border-radius:4px; }
.db-warning-card .db-warning-row.is-danger { border-left-color:#d64c54; }
.db-warning-card .db-warning-row.is-warning { border-left-color:#db942c; }
.db-warning-card .db-warning-row:not(:disabled):hover { background:var(--warning-soft); }
.db-warning-card .db-warning-icon.is-danger,.db-warning-severity.is-danger { color:#c83e49; background:#fff0f1; }
.db-warning-card .db-warning-icon.is-warning,.db-warning-severity.is-warning { color:#b97616; background:#fff5e3; }
.db-warning-card .db-warning-icon.is-info,.db-warning-severity.is-info { color:var(--warning-ink); background:var(--warning-soft); }
.db-warning-card .db-warning-text { color:var(--warning-title); }
.db-warning-card .db-warning-list time { color:var(--warning-muted); }
.db-warning-card .db-warning-row:focus-visible { outline-color:var(--warning-accent); }
.db-warning-card .db-warning-state .el-button { --el-color-primary:var(--warning-ink); --el-color-primary-light-9:var(--warning-soft); --el-color-primary-light-7:var(--warning-border); }
.db-warning-content { min-width:0; }
.db-warning-content__title { display:flex; align-items:center; gap:6px; min-width:0; }
.db-warning-severity { flex:0 0 auto; padding:1px 5px; border-radius:4px; font-size:10px; line-height:18px; }
.db-warning-card .db-warning-text { display:block; min-width:0; white-space:nowrap; text-overflow:ellipsis; font-size:12px; }
.db-warning-detail { display:block; margin-top:3px; color:var(--warning-muted); font-size:11px; overflow-wrap:anywhere; }
.db-warning-card.is-dark-surface .db-warning-state.is-error { background:#473926; border-color:#715634; }
.db-warning-card.is-dark-surface .db-warning-state.is-error .db-warning-state__copy strong { color:#f2d19f; }
@container (max-width:420px) { .db-warning-card .db-warning-row { grid-template-columns:26px minmax(0,1fr); } }
@container (max-height:150px) { .db-warning-card { padding:8px; gap:6px; } .db-warning-header { padding:5px 8px; } .db-warning-state { padding:8px; } .db-warning-state__copy p { margin-top:2px; } .db-warning-card .db-warning-row { min-height:32px; padding-block:4px; } }
@container (max-width:160px) { .db-warning-header { padding:5px; gap:4px; } .db-warning-header h2 { flex-basis:100%; } .db-warning-count { font-size:10px; } .db-warning-state { padding:8px; } .db-warning-state__icon { display:none; } .db-warning-card .db-warning-row { grid-template-columns:minmax(0,1fr); } }
.db-ranking-empty { margin:8px 0; color:var(--db-muted,#78878e); font-size:12px; line-height:1.6; }
</style>
