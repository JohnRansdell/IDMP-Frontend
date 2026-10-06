<template>
  <div class="target-dag">
    <el-alert v-for="problem in graph.problems" :key="problem" :title="problem" type="warning" :closable="false" />
    <div class="dag-scroll" tabindex="0" aria-label="计算依赖图">
      <div class="dag-canvas" :style="{ width: `${graph.width}px`, height: `${graph.height}px` }">
        <svg class="dag-edges" :width="graph.width" :height="graph.height" aria-hidden="true">
          <defs><marker :id="markerId" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          <polyline v-for="edge in graph.edges" :key="`${edge.from}:${edge.to}`" :data-from="edge.from" :data-to="edge.to" :points="edge.points.map(p => `${p.x},${p.y}`).join(' ')" :marker-end="`url(#${markerId})`" />
        </svg>
        <button v-for="node in graph.nodes" :key="node.nodeCode" type="button" class="dag-node" :class="{ 'is-selected': String(selectedId) === String(node.nodeId), 'is-failed': node.status === 'FAILED' }" :data-node-id="node.nodeId"
          :style="{ left: `${node.x - node.width / 2}px`, top: `${node.y - node.height / 2}px` }" @click="$emit('select', node)">
          <span class="dag-node__type">{{ NODE_LABELS[node.nodeType] || '计算节点' }}<span v-if="node.versionNo"> · V{{ node.versionNo }}</span></span>
          <span class="dag-node__name" :title="node.nodeName || NODE_LABELS[node.nodeType]">{{ node.nodeName || NODE_LABELS[node.nodeType] || '计算节点' }}</span>
          <StatusBadge :status="node.status" :label="nodeStatusLabel(node.status)" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, useId } from 'vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { layoutCalculationGraph, NODE_LABELS } from '@/idmp/utils/calculationGraph'
const props = defineProps({ nodes: { type: Array, default: () => [] }, selectedId: { type: [String, Number], default: '' } })
defineEmits(['select'])
const markerId = `calc-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const graph = computed(() => layoutCalculationGraph(props.nodes))
function nodeStatusLabel(status) { return { LEASED: '已领取', SKIPPED: '已跳过' }[status] }
</script>

<style scoped>
.target-dag { display: grid; gap: 10px; }
.dag-scroll { overflow: auto; max-height: 600px; border: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-extra-light); }
.dag-canvas { position: relative; min-width: 264px; }
.dag-edges { position: absolute; inset: 0; color: var(--el-text-color-secondary); pointer-events: none; }
.dag-edges polyline { fill: none; stroke: currentColor; stroke-width: 1.5; }
.dag-node { position: absolute; width: 220px; height: 116px; padding: 12px 14px; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; text-align: left; border: 1px solid var(--el-border-color); border-radius: 6px; background: var(--el-bg-color); color: var(--el-text-color-primary); cursor: pointer; font: inherit; }
.dag-node:hover, .dag-node:focus-visible, .dag-node.is-selected { border-color: var(--el-color-primary); outline: 2px solid var(--el-color-primary-light-8); outline-offset: 1px; }
.dag-node.is-failed { border-left: 3px solid var(--el-color-danger); }
.dag-node__type { font-size: 12px; color: var(--el-text-color-secondary); }
.dag-node__name { font-size: 14px; font-weight: 600; line-height: 19px; height: 38px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
</style>
