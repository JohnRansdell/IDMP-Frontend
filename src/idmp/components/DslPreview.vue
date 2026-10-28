<template>
  <details id="factor-technical-info" ref="detailsRef" class="surface-card technical-info" @toggle="expanded = $event.currentTarget.open">
    <summary>技术信息（仅供排查）</summary>
    <template v-if="expanded">
      <p>供技术人员核对当前定义。普通创建、校验和发布无需查看；以下内容只读。</p>
      <pre class="dsl-preview" tabindex="0" aria-label="因子技术信息（只读）">{{ JSON.stringify(dsl, null, 2) }}</pre>
    </template>
  </details>
</template>
<script setup>
import { nextTick, ref } from 'vue'
defineProps({ dsl: { type: Object, default: () => ({}) } })
const detailsRef = ref(null)
const expanded = ref(false)
async function open() {
  if (!detailsRef.value) return
  expanded.value = true
  detailsRef.value.open = true
  await nextTick()
  detailsRef.value.querySelector('summary')?.focus({ preventScroll: true })
  detailsRef.value.scrollIntoView({ block: 'start', behavior: 'instant' })
}
defineExpose({ open })
</script>
<style scoped>
.technical-info { min-width: 0; margin: 16px 0; padding: 14px 18px; scroll-margin-top: calc(var(--idmp-topbar-height, 64px) + 12px); }
.technical-info summary { cursor: pointer; color: var(--idmp-text-secondary); font-size: 13px; line-height: 1.8; }
.technical-info summary:focus-visible { outline: 2px solid var(--idmp-interactive); outline-offset: 3px; }
.technical-info p { color: var(--idmp-text-helper); font-size: 12px; line-height: 1.7; }
.dsl-preview { max-height: min(360px, 50vh); margin-bottom: 0; padding: 14px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--idmp-layer-01, #f6f8fa); border: 1px solid var(--idmp-border-soft); border-radius: 6px; font: 12px/1.7 Consolas, monospace; }
</style>
