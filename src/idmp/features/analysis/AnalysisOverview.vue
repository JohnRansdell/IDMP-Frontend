<template>
  <section class="metric-overview" :class="{ 'is-single': !summaryMetrics.length }" aria-label="指标核心数据">
    <article class="surface-card primary-metric">
      <div>
        <span>{{ primaryMetric.label }}</span>
        <StatusBadge :status="primaryMetric.status" :label="primaryMetric.statusLabel" />
      </div>
      <strong>{{ primaryMetric.value }}</strong>
      <p>{{ primaryMetric.periodLabel }}<template v-if="targetLabel"> · {{ targetLabel }}</template></p>
    </article>
    <div v-if="summaryMetrics.length" class="metric-summary-grid" :class="summaryMetricGridClass">
      <article v-for="item in summaryMetrics" :key="item.label" class="surface-card metric-summary-card">
        <div class="metric-summary-card__header">
          <span>{{ item.label }}</span>
        </div>
        <strong :class="metricToneClass(item.tone)">{{ item.value }}</strong>
        <p>{{ item.description || ' ' }}</p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'

const props = defineProps({
  model: { type: Object, required: true },
  targetLabel: { type: String, default: '' }
})
const primaryMetric = computed(() => props.model.primary)
const summaryMetrics = computed(() => props.model.summaries)
const summaryMetricGridClass = computed(() => `is-${Math.min(Math.max(summaryMetrics.value.length, 1), 6)}`)
const metricToneClass = (tone) => {
  if (tone === 'danger') return 'text-danger'
  if (tone === 'success') return 'text-success'
  return ''
}
</script>

<style scoped lang="scss">
.metric-overview {
  display: grid;
  grid-template-columns: minmax(290px, 0.9fr) minmax(0, 1.6fr);
  gap: var(--idmp-space-3);
  margin-bottom: var(--idmp-space-4);
}

.primary-metric {
  min-height: 190px;
  padding: var(--idmp-space-5);
  border-left: 4px solid var(--idmp-interactive);

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--idmp-space-3);
  }

  span {
    color: var(--idmp-text-secondary);
    font-size: 14px;
    line-height: 18px;
  }

  > strong {
    display: block;
    margin: var(--idmp-space-5) 0 var(--idmp-space-2);
    color: var(--idmp-text-primary);
    font-size: 42px;
    font-weight: 650;
    line-height: 48px;
    font-variant-numeric: tabular-nums;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.metric-summary-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--idmp-space-3);
  align-content: stretch;
}

.metric-summary-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  grid-column: span 2;
  min-width: 0;
  min-height: 112px;
  padding: var(--idmp-space-5);
  text-align: left;

  .metric-summary-card__header {
    display: flex;
    min-height: 18px;
    align-items: center;
  }

  span {
    color: var(--idmp-text-secondary);
    font-size: 14px;
    line-height: 18px;
  }

  strong {
    display: block;
    min-width: 0;
    margin: var(--idmp-space-5) 0 var(--idmp-space-2);
    color: var(--idmp-text-primary);
    font-size: 24px;
    font-weight: 650;
    line-height: 32px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  p {
    margin: 0;
    min-height: 18px;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.metric-summary-grid.is-1 .metric-summary-card { grid-column: span 6; }
.metric-summary-grid.is-2 .metric-summary-card,
.metric-summary-grid.is-4 .metric-summary-card { grid-column: span 3; }
.metric-summary-grid.is-5 .metric-summary-card:nth-child(-n + 2) { grid-column: span 3; }

.metric-overview.is-single {
  grid-template-columns: minmax(290px, 520px);
}

.text-danger {
  color: var(--idmp-support-danger);
}

.text-success {
  color: var(--idmp-support-success);
}

.text-muted {
  color: var(--idmp-text-helper);
}

@media (max-width: 1450px) {
  .metric-overview { grid-template-columns: minmax(250px, 0.85fr) minmax(0, 1.55fr); gap: var(--idmp-space-2); }
}
@media (max-width: 1180px) {
  .metric-overview { grid-template-columns: 1fr; }
  .primary-metric { min-height: 150px; }
}
@media (max-width: 720px) {
  .metric-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-summary-card,
  .metric-summary-grid.is-2 .metric-summary-card,
  .metric-summary-grid.is-3 .metric-summary-card,
  .metric-summary-grid.is-4 .metric-summary-card,
  .metric-summary-grid.is-5 .metric-summary-card,
  .metric-summary-grid.is-5 .metric-summary-card:nth-child(-n + 2) {
    grid-column: span 1;
  }

  .metric-summary-grid.is-1 .metric-summary-card { grid-column: span 2; }


}
</style>
