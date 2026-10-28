<template>
  <section class="surface-card table-card">
    <div class="section-title"><div><h2>场景关联（可选）</h2><p>不关联场景也可试算、即时运行和生成独立正式结果。场景用于按业务用途组织指标和上报要求。</p></div><el-button :disabled="loading || saving" @click="loadLinks">刷新</el-button></div>
    <el-alert v-if="!published" title="指标版本发布后可以加入场景；无需先关联场景再发布指标。" type="info" :closable="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-alert v-if="savedVersionId" title="已加入场景草稿。请进入场景编辑页核对覆盖规则、校验并发布，场景计算才会使用该配置。" type="success" :closable="false" />
    <el-table v-loading="loading" :data="links" empty-text="当前指标版本暂无关联场景">
      <el-table-column label="场景" min-width="200"><template #default="{ row }">{{ row.name || row.scenarioName || '未命名场景' }}</template></el-table-column>
      <el-table-column prop="publicationStatus" label="状态" width="120" />
      <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" @click="open(row.id || row.scenarioId, row.scenarioVersionId)">查看或配置覆盖</el-button></template></el-table-column>
    </el-table>
    <div v-if="published" class="scenario-controls">
      <el-select default-first-option v-model="scenarioId" filterable remote :remote-method="search" :loading="searching" placeholder="搜索可关联的场景" :disabled="saving" @visible-change="visible => visible && search('')" @change="loadVersions"><el-option v-for="row in options" :key="row.id" :value="String(row.id)" :label="row.name || '未命名场景'" /></el-select>
      <el-select v-model="draftId" placeholder="选择场景草稿版本" :disabled="saving || versionsLoading" :loading="versionsLoading"><el-option v-for="row in drafts" :key="row.id" :value="String(row.id)" :label="`草稿版本 ${row.versionNo}`" /></el-select>
      <el-button type="primary" :disabled="!draftId || saving" :loading="saving" @click="bind">加入场景草稿</el-button>
      <el-button v-if="scenarioId" @click="open(scenarioId, savedVersionId || draftId)">进入场景编辑</el-button>
    </div>
    <p v-if="scenarioId && !versionsLoading && !drafts.length">该场景没有可编辑草稿，请进入场景编辑页创建新版本。已发布场景不会被直接修改。</p>
  </section>
</template>
<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchAllIndicatorScenarios } from '@/idmp/api/modules/indicators'
import { fetchAllScenarios, fetchScenarioVersions, fetchScenarioVersion, replaceScenarioIndicators } from '@/idmp/api/modules/scenarios'
import { appendScenarioIndicator } from '@/idmp/features/indicator/editorWorkflow'
const props = defineProps({ indicatorId: { type: String, default: '' }, versionId: { type: String, default: '' }, published: Boolean })
const router = useRouter()
const links = ref([]), options = ref([]), drafts = ref([]), scenarioId = ref(''), draftId = ref(''), savedVersionId = ref('')
const loading = ref(false), searching = ref(false), versionsLoading = ref(false), saving = ref(false), error = ref('')
let context = 0, searchRevision = 0, versionRevision = 0, linksRevision = 0
const rows = result => Array.isArray(result) ? result : result.records || result.items || []
function open(id, versionId) { router.push({ name: 'ScenarioEditor', params: { scenarioId: String(id) }, query: versionId ? { versionId: String(versionId) } : {} }) }
async function loadLinks() {
  const revision = ++linksRevision
  links.value = []; loading.value = !!props.indicatorId; error.value = ''
  if (!props.indicatorId) return
  try {
    const result = await fetchAllIndicatorScenarios(props.indicatorId)
    if (revision === linksRevision) links.value = rows(result).filter(row => !row.references || row.references.some(ref => String(ref.indicatorVersionId) === props.versionId))
  } catch (e) { if (revision === linksRevision) error.value = e.message }
  finally { if (revision === linksRevision) loading.value = false }
}
async function search(name) {
  const revision = ++searchRevision; searching.value = true
  try { const result = await fetchAllScenarios({ name }); if (revision === searchRevision) options.value = rows(result) }
  catch (e) { if (revision === searchRevision) error.value = e.message }
  finally { if (revision === searchRevision) searching.value = false }
}
async function loadVersions() {
  const revision = ++versionRevision; drafts.value = []; draftId.value = ''; savedVersionId.value = ''; versionsLoading.value = true
  try { const result = await fetchScenarioVersions(scenarioId.value); if (revision === versionRevision) drafts.value = rows(result).filter(row => (row.publicationStatus || row.status) === 'DRAFT') }
  catch (e) { if (revision === versionRevision) error.value = e.message }
  finally { if (revision === versionRevision) versionsLoading.value = false }
}
async function bind() {
  if (!props.published || !draftId.value || saving.value) return
  const current = context, target = draftId.value, indicatorVersionId = props.versionId
  saving.value = true; error.value = ''
  try {
    const detail = await fetchScenarioVersion(target)
    if (current !== context) return
    const version = detail.version
    if (version.publicationStatus !== 'DRAFT') throw new Error('场景版本已不是草稿，请重新选择')
    await replaceScenarioIndicators(target, { resourceVersion: version.resourceVersion, indicators: appendScenarioIndicator(version.indicators || [], indicatorVersionId) })
    if (current !== context) return
    savedVersionId.value = target
    await loadLinks()
  } catch (e) { if (current === context) error.value = `${e.message}。未自动覆盖其他并发修改，请刷新后重试。` }
  finally { if (current === context) saving.value = false }
}
watch(() => [props.indicatorId, props.versionId, props.published], () => { context++; versionRevision++; searchRevision++; linksRevision++; scenarioId.value = ''; draftId.value = ''; savedVersionId.value = ''; drafts.value = []; saving.value = false; void loadLinks() }, { immediate: true })
onBeforeUnmount(() => { context++; linksRevision++; searchRevision++; versionRevision++ })
</script>
<style scoped>
.scenario-controls { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.scenario-controls .el-select { width: 260px; max-width: 100%; }
</style>
