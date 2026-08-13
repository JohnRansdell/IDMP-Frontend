<template>
  <div class="idmp-page scenario-editor">
    <PageHeader :title="form.name || '场景编辑'" :status="form.publicationStatus" :status-label="publicationStatusLabel(form.publicationStatus)">
      <template #meta><span class="mono-data">{{ form.code || '新建场景' }}</span><span>版本 {{ form.versionNo }}</span><span>资源版本 {{ form.resourceVersion }}</span></template>
      <template #actions><el-button @click="router.push({ name: 'ScenarioList' })">返回目录</el-button><el-button v-if="capabilities.canStartEdit" type="primary" :loading="startingEdit" @click="startEditing">编辑场景</el-button><el-button v-if="capabilities.canEdit" type="primary" :loading="saving" @click="saveAll">保存草稿</el-button><el-button v-if="capabilities.canValidate" :loading="validating" @click="validate">校验</el-button><el-button v-if="capabilities.canPublish" type="success" :loading="publishing" :disabled="!validationValid" @click="publish">发布</el-button></template>
    </PageHeader>
    <el-alert v-if="readOnlyMessage" :title="readOnlyMessage" :type="form.publicationStatus === 'UNKNOWN' ? 'warning' : 'info'" show-icon :closable="false" class="mb16" />
    <el-alert v-if="validationMessage" :title="validationMessage" :type="validationValid ? 'success' : 'warning'" show-icon :closable="false" class="mb16" />

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="基本信息" name="basic">
        <el-form :model="form" label-width="140px" class="editor-form">
          <el-form-item label="场景编码"><el-input v-model="form.code" disabled /></el-form-item>
          <el-form-item label="场景名称"><el-input v-model.trim="form.name" :disabled="!editable" /></el-form-item>
          <el-form-item label="场景类型"><el-select v-model="form.type" disabled><el-option v-for="item in SCENARIO_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="主管部门"><el-input v-model.trim="form.governingOrgName" :disabled="!editable" /></el-form-item>
          <el-form-item label="默认统计周期"><el-select v-model="form.defaultPeriodType" :disabled="!editable"><el-option v-for="item in PERIOD_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="生效日期"><el-date-picker v-model="form.effectiveRange" type="daterange" value-format="YYYY-MM-DD" :disabled="!editable" /></el-form-item>
          <el-form-item label="场景说明"><el-input v-model="form.description" type="textarea" :rows="4" :disabled="!editable" /></el-form-item>
          <el-form-item label="默认排除规则"><el-input v-model="form.defaultExclusionDisplayText" placeholder="规则说明" :disabled="!editable" /><el-input v-model="form.defaultExclusionDslText" type="textarea" :rows="5" class="json-input" :disabled="!editable" /></el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="关联指标" name="indicators">
        <div class="toolbar"><span>仅允许选择已发布指标版本；保存时提交完整集合。</span><el-select v-model="selectedIndicatorIds" multiple filterable clearable :disabled="!editable" placeholder="选择指标版本" style="width: 440px"><el-option v-for="item in indicatorOptions" :key="item.id" :label="`${item.indicatorCode || item.code} · ${item.indicatorName || item.name} · V${item.versionNo || '-'}`" :value="String(item.id || item.indicatorVersionId || item.versionId)" /></el-select></div>
        <el-table :data="boundIndicators" empty-text="暂未关联指标"><el-table-column prop="indicatorCode" label="指标编码" width="220" /><el-table-column prop="indicatorName" label="指标名称" min-width="240" /><el-table-column prop="indicatorVersionNo" label="版本" width="100" /><el-table-column label="必选" width="90"><template #default="{ row }"><el-switch v-model="row.required" :disabled="!editable" /></template></el-table-column><el-table-column label="上报要求" min-width="240"><template #default="{ row }"><el-input v-model="row.reportRequirementText" :disabled="!editable" /></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="覆盖规则" name="overrides">
        <div class="toolbar"><span>场景级覆盖的指标版本留空；覆盖值必须是合法 JSON。</span><el-button type="primary" plain :disabled="!editable" @click="addOverride">新增覆盖</el-button></div>
        <el-table :data="form.overrides" empty-text="暂无覆盖规则"><el-table-column label="作用范围" min-width="190"><template #default="{ row }"><el-select v-model="row.indicatorVersionId" clearable :disabled="!editable" placeholder="场景全局"><el-option v-for="item in boundIndicators" :key="item.indicatorVersionId" :label="item.indicatorCode || item.indicatorName" :value="String(item.indicatorVersionId)" /></el-select></template></el-table-column><el-table-column label="类型" width="150"><template #default="{ row }"><el-select v-model="row.overrideType" :disabled="!editable"><el-option v-for="item in OVERRIDE_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></template></el-table-column><el-table-column label="目标路径" min-width="210"><template #default="{ row }"><el-input v-model="row.targetNodePath" :disabled="!editable" /></template></el-table-column><el-table-column label="覆盖值" min-width="220"><template #default="{ row }"><el-input v-model="row.overrideValueText" type="textarea" :rows="2" :disabled="!editable" /></template></el-table-column><el-table-column label="优先级" width="100"><template #default="{ row }"><el-input-number v-model="row.priority" :min="0" :disabled="!editable" /></template></el-table-column><el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" :disabled="!editable" @click="form.overrides.splice($index, 1)">删</el-button></template></el-table-column></el-table>
      </el-tab-pane>
      <el-tab-pane label="合并预览" name="preview">
        <div class="toolbar"><span>后端按场景默认值、指标版本和覆盖规则返回最终有效口径。</span><el-button :loading="previewLoading" @click="loadPreview">刷新预览</el-button></div>
        <el-collapse v-if="preview?.indicators?.length"><el-collapse-item v-for="item in preview.indicators" :key="item.indicatorVersionId" :title="`${item.indicatorCode} · ${item.indicatorName}`"><pre>{{ JSON.stringify(item, null, 2) }}</pre></el-collapse-item></el-collapse><el-empty v-else description="暂无合并预览" />
      </el-tab-pane>
      <el-tab-pane label="校验诊断" name="validation"><el-empty v-if="!diagnostics.length" description="尚未产生诊断信息" /><el-alert v-for="(item, index) in diagnostics" :key="index" :title="item.message || item.code || '校验问题'" :type="(item.severity || item.level) === 'ERROR' ? 'error' : 'warning'" show-icon :closable="false" class="diagnostic" /></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { createScenarioVersion, fetchScenarioMergedPreview, fetchScenarioVersion, fetchScenarioVersions, publishScenarioVersion, replaceScenarioIndicators, replaceScenarioOverrides, updateScenarioVersion, validateScenarioVersion } from '@/idmp/api/modules/scenarios'
