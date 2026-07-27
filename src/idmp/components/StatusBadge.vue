<template>
  <span class="status-badge" :class="`is-${resolvedTone}`">
    <span class="status-badge__dot" aria-hidden="true" />
    <span>{{ resolvedLabel }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { getStatusDefinition } from '@/idmp/design/status'

const props = defineProps({
  status: { type: String, default: '' },
  label: { type: String, default: '' },
  tone: { type: String, default: '' }
})

const definition = computed(() => getStatusDefinition(props.status))
const resolvedLabel = computed(() => props.label || definition.value.label)
const resolvedTone = computed(() => props.tone || definition.value.tone)
</script>

