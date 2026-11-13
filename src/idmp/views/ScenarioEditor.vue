<template>
  <div class="idmp-page scenario-editor">
    <div v-if="loading" class="scenario-loading" role="status" aria-live="polite">正在加载场景…</div>
    <section v-else-if="loadError" role="alert">
      <el-alert :title="loadError" type="error" :closable="false" show-icon />
      <el-button @click="load">重新加载</el-button>
      <el-button @click="router.push({ name: 'ScenarioList' })">返回目录</el-button>
    </section>
    <template v-else>
    <PageHeader :title="form.name || '场景编辑'" :status="form.publicationStatus" :status-label="publicationStatusLabel(form.publicationStatus)">
      <template #meta><span>当前版本：V{{ form.versionNo }}</span></template>
      <template #actions>
        <el-button @click="router.push({ name: 'ScenarioList' })">返回目录</el-button>
        <el-button v-if="capabilities.canStartEdit" type="primary" :loading="startingEdit" @click="startEditing">修改场景</el-button>
        <el-button v-if="capabilities.canEdit" type="primary" :loading="saving" :disabled="publishing" @click="saveAll">保存草稿</el-button>
        <el-button v-if="capabilities.canPublish" type="success" :loading="publishing" :disabled="saving || !comparisonReady" @click="reviewPublish">发布变更</el-button>
      </template>
    </PageHeader>
    <el-alert v-if="readOnlyMessage" :title="readOnlyMessage" :type="form.publicationStatus === 'UNKNOWN' ? 'warning' : 'info'" show-icon :closable="false" class="page-notice" />

    <section v-if="capabilities.canEdit" class="scenario-change-summary" aria-label="待发布变更">
      <div><strong>待发布变更</strong><p v-if="comparisonReady">本次将加入 {{ associationChanges.added.length }} 个指标、移出 {{ associationChanges.removed.length }} 个指标，调整 {{ associationChanges.changed.length }} 项关联设置。</p><p v-else>{{ comparisonError || '正在核对当前正式配置…' }}</p></div>
      <el-tag type="warning" effect="plain">发布后生效</el-tag>
    </section>
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
          <div><h2>已关联指标 <span>{{ boundIndicators.length }}</span></h2><p>维护指标版本和上报要求。</p></div>
          <div v-if="capabilities.canEdit" class="indicator-add">
            <IndicatorVersionPicker v-model="pendingIndicatorId" :options="availableIndicatorOptions" :disabled="!editable" label="待添加指标" />
            <el-button type="primary" plain :disabled="!editable || !pendingIndicatorId" @click="addIndicator">添加指标</el-button>
          </div>
        </div>
        <el-table :data="boundIndicators" row-key="indicatorVersionId" table-layout="fixed" max-height="420" :empty-text="capabilities.canEdit ? '暂未关联指标，请选择已发布指标版本后添加。' : '当前场景暂无关联指标'">
          <el-table-column label="指标名称" min-width="220"><template #default="{ row }"><span class="indicator-name">{{ row.indicatorName || '未命名指标' }}</span></template></el-table-column>
          <el-table-column label="版本" width="100"><template #default="{ row }"><span>{{ row.indicatorVersionNo ? `V${row.indicatorVersionNo}` : '版本号未提供' }}</span></template></el-table-column>
          <el-table-column v-if="capabilities.canEdit && comparisonReady" label="本次变更" width="100"><template #default="{ row }"><el-tag v-if="associationChanges.added.some(item => item.indicatorVersionId === row.indicatorVersionId)" size="small" type="warning">待加入</el-tag><span v-else>保留</span></template></el-table-column>
          <el-table-column label="上报要求" min-width="240"><template #default="{ row }"><el-input v-if="capabilities.canEdit" v-model="row.reportRequirementText" :disabled="!editable" placeholder="填写上报要求（可选）" /><span v-else class="report-text">{{ row.reportRequirementText || '—' }}</span></template></el-table-column>
          <el-table-column label="操作" :width="capabilities.canEdit ? 140 : 80" fixed="right"><template #default="{ row }"><el-button link type="primary" :loading="openingIndicatorId === row.indicatorVersionId" @click="openIndicator(row)">查看</el-button><el-button v-if="capabilities.canEdit" link type="danger" :disabled="!editable" :aria-label="`移除${row.indicatorName || '未命名指标'}`" @click="removeIndicator(row.indicatorVersionId)">移出</el-button></template></el-table-column>
        </el-table>
        <div v-if="capabilities.canEdit && associationChanges.removed.length" class="pending-removals">
          <h3>待移出的指标</h3>
          <div v-for="row in associationChanges.removed" :key="row.indicatorVersionId"><span>{{ row.indicatorName || row.indicatorCode || '指标' }} · {{ row.indicatorVersionNo ? `V${row.indicatorVersionNo}` : row.indicatorVersionId }}</span><el-button link type="primary" :disabled="!editable" @click="restoreRemoved(row)">撤销移出</el-button></div>
        </div>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="publishReviewOpen" title="发布场景变更" width="min(640px, calc(100vw - 24px))" :close-on-click-modal="!publishing" :close-on-press-escape="!publishing" :show-close="!publishing">
      <p>请核对「{{ form.name }}」的完整变更。确认发布后，新的场景配置正式生效，历史版本及计算结果保留。</p>
      <div class="publish-review-counts"><span>加入 {{ associationChanges.added.length }} 项</span><span>移出 {{ associationChanges.removed.length }} 项</span><span>关联设置调整 {{ associationChanges.changed.length }} 项</span></div>
      <div v-if="associationChanges.added.length" class="review-group"><h3>加入的指标</h3><p v-for="row in associationChanges.added" :key="row.indicatorVersionId">{{ row.indicatorName || row.indicatorCode || '指标' }} · {{ row.indicatorVersionNo ? `V${row.indicatorVersionNo}` : row.indicatorVersionId }}</p></div>
      <div v-if="associationChanges.removed.length" class="review-group"><h3>移出的指标</h3><p v-for="row in associationChanges.removed" :key="row.indicatorVersionId">{{ row.indicatorName || row.indicatorCode || '指标' }} · {{ row.indicatorVersionNo ? `V${row.indicatorVersionNo}` : row.indicatorVersionId }}</p></div>
      <el-alert title="本次发布包含此场景全部已保存和当前页面的修改，也可能包含其他人员保存的变更。请一并确认。" type="info" :closable="false" />
      <template #footer><el-button :disabled="publishing" @click="publishReviewOpen = false">返回核对</el-button><el-button type="primary" :loading="publishing" :disabled="publishing || saving" @click="publish">确认发布</el-button></template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup>
