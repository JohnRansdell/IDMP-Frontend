<template>
  <section
    ref="gridElement"
    class="grid-stack dashboard-canvas"
    data-testid="dashboard-canvas"
    :class="{ 'is-editable': editable, 'is-grid-interacting': interaction.active }"
    :style="gridStyle"
    :aria-label="ariaLabel"
    @click.self="selectWidget('')"
  >
    <div v-if="editable && interaction.active" class="dashboard-grid-guide" :style="guideStyle" aria-hidden="true">
      <span
        v-for="cell in guideCells"
        :key="cell.index"
        class="dashboard-grid-guide__cell"
        :class="{ 'is-targeted': cell.targeted }"
      />
    </div>
    <DashboardWidget
      v-for="widget in widgets"
      :key="String(widget.id)"
      :widget="widget"
      :editable="editable"
      :selected="selectedWidgetIds.includes(String(widget.id))"
      :primary-selected="primarySelectedWidgetId === String(widget.id)"
      @select="selectWidget"
      @remove="$emit('widget-remove', $event)"
      @configure="$emit('widget-configure', $event)"
    >
      <template #default="slotProps"><DashboardWidgetBoundary :designer="editable"><slot :widget="slotProps.widget" /></DashboardWidgetBoundary></template>
    </DashboardWidget>
    <output v-if="interaction.active" class="dashboard-canvas__size-feedback" :style="feedbackStyle" aria-live="polite">{{ interaction.w }} × {{ interaction.h }}</output>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'
import DashboardWidget from './DashboardWidget.vue'
import DashboardWidgetBoundary from './DashboardWidgetBoundary.vue'
import { compareDashboardGridMembership, gridWidgetId } from '../gridMembership.js'
import { getWidgetGridConstraints, serializeGridLayout } from '../gridLayout.js'
import { getDashboardGridGeometry, normalizeWidgetSelectionId } from '../widgetCapabilities.js'

