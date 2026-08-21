<template>
  <div class="idmp-page data-domain-workspace">
      <PageHeader title="数据域工作台">
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">按步骤完成实体接入、字段映射和时间口径配置</span>
      </template>
      <template #actions>
        <el-button @click="router.push({ name: 'DataDomainManagement' })">返回数据域目录</el-button>
          <el-button :loading="tableLoading" @click="loadSemanticTables">刷新语义表</el-button>
      </template>
    </PageHeader>

    <StatePanel v-if="domainLoading" type="loading" title="正在加载数据域" />
    <StatePanel v-else-if="domainError" :type="stateTypeForError(domainError)" title="数据域加载失败" :description="domainErrorMessage" />
    <StatePanel v-else-if="!domain" type="empty" title="数据域不存在" description="请返回数据域目录重新选择。" />
    <template v-else>
      <section class="surface-card domain-summary">
        <div class="summary-heading">
          <div><span class="eyebrow">数据域</span><h2>{{ domain.name }}</h2><code>{{ domain.code }}</code></div>
          <StatusBadge :status="domain.status" />
        </div>
        <dl class="summary-grid">
          <div><dt>ID</dt><dd class="mono-data">{{ domain.id }}</dd></div>
          <div><dt>说明</dt><dd>{{ domain.description || '—' }}</dd></div>
          <div><dt>创建时间</dt><dd>{{ domain.createdAt || '—' }}</dd></div>
        </dl>
      </section>

      <section class="surface-card model-progress-card">
        <div class="section-title"><div><h2>模型建设进度</h2><p class="section-title__description">当前阶段先完成来源接入和语义映射，发布与影响分析待后端能力接入</p></div></div>
        <div class="model-progress-steps">
          <div class="model-progress-step is-done"><b>1</b><span>数据域</span></div><i>→</i>
          <div class="model-progress-step is-done"><b>2</b><span>语义表</span></div><i>→</i>
          <div class="model-progress-step" :class="{ 'is-current': selectedTable }"><b>3</b><span>字段映射</span></div><i>→</i>
          <div class="model-progress-step"><b>4</b><span>校验发布</span></div>
        </div>
      </section>

      <section class="surface-card table-card">
        <div class="section-title section-title--toolbar">
          <div>
            <h2>语义表</h2>
            <p class="section-title__description">GET /api/v1/meta/data-domains/{domainId}/semantic-tables</p>
          </div>
          <div class="toolbar-meta">
            <span class="table-count">共 {{ semanticTables.length }} 张</span>
            <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建语义表</el-button>
          </div>
        </div>

        <StatePanel v-if="tableLoading" type="loading" title="正在加载语义表" />
        <StatePanel
          v-else-if="tableError"
          :type="stateTypeForError(tableError)"
          title="语义表加载失败"
          :description="tableErrorMessage"
        >
          <template #actions><el-button @click="loadSemanticTables">重试加载</el-button></template>
        </StatePanel>
        <StatePanel
          v-else-if="!semanticTables.length"
          type="empty"
          title="当前数据域没有语义表"
          description="请从已同步的源表中创建第一张语义表。"
        >
          <template #actions><el-button type="primary" @click="openCreateDialog">新建语义表</el-button></template>
        </StatePanel>
        <el-table
          v-else
          :data="semanticTables"
          :current-row-key="selectedTable?.id"
          row-key="id"
          highlight-current-row
          table-layout="fixed"
          @row-click="selectSemanticTable"
        >
          <el-table-column label="ID" width="205">
            <template #default="{ row }"><span class="mono-data">{{ row.id }}</span></template>
          </el-table-column>
          <el-table-column prop="code" label="语义表编码" min-width="210" show-overflow-tooltip />
          <el-table-column prop="name" label="语义表名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="sourceTableName" label="来源物理表" min-width="220" show-overflow-tooltip />
          <el-table-column prop="sourceObjectType" label="源对象类型" width="140">
            <template #default="{ row }">{{ sourceObjectTypeLabel(row.sourceObjectType) || '—' }}</template>
          </el-table-column>
          <el-table-column prop="defaultTimeSemanticFieldCode" label="默认时间字段" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.defaultTimeSemanticFieldCode || '未配置' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }"><el-button link type="primary" @click.stop="selectSemanticTable(row)">查看</el-button></template>
          </el-table-column>
        </el-table>
      </section>

      <section class="surface-card selected-table-card">
        <div class="section-title">
          <div>
            <h2>当前语义表上下文</h2>
            <p class="section-title__description">先选择一张语义表，再在下方完成物理字段到业务字段的映射</p>
          </div>
          <span class="selected-context">{{ selectedTable?.code || '未选择语义表' }}</span>
        </div>
        <StatePanel
          v-if="!selectedTable"
          type="empty"
          title="请显式选择一张语义表"
          description="当数据域包含多张语义表时，页面不会自动把第一张表当作数据域字段来源。"
        />
        <dl v-else class="selected-grid">
          <div><dt>编码</dt><dd class="mono-data">{{ selectedTable.code }}</dd></div>
          <div><dt>名称</dt><dd>{{ selectedTable.name }}</dd></div>
          <div><dt>来源物理表</dt><dd class="mono-data">{{ selectedTable.sourceTableName || '—' }}</dd></div>
          <div><dt>默认时间字段</dt><dd class="mono-data">{{ selectedTable.defaultTimeSemanticFieldCode || '未配置' }}</dd></div>
          <div><dt>状态</dt><dd><StatusBadge :status="selectedTable.status" /></dd></div>
        </dl>
      </section>

      <section v-if="selectedTable" class="surface-card field-mapping-card">
        <div class="section-title section-title--toolbar">
          <div>
            <h2>语义字段映射</h2>
            <p class="section-title__description">当前语义表：{{ selectedTable.code }} · 已映射 {{ semanticFields.length }} / {{ sourceFields.length }} 个来源字段</p>
          </div>
          <StatusBadge v-if="fieldSaveFeedback" :status="fieldSaveFeedback.status" :label="fieldSaveFeedback.label" :tone="fieldSaveFeedback.tone" />
        </div>

        <div class="field-mapping-grid">
          <div class="field-pane">
              <div class="field-pane__heading"><div class="field-pane__heading-main"><strong>来源字段</strong><span>{{ filteredSourceFields.length }} / {{ sourceFields.length }} 个 · 点击一行开始映射</span></div><el-input v-model.trim="sourceFieldKeyword" class="field-search-input" size="small" clearable placeholder="搜索字段名、注释或类型" aria-label="搜索来源字段" /></div>
            <StatePanel v-if="fieldLoading" type="loading" title="正在加载字段" />
            <StatePanel v-else-if="fieldError" :type="stateTypeForError(fieldError)" title="物理字段加载失败" :description="fieldErrorMessage" />
            <StatePanel v-else-if="!sourceFields.length" type="empty" title="暂无物理字段" description="请确认源表元数据已经同步。" />
            <StatePanel v-else-if="!filteredSourceFields.length" type="empty" title="没有匹配的来源字段" description="请调整搜索关键词或清空搜索条件。" />
            <div v-else class="mapping-table-scroll">
            <el-table :data="filteredSourceFields" row-key="columnName" highlight-current-row table-layout="fixed" @row-click="selectSourceField">
              <el-table-column label="源字段" min-width="230" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="source-field-cell"><small>{{ row.comment || '暂无字段中文注释' }}</small><strong>{{ row.columnName }}</strong></div>
                </template>
              </el-table-column>
              <el-table-column label="物理类型" width="125"><template #default="{ row }">{{ physicalDataTypeLabel(row.columnType) }}</template></el-table-column>
              <el-table-column label="映射状态" width="120">
                <template #default="{ row }"><StatusBadge :status="isMapped(row) ? 'MAPPED' : 'UNMAPPED'" :label="isMapped(row) ? '已映射' : '未映射'" :tone="isMapped(row) ? 'success' : 'neutral'" /></template>
              </el-table-column>
            </el-table>
            </div>
          </div>

          <div class="field-pane">
              <div class="field-pane__heading"><div class="field-pane__heading-main"><strong>标准业务字段</strong><span>{{ filteredSemanticFields.length }} / {{ semanticFields.length }} 个</span></div><el-input v-model.trim="semanticFieldKeyword" class="field-search-input" size="small" clearable placeholder="搜索字段名称、编码或来源字段" aria-label="搜索标准业务字段" /></div>
            <StatePanel v-if="fieldLoading" type="loading" title="正在加载语义字段" />
            <StatePanel v-else-if="fieldError" :type="stateTypeForError(fieldError)" title="语义字段加载失败" :description="fieldErrorMessage" />
            <StatePanel v-else-if="!semanticFields.length" type="empty" title="暂无语义字段" description="从左侧选择源字段开始建立映射。" />
            <StatePanel v-else-if="!filteredSemanticFields.length" type="empty" title="没有匹配的标准业务字段" description="请调整搜索关键词或清空搜索条件。" />
            <div v-else class="mapping-table-scroll">
            <el-table :data="filteredSemanticFields" row-key="id" table-layout="fixed">
              <el-table-column prop="sourceFieldName" label="来源字段" min-width="135" show-overflow-tooltip>
                <template #default="{ row }">{{ row.sourceFieldName || '未返回映射来源' }}</template>
              </el-table-column>
              <el-table-column label="标准业务字段" min-width="165" show-overflow-tooltip>
                <template #default="{ row }"><div class="semantic-field-cell"><strong>{{ row.name || '未命名字段' }}</strong><small>{{ row.code || '未返回编码' }}</small></div></template>
              </el-table-column>
              <el-table-column label="类型" width="88"><template #default="{ row }">{{ semanticDataTypeLabel(row.dataType) || '未知类型' }}</template></el-table-column>
              <el-table-column label="业务角色" width="86"><template #default="{ row }">{{ semanticKindLabel(row.semanticKind) || '未配置' }}</template></el-table-column>
              <el-table-column prop="sensitive" label="敏感" width="58">
                <template #default="{ row }">{{ row.sensitive ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="112" fixed="right">
                <template #default="{ row }">
                  <div class="field-actions">
                    <div class="field-action-row"><el-button v-if="row.sourceFieldMappingId && isDimensionField(row)" link type="primary" @click="openStandardization(row)">标准化</el-button><span v-else class="field-action-disabled">{{ row.sourceFieldMappingId ? '非维度' : '未映射' }}</span></div>
                    <div class="field-action-row"><el-button v-if="isDimensionField(row)" link type="primary" @click.stop="openValueSetBinding(row)">绑定值集</el-button><span v-else class="field-action-disabled">非维度</span></div>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            </div>
          </div>
        </div>

        <div class="mapping-editor">
          <div class="field-pane__heading"><strong>新增或更新映射</strong><span>{{ selectedSourceField ? `${selectedSourceField.columnName} · ${selectedSourceField.comment || '暂无中文注释'}` : '请先选择左侧源字段' }}</span></div>
          <el-alert class="semantic-role-alert" type="info" :closable="false" show-icon title="业务角色决定字段用途：维度字段可筛选、分组并绑定值集；度量字段用于数值聚合；属性字段只承载描述信息。数据类型与业务角色需要分别选择。" />
          <el-form ref="fieldFormRef" :model="fieldForm" :rules="fieldRules" label-position="top" :disabled="!selectedSourceField">
            <div class="field-form-grid">
              <el-form-item label="来源字段" prop="sourceFieldName"><el-input v-model="fieldForm.sourceFieldName" readonly /></el-form-item>
              <el-form-item label="标准字段编码" prop="code"><el-input v-model.trim="fieldForm.code" maxlength="64" show-word-limit placeholder="如 DEATH_DATETIME" /></el-form-item>
              <el-form-item label="业务名称" prop="name"><el-input v-model.trim="fieldForm.name" placeholder="如 死亡时间" /></el-form-item>
              <el-form-item label="标准数据类型" prop="dataType"><el-select v-model="fieldForm.dataType" placeholder="选择数据类型"><el-option v-for="item in semanticDataTypes" :key="item" :label="semanticDataTypeLabel(item)" :value="item" /></el-select></el-form-item>
              <el-form-item label="业务角色" prop="semanticKind"><el-select v-model="fieldForm.semanticKind" placeholder="选择业务角色"><el-option v-for="item in semanticKinds" :key="item" :label="semanticKindOptionLabel(item)" :value="item" /></el-select></el-form-item>
              <el-form-item label="敏感信息" prop="sensitive"><el-switch v-model="fieldForm.sensitive" active-text="是" inactive-text="否" /></el-form-item>
            </div>
            <div class="mapping-actions">
              <span class="field-help">不接受 SQL 或跨表字段；保存对象始终属于当前语义表。</span>
              <el-button type="primary" :loading="fieldSaveLoading" :disabled="!selectedSourceField" @click="saveFieldMapping">保存字段映射</el-button>
            </div>
          </el-form>
        </div>

        <div class="default-time-editor">
          <div><strong>默认时间字段</strong><p>只能选择当前语义表已映射的日期或日期时间字段。</p></div>
          <el-select v-model="defaultTimeFieldCode" :disabled="!timeFieldOptions.length || defaultTimeLoading" placeholder="未配置默认时间字段">
            <el-option v-for="item in timeFieldOptions" :key="item.code" :label="`${item.code}（${item.name}）`" :value="item.code" />
          </el-select>
          <el-button :loading="defaultTimeLoading" :disabled="!selectedTable || !timeFieldOptions.length" @click="saveDefaultTimeField">保存默认时间字段</el-button>
        </div>
      </section>
    </template>

    <el-dialog v-model="createDialogVisible" title="新建语义表" width="560px" destroy-on-close>
      <div class="dialog-api-note">POST /api/v1/meta/data-domains/{{ domain?.id }}/semantic-tables</div>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="来源物理表" prop="sourceTableName">
          <el-select v-model="createForm.sourceTableName" filterable placeholder="选择已同步源表" :loading="sourceLoading">
            <el-option v-for="item in sourceTables" :key="item.tableName" :label="sourceTableLabel(item)" :value="item.tableName" />
          </el-select>
          <div v-if="!sourceLoading && !sourceTables.length" class="field-help">暂无已同步源表，请先到“来源元数据”页面执行同步。</div>
        </el-form-item>
        <el-form-item label="语义表编码" prop="code">
          <el-input v-model.trim="createForm.code" placeholder="如 INPATIENT_DEATH_RECORD" />
          <div class="field-help">仅允许大写字母、数字和下划线，且必须以字母开头。</div>
        </el-form-item>
        <el-form-item label="语义表名称" prop="name"><el-input v-model.trim="createForm.name" placeholder="请输入语义表名称" /></el-form-item>
      </el-form>
      <div v-if="createError" class="create-error"><StatePanel :type="stateTypeForError(createError)" title="语义表创建失败" :description="createErrorMessage" /></div>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="createLoading" :disabled="!sourceTables.length" @click="submitCreate">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="valueSetDialogVisible" title="绑定语义字段值集" width="560px" destroy-on-close>
      <StatePanel v-if="valueSetBindingLoading" type="loading" title="正在加载值集绑定信息" />
      <template v-else>
        <p class="field-help">字段：{{ selectedValueSetField?.code || '—' }} · 仅可绑定已发布值集。</p>
        <el-select v-model="selectedValueSetId" filterable clearable placeholder="选择已发布值集" style="width: 100%">
          <el-option v-for="item in valueSetOptions" :key="item.id" :label="`${item.code} · ${item.name}`" :value="String(item.id)" />
        </el-select>
        <div v-if="valueSetBinding" class="binding-summary">当前绑定：{{ valueSetBinding.valueSet?.code || '未绑定' }} · 资源版本 {{ valueSetBinding.semanticField?.resourceVersion ?? selectedValueSetField?.resourceVersion ?? '—' }}</div>
      </template>
      <template #footer><el-button @click="valueSetDialogVisible = false">取消</el-button><el-button type="primary" :loading="valueSetBindingSaving" :disabled="!selectedValueSetId" @click="saveValueSetBinding">确认绑定</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { createSemanticTable, fetchDataDomains, fetchSemanticTableFields, fetchSemanticTables, fetchSourceTableFields, fetchSourceTables, saveSemanticField, updateDefaultTimeField } from '@/idmp/api/modules/meta'
