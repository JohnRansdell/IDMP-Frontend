<template>
  <section
    ref="gridElement"
    class="grid-stack dashboard-canvas"
    data-testid="dashboard-canvas"
    :class="{ 'is-editable': editable, 'is-grid-interacting': interaction.active, 'is-marquee-selecting': marquee.active }"
    :style="gridStyle"
    :aria-label="ariaLabel"
    @click.self="handleCanvasClick"
    @pointerdown="startMarqueeSelection"
    @pointermove="updateMarqueeSelection"
    @pointerup="finishMarqueeSelection"
    @pointercancel="cancelMarqueeSelection"
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
      :selected="isWidgetSelected(widget.id)"
      :primary-selected="primarySelectedWidgetId === String(widget.id)"
      @select="selectWidget"
      @remove="$emit('widget-remove', $event)"
      @configure="$emit('widget-configure', $event)"
    >
      <template #default="slotProps"><DashboardWidgetBoundary :designer="editable"><slot :widget="slotProps.widget" /></DashboardWidgetBoundary></template>
    </DashboardWidget>
    <div v-if="editable && marquee.active && marquee.moved" class="dashboard-marquee" :style="marqueeStyle" aria-hidden="true">
      <span class="dashboard-marquee__count">{{ marqueeHitIds.length }} 个组件</span>
    </div>
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
let suppressCanvasClick = false
let suppressCanvasClickTimer
const interaction = reactive({ active: false, x: 0, y: 0, w: 0, h: 0 })
const marquee = reactive({ active: false, moved: false, additive: false, pointerId: null, startX: 0, startY: 0, clientLeft: 0, clientTop: 0, clientRight: 0, clientBottom: 0, x: 0, y: 0, width: 0, height: 0 })
const marqueeHitIds = ref([])
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
const marqueeStyle = computed(() => ({ left: `${marquee.x}px`, top: `${marquee.y}px`, width: `${marquee.width}px`, height: `${marquee.height}px` }))
let isApplyingSchema = false
let userInteractionActive = false
let geometryObserver
function selectWidget(widgetId) {
  emit('widget-select', widgetId)
}
function isWidgetSelected(widgetId) {
  const id = String(widgetId)
  if (!marquee.active || !marquee.moved) return props.selectedWidgetIds.includes(id)
  return marqueeHitIds.value.includes(id) || (marquee.additive && props.selectedWidgetIds.includes(id))
}
function handleCanvasClick() {
  if (!suppressCanvasClick) selectWidget('')
}
function isMarqueeOrigin(target) {
  return target instanceof Element && !target.closest('.dashboard-widget, button, input, select, textarea, a, [contenteditable="true"]')
}
function setMarqueeRectangle(clientX, clientY) {
  const canvasRect = gridElement.value?.getBoundingClientRect()
  if (!canvasRect) return
  const currentX = Math.min(Math.max(clientX, canvasRect.left), canvasRect.right)
  const currentY = Math.min(Math.max(clientY, canvasRect.top), canvasRect.bottom)
  marquee.clientLeft = Math.min(marquee.startX, currentX)
  marquee.clientTop = Math.min(marquee.startY, currentY)
  marquee.clientRight = Math.max(marquee.startX, currentX)
  marquee.clientBottom = Math.max(marquee.startY, currentY)
  marquee.x = marquee.clientLeft - canvasRect.left
  marquee.y = marquee.clientTop - canvasRect.top
  marquee.width = marquee.clientRight - marquee.clientLeft
  marquee.height = marquee.clientBottom - marquee.clientTop
}
function collectMarqueeHits() {
  if (!gridElement.value || !marquee.moved) return []
  return [...gridElement.value.children]
    .filter(element => element.matches('.dashboard-widget.grid-stack-item'))
    .filter((element) => {
      const rect = element.getBoundingClientRect()
      return marquee.clientLeft < rect.right && marquee.clientRight > rect.left && marquee.clientTop < rect.bottom && marquee.clientBottom > rect.top
    })
    .map(element => String(element.dataset.widgetId || ''))
    .filter(Boolean)
}
function startMarqueeSelection(event) {
  if (!props.editable || interaction.active || event.button !== 0 || event.pointerType === 'touch' || !isMarqueeOrigin(event.target)) return
  const canvasRect = gridElement.value?.getBoundingClientRect()
  if (!canvasRect) return
  marquee.active = true
  marquee.moved = false
  marquee.additive = event.ctrlKey || event.metaKey || event.shiftKey
  marquee.pointerId = event.pointerId
  marquee.startX = Math.min(Math.max(event.clientX, canvasRect.left), canvasRect.right)
  marquee.startY = Math.min(Math.max(event.clientY, canvasRect.top), canvasRect.bottom)
  marqueeHitIds.value = []
  setMarqueeRectangle(event.clientX, event.clientY)
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}
function updateMarqueeSelection(event) {
  if (!marquee.active || event.pointerId !== marquee.pointerId) return
  setMarqueeRectangle(event.clientX, event.clientY)
  marquee.moved = marquee.moved || marquee.width >= 4 || marquee.height >= 4
  marqueeHitIds.value = collectMarqueeHits()
}
function resetMarqueeSelection() {
  marquee.active = false
  marquee.moved = false
  marquee.pointerId = null
  marqueeHitIds.value = []
}
function finishMarqueeSelection(event) {
  if (!marquee.active || event.pointerId !== marquee.pointerId) return
  const moved = marquee.moved
  const additive = marquee.additive
  const ids = [...marqueeHitIds.value]
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  resetMarqueeSelection()
  if (!moved) return
  suppressCanvasClick = true
  clearTimeout(suppressCanvasClickTimer)
  suppressCanvasClickTimer = setTimeout(() => { suppressCanvasClick = false }, 0)
  emit('widget-select', { ids, additive, source: 'marquee' })
}
function cancelMarqueeSelection(event) {
  if (!marquee.active || event.pointerId !== marquee.pointerId) return
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  resetMarqueeSelection()
}

