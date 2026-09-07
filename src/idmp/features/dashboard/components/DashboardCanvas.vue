<template>
  <section ref="gridElement" class="grid-stack dashboard-canvas" :aria-label="ariaLabel">
    <DashboardWidget
      v-for="widget in widgets"
      :key="widget.id"
      :widget="widget"
      :editable="editable"
      :selected="selectedWidgetId === widget.id"
      @select="selectedWidgetId = $event"
      @remove="$emit('widget-remove', $event)"
      @configure="$emit('widget-configure', $event)"
    >
      <template #default="slotProps"><slot :widget="slotProps.widget" /></template>
    </DashboardWidget>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import DashboardWidget from './DashboardWidget.vue'
import { serializeGridLayout } from '../gridLayout.js'

const props = defineProps({
  widgets: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  columns: { type: Number, default: 24 },
  float: { type: Boolean, default: false },
  cellHeight: { type: [Number, String], default: 60 },
  margin: { type: [Number, String], default: 8 },
  ariaLabel: { type: String, default: 'Dashboard Grid' }
})
const emit = defineEmits(['widget-remove', 'widget-configure', 'layout-change'])
const gridElement = ref()
const grid = ref(null)
const selectedWidgetId = ref('')
const registeredWidgetIds = new Set()

// Vue owns widget membership and content. GridStack is the runtime source of truth for x/y/w/h.
function getLayout() { return grid.value ? serializeGridLayout(grid.value.save(false)) : [] }
function findWidgetElement(widgetId) {
  return [...(gridElement.value?.querySelectorAll('.grid-stack-item') || [])].find((element) => element.dataset.widgetId === widgetId)
}
async function registerWidget(widgetId, options = {}) {
  await nextTick()
  const element = findWidgetElement(widgetId)
  if (!grid.value || !element || registeredWidgetIds.has(widgetId)) return false
  grid.value.makeWidget(element, { id: widgetId, autoPosition: true, ...options })
  registeredWidgetIds.add(widgetId)
  return true
}
function unregisterWidget(widgetId) {
  const element = findWidgetElement(widgetId)
  if (grid.value && element) grid.value.removeWidget(element, false)
  registeredWidgetIds.delete(widgetId)
}
function applyLayout(layout = []) { grid.value?.load(serializeGridLayout(layout), false) }
function setEditable(value) { grid.value?.setStatic(!value) }

defineExpose({ getLayout, applyLayout, registerWidget, unregisterWidget, setEditable })

watch(() => props.widgets.map((widget) => widget.id).join('|'), async () => {
  // This watcher only registers new DOM nodes; it never writes GridStack coordinates back to Vue.
  await nextTick()
  for (const widget of props.widgets) {
    if (!registeredWidgetIds.has(widget.id)) await registerWidget(widget.id, widget.layout || {})
  }
}, { flush: 'post' })
watch(() => props.editable, setEditable)

onMounted(async () => {
  await nextTick()
  grid.value = GridStack.init({
    column: props.columns, cellHeight: props.cellHeight, margin: props.margin,
    float: props.float, staticGrid: !props.editable, animate: true, resizable: { handles: 'se' }
  }, gridElement.value)
  props.widgets.forEach((widget) => registeredWidgetIds.add(widget.id))
  grid.value.on('change', () => emit('layout-change', getLayout()))
})
onBeforeUnmount(() => grid.value?.destroy(false))
</script>

<style scoped>
.dashboard-canvas { min-height: 320px; }
</style>