const props = defineProps({
  widgets: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  columns: { type: Number, default: 24 },
  float: { type: Boolean, default: false },
  cellHeight: { type: [Number, String], default: 60 },
  margin: { type: [Number, String], default: 8 },
  ariaLabel: { type: String, default: 'Dashboard Grid' },
  selectedWidgetId: { type: String, default: '' },
  selectedWidgetIds: { type: Array, default: () => [] },
  primarySelectedWidgetId: { type: String, default: '' }
})
const emit = defineEmits(['widget-select', 'widget-remove', 'widget-configure', 'layout-change'])
const gridElement = ref()
const grid = ref(null)
const registeredWidgetIds = new Set()
const registrationJobs = new Map()
let disposed = false
const interaction = reactive({ active: false, x: 0, y: 0, w: 0, h: 0 })
const gridGeometry = reactive(getDashboardGridGeometry(props.columns, 0, props.cellHeight, props.margin, 1))
const gridStyle = computed(() => ({ '--dashboard-guide-height': `${gridGeometry.rows * gridGeometry.cellHeight}px` }))
const guideStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridGeometry.columns}, ${gridGeometry.cellWidth}px)`,
  gridAutoRows: `${gridGeometry.cellHeight}px`,
  width: `${gridGeometry.columns * gridGeometry.cellWidth}px`,
  height: `${gridGeometry.rows * gridGeometry.cellHeight}px`,
  '--dashboard-guide-inset': `${gridGeometry.margin / 2}px`
}))
const guideCells = computed(() => Array.from({ length: gridGeometry.columns * gridGeometry.rows }, (_, index) => {
  const x = index % gridGeometry.columns
  const y = Math.floor(index / gridGeometry.columns)
  return {
    index,
    targeted: interaction.active && x >= interaction.x && x < interaction.x + interaction.w && y >= interaction.y && y < interaction.y + interaction.h
  }
}))
const feedbackStyle = computed(() => ({
  left: `${Math.min((interaction.x + interaction.w) * gridGeometry.cellWidth - 8, gridGeometry.columns * gridGeometry.cellWidth - 8)}px`,
  top: `${interaction.y * gridGeometry.cellHeight + 8}px`
}))
let isApplyingSchema = false
let userInteractionActive = false
let geometryObserver
function selectWidget(widgetId) {
  emit('widget-select', widgetId)
}

// Vue owns widget membership and content. Save the currently displayed column layout;
// GridStack's default save() may otherwise return its largest-column layout cache.
function getLayout() {
  return grid.value ? serializeGridLayout(grid.value.save(false, false, undefined, grid.value.getColumn())) : []
}
function getGridGeometry() { return { ...gridGeometry } }
function getMembershipDiagnostic() {
  const items = [...(gridElement.value?.children || [])].filter(element => element.matches('.dashboard-widget.grid-stack-item'))
  const runtime = compareDashboardGridMembership(props.widgets, grid.value?.engine.nodes || [])
  const domMembership = compareDashboardGridMembership(props.widgets, items.map(element => ({ id: element.dataset.widgetId })))
  const linksValid = items.every(element => grid.value?.engine.nodes.some(node => node.el === element && gridWidgetId(node.id) === element.dataset.widgetId && gridWidgetId(element.gridstackNode?.id) === element.dataset.widgetId))
  return {
    ...runtime, valid: runtime.valid && domMembership.valid && linksValid,
    domMembership, linksValid,
    layout: compareDashboardGridMembership(props.widgets, getLayout()),
    dom: items.map(element => ({ id: element.dataset.widgetId, gsId: element.getAttribute('gs-id'), attachedNodeId: element.gridstackNode?.id ?? null, engineContainsElement: Boolean(grid.value?.engine.nodes.some(node => node.el === element)) }))
  }
}
function findWidgetElement(widgetId) {
  return [...(gridElement.value?.children || [])].find((element) => element.matches('.dashboard-widget.grid-stack-item') && element.dataset.widgetId === gridWidgetId(widgetId))
}
function registerWidget(widgetId, options = {}) {
  widgetId = gridWidgetId(widgetId)
  if (widgetId === null) return Promise.resolve(false)
  if (registrationJobs.has(widgetId)) return registrationJobs.get(widgetId)
  if (registeredWidgetIds.has(widgetId)) return Promise.resolve(true)
  const job = (async () => {
    await nextTick()
    const element = findWidgetElement(widgetId)
    const widget = props.widgets.find((item) => gridWidgetId(item.id) === widgetId)
    if (disposed || !grid.value || !element || !widget) return false
    if (!grid.value.engine.nodes.some(node => node.el === element)) {
      applySchemaOperation(() => grid.value.makeWidget(element, { autoPosition: true, ...getWidgetGridConstraints(widget), ...options, id: widgetId }))
    }
    if (!grid.value.engine.nodes.some(node => node.el === element && gridWidgetId(node.id) === widgetId)) return false
    registeredWidgetIds.add(widgetId)
    synchronizeWidgetConstraint(widgetId)
    refreshGridGeometry()
    return true
  })().finally(() => { if (registrationJobs.get(widgetId) === job) registrationJobs.delete(widgetId) })
  registrationJobs.set(widgetId, job)
  return job
}
async function whenMembershipSettled() {
  // Wait for the already scheduled Vue/registration lifecycle; never load schema here.
  await nextTick()
  while (registrationJobs.size) await Promise.all([...registrationJobs.values()])
  await nextTick()
}
function unregisterWidget(widgetId) {
  widgetId = gridWidgetId(widgetId)
  // Engine reference also works if Vue has already detached the DOM item.
  const nodes = grid.value?.engine.nodes.filter(node => gridWidgetId(node.id) === widgetId) || []
  nodes.forEach(node => applySchemaOperation(() => grid.value.removeWidget(node.el, false)))
  registeredWidgetIds.delete(widgetId)
}
function applyLayout(layout = []) {
  const items = serializeGridLayout(layout).map((item) => {
    const widget = props.widgets.find((candidate) => gridWidgetId(candidate.id) === item.id)
    return { ...item, ...getWidgetGridConstraints(widget) }
  })
  applySchemaOperation(() => grid.value?.load(items, false))
  synchronizeAllWidgetConstraints()
  refreshGridGeometry()
}
function setEditable(value) { grid.value?.setStatic(!value) }
function applySchemaOperation(operation) {
  isApplyingSchema = true
  try { return operation() } finally { isApplyingSchema = false }
}
function startGridInteraction(_event, element) {
  userInteractionActive = true
  const node = element?.gridstackNode
  interaction.active = true
  interaction.x = Number(node?.x) || 0
  interaction.y = Number(node?.y) || 0
  interaction.w = Number(node?.w) || 1
  interaction.h = Number(node?.h) || 1
  if (node?.id !== undefined) selectWidget(normalizeWidgetSelectionId(node.id))
}
function updateGridInteraction(_event, element) {
  const node = element?.gridstackNode
  interaction.x = Number(node?.x) || 0
  interaction.y = Number(node?.y) || 0
  interaction.w = Number(node?.w) || interaction.w
  interaction.h = Number(node?.h) || interaction.h
  refreshGridGeometry()
}
function stopGridInteraction() {
  // GridStack emits `change` repeatedly while a pointer is moving. The canonical
  // schema must receive only the settled gesture, so one drag/resize is one undo step.
  const shouldSync = userInteractionActive && props.editable && !isApplyingSchema
  userInteractionActive = false
  interaction.active = false
  refreshGridGeometry()
  if (shouldSync) emit('layout-change', getLayout())
}

function synchronizeWidgetConstraint(widgetId) {
  const element = findWidgetElement(widgetId)
  const widget = props.widgets.find((item) => gridWidgetId(item.id) === gridWidgetId(widgetId))
  if (!grid.value || !element || !widget) return
  const constraints = getWidgetGridConstraints(widget)
  applySchemaOperation(() => grid.value.update(element, constraints))
}
function synchronizeAllWidgetConstraints() {
  props.widgets.forEach((widget) => synchronizeWidgetConstraint(widget.id))
}
function refreshGridGeometry() {
  if (!grid.value || !gridElement.value) return
  const columns = grid.value.getColumn()
  const cellWidth = grid.value.cellWidth()
  const cellHeight = grid.value.getCellHeight(true)
  const margin = grid.value.getMargin() ?? 0
  const visibleHeight = Math.max(gridElement.value.clientHeight, gridElement.value.scrollHeight)
  const rows = Math.max(grid.value.getRow(), Math.ceil(visibleHeight / cellHeight))
  Object.assign(gridGeometry, getDashboardGridGeometry(columns, cellWidth, cellHeight, margin, rows))
}

defineExpose({ getLayout, getGridGeometry, getMembershipDiagnostic, whenMembershipSettled, applyLayout, registerWidget, unregisterWidget, setEditable })

watch(() => JSON.stringify(props.widgets.map(widget => gridWidgetId(widget.id))), () => {
  // Reconcile deletions BEFORE Vue removes DOM, including bulk reset/replacement.
  const wanted = new Set(props.widgets.map(widget => gridWidgetId(widget.id)))
  for (const id of new Set([...(grid.value?.engine.nodes || []).map(node => gridWidgetId(node.id)), ...registeredWidgetIds])) {
    if (!wanted.has(id)) unregisterWidget(id)
  }
  // Queue all registrations now; makeWidget itself waits for Vue's DOM patch.
  for (const widget of props.widgets) void registerWidget(widget.id, widget.layout || {})
}, { flush: 'pre' })
watch(() => props.widgets.map((widget) => {
  const { minW, minH } = getWidgetGridConstraints(widget)
  return `${widget.id}:${minW}:${minH}`
}).join('|'), async () => {
  await nextTick()
  synchronizeAllWidgetConstraints()
}, { flush: 'post' })
watch(() => props.editable, setEditable)

onMounted(async () => {
  await nextTick()
  if (disposed) return
  grid.value = GridStack.init({
    column: props.columns, cellHeight: props.cellHeight, margin: props.margin,
    float: props.float, staticGrid: !props.editable, animate: true, resizable: { handles: 'se' }
  }, gridElement.value)
  grid.value.engine.nodes.forEach(node => {
    if (gridWidgetId(node.id) !== null) { node.id = gridWidgetId(node.id); registeredWidgetIds.add(node.id) }
  })
  synchronizeAllWidgetConstraints()
  refreshGridGeometry()
  geometryObserver = new ResizeObserver(refreshGridGeometry)
  geometryObserver.observe(gridElement.value)
  grid.value.on('change', () => {
    refreshGridGeometry()
    // Programmatic callers still synchronize. Pointer gestures synchronize on stop.
    if (props.editable && !isApplyingSchema && !userInteractionActive) emit('layout-change', getLayout())
  })
  grid.value.on('dragstart', startGridInteraction)
  grid.value.on('resizestart', startGridInteraction)
  grid.value.on('drag', updateGridInteraction)
  grid.value.on('resize', updateGridInteraction)
  grid.value.on('dragstop', stopGridInteraction)
  grid.value.on('resizestop', stopGridInteraction)
})
onBeforeUnmount(() => {
  disposed = true
  geometryObserver?.disconnect()
  grid.value?.destroy(false)
})
</script>

<style scoped>
.dashboard-canvas { position: relative; min-height: 320px; isolation: isolate; }
.dashboard-canvas.is-editable {
  background-color: #f8fafc;
}
.dashboard-grid-guide {
  position: absolute;
  z-index: 0;
  inset: 0 auto auto 0;
  display: grid;
  pointer-events: none;
  overflow: hidden;
}
.dashboard-grid-guide__cell {
  position: relative;
  box-sizing: border-box;
}
.dashboard-grid-guide__cell::after {
  content: '';
  position: absolute;
  inset: var(--dashboard-guide-inset);
  box-sizing: border-box;
  border: 1px solid rgba(30, 32, 36, .09);
  border-radius: 5px;
  background: rgba(30, 32, 36, .018);
}
.dashboard-canvas.is-grid-interacting .dashboard-grid-guide__cell::after {
  border-color: rgba(30, 32, 36, .16);
}
.dashboard-grid-guide__cell.is-targeted::after {
  border-color: rgba(30, 32, 36, .26);
  background: rgba(30, 32, 36, .1);
}
.dashboard-canvas :deep(> .grid-stack-item) {
  z-index: 1;
}
.dashboard-canvas :deep(.dashboard-renderer-card.kpi-card) {
  min-width: 0;
  min-height: 0;
}
.dashboard-canvas :deep(.grid-stack-placeholder > .placeholder-content) {
  border: 1px dashed rgba(30, 32, 36, .48);
  border-radius: 8px;
  background: rgba(30, 32, 36, .11);
}
.dashboard-canvas__size-feedback {
  position: absolute;
  z-index: 10001;
  display: block;
  width: max-content;
  padding: 4px 8px;
  border-radius: 4px;
  color: #ffffff;
  background: rgba(16, 24, 40, .78);
  font-size: 12px;
  pointer-events: none;
  transform: translateX(-100%);
}
</style>
