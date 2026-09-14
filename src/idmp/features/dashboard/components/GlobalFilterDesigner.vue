<template>
  <section class="global-filter-designer" aria-label="全局筛选器配置">
    <h3>看板设置 · 全局筛选器</h3><p>定义与默认值随看板保存。画布中的临时选择不会成为默认值。</p>
    <label>字段<select v-model="selectedField" data-testid="global-filter-field"><option value="">选择可筛选字段</option><option v-for="field in available" :key="field.id" :value="field.id">{{ field.label }} · {{ field.id }}</option></select></label>
    <button type="button" data-testid="global-filter-add" :disabled="!selectedField" @click="add">＋ 添加筛选器</button>
    <article v-for="def in definitions" :key="def.id" :data-definition-field="def.field">
      <label>名称<input :value="def.label" @input="patch(def.id, { label: $event.target.value })" /></label>
      <label><input type="checkbox" :checked="def.enabled" @change="patch(def.id, { enabled: $event.target.checked })" />启用</label>
      <label>类型<select :value="def.type" @change="patch(def.id, { type: $event.target.value, defaultValue: $event.target.value === 'multi-select' ? [] : null })"><option v-for="type in catalog.find(field => field.id === def.field)?.filterTypes || [def.type]" :key="type" :value="type">{{ type === 'multi-select' ? '多选' : type === 'date-range' ? '日期范围' : '单选' }}</option></select></label>
      <label>依赖于<select multiple :value="def.dependsOn || []" @change="patch(def.id, { dependsOn: [...$event.target.selectedOptions].map(option => option.value) })"><option v-for="upstream in definitions.filter(item => item.id !== def.id)" :key="upstream.id" :value="upstream.id">{{ upstream.label }}</option></select></label>
      <label v-if="(def.dependsOn || []).length">父条件变化后<select :value="def.invalidValueBehavior || 'clear'" @change="patch(def.id, { invalidValueBehavior: $event.target.value })"><option value="clear">清空失效值</option><option value="reset-default">恢复默认值</option></select></label>
      <label>默认值</label><FilterValue :type="def.type" :options="catalog.find(field => field.id === def.field)?.options || []" :model-value="def.defaultValue" @update:model-value="patch(def.id, { defaultValue: $event })" />
      <p v-if="!catalog.some(field => field.id === def.field)">字段不可用：{{ def.field }}</p>
      <button type="button" @click="emit('change', definitions.filter(item => item.id !== def.id))">删除</button>
    </article>
    <p v-if="errors.length" role="status">{{ errors.join('；') }}</p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import FilterValue from './FilterValue.vue'
import { filterValueType, validateFilterDefinitions } from '../filterEngine.js'
const props = defineProps({ definitions: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] } })
const emit = defineEmits(['change'])
const selectedField = ref('')
const available = computed(() => props.catalog.filter(field => field.semanticType !== 'measure' && !props.definitions.some(def => def.field === field.id)))
const errors = computed(() => validateFilterDefinitions(props.definitions))
function add() {
  const field = available.value.find(item => item.id === selectedField.value)
  if (!field) return
  const base = `filter-${field.id}`; let id = base, suffix = 1
  while (props.definitions.some(def => def.id === id)) id = `${base}-${suffix++}`
  emit('change', [...props.definitions, { id, label: field.label, field: field.id, dataType: filterValueType(field), type: field.preferredFilterType, defaultValue: field.preferredFilterType === 'multi-select' ? [] : null, dependsOn: [], invalidValueBehavior: 'clear', enabled: true }])
  selectedField.value = ''
}
function patch(id, change) { emit('change', props.definitions.map(def => def.id === id ? { ...def, ...change } : def)) }
</script>
<style scoped>
.global-filter-designer { font-size:12px; color:var(--db-secondary,#5c6d75); } h3 { font-size:13px; } p { line-height:1.6; font-size:11px; } article { border:1px solid var(--db-border,#e3e9eb); padding:10px; margin-top:12px; border-radius:6px; } label { display:block; margin:8px 0; } select,input:not([type=checkbox]) { box-sizing:border-box; width:100%; padding:6px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; } button { margin-top:8px; padding:6px 8px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; cursor:pointer; } :focus-visible { outline:2px solid var(--db-accent,#4f8583); }
</style>
