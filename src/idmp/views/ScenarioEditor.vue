<template>
  <div class="idmp-page scenario-editor">
    <PageHeader :title="form.name || '场景编辑'" :status="form.publicationStatus" :status-label="publicationStatusLabel(form.publicationStatus)">
      <template #meta><span>当前版本：V{{ form.versionNo }}</span><span>资源版本：{{ form.resourceVersion }}</span></template>
      <template #actions>
        <el-button @click="router.push({ name: 'ScenarioList' })">返回目录</el-button>
        <el-button v-if="capabilities.canStartEdit" type="primary" :loading="startingEdit" @click="startEditing">编辑场景</el-button>
        <el-button v-if="capabilities.canEdit" type="primary" :loading="saving" :disabled="publishing" @click="saveAll">保存草稿</el-button>
        <el-button v-if="capabilities.canPublish" type="success" :loading="publishing" :disabled="saving" @click="publish">发布</el-button>
      </template>
    </PageHeader>
    <el-alert v-if="readOnlyMessage" :title="readOnlyMessage" :type="form.publicationStatus === 'UNKNOWN' ? 'warning' : 'info'" show-icon :closable="false" class="page-notice" />

    <el-tabs v-model="activeTab" type="border-card" class="scenario-tabs">
      <el-tab-pane label="基本信息" name="basic">
        <el-form :model="form" label-position="top" class="basic-form">
          <el-form-item label="场景名称" required><el-input v-model.trim="form.name" :disabled="!editable" placeholder="请输入场景名称" /></el-form-item>

          <el-form-item label="场景类型"><el-select v-model="form.type" disabled><el-option v-for="item in SCENARIO_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="主管部门"><el-input v-model.trim="form.governingOrgName" :disabled="!editable" placeholder="填写主管部门（可选）" /></el-form-item>
          <el-form-item label="默认统计周期" required><el-select v-model="form.defaultPeriodType" :disabled="!editable"><el-option v-for="item in PERIOD_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="生效日期"><el-date-picker v-model="form.effectiveRange" type="daterange" unlink-panels value-format="YYYY-MM-DD" start-placeholder="开始日期（可选）" end-placeholder="结束日期（可选）" :disabled="!editable" /></el-form-item>
          <el-form-item label="场景说明" class="form-item-wide"><el-input v-model="form.description" type="textarea" :rows="3" :disabled="!editable" placeholder="补充场景用途或上报说明（可选）" /></el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="关联指标" name="indicators">
        <div class="indicator-heading">
          <div><h2>已关联指标 <span>{{ boundIndicators.length }}</span></h2><p>维护指标版本、必选设置和上报要求。</p></div>
          <div v-if="capabilities.canEdit" class="indicator-add">
            <el-select v-model="pendingIndicatorId" filterable clearable :disabled="!editable" aria-label="选择待添加指标" placeholder="搜索指标名称，选择已发布版本" :no-data-text="indicatorOptions.length ? '已关联全部可用指标' : '暂无可用的已发布指标'">
              <el-option v-for="item in availableIndicatorOptions" :key="optionVersionId(item)" :label="`${item.indicatorName || item.name || '未命名指标'} · V${item.versionNo || '-'}`" :value="optionVersionId(item)" />
            </el-select>
            <el-button type="primary" plain :disabled="!editable || !pendingIndicatorId" @click="addIndicator">添加指标</el-button>
          </div>
        </div>
        <el-table :data="boundIndicators" row-key="indicatorVersionId" table-layout="fixed" max-height="420" :empty-text="capabilities.canEdit ? '暂未关联指标，请选择已发布指标版本后添加。' : '当前场景暂无关联指标'">
          <el-table-column label="指标名称" min-width="220"><template #default="{ row }"><span class="indicator-name">{{ row.indicatorName || '未命名指标' }}</span></template></el-table-column>
          <el-table-column label="版本" width="100"><template #default="{ row }"><span>{{ row.indicatorVersionNo ? `V${row.indicatorVersionNo}` : '版本号未提供' }}</span></template></el-table-column>
          <el-table-column label="必选" width="90"><template #default="{ row }"><el-switch v-if="capabilities.canEdit" v-model="row.required" :disabled="!editable" :aria-label="`${row.indicatorName || '未命名指标'}是否必选`" /><span v-else>{{ row.required ? '必选' : '可选' }}</span></template></el-table-column>
          <el-table-column label="上报要求" min-width="240"><template #default="{ row }"><el-input v-if="capabilities.canEdit" v-model="row.reportRequirementText" :disabled="!editable" placeholder="填写上报要求（可选）" /><span v-else class="report-text">{{ row.reportRequirementText || '—' }}</span></template></el-table-column>
          <el-table-column label="操作" :width="capabilities.canEdit ? 140 : 80" fixed="right"><template #default="{ row }"><el-button link type="primary" :loading="openingIndicatorId === row.indicatorVersionId" @click="openIndicator(row)">查看</el-button><el-button v-if="capabilities.canEdit" link type="danger" :disabled="!editable" :aria-label="`移除${row.indicatorName || '未命名指标'}`" @click="removeIndicator(row.indicatorVersionId)">移除</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { fetchIndicatorVersion, fetchAllIndicatorVersions } from '@/idmp/api/modules/indicators'
