<template>
  <div class="filter-condition" :data-condition-field="condition.field">
    <span>{{ field?.label || `字段不可用：${condition.field}` }}</span><button type="button" aria-label="删除筛选条件" @click="emit('remove')">×</button>
    <select aria-label="筛选运算符" :value="condition.operator" @change="changeOperator($event.target.value)"><option v-for="operator in operators" :key="operator" :value="operator">{{ labels[operator] }}</option></select>
    <template v-if="!['isEmpty', 'isNotEmpty'].includes(condition.operator)">
      <FilterValue v-if="['in', 'notIn'].includes(condition.operator) || ['string', 'boolean'].includes(type)" :allow-all="false" :type="['in', 'notIn'].includes(condition.operator) ? 'multi-select' : 'select'" :options="field?.options || []" :model-value="condition.value" @update:model-value="emit('change', { ...condition, value: $event })" />
      <template v-else><input v-for="index in condition.operator === 'between' ? [0, 1] : [0]" :key="index" :type="type === 'number' ? 'number' : 'date'" :aria-label="index ? '上界' : '筛选值或下界'" :value="Array.isArray(condition.value) ? condition.value[index] : condition.value" @input="setValue(index, $event.target.value)" /></template>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import FilterValue from './FilterValue.vue'
import { FILTER_OPERATORS, filterValueType } from '../filterEngine.js'
const props = defineProps({ condition: { type: Object, required: true }, field: Object })
const emit = defineEmits(['change', 'remove'])
const type = computed(() => filterValueType(props.field) || 'string')
const operators = computed(() => FILTER_OPERATORS[type.value])
const labels = { equals: '等于', notEquals: '不等于', in: '包含任一', notIn: '不包含', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', between: '范围（含边界）', before: '早于', after: '晚于', isEmpty: '为空', isNotEmpty: '不为空' }
function changeOperator(operator) {
  const first = props.field?.options?.[0] ?? null
  emit('change', { field: props.condition.field, operator, ...(['isEmpty', 'isNotEmpty'].includes(operator) ? {} : { value: operator === 'between' ? [first, first] : ['in', 'notIn'].includes(operator) ? [] : first }) })
}
function setValue(index, text) { const value = type.value === 'number' && text !== '' ? Number(text) : text; const next = props.condition.operator === 'between' ? [...props.condition.value] : value; if (Array.isArray(next)) next[index] = value; emit('change', { ...props.condition, value: next }) }
</script>
<style scoped>
.filter-condition { padding:8px; margin:6px 0; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; }.filter-condition>button { float:right; }.filter-condition>select,.filter-condition>input { box-sizing:border-box; width:100%; margin-top:6px; padding:5px; border:1px solid var(--db-border,#e3e9eb); border-radius:4px; } button { border:0; background:transparent; cursor:pointer; } :focus-visible { outline:2px solid var(--db-accent,#4f8583); }
</style>
