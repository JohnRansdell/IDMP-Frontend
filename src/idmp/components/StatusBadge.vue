<template>
  <span class="status-badge" :class="`is-${presentation.tone}`">
    <span class="status-badge__dot" aria-hidden="true" />
    <span>{{ presentation.label }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { resolveStatusPresentation } from '@/idmp/design/status'

const props = defineProps({
  status: { type: String, default: '' },
  label: { type: String, default: '' },
  tone: { type: String, default: '' }
})

const presentation = computed(() => resolveStatusPresentation(props))
</script>