import { fetchSemanticFieldValueSet, bindSemanticFieldValueSet, fetchValueSets } from '@/idmp/api/modules/valueSets'
import { adaptDataDomainList, adaptSemanticFieldList, adaptSemanticTableList, adaptSourceFieldList, adaptSourceTableList, normalizeSemanticTable } from '@/idmp/api/adapters/meta'
import { dataTypeLabel as semanticDataTypeLabel, semanticKindLabel, sourceObjectTypeLabel } from '@/idmp/features/meta'

const route = useRoute()
const router = useRouter()
const domain = ref(null)
const semanticTables = ref([])
const sourceTables = ref([])
const selectedTable = ref(null)
const selectedTableCode = ref('')
const selectedSourceField = ref(null)
const sourceFields = ref([])
const semanticFields = ref([])
const sourceFieldKeyword = ref('')
const semanticFieldKeyword = ref('')
const defaultTimeFieldCode = ref('')
const fieldFormRef = ref(null)
const domainLoading = ref(false)
const tableLoading = ref(false)
const sourceLoading = ref(false)
const fieldLoading = ref(false)
const fieldSaveLoading = ref(false)
const defaultTimeLoading = ref(false)
const createLoading = ref(false)
const domainError = ref(null)
const tableError = ref(null)
const fieldError = ref(null)
const fieldSaveFeedback = ref(null)
const createError = ref(null)
const createDialogVisible = ref(false)
const createFormRef = ref(null)
const valueSetDialogVisible = ref(false)
const valueSetBindingLoading = ref(false)
const valueSetBindingSaving = ref(false)
const selectedValueSetField = ref(null)
const valueSetBinding = ref(null)
const valueSetOptions = ref([])
const selectedValueSetId = ref('')
const tableRequestVersion = ref(0)
const fieldRequestVersion = ref(0)
const createForm = reactive({ sourceTableName: '', code: '', name: '' })
const fieldForm = reactive({ sourceFieldName: '', code: '', name: '', dataType: '', semanticKind: '', sensitive: false })
const semanticDataTypes = ['STRING', 'INTEGER', 'DECIMAL', 'DATE', 'DATETIME', 'BOOLEAN', 'CODE']
const semanticKinds = ['DIMENSION', 'MEASURE', 'ATTRIBUTE']

