<template>
  <div class="idmp-page data-domain-workspace">
    <PageHeader title="数据域工作台">
      <template #meta><span class="data-source-badge is-live">真实接口</span></template>
      <template #actions>
        <el-button :icon="ArrowLeft" @click="router.push({ name: 'DataDomainManagement' })">返回目录</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="loadWorkspace">刷新</el-button>
      </template>
    </PageHeader>

    <StatePanel v-if="loading" type="loading" title="正在加载数据域" />
    <StatePanel v-else-if="error" type="error" title="数据域加载失败" :description="errorMessage">
      <template #actions><el-button @click="loadWorkspace">重试</el-button></template>
    </StatePanel>
    <StatePanel v-else-if="!domain" type="empty" title="数据域不存在" />
    <template v-else>
      <section class="domain-heading">
        <div><CodeTooltip :code="domain.code" label="数据域编码"><h2>{{ domain.name }}</h2></CodeTooltip><p>{{ domain.description || '暂无说明' }}</p></div>
        <StatusBadge :status="domain.status" />
      </section>

      <section class="workspace-section">
        <div class="section-title section-title--toolbar">
          <div><h2>物理表</h2><p class="section-title__description">当前数据域接入的源表和视图</p></div>
          <div class="toolbar-actions"><span class="table-count">共 {{ physicalTables.length }} 张</span><el-button type="primary" :icon="Plus" @click="openAddDialog">接入物理表</el-button></div>
        </div>
        <StatePanel v-if="!physicalTables.length" type="empty" title="尚未接入物理表">
          <template #actions><el-button type="primary" @click="openAddDialog">接入物理表</el-button></template>
        </StatePanel>
        <el-table v-else :data="physicalTables" :current-row-key="selectedTableName" row-key="tableName" highlight-current-row @row-click="selectTable">
          <el-table-column prop="tableName" label="表名" min-width="220" show-overflow-tooltip />
          <el-table-column prop="tableComment" label="说明" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ row.tableComment || '—' }}</template></el-table-column>
          <el-table-column prop="defaultTimeSemanticFieldCode" label="默认时间字段" min-width="160"><template #default="{ row }">{{ row.defaultTimeSemanticFieldCode || '未配置' }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="selectTable(row)">查看</el-button></template></el-table-column>
        </el-table>
      </section>

      <section class="workspace-section">
        <div class="section-title section-title--toolbar"><div><h2>字段映射</h2><p class="section-title__description">{{ selectedTable?.tableName || '请选择物理表' }}</p></div><span v-if="selectedTable" class="table-count">已映射 {{ mappedFields.length }} / {{ sourceFields.length }}</span></div>
        <StatePanel v-if="!selectedTable" type="empty" title="请选择物理表" />
        <StatePanel v-else-if="fieldLoading" type="loading" title="正在加载字段" />
        <StatePanel v-else-if="fieldError" type="error" title="字段加载失败" :description="fieldErrorMessage"><template #actions><el-button @click="loadFields">重试</el-button></template></StatePanel>
        <template v-else>
          <el-table :data="fieldRows" row-key="columnName" max-height="500">
            <el-table-column prop="columnName" label="源字段" min-width="180" show-overflow-tooltip />
            <el-table-column prop="columnType" label="源类型" min-width="110" />
            <el-table-column prop="comment" label="源注释" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ row.comment || '—' }}</template></el-table-column>
            <el-table-column prop="mapped.code" label="业务字段" min-width="180"><template #default="{ row }">{{ row.mapped?.name || row.mapped?.code || '未映射' }}<small v-if="row.mapped?.code">{{ row.mapped.code }}</small></template></el-table-column>
            <el-table-column label="角色" width="110"><template #default="{ row }">{{ roleLabel(row.mapped?.semanticKind) }}</template></el-table-column>
            <el-table-column label="操作" width="260" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openMappingDialog(row)">{{ row.mapped ? '编辑' : '映射' }}</el-button><template v-if="row.mapped"><el-button link :disabled="!canBindValueSet(row.mapped)" @click="openValueSetBinding(row.mapped)">值集</el-button><el-button link :disabled="!canStandardize(row.mapped)" @click="openStandardization(row.mapped)">标准化</el-button><el-button link :disabled="!row.mapped.sourceFieldMappingId" @click="openFieldProfile(row.mapped)">画像</el-button></template></template></el-table-column>
          </el-table>
          <div class="time-field-control"><label for="default-time-field">默认时间字段</label><el-select id="default-time-field" v-model="defaultTimeFieldCode" :disabled="!timeFieldOptions.length" placeholder="选择已映射的日期字段"><el-option v-for="field in timeFieldOptions" :key="field.code" :label="`${field.name}（${field.code}）`" :value="field.code" /></el-select><el-button type="primary" :loading="timeSaving" :disabled="!defaultTimeFieldCode || defaultTimeFieldCode === selectedTable.defaultTimeSemanticFieldCode" @click="saveDefaultTimeField">保存</el-button></div>
        </template>
      </section>
    </template>

    <el-dialog v-model="addDialogVisible" title="接入物理表" width="520px" destroy-on-close>
      <el-form label-position="top"><el-form-item label="源表或视图"><el-select v-model="tableToAdd" filterable :loading="sourceLoading" placeholder="选择来源对象"><el-option v-for="table in availableSourceTables" :key="table.tableName" :label="table.comment ? `${table.tableName} · ${table.comment}` : table.tableName" :value="table.tableName" /></el-select></el-form-item></el-form>
      <StatePanel v-if="sourceError" type="error" title="来源目录加载失败" :description="sourceErrorMessage"><template #actions><el-button @click="loadSourceTables">重试</el-button></template></StatePanel>
      <template #footer><el-button @click="addDialogVisible = false">取消</el-button><el-button type="primary" :loading="adding" :disabled="!tableToAdd" @click="submitAddTable">确认接入</el-button></template>
    </el-dialog>

    <el-dialog v-model="mappingDialogVisible" :title="`映射字段 · ${mappingForm.sourceFieldName}`" width="560px" destroy-on-close>
      <el-form ref="mappingFormRef" :model="mappingForm" :rules="mappingRules" label-position="top">
        <el-form-item label="业务字段编码" prop="code"><el-input v-model.trim="mappingForm.code" :disabled="editingMappedField" /></el-form-item>
        <el-form-item label="业务字段名称" prop="name"><el-input v-model.trim="mappingForm.name" /></el-form-item>
        <el-form-item label="数据类型" prop="dataType"><el-select v-model="mappingForm.dataType"><el-option v-for="type in SEMANTIC_DATA_TYPES" :key="type" :label="dataTypeLabel(type)" :value="type" /></el-select></el-form-item>
        <el-form-item label="业务角色" prop="semanticKind"><el-select v-model="mappingForm.semanticKind"><el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item><el-checkbox v-model="mappingForm.sensitive">敏感字段</el-checkbox></el-form-item>
      </el-form>
      <template #footer><el-button @click="mappingDialogVisible = false">取消</el-button><el-button type="primary" :loading="mappingSaving" @click="submitMapping">保存映射</el-button></template>
    </el-dialog>

    <el-dialog v-model="valueSetDialogVisible" title="绑定值集" width="500px" destroy-on-close>
      <el-select v-model="selectedValueSetId" filterable clearable :loading="valueSetLoading" placeholder="选择已发布值集" class="dialog-select" @change="validateSelectedValueSet"><el-option v-for="item in valueSets" :key="item.id" :label="item.name || item.code" :value="String(item.id)" /></el-select>
      <template #footer><el-button @click="valueSetDialogVisible = false">取消</el-button><el-button type="primary" :loading="valueSetSaving" :disabled="!selectedValueSetId" @click="saveValueSetBinding">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="profileDialogVisible" :title="`源值画像 · ${profileField?.sourceFieldName || ''}`" width="640px" destroy-on-close>
      <StatePanel v-if="profileLoading" type="loading" title="正在读取源值画像" />
      <el-table v-else :data="profileItems" max-height="400" empty-text="暂无源值画像"><el-table-column prop="value" label="源值" min-width="200"><template #default="{ row }">{{ row.nullValue ? '空值' : row.value }}</template></el-table-column><el-table-column prop="count" label="记录数" width="130" /><el-table-column label="占比" width="110"><template #default="{ row }">{{ row.percentage == null ? '—' : `${Number(row.percentage).toFixed(2)}%` }}</template></el-table-column></el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import CodeTooltip from '@/idmp/components/CodeTooltip.vue'
