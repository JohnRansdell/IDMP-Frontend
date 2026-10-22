<template>
  <div class="warning-event-summary" data-testid="warning-event-summary">
    <dl class="event-fields">
      <div><dt>状态</dt><dd><StatusBadge :status="event.status" :label="warningLabel(event.status)" /></dd></div>
      <div><dt>类型</dt><dd>{{ warningLabel(event.warningType) }}</dd></div>
      <div><dt>当前值</dt><dd class="event-value">{{ event.actualValue ?? '-' }}</dd></div>
      <div><dt>触发时间</dt><dd>{{ event.triggerTime?.replace('T', ' ') || '-' }}</dd></div>
      <div><dt>规则结果范围</dt><dd>{{ scope.rule }}</dd></div>
      <div><dt>本次触发结果</dt><dd>{{ scope.result }}</dd></div>
      <div class="event-period"><dt>结果统计周期</dt><dd>{{ warningEventPeriod(event) }}</dd></div>
    </dl>
    <section v-if="scope.result === '分组结果'" class="event-section">
      <h3>分组维度与取值</h3>
      <dl class="event-dimensions"><div v-for="item in dimensions" :key="item.field"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></dl>
      <p v-if="dictionaryError" class="event-note" role="status">{{ dictionaryError }}</p>
    </section>
    <section class="event-section"><h3>触发条件</h3><p class="event-condition">{{ warningEventCondition(event) }}</p></section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import StatusBadge from './StatusBadge.vue'
import { warningLabel } from '../api/adapters/warning.js'
import { fetchDepartmentNames } from '../api/modules/departments.js'
import { isDepartmentCodeField } from '../features/shared/departmentDictionary.js'
import { warningEventCondition, warningEventDimensions, warningEventPeriod, warningEventScope } from '../features/warnings/eventDetail.js'

const props = defineProps({ event: { type: Object, required: true } })
const names = ref(new Map())
const dictionaryError = ref('')
const scope = computed(() => warningEventScope(props.event))
const dimensions = computed(() => warningEventDimensions(props.event, names.value))
let generation = 0
watch(() => props.event, async event => {
  const request = ++generation
  names.value = new Map()
  dictionaryError.value = ''
  if (!warningEventDimensions(event).some(item => isDepartmentCodeField(item.field))) return
  try {
    const result = await fetchDepartmentNames()
    if (request === generation) names.value = result
  } catch {
    if (request === generation) dictionaryError.value = '科室字典暂不可用，已保留事件中的原始维度取值。'
  }
}, { immediate: true })
</script>

<style scoped>
.event-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px 24px; margin: 0; }
.event-fields dt, .event-dimensions dt { color: var(--idmp-text-helper); font-size: 12px; }
.event-fields dd, .event-dimensions dd { margin: 6px 0 0; overflow-wrap: anywhere; line-height: 1.6; }
.event-period { grid-column: 1 / -1; }
.event-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.event-section { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--idmp-border-subtle); }
.event-section h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
.event-dimensions { display: grid; gap: 12px; margin: 0; }
.event-dimensions > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 12px; }
.event-dimensions dt { align-self: center; overflow-wrap: anywhere; }
.event-dimensions dd { margin: 0; }
.event-condition { margin: 0; line-height: 1.8; overflow-wrap: anywhere; }
.event-note { color: var(--idmp-text-helper); font-size: 12px; }
@media (max-width: 600px) { .event-fields { grid-template-columns: 1fr; gap: 16px; } .event-dimensions > div { grid-template-columns: 1fr; gap: 4px; } }
</style>
