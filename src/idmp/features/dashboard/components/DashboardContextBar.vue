<template>
  <section v-if="context.items.length" class="dashboard-context-bar" :class="{ 'is-expanded': expanded }" data-testid="dashboard-context-bar" aria-label="看板筛选与交互上下文">
    <span class="dashboard-context-bar__label">上下文</span>
    <div class="dashboard-context-bar__items">
      <span v-for="item in visibleItems" :key="item.id" class="dashboard-context-bar__chip" :class="`is-${item.kind}`"><b>{{ item.kind === 'drill' ? '下钻' : item.kind === 'interaction' ? '联动' : '筛选' }}</b><span>{{ item.label }} · {{ item.value }}</span></span>
      <button v-if="hiddenCount" type="button" data-testid="dashboard-context-more" @click="expanded = !expanded">{{ expanded ? '收起' : `+${hiddenCount}` }}</button>
    </div>
    <div class="dashboard-context-bar__actions"><button v-if="context.filters.length" type="button" @click="$emit('clear-filters')">清除筛选</button><button v-if="context.interactions.length" type="button" @click="$emit('clear-interactions')">清除联动</button><button v-if="context.drills.length" type="button" @click="$emit('clear-drills')">返回顶层</button></div>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { buildDashboardContext } from '../dashboardContext.js'
const props = defineProps({ definitions: { type: Array, default: () => [] }, values: { type: Object, default: () => ({}) }, interactions: { type: Array, default: () => [] }, drillStates: { type: Object, default: () => ({}) }, widgets: { type: Array, default: () => [] }, limit: { type: Number, default: 3 } })
defineEmits(['clear-filters', 'clear-interactions', 'clear-drills'])
const expanded = ref(false)
const context = computed(() => buildDashboardContext(props))
const visibleItems = computed(() => expanded.value ? context.value.items : context.value.items.slice(0, props.limit))
const hiddenCount = computed(() => Math.max(0, context.value.items.length - props.limit))
</script>
<style scoped>
.dashboard-context-bar{display:flex;align-items:center;gap:8px;min-width:0;height:34px;padding:0 12px;border-bottom:1px solid var(--db-border,#e3e9eb);background:color-mix(in srgb,var(--db-surface,#fff) 92%,#eaf5ff);color:var(--db-text,#25343b);font-size:11px}.dashboard-context-bar__label{flex:none;color:var(--db-muted,#667780);font-weight:600}.dashboard-context-bar__items{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden}.dashboard-context-bar__chip{display:flex;align-items:center;gap:4px;min-width:0;max-width:230px;padding:3px 6px;border:1px solid #cfe1e8;border-radius:4px;background:#fff;white-space:nowrap}.dashboard-context-bar__chip b{flex:none;color:#37708b;font-weight:600}.dashboard-context-bar__chip span{overflow:hidden;text-overflow:ellipsis}.dashboard-context-bar__chip.is-interaction{border-color:#c9dcef;background:#f5faff}.dashboard-context-bar__chip.is-drill{border-color:#d9d3ee;background:#faf8ff}.dashboard-context-bar__items button,.dashboard-context-bar__actions button{flex:none;border:0;background:transparent;color:var(--db-accent,#1261a6);font-size:11px;cursor:pointer}.dashboard-context-bar__actions{display:flex;gap:7px;margin-left:auto;white-space:nowrap}.dashboard-context-bar.is-expanded{height:auto;min-height:34px;align-items:flex-start;padding-top:6px;padding-bottom:6px}.dashboard-context-bar.is-expanded .dashboard-context-bar__items{flex-wrap:wrap;overflow:visible}.dashboard-context-bar.is-expanded .dashboard-context-bar__actions{padding-top:3px}@media(max-width:767px){.dashboard-context-bar{height:40px}.dashboard-context-bar__chip{max-width:125px}.dashboard-context-bar__actions button:not(:last-child){display:none}}
</style>