import { createScenarioVersion, fetchScenarioVersion, fetchScenarioVersions, publishScenarioVersion, replaceScenarioIndicators, updateScenarioVersion, validateScenarioVersion } from '@/idmp/api/modules/scenarios'
import { normalizeResourceId, PERIOD_TYPES, publicationStatusLabel, SCENARIO_TYPES, scenarioDetailToForm, scenarioFormToPatch, scenarioVersionCapabilities, toIndicatorBinding } from '@/idmp/api/adapters/scenario'

const route = useRoute()
const router = useRouter()
const activeTab = ref('basic')
const saving = ref(false)
const publishing = ref(false)
const startingEdit = ref(false)
const indicatorOptions = ref([])
const pendingIndicatorId = ref('')
const openingIndicatorId = ref('')
let loadRevision = 0
const form = reactive({ scenarioId: '', versionId: '', name: '', type: 'CUSTOM', description: '', governingOrgName: '', defaultPeriodType: 'MONTHLY', defaultParameters: {}, defaultDataSourcePriority: {}, displayText: '', effectiveStartDate: '', effectiveEndDate: '', effectiveRange: [], resourceVersion: 0, publicationStatus: 'UNKNOWN', versionNo: '-', indicators: [] })
const capabilities = computed(() => scenarioVersionCapabilities(form.publicationStatus))
const editable = computed(() => capabilities.value.canEdit && !saving.value && !publishing.value)
const readOnlyMessage = computed(() => ({
  PUBLISHED: '当前为已发布版本，可以查看全部配置；如需修改，请点击“编辑场景”。',
  ARCHIVED: '当前版本已归档，仅支持查看，不能编辑或发布。',
  UNKNOWN: '服务端未返回可识别的版本状态，为避免误修改，当前仅支持查看。'
}[form.publicationStatus] || ''))
const availableIndicatorOptions = computed(() => {
  const selected = new Set(form.indicators.map(item => normalizeResourceId(item.indicatorVersionId)))
  return indicatorOptions.value.filter(item => optionVersionId(item) && !selected.has(optionVersionId(item))
    && String(item.publicationStatus || item.status || 'PUBLISHED').toUpperCase() === 'PUBLISHED')
})
function optionVersionId(item) { return normalizeResourceId(item.id || item.indicatorVersionId || item.versionId) }
function addIndicator() {
  if (!editable.value) return
  const option = availableIndicatorOptions.value.find(item => optionVersionId(item) === pendingIndicatorId.value)
  if (!option) return
  form.indicators.push(toIndicatorBinding(option, form.indicators.length))
  pendingIndicatorId.value = ''
}
function removeIndicator(id) {
  if (!editable.value) return
  form.indicators = form.indicators.filter(item => normalizeResourceId(item.indicatorVersionId) !== normalizeResourceId(id))
  form.indicators.forEach((item, index) => { item.displayOrder = index })
}
async function openIndicator(binding) {
  if (openingIndicatorId.value) return
  openingIndicatorId.value = binding.indicatorVersionId
  try {
    const option = indicatorOptions.value.find(item => optionVersionId(item) === binding.indicatorVersionId)
    let id = normalizeResourceId(binding.indicatorId || option?.indicatorId)
    if (!id) {
      const version = await fetchIndicatorVersion(binding.indicatorVersionId)
      id = normalizeResourceId(version?.indicatorId || version?.indicator?.id)
    }
    if (!id) throw new Error('未获取到关联指标信息，请刷新后重试。')
    await router.push({ name: 'IndicatorDetail', params: { id }, query: { indicatorVersionId: binding.indicatorVersionId } })
  } catch (error) { ElMessage.error(error?.message || '指标详情打开失败') } finally { openingIndicatorId.value = '' }
}
const boundIndicators = computed(() => form.indicators.map((binding) => {
  const option = indicatorOptions.value.find((item) => normalizeResourceId(item.id || item.indicatorVersionId || item.versionId) === normalizeResourceId(binding.indicatorVersionId))
  if (option) {
    binding.indicatorCode = binding.indicatorCode || option.indicatorCode || option.code
    binding.indicatorName = binding.indicatorName || option.indicatorName || option.name
    binding.indicatorVersionNo = binding.indicatorVersionNo || option.versionNo
  }
  return binding
}))

