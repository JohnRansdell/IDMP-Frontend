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
        v-if="!configurationLoading && !configurationError"
        :result-id="resultId"
        :snapshot-id="snapshotId"
        :indicator-name="indicatorName"
        :period="period"
        :start-level="currentLevel"
        :start-parent-keys="parentKeys"
        :source="source"
        :configured-paths="configuredPaths"
        :start-path-code="String(route.query.pathCode || '')"
        @level-change="handleLevelChange"
      />
      <StatePanel v-else-if="configurationLoading" type="loading" title="正在读取下钻配置" />
      <StatePanel v-else type="error" title="下钻配置读取失败" :description="configurationError" />
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import DrillExplorer from '@/idmp/features/analysis/DrillExplorer.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { fetchIndicatorVersion } from '@/idmp/api/modules/indicators'

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
const parentKeys = ref(readParentKeys())
function readParentKeys() {
  try {
    if (route.query.parentKeys) {
      const keys = JSON.parse(String(route.query.parentKeys))
      if (keys && typeof keys === 'object' && !Array.isArray(keys)) return Object.fromEntries(Object.entries(keys).filter(([, value]) => typeof value === 'string'))
    }
  } catch { /* Old links keep their individual parent-key parameters. */ }
  return Object.fromEntries(
    Object.entries(route.query)
      .filter(([key, value]) => parentKeyWhitelist.has(key) && value)
      .map(([key, value]) => [key, String(Array.isArray(value) ? value[0] : value)])
  )
}

const resultId = computed(() => String(route.query.resultId || ''))
const snapshotId = computed(() => String(route.query.snapshotId || ''))
const indicatorName = computed(() => String(route.query.indicatorName || '手术患者并发症发生率'))
const period = computed(() => String(route.query.period || '2026-06'))
const source = computed(() => route.query.source === 'mock' ? 'mock' : 'live')
const fromDashboard = computed(() => route.query.from === 'dashboard')
const dataSourceLabel = computed(() => source.value === 'mock' ? '演示数据' : '真实接口')
const configuredPaths = ref([])
const configurationLoading = ref(false)
const configurationError = ref('')
let configurationRequestId = 0
watch(() => [route.query.indicatorVersionId, source.value], async ([versionId, mode]) => {
  const requestId = ++configurationRequestId
  configuredPaths.value = []
  configurationError.value = ''
  configurationLoading.value = Boolean(versionId && mode !== 'mock')
  if (!configurationLoading.value) return
  try {
    const version = await fetchIndicatorVersion(String(versionId))
    if (requestId === configurationRequestId) configuredPaths.value = version.drillConfig?.drillPaths || []
  } catch (error) {
    if (requestId === configurationRequestId) configurationError.value = error?.message || '请稍后重试'
  } finally {
    if (requestId === configurationRequestId) configurationLoading.value = false
  }
}, { immediate: true })

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