// Vue owns widget membership and content. Save the currently displayed column layout;
// GridStack's default save() may otherwise return its largest-column layout cache.
function getLayout() {
  return grid.value ? serializeGridLayout(grid.value.save(false, false, undefined, grid.value.getColumn())) : []
}
function getGridGeometry() { return { ...gridGeometry } }
function collectWidgetLayoutDiagnostic(widgetId) {
  const id = gridWidgetId(widgetId)
  const widget = props.widgets.find(item => gridWidgetId(item.id) === id)
  const element = findWidgetElement(id)
  const node = element?.gridstackNode
  const rect = element?.getBoundingClientRect?.()
  const contentRect = element?.querySelector('.grid-stack-item-content')?.getBoundingClientRect?.()
  return { id, schema: widget?.layout ? { ...widget.layout } : null, node: node ? { x: node.x, y: node.y, w: node.w, h: node.h } : null, attributes: element ? { x: Number(element.getAttribute('gs-x')), y: Number(element.getAttribute('gs-y')), w: Number(element.getAttribute('gs-w')), h: Number(element.getAttribute('gs-h')) } : null, rect: rect ? { width: rect.width, height: rect.height } : null, contentRect: contentRect ? { width: contentRect.width, height: contentRect.height } : null }
}
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
async function applyLayout(layout = []) {
  await whenMembershipSettled()
  if (!grid.value) return []
  const items = serializeGridLayout(layout).map((item) => {
    const widget = props.widgets.find((candidate) => gridWidgetId(candidate.id) === item.id)
    return { ...item, ...getWidgetGridConstraints(widget) }
  })
  applySchemaOperation(() => {
    // load() restores the complete canonical layout. Re-applying each item through
    // GridStack's public API makes the live node and gs-* DOM attributes converge
    // even when an existing item keeps the same Vue element across a restore.
    grid.value.load(items, false)
    items.forEach((item) => {
      const element = findWidgetElement(item.id)
      if (element) grid.value.update(element, item)
    })
  })
  await nextTick()
  synchronizeAllWidgetConstraints()
  await nextTick()
  refreshGridGeometry()
  return getLayout()
}
function setEditable(value) { grid.value?.setStatic(!value) }
function applySchemaOperation(operation) {
  isApplyingSchema = true
  try { return operation() } finally { isApplyingSchema = false }
}
function startGridInteraction(_event, element) {
  resetMarqueeSelection()
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
  const locked = widget.config?.locked === true
  // Explicit false values are required when a previously locked node is unlocked:
  // GridStack retains omitted node flags from the prior update.
  const constraints = { ...getWidgetGridConstraints(widget), noMove: locked, noResize: locked }
  applySchemaOperation(() => {
    grid.value.update(element, constraints)
    // GridStack's node flags alone do not always update the live DD handlers.
    // Update both APIs so a persisted lock immediately disables drag and resize.
    grid.value.movable(element, !locked)
    grid.value.resizable(element, !locked)
  })
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

defineExpose({ getLayout, getGridGeometry, getMembershipDiagnostic, collectWidgetLayoutDiagnostic, whenMembershipSettled, applyLayout, registerWidget, unregisterWidget, setEditable })

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
  return `${widget.id}:${minW}:${minH}:${widget.config?.locked === true}`
}).join('|'), async () => {
  await nextTick()
  synchronizeAllWidgetConstraints()
}, { flush: 'post' })
watch(() => props.editable, setEditable)
watch(() => props.editable, value => { if (!value) resetMarqueeSelection() })

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
  clearTimeout(suppressCanvasClickTimer)
  geometryObserver?.disconnect()
  grid.value?.destroy(false)
})
</script>

<style scoped>
.dashboard-canvas { position: relative; min-height: 320px; isolation: isolate; }
.dashboard-canvas.is-editable {
  background-color: transparent;
}
.dashboard-canvas.is-editable:not(.is-grid-interacting) { cursor: crosshair; }
.dashboard-canvas.is-marquee-selecting { user-select: none; }
.dashboard-canvas.dashboard-surface {
  /* Keep Dashboard.vue's image/overlay composition intact on the inner canvas. */
  background-color: var(--dashboard-background, #ffffff);
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
.dashboard-canvas.is-editable :deep(> .dashboard-widget:not(.is-locked)) { cursor: grab; }
.dashboard-canvas.is-grid-interacting :deep(> .dashboard-widget:not(.is-locked)) { cursor: grabbing; }
.dashboard-canvas.is-editable :deep(> .dashboard-widget.is-locked) { cursor: pointer; }
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
.dashboard-marquee {
  position: absolute;
  z-index: 10002;
  box-sizing: border-box;
  border: 1px solid rgba(35, 113, 209, .92);
  border-radius: 5px;
  background: rgba(35, 113, 209, .12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .42), 0 4px 14px rgba(35, 113, 209, .12);
  pointer-events: none;
}
.dashboard-marquee__count {
  position: absolute;
  right: 0;
  bottom: -27px;
  width: max-content;
  padding: 3px 7px;
  border-radius: 4px;
  color: #fff;
  background: rgba(20, 78, 151, .9);
  font-size: 12px;
  line-height: 18px;
  box-shadow: 0 3px 10px rgba(16, 24, 40, .16);
}
</style>
