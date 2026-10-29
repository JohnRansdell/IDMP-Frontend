<template>
  <section class="formula-comparison" aria-label="公式差异对比">
    <div class="formula-sides">
      <div v-for="side in sides" :key="side.key" class="formula-side"><h3>{{ side.label }}</h3>
        <IndicatorFormulaExpression v-if="side.formula?.root && !arithmeticFormulaError(side.formula.root)" :formula="side.formula" :factors="side.factors" />
        <MappingDifferenceValue v-else :value="side.formula" />
      </div>
    </div>
    <table v-if="changes.length" class="formula-changes"><thead><tr><th>变更位置</th><th>源指标</th><th>目标指标</th></tr></thead>
      <tbody><tr v-for="(change, index) in changes" :key="index"><th>{{ change.path.join(' / ') || '公式' }}</th><td class="source-change">{{ change.source }}</td><td class="target-change">{{ change.target }}</td></tr></tbody>
    </table>
    <p v-else class="formula-same">计算结构和展示设置未发现变化。</p>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import IndicatorFormulaExpression from './IndicatorFormulaExpression.vue'
import MappingDifferenceValue from './MappingDifferenceValue.vue'
import { arithmeticFormulaError } from '@/idmp/features/indicator/arithmeticFormula.js'
import { formulaDifferences } from '@/idmp/features/mapping/differenceContent.js'
const props = defineProps({ source: Object, target: Object, sourceFactors: { type: Array, default: () => [] }, targetFactors: { type: Array, default: () => [] } })
const sides = computed(() => [{ key: 'source', label: '源指标公式', formula: props.source, factors: props.sourceFactors }, { key: 'target', label: '目标指标公式', formula: props.target, factors: props.targetFactors }])
const changes = computed(() => formulaDifferences(props.source, props.target, props.sourceFactors, props.targetFactors))
</script>
<style scoped>
.formula-comparison { margin:8px 0 24px; min-width:0; }.formula-sides { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0; border-top:1px solid var(--idmp-border-subtle); border-bottom:1px solid var(--idmp-border-subtle); }
.formula-side { min-width:0; padding:16px; }.formula-side + .formula-side { border-left:1px solid var(--idmp-border-subtle); } h3 { font-size:12px; font-weight:500; color:var(--idmp-text-helper); margin:0 0 14px; }
.formula-changes { width:100%; table-layout:fixed; border-collapse:collapse; margin-top:16px; font-size:12px; }
th,td { text-align:left; vertical-align:top; padding:8px; border-bottom:1px solid var(--idmp-border-subtle); overflow-wrap:anywhere; white-space:pre-wrap; }
.formula-changes th:first-child { width:25%; font-weight:500; }.formula-changes thead { background:var(--idmp-layer-02); color:var(--idmp-text-helper); }
.source-change { border-left:2px solid #d4a47b; }.target-change { border-left:2px solid #79aaa3; }
.formula-same { color:var(--idmp-text-helper); font-size:12px; }
@media(max-width:700px) { .formula-sides { grid-template-columns:minmax(0,1fr); }.formula-side { padding:14px 0; }.formula-side + .formula-side { border-left:0; border-top:1px solid var(--idmp-border-subtle); } }
</style>