function applyDetail(detail) {
  const next = scenarioDetailToForm(detail)
  Object.assign(form, next, { effectiveRange: next.effectiveStartDate && next.effectiveEndDate ? [next.effectiveStartDate, next.effectiveEndDate] : [] })
  pendingIndicatorId.value = ''
}
async function load() {
  const request = ++loadRevision
  try {
    const options = await fetchAllIndicatorVersions({ publicationStatus: 'PUBLISHED' })
    if (request !== loadRevision) return
    indicatorOptions.value = options
    let versionId = route.query.versionId
    if (!versionId && route.params.scenarioId) {
      const list = await fetchScenarioVersions(route.params.scenarioId)
      if (request !== loadRevision) return
      versionId = (Array.isArray(list) ? list : []).find((item) => item.publicationStatus === 'DRAFT')?.id || list?.[0]?.id
    }
    if (versionId) {
      const detail = await fetchScenarioVersion(versionId)
      if (request !== loadRevision) return
      applyDetail(detail)
      applyEntryContext()
    }
  } catch (error) { if (request === loadRevision) ElMessage.error(error?.message || '场景版本加载失败') }
}
async function startEditing() {
  if (!capabilities.value.canStartEdit || startingEdit.value) return
  startingEdit.value = true
  try {
    const versions = await fetchScenarioVersions(form.scenarioId)
    const draft = (Array.isArray(versions) ? versions : []).find((item) => item.publicationStatus === 'DRAFT')
    const detail = draft
      ? await fetchScenarioVersion(draft.id)
      : await createScenarioVersion(form.scenarioId, { copyFromVersionId: form.versionId }, `scenario-edit-${form.scenarioId}-${form.versionId}-${Date.now()}`)
    applyDetail(detail)
    applyEntryContext()
    await router.replace({ name: 'ScenarioEditor', params: { scenarioId: form.scenarioId }, query: { ...route.query, versionId: detail?.version?.id } })
  } catch (error) { ElMessage.error(error?.message || '进入场景编辑失败，当前版本仍可继续查看') } finally { startingEdit.value = false }
}
async function persistDraft() {
  form.effectiveStartDate = form.effectiveRange?.[0] || ''
  form.effectiveEndDate = form.effectiveRange?.[1] || ''
  if (!form.name.trim()) { activeTab.value = 'basic'; throw new Error('请输入场景名称') }
  const indicators = form.indicators.map(toIndicatorBinding)
  if (!indicators.length) { activeTab.value = 'indicators'; throw new Error('请至少关联一个已发布指标版本') }
  let detail = await updateScenarioVersion(form.versionId, scenarioFormToPatch(form))
  form.resourceVersion = detail?.version?.resourceVersion ?? form.resourceVersion
  detail = await replaceScenarioIndicators(form.versionId, { resourceVersion: form.resourceVersion, indicators })
  applyDetail(detail)
}
async function saveAll() {
  if (!capabilities.value.canEdit || saving.value || publishing.value) return
  saving.value = true
  try {
    await persistDraft()
    ElMessage.success('场景草稿已保存')
  } catch (error) { await handleError(error) } finally { saving.value = false }
}
async function publish() {
  if (!capabilities.value.canPublish || publishing.value || saving.value) return
  publishing.value = true
  try {
    await persistDraft()
    // The backend requires a fresh validation for the version being published.
    const check = await validateScenarioVersion(form.versionId)
    form.resourceVersion = check?.resourceVersion ?? form.resourceVersion
    if (check?.valid !== true) {
      const issue = (check?.diagnostics || []).find(item => String(item.severity || item.level).toUpperCase() === 'ERROR')
        || check?.diagnostics?.[0]
      throw new Error(issue?.message ? `场景暂不能发布：${issue.message}` : '场景暂不能发布，请检查基本信息和关联指标。')
    }
    const result = await publishScenarioVersion(form.versionId, form.resourceVersion, `scenario-publish-${form.versionId}-${form.resourceVersion}`)
    applyDetail(result)
    ElMessage.success('场景版本已发布')
  } catch (error) { await handleError(error) } finally { publishing.value = false }
}
async function handleError(error) { if (error?.status === 409) { await ElMessageBox.confirm('服务端版本已变化，是否重新加载最新版本？', '版本冲突', { type: 'warning' }).then(() => load()).catch(() => {}) } else { ElMessage.error(error?.message || '操作失败') } }
function applyEntryContext() {
  if (['indicators', 'overrides'].includes(route.query.tab)) activeTab.value = 'indicators'
  const id = normalizeResourceId(route.query.indicatorVersionId)
  if (route.query.linkIndicator !== '1' || !editable.value || !id) return
  if (form.indicators.some(item => normalizeResourceId(item.indicatorVersionId) === id)) return
  const option = availableIndicatorOptions.value.find(item => optionVersionId(item) === id)
  if (!option) {
    ElMessage.warning('该指标版本尚未发布，无法关联到场景')
    return
  }
  form.indicators.push(toIndicatorBinding(option, form.indicators.length))
}
watch(() => [route.params.scenarioId, route.query.versionId], load, { immediate: true })
watch(() => [route.query.tab, route.query.indicatorVersionId, route.query.linkIndicator], applyEntryContext)
onBeforeUnmount(() => { loadRevision++ })
</script>

