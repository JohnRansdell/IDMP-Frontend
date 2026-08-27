<template>
  <div class="idmp-page result-drill">
    <PageHeader
      :title="`${indicatorName} · 结果下钻`"
      :status-label="dataSourceLabel"
      status-tone="info"
    >
      <template #meta>
        <span>结果 <strong class="mono-data">{{ resultId }}</strong></span>
        <span>快照 <strong class="mono-data">{{ snapshotId }}</strong></span>
        <span>周期 <strong>{{ period }}</strong></span>
      </template>
      <template #actions>
        <el-button @click="backToSource">{{ fromDashboard ? '返回指标看板' : '返回指标分析' }}</el-button>
      </template>
    </PageHeader>

    <section class="surface-card drill-surface">
      <DrillExplorer
        :result-id="resultId"
        :snapshot-id="snapshotId"
        :indicator-name="indicatorName"
        :period="period"
        :start-level="currentLevel"
        :start-parent-keys="parentKeys"
        :source="source"
        @level-change="handleLevelChange"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'

const route = useRoute()
const router = useRouter()
const parentKeyWhitelist = new Set([
  'HOSPITAL_CODE',
  'OUT_DEPT_CODE',
  'DEPARTMENT_CODE',
  'MEDICAL_GROUP_CODE',
  'ATTENDING_DOCTOR_CODE',
  'SINGLE_DISEASE_CODE'
])
const currentLevel = ref(String(route.query.currentLevel || 'HOSPITAL'))
const parentKeys = ref(Object.fromEntries(
  Object.entries(route.query)
    .filter(([key, value]) => parentKeyWhitelist.has(key) && value)
    .map(([key, value]) => [key, String(Array.isArray(value) ? value[0] : value)])
))

const resultId = computed(() => String(route.query.resultId || ''))
const snapshotId = computed(() => String(route.query.snapshotId || ''))
const indicatorName = computed(() => String(route.query.indicatorName || '手术患者并发症发生率'))
const period = computed(() => String(route.query.period || '2026-06'))
const source = computed(() => route.query.source === 'mock' ? 'mock' : 'live')
const fromDashboard = computed(() => route.query.from === 'dashboard')
const dataSourceLabel = computed(() => source.value === 'mock' ? '演示数据' : '真实接口')

function handleLevelChange(context) {
  currentLevel.value = context.currentLevel
  parentKeys.value = { ...context.parentKeys }
}

function backToSource() {
  if (fromDashboard.value) {
    if (window.history.state?.back) router.back()
    else router.push('/dashboard')
    return
  }
  router.push({ path: '/analysis', query: { indicator: route.query.indicator || undefined } })
}
</script>

<style scoped>
.drill-surface {
  padding: 0 20px 20px;
}
</style>
