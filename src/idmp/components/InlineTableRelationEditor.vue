<template>
  <div class="inline-relation-editor" aria-label="配置表关联" :aria-busy="busy">
    <el-form label-position="top" @submit.prevent>
      <fieldset :disabled="busy">
        <div class="relation-settings">
          <el-form-item label="关联表数据域">
            <el-select v-model="form.domainId" filterable :loading="loading.tables" :disabled="busy" @change="loadTables">
              <el-option v-for="domain in domains" :key="domain.id" :label="`${domain.name || domain.code}（${domain.code}）`" :value="String(domain.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联物理表">
            <el-select v-model="form.tableId" filterable :loading="loading.tables" :disabled="busy || loading.tables" placeholder="选择关联物理表" @change="loadFields">
              <el-option v-for="table in targetTables" :key="table.id" :label="`${table.tableComment || table.tableName}（${table.tableName}）`" :value="String(table.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联方式">
            <el-select v-model="form.joinType" :disabled="busy">
              <el-option label="左关联（保留来源表全部记录）" value="LEFT" />
              <el-option label="内关联（仅保留匹配记录）" value="INNER" />
            </el-select>
          </el-form-item>
          <el-form-item label="关联关系">
            <el-select v-model="form.cardinality" :disabled="busy" placeholder="选择记录对应关系">
              <el-option label="多对一" value="MANY_TO_ONE" />
              <el-option label="一对一" value="ONE_TO_ONE" />
            </el-select>
          </el-form-item>
        </div>
        <div class="relation-key-heading"><strong>关联字段</strong><el-button :icon="Plus" :disabled="busy || !targetFields.length" @click="form.keys.push({ left: '', right: '' })">添加字段</el-button></div>
        <div v-for="(key, index) in form.keys" :key="index" class="relation-key-row">
          <el-select v-model="key.left" filterable :disabled="busy" :aria-label="`来源关联字段 ${index + 1}`" :placeholder="`${source.tableName} 的字段`">
            <el-option v-for="field in sourceFields" :key="field.semanticFieldCode" :label="fieldLabel(field, source.tableName)" :value="field.semanticFieldCode" />
          </el-select>
          <span class="relation-equals">=</span>
          <el-select v-model="key.right" filterable :disabled="busy || loading.fields" :loading="loading.fields" :aria-label="`目标关联字段 ${index + 1}`" placeholder="关联表的字段">
            <el-option v-for="field in targetFields" :key="field.semanticFieldCode" :label="fieldLabel(field, targetTable?.tableName)" :value="field.semanticFieldCode" />
          </el-select>
          <el-button :icon="Delete" circle plain :disabled="busy || form.keys.length === 1" :title="`删除关联字段 ${index + 1}`" @click="form.keys.splice(index, 1)" />
        </div>
      </fieldset>
    </el-form>
    <p class="relation-cardinality-note">关联表的关联字段组合应唯一，否则可能造成重复统计。</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="relation-actions">
      <el-button type="primary" :loading="busy" :disabled="loading.tables || loading.fields" @click="applyRelation">保存并使用关联</el-button>
      <el-button :disabled="busy" @click="emit('cancel')">取消</el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { adaptPhysicalTableList, adaptSemanticFieldList, adaptSourceFieldList } from '@/idmp/api/adapters/meta'
import { adaptFactorPhysicalFields } from '@/idmp/api/adapters/factorMetadata'
import { createPhysicalTableRelation, fetchPhysicalTableFields, fetchPhysicalTableRelation, fetchPhysicalTableRelations, fetchPhysicalTables,
  fetchSourceTableFields, publishPhysicalTableRelation, updatePhysicalTableRelation, validatePhysicalTableRelation } from '@/idmp/api/modules/meta'
import { newTableRelationCode, tableRelationPayload, relationValidationMessage } from '@/idmp/utils/tableRelation'
import { toUserMessage } from '@/idmp/utils/userMessage'

const props = defineProps({ source: { type: Object, required: true }, sourceFields: { type: Array, required: true }, domains: { type: Array, required: true } })
const emit = defineEmits(['applied', 'cancel', 'busy'])
const form = reactive({ domainId: String(props.source.domainId), tableId: '', joinType: 'LEFT', cardinality: '', keys: [{ left: '', right: '' }] })
const targetTables = ref([]), targetFields = ref([]), error = ref(''), busy = ref(false)
const loading = reactive({ tables: false, fields: false })
const targetTable = computed(() => targetTables.value.find(table => String(table.id) === form.tableId))
let requestVersion = 0, disposed = false, draft = null, draftPayload = '', pendingCode = '', pendingPayload = ''
onUnmounted(() => { disposed = true; requestVersion++; emit('busy', false) })
watch(form, () => { error.value = '' }, { deep: true })