const createRules = {
  sourceTableName: [{ required: true, message: '请选择已同步源表', trigger: 'change' }],
  code: [
    { required: true, message: '请输入语义表编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]*$/, message: '编码仅允许大写字母、数字和下划线，且必须以字母开头', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入语义表名称', trigger: 'blur' }]
}

const domainErrorMessage = computed(() => formatErrorMessage(domainError.value, '数据域加载失败'))
const tableErrorMessage = computed(() => formatErrorMessage(tableError.value, '语义表加载失败'))
const createErrorMessage = computed(() => formatErrorMessage(createError.value, '语义表创建失败'))
const fieldErrorMessage = computed(() => formatErrorMessage(fieldError.value, '字段加载失败'))
const timeFieldOptions = computed(() => semanticFields.value.filter((item) => item.dataType === 'DATE' || item.dataType === 'DATETIME'))
const filteredSourceFields = computed(() => {
  const keyword = sourceFieldKeyword.value.trim().toLowerCase()
  if (!keyword) return sourceFields.value
  return sourceFields.value.filter((item) => [item.columnName, item.comment, item.columnType].some((value) => String(value || '').toLowerCase().includes(keyword)))
})
const filteredSemanticFields = computed(() => {
  const keyword = semanticFieldKeyword.value.trim().toLowerCase()
  if (!keyword) return semanticFields.value
  return semanticFields.value.filter((item) => [item.sourceFieldName, item.code, item.name, item.dataType].some((value) => String(value || '').toLowerCase().includes(keyword)))
})

