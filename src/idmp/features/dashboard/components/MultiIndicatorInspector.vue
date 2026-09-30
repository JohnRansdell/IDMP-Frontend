<template>
  <section class="multi-indicator-inspector" aria-label="多指标绑定">
    <h3>指标来源（{{ bindings.length }}）</h3>
    <p>普通图表可组合多个已发布指标。各指标必须存在可共同对齐的时间或组织维度。</p>
    <div class="multi-indicator-add">
      <select v-model="pendingSource"><option value="">选择要叠加的指标</option><option v-for="source in availableSources" :key="source.code" :value="source.code">{{ source.name }}</option></select>
      <button type="button" :disabled="!pendingSource" @click="add">添加指标</button>
    </div>
    <article v-for="(item, index) in bindings" :key="item.sourceCode">
      <header><strong>{{ index + 1 }}. {{ item.sourceName }}</strong><button type="button" :disabled="bindings.length === 1" @click="remove(item.sourceCode)">移除</button></header>
      <label>系列名称<input :value="item.alias" @input="patch(item.sourceCode, { alias: $event.target.value })" /></label>
      <label v-if="dualAxis">坐标轴<select :value="item.axis" @change="patch(item.sourceCode, { axis: $event.target.value })"><option value="left">左 Y 轴</option><option value="right">右 Y 轴</option></select></label>
    </article>
    <p v-if="bindings.length > 1" class="multi-indicator-inspector__notice">已启用多指标模式。字段绑定将切换到“多指标组合”数据集；没有共同维度的记录不会被前端猜测或补零。</p>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { normalizeIndicatorBindings } from '../multiIndicator.js'

const props = defineProps({ widget: { type: Object, required: true }, sources: { type: Array, default: () => [] } })
const emit = defineEmits(['change'])
const pendingSource = ref('')
const bindings = computed(() => normalizeIndicatorBindings(props.widget.config?.indicatorBindings, props.widget))
const dualAxis = computed(() => ['line', 'bar'].includes(props.widget.chartKind))
const availableSources = computed(() => props.sources.filter(source => !bindings.value.some(item => item.sourceCode === source.code)))
function update(value) { emit('change', normalizeIndicatorBindings(value, props.widget)) }
function add() {
  const source = props.sources.find(item => item.code === pendingSource.value)
  if (!source) return
  update([...bindings.value, { sourceCode: source.code, sourceName: source.name, alias: source.name, indicatorVersionId: source.indicatorVersionId || source.analysisIndicatorVersionId, axis: 'left' }])
  pendingSource.value = ''
}
function remove(code) { update(bindings.value.filter(item => item.sourceCode !== code)) }
function patch(code, value) { update(bindings.value.map(item => item.sourceCode === code ? { ...item, ...value } : item)) }
</script>

<style scoped>
.multi-indicator-inspector { display:grid; gap:8px; margin-top:14px; font-size:12px; }.multi-indicator-inspector h3,.multi-indicator-inspector p { margin:0; }.multi-indicator-inspector p { color:var(--db-muted,#78878e); line-height:1.55; }.multi-indicator-add { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:6px; }.multi-indicator-inspector select,.multi-indicator-inspector input { box-sizing:border-box; width:100%; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; }.multi-indicator-inspector button { padding:6px 8px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; cursor:pointer; }.multi-indicator-inspector button:disabled { opacity:.45; cursor:default; }.multi-indicator-inspector article { display:grid; grid-template-columns:1fr 110px; gap:7px; padding:8px; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; }.multi-indicator-inspector article header { grid-column:1/-1; display:flex; justify-content:space-between; align-items:center; gap:8px; }.multi-indicator-inspector label { display:grid; gap:4px; }.multi-indicator-inspector__notice { padding:8px; border-radius:5px; background:var(--db-accent-soft,#edf5f3); color:var(--db-text,#25343b)!important; }
</style>
