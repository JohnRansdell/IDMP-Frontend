<template>
  <div class="idmp-page">
    <PageHeader :title="isCreate ? '新建因子模板' : '因子模板版本'" :status="version.publicationStatus || 'DRAFT'" :status-label="version.publicationStatus || '草稿'">
      <template #actions>
        <div class="page-toolbar">
          <el-button @click="router.push('/factor/templates')">返回目录</el-button>
          <el-button v-if="isCreate && canManageTemplates" type="primary" :loading="saving" @click="save">创建模板草稿</el-button>
          <template v-else-if="editable && canManageTemplates">
            <el-button :loading="saving" @click="save">保存草稿</el-button>
            <el-button :loading="validating" @click="validate">校验</el-button>
            <el-button type="primary" :loading="publishing" @click="publish">发布</el-button>
          </template>
          <template v-else-if="canManageTemplates">
            <el-button :loading="creatingVersion" @click="createVersion">创建新版本</el-button>
            <el-button type="primary" @click="instantiate">使用模板创建因子</el-button>
          </template>
          <el-button v-else-if="version.publicationStatus === 'PUBLISHED'" type="primary" @click="instantiate">使用模板创建因子</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="surface-card editor-card">
      <el-alert title="通过表单定义可复用因子的技术边界。系统会自动生成模板 DSL；业务人员后续只能填写“模板参数”中标记为暴露的项目。" type="info" :closable="false" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="!editable && !isCreate">
        <div class="step-title"><span>1</span><div><h2>基本信息</h2><p>描述模板的业务用途和适用范围。</p></div></div>
        <div class="grid">
          <el-form-item label="模板编码" prop="code"><el-input v-model.trim="form.code" :disabled="!isCreate" placeholder="例如 COUNT_BY_DOMAIN" /></el-form-item>
          <el-form-item label="模板名称" prop="name"><el-input v-model.trim="form.name" placeholder="例如 按数据域计数模板" /></el-form-item>
          <el-form-item label="因子类型范围" prop="factorTypeScope"><el-select v-model="form.factorTypeScope"><el-option label="聚合因子（AGGREGATE）" value="AGGREGATE" /><el-option label="原子因子（ATOMIC）" value="ATOMIC" /></el-select></el-form-item>
        </div>
        <el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" placeholder="说明模板适用的指标口径和使用边界" /></el-form-item>

        <el-divider />
        <div class="step-title"><span>2</span><div><h2>数据语义与计算定义</h2><p>只选择已发布的数据域、语义表和语义字段，不录入物理表名或 SQL。</p></div></div>
        <div class="grid">
          <el-form-item label="主数据域" prop="domainCode"><el-select v-model="designer.domainCode" filterable :loading="loading.domains" placeholder="请选择已发布数据域" @change="handleDomainChange"><el-option v-for="domain in domains" :key="domain.id || domain.code" :label="optionLabel(domain)" :value="domain.code" /></el-select></el-form-item>
          <el-form-item label="语义表"><el-select v-model="designer.tableCode" filterable clearable :disabled="!designer.domainCode" :loading="loading.tables" placeholder="可选：选择数据域中的语义表" @change="loadFields"><el-option v-for="table in tables" :key="table.code" :label="optionLabel(table)" :value="table.code" /></el-select></el-form-item>
          <el-form-item label="聚合方式" prop="aggregation"><el-select v-model="designer.aggregation"><el-option v-for="item in aggregationOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        </div>
        <el-form-item label="聚合字段"><el-select v-model="designer.fieldCode" filterable clearable :disabled="!designer.tableCode" placeholder="COUNT 可留空统计记录数；其他聚合方式需选择字段"><el-option v-for="field in aggregatableFields" :key="field.code" :label="optionLabel({ name: field.label, code: field.code })" :value="field.code" /></el-select></el-form-item>
        <el-alert v-if="designer.aggregation !== 'COUNT' && !designer.fieldCode" type="warning" :closable="false" title="除记录计数外，其他聚合方式应选择一个语义字段。" />

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
          <el-table-column label="类型" width="130"><template #default="{ row }"><el-select v-model="row.dataType"><el-option label="字段引用" value="FIELD_REF" /><el-option label="值集" value="VALUE_SET" /><el-option label="文本" value="STRING" /><el-option label="数值" value="DECIMAL" /><el-option label="日期时间" value="DATETIME" /><el-option label="布尔" value="BOOLEAN" /></el-select></template></el-table-column>
          <el-table-column label="默认值" min-width="130"><template #default="{ row }"><el-input v-model="row.defaultValue" /></template></el-table-column>
          <el-table-column label="值来源" min-width="150"><template #default="{ row }"><el-select v-model="row.valueSourceType"><el-option label="手工输入" value="MANUAL" /><el-option label="语义字段" value="SEMANTIC_FIELD" /><el-option label="值集" value="VALUE_SET" /><el-option label="枚举" value="ENUM" /></el-select><el-input v-if="row.valueSourceType !== 'MANUAL'" v-model.trim="row.valueSourceRef" class="source-ref" placeholder="来源编码或数据域" /></template></el-table-column>
          <el-table-column label="必填" width="70"><template #default="{ row }"><el-switch v-model="row.required" /></template></el-table-column>
          <el-table-column label="向业务用户暴露" width="120"><template #default="{ row }"><el-switch v-model="row.exposed" /></template></el-table-column>
          <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button link type="danger" :disabled="!editable && !isCreate" @click="designer.parameters.splice($index, 1)">删除</el-button></template></el-table-column>
        </el-table>

        <el-divider />
        <el-collapse v-if="canManageTemplates" v-model="openPanels" class="advanced-panel">
          <el-collapse-item name="advanced">
            <template #title>高级 JSON（仅用于导入历史模板或处理当前表单未覆盖的复杂筛选条件）</template>
            <el-alert title="正常新建模板不需要填写 JSON。点击“从当前表单生成”可查看系统自动生成的定义；手工修改后请点击“导入到表单”，并重新校验。" type="warning" :closable="false" />
            <div class="advanced-actions"><el-button @click="refreshAdvancedJson">从当前表单生成</el-button><el-button type="primary" @click="applyAdvancedJson">导入到表单</el-button></div>
            <el-input v-model="advancedJson" type="textarea" :rows="16" class="mono" />
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <el-alert v-if="diagnostics" :title="diagnostics" type="warning" :closable="false" class="diagnostics" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { fetchDataDomains, fetchSemanticTableFields, fetchSemanticTables } from '@/idmp/api/modules/meta'
import { createFactorTemplate, createFactorTemplateVersion, fetchFactorTemplateVersion, publishFactorTemplateVersion, updateFactorTemplateVersion, validateFactorTemplateVersion } from '@/idmp/api/modules/factors'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const isCreate = computed(() => route.name === 'FactorTemplateCreate')
const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const creatingVersion = ref(false)
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
const designer = reactive({ domainCode: '', domainId: '', tableCode: '', aggregation: 'COUNT', fieldCode: '', output: { valueType: 'DECIMAL', unit: 'PERSON_TIME', precision: 30, scale: 10 }, allowedGrains: ['MONTHLY', 'YEARLY'], drillPathVersionIds: [], parameters: [], filters: { nodeType: 'TRUE' }, extraDefinition: {} })
const rules = { code: [{ required: true, message: '请输入模板编码', trigger: 'blur' }], name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }], factorTypeScope: [{ required: true, message: '请选择因子类型范围', trigger: 'change' }] }
const aggregationOptions = [{ value: 'COUNT', label: '记录计数' }, { value: 'COUNT_DISTINCT', label: '去重计数' }, { value: 'SUM', label: '数值求和' }, { value: 'AVG', label: '平均值' }, { value: 'MIN', label: '最小值' }, { value: 'MAX', label: '最大值' }]
const editable = computed(() => isCreate.value || version.publicationStatus !== 'PUBLISHED')
// 当前为产品演示环境：开放模板生命周期入口，服务端仍负责最终权限校验。
const canManageTemplates = computed(() => true)
const aggregatableFields = computed(() => fields.value.filter(field => field.aggregatable !== false))

