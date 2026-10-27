<template>
  <div class="idmp-page data-domain-workspace">
    <PageHeader title="数据域工作台">
      <template #meta></template>
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
      <section class="surface-card domain-overview" aria-label="当前数据域">
        <div class="domain-overview__main">
          <span class="domain-overview__eyebrow">当前数据域</span>
          <div class="domain-overview__title"><h2>{{ domain.name }}</h2><StatusBadge :status="domain.status" /></div>
          <p>{{ domain.description || '暂无说明' }}</p>
        </div>
        <div class="domain-overview__count"><strong>{{ physicalTables.length }}</strong><span>接入物理表</span></div>
      </section>

      <section class="surface-card workspace-section" aria-label="物理表">
        <div class="section-title section-title--toolbar">
          <div><h2>物理表</h2><p class="section-title__description">选择一张源表或视图，查看并维护字段映射</p></div>
          <div class="toolbar-actions"><el-button v-access="'domain.physicalTables.create'" type="primary" :icon="Plus" @click="openAddDialog">接入物理表</el-button></div>
        </div>
        <div v-if="!physicalTables.length" class="workspace-section__body"><StatePanel type="empty" title="尚未接入物理表">
          <template #actions><el-button v-access="'domain.physicalTables.create'" type="primary" @click="openAddDialog">接入物理表</el-button></template>
        </StatePanel></div>
        <div v-else class="workspace-table-scroll"><el-table :data="physicalTables" :current-row-key="selectedTableName" row-key="tableName" highlight-current-row @row-click="selectTable">
          <el-table-column prop="tableName" label="表名" min-width="220" show-overflow-tooltip />
          <el-table-column prop="tableComment" label="说明" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ row.tableComment || '—' }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click.stop="selectTable(row)">查看</el-button></template></el-table-column>
        </el-table></div>
      </section>

      <section class="surface-card workspace-section workspace-section--fields" aria-label="字段映射">
        <div class="section-title section-title--toolbar"><div><h2>字段映射</h2><p class="section-title__description">{{ selectedTable ? `当前物理表：${selectedTable.tableName}` : '从上方选择物理表后查看源字段' }}</p></div><span v-if="selectedTable" class="table-count">已映射 {{ mappedFields.length }} / {{ sourceFields.length }}</span></div>
        <div v-if="!selectedTable" class="workspace-section__body"><StatePanel type="empty" title="请选择物理表" /></div>
        <div v-else-if="fieldLoading" class="workspace-section__body"><StatePanel type="loading" title="正在加载字段" /></div>
        <div v-else-if="fieldError" class="workspace-section__body"><StatePanel type="error" title="字段加载失败" :description="fieldErrorMessage"><template #actions><el-button @click="loadFields">重试</el-button></template></StatePanel></div>
        <template v-else>
          <div v-if="sourceFields.length" class="field-search-bar">
            <el-input v-model.trim="fieldSearch" clearable placeholder="搜索源字段、类型、注释或业务字段" aria-label="搜索字段映射" />
            <span>匹配 {{ filteredFieldRows.length }} / {{ fieldRows.length }} 个字段</span>
          </div>
          <div v-if="!sourceFields.length" class="workspace-section__body"><StatePanel type="empty" title="当前物理表没有字段" /></div>
          <div v-else-if="!filteredFieldRows.length" class="workspace-section__body"><StatePanel type="empty" title="没有匹配的字段" description="请更换关键词，或清空搜索查看全部字段。"><template #actions><el-button @click="fieldSearch = ''">清空搜索</el-button></template></StatePanel></div>
          <div v-else class="workspace-table-scroll"><el-table :data="filteredFieldRows" row-key="columnName" max-height="500">
            <el-table-column prop="columnName" label="源字段" min-width="180" show-overflow-tooltip />
            <el-table-column prop="columnType" label="源类型" min-width="110" />
            <el-table-column prop="comment" label="源注释" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ row.comment || '—' }}</template></el-table-column>
            <el-table-column prop="mapped.code" label="业务字段" min-width="180"><template #default="{ row }">{{ row.mapped?.name || row.mapped?.code || '未映射' }}<small v-if="row.mapped?.code">{{ row.mapped.code }}</small></template></el-table-column>
            <el-table-column label="配置类型" width="110"><template #default="{ row }">{{ row.mapped ? dataTypeLabel(row.mapped.dataType) : '未映射' }}</template></el-table-column>
            <el-table-column label="角色" width="110"><template #default="{ row }">{{ roleLabel(row.mapped?.semanticKind) }}</template></el-table-column>
