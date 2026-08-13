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
        :snapshot-id="snapshotId"
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
const parentKeys = ref(Object.fromEntries(
  Object.entries(route.query)
    .filter(([key, value]) => key.endsWith('_CODE') && value)
    .map(([key, value]) => [key, String(Array.isArray(value) ? value[0] : value)])
))

const resultId = computed(() => String(route.query.resultId || ''))
const snapshotId = computed(() => String(route.query.snapshotId || ''))
const indicatorName = computed(() => String(route.query.indicatorName || '手术患者并发症发生率'))
const period = computed(() => String(route.query.period || '2026-06'))
const dataSourceLabel = '真实接口 · 动态下钻'

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
