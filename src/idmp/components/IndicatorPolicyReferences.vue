<template>
  <div class="indicator-policy-references">
    <div class="policy-toolbar">
      <span v-if="versionId" class="mono-data">指标版本：{{ versionId }}</span>
      <el-button :disabled="!versionId || loading || saving" @click="loadReferences">刷新引用</el-button>
    </div>
    <el-alert v-if="!versionId" title="请先创建并发布指标版本，再添加政策依据。" type="info" :closable="false" />
    <el-alert v-else-if="!published" title="当前为未发布版本，可查看已有引用；发布指标版本后才能添加或失效政策引用。" type="info" :closable="false" />
    <template v-if="versionId">
      <StatePanel v-if="loading" type="loading" title="正在读取政策引用" />
      <StatePanel v-else-if="error" type="error" title="政策引用读取失败" :description="error" />
      <el-table v-else :data="references" empty-text="当前指标版本暂无有效政策引用" table-layout="fixed">
        <el-table-column label="政策文件" min-width="200"><template #default="{ row }">{{ row.policyFileName || '未命名政策文件' }}</template></el-table-column>
        <el-table-column prop="policyVersionNo" label="政策版本" width="100" />
        <el-table-column label="引用用途" width="110"><template #default="{ row }">{{ policyReferenceRoleLabel(row.relationRole) }}</template></el-table-column>
        <el-table-column prop="citationLocation" label="出处" min-width="160" show-overflow-tooltip />
        <el-table-column prop="citationText" label="引用原文" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="130"><template #default="{ row }">
          <el-button link type="primary" @click="viewerId = String(row.policyFileVersionId)">查看文件</el-button>
          <el-button v-if="published" link type="danger" :disabled="saving" @click="invalidate(row)">失效</el-button>
        </template></el-table-column>
      </el-table>
      <el-form v-if="published" class="policy-reference-form" label-position="top" :disabled="saving" @submit.prevent="addReference">
        <el-form-item label="已发布政策版本" required><PolicyVersionPicker v-model="form.policyFileVersionId" /></el-form-item>
        <el-form-item label="引用用途"><el-select v-model="form.relationRole"><el-option v-for="role in POLICY_REFERENCE_ROLES" :key="role.value" :value="role.value" :label="role.label" /></el-select></el-form-item>
        <el-form-item label="政策出处"><el-input v-model.trim="form.citationLocation" maxlength="500" placeholder="例如：第三章第十二条（可选）" /></el-form-item>
        <el-form-item label="引用原文"><el-input v-model="form.citationText" type="textarea" :rows="3" maxlength="10000" placeholder="填写支撑指标口径的政策原文（可选）" /></el-form-item>
        <el-button type="primary" :loading="saving" :disabled="!form.policyFileVersionId || saving" @click="addReference">添加政策引用</el-button>
      </el-form>
    </template>
    <PolicyFileViewer :version-id="viewerId" @close="viewerId = ''" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { createPolicyReference, fetchPolicyReferences, invalidatePolicyReference } from '@/idmp/api/modules/mappings'
import { POLICY_REFERENCE_ROLES, policyReferenceRoleLabel } from '@/idmp/api/adapters/mapping'
import PolicyVersionPicker from './PolicyVersionPicker.vue'
import PolicyFileViewer from './PolicyFileViewer.vue'
import StatePanel from './StatePanel.vue'

const props = defineProps({ versionId: { type: String, default: '' }, published: { type: Boolean, default: false } })
const references = ref([]), loading = ref(false), saving = ref(false), error = ref(''), viewerId = ref('')
const emptyForm = () => ({ policyFileVersionId: '', relationRole: 'SOURCE', citationLocation: '', citationText: '' })
const form = reactive(emptyForm())
let contextRevision = 0, requestRevision = 0

async function loadReferences() {
  const id = props.versionId
  const request = ++requestRevision
  references.value = []; error.value = ''; loading.value = Boolean(id)
  if (!id) return
  try {
    const result = await fetchPolicyReferences(id)
    if (request === requestRevision) references.value = result
  } catch (e) {
    if (request === requestRevision) error.value = e?.message || '请稍后重试'
  } finally { if (request === requestRevision) loading.value = false }
}

async function addReference() {
  if (saving.value || !props.versionId || !props.published) return
  if (!form.policyFileVersionId) return ElMessage.warning('请选择已发布政策版本')
  const context = contextRevision, id = props.versionId
  const payload = { ...form, policyFileVersionId: String(form.policyFileVersionId) }
  saving.value = true
  try {
    await createPolicyReference(id, payload)
    if (context !== contextRevision) return
    Object.assign(form, emptyForm())
    ElMessage.success('政策引用已添加')
    await loadReferences()
  } catch (e) {
    if (context === contextRevision) ElMessage.error(e?.message || '添加政策引用失败')
  } finally { if (context === contextRevision) saving.value = false }
}

async function invalidate(reference) {
  if (saving.value || !props.versionId || !props.published) return
  const context = contextRevision
  saving.value = true
  try {
    await ElMessageBox.confirm('确认使该政策引用失效？', '失效政策引用', { type: 'warning' })
    if (context !== contextRevision) return
    await invalidatePolicyReference(reference.id, reference.resourceVersion)
    if (context !== contextRevision) return
    ElMessage.success('政策引用已失效')
    await loadReferences()
  } catch (e) {
    if (context === contextRevision && e !== 'cancel' && e !== 'close') ElMessage.error(e?.message || '失效政策引用失败')
  } finally { if (context === contextRevision) saving.value = false }
}

watch(() => [props.versionId, props.published], () => {
  contextRevision++; saving.value = false; viewerId.value = ''
  Object.assign(form, emptyForm())
  void loadReferences()
}, { immediate: true })
onBeforeUnmount(() => { contextRevision++; requestRevision++ })
</script>

<style scoped>
.policy-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
.policy-toolbar .mono-data { overflow-wrap: anywhere; }
.policy-reference-form { margin-top: 20px; max-width: 760px; }
.policy-reference-form :deep(.el-select) { width: 100%; }
</style>
