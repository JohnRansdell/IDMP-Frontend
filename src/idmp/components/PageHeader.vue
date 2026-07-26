<template>
  <div class="page-heading">
    <div class="page-heading__main">
      <div class="page-heading__title-row">
        <h1>{{ title }}</h1>
        <StatusBadge
          v-if="status || statusLabel"
          :status="status"
          :label="statusLabel"
          :tone="statusTone"
        />
      </div>
      <div v-if="$slots.meta" class="page-heading__meta">
        <slot name="meta" />
      </div>
    </div>
    <div v-if="$slots.actions" class="page-heading__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import StatusBadge from '@/idmp/components/StatusBadge.vue'

defineProps({
  title: { type: String, required: true },
  status: { type: String, default: '' },
  statusLabel: { type: String, default: '' },
  statusTone: { type: String, default: '' }
})
</script>