function fieldLabel(field, table) { return `${table}.${field.physicalColumn || field.sourceFieldName} · ${field.label || field.name || field.semanticFieldCode}` }
async function loadTables() {
  const version = ++requestVersion
  form.tableId = ''; targetTables.value = []; targetFields.value = []; form.keys = [{ left: '', right: '' }]; error.value = ''
  loading.tables = true; loading.fields = false
  try {
    const tables = adaptPhysicalTableList(await fetchPhysicalTables(form.domainId))
    if (version !== requestVersion || disposed) return
    targetTables.value = tables.filter(table => table.status === 'PUBLISHED' && table.enableStatus !== 'DISABLED' && String(table.id) !== String(props.source.physicalTableBindingId))
  } catch (failure) { if (version === requestVersion && !disposed) error.value = toUserMessage(failure, '关联物理表读取失败，请重试') }
  finally { if (version === requestVersion) loading.tables = false }
}
async function loadFields() {
  const version = ++requestVersion, table = targetTable.value
  targetFields.value = []; form.keys = [{ left: '', right: '' }]; error.value = ''
  loading.fields = false
  if (!table) return
  loading.fields = true
  try {
    const [mapped, physical] = await Promise.all([fetchPhysicalTableFields(form.domainId, table.tableName), fetchSourceTableFields(table.tableName)])
    if (version !== requestVersion || disposed) return
    const mappings = adaptSemanticFieldList(mapped)
    targetFields.value = adaptFactorPhysicalFields(mappings, adaptSourceFieldList(physical), { isBase: true }).map(field => ({ ...field,
      relationDataType: mappings.find(item => item.code === field.semanticFieldCode)?.dataType }))
  } catch (failure) { if (version === requestVersion && !disposed) error.value = toUserMessage(failure, '关联字段读取失败，请重试') }
  finally { if (version === requestVersion) loading.fields = false }
}
async function applyRelation() {
  if (busy.value || loading.tables || loading.fields) return
  error.value = ''
  let payload, applied
  try { payload = tableRelationPayload(props.source, targetTable.value, form, props.sourceFields, targetFields.value) }
  catch (failure) { error.value = failure.message; return }
  busy.value = true; emit('busy', true)
  try {
    const fingerprint = JSON.stringify(payload)
    // 校验或发布失败后继续使用同一草稿，重试不重复创建关系。
    if (draft) draft = await fetchPhysicalTableRelation(draft.id)
    else if (pendingCode) {
      const relations = await fetchPhysicalTableRelations(props.source.physicalTableBindingId)
      draft = relations.find(item => item.code === pendingCode) || null
      if (draft) draftPayload = pendingPayload
    }
    if (disposed) return
    const prior = draftPayload ? JSON.parse(draftPayload) : null
    const tablesChanged = prior && (prior.leftPhysicalTableBindingId !== payload.leftPhysicalTableBindingId || prior.rightPhysicalTableBindingId !== payload.rightPhysicalTableBindingId)
    if (!draft || tablesChanged || (draft.status === 'PUBLISHED' && fingerprint !== draftPayload)) {
      if (!pendingCode || draft) pendingCode = newTableRelationCode()
      pendingPayload = fingerprint
      draft = await createPhysicalTableRelation({ code: pendingCode, ...payload })
      draftPayload = fingerprint
    } else if (fingerprint !== draftPayload) {
      const { joinType, cardinality, leftKeySpec, rightKeySpec } = payload
      draft = await updatePhysicalTableRelation(draft.id, { resourceVersion: draft.resourceVersion, joinType, cardinality, leftKeySpec, rightKeySpec })
      draftPayload = fingerprint
    }
    if (disposed) return
    if (draft.status !== 'PUBLISHED') {
      const validation = await validatePhysicalTableRelation(draft.id)
      if (disposed) return
      if (!validation?.valid) throw new Error(relationValidationMessage(validation))
      draft = await fetchPhysicalTableRelation(draft.id)
      if (disposed) return
      draft = await publishPhysicalTableRelation(draft.id, draft.resourceVersion)
    }
    applied = draft
  } catch (failure) { if (!disposed) error.value = toUserMessage(failure, '关联配置保存失败，请重试') }
  finally { busy.value = false; emit('busy', false) }
  if (applied && !disposed) emit('applied', applied)
}
onMounted(loadTables)
</script>

<style scoped>
.inline-relation-editor { min-width: 0; padding-top: 16px; border-top: 1px solid #e5e8ef; }
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
.relation-settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.relation-settings :deep(.el-select) { width: 100%; }
.relation-key-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.relation-key-heading strong { font-size: 14px; }
.relation-key-row { display: grid; grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr) 32px; gap: 10px; align-items: center; margin-bottom: 10px; }
.relation-equals { text-align: center; color: #606266; }
.relation-cardinality-note { margin: 10px 0; font-size: 12px; color: #8a6419; line-height: 20px; }
.relation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.relation-actions :deep(.el-button + .el-button) { margin-left: 0; }
@media (max-width: 700px) {
  .relation-settings { grid-template-columns: minmax(0, 1fr); }
  .relation-key-row { grid-template-columns: 18px minmax(0, 1fr) 32px; gap: 6px; }
  .relation-key-row > :first-child { grid-column: 2; }
  .relation-equals { grid-column: 1; grid-row: 2; }
  .relation-key-row > :nth-child(3) { grid-column: 2; grid-row: 2; }
  .relation-key-row > :last-child { grid-column: 3; grid-row: 1 / 3; }
}
</style>
