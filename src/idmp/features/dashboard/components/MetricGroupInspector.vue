<template>
  <section class="metric-group-inspector" aria-label="指标组设置">
    <template v-if="!selectedItem">
      <h3>指标组</h3>
      <p class="metric-group-inspector__hint">管理组标题、内部网格与指标。点击画布中的指标可进入单项编辑。</p>
      <label>组标题<input :value="config.title" @input="patch({ title: $event.target.value })" /></label>
      <label>副标题（可选）<input :value="config.subtitle" @input="patch({ subtitle: $event.target.value })" /></label>
      <label>列数<select :value="config.layout.columns" @change="patchLayout({ columns: $event.target.value })"><option value="auto">自动</option><option value="2">2 列</option><option value="3">3 列</option><option value="4">4 列</option></select></label>
      <label>间距<input type="number" min="0" max="32" :value="config.layout.gap" @change="patchLayout({ gap: Number($event.target.value) })" /></label>
      <h3>指标组方案</h3>
      <p class="metric-group-inspector__hint">应用方案只调整排版与呈现，不改变指标绑定或数据。</p>
      <div class="metric-group-inspector__presets" data-testid="metric-group-presets">
        <button v-for="preset in presets" :key="preset.id" type="button" :class="{ 'is-selected': selectedPresetId === preset.id }" @click="selectedPresetId = preset.id">
          <span class="metric-group-inspector__preset-preview" :class="`is-${preset.thumbnail}`"><i v-for="index in 5" :key="index" /></span>
          <strong>{{ preset.name }}</strong><small>{{ preset.description }}</small>
        </button>
      </div>
      <button data-testid="metric-group-apply-preset" type="button" :disabled="!selectedPresetId" @click="applyPreset">应用方案</button>
      <label>指标呈现<select :value="config.itemAppearance" @change="patch({ itemAppearance: $event.target.value })"><option value="flat">无边界</option><option value="divider">分隔线</option><option value="tile">卡片</option></select></label>
      <h3>指标（{{ config.items.length }}）</h3>
      <div class="metric-group-inspector__items"><button v-for="(item, index) in config.items" :key="item.id" type="button" @click="select(item.id)"><span>{{ index + 1 }}. {{ item.label }}</span><small>{{ item.sourceName || '未绑定' }}</small></button></div>
      <button data-testid="metric-group-add-item" type="button" @click="add">+ 添加指标</button>
      <p v-if="!config.items.length" class="metric-group-inspector__empty">还没有指标。添加第一个指标开始编排。</p>
    </template>
    <template v-else>
      <button class="metric-group-inspector__back" type="button" @click="select('')">返回指标组</button>
      <h3>指标</h3>
      <p class="metric-group-inspector__hint">正在编辑 {{ selectedItem.label }}。数据绑定继续复用现有 KPI 规则。</p>
      <label>名称<input data-testid="metric-item-label" :value="selectedItem.label" @input="patchItem({ label: $event.target.value })" /></label>
      <label>指标来源<select :value="selectedItem.sourceCode" @change="changeSource($event.target.value)"><option value="">未绑定</option><option v-for="source in sources" :key="source.code" :value="source.code">{{ source.name }}</option></select></label>
      <label>单位<input :value="selectedItem.unit || ''" @input="patchItem({ unit: $event.target.value })" /></label>
      <label>宽度<select data-testid="metric-item-span" :value="selectedItem.layout.span" @change="patchItem({ layout: { ...selectedItem.layout, span: Number($event.target.value) } })"><option :value="1">普通</option><option :value="2">加宽</option></select></label>
      <label>强调级别<select data-testid="metric-item-emphasis" :value="selectedItem.emphasis" @change="patchItem({ emphasis: $event.target.value })"><option value="normal">普通</option><option value="emphasis">重点</option><option value="hero">主指标</option></select></label>
      <label>内容对齐<select :value="selectedItem.align" @change="patchItem({ align: $event.target.value })"><option value="left">左</option><option value="center">居中</option></select></label>
      <div class="metric-group-inspector__order"><button type="button" :disabled="selectedIndex === 0" @click="move(-1)">上移</button><button type="button" :disabled="selectedIndex === config.items.length - 1" @click="move(1)">下移</button><button data-testid="metric-group-add-item" type="button" @click="add">+ 添加指标</button><button data-testid="metric-item-duplicate" type="button" @click="duplicate">复制指标</button><button data-testid="metric-item-delete" type="button" class="is-danger" @click="remove">删除</button></div>
      <BindingInspector :key="selectedItem.id" :widget="virtualWidget" :datasets="getDatasets(virtualWidget)" @change="binding => patchItem({ dataBinding: binding })" @query-change="() => {}" />
    </template>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import BindingInspector from './BindingInspector.vue'
import { addMetricGroupItem, applyMetricGroupPreset, duplicateMetricGroupItem, METRIC_GROUP_PRESETS, metricGroupItemWidget, moveMetricGroupItem, normalizeMetricGroupConfig, removeMetricGroupItem } from '../metricGroup.js'

