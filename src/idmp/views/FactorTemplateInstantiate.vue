<template>
  <div class="idmp-page instantiate-page">
    <PageHeader title="从模板创建因子" status="PUBLISHED" status-label="已发布模板"><template #actions><el-button @click="router.push('/factor/templates')">返回模板目录</el-button></template></PageHeader>
    <section v-loading="loading.page" class="surface-card wizard-card">
      <template v-if="!loadError">
        <el-steps :active="workflowActive" finish-status="success" simple class="wizard-steps"><el-step title="填写实例信息" /><el-step title="创建因子草稿" /><el-step title="编译校验" /><el-step title="试算验证（可选）" /><el-step title="发布版本" /></el-steps>
        <div class="template-summary"><div><span>模板</span><strong>{{ template.name || '-' }}</strong></div><div><span>版本</span><strong>V{{ version.versionNo || '-' }}</strong></div><div><span>适用数据域</span><strong>{{ domainSummary }}</strong></div></div>
        <el-alert type="info" :closable="false" show-icon title="计算口径由模板固定。创建草稿后将在本页继续编译、可选试算和发布。" />
        <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="instantiate-form" :disabled="Boolean(createdFactor)">
          <div class="section-title"><span>1</span><div><h2>因子基本信息</h2><p>填写本次实例的业务标识。</p></div></div>
          <div class="form-grid"><el-form-item label="因子名称" prop="factorName"><el-input v-model.trim="form.factorName" placeholder="例如 女性出院病案人次" /></el-form-item><el-form-item label="业务分类"><el-input v-model.trim="form.category" placeholder="例如 医疗质量" /></el-form-item></div>
          <el-form-item label="说明"><el-input v-model.trim="form.description" type="textarea" :rows="2" placeholder="可选：说明本次实例的业务用途" /></el-form-item>
          <el-divider />
          <div class="section-title"><span>2</span><div><h2>模板预留参数</h2><p>仅显示模板声明并允许业务用户填写的参数。</p></div></div>
          <el-empty v-if="!parameterFields.length" description="该模板没有可填写的预留参数，将按固定口径创建。" :image-size="64" />
          <div v-else class="parameter-grid">
            <el-form-item v-for="field in parameterFields" :key="field.code" :label="field.label" :required="field.required">
              <el-select v-if="field.isField" v-model="parameterValues[field.code]" filterable clearable placeholder="请选择字段" no-data-text="当前模板没有符合条件的字段"><el-option v-for="option in field.fieldOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select>
              <el-select v-else-if="field.enumValues.length" v-model="parameterValues[field.code]" filterable placeholder="请选择标准值"><el-option v-for="option in field.enumValues" :key="String(option)" :label="optionLabel(field, option)" :value="option" /></el-select>
              <el-input-number v-else-if="field.type === 'number' || field.type === 'integer'" v-model="parameterValues[field.code]" :precision="field.type === 'integer' ? 0 : undefined" :step="field.type === 'integer' ? 1 : 0.1" />
              <el-switch v-else-if="field.type === 'boolean'" v-model="parameterValues[field.code]" />
              <el-input v-else v-model="parameterValues[field.code]" :placeholder="field.placeholder" />
              <div v-if="field.description || field.defaultValue !== undefined" class="field-help">{{ field.description || `默认值：${parameterDisplay(field, field.defaultValue)}` }}</div>
            </el-form-item>
          </div>
          <el-divider />
          <div class="section-title"><span>3</span><div><h2>创建确认</h2><p>确认后，使用所选参数创建因子。</p></div></div>
          <div class="confirmation-list"><div v-for="field in parameterFields" :key="field.code"><span>{{ field.label }}</span><strong>{{ parameterDisplay(field, parameterValues[field.code]) }}</strong></div><div v-if="!parameterFields.length"><span>模板参数</span><strong>无，按模板固定口径创建</strong></div></div>
          <div v-if="!createdFactor" class="actions"><el-button type="primary" :loading="submitting" @click="instantiate">创建因子草稿</el-button></div>
        </el-form>
        <section v-if="createdFactor" ref="workflowSection" class="workflow-panel">
          <el-alert type="success" :closable="false" show-icon title="因子草稿已创建，请继续编译校验。" />
          <div class="section-title"><span>4</span><div><h2>编译、试算与发布</h2><p>编译通过后即可发布；试算仅用于验证某个时间范围内的实际计算结果。</p></div></div>
          <details v-if="$can('GET', '/system/health')"><summary>查看高级诊断</summary><div class="workflow-identity"><div><span>因子 ID</span><strong>{{ workflow.factorId }}</strong></div><div><span>草稿版本 ID</span><strong>{{ workflow.versionId }}</strong></div><div><span>编译产物</span><strong>{{ workflow.artifactId || '-' }}</strong></div><div><span>当前状态</span><strong>{{ workflow.status || 'DRAFT' }}</strong></div></div></details>
          <el-steps :active="workflowProgress" finish-status="success" simple class="workflow-steps"><el-step title="创建草稿" /><el-step title="编译校验" /><el-step title="试算验证（可选）" /><el-step title="发布版本" /></el-steps>
          <div class="workflow-actions"><el-button type="primary" :loading="loading.compile" :disabled="workflow.published" @click="compileCurrentVersion">编译并校验</el-button><el-button :disabled="!workflow.compiled || workflow.published" @click="showTrial = !showTrial">{{ showTrial ? '收起试算验证' : '可选：试算验证' }}</el-button><el-button type="success" :loading="loading.publish" :disabled="!canPublish" @click="publishCurrentVersion">发布因子版本</el-button></div>
          <div v-if="showTrial" class="trial-card"><div><strong>试算验证（可选）</strong><small>{{ isStaticFactor ? '静态因子将执行一次全量试算，不提交统计周期。' : '试算不会修改因子定义；所选时间仅决定本次用哪段实际数据验证结果。' }}</small></div><el-date-picker v-if="!isStaticFactor" v-model="trialPeriod" type="datetimerange" unlink-panels value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" /><el-tag v-else type="info">静态全量试算</el-tag><el-button :loading="loading.trial || loading.result" @click="trialCurrentVersion">{{ trialButtonLabel }}</el-button></div>
          <div v-if="workflow.taskId" class="workflow-feedback"><span>任务 ID：{{ workflow.taskId }}</span><span>任务状态：{{ workflow.taskStatus || 'QUEUED' }}</span><el-button v-if="!isTerminalTask" link type="primary" :loading="loading.status" @click="refreshTrialStatus">刷新状态</el-button></div>
          <el-alert v-if="workflow.message" :title="workflow.message" :type="workflow.messageType" :closable="false" show-icon class="workflow-alert" />
          <div v-if="trialRows.length" class="trial-results"><div class="result-head"><h3>试算结果</h3><span>共 {{ trialPagination.total }} 条</span></div><el-table :data="trialRows" size="small" border><el-table-column type="index" label="#" width="54" /><el-table-column label="维度" min-width="220"><template #default="{ row }">{{ formatDimensions(row) }}</template></el-table-column><el-table-column label="结果值" min-width="130"><template #default="{ row }">{{ resultValue(row) }}</template></el-table-column><el-table-column prop="qualityStatus" label="质量状态" width="120" /></el-table><el-pagination :current-page="trialPagination.page" :page-size="trialPagination.size" :total="trialPagination.total" :disabled="loading.result" layout="total, prev, pager, next" @current-change="loadTrialResults" /></div>
          <div v-if="workflow.published" class="published-next"><strong>因子版本已发布，可供指标引用。</strong><el-button type="primary" @click="router.push('/factor')">返回因子目录</el-button></div>
        </section>
      </template>
      <el-result v-else icon="error" title="无法读取可用模板参数" :sub-title="loadError"><template #extra><el-button type="primary" @click="load">重试</el-button></template></el-result>
    </section>
  </div>
