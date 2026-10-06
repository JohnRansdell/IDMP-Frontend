<template>
  <div class="target-dag">
    <el-alert v-for="problem in graph.problems" :key="problem" :title="problem" type="warning" :closable="false" />
    <div class="dag-toolbar">
      <span>{{ graph.nodes.length }} 个节点<span class="dag-toolbar__separator">·</span>{{ graph.edges.length }} 条依赖</span>
      <div class="dag-tools">
        <el-tooltip content="缩小" placement="top"><el-button aria-label="缩小依赖图" :icon="ZoomOut" :disabled="scale <= 0.6" @click="zoom(-0.1)" /></el-tooltip>
        <span class="dag-scale">{{ Math.round(scale * 100) }}%</span>
        <el-tooltip content="放大" placement="top"><el-button aria-label="放大依赖图" :icon="ZoomIn" :disabled="scale >= 1.5" @click="zoom(0.1)" /></el-tooltip>
        <el-tooltip content="还原视图" placement="top"><el-button aria-label="还原依赖图视图" :icon="RefreshLeft" @click="resetView" /></el-tooltip>
      </div>
    </div>
    <div ref="scroller" class="dag-scroll" tabindex="0" aria-label="计算依赖图">
      <div class="dag-scaled" :style="{ width: `${graph.width * scale}px`, height: `${graph.height * scale}px` }">
      <div class="dag-canvas" :style="{ width: `${graph.width}px`, height: `${graph.height}px`, transform: `scale(${scale})` }">
        <div v-for="column in graph.columns" :key="column.x" class="dag-column" :style="{ left: `${column.x}px`, width: `${column.width}px` }"><span>{{ column.label }}</span></div>
        <svg class="dag-edges" :width="graph.width" :height="graph.height" aria-hidden="true">
          <defs>
            <marker :id="markerId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9aa8b8" /></marker>
            <marker :id="`${markerId}-active`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--el-color-primary)" /></marker>
          </defs>
          <path v-for="edge in graph.edges" :key="`${edge.from}:${edge.to}`" class="dag-edge" :class="{ 'is-active': edgeActive(edge), 'is-muted': activeCode && !edgeActive(edge) }" :data-from="edge.from" :data-to="edge.to" :d="edge.path" :marker-end="`url(#${markerId}${edgeActive(edge) ? '-active' : ''})`" />
        </svg>
        <button v-for="node in graph.nodes" :key="node.nodeCode" type="button" class="dag-node" :data-kind="node.nodeType" :class="{ 'is-selected': String(selectedId) === String(node.nodeId), 'is-failed': node.status === 'FAILED', 'is-muted': activeCode && !related.has(node.nodeCode) }" :data-node-id="node.nodeId"
          :style="{ left: `${node.x - node.width / 2}px`, top: `${node.y - node.height / 2}px` }" @click="$emit('select', node)" @mouseenter="hoveredCode = node.nodeCode" @mouseleave="hoveredCode = ''" @focus="hoveredCode = node.nodeCode" @blur="hoveredCode = ''">
          <span class="dag-node__header"><span class="dag-node__type">{{ NODE_LABELS[node.nodeType] || '计算节点' }}</span><span v-if="node.versionNo" class="dag-node__version">V{{ node.versionNo }}</span></span>
          <span class="dag-node__name" :title="node.nodeName || NODE_LABELS[node.nodeType]">{{ node.nodeName || NODE_LABELS[node.nodeType] || '计算节点' }}</span>
          <span class="dag-node__footer"><StatusBadge :status="node.status" :label="nodeStatusLabel(node.status)" /><span v-if="node.attemptNo > 1" class="dag-node__attempt">第 {{ node.attemptNo }} 次</span></span>
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import { RefreshLeft, ZoomIn, ZoomOut } from '@element-plus/icons-vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { layoutCalculationGraph, relatedGraphCodes, NODE_LABELS } from '@/idmp/utils/calculationGraph'
const props = defineProps({ nodes: { type: Array, default: () => [] }, selectedId: { type: [String, Number], default: '' } })
defineEmits(['select'])
const markerId = `calc-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const graph = computed(() => layoutCalculationGraph(props.nodes))
const hoveredCode = ref(''), scale = ref(1), scroller = ref(null)
const activeCode = computed(() => hoveredCode.value || graph.value.nodes.find(node => String(node.nodeId) === String(props.selectedId))?.nodeCode || '')
const related = computed(() => relatedGraphCodes(graph.value.edges, activeCode.value))
function edgeActive(edge) { return !!activeCode.value && related.value.has(edge.from) && related.value.has(edge.to) }
function zoom(delta) { scale.value = Math.max(0.6, Math.min(1.5, Math.round((scale.value + delta) * 10) / 10)) }
function resetView() { scale.value = 1; scroller.value?.scrollTo({ left: 0, top: 0 }) }
function nodeStatusLabel(status) { return { LEASED: '已领取', SKIPPED: '已跳过' }[status] }
</script>

<style scoped>
.target-dag { display: grid; gap: 10px; }
.dag-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.dag-toolbar__separator { margin: 0 10px; color: #b6bec8; }
.dag-tools { display: flex; align-items: center; gap: 4px; }
.dag-tools :deep(.el-button) { width: 28px; height: 28px; padding: 0; margin: 0; border-color: transparent; background: transparent; }
.dag-scale { min-width: 38px; text-align: center; font-variant-numeric: tabular-nums; }
.dag-scroll { overflow: auto; max-height: 650px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: #fafbfd; }
.dag-scaled { position: relative; min-width: 1px; }
.dag-canvas { position: relative; transform-origin: top left; }
.dag-column { position: absolute; top: 14px; bottom: 16px; pointer-events: none; }
.dag-column > span { display: block; padding-bottom: 10px; border-bottom: 1px solid #e7ebf0; color: #8894a3; font-size: 12px; font-weight: 500; }
.dag-edges { position: absolute; inset: 0; pointer-events: none; }
.dag-edge { fill: none; stroke: #9aa8b8; stroke-width: 1.5; stroke-linejoin: round; transition: opacity 120ms, stroke 120ms; }
.dag-edge.is-active { stroke: var(--el-color-primary); stroke-width: 2; }
.dag-edge.is-muted { opacity: 0.3; }
.dag-node { --node-accent: #57768f; position: absolute; box-sizing: border-box; width: 224px; height: 128px; padding: 12px 14px; display: flex; flex-direction: column; align-items: stretch; gap: 8px; text-align: left; border: 1px solid #dce3eb; border-top: 3px solid var(--node-accent); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); cursor: pointer; font: inherit; box-shadow: 0 2px 5px #24354b06; transition: border-color 120ms, box-shadow 120ms, opacity 120ms; }
.dag-node[data-kind='FACTOR'] { --node-accent: #2b8a7e; }
.dag-node[data-kind='DERIVED_FACTOR'] { --node-accent: #6e71a7; }
.dag-node[data-kind='FORMULA'], .dag-node[data-kind='INDICATOR'] { --node-accent: #397cb9; }
.dag-node[data-kind='QUALITY_CHECK'] { --node-accent: #a58040; }
.dag-node:hover, .dag-node:focus-visible, .dag-node.is-selected { border-color: var(--el-color-primary); outline: 2px solid var(--el-color-primary-light-8); outline-offset: 1px; box-shadow: 0 3px 10px #24354b10; }
.dag-node.is-muted { opacity: 0.5; }
.dag-node.is-failed { border-color: var(--el-color-danger-light-5); border-top-color: var(--el-color-danger); }
.dag-node__header, .dag-node__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dag-node__type { font-size: 12px; color: var(--node-accent); font-weight: 500; }
.dag-node__version { color: #7b8795; font-size: 11px; font-variant-numeric: tabular-nums; }
.dag-node__name { font-size: 14px; font-weight: 600; line-height: 20px; height: 40px; flex-shrink: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.dag-node__footer { margin-top: auto; min-height: 20px; }
.dag-node__attempt { color: var(--el-text-color-secondary); font-size: 11px; }
</style>