const fieldRules = {
  sourceFieldName: [{ required: true, message: '请选择源字段', trigger: 'change' }],
  code: [
    { required: true, message: '请输入语义字段编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]{0,63}$/, message: '编码仅允许大写字母、数字和下划线，且长度不超过 64', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入语义字段名称', trigger: 'blur' }],
  dataType: [{ required: true, message: '请选择语义数据类型', trigger: 'change' }],
  semanticKind: [{ required: true, message: '请选择业务角色', trigger: 'change' }]
}

onMounted(loadWorkspace)

async function loadWorkspace() {
  await Promise.all([loadDomain(), loadSemanticTables(), loadSourceTables()])
}

async function loadDomain() {
  domainLoading.value = true
  domainError.value = null
  try {
    const id = String(route.params.id || '')
    domain.value = adaptDataDomainList(await fetchDataDomains()).find((item) => item.id === id) || null
  } catch (error) {
    domainError.value = error
    ElMessage.error(domainErrorMessage.value)
  } finally {
    domainLoading.value = false
  }
}

async function loadSemanticTables() {
  const requestVersion = tableRequestVersion.value + 1
  tableRequestVersion.value = requestVersion
  tableLoading.value = true
  tableError.value = null
  try {
    const domainId = String(route.params.id || '')
    const rows = adaptSemanticTableList(await fetchSemanticTables(domainId))
    if (requestVersion !== tableRequestVersion.value) return
    semanticTables.value = rows
    if (selectedTableCode.value) {
      const current = rows.find((item) => item.code === selectedTableCode.value)
      selectedTable.value = current || null
      if (!current) selectedTableCode.value = ''
    }
    return true
  } catch (error) {
    if (requestVersion !== tableRequestVersion.value) return
    semanticTables.value = []
    tableError.value = error
    ElMessage.error(tableErrorMessage.value)
    return false
  } finally {
    if (requestVersion === tableRequestVersion.value) tableLoading.value = false
  }
}

