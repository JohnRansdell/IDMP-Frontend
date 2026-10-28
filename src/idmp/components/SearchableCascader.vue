<template>
  <div ref="root" class="searchable-cascader" @keydown.capture="onKeydown" @input="activate(items[0])">
    <el-cascader ref="cascader" filterable :debounce="0" v-bind="$attrs" @visible-change="onVisibleChange">
      <template v-for="(_, name) in $slots" #[name]="scope"><slot :name="name" v-bind="scope || {}" /></template>
    </el-cascader>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, useId } from 'vue'

defineOptions({ inheritAttrs: false })
const root = ref(null), cascader = ref(null)
const id = useId()
let observer, content, active, items = [], open = false

function activate(item) {
  active?.classList.remove('is-keyboard-active')
  active = item
  active?.classList.add('is-keyboard-active')
  const input = root.value?.querySelector('input')
  if (active) input?.setAttribute('aria-activedescendant', active.id)
  else input?.removeAttribute('aria-activedescendant')
}

function suggestions() {
  const panel = content?.querySelector('.el-cascader__suggestion-panel')
  return open && panel?.getClientRects().length ? panel : null
}

function syncSuggestions() {
  const next = [...(suggestions()?.querySelectorAll('.el-cascader__suggestion-item') || [])]
  next.forEach((item, index) => { item.id ||= `${id}-suggestion-${index}` })
  if (next.length !== items.length || next.some((item, index) => item !== items[index])) activate(next[0])
  items = next
  if (!items.length) activate(null)
}

function onPointerOver(event) {
  const item = event.target.closest('.el-cascader__suggestion-item')
  if (items.includes(item)) activate(item)
}

function disconnect() {
  observer?.disconnect()
  content?.removeEventListener('pointerover', onPointerOver)
  activate(null)
  items = []; content = null
}

async function onVisibleChange(visible) {
  open = visible
  disconnect()
  if (!visible) return
  await nextTick()
  if (!open) return
  // Observe only this popup's list, not the page or the component's private state.
  content = cascader.value?.contentRef
  if (!content) return
  observer = new MutationObserver(syncSuggestions)
  observer.observe(content, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] })
  content.addEventListener('pointerover', onPointerOver)
  syncSuggestions()
}

function onKeydown(event) {
  if (event.target.tagName !== 'INPUT' || event.target.disabled || event.isComposing || event.keyCode === 229
    || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey
    || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || !suggestions()) return
  event.preventDefault()
  event.stopPropagation()
  syncSuggestions()
  if (!items.length) return
  if (event.key === 'Enter') {
    if (!event.repeat) active?.click()
    return
  }
  const direction = event.key === 'ArrowDown' ? 1 : -1
  activate(items[(items.indexOf(active) + direction + items.length) % items.length])
  active?.scrollIntoView({ block: 'nearest' })
}

onBeforeUnmount(() => { open = false; disconnect() })
</script>

<style scoped>
.searchable-cascader { width: 100%; }
.searchable-cascader > :deep(.el-cascader) { width: 100%; }
</style>