</template>

<script setup>
import { useFactorVersionWorkflow } from '@/idmp/features/factor/useFactorVersionWorkflow.js'
import { factorCalculationMode } from '@/idmp/utils/factorPeriod'; import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { compileFactorVersion, fetchFactorTemplateParameterSchema, fetchFactorTemplateVersion, fetchFactorTrialResults, fetchFactorVersion, instantiateFactorTemplateVersion, publishFactorVersion, trialFactorVersion } from '@/idmp/api/modules/factors'
import { fetchAsyncTask } from '@/idmp/api/modules/calculation'
import { fetchDataDomains } from '@/idmp/api/modules/meta'
import { adaptDataDomainList } from '@/idmp/api/adapters/meta'
import { templateParameterFields } from '@/idmp/utils/templateParameterFields.js'

const domainNames = ref({})
async function loadDomainNames() {
  try { domainNames.value = Object.fromEntries(adaptDataDomainList(await fetchDataDomains()).map(item => [item.code, item.name])) }
  catch { domainNames.value = {} }
}
onMounted(loadDomainNames)

const route = useRoute(); const router = useRouter(); const formRef = ref(); const workflowSection = ref(); const loading = reactive({ page: false, compile: false, trial: false, result: false, publish: false, status: false }); const submitting = ref(false); const loadError = ref(''); const template = reactive({}); const version = reactive({}); const parameterFields = ref([]); const parameterValues = reactive({}); const createdFactor = ref(null); const calculationMode = ref('TEMPORAL'); const showTrial = ref(false); const trialPeriod = ref([]); const trialPagination = reactive({page:1,size:100,total:0}); const trialRows = ref([]); const workflow = reactive({ factorId: '', versionId: '', status: 'DRAFT', artifactId: '', compiled: false, published: false, taskId: '', batchId: '', taskStatus: '', qualityStatus: '', resultsLoaded: false, message: '', messageType: 'info' }); const form = reactive({ factorCode: '', factorName: '', description: '', category: '' })
const formRules = { factorName: [{ required: true, message: '请输入因子名称', trigger: 'blur' }] }
const domainSummary = computed(() => (version.applicableDomains || version.templateDefinition?.applicableDomains || []).map(item => item.domainName || domainNames.value[typeof item === 'string' ? item : item.domainCode || item.code] || '名称未提供').filter(Boolean).join('、') || '-')
const workflowActive = computed(() => workflow.published ? 5 : workflow.compiled ? 3 : createdFactor.value ? 2 : 1); const workflowProgress = computed(() => workflow.published ? 4 : workflow.resultsLoaded ? 3 : workflow.compiled ? 2 : 1); const isTerminalTask = computed(() => ['SUCCEEDED', 'SUCCESS', 'FAILED', 'CANCELED', 'CANCELLED', 'PARTIAL_SUCCEEDED'].includes(String(workflow.taskStatus).toUpperCase())); const canPublish = computed(() => workflow.compiled && !workflow.published && !loading.publish); const trialButtonLabel = computed(() => loading.trial || loading.result ? '正在试算并读取结果' : workflow.resultsLoaded ? '重新试算并查看结果' : workflow.taskId && !isTerminalTask.value ? '继续查询试算状态' : '试算并查看结果')
const isStaticFactor = computed(() => calculationMode.value === 'STATIC')
const factorVersionWorkflow = useFactorVersionWorkflow({
  workflow, loading, trialRows, trialPagination, notify: ElMessage,
  api: { compile: compileFactorVersion, trial: trialFactorVersion, fetchTask: fetchAsyncTask,
    fetchResults: fetchFactorTrialResults, publish: publishFactorVersion },
  formatDiagnostics
})
onMounted(load)
async function load() {
  loading.page = true; loadError.value = ''
  try {
    const [schemaResponse, detail] = await Promise.all([fetchFactorTemplateParameterSchema(route.params.templateId), fetchFactorTemplateVersion(route.params.versionId)])
    if (String(schemaResponse.templateVersionId) !== String(route.params.versionId)) throw new Error('该模板已有新的发布版本，请返回模板目录重新选择')
    Object.assign(template, detail?.template || {}); Object.assign(version, detail?.version || detail || {})
    parameterFields.value = templateParameterFields(schemaResponse.schema || {}, schemaResponse.parameters || version.parameters || [], version.templateDefinition)
    parameterFields.value.forEach(field => {
      if (!(field.code in parameterValues)) {
        const value = field.defaultValue ?? (field.type === 'boolean' ? false : '')
        parameterValues[field.code] = field.isField && !field.fieldOptions.some(option => option.value === value) ? '' : value
      }
    })
  } catch (error) { loadError.value = error?.message || '模板参数读取失败，请确认模板已发布且当前账号有使用权限。' }
  finally { loading.page = false }
}
function parameterDisplay(field, value) { return field.isField ? field.fieldOptions.find(option => option.value === value)?.label || formatValue(value) : formatValue(value) }
function optionLabel(field, option) { const match = field.options.find(item => (item.value || item.code) === option); return match ? `${match.label || match.name || option}（${option}）` : String(option) } function formatValue(value) { return value === undefined || value === null || value === '' ? '未填写' : Array.isArray(value) ? value.join('、') : String(value) } function toId(value) { return value === undefined || value === null ? '' : String(value) }
async function instantiate() { if (!(await formRef.value?.validate().catch(() => false))) return; const missing = parameterFields.value.find(field => field.required && (parameterValues[field.code] === undefined || parameterValues[field.code] === null || parameterValues[field.code] === '')); if (missing) return ElMessage.warning(`请填写参数：${missing.label}`); const invalidField = parameterFields.value.find(field => field.isField && parameterValues[field.code] && !field.fieldOptions.some(option => option.value === parameterValues[field.code])); if (invalidField) return ElMessage.warning(`请选择有效字段：${invalidField.label}`); submitting.value = true; try { const result = await instantiateFactorTemplateVersion(route.params.versionId, { factorCode: form.factorCode, factorName: form.factorName, description: form.description || undefined, category: form.category || undefined, parameterValues: Object.fromEntries(parameterFields.value.filter(field => parameterValues[field.code] !== '' && parameterValues[field.code] != null).map(field => [field.code, parameterValues[field.code]])) }); const factor = result?.factor || result; if (!factor?.id || !(factor.draftVersionId || factor.versionId)) throw new Error('实例化成功但未返回因子草稿版本，无法继续编译'); createdFactor.value = factor; workflow.factorId = toId(factor.id); workflow.versionId = toId(factor.draftVersionId || factor.versionId); workflow.status = factor.status || 'DRAFT'; let definition = factor; try { definition = await fetchFactorVersion(workflow.versionId) } catch { /* 实例化响应已可能包含完整 DSL。 */ } calculationMode.value = resolveCalculationMode(definition?.dsl || definition?.factorDsl || factor?.dsl || factor?.factorDsl); if (isStaticFactor.value) trialPeriod.value = []; workflow.message = `因子草稿已创建（${isStaticFactor.value ? '静态' : '时序'}）。下一步请执行编译校验。`; workflow.messageType = 'success'; ElMessage.success('因子草稿已创建'); await nextTick(); workflowSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (error) { ElMessage.error(error?.message || '因子草稿创建失败') } finally { submitting.value = false } }
async function compileCurrentVersion() { return factorVersionWorkflow.compile() }
async function trialCurrentVersion() { if (!workflow.compiled || loading.trial || loading.result) return; if (workflow.taskId && !isTerminalTask.value) return refreshTrialStatus(); if (workflow.taskStatus === 'SUCCEEDED' && workflow.batchId && !workflow.resultsLoaded) return loadTrialResults(); if (!isStaticFactor.value && (!Array.isArray(trialPeriod.value) || trialPeriod.value.length !== 2)) return ElMessage.warning('试算验证需要选择完整时间范围；该范围仅用于本次实际数据验证。'); const payload = isStaticFactor.value ? {} : { periodStart: trialPeriod.value[0], periodEnd: trialPeriod.value[1] }; return factorVersionWorkflow.trial(payload) }
async function pollTrialTask() { return factorVersionWorkflow.pollTrialTask() }
async function refreshTrialStatus() { return factorVersionWorkflow.refreshTrialStatus() }
async function loadTrialResults(page=1) { return factorVersionWorkflow.loadTrialResults(page) }
async function publishCurrentVersion() { if (!canPublish.value) return; return factorVersionWorkflow.publish(versionId => ElMessageBox.confirm(`确认发布因子版本 ${versionId}？`, '发布因子版本', { type: 'warning' })) }
function formatDiagnostics(diagnostics) { return (diagnostics || []).map(item => item.message || item.code).filter(Boolean).join('；') } function formatDimensions(row) { const dimensions = row?.dimensions || row?.dimensionValues || {}; return Object.keys(dimensions).length ? Object.entries(dimensions).map(([key, value]) => `${key}=${value}`).join('，') : '总体' } function resultValue(row) { return row?.displayValue ?? row?.valueDecimal ?? row?.resultValue ?? row?.value ?? '-' }
function resolveCalculationMode(dsl = {}) { return factorCalculationMode(dsl) }
</script>

<style scoped lang="scss">
.template-summary strong,.field-help,.confirmation-list strong{overflow-wrap:anywhere}
.parameter-grid :deep(.el-select){width:100%;min-width:0}
.wizard-card{padding:22px}.wizard-steps{margin-bottom:20px}.template-summary,.form-grid,.parameter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.template-summary{margin-bottom:18px;padding:14px;background:#f7fbff;border:1px solid #d6ecff;border-radius:8px}.template-summary span,.template-summary strong{display:block}.template-summary span,.field-help{color:#8c8c8c;font-size:12px}.template-summary strong{margin-top:4px;color:#1677c2}.instantiate-form{margin-top:24px}.section-title{display:grid;grid-template-columns:28px minmax(0,1fr);column-gap:12px;align-items:start;margin:20px 0 14px}.section-title>span{display:flex;align-items:center;justify-content:center;width:28px;height:28px;line-height:28px;color:#fff;background:#1890ff;border-radius:50%;font-weight:600}.section-title h2{margin:2px 0 4px;font-size:16px;line-height:22px}.section-title p{margin:0;color:#8c8c8c;font-size:13px;line-height:20px}.field-help{margin-top:6px}.confirmation-list{display:grid;gap:8px;padding:14px;background:#fafafa;border-radius:6px}.confirmation-list>div{display:flex;justify-content:space-between;gap:16px}.confirmation-list span{color:#595959}.confirmation-list strong{color:#1677c2}.actions{margin-top:20px;text-align:right}.workflow-panel{margin-top:28px;padding-top:4px;border-top:3px solid #1890ff}.workflow-identity{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.workflow-identity>div{padding:12px;background:#f7f8fa;border-radius:6px}.workflow-identity span,.workflow-identity strong{display:block}.workflow-identity span{margin-bottom:5px;color:#8c8c8c;font-size:12px}.workflow-identity strong{overflow:hidden;font-family:Consolas,monospace;text-overflow:ellipsis}.workflow-steps{margin-bottom:18px}.workflow-actions,.workflow-feedback,.published-next{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.trial-card{display:grid;grid-template-columns:minmax(220px,1fr) minmax(280px,420px) auto;gap:12px;align-items:end;margin-top:16px;padding:14px;background:#f7fbff;border:1px solid #d6ecff;border-radius:8px}.trial-card strong,.trial-card small{display:block}.trial-card small{margin-top:4px;color:#6b7280}.workflow-feedback{margin-top:14px;padding:12px;background:#f7fbff;border-radius:6px;color:#595959}.workflow-alert{margin-top:14px}.trial-results{margin-top:18px}.result-head{display:flex;justify-content:space-between;margin-bottom:10px}.result-head h3{margin:0;font-size:15px}.published-next{margin-top:18px;padding:16px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:8px}.published-next strong{margin-right:auto;color:#389e0d}@media(max-width:900px){.template-summary,.form-grid,.parameter-grid,.workflow-identity{grid-template-columns:1fr}.trial-card{grid-template-columns:1fr}}
@media(max-width:600px){
  .wizard-steps,.workflow-steps{max-width:100%;overflow-x:auto;padding:12px}
  .wizard-steps :deep(.el-step),.workflow-steps :deep(.el-step){flex:none;min-width:150px}
  .confirmation-list>div{display:grid;gap:4px}
}
</style>