onMounted(async () => { await loadDomains(); if (!isCreate.value) await load() })

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
  designer.tableCode = ''
  designer.fieldCode = ''
  fields.value = []
  await loadTables()
}
async function loadTables() {
  if (!designer.domainId) { tables.value = []; return }
  loading.tables = true
  try { tables.value = normalizeList(await fetchSemanticTables(designer.domainId)) } catch (error) { ElMessage.error(error?.message || '语义表读取失败') } finally { loading.tables = false }
}
async function loadFields() {
  if (!designer.domainId || !designer.tableCode) { fields.value = []; return }
  loading.fields = true
  try { fields.value = normalizeList(await fetchSemanticTableFields(designer.domainId, designer.tableCode)) } catch (error) { ElMessage.error(error?.message || '语义字段读取失败') } finally { loading.fields = false }
}
function addParameter() { designer.parameters.push({ code: '', displayName: '', dataType: 'STRING', required: false, exposed: true, defaultValue: '', valueSourceType: 'MANUAL', valueSourceRef: '', validation: {}, displayOrder: designer.parameters.length }) }
function buildDefinition() {
  const primaryDomain = { domainCode: designer.domainCode }
  if (designer.tableCode) primaryDomain.semanticTableCode = designer.tableCode
  const aggregation = { function: designer.aggregation }
  if (designer.fieldCode) aggregation.fieldCode = designer.fieldCode
  return { ...designer.extraDefinition, schemaVersion: '1.0', dslType: 'FACTOR', primaryDomain, filters: designer.filters || { nodeType: 'TRUE' }, aggregation, groupBy: [], parameters: [], output: { valueType: designer.output.valueType, semanticKind: 'MEASURE', dimension: designer.aggregation === 'COUNT' ? 'COUNT' : 'VALUE', unit: designer.output.unit, nullable: false, precision: Number(designer.output.precision || 30), scale: Number(designer.output.scale || 10), grain: [] }, applicableDomains: designer.domainCode ? [{ domainCode: designer.domainCode }] : [], allowedGrains: designer.allowedGrains, drillPathVersionIds: designer.drillPathVersionIds.map(Number).filter(Number.isFinite) }
}
function applyDefinition(definition, parameters) {
  const primary = definition.primaryDomain || {}
  designer.domainCode = primary.domainCode || ''
  designer.domainId = domains.value.find(item => item.code === designer.domainCode)?.id || ''
  designer.tableCode = primary.semanticTableCode || ''
  designer.aggregation = definition.aggregation?.function || 'COUNT'
  designer.fieldCode = typeof definition.aggregation?.fieldCode === 'string' ? definition.aggregation.fieldCode : ''
  designer.output = { valueType: definition.output?.valueType || 'DECIMAL', unit: definition.output?.unit || 'PERSON_TIME', precision: definition.output?.precision || 30, scale: definition.output?.scale || 10 }
  designer.allowedGrains = definition.allowedGrains || []
  designer.drillPathVersionIds = (definition.drillPathVersionIds || []).map(String)
  designer.filters = definition.filters || { nodeType: 'TRUE' }
  designer.parameters = parameters.map((item, index) => ({ ...item, required: Boolean(item.required), exposed: item.exposed !== false, displayOrder: item.displayOrder ?? index, validation: item.validation || {} }))
  const { schemaVersion, dslType, primaryDomain, filters, aggregation, groupBy, parameters: ignored, output, applicableDomains, allowedGrains, drillPathVersionIds, ...extra } = definition
  designer.extraDefinition = extra
  if (designer.domainId) loadTables().then(loadFields)
}
function refreshAdvancedJson() { advancedJson.value = json(buildDefinition()); ElMessage.success('已从表单生成 JSON 预览') }
function applyAdvancedJson() { try { const definition = JSON.parse(advancedJson.value); applyDefinition(definition, designer.parameters); ElMessage.success('JSON 已导入到表单，请检查并保存') } catch { ElMessage.error('JSON 格式无效，无法导入') } }
async function payload(includeCode = false) {
  if (!(await formRef.value?.validate().catch(() => false))) return null
  if (!designer.domainCode) { ElMessage.warning('请选择主数据域'); return null }
  if (designer.aggregation !== 'COUNT' && !designer.fieldCode) { ElMessage.warning('请选择聚合字段'); return null }
  const duplicate = designer.parameters.find((item, index) => !item.code || designer.parameters.some((other, otherIndex) => otherIndex < index && other.code === item.code))
  if (duplicate) { ElMessage.warning('模板参数编码不能为空且不能重复'); return null }
  const parameters = designer.parameters.map((item, index) => ({ ...item, displayOrder: index, defaultValue: item.defaultValue === '' ? null : item.defaultValue, valueSourceRef: item.valueSourceRef || null }))
  const data = { resourceVersion: version.resourceVersion, name: form.name, description: form.description, factorTypeScope: form.factorTypeScope, templateDefinition: buildDefinition(), outputDescriptor: { valueType: designer.output.valueType, unit: designer.output.unit }, parameters }
  return includeCode ? { code: form.code, ...data } : data
}
async function save() {
  const data = await payload(isCreate.value)
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
function instantiate() { router.push({ path: '/factor/edit/new', query: { templateId: template.value.id || route.params.templateId, versionId: version.id || route.params.versionId } }) }
function normalizeList(value) { return Array.isArray(value) ? value : value?.items || value?.records || value?.list || value?.data || [] }
function optionLabel(item) { const name = item?.name || item?.label || ''; const code = item?.code || ''; return name && code && name !== code ? `${name}（${code}）` : name || code }
function defaultDefinition() { return { schemaVersion: '1.0', dslType: 'FACTOR', primaryDomain: { domainCode: '' }, filters: { nodeType: 'TRUE' }, aggregation: { function: 'COUNT' }, groupBy: [], parameters: [], output: { valueType: 'DECIMAL', semanticKind: 'MEASURE', dimension: 'COUNT', unit: 'PERSON_TIME', nullable: false, precision: 30, scale: 10, grain: [] }, applicableDomains: [], allowedGrains: ['MONTHLY', 'YEARLY'], drillPathVersionIds: [] } }
function json(value) { return JSON.stringify(value, null, 2) }
function listDiagnostics(value) { return Array.isArray(value) ? value.map(item => `${item.path ? `${item.path}：` : ''}${item.message || JSON.stringify(item)}`).join('；') : '' }
</script>

<style scoped lang="scss">
.editor-card { padding:20px; }.page-toolbar,.inline-fields,.advanced-actions { display:flex; align-items:center; gap:10px; }.step-title { display:flex; align-items:flex-start; gap:12px; margin:20px 0 14px; }.step-title > span { display:flex; align-items:center; justify-content:center; width:28px; height:28px; flex:0 0 auto; color:#fff; background:#1890ff; border-radius:50%; font-weight:600; }.step-title > div { flex:1; }.step-title h2 { margin:0 0 4px; font-size:16px; }.step-title p,.help { margin:0; color:#8c8c8c; font-size:13px; }.grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }.inline-fields :deep(.el-input-number) { width:50%; }.source-ref { margin-top:6px; }.advanced-panel { margin-top:20px; }.advanced-actions { margin:12px 0; }.mono :deep(textarea) { font-family:Consolas,monospace; font-size:12px; line-height:1.5; }.diagnostics { margin-top:16px; } @media(max-width:900px){.grid{grid-template-columns:1fr}}
</style>
