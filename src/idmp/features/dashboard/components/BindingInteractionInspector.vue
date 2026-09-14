<template>
  <section class="binding-interaction" aria-label="图表联动配置">
    <template v-if="dimensions.length">
      <h3>点击联动</h3>
      <p>点击图表维度值后，仅筛选指定目标组件。此选择是预览/查看时的临时状态，不会保存为看板筛选默认值。</p>
      <label><input data-testid="interaction-click-enabled" type="checkbox" :checked="clickFilter.enabled" @change="patchClick({ enabled: $event.target.checked })" />启用点击筛选</label>
      <template v-if="clickFilter.enabled">
        <label>点击字段<select data-testid="interaction-click-field" :value="clickFilter.field" @change="patchClick({ field: $event.target.value })"><option v-for="field in dimensions" :key="field.field" :value="field.field">{{ field.label || field.field }}</option></select></label>
        <label>目标组件<select multiple data-testid="interaction-target-widgets" :value="clickFilter.targetWidgetIds" @change="patchClick({ targetWidgetIds: [...$event.target.selectedOptions].map(option => option.value) })"><option v-for="target in targets" :key="target.id" :value="target.id">{{ target.title || target.id }}</option></select></label>
        <p v-if="!targets.length" role="status">没有其他已绑定数据的组件可作为联动目标。</p>
      </template>
      <button v-if="active" type="button" data-testid="interaction-clear" @click="dashboardContext.clearInteraction(widget.id)">清除当前临时联动筛选</button>
    </template>
    <p v-else>请先在“数据”中配置至少一个维度字段，才可使用点击筛选。</p>

    <template v-if="hasDataBinding(widget)">
      <h3>响应范围</h3>
      <label><input data-testid="interaction-respond" type="checkbox" :checked="widget.config?.query?.respondToInteractionFilters !== false" @change="patchQuery({ respondToInteractionFilters: $event.target.checked })" />响应其他图表的点击筛选</label>
      <label v-for="source in sources" :key="source.id" class="interaction-scope"><input type="checkbox" :data-ignore-interaction="source.id" :checked="widget.config?.query?.ignoredInteractionFilterIds?.includes(source.id)" @change="ignoreSource(source.id, $event.target.checked)" />忽略 {{ source.title || source.id }} 的联动</label>
    </template>
  </section>
</template>

<script setup>
import { computed, inject } from 'vue'
import { hasDataBinding } from '../bindingEngine.js'

const props = defineProps({ widget: { type: Object, required: true }, datasets: { type: Array, default: () => [] } })
const emit = defineEmits(['change', 'query-change'])
const dashboardContext = inject('dashboardWidgetsContext', { widgets: { value: [] }, interactions: { value: {} }, clearInteraction: () => {} })
const dimensions = computed(() => props.widget.config?.dataBinding?.dimensions || [])
const targets = computed(() => dashboardContext.widgets.value.filter(item => item.id !== props.widget.id && hasDataBinding(item)))
const sources = computed(() => dashboardContext.widgets.value.filter(item => item.id !== props.widget.id && item.config?.interaction?.clickFilter?.enabled))
const clickFilter = computed(() => ({ enabled: false, field: dimensions.value[0]?.field || '', targetWidgetIds: [], ...(props.widget.config?.interaction?.clickFilter || {}) }))
const active = computed(() => Object.hasOwn(dashboardContext.interactions.value, `interaction-${props.widget.id}`))

function patchClick(change) {
  const next = { ...clickFilter.value, ...change }
  if (!next.field || !dimensions.value.some(item => item.field === next.field)) next.field = dimensions.value[0]?.field || ''
  next.targetWidgetIds = (next.targetWidgetIds || []).filter(id => targets.value.some(target => target.id === id))
  emit('change', { ...props.widget.config?.interaction, clickFilter: next })
}
function patchQuery(change) { emit('query-change', { ...props.widget.config?.query, ...change }) }
function ignoreSource(id, ignored) {
  const query = props.widget.config?.query || {}
  const ids = query.ignoredInteractionFilterIds || []
  patchQuery({ ignoredInteractionFilterIds: ignored ? [...ids, id] : ids.filter(item => item !== id) })
}
</script>

<style scoped>
.binding-interaction { font-size:12px; color:var(--db-secondary,#5c6d75); padding-bottom:16px; }
.binding-interaction h3 { margin:18px 0 8px; font-size:12px; color:var(--db-text,#25343b); }
.binding-interaction p { font-size:11px; line-height:1.6; }
.binding-interaction label { display:block; margin:8px 0; }
.binding-interaction input[type=checkbox] { width:auto; }
.binding-interaction select { box-sizing:border-box; width:100%; margin-top:4px; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; color:inherit; }
.binding-interaction button { padding:6px 8px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:white; color:inherit; cursor:pointer; }
.binding-interaction :focus-visible { outline:2px solid var(--db-accent,#4f8583); }
</style>