<style scoped>
.scenario-editor { min-width: 0; }
.page-notice { margin-bottom: 16px; }
.scenario-tabs { min-width: 0; }
.scenario-tabs :deep(.el-tabs__content) { padding: 20px; }
.basic-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; }
.basic-form :deep(.el-form-item) { min-width: 0; margin-bottom: 18px; }
.basic-form :deep(.el-form-item__label) { margin-bottom: 7px; }
.basic-form :deep(.el-input), .basic-form :deep(.el-select), .basic-form :deep(.el-date-editor) { width: 100%; min-width: 0; }
.form-item-wide { grid-column: 1 / -1; }
.basic-form .form-item-wide { margin-bottom: 0; }
.indicator-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px 24px; margin-bottom: 18px; }
.indicator-heading h2 { margin: 0; color: var(--idmp-text-primary); font-size: 16px; }
.indicator-heading h2 span { margin-left: 6px; color: var(--idmp-text-helper); font-size: 13px; font-weight: 400; }
.indicator-heading p { margin: 5px 0 0; color: var(--idmp-text-helper); font-size: 12px; }
.indicator-add { display: flex; flex: 1; justify-content: flex-end; gap: 10px; min-width: 0; max-width: 630px; }
.indicator-add :deep(.el-select) { flex: 1; min-width: 240px; }
.indicator-name { font-weight: 500; overflow-wrap: anywhere; }
.indicator-code { display: block; margin-top: 3px; color: var(--idmp-text-helper); font-size: 12px; overflow-wrap: anywhere; }
.report-text { line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .indicator-add { flex-basis: 100%; max-width: none; } }
@media (max-width: 640px) {
  .scenario-tabs :deep(.el-tabs__content) { padding: 14px; }
  .basic-form { grid-template-columns: minmax(0, 1fr); }
  .indicator-add { flex-wrap: wrap; justify-content: flex-start; }
  .indicator-add :deep(.el-select) { min-width: 0; flex-basis: 100%; }
}
</style>