import { addPhysicalTable, bindPhysicalTableField, fetchDataDomains, fetchPhysicalTableFields, fetchPhysicalTables, fetchSourceTableFields, fetchSourceTables, updatePhysicalTableDefaultTimeField } from '@/idmp/api/modules/meta'
import { adaptDataDomainList, adaptPhysicalTableList, adaptSemanticFieldList, adaptSourceFieldList, adaptSourceTableList } from '@/idmp/api/adapters/meta'
import { dataTypeLabel } from '@/idmp/features/meta/model'
import { SEMANTIC_DATA_TYPES } from '@/idmp/utils/validation'
import { bindSemanticFieldValueSet, fetchSemanticFieldValueSet, fetchValueSet, fetchValueSets } from '@/idmp/api/modules/valueSets'
import { fetchSourceValueProfile } from '@/idmp/api/modules/transformRules'

const route = useRoute()
const router = useRouter()
const domain = ref(null)
const physicalTables = ref([])
const sourceTables = ref([])
const sourceFields = ref([])
const mappedFields = ref([])
const selectedTableName = ref('')
const defaultTimeFieldCode = ref('')
const loading = ref(false)
const fieldLoading = ref(false)
const sourceLoading = ref(false)
const adding = ref(false)
const mappingSaving = ref(false)
const timeSaving = ref(false)
const error = ref(null)
const fieldError = ref(null)
const sourceError = ref(null)
const addDialogVisible = ref(false)
const mappingDialogVisible = ref(false)
const editingMappedField = ref(false)
const valueSetDialogVisible = ref(false)
const valueSetLoading = ref(false)
const valueSetSaving = ref(false)
const selectedValueSetField = ref(null)
const selectedValueSetId = ref('')
const valueSetBinding = ref(null)
const valueSets = ref([])
const profileDialogVisible = ref(false)
const profileLoading = ref(false)
const profileField = ref(null)
const profileItems = ref([])
const tableToAdd = ref('')
const mappingFormRef = ref(null)
const mappingForm = reactive({ sourceFieldName: '', code: '', name: '', dataType: '', semanticKind: '', sensitive: false })
const roleOptions = [
  { value: 'DIMENSION', label: '维度' }, { value: 'MEASURE', label: '度量' },
  { value: 'IDENTIFIER', label: '标识' }, { value: 'TIME', label: '时间' },
  { value: 'ATTRIBUTE', label: '属性' }
]
const mappingRules = {
  code: [{ required: true, message: '请输入字段编码', trigger: 'blur' }, { pattern: /^[A-Z][A-Z0-9_]{0,63}$/, message: '编码应以大写字母开头，最多 64 位', trigger: 'blur' }],
  name: [{ required: true, message: '请输入字段名称', trigger: 'blur' }, { max: 200, message: '名称最多 200 字', trigger: 'blur' }],
  dataType: [{ required: true, message: '请选择数据类型', trigger: 'change' }],
  semanticKind: [{ required: true, message: '请选择业务角色', trigger: 'change' }]
}

