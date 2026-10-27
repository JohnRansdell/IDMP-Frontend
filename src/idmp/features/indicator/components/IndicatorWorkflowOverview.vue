<template>
  <section class="surface-card workflow-overview" aria-label="指标配置生命周期">
    <div
      v-for="(step, index) in steps"
      :key="step.key"
      class="workflow-step"
      :class="`is-${step.state}`"
    >
      <span class="workflow-step__index">{{ index + 1 }}</span>
      <span class="workflow-step__copy">
        <strong>{{ step.label }}</strong>
        <small>{{ step.description }}</small>
      </span>
    </div>
  </section>

</template>
<script setup>
defineProps({ steps: { type: Array, required: true } })
</script>
<style scoped lang="scss">
.workflow-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: 12px;
  padding: 14px 16px;
  gap: 0;
}

.workflow-step {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: flex-start;
  padding-right: 16px;
  gap: 9px;

  &::after {
    position: absolute;
    top: 11px;
    right: 6px;
    left: 30px;
    z-index: 0;
    height: 1px;
    background: var(--idmp-border-strong);
    content: "";
  }

  &:last-child::after {
    display: none;
  }
}

.workflow-step__index {
  position: relative;
  z-index: 1;
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: 1px solid var(--idmp-border-strong);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-01);
  color: var(--idmp-text-helper);
  place-items: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.workflow-step__copy {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  padding-right: 6px;
  background: var(--idmp-layer-01);
  gap: 2px;

  strong {
    color: var(--idmp-text-primary);
    font-size: 12px;
    line-height: 20px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 11px;
    line-height: 16px;
  }
}

.workflow-step.is-current .workflow-step__index {
  border-color: var(--idmp-interactive);
  background: var(--idmp-interactive-subtle);
  color: var(--idmp-interactive);
  font-weight: 650;
}

.workflow-step.is-complete .workflow-step__index {
  border-color: var(--idmp-support-success);
  background: var(--idmp-support-success-bg);
  color: var(--idmp-support-success);
}

.workflow-step.is-blocked .workflow-step__index {
  border-color: var(--idmp-support-warning);
  background: var(--idmp-support-warning-bg);
  color: var(--idmp-support-warning);
}

@media (max-width: 1280px) { .workflow-overview { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 0; } }
</style>
