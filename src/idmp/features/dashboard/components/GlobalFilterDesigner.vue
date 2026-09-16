<template>
  <section class="global-filter-designer" aria-label="全局筛选配置">
    <p class="designer-description">全局筛选属于当前看板。配置和默认值会保存；预览及查看时的选择只属于运行时。</p>
    <div class="add-filter-row">
      <label>字段<select v-model="selectedField" data-testid="global-filter-field"><option value="">选择可筛选字段</option><option v-for="field in available" :key="field.id" :value="field.id">{{ field.label }} · {{ field.id }}</option></select></label>
      <button type="button" data-testid="global-filter-add" :disabled="!selectedField" @click="add">添加筛选器</button>
    </div>
    <p v-if="!definitions.length" class="empty-state">尚未配置全局筛选器。</p>
    <article v-for="def in definitions" :key="def.id" :data-definition-field="def.field">
      <header><strong>{{ def.label || '未命名筛选器' }}</strong><label class="enabled"><input type="checkbox" :checked="def.enabled" @change="patch(def.id, { enabled: $event.target.checked })" />启用</label></header>
      <div class="filter-summary"><span>字段：{{ fieldFor(def)?.label || def.field }}</span><span>类型：{{ typeLabel(def.type) }}</span><span>默认值：{{ defaultValueLabel(def) }}</span><span>依赖：{{ dependencyLabel(def) }}</span></div>
      <div class="editor-grid">
        <label>显示名称<input :value="def.label" @change="patch(def.id, { label: $event.target.value.trim() || fieldFor(def)?.label || def.field })" /></label>
        <label>字段<select :value="def.field" :data-testid="`global-filter-field-${def.id}`" @change="changeField(def, $event.target.value)"><option v-for="field in fieldChoices(def)" :key="field.id" :value="field.id">{{ field.label }} · {{ field.id }}</option></select></label>
        <label>控件类型<select :value="def.type" @change="patch(def.id, { type: $event.target.value, defaultValue: emptyDefault($event.target.value) })"><option v-for="type in fieldFor(def)?.filterTypes || [def.type]" :key="type" :value="type">{{ typeLabel(type) }}</option></select></label>
        <label>依赖筛选器<select multiple :value="def.dependsOn || []" @change="patch(def.id, { dependsOn: [...$event.target.selectedOptions].map(option => option.value) })"><option v-for="upstream in definitions.filter(item => item.id !== def.id)" :key="upstream.id" :value="upstream.id">{{ upstream.label }}</option></select></label>
        <label v-if="(def.dependsOn || []).length">上游变化后<select :value="def.invalidValueBehavior || 'clear'" @change="patch(def.id, { invalidValueBehavior: $event.target.value })"><option value="clear">清空失效值</option><option value="reset-default">恢复默认值</option></select></label>
        <div class="default-value"><label>默认值</label><FilterValue :type="def.type" :options="fieldFor(def)?.options || []" :model-value="def.defaultValue" @update:model-value="patch(def.id, { defaultValue: $event })" /></div>
      </div>
      <fieldset class="scope"><legend>作用范围</legend><label><input type="radio" :name="`scope-${def.id}`" :checked="scopeMode(def) === 'all'" @change="setScope(def, null)" />所有兼容组件（{{ compatibleWidgets(def).length }}）</label><label><input type="radio" :name="`scope-${def.id}`" :checked="scopeMode(def) === 'selected'" :disabled="!compatibleWidgets(def).length" @change="setScope(def, [])" />指定组件</label><p v-if="!compatibleWidgets(def).length" class="scope-warning">当前没有组件可响应“{{ def.label }}”：请先在组件的数据绑定中使用字段“{{ fieldFor(def)?.label || def.field }}”。</p><div v-if="scopeMode(def) === 'selected'" class="scope-widgets"><label v-for="widget in compatibleWidgets(def)" :key="widget.id"><input type="checkbox" :checked="scopeTargets(def).includes(String(widget.id))" @change="toggleScopeWidget(def, widget.id, $event.target.checked)" />{{ widget.title || widget.sourceName || widget.id }}</label></div></fieldset>
      <button type="button" class="delete-filter" @click="emit('delete', def.id)">删除筛选器</button>
    </article>
    <p v-if="errors.length" role="status">{{ errors.join('；') }}</p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import FilterValue from './FilterValue.vue'