const domainId = computed(() => String(route.params.id || ''))
const selectedTable = computed(() => physicalTables.value.find(table => table.tableName === selectedTableName.value))
const availableSourceTables = computed(() => sourceTables.value.filter(table => !physicalTables.value.some(bound => bound.tableName === table.tableName)))
const fieldRows = computed(() => sourceFields.value.map(field => ({
  ...field, mapped: mappedFields.value.find(mapped => mapped.sourceFieldName === field.columnName)
})))
const timeFieldOptions = computed(() => mappedFields.value.filter(field => ['DATE', 'DATETIME'].includes(String(field.dataType).toUpperCase())))
const errorMessage = computed(() => error.value?.message || '数据域读取失败')
const fieldErrorMessage = computed(() => fieldError.value?.message || '字段读取失败')
const sourceErrorMessage = computed(() => sourceError.value?.message || '来源目录读取失败')

onMounted(loadWorkspace)
watch(domainId, loadWorkspace)

async function loadWorkspace() {
  loading.value = true
  error.value = null
  try {
    const [domains, tables] = await Promise.all([fetchDataDomains(), fetchPhysicalTables(domainId.value)])
    domain.value = adaptDataDomainList(domains).find(item => item.id === domainId.value) || null
    physicalTables.value = adaptPhysicalTableList(tables)
    if (!physicalTables.value.some(table => table.tableName === selectedTableName.value)) selectedTableName.value = ''
    if (selectedTableName.value) await loadFields()
    else { sourceFields.value = []; mappedFields.value = []; defaultTimeFieldCode.value = '' }
  } catch (cause) {
    error.value = cause
    domain.value = null
    physicalTables.value = []
  } finally {
    loading.value = false
  }
}

function selectTable(row) {
  if (!row?.tableName || selectedTableName.value === row.tableName) return
  selectedTableName.value = row.tableName
  sourceFields.value = []
  mappedFields.value = []
  defaultTimeFieldCode.value = ''
  void loadFields()
}