async function loadSourceTables() {
  sourceLoading.value = true
  try {
    sourceTables.value = adaptSourceTableList(await fetchSourceTables())
  } catch (error) {
    sourceTables.value = []
    ElMessage.warning(formatErrorMessage(error, '已同步源表加载失败'))
  } finally {
    sourceLoading.value = false
  }
}

function selectSemanticTable(row) {
  selectedTableCode.value = row?.code || ''
  selectedTable.value = row || null
  selectedSourceField.value = null
  sourceFields.value = []
  semanticFields.value = []
  sourceFieldKeyword.value = ''
  semanticFieldKeyword.value = ''
  fieldError.value = null
  fieldSaveFeedback.value = null
  defaultTimeFieldCode.value = row?.defaultTimeSemanticFieldCode || ''
  resetFieldForm()
  if (row) loadSelectedTableFields(row)
}

async function loadSelectedTableFields(row) {
  const requestVersion = fieldRequestVersion.value + 1
  fieldRequestVersion.value = requestVersion
  fieldLoading.value = true
  fieldError.value = null
  try {
    const domainId = String(route.params.id || '')
    const [physicalFields, mappedFields] = await Promise.all([
      fetchSourceTableFields(row.sourceTableName),
      fetchSemanticTableFields(domainId, row.code)
    ])
    if (requestVersion !== fieldRequestVersion.value || selectedTableCode.value !== row.code) return
    sourceFields.value = adaptSourceFieldList(physicalFields)
    semanticFields.value = adaptSemanticFieldList(mappedFields)
    defaultTimeFieldCode.value = selectedTable.value?.defaultTimeSemanticFieldCode || ''
  } catch (error) {
    if (requestVersion !== fieldRequestVersion.value || selectedTableCode.value !== row.code) return
    sourceFields.value = []
    semanticFields.value = []
    fieldError.value = error
    ElMessage.error(fieldErrorMessage.value)
  } finally {
    if (requestVersion === fieldRequestVersion.value) fieldLoading.value = false
  }
}

