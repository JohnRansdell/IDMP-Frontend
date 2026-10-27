<template>
  <div class="idmp-page">
    <PageHeader :title="isCreate ? '新建因子模板' : '因子模板版本'" :status="version.publicationStatus || version.status || 'DRAFT'" :status-label="version.publicationStatus || version.status || '草稿'">
      <template #actions>
        <div class="page-toolbar">
          <el-button @click="router.push('/factor/templates')">返回目录</el-button>
          <template v-if="!isCreate && !editable && canManageTemplates">
            <el-button :loading="creatingVersion" @click="createVersion">创建新版本</el-button>
            <el-button :loading="instancesLoading" @click="openInstances">查看已创建因子</el-button>
            <el-button type="primary" @click="instantiate">使用模板创建因子</el-button>
          </template>
          <el-button v-else-if="(version.publicationStatus || version.status) === 'PUBLISHED'" type="primary" @click="instantiate">使用模板创建因子</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="surface-card editor-card">
      <el-alert title="通过表单定义可复用因子的技术边界。系统会自动生成模板 DSL；业务人员后续只能填写“模板参数”中标记为暴露的项目。" type="info" :closable="false" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="!editable && !isCreate" @submit.prevent>
        <div class="step-title"><span>1</span><div><h2>基本信息</h2><p>描述模板的业务用途和适用范围。</p></div></div>
        <div class="grid">

          <el-form-item label="模板名称" prop="name"><el-input v-model.trim="form.name" placeholder="例如 按数据域计数模板" /></el-form-item>
          <el-form-item label="因子类型范围" prop="factorTypeScope"><el-select v-model="form.factorTypeScope"><el-option label="聚合因子（AGGREGATE）" value="AGGREGATE" /><el-option label="原子因子（ATOMIC）" value="ATOMIC" /></el-select></el-form-item>
        </div>
        <el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="说明模板适用的指标口径和使用边界" /></el-form-item>

        <el-divider />
        <div class="step-title"><span>2</span><div><h2>数据来源与计算定义</h2></div></div>
        <div class="grid">
          <el-form-item label="主数据域" prop="domainCode"><el-select v-model="designer.domainCode" filterable :loading="loading.domains" placeholder="请选择已发布数据域" @change="handleDomainChange"><el-option v-for="domain in domains" :key="domain.id || domain.code" :label="domain.name || '未命名数据域'" :value="domain.code" /></el-select></el-form-item>
          <el-form-item label="物理表" required><el-select v-model="designer.tableName" filterable :disabled="!designer.domainCode" :loading="loading.tables" placeholder="请选择数据域中的物理表" @change="handleTableChange"><el-option v-for="table in tables" :key="table.tableName" :label="optionLabel({ name: table.tableComment, code: table.tableName })" :value="table.tableName" /></el-select></el-form-item>
          <el-form-item label="聚合方式" prop="aggregation"><el-select v-model="designer.aggregation"><el-option v-for="item in aggregationOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        </div>
        <el-form-item label="统计对象"><el-radio-group :model-value="designer.fieldExpression ? 'EXPRESSION' : 'FIELD'" @update:model-value="designer.fieldExpression = $event === 'EXPRESSION' ? { expressionType: 'FIELD', fieldCode: designer.fieldCode } : null"><el-radio value="FIELD">物理字段</el-radio><el-radio value="EXPRESSION">字段表达式</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="designer.fieldExpression" label="统计表达式"><FactorExpressionEditor v-model="designer.fieldExpression" :fields="fields" :template-parameters="designer.parameters" /></el-form-item>
        <el-form-item v-else label="聚合字段"><el-select v-model="designer.fieldCode" filterable clearable :disabled="!designer.tableName" placeholder="COUNT 可留空统计记录数；其他聚合方式需选择字段"><el-option v-for="field in aggregatableFields" :key="field.code" :label="optionLabel({ name: field.label, code: field.code })" :value="field.code" /></el-select></el-form-item>
        <div class="grid">
          <el-form-item label="计算模式"><el-radio-group v-model="designer.calculationMode"><el-radio value="TEMPORAL">时序</el-radio><el-radio value="STATIC">静态</el-radio></el-radio-group></el-form-item>
          <el-form-item v-if="designer.calculationMode === 'TEMPORAL'" label="周期时间字段" required><el-select v-model="designer.periodFieldCode" filterable :disabled="!designer.tableName" placeholder="请选择本模板的周期时间字段"><el-option v-for="field in timeFields" :key="field.code" :label="optionLabel({ name: field.label, code: field.code })" :value="field.code" /></el-select><small>按模板的统计口径选择，实例化因子将使用此字段。</small></el-form-item>
        </div>

        <el-divider />
        <div class="step-title"><span>3</span><div><h2>输出、粒度与下钻</h2><p>定义模板产出的值类型，以及业务人员可选的时间粒度和下钻路径。</p></div></div>
        <div class="grid">
          <el-form-item label="输出值类型"><el-select v-model="designer.output.valueType"><el-option label="数值（DECIMAL）" value="DECIMAL" /><el-option label="文本（STRING）" value="STRING" /><el-option label="布尔（BOOLEAN）" value="BOOLEAN" /></el-select></el-form-item>
          <el-form-item label="计量单位"><el-input v-model.trim="designer.output.unit" placeholder="例如 PERSON_TIME、PERCENT" /></el-form-item>
          <el-form-item label="精度 / 小数位"><div class="inline-fields"><el-input-number v-model="designer.output.precision" :min="1" :max="38" /><el-input-number v-model="designer.output.scale" :min="0" :max="18" /></div></el-form-item>
        </div>
        <el-form-item label="允许统计粒度"><el-checkbox-group v-model="designer.allowedGrains"><el-checkbox label="YEARLY">年度</el-checkbox><el-checkbox label="QUARTERLY">季度</el-checkbox><el-checkbox label="MONTHLY">月度</el-checkbox><el-checkbox label="DAILY">日</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="已发布下钻路径版本"><el-select v-model="designer.drillPathVersionIds" multiple filterable allow-create default-first-option placeholder="输入已发布下钻路径版本 ID"><el-option v-for="id in designer.drillPathVersionIds" :key="id" :label="String(id)" :value="id" /></el-select><small class="help">下钻路径由专门的下钻配置模块维护；这里只引用已发布版本。</small></el-form-item>

        <el-divider />
        <div class="step-title"><span>4</span><div><h2>模板参数</h2><p>只有“向业务用户暴露”的参数会在“从模板创建因子”页面显示。</p></div><el-button v-if="editable || isCreate" link type="primary" @click="addParameter">添加参数</el-button></div>
        <el-table :data="designer.parameters" border empty-text="暂无参数；无参数模板将按固定口径创建因子。">
          <el-table-column label="参数编码" min-width="150"><template #default="{ row }"><el-input v-model.trim="row.code" placeholder="例如 COUNT_FIELD" /></template></el-table-column>
          <el-table-column label="业务名称" min-width="150"><template #default="{ row }"><el-input v-model.trim="row.displayName" placeholder="例如 计数字段" /></template></el-table-column>
          <el-table-column label="类型" width="150"><template #default="{ row }"><el-select v-model="row.dataType"><el-option label="标准编码（CODE）" value="CODE" /><el-option label="字段引用" value="FIELD_REF" /><el-option label="值集" value="VALUE_SET" /><el-option label="文本" value="STRING" /><el-option label="数值" value="DECIMAL" /><el-option label="日期时间" value="DATETIME" /><el-option label="布尔" value="BOOLEAN" /></el-select></template></el-table-column>
          <el-table-column label="默认值" min-width="130"><template #default="{ row }"><el-input-number v-if="['DECIMAL', 'NUMBER', 'INTEGER'].includes(row.dataType)" v-model="row.defaultValue" :precision="row.dataType === 'INTEGER' ? 0 : undefined" /><el-select v-else-if="row.dataType === 'BOOLEAN'" v-model="row.defaultValue" clearable><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select><el-input v-else v-model="row.defaultValue" /></template></el-table-column>
          <el-table-column label="值来源" min-width="150"><template #default="{ row }"><el-select v-model="row.valueSourceType"><el-option label="固定枚举" value="FIXED" /><el-option label="手工输入" value="MANUAL" /><el-option label="语义字段" value="SEMANTIC_FIELD" /><el-option label="值集" value="VALUE_SET" /><el-option label="枚举" value="ENUM" /></el-select><el-select v-if="row.valueSourceType === 'VALUE_SET'" v-model="row.valueSourceRef" filterable clearable class="source-ref" placeholder="选择值集"><el-option v-for="item in valueSets" :key="item.id" :value="item.code" :label="item.name || '未命名值集'" /></el-select><el-select v-else-if="row.valueSourceType === 'SEMANTIC_FIELD'" v-model="row.valueSourceRef" filterable clearable class="source-ref" placeholder="选择业务字段"><el-option v-for="item in fields.filter(field => field.semanticFieldCode)" :key="item.semanticFieldCode" :value="item.semanticFieldCode" :label="item.label || item.semanticFieldCode" /></el-select><el-input v-else-if="row.valueSourceType === 'ENUM'" v-model.trim="row.valueSourceRef" class="source-ref" placeholder="枚举类型" /></template></el-table-column>
          <el-table-column label="可选标准值" min-width="190"><template #default="{ row }"><el-select v-model="row.validation.enum" multiple filterable allow-create default-first-option placeholder="输入标准编码，如 MALE、FEMALE"><el-option v-for="item in row.validation.enum || []" :key="item" :label="item" :value="item" /></el-select></template></el-table-column>
          <el-table-column label="必填" width="70"><template #default="{ row }"><el-switch v-model="row.required" /></template></el-table-column>
          <el-table-column label="向业务用户暴露" width="120"><template #default="{ row }"><el-switch v-model="row.exposed" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" :disabled="!editable && !isCreate" @click="designer.parameters.splice($index, 1)">删除</el-button></template></el-table-column>
        </el-table>

        <el-divider />
        <div class="step-title"><span>5</span><div><h2>筛选范围</h2></div></div>
        <el-alert v-if="unsupportedDefinition" title="此定义包含当前编辑器尚不支持的表达式，请在高级配置中修改后再保存。" type="warning" :closable="false" />
        <div :inert="!editable || unsupportedDefinition">
          <el-radio-group v-model="designer.scopeMode"><el-radio value="ALL">全部记录</el-radio><el-radio value="FILTERED" :disabled="!fields.length">显式筛选条件</el-radio></el-radio-group>
          <FactorRuleBuilder v-if="designer.scopeMode === 'FILTERED'" :model-value="designer.filters" :fields="fields.filter(field => field.filterable !== false)" :template-parameters="designer.parameters" />
        </div>
        <div class="condition-preview" aria-label="筛选口径预览"><strong>口径预览</strong><span>{{ conditionPreview }}</span></div>

        <el-divider />
        <el-collapse v-if="canManageTemplates" v-model="openPanels" class="advanced-panel">
          <el-collapse-item name="advanced">
            <template #title>高级配置</template>
            <el-alert title="正常新建模板不需要填写 JSON。点击“从当前表单生成”可查看系统自动生成的定义；手工修改后请点击“导入到表单”，并重新校验。" type="warning" :closable="false" />
            <div class="advanced-actions"><el-button @click="refreshAdvancedJson">从当前表单生成</el-button><el-button type="primary" @click="applyAdvancedJson">导入到表单</el-button></div>
            <el-input v-model="advancedJson" type="textarea" :rows="16" class="mono" />
          </el-collapse-item>
        </el-collapse>
        <div v-if="isCreate || (editable && canManageTemplates)" class="editor-actions-bar">
          <span>{{ isCreate ? '完成填写后，在此创建模板草稿。' : '保存后需要重新校验；校验通过后才能发布。' }}</span>
          <div class="page-toolbar">
            <el-button v-if="!isCreate" :loading="saving" @click="save">保存草稿</el-button>
            <el-button v-if="!isCreate" :loading="validating" @click="validate">校验</el-button>
            <el-button v-if="isCreate" type="primary" :loading="saving" @click="save">创建模板草稿</el-button>
            <el-button v-else type="primary" :loading="publishing" @click="publish">发布</el-button>
          </div>
        </div>
      </el-form>
      <el-alert v-if="diagnostics" :title="diagnostics" type="warning" :closable="false" class="diagnostics" />
    </section>
    <el-dialog v-model="instancesVisible" title="该模板版本创建的因子" width="760px">
      <el-table v-loading="instancesLoading" :data="instances" empty-text="暂无仍有效的实例因子">

        <el-table-column prop="name" label="因子名称" min-width="180" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="生效参数" min-width="190"><template #default="{ row }">{{ parameterSummary(row.origin?.effectiveParameters) }}</template></el-table-column>
        <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="router.push(`/factor/edit/${encodeURIComponent(row.id)}`)">查看</el-button></template></el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import FactorRuleBuilder from '@/idmp/components/FactorRuleBuilder.vue'
