<template>
  <div ref="root" class="studio-hover-preview" @mouseenter="scheduleOpen" @mouseleave="scheduleClose" @focusin="openImmediately" @focusout="scheduleClose">
    <slot />
    <Transition name="studio-preview-fade">
      <aside v-if="visible" class="studio-hover-preview__panel" :class="{ 'is-template': template }" :style="panelStyle" role="tooltip" @mouseenter="clearTimer" @mouseleave="scheduleClose">
        <template v-if="template">
          <header><span>模板预览</span><strong>{{ template.name }}</strong></header>
          <div class="studio-hover-preview__board" :class="{ 'is-dark': templateIsDark }" :style="{ ...templateSurfaceStyle, gridTemplateRows: 'repeat(30,minmax(0,1fr))' }" aria-hidden="true">
            <div v-for="(item, index) in template.widgets" :key="index" class="studio-hover-preview__mini-card" :class="`is-${templateWidgetKind(item)}`" :style="templateGridStyle(item)">
              <strong>{{ templateWidgetLabel(item) }}</strong>
              <span class="studio-hover-preview__mini-viz"><i v-for="part in 5" :key="part" /></span>
            </div>
          </div>
          <p>{{ template.detail?.visual || template.description || '可编辑的看板布局模板' }}</p>
          <dl><dt>适用</dt><dd>{{ template.detail?.useCase || '通用业务分析' }}</dd><dt>构图</dt><dd>{{ template.detail?.layout || `${template.widgets?.length || 0} 个组件` }}</dd></dl>
          <footer>点击卡片查看详情；点击“使用”才会应用模板</footer>
        </template>
        <template v-else-if="widgetItem">
          <header><span>组件示例</span><strong>{{ widgetItem.name }}</strong></header>
          <div class="studio-hover-preview__widget-demo" :class="`is-${widgetItem.type}`" aria-hidden="true">
            <template v-if="widgetItem.type === 'kpi'"><small>本期指标</small><b>52.63%</b><em>同比 +1.24%</em></template>
            <template v-else-if="widgetItem.type === 'metric-group'"><i v-for="index in 4" :key="index"><small>核心指标</small><b>{{ 20 + index * 7 }}</b></i></template>
            <template v-else-if="widgetItem.type === 'warnings'"><i class="is-danger" /><span>高危指标已超过阈值</span><small>刚刚</small></template>
            <template v-else-if="widgetItem.type === 'text'"><b>业务说明</b><span>展示指标口径、结论与使用提示。</span></template>
            <template v-else-if="widgetItem.type === 'table'"><i v-for="index in 3" :key="index"><span>科室 {{ index }}</span><b>{{ 86 - index * 8 }}</b></i></template>
            <template v-else-if="widgetItem.type === 'gauge'"><div class="studio-hover-preview__gauge">72<span>%</span></div><small>目标达成率</small></template>
            <template v-else-if="widgetItem.type === 'bar'"><div class="studio-hover-preview__bar"><i v-for="(height, index) in [42, 76, 55, 88, 64, 48]" :key="index" :style="{ height: `${height}%` }" /></div><span>分类数值比较</span></template>
            <template v-else-if="widgetItem.type === 'line'"><svg class="studio-hover-preview__line" viewBox="0 0 240 76"><path d="M4 66H236M4 38H236M4 10H236" class="grid" /><polyline points="5,58 42,46 78,52 116,22 154,34 195,13 235,27" /><circle v-for="point in linePoints" :key="point.x" :cx="point.x" :cy="point.y" r="3" /></svg><span>时间序列趋势</span></template>
            <template v-else-if="widgetItem.type === 'scatter'"><svg class="studio-hover-preview__scatter" viewBox="0 0 240 76"><path d="M8 4V69H236" class="axis" /><circle v-for="point in scatterPoints" :key="`${point.x}-${point.y}`" :cx="point.x" :cy="point.y" :r="point.r" /></svg><span>双度量相关分布</span></template>
            <template v-else-if="widgetItem.type === 'pie'"><div class="studio-hover-preview__pie" /><span>构成占比分析</span></template>
            <template v-else-if="widgetItem.type === 'funnel'"><i /><i /><i /><i /></template>
            <template v-else-if="widgetItem.type === 'radar'"><div class="studio-hover-preview__radar" /><span>多维指标比较</span></template>
            <template v-else-if="widgetItem.type === 'heatmap'"><div class="studio-hover-preview__heatmap"><i v-for="index in 24" :key="index" :style="{ opacity: 0.2 + ((index * 7) % 10) / 12 }" /></div><span>维度 × 数值矩阵</span></template>
            <template v-else-if="widgetItem.type === 'map'">
              <div class="studio-hover-preview__map">
                <svg viewBox="0 0 176 92" role="img" aria-label="区域分级着色示意图">
                  <path class="region region-1" d="M13 32 34 13 62 14 72 31 58 46 31 48 15 41Z" />
                  <path class="region region-2" d="M62 14 91 8 113 19 105 39 74 43 72 31Z" />
                  <path class="region region-3" d="M113 19 143 23 162 39 149 54 113 50 105 39Z" />
                  <path class="region region-4" d="M31 48 58 46 74 43 82 68 57 82 28 70Z" />
                  <path class="region region-5" d="M74 43 105 39 113 50 149 54 137 76 107 83 82 68Z" />
                  <circle class="region region-3" cx="150" cy="79" r="4" />
                </svg>
                <div class="studio-hover-preview__map-scale"><span>低</span><i /><span>高</span></div>
              </div>
              <div class="studio-hover-preview__map-ranking">
                <i><span>华东</span><b>86</b></i>
                <i><span>华北</span><b>72</b></i>
                <i><span>西南</span><b>54</b></i>
              </div>
            </template>
            <template v-else><div class="studio-hover-preview__chart"><i v-for="index in 7" :key="index" :style="{ height: `${25 + (index * 13) % 55}%` }" /></div><span>{{ widgetItem.hint }}</span></template>
          </div>
          <p>{{ widgetItem.hint }}。示例仅用于展示样式，不代表正式业务数据。</p>
          <footer>点击选择后，再点击“添加组件”</footer>
        </template>
      </aside>
    </Transition>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

