<template>
  <section class="surface-card table-card">
    <div class="section-title">
      <h2>关联应用场景</h2>
      <el-button type="primary" :icon="Plus" :disabled="!indicatorId" @click="openAssociation">关联场景</el-button>
    </div>
    <StatePanel v-if="error" type="error" title="关联场景加载失败" :description="error">
      <template #actions><el-button @click="load">重试</el-button></template>
    </StatePanel>
    <div v-else class="table-scroll">
      <el-table v-loading="loading" :data="rows" empty-text="暂无关联场景">
        <el-table-column prop="name" label="场景名称" min-width="220" />
        <el-table-column prop="code" label="场景编码" min-width="160" />
        <el-table-column label="场景版本" width="110"><template #default="{ row }">V{{ row.scenarioVersionNo || '-' }}</template></el-table-column>
        <el-table-column label="发布状态" width="110"><template #default="{ row }">{{ getStatusLabel(row.publicationStatus) }}</template></el-table-column>
        <el-table-column label="关联指标版本" min-width="160"><template #default="{ row }">{{ (row.references || []).map(item => `V${item.indicatorVersionNo}`).join('、') || '-' }}</template></el-table-column>
        <el-table-column label="操作" width="120"><template #default="{ row }"><el-button link type="primary" @click="openOverrides(row)">配置覆盖</el-button></template></el-table-column>
      </el-table>
    </div>
    <el-dialog v-model="dialogOpen" title="关联场景" width="560px" :close-on-click-modal="false">
      <el-alert v-if="selectionError" :title="selectionError" type="error" :closable="false" />
      <el-form v-loading="selectionLoading" label-width="110px" @submit.prevent="configureAssociation">
        <el-form-item label="指标版本">
          <el-select v-model="selectedVersionId" filterable placeholder="选择已发布指标版本" aria-label="关联的指标版本">
            <el-option v-for="item in versions" :key="item.id" :label="`${item.indicatorName || '当前指标'} · V${item.versionNo}`" :value="String(item.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="应用场景">
          <el-select v-model="selectedScenarioId" filterable placeholder="选择应用场景" aria-label="关联的应用场景">
            <el-option v-for="item in scenarios" :key="item.id" :label="item.name" :value="String(item.id)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :disabled="selectionLoading || !selectedScenarioId || !selectedVersionId" @click="configureAssociation">前往配置</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { onActivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { fetchAllIndicatorScenarios, fetchAllIndicatorVersions } from '@/idmp/api/modules/indicators'
import { fetchAllScenarios } from '@/idmp/api/modules/scenarios'
import { getStatusLabel } from '@/idmp/design/status'

const props = defineProps({ indicatorId: { type: String, default: '' }, versionId: { type: String, default: '' } })
const router = useRouter()
const rows = ref([])
const loading = ref(false)
const error = ref('')
const dialogOpen = ref(false)
const selectionLoading = ref(false)
const selectionError = ref('')
const versions = ref([])
const scenarios = ref([])
const selectedVersionId = ref('')
const selectedScenarioId = ref('')
let revision = 0
let selectionRevision = 0
let loadedIndicatorId = ''

async function load() {
  const request = ++revision
  const id = props.indicatorId
  rows.value = []
  error.value = ''
  loading.value = Boolean(id)
  if (!id) return
  try {
    const data = await fetchAllIndicatorScenarios(id)
    if (request === revision) { rows.value = data; loadedIndicatorId = id }
  } catch (failure) {
    if (request === revision) error.value = failure?.message || '关联场景读取失败，请重试'
  } finally { if (request === revision) loading.value = false }
}

async function openAssociation() {
  const request = ++selectionRevision
  dialogOpen.value = true
  selectionLoading.value = true
  selectionError.value = ''
  selectedScenarioId.value = ''
  selectedVersionId.value = ''
  versions.value = []
  scenarios.value = []
  try {
    const [versionRows, scenarioRows] = await Promise.all([
      fetchAllIndicatorVersions({ indicatorId: props.indicatorId, publicationStatus: 'PUBLISHED' }), fetchAllScenarios()
    ])
    if (request !== selectionRevision) return
    versions.value = versionRows
    scenarios.value = scenarioRows.filter(item => item.status !== 'ARCHIVED')
    selectedVersionId.value = String(versionRows.find(item => String(item.id) === props.versionId)?.id || versionRows[0]?.id || '')
    if (!versionRows.length) selectionError.value = '当前指标尚无已发布版本，请先发布指标版本'
  } catch (failure) { if (request === selectionRevision) selectionError.value = failure?.message || '可选场景读取失败，请重试' }
  finally { if (request === selectionRevision) selectionLoading.value = false }
}

function configureAssociation() {
  if (!selectedScenarioId.value || !selectedVersionId.value) return
  dialogOpen.value = false
  router.push({ name: 'ScenarioEditor', params: { scenarioId: selectedScenarioId.value },
    query: { tab: 'indicators', indicatorVersionId: selectedVersionId.value, linkIndicator: '1' } })
}

function openOverrides(row) {
  const references = row.references || []
  const version = references.find(item => String(item.indicatorVersionId) === props.versionId) || references[0]
  router.push({ name: 'ScenarioEditor', params: { scenarioId: String(row.id) },
    query: { tab: 'overrides', ...(row.scenarioVersionId ? { versionId: String(row.scenarioVersionId) } : {}),
      ...(version ? { indicatorVersionId: String(version.indicatorVersionId) } : {}) } })
}

watch(() => props.indicatorId, load, { immediate: true })
onActivated(() => { if (loadedIndicatorId && loadedIndicatorId === props.indicatorId) load() })
</script>

<style scoped>
.section-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-title h2 { font-size: 18px; }
:deep(.el-select) { width: 100%; }
</style>