import FactorExpressionEditor from '@/idmp/components/FactorExpressionEditor.vue'
import { editableFilterTree, hasUnsupportedFactorDslExpressions } from '@/idmp/utils/dslBuilder'
import { withoutLegacyPeriod } from '@/idmp/utils/factorPeriod'
import { fieldLabel, toUserMessage } from '@/idmp/utils/userMessage.js'
import { fetchDataDomains, fetchPhysicalTableFields, fetchPhysicalTables, fetchSourceTableFields, fetchSourceTimeFieldOptions } from '@/idmp/api/modules/meta'
import { adaptPhysicalTableList, adaptSemanticFieldList, adaptSourceFieldList } from '@/idmp/api/adapters/meta'
import { adaptFactorPhysicalFields, isFactorPeriodField } from '@/idmp/api/adapters/factorMetadata'
import { buildFactorTemplateDefinition, templatePeriodField, validateTemplateConditions, describeTemplateConditions } from '@/idmp/utils/factorTemplateDefinition'
import { createFactorTemplate, createFactorTemplateVersion, fetchAllFactorTemplateInstances as fetchFactorTemplateInstances, fetchFactorTemplateVersion, publishFactorTemplateVersion, updateFactorTemplateVersion, validateFactorTemplateVersion } from '@/idmp/api/modules/factors'