import { compareScenarioBindings } from '@/idmp/features/indicator/scenarioAssociations.js'
import IndicatorVersionPicker from '@/idmp/components/IndicatorVersionPicker.vue'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { toUserMessage } from '@/idmp/utils/userMessage.js'
import { fetchIndicatorVersion, fetchAllIndicatorVersions } from '@/idmp/api/modules/indicators'
import { createScenarioVersion, fetchScenarioVersion, fetchScenarioVersions, publishScenarioVersion, replaceScenarioIndicators, updateScenarioVersion, validateScenarioVersion } from '@/idmp/api/modules/scenarios'
import { normalizeResourceId, PERIOD_TYPES, publicationStatusLabel, SCENARIO_TYPES, scenarioDetailToForm, scenarioFormToPatch, scenarioVersionCapabilities, toIndicatorBinding } from '@/idmp/api/adapters/scenario'

const route = useRoute()
const router = useRouter()
const activeTab = ref('basic')
const saving = ref(false)
const publishing = ref(false)
const startingEdit = ref(false)
const loading = ref(true)
const loadError = ref('')
const indicatorOptions = ref([])
const pendingIndicatorId = ref('')
const openingIndicatorId = ref('')
const publishedBindings = ref([]), comparisonReady = ref(false), comparisonError = ref(''), publishReviewOpen = ref(false)
let reviewedSignature = ''
const associationChanges = computed(() => compareScenarioBindings(form.indicators, publishedBindings.value))
function publicationSignature() { return JSON.stringify([form.versionId, form.resourceVersion, scenarioFormToPatch(form), form.indicators]) }
function reviewPublish() {
  if (!capabilities.value.canPublish || !comparisonReady.value || saving.value || publishing.value) return
  if (!form.indicators.length) { ElMessage.warning('当前服务不支持发布空场景，请保留至少一个指标。'); return }
  reviewedSignature = publicationSignature()
  publishReviewOpen.value = true
}
function restoreRemoved(row) {
  if (!editable.value || form.indicators.some(item => item.indicatorVersionId === row.indicatorVersionId)) return
  form.indicators.push({ ...row })
}
let loadRevision = 0
const form = reactive({ scenarioId: '', versionId: '', name: '', type: 'CUSTOM', description: '', governingOrgName: '', defaultPeriodType: 'MONTHLY', defaultParameters: {}, defaultDataSourcePriority: {}, displayText: '', effectiveStartDate: '', effectiveEndDate: '', effectiveRange: [], resourceVersion: 0, publicationStatus: 'UNKNOWN', versionNo: '-', indicators: [] })
const capabilities = computed(() => scenarioVersionCapabilities(form.publicationStatus))
const editable = computed(() => !loading.value && !loadError.value && capabilities.value.canEdit && !saving.value && !publishing.value)
const readOnlyMessage = computed(() => ({
  PUBLISHED: '当前为已发布版本，可以查看全部配置；如需修改，请点击“修改场景”。',
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
  if (form.indicators.length <= 1) { ElMessage.warning('这是最后一个指标。当前服务暂不支持清空或自动停用场景，请先加入其他指标。'); return }
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
  if (next.publicationStatus === 'PUBLISHED') { publishedBindings.value = next.indicators.map(row => ({ ...row })); comparisonReady.value = true }
  Object.assign(form, next, { effectiveRange: next.effectiveStartDate && next.effectiveEndDate ? [next.effectiveStartDate, next.effectiveEndDate] : [] })
  pendingIndicatorId.value = ''
}
async function load() {
  const request = ++loadRevision
  loading.value = true
  loadError.value = ''
  publishReviewOpen.value = false
  publishedBindings.value = []; comparisonReady.value = false; comparisonError.value = ''
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
    if (!versionId) throw new Error('该场景暂无可查看的版本。')
    if (versionId) {
      const detail = await fetchScenarioVersion(versionId)
      if (request !== loadRevision) return
      applyDetail(detail)
      try {
        const publishedId = detail?.scenario?.currentPublishedVersionId
        if (publishedId && String(publishedId) !== String(detail.version.id)) {
          const baseline = await fetchScenarioVersion(publishedId)
          if (request !== loadRevision) return
          if (String(baseline.version?.scenarioId || detail.scenario.id) !== String(detail.scenario.id)
            || String(baseline.version?.publicationStatus || baseline.version?.status) !== 'PUBLISHED') throw new Error('发布配置不匹配')
          publishedBindings.value = (baseline.version.indicators || []).map(row => ({ ...row }))
        }
        comparisonReady.value = true
      } catch { comparisonReady.value = false; comparisonError.value = '无法核对已发布配置，暂不能发布，请刷新后重试。' }
      loading.value = false
      applyEntryContext()
    }
  } catch (error) { if (request === loadRevision) loadError.value = toUserMessage(error, '场景加载失败，请重试。') }
  finally { if (request === loadRevision) loading.value = false }
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
  if (!capabilities.value.canPublish || !comparisonReady.value || publishing.value || saving.value) return
  if (publishReviewOpen.value && reviewedSignature !== publicationSignature()) { publishReviewOpen.value = false; ElMessage.warning('页面配置已变化，请重新核对发布变更。'); return }
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
    publishReviewOpen.value = false
    ElMessage.success('场景变更已发布，正式配置已生效')
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
.scenario-change-summary { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 20px; margin-bottom:16px; border:1px solid var(--idmp-border-subtle); background:var(--idmp-layer-01); }
.scenario-change-summary p { margin:6px 0 0; color:var(--idmp-text-helper); font-size:13px; line-height:1.7; }
.pending-removals { margin-top:20px; padding:16px; background:var(--idmp-layer-02); }
.pending-removals h3, .review-group h3 { margin:0 0 10px; font-size:14px; }
.pending-removals > div { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 0; font-size:13px; }
.publish-review-counts { display:flex; flex-wrap:wrap; gap:16px; padding:16px 0; color:var(--idmp-text-secondary); }
.review-group { margin:16px 0; }
.review-group p { font-size:13px; overflow-wrap:anywhere; }
.scenario-loading { padding: 32px 0; color: var(--idmp-text-helper); }
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
.indicator-add > .indicator-version-picker { flex: 1; min-width: 0; }
.indicator-name { font-weight: 500; overflow-wrap: anywhere; }
.indicator-code { display: block; margin-top: 3px; color: var(--idmp-text-helper); font-size: 12px; overflow-wrap: anywhere; }
.report-text { line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 900px) { .indicator-add { flex-basis: 100%; max-width: none; } }
@media (max-width: 640px) {
  .scenario-tabs :deep(.el-tabs__content) { padding: 14px; }
  .basic-form { grid-template-columns: minmax(0, 1fr); }
  .indicator-add { flex-wrap: wrap; justify-content: flex-start; }
}
</style>
