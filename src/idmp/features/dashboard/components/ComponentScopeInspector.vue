<template>
  <section class="component-scope" aria-label="组件查询范围">
    <h3>组件查询范围</h3>
    <p>默认继承看板条件；固定范围会随组件配置保存，并在全局条件基础上进一步收窄。</p>
    <label>统计周期<select :value="periodMode" @change="setPeriodMode($event.target.value)"><option value="INHERIT">继承看板周期</option><option value="FIXED">固定周期</option></select></label>
    <template v-if="periodMode === 'FIXED'">
      <label>时间粒度<select :value="query.granularity || 'MONTHLY'" @change="patch({ granularity: $event.target.value })"><option value="YEARLY">年度</option><option value="QUARTERLY">季度</option><option value="MONTHLY">月度</option><option value="DAILY">日</option></select></label>
      <label>开始日期<input type="date" :value="query.periodStart || ''" @change="patch({ periodStart: $event.target.value || null })" /></label>
      <label>结束日期<input type="date" :value="query.periodEnd || ''" @change="patch({ periodEnd: $event.target.value || null })" /></label>
    </template>
    <label>组织范围<select :value="organizationMode" @change="setOrganizationMode($event.target.value)"><option value="INHERIT">继承看板组织</option><option value="FIXED">指定组织</option></select></label>
    <template v-if="organizationMode === 'FIXED'">
      <label>组织层级<select :value="query.organizationScope?.level || 'DEPARTMENT'" @change="patchOrganization({ level: $event.target.value })"><option value="HOSPITAL">全院</option><option value="DEPARTMENT">科室</option><option value="MEDICAL_GROUP">医疗组</option><option value="DOCTOR">医师</option></select></label>
      <label>组织编码<input :value="join(query.organizationScope?.ids)" placeholder="多个编码用逗号分隔" @change="patchOrganization({ ids: split($event.target.value) })" /></label>
    </template>
    <label>应用场景<select :value="scenarioMode" @change="setScenarioMode($event.target.value)"><option value="INHERIT">继承看板场景</option><option value="FIXED">指定场景版本</option></select></label>
    <label v-if="scenarioMode === 'FIXED'">场景版本 ID<input :value="join(query.scenarioVersionIds)" placeholder="多个 ID 用逗号分隔" @change="patch({ scenarioVersionIds: split($event.target.value) })" /></label>
    <p v-if="validation" class="component-scope__error">{{ validation }}</p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } })
const emit = defineEmits(['change'])
const query = computed(() => props.modelValue || {})
const periodMode = computed(() => query.value.periodMode === 'FIXED' ? 'FIXED' : 'INHERIT')
const organizationMode = computed(() => query.value.organizationMode === 'FIXED' ? 'FIXED' : 'INHERIT')
const scenarioMode = computed(() => query.value.scenarioMode === 'FIXED' ? 'FIXED' : 'INHERIT')
const validation = computed(() => {
  if (periodMode.value === 'FIXED' && (!query.value.periodStart || !query.value.periodEnd)) return '固定周期必须同时填写开始日期和结束日期。'
  if (query.value.periodStart && query.value.periodEnd && query.value.periodStart > query.value.periodEnd) return '开始日期不能晚于结束日期。'
  if (organizationMode.value === 'FIXED' && !query.value.organizationScope?.ids?.length && query.value.organizationScope?.level !== 'HOSPITAL') return '指定组织时请填写至少一个组织编码。'
  if (scenarioMode.value === 'FIXED' && !query.value.scenarioVersionIds?.length) return '指定场景时请填写至少一个场景版本 ID。'
  return ''
})
function patch(value) { emit('change', { ...query.value, ...value }) }
function patchOrganization(value) { patch({ organizationScope: { ...(query.value.organizationScope || {}), ...value } }) }
function setPeriodMode(mode) { patch(mode === 'FIXED' ? { periodMode: mode, granularity: query.value.granularity || 'MONTHLY' } : { periodMode: 'INHERIT', periodStart: null, periodEnd: null }) }
function setOrganizationMode(mode) { patch(mode === 'FIXED' ? { organizationMode: mode, organizationScope: query.value.organizationScope || { level: 'DEPARTMENT', ids: [] } } : { organizationMode: 'INHERIT', organizationScope: null }) }
function setScenarioMode(mode) { patch(mode === 'FIXED' ? { scenarioMode: mode, scenarioVersionIds: query.value.scenarioVersionIds || [] } : { scenarioMode: 'INHERIT', scenarioVersionIds: [] }) }
function split(value) { return [...new Set(String(value || '').split(/[,，\s]+/).map(item => item.trim()).filter(Boolean))] }
function join(value) { return Array.isArray(value) ? value.join(', ') : '' }
</script>

<style scoped>
.component-scope { display:grid; gap:8px; margin-top:16px; padding-top:12px; border-top:1px solid var(--db-border,#e3e9eb); font-size:12px; }.component-scope h3,.component-scope p { margin:0; }.component-scope p { color:var(--db-muted,#78878e); line-height:1.55; }.component-scope label { display:grid; gap:4px; }.component-scope input,.component-scope select { box-sizing:border-box; width:100%; padding:7px; border:1px solid var(--db-border,#e3e9eb); border-radius:5px; background:#fff; }.component-scope__error { color:var(--db-danger,#b45858)!important; }
</style>
