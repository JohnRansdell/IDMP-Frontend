<script>
import { defineComponent, h } from 'vue'
import { arithmeticFormulaError, roundingModes } from '@/idmp/features/indicator/arithmeticFormula'

export default defineComponent({
  props: { formula: Object, factors: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    const rounding = node => `保留 ${node.scale ?? 2} 位小数，${roundingModes.find(([code]) => code === (node.roundingMode || 'HALF_UP'))?.[1] || node.roundingMode}`
    const render = (node, nested = false) => {
      if (node.nodeType === 'FACTOR_REF') {
        const id = String(node.factorVersionId)
        const factor = props.factors.find(f => String(f.factorVersionId ?? f.versionId) === id)
        const name = factor?.factorName || factor?.name || `因子 ${id}`
        const repeated = props.factors.filter(f => (f.factorName || f.name) === name).length > 1
        const text = repeated ? `${name}（版本 ${id}）` : name
        return h('span', { class: 'math-factor' }, slots.factor?.({ id, text }) || text)
      }
      if (node.nodeType === 'CONST') return h('span', String(node.value))
      if (node.nodeType === 'FUNCTION') return h('span', { class: 'math-operation' }, ['ROUND(', render(node.arguments[0]), `；${rounding(node)})`])
      if (node.operator === 'DIV') return h('span', { class: 'math-fraction', role: 'group', 'aria-label': '分式' }, [h('span', { class: 'math-numerator' }, render(node.left)), h('span', { class: 'math-denominator' }, render(node.right))])
      return h('span', { class: 'math-operation' }, [nested ? '(' : '', render(node.left, true), h('span', { class: 'math-operator' }, { ADD: '+', SUB: '−', MUL: '×' }[node.operator]), render(node.right, true), nested ? ')' : ''])
    }
    return () => {
      if (arithmeticFormulaError(props.formula?.root)) return null
      let root = props.formula.root
      const notes = []
      // 只将最外层舍入移到注释；内部舍入仍参与运算，不能省略。
      if (root.nodeType === 'FUNCTION' && root.functionCode === 'ROUND') { notes.push(rounding(root)); root = root.arguments[0] }
      const display = props.formula.display || {}
      const multiplied = display.multiplier != null && Number(display.multiplier) !== 1
      if (display.scale != null && !notes.includes(rounding(display))) notes.push(`展示值${rounding(display)}`)
      return h('div', { class: 'indicator-math' }, [h('div', { class: 'math-expression' }, [render(root, multiplied), multiplied ? ` × ${display.multiplier}` : '', display.format === 'PERCENT' ? '（单位：%）' : '']), h('p', { class: 'math-notes' }, [...new Set(notes)].join('；'))])
    }
  }
})
</script>
<style scoped>
.indicator-math{max-width:100%;min-width:0}.math-expression{display:flex;flex-wrap:wrap;align-items:center;gap:8px;line-height:1.8;font-size:15px}.math-operation{display:inline-flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;min-width:0;max-width:100%}.math-fraction{display:inline-grid;grid-template-rows:auto auto;text-align:center;vertical-align:middle;min-width:0;max-width:100%}.math-numerator,.math-denominator{display:flex;align-items:center;justify-content:center;min-width:0;overflow-wrap:anywhere;padding:8px}.math-numerator{border-bottom:1px solid var(--idmp-text-secondary)}.math-factor{min-width:0;max-width:100%;overflow-wrap:anywhere}.math-notes{font-size:12px;color:var(--idmp-text-helper);line-height:1.7;margin:12px 0 0}.math-factor :deep(button){max-width:100%;white-space:normal;overflow-wrap:anywhere}
</style>