let fieldRequest = 0
async function loadFields() {
  const tableName = selectedTableName.value
  if (!tableName) return
  const request = ++fieldRequest
  fieldLoading.value = true
  fieldError.value = null
  try {
    const [source, mapped] = await Promise.all([
      fetchSourceTableFields(tableName), fetchPhysicalTableFields(domainId.value, tableName)
    ])
    if (request !== fieldRequest || tableName !== selectedTableName.value) return
    sourceFields.value = adaptSourceFieldList(source)
    mappedFields.value = adaptSemanticFieldList(mapped)
    defaultTimeFieldCode.value = selectedTable.value?.defaultTimeSemanticFieldCode || ''
  } catch (cause) {
    if (request !== fieldRequest) return
    fieldError.value = cause
    sourceFields.value = []
    mappedFields.value = []
  } finally {
    if (request === fieldRequest) fieldLoading.value = false
  }
}

async function loadSourceTables() {
  sourceLoading.value = true
  sourceError.value = null
  try { sourceTables.value = adaptSourceTableList(await fetchSourceTables()) }
  catch (cause) { sourceError.value = cause; sourceTables.value = [] }
  finally { sourceLoading.value = false }
}

function openAddDialog() {
  tableToAdd.value = ''
  addDialogVisible.value = true
  void loadSourceTables()
}

async function submitAddTable() {
  if (!tableToAdd.value || adding.value) return
  try {
    await ElMessageBox.confirm(`确认将 ${tableToAdd.value} 接入 ${domain.value.name}？`, '接入物理表', { type: 'warning' })
  } catch { return }
  adding.value = true
  try {
    const tableName = tableToAdd.value
    await addPhysicalTable(domainId.value, tableName)
    physicalTables.value = adaptPhysicalTableList(await fetchPhysicalTables(domainId.value))
    addDialogVisible.value = false
    selectTable(physicalTables.value.find(table => table.tableName === tableName))
    ElMessage.success('物理表已接入')
  } catch (cause) { ElMessage.error(cause?.message || '物理表接入失败') }
  finally { adding.value = false }
}

function openMappingDialog(field) {
  const current = field.mapped
  editingMappedField.value = Boolean(current)
  const suggestedCode = String(field.columnName).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  Object.assign(mappingForm, {
    sourceFieldName: field.columnName,
    code: current?.code || (/^[A-Z]/.test(suggestedCode) ? suggestedCode : `F_${suggestedCode}`).slice(0, 64),
    name: current?.name || field.comment || field.columnName,
    dataType: current?.dataType || inferDataType(field.columnType),
    semanticKind: current?.semanticKind || '', sensitive: current?.sensitive || false
  })
  mappingDialogVisible.value = true
}

async function openValueSetBinding(field) {
  if (!field?.id) return
  selectedValueSetField.value = field
  selectedValueSetId.value = ''
  valueSetBinding.value = null
  valueSetDialogVisible.value = true
  valueSetLoading.value = true
  try {
    const [binding, catalog] = await Promise.all([
      fetchSemanticFieldValueSet(field.id), fetchValueSets({ status: 'PUBLISHED', page: 1, size: 200 })
    ])
    valueSetBinding.value = binding || null
    selectedValueSetId.value = String(binding?.valueSet?.id || binding?.valueSetId || '')
    valueSets.value = catalog?.records || catalog?.items || []
  } catch (cause) { ElMessage.error(cause?.message || '值集信息读取失败') }
  finally { valueSetLoading.value = false }
}

async function saveValueSetBinding() {
  if (!selectedValueSetField.value || !selectedValueSetId.value || valueSetSaving.value) return
  valueSetSaving.value = true
  try {
    const field = selectedValueSetField.value
    await bindSemanticFieldValueSet(field.id, {
      resourceVersion: valueSetBinding.value?.semanticField?.resourceVersion ?? field.resourceVersion ?? 0,
      valueSetId: selectedValueSetId.value
    })
    valueSetDialogVisible.value = false
    await loadFields()
    ElMessage.success('值集绑定已保存')
  } catch (cause) { ElMessage.error(cause?.message || '值集绑定失败') }
  finally { valueSetSaving.value = false }
}

