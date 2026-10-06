<template>
  <div class="idmp-page policy-page">
    <PageHeader title="政策文件" description="" />
    <form class="policy-filters" @submit.prevent="search">
      <el-input v-model.trim="filters.name" clearable placeholder="政策文件名称" aria-label="政策文件名称" />
      <el-select v-model="filters.status" clearable placeholder="全部状态" aria-label="发布状态"><el-option label="草稿" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" /></el-select>
      <el-button native-type="submit" :icon="Search">查询</el-button>
      <el-button :icon="Refresh" @click="reset">重置</el-button>
      <el-button type="primary" :icon="Upload" @click="newPolicy">新建政策文件</el-button>
    </form>
    <el-alert v-if="listError" :title="listError" type="error" :closable="false" show-icon />
    <el-table v-loading="loading" :data="rows" empty-text="暂无政策文件" @row-dblclick="openDetail">
      <el-table-column prop="name" label="文件名称" min-width="220" />
      <el-table-column prop="code" label="编码" min-width="140" />
      <el-table-column prop="issuingOrganization" label="发布机构" min-width="140" />
      <el-table-column prop="documentNumber" label="文号" min-width="160" />
      <el-table-column label="发布状态" width="100"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
      <el-table-column label="操作" width="140"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看</el-button><el-button link @click="editPolicy(row)">编辑</el-button></template></el-table-column>
    </el-table>
    <el-pagination v-model:current-page="page" :page-size="20" :total="Number(total)" layout="total, prev, pager, next" @current-change="load" />

    <el-dialog v-model="metadataVisible" :title="metadata.id ? '编辑政策信息' : '新建政策文件'" width="min(620px, 94vw)" :close-on-click-modal="!saving">
      <el-form label-position="top" @submit.prevent="saveMetadata">
        <el-form-item label="文件名称" required><el-input v-model.trim="metadata.name" maxlength="300" /></el-form-item>
        <el-form-item label="编码" required><el-input v-model.trim="metadata.code" :disabled="Boolean(metadata.id)" maxlength="64" /></el-form-item>
        <el-form-item label="类别" required><el-select v-model="metadata.category"><el-option label="医疗质量" value="QUALITY" /><el-option label="绩效考核" value="PERFORMANCE" /><el-option label="其他" value="OTHER" /></el-select></el-form-item>
        <el-form-item label="发布机构"><el-input v-model.trim="metadata.issuingOrganization" maxlength="200" /></el-form-item>
        <el-form-item label="文号"><el-input v-model.trim="metadata.documentNumber" maxlength="100" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="metadata.description" type="textarea" maxlength="10000" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="metadataVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveMetadata">保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detail?.policyFile?.name || '政策文件详情'" size="min(900px, 96vw)">
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="2" border><el-descriptions-item label="编码">{{ detail.policyFile.code }}</el-descriptions-item><el-descriptions-item label="发布机构">{{ detail.policyFile.issuingOrganization || '-' }}</el-descriptions-item><el-descriptions-item label="文号">{{ detail.policyFile.documentNumber || '-' }}</el-descriptions-item><el-descriptions-item label="说明">{{ detail.policyFile.description || '-' }}</el-descriptions-item></el-descriptions>
          <div class="section-toolbar"><h3>文件版本</h3><el-button type="primary" :icon="Upload" :disabled="uploading || saving" @click="newVersion">上传新版本</el-button></div>
          <el-table :data="detail.versions" empty-text="尚未上传文件版本">
            <el-table-column prop="versionNo" label="版本" width="70" />
            <el-table-column prop="issueDate" label="发布日期" width="110" />
            <el-table-column label="状态" width="95"><template #default="{ row }"><StatusBadge :status="row.publicationStatus" /></template></el-table-column>
            <el-table-column label="操作" min-width="245"><template #default="{ row }">
              <el-button link type="primary" @click="viewerId = String(row.id)">查看文件</el-button>
              <el-button v-if="row.publicationStatus === 'DRAFT'" link @click="editVersion(row)">编辑</el-button>
              <el-button v-if="row.publicationStatus === 'DRAFT'" link type="primary" :disabled="saving" @click="publish(row)">发布</el-button>
              <el-button v-if="row.publicationStatus !== 'ARCHIVED' && String(row.id) !== String(detail.policyFile.currentPublishedVersionId)" link type="danger" :disabled="saving" @click="archive(row)">归档</el-button>
            </template></el-table-column>
          </el-table>
          <div class="section-toolbar"><h3>政策文件关系</h3></div>
          <el-select v-model="relationVersionId" placeholder="选择本文件版本" @change="loadRelations"><el-option v-for="v in detail.versions" :key="v.id" :value="String(v.id)" :label="`版本 ${v.versionNo}`" /></el-select>
          <el-table :data="relations" empty-text="暂无文件关系"><el-table-column label="源版本" min-width="140"><template #default="{ row }">{{ row.sourceName || row.sourceVersionId }}</template></el-table-column><el-table-column label="目标版本" min-width="140"><template #default="{ row }">{{ row.targetName || row.targetVersionId }}</template></el-table-column><el-table-column label="关系" width="90"><template #default="{ row }">{{ relationLabels[row.relationType] || row.relationType }}</template></el-table-column><el-table-column prop="description" label="说明" min-width="140" /></el-table>
          <form v-if="relationVersionId" class="relation-form" @submit.prevent="saveRelation">
            <PolicyVersionPicker v-model="relation.targetVersionId" />
            <el-select v-model="relation.relationType"><el-option v-for="(label, key) in relationLabels" :key="key" :value="key" :label="label" /></el-select>
            <el-input v-model.trim="relation.description" placeholder="关系说明" maxlength="10000" />
            <el-button type="primary" native-type="submit" :loading="saving">关联</el-button>
          </form>
        </template>
      </div>
    </el-drawer>

    <el-dialog v-model="versionVisible" class="policy-version-dialog" :title="versionForm.id ? '编辑草稿版本' : '上传文件版本'" width="min(660px, 94vw)" :close-on-click-modal="!uploading && !saving" :close-on-press-escape="!uploading && !saving" :before-close="closeVersion">
      <div class="version-context"><span>政策文件</span><strong>{{ detail?.policyFile?.name }}</strong><StatusBadge status="DRAFT" /></div>
      <el-form class="version-form" label-position="top" :disabled="uploading || saving" @submit.prevent="saveVersion">
        <el-form-item label="版本文件" required class="version-file-field">
          <input ref="fileInput" class="version-file-input" type="file" :accept="accept" :disabled="uploading || saving" aria-label="选择政策版本文件" @change="selectFile" />
          <div class="version-upload" :class="{ 'is-dragging': dragging, 'has-file': selectedFile || uploaded, 'has-error': uploadError }" :aria-busy="uploading" @dragover.prevent="dragging = !uploading && !saving" @dragleave.prevent="dragging = false" @drop.prevent="dropFile">
            <template v-if="selectedFile || uploaded">
              <div class="version-file-row">
                <el-icon class="version-file-icon"><Document /></el-icon>
                <div class="version-file-info"><strong>{{ selectedFile?.name || uploaded.originalName }}</strong><span>{{ formatFileSize(selectedFile?.size ?? uploaded?.fileSizeBytes) }}</span></div>
                <el-button :icon="Upload" :disabled="uploading || saving" @click="fileInput?.click()">更换文件</el-button>
              </div>
              <div class="version-upload-state" :class="{ 'is-success': uploaded && !uploading, 'is-error': uploadError }" role="status" aria-live="polite">
                <el-icon v-if="uploadError"><WarningFilled /></el-icon><el-icon v-else-if="uploaded && !uploading"><CircleCheckFilled /></el-icon>
                <span>{{ uploadError || uploadState || '文件已上传' }}</span>
                <el-button v-if="uploadError && selectedFile" :icon="Refresh" link type="primary" :disabled="uploading || saving" @click="uploadSelectedFile(selectedFile)">重试</el-button>
              </div>
              <el-progress v-if="uploading" :percentage="100" :indeterminate="true" :show-text="false" :stroke-width="3" />
            </template>
            <template v-else>
              <el-icon class="version-upload-icon"><UploadFilled /></el-icon>
              <el-button :icon="Upload" :disabled="uploading || saving" @click="fileInput?.click()">选择文件</el-button>
              <span class="version-upload-label">或将文件拖到此处</span>
            </template>
          </div>
          <div class="version-upload-limit">{{ uploadFormatLabel }}<span v-if="uploadLimits"> · 最大 {{ formatFileSize(uploadLimits.maxBytes) }}</span></div>
        </el-form-item>
        <div class="version-date-heading">版本日期</div>
        <el-form-item label="发布日期" required><el-date-picker v-model="versionForm.issueDate" type="date" placeholder="选择发布日期" value-format="YYYY-MM-DD" aria-label="发布日期" /></el-form-item>
        <div class="date-row"><el-form-item label="生效日期"><el-date-picker v-model="versionForm.effectiveStartDate" type="date" placeholder="未指定" value-format="YYYY-MM-DD" aria-label="生效日期" /></el-form-item><el-form-item label="失效日期"><el-date-picker v-model="versionForm.effectiveEndDate" type="date" placeholder="未指定" value-format="YYYY-MM-DD" aria-label="失效日期" /></el-form-item></div>
      </el-form>
      <template #footer><el-button :disabled="uploading || saving" @click="cancelVersion">取消</el-button><el-button type="primary" :disabled="uploading || !uploaded || !versionForm.issueDate" :loading="saving" @click="saveVersion">保存草稿</el-button></template>
    </el-dialog>
    <PolicyFileViewer :version-id="viewerId" @close="viewerId = ''" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, reactive } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheckFilled, Document, Search, Refresh, Upload, UploadFilled, WarningFilled } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import PolicyFileViewer from '@/idmp/components/PolicyFileViewer.vue'