import { normalizePage, normalizeResourceId, OVERRIDE_TYPES, PERIOD_TYPES, publicationStatusLabel, SCENARIO_TYPES, scenarioDetailToForm, scenarioFormToPatch, scenarioVersionCapabilities, toIndicatorBinding, toOverridePayload } from '@/idmp/api/adapters/scenario'

const route = useRoute()
const router = useRouter()
const activeTab = ref('basic')
const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const startingEdit = ref(false)
const previewLoading = ref(false)
const indicatorOptions = ref([])
const preview = ref(null)
const diagnostics = ref([])
const validationValid = ref(false)
const validationMessage = ref('')
const form = reactive({ scenarioId: '', versionId: '', code: '', name: '', type: 'CUSTOM', description: '', governingOrgName: '', defaultPeriodType: 'MONTHLY', defaultParameters: {}, defaultExclusionDsl: { nodeType: 'TRUE' }, defaultExclusionDisplayText: '', defaultDataSourcePriority: {}, displayText: '', effectiveStartDate: '', effectiveEndDate: '', effectiveRange: [], resourceVersion: 0, publicationStatus: 'UNKNOWN', versionNo: '-', indicators: [], overrides: [], defaultExclusionDslText: '{\n  "nodeType": "TRUE"\n}' })
const capabilities = computed(() => scenarioVersionCapabilities(form.publicationStatus))
const editable = computed(() => capabilities.value.canEdit)
const readOnlyMessage = computed(() => ({
  PUBLISHED: '当前为已发布版本，可以查看全部配置；如需修改，请点击“编辑场景”。',
  ARCHIVED: '当前版本已归档，仅支持查看，不能编辑、校验或发布。',
  UNKNOWN: '服务端未返回可识别的版本状态，为避免误修改，当前仅支持查看。'
}[form.publicationStatus] || ''))
const selectedIndicatorIds = computed({ get: () => form.indicators.map((item) => normalizeResourceId(item.indicatorVersionId)), set: (ids) => { const old = new Map(form.indicators.map((item) => [normalizeResourceId(item.indicatorVersionId), item])); form.indicators = ids.map((id, index) => old.get(normalizeResourceId(id)) || toIndicatorBinding(indicatorOptions.value.find((item) => normalizeResourceId(item.id || item.indicatorVersionId || item.versionId) === normalizeResourceId(id)) || { indicatorVersionId: id }, index)); form.indicators.forEach((item, index) => { item.displayOrder = index }) } })
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
  Object.assign(form, next, { effectiveRange: next.effectiveStartDate && next.effectiveEndDate ? [next.effectiveStartDate, next.effectiveEndDate] : [], defaultExclusionDslText: JSON.stringify(next.defaultExclusionDsl || { nodeType: 'TRUE' }, null, 2) })
  form.overrides = form.overrides.map((item) => ({ ...item, overrideValueText: JSON.stringify(item.overrideValue, null, 2) }))
  validationValid.value = false
  validationMessage.value = ''
}
async function load() {
  try {
    const versions = normalizePage(await fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 200 }))
    indicatorOptions.value = versions.items
    let versionId = route.query.versionId
    if (!versionId && route.params.scenarioId) {
      const list = await fetchScenarioVersions(route.params.scenarioId)
      versionId = (Array.isArray(list) ? list : []).find((item) => item.publicationStatus === 'DRAFT')?.id || list?.[0]?.id
    }
    if (versionId) applyDetail(await fetchScenarioVersion(versionId))
  } catch (error) { ElMessage.error(error?.message || '场景版本加载失败') }
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
    await router.replace({ name: 'ScenarioEditor', params: { scenarioId: form.scenarioId }, query: { versionId: detail?.version?.id } })
  } catch (error) { ElMessage.error(error?.message || '进入场景编辑失败，当前版本仍可继续查看') } finally { startingEdit.value = false }
}
function addOverride() { form.overrides.push({ indicatorVersionId: null, overrideType: 'PARAMETER', targetNodePath: '', overrideValue: '', overrideValueText: '""', displayText: '', priority: 0 }) }
async function ensureDsl() {
  try { form.defaultExclusionDsl = JSON.parse(form.defaultExclusionDslText || '{"nodeType":"TRUE"}') } catch { throw new Error('默认排除规则不是合法 JSON') }
  form.effectiveStartDate = form.effectiveRange?.[0] || ''
  form.effectiveEndDate = form.effectiveRange?.[1] || ''
}
async function saveAll() {
  if (!capabilities.value.canEdit) return
  saving.value = true
  try {
    await ensureDsl()
    const indicators = form.indicators.map(toIndicatorBinding)
    const overrides = form.overrides.map((item) => { try { item.overrideValue = JSON.parse(item.overrideValueText) } catch { throw new Error(`覆盖值不是合法 JSON：${item.targetNodePath || '未命名规则'}`) } return toOverridePayload(item) })
    if (!indicators.length) throw new Error('请至少关联一个已发布指标版本')
    let detail = await updateScenarioVersion(form.versionId, scenarioFormToPatch(form))
    form.resourceVersion = detail?.version?.resourceVersion ?? form.resourceVersion
    detail = await replaceScenarioIndicators(form.versionId, { resourceVersion: form.resourceVersion, indicators })
    form.resourceVersion = detail?.version?.resourceVersion ?? form.resourceVersion
    detail = await replaceScenarioOverrides(form.versionId, { resourceVersion: form.resourceVersion, overrides })
    applyDetail(detail)
    ElMessage.success('场景草稿已保存')
  } catch (error) { await handleError(error) } finally { saving.value = false }
}
async function loadPreview() { previewLoading.value = true; try { preview.value = await fetchScenarioMergedPreview(form.versionId) } catch (error) { ElMessage.error(error?.message || '合并预览失败') } finally { previewLoading.value = false } }
async function validate() { if (!capabilities.value.canValidate) return; validating.value = true; try { const result = await validateScenarioVersion(form.versionId); diagnostics.value = result?.diagnostics || []; validationValid.value = result?.valid === true; form.resourceVersion = result?.resourceVersion ?? form.resourceVersion; validationMessage.value = validationValid.value ? '校验通过，可以发布。' : '校验未通过，请处理诊断信息。'; activeTab.value = 'validation' } catch (error) { await handleError(error) } finally { validating.value = false } }
async function publish() { if (!capabilities.value.canPublish || !validationValid.value) return; publishing.value = true; try { const result = await publishScenarioVersion(form.versionId, form.resourceVersion, `scenario-publish-${form.versionId}-${form.resourceVersion}`); applyDetail(result); ElMessage.success('场景版本已发布') } catch (error) { await handleError(error) } finally { publishing.value = false } }
async function handleError(error) { if (error?.status === 409) { await ElMessageBox.confirm('服务端版本已变化，是否重新加载最新版本？', '版本冲突', { type: 'warning' }).then(() => load()).catch(() => {}) } else { ElMessage.error(error?.message || '操作失败') } }
watch(() => form.indicators, () => { validationValid.value = false }, { deep: true })
onMounted(load)
</script>

<style scoped>
.scenario-editor { min-width: 0; }
.mb16 { margin-bottom: 16px; }
.editor-form { max-width: 900px; padding: 24px 12px; }
.editor-form :deep(.el-input), .editor-form :deep(.el-select), .editor-form :deep(.el-date-editor) { width: 520px; max-width: 100%; }
.json-input { margin-top: 8px; font-family: monospace; }
.toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; color:var(--idmp-text-helper); }
.diagnostic { margin-bottom: 10px; }
pre { margin:0; padding:16px; overflow:auto; background:var(--idmp-layer-02); border-radius:6px; }
</style>