import { fetchValueSets, fetchValueSetItems, fetchSemanticFieldValueSet } from '@/idmp/api/modules/valueSets'
import { fetchAllPages } from '@/idmp/api/pagination.js'
const valueSets = ref([])
async function loadValueSets() { try { valueSets.value = await fetchAllPages(fetchValueSets, { status: 'PUBLISHED', size: 100 }) } catch (error) { ElMessage.error(error?.message || '值集读取失败') } }

const route = useRoute()
const router = useRouter()
const formRef = ref()
const isCreate = computed(() => route.name === 'FactorTemplateCreate')
const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const creatingVersion = ref(false)
const instancesLoading = ref(false)
const instancesVisible = ref(false)
const instances = ref([])
const diagnostics = ref('')
const template = ref({})
const version = reactive({})
const openPanels = ref([])
const advancedJson = ref('')
const loading = reactive({ domains: false, tables: false, fields: false })
const domains = ref([])
const tables = ref([])
const fields = ref([])
const form = reactive({ code: '', name: '', description: '', factorTypeScope: 'AGGREGATE' })
const designer = reactive({ domainCode: '', domainId: '', tableName: '', primaryOptions: {}, calculationMode: 'TEMPORAL', periodFieldCode: '', aggregation: 'COUNT', fieldCode: '', fieldExpression: null, groupBy: [], runtimeParameters: [], output: { valueType: 'DECIMAL', unit: 'PERSON_TIME', precision: 30, scale: 10 }, allowedGrains: ['MONTHLY', 'YEARLY'], drillPathVersionIds: [], parameters: [], filters: { nodeType: 'AND', children: [] }, scopeMode: 'ALL', extraDefinition: {} })
let metadataRequestVersion = 0
const rules = { name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }], factorTypeScope: [{ required: true, message: '请选择因子类型范围', trigger: 'change' }] }
const aggregationOptions = [{ value: 'COUNT', label: '记录计数' }, { value: 'COUNT_DISTINCT', label: '去重计数' }, { value: 'SUM', label: '数值求和' }, { value: 'AVG', label: '平均值' }, { value: 'MIN', label: '最小值' }, { value: 'MAX', label: '最大值' }]
const editable = computed(() => isCreate.value || (version.publicationStatus || version.status) !== 'PUBLISHED')
// 当前为产品演示环境：开放模板生命周期入口，服务端仍负责最终权限校验。
const canManageTemplates = computed(() => true)
const aggregatableFields = computed(() => fields.value.filter(field => field.aggregatable !== false))
const timeFields = computed(() => fields.value.filter(isFactorPeriodField))
const unsupportedDefinition = ref(false)
const conditionPreview = computed(() => designer.scopeMode === 'ALL' ? '全部记录' : describeTemplateConditions(designer.filters, fields.value, designer.parameters))

