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
        <el-button @click="backToAnalysis">返回指标分析</el-button>
      </template>
    </PageHeader>

    <section class="surface-card drill-surface">
      <DrillExplorer
        :result-id="resultId"
        :indicator-name="indicatorName"
        :period="period"
        :start-level="currentLevel"
        :start-parent-keys="parentKeys"
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
const currentLevel = ref(String(route.query.currentLevel || 'HOSPITAL'))
const parentKeys = ref({
  departmentKey: String(route.query.departmentKey || ''),
  departmentLabel: String(route.query.departmentLabel || ''),
  medicalGroupKey: String(route.query.medicalGroupKey || ''),
  medicalGroupLabel: String(route.query.medicalGroupLabel || ''),
  doctorKey: String(route.query.doctorKey || ''),
  doctorLabel: String(route.query.doctorLabel || '')
})

const resultId = computed(() => String(route.query.resultId || 'MOCK-RESULT-001'))
const snapshotId = computed(() => String(route.query.snapshotId || 'MOCK-SNAPSHOT-20260811'))
const indicatorName = computed(() => String(route.query.indicatorName || '手术患者并发症发生率'))
const period = computed(() => String(route.query.period || '2026-06'))
const dataSourceLabel = '演示数据 · 组织维度'

function handleLevelChange(context) {
  currentLevel.value = context.currentLevel
  parentKeys.value = { ...context.parentKeys }
}

function backToAnalysis() {
  router.push({ path: '/analysis', query: { indicator: route.query.indicator || undefined } })
}
</script>

<style scoped>
.drill-surface {
  padding: 0 20px 20px;
}
</style>
