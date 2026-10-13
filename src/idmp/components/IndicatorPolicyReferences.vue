<template>
  <section class="surface-card table-card policy-references">
    <div class="section-title"><h2>政策依据</h2></div>
    <el-empty v-if="!versionId" description="尚未创建指标版本" />
    <template v-else>
      <el-alert v-if="!published" title="指标发布后可关联政策文件" type="info" :closable="false" show-icon />
      <StatePanel v-if="loading" type="loading" title="正在读取政策依据" />
      <StatePanel v-else-if="error" type="error" title="政策依据读取失败" :description="error">
        <template #actions><el-button @click="load">重试</el-button></template>
      </StatePanel>
      <el-table v-else :data="references" empty-text="暂无有效政策依据" table-layout="fixed">
        <el-table-column label="政策文件" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.policyFileName || row.policyFileCode || '-' }}</template>
        </el-table-column>
        <el-table-column prop="policyVersionNo" label="文件版本" width="100" />
        <el-table-column label="关系类型" width="110"><template #default="{ row }">{{ policyReferenceRoleLabel(row.relationRole) }}</template></el-table-column>
        <el-table-column prop="citationLocation" label="政策出处" min-width="160" show-overflow-tooltip />
        <el-table-column prop="citationText" label="政策原文" min-width="240" show-overflow-tooltip />
        <el-table-column label="操作" width="130">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewerId = String(row.policyFileVersionId)">查看</el-button>
            <el-button v-if="canManage" link type="danger" :disabled="saving || removing" @click="invalidate(row)">失效</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-form v-if="canManage" class="reference-form" label-position="top" @submit.prevent="add">
        <div class="reference-fields">
          <el-form-item label="政策文件">
            <PolicyVersionPicker v-model="form.policyFileVersionId" :disabled="saving" aria-label="关联政策文件" />
          </el-form-item>
          <el-form-item label="关系类型">
            <el-select v-model="form.relationRole" :disabled="saving" aria-label="政策依据关系类型">
              <el-option v-for="item in POLICY_REFERENCE_ROLES" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="政策出处（可选）"><el-input v-model="form.citationLocation" :maxlength="500" :disabled="saving" /></el-form-item>
        </div>
        <el-form-item label="政策原文（可选）"><el-input v-model="form.citationText" type="textarea" :rows="2" :maxlength="10000" :disabled="saving" /></el-form-item>
        <el-button type="primary" :icon="Plus" :loading="saving" :disabled="!form.policyFileVersionId || removing" native-type="submit">添加政策依据</el-button>
      </el-form>
    </template>
    <PolicyFileViewer :version-id="viewerId" @close="viewerId = ''" />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from '@/idmp/utils/message'
import StatePanel from '@/idmp/components/StatePanel.vue'
import PolicyVersionPicker from '@/idmp/components/PolicyVersionPicker.vue'
import PolicyFileViewer from '@/idmp/components/PolicyFileViewer.vue'
import { createPolicyReference, fetchPolicyReferences, invalidatePolicyReference } from '@/idmp/api/modules/mappings'
import { POLICY_REFERENCE_ROLES, policyReferenceRoleLabel } from '@/idmp/api/adapters/mapping'

const props = defineProps({ versionId: { type: String, default: '' }, published: { type: Boolean, default: false } })
const canManage = computed(() => Boolean(props.versionId) && props.published)
const references = ref([]), loading = ref(false), error = ref(''), saving = ref(false), removing = ref(false), viewerId = ref('')
const form = reactive({ policyFileVersionId: '', relationRole: 'SOURCE', citationLocation: '', citationText: '' })
let revision = 0
let contextRevision = 0

function resetForm() {
  Object.assign(form, { policyFileVersionId: '', relationRole: 'SOURCE', citationLocation: '', citationText: '' })
}

async function load() {
  const current = ++revision
  const id = props.versionId
  references.value = []
  error.value = ''
  loading.value = Boolean(id)
  if (!id) return
  try {
    const rows = await fetchPolicyReferences(id)
    if (current === revision) references.value = rows
  } catch (failure) {
    if (current === revision) error.value = failure?.message || '无法读取政策依据，请重试'
  } finally { if (current === revision) loading.value = false }
}

async function add() {
  if (!canManage.value || saving.value || removing.value || !form.policyFileVersionId) return
  const current = contextRevision
  const id = props.versionId
  saving.value = true
  try {
    await createPolicyReference(id, { ...form, policyFileVersionId: String(form.policyFileVersionId) })
    if (current !== contextRevision) return
    resetForm()
    await load()
    if (current === contextRevision) ElMessage.success('政策依据已添加')
  } catch (failure) {
    if (current === contextRevision) ElMessage.error(failure?.message || '添加政策依据失败')
  } finally { if (current === contextRevision) saving.value = false }
}

async function invalidate(row) {
  if (!canManage.value || saving.value || removing.value) return
  const current = contextRevision
  removing.value = true
  try {
    await ElMessageBox.confirm('确认使该政策依据失效？', '失效政策依据', { type: 'warning' })
    if (current !== contextRevision || !canManage.value) return
    await invalidatePolicyReference(String(row.id), row.resourceVersion)
    if (current !== contextRevision) return
    await load()
    if (current === contextRevision) ElMessage.success('政策依据已失效')
  } catch (failure) {
    if (current === contextRevision && failure !== 'cancel' && failure !== 'close') {
      ElMessage.error(failure?.message || '失效政策依据失败')
      if (failure?.status === 409) await load()
    }
  } finally { if (current === contextRevision) removing.value = false }
}

watch(() => [props.versionId, props.published], () => {
  contextRevision++
  saving.value = false
  removing.value = false
  viewerId.value = ''
  resetForm()
  load()
}, { immediate: true })
onBeforeUnmount(() => { revision++; contextRevision++ })
</script>

<style scoped>
.policy-references { min-width: 0; }
.section-title h2 { font-size: 18px; }
.reference-form { max-width: 960px; margin-top: 24px; }
.reference-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr); gap: 16px; }
.reference-form :deep(.el-select) { width: 100%; }
@media (max-width: 760px) { .reference-fields { grid-template-columns: minmax(0, 1fr); gap: 0; } }
</style>