<el-table-column label="操作" width="260" fixed="right"><template #default="{ row }"><el-button v-access="'domain.physicalTables.create'" link type="primary" @click="openMappingDialog(row)">{{ row.mapped ? '编辑' : '映射' }}</el-button><template v-if="row.mapped"><el-button v-access="'field.valueSet.update'" link :disabled="!canBindValueSet(row.mapped)" @click="openValueSetBinding(row.mapped)">值集</el-button><el-button v-access="'transformVersion.preview'" link :disabled="!canStandardize(row.mapped)" @click="openStandardization(row.mapped)">标准化</el-button><el-button v-access="'sourceField.valueProfile.read'" link :disabled="!row.mapped.sourceFieldMappingId" @click="openFieldProfile(row.mapped)">画像</el-button></template></template></el-table-column>
          </el-table></div>
        </template>
      </section>
    </template>

    <el-dialog v-model="addDialogVisible" title="接入物理表" width="520px" destroy-on-close>
      <el-form label-position="top"><el-form-item label="源表或视图"><el-select v-model="tableToAdd" filterable :loading="sourceLoading" placeholder="选择来源对象"><el-option v-for="table in availableSourceTables" :key="table.tableName" :label="table.comment ? `${table.tableName} · ${table.comment}` : table.tableName" :value="table.tableName" /></el-select></el-form-item></el-form>
      <StatePanel v-if="sourceError" type="error" title="来源目录加载失败" :description="sourceErrorMessage"><template #actions><el-button @click="loadSourceTables">重试</el-button></template></StatePanel>
      <template #footer><el-button @click="addDialogVisible = false">取消</el-button><el-button v-access="'domain.physicalTables.create'" type="primary" :loading="adding" :disabled="!tableToAdd" @click="submitAddTable">确认接入</el-button></template>
    </el-dialog>

    <el-dialog v-model="mappingDialogVisible" :title="`映射字段 · ${mappingForm.sourceFieldName}`" width="min(560px, calc(100vw - 32px))" destroy-on-close>
      <el-form ref="mappingFormRef" :model="mappingForm" :rules="mappingRules" label-position="top">
        <el-form-item label="业务字段编码" prop="code"><el-input v-model.trim="mappingForm.code" :disabled="editingMappedField" /></el-form-item>
        <el-form-item label="业务字段名称" prop="name"><el-input v-model.trim="mappingForm.name" /></el-form-item>
        <el-form-item label="数据类型" prop="dataType"><el-select v-model="mappingForm.dataType"><el-option v-for="type in SEMANTIC_DATA_TYPES" :key="type" :label="dataTypeLabel(type)" :value="type" /></el-select></el-form-item>
        <el-form-item v-if="needsDateFormat" label="源数据日期格式" prop="conversionFormat"><el-select v-model="mappingForm.conversionFormat"><el-option v-for="format in dateFormats" :key="format" :label="format" :value="format" /></el-select></el-form-item>
        <p class="mapping-validation-note">保存时最多检查 100 行样本，不代表全部源数据均可转换。</p>
        <el-form-item label="业务角色" prop="semanticKind"><el-select v-model="mappingForm.semanticKind"><el-option v-for="item in roleOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item><el-checkbox v-model="mappingForm.sensitive">敏感字段</el-checkbox></el-form-item>
      </el-form>
      <template #footer><el-button @click="mappingDialogVisible = false">取消</el-button><el-button v-access="'domain.physicalTables.create'" type="primary" :loading="mappingSaving" @click="submitMapping">保存映射</el-button></template>
    </el-dialog>

    <el-dialog v-model="valueSetDialogVisible" title="绑定值集" width="500px" destroy-on-close>
      <el-select v-model="selectedValueSetId" filterable clearable :loading="valueSetLoading" placeholder="选择已发布值集" class="dialog-select" @change="validateSelectedValueSet"><el-option v-for="item in valueSets" :key="item.id" :label="item.name || '未命名值集'" :value="String(item.id)" /></el-select>
      <template #footer><el-button @click="valueSetDialogVisible = false">取消</el-button><el-button v-access="'field.valueSet.update'" type="primary" :loading="valueSetSaving" :disabled="!selectedValueSetId" @click="saveValueSetBinding">保存</el-button></template>
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
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { ArrowLeft, Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { addPhysicalTable, bindPhysicalTableField, fetchDataDomains, fetchPhysicalTableFields, fetchPhysicalTables, fetchSemanticField, fetchSourceTableFields, fetchSourceTables, updateSemanticField } from '@/idmp/api/modules/meta'
import { adaptDataDomainList, adaptPhysicalTableList, adaptSemanticFieldList, adaptSourceFieldList, adaptSourceTableList } from '@/idmp/api/adapters/meta'
import { dataTypeLabel } from '@/idmp/features/meta/model'
import { buildSemanticFieldUpdate } from '@/idmp/features/meta/fieldUpdate'
import { applySemanticFieldDetails, defaultTimeFieldOptions } from '@/idmp/features/meta/defaultTimeFields'
import { SEMANTIC_DATA_TYPES } from '@/idmp/utils/validation'
import { bindSemanticFieldValueSet, fetchSemanticFieldValueSet, fetchValueSet, fetchValueSets } from '@/idmp/api/modules/valueSets'
import { fetchSourceValueProfile } from '@/idmp/api/modules/transformRules'

const route = useRoute()
const router = useRouter()
const domain = ref(null)
const physicalTables = ref([])
const sourceTables = ref([])
const sourceFields = ref([])
const fieldSearch = ref('')
const mappedFields = ref([])
const selectedTableName = ref('')
const loading = ref(false)
const fieldLoading = ref(false)
const sourceLoading = ref(false)
const adding = ref(false)
const mappingSaving = ref(false)
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
const mappingForm = reactive({ sourceFieldName: '', code: '', name: '', dataType: '', semanticKind: '', sensitive: false, conversionFormat: '' })
const mappingSourceType = ref('')
const dateFormats = ['yyyy-MM-dd', 'yyyy-MM-dd HH:mm:ss', 'yyyy/MM/dd', 'yyyy/MM/dd HH:mm:ss', 'yyyyMMdd']
const needsDateFormat = computed(() => ['DATE', 'DATETIME'].includes(mappingForm.dataType)
  && !['DATE', 'DATETIME'].includes(inferDataType(mappingSourceType.value)))
watch(() => mappingForm.dataType, () => {
  if (!needsDateFormat.value) mappingForm.conversionFormat = ''
  else if (!mappingForm.conversionFormat) mappingForm.conversionFormat = mappingForm.dataType === 'DATE' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss'
})
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
const filteredFieldRows = computed(() => {
  const keyword = fieldSearch.value.trim().toLowerCase()
  if (!keyword) return fieldRows.value
  return fieldRows.value.filter(row => [row.columnName, row.columnType, row.comment, row.mapped?.code, row.mapped?.name]
    .some(value => String(value ?? '').toLowerCase().includes(keyword)))
})
const errorMessage = computed(() => error.value?.message || '数据域读取失败')
const fieldErrorMessage = computed(() => fieldError.value?.message || '字段读取失败')
const sourceErrorMessage = computed(() => sourceError.value?.message || '来源目录读取失败')

onMounted(loadWorkspace)
watch(domainId, () => { fieldSearch.value = ''; loadWorkspace() })

async function loadWorkspace() {
  loading.value = true
  error.value = null
  try {
    const [domains, tables] = await Promise.all([fetchDataDomains(), fetchPhysicalTables(domainId.value)])
    domain.value = adaptDataDomainList(domains).find(item => item.id === domainId.value) || null
    physicalTables.value = adaptPhysicalTableList(tables)
    if (!physicalTables.value.some(table => table.tableName === selectedTableName.value)) { selectedTableName.value = ''; fieldSearch.value = '' }
    if (selectedTableName.value) await loadFields()
    else { sourceFields.value = []; mappedFields.value = [] }
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
  fieldSearch.value = ''
  sourceFields.value = []
  mappedFields.value = []
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
    const nextSourceFields = adaptSourceFieldList(source)
    const nextMappedFields = adaptSemanticFieldList(mapped)
    const timeCandidates = defaultTimeFieldOptions(nextMappedFields, nextSourceFields).filter(field => field.id)
    const details = await Promise.all(timeCandidates.map(field => fetchSemanticField(field.id)))
    if (request !== fieldRequest || tableName !== selectedTableName.value) return
    const detailById = new Map(timeCandidates.map((field, index) => [field.id, details[index]]))
    sourceFields.value = nextSourceFields
    mappedFields.value = applySemanticFieldDetails(nextMappedFields, detailById)
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

let mappingDialogRequest = 0
async function openMappingDialog(field) {
  const current = field.mapped
  mappingSourceType.value = field.columnType
  const request = ++mappingDialogRequest
  const tableName = selectedTableName.value
  let detail = null
  if (current?.id) {
    try { detail = await fetchSemanticField(current.id) }
    catch (cause) { ElMessage.error(cause?.message || '字段详情读取失败，无法编辑映射'); return }
    if (request !== mappingDialogRequest || tableName !== selectedTableName.value) return
  }
  editingMappedField.value = Boolean(current)
  const suggestedCode = String(field.columnName).toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  Object.assign(mappingForm, {
    sourceFieldName: field.columnName,
    code: current?.code || (/^[A-Z]/.test(suggestedCode) ? suggestedCode : `F_${suggestedCode}`).slice(0, 64),
    name: detail?.name || current?.name || field.comment || field.columnName,
    dataType: detail?.valueType || current?.dataType || inferDataType(field.columnType),
    semanticKind: detail?.semanticKind || current?.semanticKind || '',
    sensitive: detail?.sensitivityLevel ? detail.sensitivityLevel !== 'NONE' : Boolean(current?.sensitive),
    conversionFormat: detail?.conversionFormat || current?.conversionFormat || (current?.dataType === 'DATE' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm:ss')
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
    const sourceFieldName = mappingForm.sourceFieldName
    const fieldCode = mappingForm.code
    const existing = fieldRows.value.find(row => row.columnName === sourceFieldName)?.mapped
    const mappingPayload = { ...mappingForm, conversionFormat: needsDateFormat.value ? mappingForm.conversionFormat : null }
    if (editingMappedField.value && (needsDateFormat.value || existing?.conversionFormat)) {
      await bindPhysicalTableField(domainId.value, selectedTableName.value, mappingPayload)
    } else if (editingMappedField.value) {
      if (!existing?.id) throw new Error('当前映射缺少字段 ID，无法编辑；请重新进入物理表后重试。')
      const detail = await fetchSemanticField(existing.id)
      await updateSemanticField(existing.id, buildSemanticFieldUpdate(detail, mappingForm))
    } else {
      await bindPhysicalTableField(domainId.value, selectedTableName.value, mappingPayload)
    }
    await loadFields()
    if (fieldError.value) throw new Error('映射已提交，但字段回读失败；请重新进入物理表核对保存结果。')
    const saved = mappedFields.value.find(field => field.code === fieldCode && field.sourceFieldName === sourceFieldName)
    if (!saved || String(saved.dataType).toUpperCase() !== mappingForm.dataType || saved.semanticKind !== mappingForm.semanticKind || saved.name !== mappingForm.name) {
      throw new Error('字段配置保存后核对失败，请刷新确认；若持续失败，请联系管理员。')
    }
    mappingDialogVisible.value = false
    ElMessage.success('字段映射已保存')
  } catch (cause) { ElMessage.error(cause?.message || '字段映射保存失败') }
  finally { mappingSaving.value = false }
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
.data-domain-workspace { min-width: 0; }
.domain-overview { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 16px; padding: 18px 20px; }
.domain-overview__main { min-width: 0; }
.domain-overview__eyebrow { color: var(--idmp-text-helper); font-size: 12px; }
.domain-overview__title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 6px; }
.domain-overview__title h2 { margin: 0; font-size: 18px; line-height: 26px; }
.domain-overview__main p { margin: 6px 0 0; color: var(--idmp-text-secondary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.domain-overview__count { display: grid; flex: 0 0 auto; justify-items: center; gap: 2px; min-width: 110px; padding-left: 20px; border-left: 1px solid var(--idmp-border-subtle); }
.domain-overview__count strong { color: var(--idmp-text-primary); font-size: 24px; font-variant-numeric: tabular-nums; }
.domain-overview__count span { color: var(--idmp-text-helper); font-size: 12px; }
.workspace-section { min-width: 0; overflow: hidden; }
.workspace-section + .workspace-section { margin-top: 16px; }
.section-title--toolbar, .toolbar-actions { display: flex; align-items: center; gap: 12px; }
.section-title--toolbar { justify-content: space-between; margin: 0; padding: 16px 18px; border-bottom: 1px solid var(--idmp-border-subtle); }
.section-title--toolbar h2 { margin: 0; font-size: 16px; }
.section-title__description { margin: 5px 0 0; color: var(--idmp-text-helper); font-size: 12px; }
.toolbar-actions { flex-wrap: wrap; justify-content: flex-end; }
.workspace-section__body { padding: 18px; }
.field-search-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--idmp-border-subtle); }
.field-search-bar .el-input { width: min(380px, 100%); }
.field-search-bar span { flex: 0 0 auto; color: var(--idmp-text-helper); font-size: 12px; }
.workspace-table-scroll { overflow-x: auto; padding: 0 18px 16px; }
.workspace-table-scroll :deep(.el-table) { min-width: 760px; }
.workspace-section--fields .workspace-table-scroll :deep(.el-table) { min-width: 1000px; }
.el-table small { display: block; color: var(--idmp-text-helper); }
.dialog-select { width: 100%; }
.mapping-validation-note { margin: 0 0 18px; color: var(--idmp-text-secondary); font-size: 13px; line-height: 1.5; }
@media (max-width: 720px) {
  .domain-overview { align-items: flex-start; flex-direction: column; padding: 16px; }
  .domain-overview__count { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 12px 0 0; border-top: 1px solid var(--idmp-border-subtle); border-left: 0; }
  .section-title--toolbar { align-items: flex-start; flex-direction: column; padding: 14px 16px; }
  .toolbar-actions { justify-content: flex-start; }
  .workspace-section__body { padding: 16px; }
  .field-search-bar { align-items: stretch; flex-direction: column; padding: 12px 16px; }
  .field-search-bar .el-input { width: 100%; }
  .workspace-table-scroll { padding: 0 16px 14px; }
}
</style>