const props = defineProps({ widget: { type: Object, required: true }, sources: { type: Array, default: () => [] }, getDatasets: { type: Function, required: true }, selectedItemId: { type: String, default: '' } })
const emit = defineEmits(['change', 'select-item'])
const config = computed(() => normalizeMetricGroupConfig(props.widget.config?.metricGroup))
const presets = METRIC_GROUP_PRESETS
const selectedPresetId = ref('')
const selectedItem = computed(() => config.value.items.find(item => item.id === props.selectedItemId) || null)
const selectedIndex = computed(() => config.value.items.findIndex(item => item.id === selectedItem.value?.id))
const virtualWidget = computed(() => selectedItem.value ? metricGroupItemWidget(props.widget, selectedItem.value) : { id: 'metric-group-empty', type: 'kpi', config: {} })
function change(next) { emit('change', { ...props.widget.config, metricGroup: normalizeMetricGroupConfig(next) }) }
function select(id) { emit('select-item', id) }
function patch(value) { change({ ...config.value, ...value }) }
function patchLayout(value) { patch({ layout: { ...config.value.layout, ...value } }) }
function applyPreset() { if (selectedPresetId.value) change(applyMetricGroupPreset(config.value, selectedPresetId.value)) }
function patchItem(value) { if (!selectedItem.value) return; patch({ items: config.value.items.map(item => item.id === selectedItem.value.id ? { ...item, ...value } : item) }) }
function add() { const result = addMetricGroupItem(config.value, props.sources[0] || {}); change(result.config); select(result.item.id) }
function duplicate() { const result = duplicateMetricGroupItem(config.value, selectedItem.value?.id); if (result.item) { change(result.config); select(result.item.id) } }
function remove() { const result = removeMetricGroupItem(config.value, selectedItem.value?.id); change(result.config); select(result.selectedId) }
function move(offset) { change(moveMetricGroupItem(config.value, selectedItem.value?.id, offset)) }
function changeSource(code) { const source = props.sources.find(item => item.code === code) || {}; patchItem({ sourceCode: code, sourceName: source.name || '', unit: source.unit || selectedItem.value.unit, dataBinding: undefined }) }
</script>

<style scoped>
.metric-group-inspector { display:grid; gap:8px; font-size:12px; }.metric-group-inspector h3 { margin:10px 0 0; font-size:12px; }.metric-group-inspector label { display:grid; gap:4px; }.metric-group-inspector input,.metric-group-inspector select { box-sizing:border-box; width:100%; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; }.metric-group-inspector button { padding:6px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; cursor:pointer; }.metric-group-inspector__hint,.metric-group-inspector__empty { margin:0; color:var(--db-muted,#78878e); line-height:1.5; }.metric-group-inspector__presets { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.metric-group-inspector__presets button { display:grid; grid-template-columns:42px 1fr; column-gap:6px; align-items:center; padding:5px; text-align:left; }.metric-group-inspector__presets button.is-selected { border-color:var(--db-accent,#1261a6); box-shadow:0 0 0 1px var(--db-accent,#1261a6); }.metric-group-inspector__presets strong { font-size:11px; }.metric-group-inspector__presets small { grid-column:2; color:var(--db-muted,#78878e); font-size:10px; line-height:1.25; }.metric-group-inspector__preset-preview { display:grid; grid-template-columns:repeat(4,1fr); grid-auto-rows:7px; gap:2px; height:31px; }.metric-group-inspector__preset-preview i { border-radius:1px; background:#b8ced7; }.metric-group-inspector__preset-preview.is-hero-secondary i:first-child { grid-row:span 3; grid-column:span 2; background:#4f8196; }.metric-group-inspector__preset-preview.is-left-hero-right-grid i:first-child { grid-row:span 3; grid-column:span 2; background:#39748e; }.metric-group-inspector__preset-preview.is-metric-strip { grid-template-columns:repeat(4,1fr); grid-auto-rows:31px; }.metric-group-inspector__preset-preview.is-metric-strip i { background:#a9c0ca; }.metric-group-inspector__preset-preview.is-minimal { grid-template-columns:repeat(2,1fr); grid-auto-rows:14px; gap:4px; }.metric-group-inspector__preset-preview.is-minimal i { background:#d5e0e4; }.metric-group-inspector__preset-preview.is-risk-monitor i:first-child { grid-column:span 2; grid-row:span 2; background:#a47735; }.metric-group-inspector__items { display:grid; gap:4px; max-height:150px; overflow:auto; }.metric-group-inspector__items button { display:flex; justify-content:space-between; text-align:left; }.metric-group-inspector__items small { color:var(--db-muted,#78878e); }.metric-group-inspector__order { display:flex; flex-wrap:wrap; gap:5px; }.metric-group-inspector__order .is-danger { color:#b45858; }.metric-group-inspector__back { justify-self:start; border:0; padding:0; color:var(--db-accent,#1261a6); }
</style>