function selectSourceField(row) {
  selectedSourceField.value = row
  const existing = semanticFields.value.find((item) => item.sourceFieldName === row.columnName)
  Object.assign(fieldForm, {
    sourceFieldName: row.columnName,
    code: existing?.code || '',
    name: existing?.name || row.comment || row.columnName,
    dataType: existing?.dataType || inferSemanticDataType(row.columnType),
    semanticKind: existing?.semanticKind || '',
    sensitive: existing?.sensitive || false
  })
  fieldSaveFeedback.value = null
}

function openStandardization(row) {
  if (!isDimensionField(row)) {
    ElMessage.warning('当前字段的业务角色不是“维度”，不能维护枚举值标准化规则；请使用后端已配置的维度字段。')
    return
  }
  router.push({
    name: 'SourceStandardization',
      params: { mappingId: row.sourceFieldMappingId },
      query: { sourceField: row.sourceFieldName || row.code, fieldId: row.id || undefined }
  })
}

async function openValueSetBinding(row) {
  if (!row?.id) return
  if (!isDimensionField(row)) {
    ElMessage.warning('只有后端明确标记为“维度”的语义字段可以绑定值集；编码或文本数据类型不会自动成为维度字段。')
    return
  }
  selectedValueSetField.value = row
  valueSetDialogVisible.value = true
  valueSetBindingLoading.value = true
  try {
    const [binding, valueSets] = await Promise.all([
      fetchSemanticFieldValueSet(row.id),
      fetchValueSets({ status: 'PUBLISHED', page: 1, size: 200 })
    ])
    valueSetBinding.value = binding || null
    valueSetOptions.value = valueSets?.records || valueSets?.items || []
    selectedValueSetId.value = String(binding?.valueSet?.id || binding?.valueSetId || '')
  } catch (error) {
    valueSetBinding.value = null
    ElMessage.error(formatErrorMessage(error, '值集绑定信息加载失败'))
  } finally {
    valueSetBindingLoading.value = false
  }
}

async function saveValueSetBinding() {
  if (!selectedValueSetField.value || valueSetBindingSaving.value) return
  valueSetBindingSaving.value = true
  try {
    const resourceVersion = valueSetBinding.value?.semanticField?.resourceVersion ?? selectedValueSetField.value.resourceVersion
    await bindSemanticFieldValueSet(selectedValueSetField.value.id, {
      resourceVersion: resourceVersion ?? 0,
      valueSetId: selectedValueSetId.value
    })
    valueSetDialogVisible.value = false
    ElMessage.success('值集绑定成功')
    await loadSelectedTableFields(selectedTable.value)
  } catch (error) {
    ElMessage.error(formatErrorMessage(error, '值集绑定失败'))
  } finally {
    valueSetBindingSaving.value = false
  }
}

function isMapped(row) {
  return semanticFields.value.some((item) => item.sourceFieldName === row.columnName)
}

function isDimensionField(row) {
  return String(row?.semanticKind || row?.semanticRole || '').toUpperCase() === 'DIMENSION'
}

function resetFieldForm() {
  Object.assign(fieldForm, { sourceFieldName: '', code: '', name: '', dataType: '', semanticKind: '', sensitive: false })
}

function inferSemanticDataType(columnType) {
  const type = String(columnType || '').toUpperCase()
  if (type.includes('DATE') || type.includes('TIME')) return type.includes('TIME') ? 'DATETIME' : 'DATE'
  if (type.includes('BOOL')) return 'BOOLEAN'
  if (type.includes('DECIMAL') || type.includes('NUMBER') || type.includes('DOUBLE') || type.includes('FLOAT')) return 'DECIMAL'
  if (type.includes('INT')) return 'INTEGER'
  return 'STRING'
}

async function saveFieldMapping() {
  if (fieldSaveLoading.value || !selectedTable.value || !selectedSourceField.value) return
  const valid = await fieldFormRef.value?.validate().catch(() => false)
  if (!valid) return
  fieldSaveLoading.value = true
  fieldSaveFeedback.value = { status: 'RUNNING', label: '保存中', message: '正在保存当前源字段映射。' }
  try {
    await saveSemanticField(String(route.params.id), selectedTable.value.code, {
      sourceFieldName: fieldForm.sourceFieldName,
      code: fieldForm.code,
      name: fieldForm.name,
      dataType: fieldForm.dataType,
      semanticKind: fieldForm.semanticKind,
      sensitive: fieldForm.sensitive
    })
    await loadSelectedTableFields(selectedTable.value)
    const savedField = semanticFields.value.find((item) => item.sourceFieldName === fieldForm.sourceFieldName)
    if (String(savedField?.semanticKind || '').toUpperCase() === fieldForm.semanticKind) {
      fieldSaveFeedback.value = { status: 'SUCCEEDED', label: '保存成功', message: `字段 ${fieldForm.sourceFieldName} 已完成映射，业务角色为 ${semanticKindLabel(fieldForm.semanticKind)}。` }
      ElMessage.success('语义字段映射保存成功')
    } else {
      fieldSaveFeedback.value = { status: 'WARNING', label: '角色未生效', tone: 'warning', message: `字段 ${fieldForm.sourceFieldName} 已映射，但后端返回的业务角色与本次选择不一致。` }
      ElMessage.warning('字段映射已保存，但业务角色未生效；请刷新后核对接口返回的业务角色。')
    }
  } catch (error) {
    fieldSaveFeedback.value = { status: 'FAILED', label: '保存失败', tone: 'danger', message: formatErrorMessage(error, '语义字段映射保存失败') }
    ElMessage.error(fieldSaveFeedback.value.message)
  } finally {
    fieldSaveLoading.value = false
  }
}

