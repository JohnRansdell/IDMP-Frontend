<template>
  <main class="grid-poc-wrapper">
    <h1>GridStack 24 列 Zero-Reactivity PoC</h1>
    <p>本页面仅验证 GridStack 原生拖拽与 Resize，不连接真实 Dashboard。</p>
    <div class="grid-poc-controls">
      <span>布局模式：</span>
      <button type="button" :class="{ active: !floatMode }" @click="setFloatMode(false)">紧凑布局</button>
      <button type="button" :class="{ active: floatMode }" @click="setFloatMode(true)">自由网格</button>
      <button type="button" @click="readLayout">读取当前布局</button>
      <button type="button" @click="saveLayout">保存布局</button>
      <button type="button" @click="restoreLayout">恢复布局</button>
      <button type="button" @click="resetLayout">重置</button>
    </div>
    <p class="grid-poc-mode">当前模式：{{ floatMode ? '自由网格（float=true），允许组件保留更自由的纵向网格位置。' : '紧凑布局（float=false），组件会自动向上补齐空白区域。' }}</p>
    <section ref="gridElement" class="grid-stack" aria-label="GridStack 测试画布">
      <div v-for="widget in widgets" :key="widget.id" class="grid-stack-item" :gs-id="widget.id" :gs-x="widget.x" :gs-y="widget.y" :gs-w="widget.w" :gs-h="widget.h" :data-widget-id="widget.id">
        <div class="grid-stack-item-content" :class="`widget-${widget.id}`">{{ widget.title }}</div>
      </div>
    </section>
    <section class="diagnostics">
      <h2>GridStack save(false)</h2><pre>{{ saveText }}</pre>
      <h2>Grid engine nodes</h2><pre>{{ engineText }}</pre>
      <h2>DOM attributes</h2><pre>{{ domText }}</pre>
      <h2>Saved Layout (idmp:gridstack-isolated-poc:v2)</h2><pre>{{ savedText }}</pre>
    </section>
  </main>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { GridStack } from 'gridstack'
import 'gridstack/dist/gridstack.min.css'

const gridElement = ref()
const grid = ref(null)
const saveText = ref('点击“读取当前布局”查看')
const engineText = ref('点击“读取当前布局”查看')
const domText = ref('点击“读取当前布局”查看')
const savedText = ref('尚未保存布局')
const floatMode = ref(false)
const widgets = [
  { id: 'a', title: 'A', x: 0, y: 0, w: 12, h: 4 },
  { id: 'b', title: 'B', x: 12, y: 0, w: 12, h: 4 },
  { id: 'c', title: 'C', x: 0, y: 4, w: 12, h: 4 },
  { id: 'd', title: 'D', x: 12, y: 4, w: 12, h: 4 }
]
const serializeNode = (node) => ({ id: String(node.id), x: node.x, y: node.y, w: node.w, h: node.h })
const readSavedLayout = () => localStorage.getItem('idmp:gridstack-isolated-poc:v2') || '尚未保存布局'

function setFloatMode(value) {
  floatMode.value = value
  grid.value?.float(value)
}

function readLayout() {
  if (!grid.value) return
  saveText.value = JSON.stringify(grid.value.save(false).map(serializeNode), null, 2)
  engineText.value = JSON.stringify(grid.value.engine.nodes.map(serializeNode), null, 2)
  domText.value = JSON.stringify([...gridElement.value.querySelectorAll('.grid-stack-item')].map((element) => ({
    id: element.getAttribute('gs-id'), x: element.getAttribute('gs-x'), y: element.getAttribute('gs-y'),
    w: element.getAttribute('gs-w'), h: element.getAttribute('gs-h')
  })), null, 2)
}

function saveLayout() {
  if (!grid.value) return
  const payload = { float: floatMode.value, widgets: grid.value.save(false).map(serializeNode) }
  localStorage.setItem('idmp:gridstack-isolated-poc:v2', JSON.stringify(payload))
  savedText.value = JSON.stringify(payload, null, 2)
}

function restoreLayout() {
  if (!grid.value) return
  try {
    const payload = JSON.parse(localStorage.getItem('idmp:gridstack-isolated-poc:v2') || 'null')
    if (!payload || !Array.isArray(payload.widgets) || payload.widgets.length !== 4) return
    const valid = payload.widgets.every((item) => item && typeof item.id === 'string' && ['x', 'y', 'w', 'h'].every((key) => Number.isInteger(item[key])))
    if (!valid) return
    if (typeof payload.float === 'boolean') {
      floatMode.value = payload.float
      grid.value.float(payload.float)
    }
    grid.value.load(payload.widgets.map(serializeNode), false)
    savedText.value = JSON.stringify(payload, null, 2)
  } catch {
    // Ignore malformed PoC storage.
  }
}

function resetLayout() {
  localStorage.removeItem('idmp:gridstack-isolated-poc:v2')
  grid.value?.load([
    { id: 'a', x: 0, y: 0, w: 12, h: 4 },
    { id: 'b', x: 12, y: 0, w: 12, h: 4 },
    { id: 'c', x: 0, y: 4, w: 12, h: 4 },
    { id: 'd', x: 12, y: 4, w: 12, h: 4 }
  ], false)
  floatMode.value = false
  grid.value?.float(false)
  savedText.value = '尚未保存布局'
}

onMounted(async () => {
  await nextTick()
  grid.value = GridStack.init({ column: 24, cellHeight: 60, margin: 8, float: false, animate: true, staticGrid: false, resizable: { handles: 'se' } }, gridElement.value)
  savedText.value = readSavedLayout()
  if (import.meta.env.DEV) {
    grid.value.on('dragstop', (_event, element) => console.debug('[GridPOC dragstop]', element?.gridstackNode && serializeNode(element.gridstackNode)))
    grid.value.on('resizestop', (_event, element) => console.debug('[GridPOC resizestop]', element?.gridstackNode && serializeNode(element.gridstackNode)))
  }
})

onBeforeUnmount(() => grid.value?.destroy(false))
</script>

<style scoped>
.grid-poc-wrapper { padding: 24px; }
.grid-poc-wrapper h1 { margin: 0 0 8px; font-size: 22px; }
.grid-poc-wrapper > p { color: #667085; }
.grid-poc-controls { display: flex; align-items: center; gap: 8px; margin: 12px 0 6px; }
.grid-poc-controls button { padding: 8px 14px; cursor: pointer; }
.grid-poc-controls button.active { border-color: #174a7c; background: #e8f1fb; color: #174a7c; }
.grid-poc-mode { margin: 0 0 16px; color: #475467; font-size: 13px; }
.grid-stack { min-height: 600px; background: #f8fafc; }
.grid-stack-item-content { display: flex; align-items: center; justify-content: center; border: 1px solid #8aa4c1; border-radius: 6px; background: #fff; color: #174a7c; font-size: 30px; font-weight: 600; }
.widget-b { color: #8b4b16; } .widget-c { color: #28745a; } .widget-d { color: #704a99; }
.diagnostics { margin-top: 24px; padding: 16px; border: 1px solid #d0d5dd; background: #fff; }
.diagnostics h2 { margin: 12px 0 6px; font-size: 15px; } .diagnostics h2:first-child { margin-top: 0; }
.diagnostics pre { margin: 0; overflow: auto; font-size: 12px; }
</style>