onMounted(async () => { await Promise.all([loadDomains(), loadValueSets()]); if (!isCreate.value) await load() })
watch(() => route.params.versionId, (id, previous) => { if (id && id !== previous) load() })

async function loadDomains() {
  loading.domains = true
  try { domains.value = normalizeList(await fetchDataDomains()).filter(item => !item.status || item.status === 'PUBLISHED') } catch (error) { ElMessage.error(error?.message || '数据域读取失败') } finally { loading.domains = false }
}
async function load() {
  try {
    const result = await fetchFactorTemplateVersion(route.params.versionId)
    template.value = result.template || {}
    Object.assign(version, result.version || result)
    const source = result.version || result
    Object.assign(form, { code: template.value.code || source.code || '', name: template.value.name || source.name || '', description: template.value.description || source.description || '', factorTypeScope: template.value.factorTypeScope || source.factorTypeScope || 'AGGREGATE' })
    applyDefinition(source.templateDefinition || defaultDefinition(), source.parameters || [])
    advancedJson.value = json(source.templateDefinition || defaultDefinition())
  } catch (error) { ElMessage.error(error?.message || '模板版本读取失败') }
}
async function handleDomainChange(code) {
  const domain = domains.value.find(item => item.code === code)
  designer.domainId = domain?.id || ''
  metadataRequestVersion++
  designer.tableName = ''
  designer.fieldCode = ''
  designer.periodFieldCode = ''
  resetConditions()
  fields.value = []
  await loadTables()
}
async function loadTables() {
  if (!designer.domainId) { tables.value = []; return }
  loading.tables = true
  const requestId = ++metadataRequestVersion
  try { const result = adaptPhysicalTableList(await fetchPhysicalTables(designer.domainId)); if (requestId === metadataRequestVersion) tables.value = result.filter(table => !table.status || table.status === 'PUBLISHED') } catch (error) { if (requestId === metadataRequestVersion) ElMessage.error(error?.message || '物理表读取失败') } finally { if (requestId === metadataRequestVersion) loading.tables = false }
}
function resetConditions() { designer.fieldExpression = null; designer.filters = { nodeType: 'AND', children: [] }; designer.scopeMode = 'ALL'; designer.groupBy = []; designer.extraDefinition = {}; designer.primaryOptions = {}; unsupportedDefinition.value = false }
async function handleTableChange() { designer.fieldCode = ''; designer.periodFieldCode = ''; resetConditions(); await loadFields() }
async function loadFields() {
  fields.value = []
  if (!designer.domainId || !designer.tableName) return
  loading.fields = true
  const requestId = ++metadataRequestVersion
  try {
    const [mapped, source, timeOptions] = await Promise.all([fetchPhysicalTableFields(designer.domainId, designer.tableName), fetchSourceTableFields(designer.tableName), fetchSourceTimeFieldOptions(designer.tableName)])
    if (requestId !== metadataRequestVersion) return
    const loaded = adaptFactorPhysicalFields(adaptSemanticFieldList(mapped), adaptSourceFieldList(source), { isBase: true, timeFieldOptions: normalizeList(timeOptions) })
    await Promise.all(loaded.map(async field => {
      if (!field.id) return
      const binding = await fetchSemanticFieldValueSet(field.id)
      const published = binding?.publishedVersion
      if (!binding?.bound || !published?.id) return
      field.valueSetVersionId = String(published.id)
      field.valueSetMatchMode = String(published.matchMode || binding.valueSet?.matchMode || '').toUpperCase()
      if (field.valueSetMatchMode === 'CONTINUOUS') {
        field.continuousSpec = published.continuousSpec || {}
        field.valueSetBinding = { matchMode: 'CONTINUOUS', valueSetVersionId: field.valueSetVersionId, continuousSpec: field.continuousSpec }
      } else {
        field.options = published.items || await fetchValueSetItems(published.id)
        if (field.options.length) field.kind = 'VALUE_SET'
      }
    }))
    if (requestId !== metadataRequestVersion) return
    fields.value = loaded
    const physicalCode = code => fields.value.find(field => field.code === code || field.semanticFieldCode === code)?.code || code
    designer.fieldCode = physicalCode(designer.fieldCode)
    const restore = node => {
      if (!node || typeof node !== 'object') return
      if (typeof node.fieldCode === 'string') node.fieldCode = physicalCode(node.fieldCode)
      Object.values(node).forEach(restore)
    }
    restore(designer.filters)
    restore(designer.fieldExpression)
    designer.periodFieldCode = physicalCode(designer.periodFieldCode)
  } catch (error) { if (requestId === metadataRequestVersion) ElMessage.error(error?.message || '物理字段读取失败') } finally { if (requestId === metadataRequestVersion) loading.fields = false }
}
function addParameter() { designer.parameters.push({ code: '', displayName: '', dataType: 'CODE', required: false, exposed: true, defaultValue: '', valueSourceType: 'FIXED', valueSourceRef: '', validation: { enum: [] }, displayOrder: designer.parameters.length }) }
function buildDefinition() {
  return buildFactorTemplateDefinition(designer, fields.value)
}
function applyDefinition(definition, parameters) {
  const primary = definition.primaryDomain || {}
  designer.domainCode = primary.domainCode || ''
  designer.domainId = domains.value.find(item => item.code === designer.domainCode)?.id || ''
  designer.tableName = primary.tableName || primary.semanticTableCode || ''
  const { domainCode, tableName, semanticTableCode, ...primaryOptions } = primary
  designer.primaryOptions = primaryOptions
  designer.calculationMode = definition.calculationMode || 'TEMPORAL'
  designer.periodFieldCode = templatePeriodField(definition)
  designer.groupBy = definition.groupBy || []
  designer.runtimeParameters = definition.parameters || []
  designer.aggregation = definition.aggregation?.function || 'COUNT'
  designer.fieldCode = typeof definition.aggregation?.fieldCode === 'string' ? definition.aggregation.fieldCode : ''
  designer.fieldExpression = definition.aggregation?.fieldExpression ? structuredClone(definition.aggregation.fieldExpression) : null
  unsupportedDefinition.value = hasUnsupportedFactorDslExpressions(definition)
  designer.output = { valueType: definition.output?.valueType || 'DECIMAL', unit: definition.output?.unit || 'PERSON_TIME', precision: definition.output?.precision || 30, scale: definition.output?.scale ?? 10 }
  designer.allowedGrains = definition.allowedGrains || []
  designer.drillPathVersionIds = (definition.drillPathVersionIds || []).map(String)
  designer.filters = editableFilterTree(withoutLegacyPeriod(definition.filters), definition.parameters || [])
  designer.scopeMode = designer.filters.children.length ? 'FILTERED' : 'ALL'
  designer.parameters = parameters.map((item, index) => ({ ...item, required: Boolean(item.required), exposed: item.exposed !== false, displayOrder: item.displayOrder ?? index, validation: { ...(item.validation || {}), enum: Array.isArray(item.validation?.enum) ? item.validation.enum : [] } }))
  const { schemaVersion, dslType, calculationMode, primaryDomain, filters, aggregation, groupBy, parameters: ignored, output, applicableDomains, allowedGrains, drillPathVersionIds, ...extra } = definition
  designer.extraDefinition = { ...extra, aggregationField: typeof aggregation?.fieldCode === 'object' ? { fieldCode: aggregation.fieldCode } : aggregation?.fieldRef ? { fieldRef: aggregation.fieldRef } : undefined }
  if (designer.domainId) loadTables().then(loadFields)
}
function refreshAdvancedJson() { advancedJson.value = json(buildDefinition()); ElMessage.success('已从表单生成 JSON 预览') }
function applyAdvancedJson() { try { const definition = JSON.parse(advancedJson.value); applyDefinition(definition, designer.parameters); ElMessage.success('JSON 已导入到表单，请检查并保存') } catch { ElMessage.error('JSON 格式无效，无法导入') } }
async function payload() {
  if (!(await formRef.value?.validate().catch(() => false))) return null
  if (unsupportedDefinition.value) { ElMessage.warning('当前定义包含不支持的表达式，不能覆盖保存'); return null }
  if (loading.fields) { ElMessage.warning('请等待字段加载完成'); return null }
  if (!designer.domainCode) { ElMessage.warning('请选择主数据域'); return null }
  if (!designer.tableName) { ElMessage.warning('请选择物理表'); return null }
  if (designer.calculationMode === 'TEMPORAL' && !timeFields.value.some(field => field.code === designer.periodFieldCode)) { ElMessage.warning('请选择有效的周期时间字段'); return null }
  if (designer.aggregation !== 'COUNT' && !designer.fieldExpression && !designer.fieldCode && !designer.extraDefinition.aggregationField) { ElMessage.warning('请选择聚合字段'); return null }
  const duplicate = designer.parameters.find((item, index) => !item.code || designer.parameters.some((other, otherIndex) => otherIndex < index && other.code === item.code))
  if (duplicate) { ElMessage.warning('模板参数编码不能为空且不能重复'); return null }
  const invalidDefault = designer.parameters.find(item => Array.isArray(item.validation?.enum) && item.validation.enum.length && item.defaultValue !== '' && item.defaultValue != null && !item.validation.enum.includes(item.defaultValue))
  if (invalidDefault) { ElMessage.warning(`参数“${invalidDefault.displayName || invalidDefault.code}”的默认值必须属于可选标准值`); return null }
  const conditionErrors = validateTemplateConditions(designer, fields.value)
  if (conditionErrors.length) { ElMessage.warning(conditionErrors[0]); return null }
  const parameters = designer.parameters.map((item, index) => {
    const validation = { ...item.validation }
    if (!validation.enum?.length) delete validation.enum
    return { ...item, validation, displayOrder: index, defaultValue: item.defaultValue === '' ? null : item.defaultValue, valueSourceRef: item.valueSourceRef || null }
  })
  const data = { resourceVersion: version.resourceVersion, name: form.name, description: form.description, factorTypeScope: form.factorTypeScope, templateDefinition: buildDefinition(), outputDescriptor: { valueType: designer.output.valueType, unit: designer.output.unit }, parameters }
  return data
}
async function save() {
  const data = await payload()
  if (!data || saving.value) return
  saving.value = true
  try {
    const result = isCreate.value ? await createFactorTemplate(data) : await updateFactorTemplateVersion(route.params.versionId, data)
    const detail = result.version || result
    if (isCreate.value) { ElMessage.success('模板草稿已创建'); await router.replace(`/factor/templates/${encodeURIComponent(result.template?.id || result.template?.templateId)}/versions/${encodeURIComponent(detail.id || detail.versionId)}`) } else { Object.assign(version, detail); diagnostics.value = ''; advancedJson.value = json(detail.templateDefinition || buildDefinition()); ElMessage.success('草稿已保存，请重新校验') }
  } catch (error) { ElMessage.error(error?.message || '保存失败') } finally { saving.value = false }
}
async function validate() { if (validating.value) return; validating.value = true; try { const result = await validateFactorTemplateVersion(route.params.versionId); Object.assign(version, result.version || result); diagnostics.value = listDiagnostics(result.diagnostics); result.valid ? ElMessage.success('模板校验通过') : ElMessage.warning('模板校验未通过') } catch (error) { ElMessage.error(error?.message || '校验失败') } finally { validating.value = false } }
async function publish() { try { await ElMessageBox.confirm('发布后该版本不可编辑；变更需创建新版本。确认发布？', '发布模板', { type: 'warning' }) } catch { return }; publishing.value = true; try { const result = await publishFactorTemplateVersion(route.params.versionId, version.resourceVersion); Object.assign(template.value, result.template || {}); Object.assign(version, result.version || result); ElMessage.success('模板版本已发布') } catch (error) { ElMessage.error(error?.message || '发布失败') } finally { publishing.value = false } }
async function createVersion() { creatingVersion.value = true; try { const result = await createFactorTemplateVersion(template.value.id || route.params.templateId, { copyFromVersionId: version.id || route.params.versionId }); const draft = result.version || result; ElMessage.success('已基于当前发布版本创建草稿'); await router.push(`/factor/templates/${encodeURIComponent(route.params.templateId)}/versions/${encodeURIComponent(draft.id || draft.versionId)}`) } catch (error) { ElMessage.error(error?.message || '创建新版本失败') } finally { creatingVersion.value = false } }
function instantiate() { router.push(`/factor/templates/${encodeURIComponent(template.value.id || route.params.templateId)}/versions/${encodeURIComponent(version.id || route.params.versionId)}/instantiate`) }
async function openInstances() { instancesVisible.value = true; instancesLoading.value = true; try { const result = await fetchFactorTemplateInstances(version.id || route.params.versionId, { page: 1, size: 100 }); instances.value = normalizeList(result) } catch (error) { instances.value = []; ElMessage.error(error?.message || '模板实例读取失败') } finally { instancesLoading.value = false } }
function parameterSummary(values) { if (!values || typeof values !== 'object') return '-'; const entries = Object.entries(values); return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join('；') : '-' }
function normalizeList(value) { return Array.isArray(value) ? value : value?.items || value?.records || value?.list || value?.data || [] }
function optionLabel(item) { const name = item?.name || item?.label || ''; const code = item?.code || ''; return name && code && name !== code ? `${name}（${code}）` : name || code }
function defaultDefinition() { return { schemaVersion: '1.0', dslType: 'FACTOR', primaryDomain: { domainCode: '' }, filters: { nodeType: 'TRUE' }, aggregation: { function: 'COUNT' }, groupBy: [], parameters: [], output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: 'COUNT', unit: 'PERSON_TIME', nullable: false, precision: 30, scale: 10, grain: [] }, applicableDomains: [], allowedGrains: ['MONTHLY', 'YEARLY'], drillPathVersionIds: [] } }
function json(value) { return JSON.stringify(value, null, 2) }
function listDiagnostics(value) { return Array.isArray(value) ? value.map(item => `${item.path ? `${fieldLabel(item.path)}：` : ''}${toUserMessage(item.message, '模板配置未通过校验，请检查后重试。')}`).join('；') : '' }
</script>