async function saveDefaultTimeField() {
  if (defaultTimeLoading.value || !selectedTable.value) return
  const option = timeFieldOptions.value.find((item) => item.code === defaultTimeFieldCode.value)
  if (defaultTimeFieldCode.value && !option) {
    ElMessage.warning('默认时间字段只能选择当前语义表已映射的日期或日期时间字段')
    return
  }
  defaultTimeLoading.value = true
  try {
    await updateDefaultTimeField(String(route.params.id), selectedTable.value.code, { semanticFieldCode: defaultTimeFieldCode.value })
    const previousCode = selectedTableCode.value
    await loadSemanticTables()
    const updated = semanticTables.value.find((item) => item.code === previousCode)
    if (updated) {
      selectedTable.value = updated
      defaultTimeFieldCode.value = updated.defaultTimeSemanticFieldCode || ''
    }
    ElMessage.success('默认时间字段保存成功')
  } catch (error) {
    ElMessage.error(formatErrorMessage(error, '默认时间字段保存失败'))
  } finally {
    defaultTimeLoading.value = false
  }
}

async function openCreateDialog() {
  createError.value = null
  createForm.sourceTableName = ''
  createForm.code = ''
  createForm.name = ''
  if (!sourceTables.value.length && !sourceLoading.value) await loadSourceTables()
  createDialogVisible.value = true
}

async function submitCreate() {
  if (createLoading.value) return
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    await ElMessageBox.confirm(
      `确认将源表 ${createForm.sourceTableName} 接入当前数据域，并创建语义表 ${createForm.code}？`,
      '确认创建语义表',
      { confirmButtonText: '确认创建', cancelButtonText: '返回修改', type: 'warning' }
    )
  } catch {
    return
  }

  createLoading.value = true
  createError.value = null
  try {
    const created = normalizeSemanticTable(await createSemanticTable(String(route.params.id), {
      sourceTableName: createForm.sourceTableName,
      code: createForm.code,
      name: createForm.name
    }))
    createDialogVisible.value = false
    const refreshed = await loadSemanticTables()
    if (!refreshed) throw tableError.value || new Error('语义表创建成功，但列表刷新失败')
    const createdRow = semanticTables.value.find((item) => item.id === created.id || item.code === created.code)
    if (createdRow) selectSemanticTable(createdRow)
    ElMessage.success(`语义表 ${created.code} 创建成功`)
  } catch (error) {
    createError.value = error
    ElMessage.error(createErrorMessage.value)
  } finally {
    createLoading.value = false
  }
}

function sourceTableLabel(item) {
  return item.comment ? `${item.tableName}（${item.comment}）` : item.tableName
}

function physicalDataTypeLabel(value) {
  return ({ STRING: '文本（STRING）', INTEGER: '整数（INTEGER）', DECIMAL: '小数（DECIMAL）', NUMBER: '数值（NUMBER）', DATE: '日期（DATE）', DATETIME: '日期时间（DATETIME）', BOOLEAN: '布尔（BOOLEAN）', CODE: '编码（CODE）' })[String(value || '').toUpperCase()] || value || '未知类型'
}

function semanticKindOptionLabel(value) {
  return ({ DIMENSION: '维度（筛选、分组、值集）', MEASURE: '度量（数值聚合）', ATTRIBUTE: '属性（描述信息）' })[value] || value
}

function stateTypeForError(error) {
  if (error?.status === 401 || error?.status === 403) return 'permission'
  if (error?.status === 404 || error?.status === 501 || error?.status === 503) return 'unavailable'
  return 'error'
}

function formatErrorMessage(error, fallback) {
  if (!error) return fallback
  const traceId = error.payload?.traceId
  let message = error.payload?.message || error.message || fallback
  if (error.status === 409) message = `语义表编码已存在或发生版本冲突：${message}`
  if (error.status === 403) message = `当前账号无权执行此操作：${message}`
  return traceId && !String(message).includes(traceId) ? `${message}（traceId: ${traceId}）` : String(message)
}
</script>