async function validateSelectedValueSet(valueSetId) {
  if (!valueSetId || !selectedValueSetField.value) return
  try {
    const detail = await fetchValueSet(valueSetId)
    const version = detail?.version || detail?.publishedVersion || null
    const matchMode = String(version?.matchMode || detail?.valueSet?.matchMode || '').toUpperCase()
    const valueType = String(version?.valueType || '').toUpperCase()
    const fieldType = String(selectedValueSetField.value.dataType || '').toUpperCase()
    const compatible = matchMode === 'CONTINUOUS'
      ? ['INTEGER', 'DECIMAL', 'DATE', 'DATETIME'].includes(fieldType)
      : selectedValueSetField.value.semanticKind === 'DIMENSION'
    if (!compatible || (valueType && valueType !== fieldType)) {
      selectedValueSetId.value = ''
      ElMessage.warning('值集类型与当前字段不兼容')
    }
  } catch (cause) {
    selectedValueSetId.value = ''
    ElMessage.error(cause?.message || '值集兼容性校验失败')
  }
}

function canBindValueSet(field) {
  return field?.semanticKind === 'DIMENSION' || ['INTEGER', 'DECIMAL', 'DATE', 'DATETIME'].includes(String(field?.dataType || '').toUpperCase())
}

function canStandardize(field) {
  return field?.semanticKind === 'DIMENSION' && Boolean(field.sourceFieldMappingId)
}

function openStandardization(field) {
  if (!canStandardize(field)) return
  router.push({ name: 'SourceStandardization', params: { mappingId: field.sourceFieldMappingId },
    query: { sourceField: field.sourceFieldName || field.code, fieldId: field.id || undefined } })
}

async function openFieldProfile(field) {
  if (!field?.sourceFieldMappingId) return
  profileField.value = field
  profileItems.value = []
  profileDialogVisible.value = true
  profileLoading.value = true
  try {
    const profile = await fetchSourceValueProfile(field.sourceFieldMappingId, { page: 1, size: 100 })
    profileItems.value = profile?.items || profile?.topValues || []
  } catch (cause) { ElMessage.error(cause?.message || '源值画像读取失败') }
  finally { profileLoading.value = false }
}

async function submitMapping() {
  if (mappingSaving.value || !(await mappingFormRef.value?.validate().catch(() => false))) return
  mappingSaving.value = true
  try {
    await bindPhysicalTableField(domainId.value, selectedTableName.value, { ...mappingForm })
    await loadFields()
    mappingDialogVisible.value = false
    ElMessage.success('字段映射已保存')
  } catch (cause) { ElMessage.error(cause?.message || '字段映射保存失败') }
  finally { mappingSaving.value = false }
}

async function saveDefaultTimeField() {
  if (!defaultTimeFieldCode.value || timeSaving.value) return
  timeSaving.value = true
  try {
    const updated = await updatePhysicalTableDefaultTimeField(domainId.value, selectedTableName.value, defaultTimeFieldCode.value)
    physicalTables.value = physicalTables.value.map(table => table.tableName === selectedTableName.value
      ? adaptPhysicalTableList([updated])[0] : table)
    ElMessage.success('默认时间字段已保存')
  } catch (cause) { ElMessage.error(cause?.message || '默认时间字段保存失败') }
  finally { timeSaving.value = false }
}

function inferDataType(value) {
  const type = String(value || '').toUpperCase()
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) return 'DATETIME'
  if (type.includes('DATE')) return 'DATE'
  if (type.includes('BOOL')) return 'BOOLEAN'
  if (['DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].some(item => type.includes(item))) return 'DECIMAL'
  if (type.includes('INT')) return 'INTEGER'
  return 'STRING'
}

function roleLabel(value) {
  return roleOptions.find(item => item.value === String(value || '').toUpperCase())?.label || '—'
}
</script>

<style scoped lang="scss">
.data-domain-workspace { display: flex; flex-direction: column; gap: 20px; }
.domain-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 1px solid var(--idmp-border); padding: 4px 0 18px; }
.domain-heading h2 { margin: 0 0 6px; font-size: 22px; }
.domain-heading p { margin: 0; color: var(--idmp-text-secondary); }
.workspace-section { min-width: 0; }
.section-title--toolbar, .toolbar-actions, .time-field-control { display: flex; align-items: center; gap: 12px; }
.section-title--toolbar { justify-content: space-between; margin-bottom: 14px; }
.toolbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.time-field-control { flex-wrap: wrap; border-top: 1px solid var(--idmp-border); padding-top: 18px; margin-top: 18px; }
.time-field-control label { font-weight: 600; }
.time-field-control .el-select { width: min(360px, 100%); }
.el-table small { display: block; color: var(--idmp-text-helper); }
.dialog-select { width: 100%; }
@media (max-width: 720px) { .section-title--toolbar { align-items: flex-start; flex-direction: column; } .toolbar-actions { justify-content: flex-start; } }
</style>