import PolicyVersionPicker from '@/idmp/components/PolicyVersionPicker.vue'
import * as api from '@/idmp/api/modules/policies'
const route = useRoute()
const rows = ref([]), total = ref(0), page = ref(1), loading = ref(false), listError = ref('')
const filters = reactive({ name: '', status: '' })
const metadataVisible = ref(false), saving = ref(false), metadata = reactive({})
const detailVisible = ref(false), detailLoading = ref(false), detailError = ref(''), detail = ref(null)
const versionVisible = ref(false), versionForm = reactive({}), uploaded = ref(null), uploading = ref(false), uploadState = ref('')
const fileInput = ref(null), selectedFile = ref(null), uploadError = ref(''), dragging = ref(false), uploadLimits = ref(null)
const uploadFormatLabel = computed(() => (uploadLimits.value?.extensions || ['pdf', 'docx', 'txt']).map(ext => ext.toUpperCase()).join(' / '))
const viewerId = ref(''), accept = ref('.pdf,.docx,.txt'), relationVersionId = ref(''), relations = ref([])
const relation = reactive({ targetVersionId: '', relationType: 'REFERENCES', description: '' })
const relationLabels = { REFERENCES: '引用', REPLACES: '替代', SUPPLEMENTS: '补充', REVISES: '修订' }
let listRevision = 0, detailRevision = 0, relationRevision = 0, versionRevision = 0
async function load() {
  const revision = ++listRevision; loading.value = true; listError.value = ''
  try { const result = await api.fetchPolicies({ ...filters, page: page.value, size: 20 }); if (revision === listRevision) { rows.value = result.records || []; total.value = result.total || 0 } }
  catch (e) { if (revision === listRevision) listError.value = e.message }
  finally { if (revision === listRevision) loading.value = false }
}
function search() { page.value = 1; load() }
function reset() { Object.assign(filters, { name: '', status: '' }); search() }
function newPolicy() { Object.assign(metadata, { id: '', code: '', name: '', category: 'QUALITY', issuingOrganization: '', documentNumber: '', description: '' }); metadataVisible.value = true }
function editPolicy(row) { Object.assign(metadata, row); metadataVisible.value = true }
async function saveMetadata() {
  if (saving.value) return
  if (!metadata.name || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(metadata.code)) return ElMessage.warning('请填写文件名称，编码须以字母开头且仅包含字母、数字和下划线')
  saving.value = true
  try {
    const result = metadata.id ? await api.updatePolicy(metadata.id, metadata) : await api.createPolicy(metadata)
    metadataVisible.value = false; ElMessage.success('政策信息已保存'); await load(); await openDetail(result.policyFile)
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function openDetail(row) {
  const revision = ++detailRevision; detailVisible.value = true; detailLoading.value = true; detailError.value = ''; detail.value = null; relations.value = []; relationVersionId.value = ''; relationRevision++
  try {
    const result = await api.fetchPolicy(row.id)
    if (revision !== detailRevision) return
    detail.value = result; relationVersionId.value = String(result.versions?.[0]?.id || ''); if (relationVersionId.value) await loadRelations()
  } catch (e) { if (revision === detailRevision) detailError.value = e.message }
  finally { if (revision === detailRevision) detailLoading.value = false }
}
function closeVersion(done) { if (!uploading.value && !saving.value) { versionRevision++; dragging.value = false; done() } }
function cancelVersion() { if (!uploading.value && !saving.value) { versionRevision++; dragging.value = false; versionVisible.value = false } }
function newVersion() {
  if (uploading.value || saving.value) return
  versionRevision++; Object.assign(versionForm, { id: '', resourceVersion: 0, issueDate: '', effectiveStartDate: '', effectiveEndDate: '' })
  uploaded.value = null; selectedFile.value = null; uploadState.value = ''; uploadError.value = ''; dragging.value = false; versionVisible.value = true
}
async function editVersion(row) {
  if (uploading.value || saving.value) return
  newVersion(); Object.assign(versionForm, row)
  const revision = versionRevision
  try { if (row.fileObjectId) { const file = await api.fetchPolicyFile(row.fileObjectId); if (revision === versionRevision && versionVisible.value) uploaded.value = file } }
  catch (e) { if (revision === versionRevision && versionVisible.value) ElMessage.error(e.message) }
}
async function selectFile(event) {
  const file = event.target.files?.[0]; if (!file) return
  try { await uploadSelectedFile(file) } finally { event.target.value = '' }
}
function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes)) || bytes == null) return '-'
  if (bytes >= 1024 * 1024) return `${Number((bytes / 1024 / 1024).toFixed(2))} MB`
  return `${Number((bytes / 1024).toFixed(1))} KB`
}
async function dropFile(event) {
  dragging.value = false
  if (uploading.value || saving.value) return
  if (event.dataTransfer?.files?.length !== 1) return ElMessage.warning('每个版本请选择一个文件')
  await uploadSelectedFile(event.dataTransfer.files[0])
}
async function uploadSelectedFile(file) {
  if (uploading.value || saving.value) return
  const revision = ++versionRevision
  selectedFile.value = file; uploadError.value = ''; uploadState.value = '正在校验文件'
  uploading.value = true; uploaded.value = null
  try {
    const result = await api.uploadPolicyFile(file, state => { if (revision === versionRevision) uploadState.value = state })
    if (revision !== versionRevision || !versionVisible.value) return
    uploaded.value = result.file; uploadState.value = result.instantUpload ? '秒传完成' : '上传完成'
  } catch (e) { if (revision === versionRevision) { uploadState.value = ''; uploadError.value = e.message || '上传失败，请重试' } }
  finally { if (revision === versionRevision) uploading.value = false }
}
async function saveVersion() {
  if (saving.value || uploading.value) return
  if (!uploaded.value || !versionForm.issueDate) return ElMessage.warning('请选择文件并填写发布日期')
  if (versionForm.effectiveStartDate && versionForm.effectiveEndDate && versionForm.effectiveEndDate < versionForm.effectiveStartDate) return ElMessage.warning('失效日期不能早于生效日期')
  saving.value = true
  try {
    const body = { resourceVersion: versionForm.resourceVersion, issueDate: versionForm.issueDate, effectiveStartDate: versionForm.effectiveStartDate || null, effectiveEndDate: versionForm.effectiveEndDate || null, fileObjectId: String(uploaded.value.id), contentHash: uploaded.value.sha256 }
    const result = versionForm.id ? await api.updatePolicyVersion(versionForm.id, body) : await api.createPolicyVersion(detail.value.policyFile.id, body)
    detail.value = result; versionVisible.value = false; ElMessage.success('草稿版本已保存'); await load()
  } catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function publish(row) {
  try { await ElMessageBox.confirm(`发布版本 ${row.versionNo}？发布后文件与日期不可修改。`, '发布政策文件', { type: 'warning' }) }
  catch { return }
  saving.value = true
  try { detail.value = await api.publishPolicyVersion(detail.value.policyFile.id, row); await load(); ElMessage.success('政策文件版本已发布') }
  catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function archive(row) {
  try { await ElMessageBox.confirm(`归档版本 ${row.versionNo}？`, '归档政策版本', { type: 'warning' }) } catch { return }
  saving.value = true
  try { detail.value = await api.archivePolicyVersion(row); await loadRelations(); ElMessage.success('政策版本已归档') }
  catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
async function loadRelations() {
  const current = ++relationRevision; relations.value = []
  try {
    const result = await api.fetchPolicyRelations(relationVersionId.value)
    const ids = [...new Set(result.flatMap(row => [String(row.sourceVersionId), String(row.targetVersionId)]))]
    const labels = new Map(await Promise.all(ids.map(async id => { const v = await api.fetchPolicyVersion(id); const p = await api.fetchPolicy(v.policyFileId); return [id, `${p.policyFile.name} · ${v.versionNo}`] })))
    if (current === relationRevision) relations.value = result.map(row => ({ ...row, sourceName: labels.get(String(row.sourceVersionId)), targetName: labels.get(String(row.targetVersionId)) }))
  } catch (e) { if (current === relationRevision) ElMessage.error(e.message) }
}
async function saveRelation() {
  if (saving.value) return
  if (!relation.targetVersionId) return ElMessage.warning('请选择目标政策版本')
  saving.value = true
  try { await api.createPolicyRelation(relationVersionId.value, relation); relation.targetVersionId = ''; relation.description = ''; await loadRelations(); ElMessage.success('政策文件已关联') }
  catch (e) { ElMessage.error(e.message) } finally { saving.value = false }
}
onMounted(async () => {
  load()
  try { const options = await api.fetchPolicyUploadOptions(); uploadLimits.value = options; accept.value = options.extensions.map(ext => `.${ext}`).join(',') } catch (e) { ElMessage.error(e.message) }
  if (route.query.id) openDetail({ id: route.query.id })
})
</script>
<style scoped>
.policy-page { display: flex; flex-direction: column; gap: 20px; }
.policy-filters { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.policy-filters .el-input { width: 260px; }
.policy-filters .el-select { width: 150px; }
.policy-filters .el-button:last-child { margin-left: auto; }
.section-toolbar { display: flex; justify-content: space-between; align-items: center; margin: 24px 0 12px; }
.section-toolbar h3 { font-size: 16px; margin: 0; }
.relation-form { display: grid; grid-template-columns: minmax(200px, 2fr) minmax(100px, 1fr); gap: 12px; margin-top: 16px; }
.version-context { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding-bottom: 18px; border-bottom: 1px solid var(--idmp-border-subtle, #e5e7eb); }
.version-context > span { color: var(--idmp-text-secondary, #606266); font-size: 13px; }
.version-context strong { flex: 1; min-width: 120px; overflow-wrap: anywhere; font-size: 14px; font-weight: 600; }
.version-form { margin-top: 20px; }
.version-file-input { display: none; }
.version-upload { width: 100%; min-height: 158px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; border: 1px dashed var(--idmp-border-strong, #b8c2ce); border-radius: 6px; background: var(--idmp-layer-01, #f8fafb); transition: border-color .15s, background .15s; }
.version-upload.is-dragging { border-color: var(--idmp-interactive, #409eff); background: var(--el-color-primary-light-9); }
.version-upload.has-file { align-items: stretch; min-height: 126px; border-style: solid; }
.version-upload.has-error { border-color: var(--el-color-danger-light-5); }
.version-upload-icon { font-size: 30px; color: var(--idmp-text-secondary, #606266); }
.version-upload-label, .version-upload-limit { color: var(--idmp-text-secondary, #606266); font-size: 12px; line-height: 20px; }
.version-upload-limit { width: 100%; margin-top: 6px; }
.version-file-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.version-file-icon { flex-shrink: 0; font-size: 26px; color: var(--idmp-interactive, #409eff); }
.version-file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.version-file-info strong { overflow-wrap: anywhere; line-height: 22px; font-size: 14px; font-weight: 600; }
.version-file-info > span { font-size: 12px; line-height: 18px; color: var(--idmp-text-secondary, #606266); }
.version-file-row .el-button { flex-shrink: 0; }
.version-upload-state { display: flex; align-items: flex-start; gap: 6px; font-size: 13px; line-height: 20px; }
.version-upload-state > span { min-width: 0; overflow-wrap: anywhere; }
.version-upload-state > .el-icon { margin-top: 3px; flex-shrink: 0; }
.version-upload-state.is-success { color: var(--el-color-success-dark-2); }
.version-upload-state.is-error { color: var(--el-color-danger); }
.version-upload-state .el-button { margin-left: auto; flex-shrink: 0; }
.version-date-heading { margin: 22px 0 16px; padding-top: 18px; border-top: 1px solid var(--idmp-border-subtle, #e5e7eb); font-size: 14px; font-weight: 600; }
.version-form :deep(.el-date-editor.el-input) { width: 100%; }
.date-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 420px) {
  .date-row { grid-template-columns: 1fr; gap: 0; }
  .version-upload { padding: 14px; }
  .version-file-row { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: start; }
  .version-file-row .el-button { grid-column: 2; justify-self: start; margin-left: 0; }
  :global(.policy-version-dialog) { margin-top: 16px; margin-bottom: 16px; max-height: calc(100dvh - 32px); overflow-y: auto; }
}
@media (max-width: 600px) { .relation-form { grid-template-columns: 1fr; } .policy-filters .el-input { width: 100%; } }
</style>