<style scoped lang="scss">
.data-domain-workspace { display: flex; flex-direction: column; gap: 16px; }
.model-progress-card { padding: 18px; }
.model-progress-steps { display: flex; align-items: center; gap: 14px; }
.model-progress-steps > i { color: var(--idmp-text-helper); font-style: normal; }
.model-progress-step { display: flex; align-items: center; gap: 8px; color: var(--idmp-text-helper); font-size: 13px; }
.model-progress-step b { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; background: var(--idmp-layer-02); border: 1px solid var(--idmp-border-subtle); font-weight: 500; }
.model-progress-step.is-done, .model-progress-step.is-current { color: var(--idmp-text-primary); }
.model-progress-step.is-done b { background: var(--idmp-brand); border-color: var(--idmp-brand); color: #fff; }
.model-progress-step.is-current b { border-color: var(--idmp-brand); color: var(--idmp-brand); }
.domain-summary, .table-card, .selected-table-card { padding: 18px; }
.summary-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.summary-heading h2 { margin: 4px 0; font-size: 20px; }
.summary-heading code { color: var(--idmp-text-secondary); font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
.eyebrow { color: var(--idmp-text-helper); font-size: 12px; }
.summary-grid, .selected-grid { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 16px; margin: 24px 0 0; padding-top: 16px; border-top: 1px solid var(--idmp-border-subtle); }
.summary-grid div, .selected-grid div { min-width: 0; }
.summary-grid dt, .selected-grid dt { color: var(--idmp-text-helper); font-size: 12px; }
.summary-grid dd, .selected-grid dd { margin: 5px 0 0; color: var(--idmp-text-primary); word-break: break-word; }
.section-title--toolbar { align-items: center; }
.toolbar-meta { display: flex; align-items: center; gap: 12px; }
.selected-context { color: var(--idmp-text-secondary); font-size: 13px; }
.selected-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 0; padding-top: 0; border-top: 0; }
.field-mapping-card { padding: 18px; }
.field-mapping-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); gap: 16px; align-items: start; }
.field-pane { min-width: 0; padding: 14px; background: var(--idmp-layer-02); border: 1px solid var(--idmp-border-subtle); }
.mapping-table-scroll { max-height: 360px; overflow-y: auto; overflow-x: hidden; border: 1px solid var(--idmp-border-subtle); background: var(--idmp-layer-01); }
.mapping-table-scroll :deep(.el-table) { width: 100%; min-width: 0; }
.mapping-table-scroll :deep(.el-table__header-wrapper), .mapping-table-scroll :deep(.el-table__body-wrapper) { min-width: 0; }
.semantic-field-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.semantic-field-cell strong, .semantic-field-cell small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.semantic-field-cell small { color: var(--idmp-text-helper); font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; }
.field-actions { display: flex; flex-direction: column; align-items: stretch; gap: 2px; }
.field-action-row { display: flex; min-height: 24px; align-items: center; }
.field-action-disabled { color: var(--idmp-text-helper); font-size: 12px; }
.field-pane__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; color: var(--idmp-text-primary); }
.field-pane__heading-main { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.field-pane__heading-main span { color: var(--idmp-text-helper); font-size: 12px; white-space: nowrap; }
.field-search-input { flex: 0 1 220px; min-width: 150px; }
.source-field-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.source-field-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source-field-cell small { order: -1; overflow: hidden; color: var(--idmp-text-helper); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.mapping-editor { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--idmp-border-subtle); }
.field-form-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.field-form-grid :deep(.el-select), .field-form-grid :deep(.el-input) { width: 100%; }
.mapping-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.default-time-editor { display: grid; grid-template-columns: 1fr 280px auto; gap: 16px; align-items: center; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--idmp-border-subtle); }
.default-time-editor p { margin: 5px 0 0; color: var(--idmp-text-helper); font-size: 12px; }
.default-time-editor :deep(.el-select) { width: 100%; }
.dialog-api-note { margin-bottom: 18px; color: var(--idmp-text-helper); font: 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
.field-help { margin-top: 5px; color: var(--idmp-text-helper); font-size: 12px; line-height: 18px; }
.create-error { margin-top: 8px; }
@media (max-width: 1100px) { .model-progress-steps { gap: 8px; } .selected-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .field-form-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .default-time-editor { grid-template-columns: 1fr 220px; } .default-time-editor .el-button { grid-column: 2; } }
@media (max-width: 900px) { .model-progress-steps { align-items: flex-start; flex-direction: column; } .model-progress-steps > i { display: none; } .summary-grid, .selected-grid { grid-template-columns: 1fr; } .toolbar-meta { align-items: flex-end; flex-direction: column; } .field-mapping-grid { grid-template-columns: 1fr; } .field-form-grid { grid-template-columns: 1fr 1fr; } .default-time-editor { grid-template-columns: 1fr; } .default-time-editor .el-button { grid-column: auto; } }
@media (max-width: 560px) { .field-pane__heading { align-items: stretch; flex-direction: column; } .field-search-input { flex-basis: auto; min-width: 0; width: 100%; } }
</style>
