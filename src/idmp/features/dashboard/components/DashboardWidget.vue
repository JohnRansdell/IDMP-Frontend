<template>
  <div
    ref="root"
    class="grid-stack-item dashboard-widget"
    :class="{ 'is-selected': selected, 'is-primary-selected': primarySelected, 'is-editable': editable, 'is-locked': widget.config?.locked === true }"
    :data-size-tier="sizeTier"
    :gs-id="String(widget.id)"
    :gs-x="widget.layout?.x"
    :gs-y="widget.layout?.y"
    :gs-w="widget.layout?.w"
    :gs-h="widget.layout?.h"
    :gs-min-w="constraints.minW"
    :gs-min-h="constraints.minH"
    :data-widget-id="String(widget.id)"
    :data-testid="`dashboard-widget-${widget.id}`"
    @pointerdown="selectWidget"
  >
    <div class="grid-stack-item-content">
      <div class="dashboard-widget__chrome" :style="chromeStyle">
        <div class="dashboard-widget__body">
          <slot :widget="widget" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getWidgetGridConstraints } from '../gridLayout.js'
import { normalizeWidgetSelectionId } from '../widgetCapabilities.js'
import { getDashboardWidgetSizeTier } from '../widgetSizing.js'

const props = defineProps({
  widget: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false }, primarySelected: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'remove', 'configure'])
const root = ref(null)
const sizeTier = ref('standard')
let resizeObserver
const constraints = computed(() => getWidgetGridConstraints(props.widget))
function selectWidget(event) {
  if (event.target instanceof Element && event.target.closest('.ui-resizable-handle')) return
  emit('select', { id: normalizeWidgetSelectionId(props.widget.id), additive: event.ctrlKey || event.metaKey || event.shiftKey })
}
const chromeStyle = computed(() => {
  const style = props.widget.config?.style || {}
  return {
    background: style.background,
    borderColor: style.borderColor,
    borderWidth: `${style.borderWidth ?? 1}px`,
    borderStyle: style.borderStyle || 'solid',
    borderRadius: `${style.borderRadius ?? 8}px`,
    boxShadow: resolveShadow(style.shadow),
    padding: `${style.padding ?? 0}px`,
    opacity: style.opacity ?? 1,
    '--widget-radius': `${style.borderRadius ?? 8}px`
  }
})
function resolveShadow(value) {
  const shadows = {
    none: 'none', sm: '0 1px 3px rgba(16,24,40,.12)', md: '0 4px 12px rgba(16,24,40,.16)',
    lg: '0 10px 28px rgba(16,24,40,.22)', glow: '0 0 20px rgba(21,112,239,.34)'
  }
  return shadows[value] || value || 'none'
}
function updateSizeTier(width, height) {
  sizeTier.value = getDashboardWidgetSizeTier(width, height)
}
onMounted(() => {
  const element = root.value
  if (!element) return
  updateSizeTier(element.clientWidth, element.clientHeight)
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(([entry]) => updateSizeTier(entry.contentRect.width, entry.contentRect.height))
  resizeObserver.observe(element)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.dashboard-widget { overflow: visible !important; }
.dashboard-widget :deep(.grid-stack-item-content) { overflow: visible !important; }
.dashboard-widget__chrome { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: visible; }
.dashboard-widget__body { width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box; overflow: hidden; border-radius: inherit; container-type: size; }
.dashboard-widget__body :deep(> *) { height: 100%; box-sizing: border-box; }
.dashboard-widget.is-selected::after { content: ''; position: absolute; z-index: 10; inset: -5px; pointer-events: none; border: 2px solid #409eff; border-radius: calc(var(--widget-radius) + 5px); }
.dashboard-widget.is-selected:not(.is-primary-selected)::after { border-color:rgba(64,158,255,.55); border-width:1px; }
.dashboard-widget.is-locked::before { content:'锁定'; position:absolute; z-index:11; top:6px; right:7px; padding:2px 5px; border-radius:4px; color:#475467; background:rgba(255,255,255,.88); font-size:10px; pointer-events:none; }
</style>