const props = defineProps({ template: { type: Object, default: null }, widgetItem: { type: Object, default: null }, disabled: { type: Boolean, default: false } })
const root = ref(null)
const visible = ref(false)
const position = reactive({ left: 8, top: 8 })
let timer

const panelStyle = computed(() => ({ left: `${position.left}px`, top: `${position.top}px` }))
const linePoints = Object.freeze([{ x: 5, y: 58 }, { x: 42, y: 46 }, { x: 78, y: 52 }, { x: 116, y: 22 }, { x: 154, y: 34 }, { x: 195, y: 13 }, { x: 235, y: 27 }])
const scatterPoints = Object.freeze([{ x: 25, y: 57, r: 4 }, { x: 48, y: 45, r: 5 }, { x: 72, y: 61, r: 3 }, { x: 94, y: 37, r: 4 }, { x: 121, y: 48, r: 6 }, { x: 148, y: 25, r: 4 }, { x: 178, y: 34, r: 5 }, { x: 207, y: 16, r: 4 }, { x: 222, y: 43, r: 3 }])
const templateSurfaceStyle = computed(() => {
  const background = props.template?.appearance?.background?.value
  return { background: typeof background === 'string' && background ? background : '#ffffff' }
})
const templateIsDark = computed(() => /dark|deep|#0[0-9a-f]{5}|#1[0-9a-f]{5}/i.test(`${props.template?.visualTone || ''} ${props.template?.appearance?.background?.assetKey || ''} ${props.template?.appearance?.background?.value || ''}`))
function templateGridStyle(widget = {}) {
  const layout = widget.layout || {}
  const style = widget.config?.style || {}
  return {
    gridColumn: `${Number(layout.x) + 1} / span ${Number(layout.w) || 1}`,
    gridRow: `${Number(layout.y) + 1} / span ${Number(layout.h) || 1}`,
    background: style.background || undefined,
    borderColor: style.borderColor || undefined,
    borderRadius: `${Math.min(6, Math.max(1, Number(style.borderRadius) / 3 || 3))}px`
  }
}
function templateWidgetKind(widget = {}) { return widget.type === 'chart' ? widget.chartKind || 'chart' : widget.type || 'chart' }
function templateWidgetLabel(widget = {}) {
  const labels = { 'metric-group': '指标组', kpi: 'KPI', line: '趋势', bar: '柱状', pie: '构成', table: '明细', warnings: '预警', ranking: '排名', text: '说明', radar: '雷达', funnel: '漏斗', gauge: '仪表', heatmap: '热力', scatter: '散点', map: '区域' }
  return labels[templateWidgetKind(widget)] || '分析'
}
function clearTimer() { window.clearTimeout(timer) }
function placePanel() {
  const rect = root.value?.getBoundingClientRect()
  if (!rect) return
  const width = props.template ? 380 : 320
  const height = props.template ? 368 : 232
  position.left = window.innerWidth - rect.right >= width + 14 ? rect.right + 12 : Math.max(8, rect.left - width - 12)
  position.top = Math.max(8, Math.min(window.innerHeight - height - 8, rect.top - 16))
}
function openImmediately() { clearTimer(); if (props.disabled) return; placePanel(); visible.value = true }
function scheduleOpen() { clearTimer(); if (!props.disabled) timer = window.setTimeout(openImmediately, 180) }
function scheduleClose() { clearTimer(); timer = window.setTimeout(() => { visible.value = false }, 120) }
watch(() => props.disabled, value => { if (value) { clearTimer(); visible.value = false } })
onBeforeUnmount(clearTimer)
</script>

<style scoped>
.studio-hover-preview { display:block; }
.studio-hover-preview__panel { position:fixed; z-index:2200; box-sizing:border-box; width:320px; padding:12px; border:1px solid #b9d5df; border-radius:10px; background:#fff; box-shadow:0 16px 36px rgba(25,57,70,.20); color:#344054; pointer-events:auto; }.studio-hover-preview__panel.is-template { width:380px; }
.studio-hover-preview__panel header { display:grid; gap:2px; margin-bottom:9px; }.studio-hover-preview__panel header span { color:#667780; font-size:10px; }.studio-hover-preview__panel header strong { color:#174d6c; font-size:14px; }.studio-hover-preview__panel p { margin:9px 0 7px; color:#52636c; font-size:11px; line-height:1.45; }.studio-hover-preview__panel dl { display:grid; grid-template-columns:30px 1fr; gap:4px 7px; margin:0; font-size:10px; line-height:1.4; }.studio-hover-preview__panel dt { color:#78878e; }.studio-hover-preview__panel dd { margin:0; color:#344054; }.studio-hover-preview__panel footer { margin-top:9px; padding-top:7px; border-top:1px solid #e5eef0; color:#667780; font-size:10px; }
.studio-hover-preview__board { display:grid; grid-template-columns:repeat(24,1fr); grid-template-rows:repeat(30,5px); gap:2px; height:176px; padding:7px; border:1px solid rgba(73,126,145,.28); border-radius:7px; overflow:hidden; }.studio-hover-preview__mini-card { display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; padding:3px 4px; border:1px solid rgba(76,126,141,.20); border-radius:3px; background:rgba(255,255,255,.90); box-shadow:0 2px 5px rgba(31,69,89,.09); color:#315a66; }.studio-hover-preview__mini-card strong { overflow:hidden; font-size:6px; font-weight:650; line-height:1; text-overflow:ellipsis; white-space:nowrap; }.studio-hover-preview__mini-viz { display:flex; flex:1; align-items:flex-end; justify-content:center; min-height:0; gap:2px; padding-top:3px; }.studio-hover-preview__mini-viz i { display:block; width:11%; height:44%; border-radius:1px 1px 0 0; background:#6da8b5; }.studio-hover-preview__mini-viz i:nth-child(2) { height:72%; }.studio-hover-preview__mini-viz i:nth-child(3) { height:56%; }.studio-hover-preview__mini-viz i:nth-child(4) { height:86%; }.studio-hover-preview__mini-viz i:nth-child(5) { height:64%; }.studio-hover-preview__mini-card.is-line .studio-hover-preview__mini-viz { align-items:center; border-bottom:1px solid #a9c8cf; transform:skewY(-8deg); }.studio-hover-preview__mini-card.is-line .studio-hover-preview__mini-viz i { width:4px; height:4px; border-radius:50%; }.studio-hover-preview__mini-card.is-pie .studio-hover-preview__mini-viz { flex:none; align-self:center; width:18px; height:18px; margin:auto; padding:0; border-radius:50%; background:conic-gradient(#4d9aa4 0 42%,#89c5b7 42% 70%,#e2aa72 70%); }.studio-hover-preview__mini-card.is-pie .studio-hover-preview__mini-viz i { display:none; }.studio-hover-preview__mini-card.is-metric-group .studio-hover-preview__mini-viz { display:grid; grid-template-columns:repeat(3,1fr); align-items:stretch; }.studio-hover-preview__mini-card.is-metric-group .studio-hover-preview__mini-viz i { width:auto; height:auto; border-radius:2px; background:#bfe2dc; }.studio-hover-preview__mini-card.is-warnings { color:#8f493f; background:rgba(255,245,241,.94); }.studio-hover-preview__mini-card.is-warnings .studio-hover-preview__mini-viz,.studio-hover-preview__mini-card.is-text .studio-hover-preview__mini-viz,.studio-hover-preview__mini-card.is-ranking .studio-hover-preview__mini-viz { display:grid; align-content:center; }.studio-hover-preview__mini-card.is-warnings .studio-hover-preview__mini-viz i,.studio-hover-preview__mini-card.is-text .studio-hover-preview__mini-viz i,.studio-hover-preview__mini-card.is-ranking .studio-hover-preview__mini-viz i { width:100%; height:3px; border-radius:2px; background:#9bb7c1; }.studio-hover-preview__mini-card.is-warnings .studio-hover-preview__mini-viz i { background:#d99a80; }.studio-hover-preview__mini-card.is-ranking .studio-hover-preview__mini-viz i:nth-child(2) { width:80%; }.studio-hover-preview__mini-card.is-ranking .studio-hover-preview__mini-viz i:nth-child(3) { width:62%; }.studio-hover-preview__board.is-dark .studio-hover-preview__mini-card { border-color:rgba(202,230,240,.28); background:rgba(16,47,75,.70); color:#edf7fa; box-shadow:none; }.studio-hover-preview__board.is-dark .studio-hover-preview__mini-viz i { background:#54b8c2; }
.studio-hover-preview__widget-demo { display:flex; position:relative; align-items:center; justify-content:center; min-height:102px; overflow:hidden; border:1px solid #dbe8eb; border-radius:7px; background:linear-gradient(145deg,#f8fcfc,#eef7f8); color:#356c7b; }.studio-hover-preview__widget-demo small { color:#6d8088; font-size:10px; }.studio-hover-preview__widget-demo.is-kpi { display:grid; align-content:center; justify-items:start; gap:5px; padding:14px 18px; }.studio-hover-preview__widget-demo.is-kpi b { color:#157a8a; font-size:30px; line-height:1; }.studio-hover-preview__widget-demo.is-kpi em { color:#3e927d; font-size:11px; font-style:normal; }.studio-hover-preview__widget-demo.is-metric-group { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; padding:10px; }.studio-hover-preview__widget-demo.is-metric-group i { display:grid; gap:4px; padding:8px 5px; border-radius:5px; background:#d9eeee; font-style:normal; }.studio-hover-preview__widget-demo.is-metric-group b { color:#167d8a; font-size:17px; }.studio-hover-preview__widget-demo.is-warnings { display:grid; grid-template-columns:22px 1fr auto; gap:8px; padding:0 13px; }.studio-hover-preview__widget-demo.is-warnings > i { width:16px; height:16px; border-radius:50%; background:#dc6d65; }.studio-hover-preview__widget-demo.is-warnings span { font-size:12px; }.studio-hover-preview__widget-demo.is-text { display:grid; align-content:center; justify-items:start; gap:8px; padding:15px; }.studio-hover-preview__widget-demo.is-text b { font-size:15px; }.studio-hover-preview__widget-demo.is-text span { color:#667780; font-size:11px; }.studio-hover-preview__widget-demo.is-table { display:grid; align-content:center; gap:0; padding:10px 15px; }.studio-hover-preview__widget-demo.is-table i { display:flex; justify-content:space-between; width:230px; padding:6px; border-bottom:1px solid #d7e5e8; font-style:normal; font-size:11px; }.studio-hover-preview__widget-demo.is-gauge { display:grid; justify-items:center; gap:5px; }.studio-hover-preview__gauge { display:grid; place-items:center; width:68px; height:68px; border:10px solid #7bb9bd; border-left-color:#d9ebed; border-radius:50%; color:#247b83; font-size:18px; font-weight:700; }.studio-hover-preview__gauge span { font-size:10px; }.studio-hover-preview__widget-demo.is-pie { display:grid; grid-template-columns:70px 1fr; gap:12px; padding:12px; }.studio-hover-preview__pie { width:64px; height:64px; border-radius:50%; background:conic-gradient(#4d9aa4 0 42%,#89c5b7 42% 70%,#e2aa72 70%); }.studio-hover-preview__widget-demo.is-funnel { display:grid; align-content:center; gap:5px; }.studio-hover-preview__widget-demo.is-funnel i { display:block; height:12px; background:#5f9eaa; clip-path:polygon(0 0,100% 0,83% 100%,17% 100%); }.studio-hover-preview__widget-demo.is-funnel i:nth-child(1) { width:135px; }.studio-hover-preview__widget-demo.is-funnel i:nth-child(2) { width:105px; }.studio-hover-preview__widget-demo.is-funnel i:nth-child(3) { width:75px; }.studio-hover-preview__widget-demo.is-funnel i:nth-child(4) { width:48px; }.studio-hover-preview__widget-demo.is-radar { display:grid; grid-template-columns:82px 1fr; gap:12px; padding:10px; }.studio-hover-preview__radar { width:70px; height:70px; background:rgba(73,154,164,.45); clip-path:polygon(50% 0,100% 30%,82% 100%,18% 100%,0 30%); }.studio-hover-preview__widget-demo.is-heatmap { display:grid; grid-template-columns:repeat(5,22px); grid-auto-rows:16px; gap:3px; }.studio-hover-preview__widget-demo.is-heatmap i { background:#c8e3e1; }.studio-hover-preview__widget-demo.is-heatmap i:nth-child(3n) { background:#5aa4a7; }.studio-hover-preview__widget-demo.is-heatmap i:nth-child(4n) { background:#89c4b8; }.studio-hover-preview__widget-demo.is-map { display:grid; grid-template-columns:72px 1fr; gap:12px; padding:12px; }.studio-hover-preview__map { display:grid; place-items:center; width:68px; height:58px; border-radius:46% 54% 49% 51% / 38% 42% 58% 62%; background:#8fc0a7; color:#fff; font-size:10px; }.studio-hover-preview__widget-demo:not(.is-kpi):not(.is-metric-group):not(.is-warnings):not(.is-text):not(.is-table):not(.is-gauge):not(.is-pie):not(.is-funnel):not(.is-radar):not(.is-heatmap):not(.is-map) { display:grid; grid-template-rows:1fr auto; gap:8px; padding:10px 14px; }.studio-hover-preview__chart { display:flex; align-items:end; gap:8px; width:230px; height:62px; padding-bottom:3px; border-bottom:1px solid #cfe0e4; }.studio-hover-preview__chart i { width:20px; border-radius:3px 3px 0 0; background:linear-gradient(#65b1b3,#36848f); }
.studio-hover-preview__widget-demo.is-map { display:grid; grid-template-columns:minmax(0,1fr) 72px; gap:10px; padding:8px 12px; background:linear-gradient(145deg,#fbfefe,#eff8f7); }
.studio-hover-preview__widget-demo.is-map .studio-hover-preview__map { display:grid; min-width:0; width:auto; height:auto; place-items:initial; align-content:center; gap:2px; border-radius:0; background:none; color:inherit; }
.studio-hover-preview__map svg { display:block; width:100%; height:74px; filter:drop-shadow(0 3px 4px rgba(30,93,101,.12)); }
.studio-hover-preview__map .region { stroke:#fff; stroke-width:2; stroke-linejoin:round; }
.studio-hover-preview__map .region-1 { fill:#d8efea; }.studio-hover-preview__map .region-2 { fill:#a8d8ce; }.studio-hover-preview__map .region-3 { fill:#4fa79e; }.studio-hover-preview__map .region-4 { fill:#7fc3b8; }.studio-hover-preview__map .region-5 { fill:#207f80; }
.studio-hover-preview__map-scale { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:4px; color:#73888c; font-size:8px; }
.studio-hover-preview__map-scale i { display:block; height:5px; border-radius:9px; background:linear-gradient(90deg,#d8efea,#7fc3b8,#207f80); }
.studio-hover-preview__map-ranking { display:grid; align-content:center; gap:7px; }
.studio-hover-preview__map-ranking i { display:grid; grid-template-columns:1fr auto; align-items:center; gap:5px; padding-bottom:5px; border-bottom:1px solid #dcebea; color:#60777c; font-size:9px; font-style:normal; }
.studio-hover-preview__map-ranking i:last-child { border-bottom:0; }.studio-hover-preview__map-ranking b { color:#1d7477; font-size:12px; }
.studio-hover-preview__widget-demo.is-bar,.studio-hover-preview__widget-demo.is-line,.studio-hover-preview__widget-demo.is-scatter,.studio-hover-preview__widget-demo.is-heatmap { display:grid; grid-template-columns:1fr; grid-template-rows:1fr auto; justify-items:center; gap:5px; padding:8px 14px; }.studio-hover-preview__bar { display:flex; align-items:end; justify-content:center; gap:12px; width:235px; height:68px; border-bottom:1px solid #9fb9c2; }.studio-hover-preview__bar i { width:22px; border-radius:3px 3px 0 0; background:linear-gradient(#69b7ba,#347f8d); }.studio-hover-preview__line,.studio-hover-preview__scatter { width:240px; height:76px; overflow:visible; }.studio-hover-preview__line .grid { fill:none; stroke:#d8e6e9; stroke-width:1; }.studio-hover-preview__line polyline { fill:none; stroke:#268e9a; stroke-width:3; stroke-linecap:round; stroke-linejoin:round; }.studio-hover-preview__line circle { fill:#fff; stroke:#268e9a; stroke-width:2; }.studio-hover-preview__scatter .axis { fill:none; stroke:#9eb8c0; stroke-width:1; }.studio-hover-preview__scatter circle { fill:#338c99; opacity:.72; }.studio-hover-preview__heatmap { display:grid; grid-template-columns:repeat(6,28px); grid-auto-rows:13px; gap:3px; padding:5px; border-left:1px solid #9fb9c2; border-bottom:1px solid #9fb9c2; }.studio-hover-preview__heatmap i { display:block; background:#258b98; border-radius:2px; }
.studio-preview-fade-enter-active,.studio-preview-fade-leave-active { transition:opacity .14s ease,transform .14s ease; }.studio-preview-fade-enter-from,.studio-preview-fade-leave-to { opacity:0; transform:translateY(4px); }
@media (prefers-reduced-motion: reduce) { .studio-preview-fade-enter-active,.studio-preview-fade-leave-active { transition:none; } }
</style>
