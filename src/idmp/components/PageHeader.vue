<template>
  <div class="page-heading">
    <div class="page-heading__main">
      <div v-if="eyebrow" class="page-heading__eyebrow">{{ eyebrow }}</div>
      <div class="page-heading__title-row">
        <h1>{{ title }}</h1>
        <StatusBadge
          v-if="status || statusLabel"
          :status="status"
          :label="statusLabel"
          :tone="statusTone"
        />
      </div>
      <p v-if="description">{{ description }}</p>
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
  eyebrow: { type: String, default: '' },
  description: { type: String, default: '' },
  status: { type: String, default: '' },
  statusLabel: { type: String, default: '' },
  statusTone: { type: String, default: '' }
})
</script>