import { validateFilterDefinitions } from '../filterEngine.js'
import { changeGlobalFilterField, createGlobalFilterDefinition, globalFilterScopeTargetIds } from '../globalFilterDesignerModel.js'
const props = defineProps({ definitions: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, widgets: { type: Array, default: () => [] }, compatibleWidgetIdsByFilter: { type: Object, default: () => ({}) } })
const emit = defineEmits(['change', 'delete', 'scope-change'])
const selectedField = ref('')
const available = computed(() => props.catalog.filter(field => field.semanticType !== 'measure' && !props.definitions.some(def => def.field === field.id)))
const errors = computed(() => validateFilterDefinitions(props.definitions))
function add() {
  const field = available.value.find(item => item.id === selectedField.value)
  if (!field) return
  emit('change', [...props.definitions, createGlobalFilterDefinition(field, props.definitions)])
  selectedField.value = ''
}
function patch(id, change) { emit('change', props.definitions.map(def => def.id === id ? { ...def, ...change } : def)) }
function fieldFor(definition) { return props.catalog.find(field => field.id === definition.field) }
function fieldChoices(definition) { return props.catalog.filter(field => field.semanticType !== 'measure' && (field.id === definition.field || !props.definitions.some(def => def.id !== definition.id && def.field === field.id))) }
function changeField(definition, fieldId) { const field = props.catalog.find(item => item.id === fieldId); if (field) patch(definition.id, changeGlobalFilterField(definition, field)) }
function emptyDefault(type) { return type === 'multi-select' ? [] : null }
function typeLabel(type) { return type === 'date-range' ? '时间范围' : type === 'multi-select' ? '多选' : '单选' }
function defaultValueLabel(definition) { const value = definition.defaultValue; return Array.isArray(value) ? (value.length ? value.join('、') : '全部') : value ?? '全部' }
function dependencyLabel(definition) { return (definition.dependsOn || []).map(id => props.definitions.find(item => item.id === id)?.label || id).join('、') || '无' }
function compatibleWidgets(definition) { const ids = new Set(props.compatibleWidgetIdsByFilter[definition.id] || []); return props.widgets.filter(widget => ids.has(String(widget.id))) }
function scopeTargets(definition) { return globalFilterScopeTargetIds(props.widgets, definition.id, props.compatibleWidgetIdsByFilter[definition.id] || []) }
function scopeMode(definition) { return scopeTargets(definition).length === compatibleWidgets(definition).length ? 'all' : 'selected' }
function setScope(definition, targetWidgetIds) { emit('scope-change', { filterId: definition.id, targetWidgetIds }) }
function toggleScopeWidget(definition, widgetId, checked) { const targets = new Set(scopeTargets(definition)); if (checked) targets.add(String(widgetId)); else targets.delete(String(widgetId)); setScope(definition, [...targets]) }
</script>
<style scoped>
.global-filter-designer { font-size:12px; color:var(--db-secondary,#5c6d75); }.designer-description { margin:0 0 12px; line-height:1.6; }.add-filter-row,.editor-grid { display:grid; gap:10px; }.add-filter-row { grid-template-columns:minmax(0,1fr) auto; align-items:end; }.editor-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.empty-state { padding:16px 0; color:var(--db-muted,#78878e); }article { border:1px solid var(--db-border,#e3e9eb); padding:12px; margin-top:12px; border-radius:6px; }article header,.filter-summary { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }.enabled { margin-left:auto; }.filter-summary { margin:8px 0 12px; color:var(--db-muted,#78878e); }.filter-summary span { padding-right:8px; border-right:1px solid var(--db-border,#e3e9eb); }label { display:block; margin:0; }select,input:not([type=checkbox]) { box-sizing:border-box; width:100%; margin-top:4px; padding:6px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; }.default-value { min-width:0; }.scope { margin:12px 0 0; border:0; padding:0; }.scope label { display:inline-flex; align-items:center; gap:5px; margin:0 12px 6px 0; }.scope-widgets { display:flex; flex-wrap:wrap; gap:4px 12px; padding:8px; border:1px solid var(--db-border,#e3e9eb); }.scope-widgets label { margin:0; }.scope-warning { margin:4px 0 0; color:var(--db-warning,#a47735); line-height:1.5; }.delete-filter,button { margin-top:10px; padding:6px 8px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; cursor:pointer; }.delete-filter { color:#b42318; } :focus-visible { outline:2px solid var(--db-accent,#4f8583); }@media (max-width:640px) { .add-filter-row,.editor-grid { grid-template-columns:1fr; }.enabled { margin-left:0; } }
</style>