<style scoped lang="scss">
.condition-preview { display:flex; gap:12px; padding:12px 0; font-size:13px; line-height:1.6; overflow-wrap:anywhere; }.condition-preview strong { flex-shrink:0; }.editor-card { padding:20px; }.page-toolbar,.inline-fields,.advanced-actions { display:flex; align-items:center; gap:10px; }.step-title { display:flex; align-items:flex-start; gap:12px; margin:20px 0 14px; }.step-title > span { display:flex; align-items:center; justify-content:center; width:28px; height:28px; flex:0 0 auto; color:#fff; background:#1890ff; border-radius:50%; font-weight:600; }.step-title > div { flex:1; }.step-title h2 { margin:0 0 4px; font-size:16px; }.step-title p,.help { margin:0; color:#8c8c8c; font-size:13px; }.grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }.inline-fields :deep(.el-input-number) { width:50%; }.source-ref { margin-top:6px; }.advanced-panel { margin-top:20px; }.advanced-actions { margin:12px 0; }.editor-actions-bar { position:sticky; bottom:16px; z-index:5; display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:20px; padding:14px 16px; background:#fff; border:1px solid #91caff; border-radius:8px; box-shadow:0 6px 18px rgba(22,119,255,.12); }.editor-actions-bar > span { color:#595959; font-size:13px; }.mono :deep(textarea) { font-family:Consolas,monospace; font-size:12px; line-height:1.5; }.diagnostics { margin-top:16px; } @media(max-width:900px){.grid{grid-template-columns:1fr}.editor-actions-bar{align-items:flex-start;flex-direction:column}.editor-actions-bar .page-toolbar{flex-wrap:wrap}}
</style>
