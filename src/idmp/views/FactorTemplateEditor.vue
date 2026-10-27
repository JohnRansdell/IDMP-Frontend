<template>
  <div class="idmp-page template-editor">
    <PageHeader :title="isCreate ? '新建因子模板' : '因子模板版本'" :status="version.publicationStatus || 'DRAFT'">
      <template #actions><el-button @click="router.push('/factor/templates')">返回目录</el-button><template v-if="!isCreate && !editable"><el-button :loading="creatingVersion" @click="createVersion">创建新版本</el-button><el-button @click="openInstances">查看已创建因子</el-button><el-button type="primary" @click="instantiate">使用模板创建因子</el-button></template></template>
    </PageHeader>
    <section class="template-basics">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="!editable">
        <el-form-item label="模板名称" prop="name"><el-input v-model.trim="form.name" placeholder="请输入模板名称" /></el-form-item>
        <el-form-item label="模板说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <div class="section-heading"><h2>模板参数</h2><el-button v-if="editable" :icon="Plus" @click="addParameter">添加参数</el-button></div>
      <el-table :data="parameters" border empty-text="无参数模板按固定口径创建因子。">
        <el-table-column label="参数编码" min-width="150"><template #default="{ row }"><el-input v-model.trim="row.code" :disabled="!editable" placeholder="例如 LEVEL" /></template></el-table-column>
        <el-table-column label="参数名称" min-width="150"><template #default="{ row }"><el-input v-model="row.displayName" :disabled="!editable" placeholder="例如 手术级别" /></template></el-table-column>
        <el-table-column label="类型" width="150"><template #default="{ row }"><el-select v-model="row.dataType" :disabled="!editable"><el-option v-for="item in parameterTypes" :key="item.value" :label="item.label" :value="item.value" /></el-select></template></el-table-column>
        <el-table-column label="默认值" min-width="140"><template #default="{ row }"><el-input-number v-if="['DECIMAL','NUMBER','INTEGER'].includes(row.dataType)" v-model="row.defaultValue" :disabled="!editable" :precision="row.dataType === 'INTEGER' ? 0 : undefined" /><el-select v-else-if="row.dataType === 'BOOLEAN'" v-model="row.defaultValue" clearable :disabled="!editable"><el-option label="是" :value="true" /><el-option label="否" :value="false" /></el-select><el-input v-else v-model="row.defaultValue" :disabled="!editable" /></template></el-table-column>
        <el-table-column label="值来源" min-width="150"><template #default="{ row }"><el-select v-model="row.valueSourceType" :disabled="!editable"><el-option label="手工输入" value="MANUAL" /><el-option label="固定枚举" value="FIXED" /><el-option label="值集" value="VALUE_SET" /><el-option label="业务字段" value="SEMANTIC_FIELD" /><el-option label="枚举" value="ENUM" /></el-select><el-select v-if="row.valueSourceType === 'VALUE_SET'" v-model="row.valueSourceRef" filterable clearable :disabled="!editable"><el-option v-for="item in valueSets" :key="item.id" :value="item.code" :label="item.name || '未命名值集'" /></el-select><el-input v-else-if="['SEMANTIC_FIELD','ENUM'].includes(row.valueSourceType)" v-model="row.valueSourceRef" :disabled="!editable" placeholder="值来源引用" /></template></el-table-column>
        <el-table-column label="可选值" min-width="160"><template #default="{ row }"><el-select v-model="row.validation.enum" multiple filterable allow-create default-first-option :disabled="!editable"><el-option v-for="item in row.validation.enum" :key="item" :value="item" :label="String(item)" /></el-select></template></el-table-column>
        <el-table-column label="必填" width="70"><template #default="{ row }"><el-switch v-model="row.required" :disabled="!editable" /></template></el-table-column>
        <el-table-column label="允许填写" width="90"><template #default="{ row }"><el-switch v-model="row.exposed" :disabled="!editable" /></template></el-table-column>
        <el-table-column label="操作" width="70"><template #default="{ $index }"><el-button :icon="Delete" circle title="删除参数" :disabled="!editable" @click="parameters.splice($index,1)" /></template></el-table-column>
      </el-table>
    </section>
    <FactorEditor v-if="loaded" :key="editorKey" ref="definitionEditor" definition-only :disabled="!editable" :initial-definition="definition" :template-parameters="parameters" />
    <el-collapse v-if="editable" v-model="openPanels" class="advanced-panel"><el-collapse-item title="高级配置" name="advanced"><div class="advanced-actions"><el-button @click="refreshAdvancedJson">从当前表单生成</el-button><el-button @click="applyAdvancedJson">导入到表单</el-button></div><el-input v-model="advancedJson" type="textarea" :rows="12" /></el-collapse-item></el-collapse>
    <el-alert v-if="diagnostics" :title="diagnostics" type="warning" :closable="false" />
    <div v-if="editable" class="editor-actions-bar"><el-button :loading="saving" type="primary" @click="save">{{ isCreate ? '创建模板草稿' : '保存草稿' }}</el-button><el-button v-if="!isCreate" :loading="validating" @click="validate">校验</el-button><el-button v-if="!isCreate" :loading="publishing" @click="publish">发布</el-button></div>
    <el-dialog v-model="instancesVisible" title="该模板版本创建的因子" width="760px"><el-table v-loading="instancesLoading" :data="instances" empty-text="暂无仍有效的实例因子"><el-table-column prop="name" label="因子名称" min-width="180" /><el-table-column prop="status" label="状态" width="110" /><el-table-column label="生效参数" min-width="190"><template #default="{ row }">{{ parameterSummary(row.origin?.effectiveParameters) }}</template></el-table-column><el-table-column label="操作" width="90"><template #default="{ row }"><el-button link @click="router.push(`/factor/edit/${encodeURIComponent(row.id)}`)">查看</el-button></template></el-table-column></el-table></el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import PageHeader from '@/idmp/components/PageHeader.vue'
import FactorEditor from './FactorEditor.vue'
import { fieldLabel, toUserMessage } from '@/idmp/utils/userMessage.js'
import { createFactorTemplate, createFactorTemplateVersion, fetchAllFactorTemplateInstances as fetchFactorTemplateInstances, fetchFactorTemplateVersion, publishFactorTemplateVersion, updateFactorTemplateVersion, validateFactorTemplateVersion } from '@/idmp/api/modules/factors'
import { fetchValueSets } from '@/idmp/api/modules/valueSets'
import { fetchAllPages } from '@/idmp/api/pagination.js'

const route = useRoute(), router = useRouter(), formRef = ref(), definitionEditor = ref()
const isCreate = computed(() => route.name === 'FactorTemplateCreate')
const version = reactive({}), template = ref({}), form = reactive({name:'',description:'',factorTypeScope:'AGGREGATE'})
const editable = computed(() => isCreate.value || (version.publicationStatus || version.status) !== 'PUBLISHED')
const rules = {name:[{required:true,message:'请输入模板名称',trigger:'blur'}]}
const parameters = ref([]), valueSets = ref([]), definition = ref(null), editorKey = ref(0), loaded = ref(false)
const saving = ref(false), validating = ref(false), publishing = ref(false), creatingVersion = ref(false)
const instancesLoading = ref(false), instancesVisible = ref(false), instances = ref([]), diagnostics = ref(''), advancedJson = ref(''), openPanels = ref([])
const parameterTypes = [{value:'CODE',label:'标准值'},{value:'FIELD_REF',label:'字段引用'},{value:'VALUE_SET',label:'值集'},{value:'STRING',label:'文本'},{value:'DECIMAL',label:'数值'},{value:'INTEGER',label:'整数'},{value:'DATETIME',label:'日期时间'},{value:'BOOLEAN',label:'布尔'}]

onMounted(async()=>{
  try{valueSets.value=await fetchAllPages(fetchValueSets,{status:'PUBLISHED',size:100})}catch(error){ElMessage.error(error.message||'值集读取失败')}
  if(!isCreate.value)await load();else loaded.value=true
})
watch(()=>route.params.versionId,(id,previous)=>{if(id&&id!==previous)load()})
async function load(){
  loaded.value=false
  try{
    const result=await fetchFactorTemplateVersion(route.params.versionId)
    template.value=result.template||{}
    Object.assign(version,result.version||result)
    Object.assign(form,{name:template.value.name||version.name||'',description:template.value.description||version.description||'',factorTypeScope:template.value.factorTypeScope||'AGGREGATE'})
    definition.value=version.templateDefinition||null
    parameters.value=(version.parameters||[]).map((item,index)=>({...item,required:Boolean(item.required),exposed:item.exposed!==false,displayOrder:item.displayOrder??index,validation:{...item.validation,enum:item.validation?.enum||[]}}))
    advancedJson.value=JSON.stringify(definition.value,null,2)
    editorKey.value++
    loaded.value=true
  }catch(error){ElMessage.error(error.message||'模板读取失败')}
}
function addParameter(){parameters.value.push({code:'',displayName:'',dataType:'CODE',required:false,exposed:true,defaultValue:'',valueSourceType:'MANUAL',valueSourceRef:'',validation:{enum:[]}})}
function refreshAdvancedJson(){try{advancedJson.value=JSON.stringify(definitionEditor.value.getDefinition(false),null,2)}catch(error){ElMessage.warning(error.message)}}
function applyAdvancedJson(){try{const value=JSON.parse(advancedJson.value);if(!value||value.dslType!=='FACTOR')throw new Error('请选择有效的因子定义');definition.value=value;editorKey.value++}catch(error){ElMessage.error(error.message||'配置格式无效')}}
async function payload(){
  if(!(await formRef.value?.validate().catch(()=>false)))return null
  const codes=new Set()
  for(const item of parameters.value){
    const code=String(item.code||'').toUpperCase()
    if(!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)||codes.has(code)){ElMessage.warning('模板参数编码无效或重复');return null}
    codes.add(code)
    if(item.defaultValue!==''&&item.defaultValue!=null&&item.validation.enum.length&&!item.validation.enum.some(value=>String(value)===String(item.defaultValue))){ElMessage.warning('参数默认值必须属于可选值');return null}
  }
  let dsl
  try{dsl=definitionEditor.value.getDefinition()}catch(error){ElMessage.warning(error.message);return null}
  return {resourceVersion:version.resourceVersion,...form,templateDefinition:dsl,outputDescriptor:dsl.output,parameters:parameters.value.map((item,index)=>({...item,code:item.code.toUpperCase(),displayOrder:index,defaultValue:item.defaultValue===''?null:item.defaultValue,valueSourceRef:item.valueSourceRef||null,validation:item.validation.enum.length?item.validation:{...item.validation,enum:undefined}}))}
}
async function save(){
  if(saving.value)return
  const data=await payload();if(!data)return
  saving.value=true
  try{
    const result=isCreate.value?await createFactorTemplate(data):await updateFactorTemplateVersion(route.params.versionId,data)
    Object.assign(version,result.version||result);diagnostics.value=''
    if(isCreate.value)await router.replace(`/factor/templates/${encodeURIComponent(result.template.id)}/versions/${encodeURIComponent(version.id)}`)
    ElMessage.success('模板草稿已保存')
  }catch(error){ElMessage.error(error.message||'保存失败')}finally{saving.value=false}
}
async function validate(){if(validating.value)return;validating.value=true;try{const result=await validateFactorTemplateVersion(route.params.versionId);Object.assign(version,result.version||result);diagnostics.value=(result.diagnostics||[]).map(item=>`${fieldLabel(item.path)}：${toUserMessage(item.message,'请检查模板定义')}`).join('；');result.valid?ElMessage.success('模板校验通过'):ElMessage.warning('模板校验未通过')}catch(error){ElMessage.error(error.message||'校验失败')}finally{validating.value=false}}
async function publish(){try{await ElMessageBox.confirm('发布后该版本不可编辑；变更需创建新版本。确认发布？','发布模板',{type:'warning'})}catch{return}publishing.value=true;try{const result=await publishFactorTemplateVersion(route.params.versionId,version.resourceVersion);Object.assign(version,result.version||result);Object.assign(template.value,result.template||{});ElMessage.success('模板版本已发布')}catch(error){ElMessage.error(error.message||'发布失败')}finally{publishing.value=false}}
async function createVersion(){creatingVersion.value=true;try{const result=await createFactorTemplateVersion(template.value.id,{copyFromVersionId:version.id});await router.push(`/factor/templates/${template.value.id}/versions/${(result.version||result).id}`)}catch(error){ElMessage.error(error.message||'创建新版本失败')}finally{creatingVersion.value=false}}
function instantiate(){router.push(`/factor/templates/${template.value.id}/versions/${version.id}/instantiate`)}
async function openInstances(){instancesVisible.value=true;instancesLoading.value=true;try{const result=await fetchFactorTemplateInstances(version.id,{page:1,size:100});instances.value=Array.isArray(result)?result:result.items||result.records||[]}catch(error){ElMessage.error(error.message||'因子读取失败')}finally{instancesLoading.value=false}}
function parameterSummary(values){return values&&Object.keys(values).length?Object.entries(values).map(([key,value])=>`${parameters.value.find(item=>item.code===key)?.displayName||key}=${value}`).join('；'):'-'}
</script>

<style scoped>
.template-basics{padding:20px 0;border-bottom:1px solid var(--idmp-border-subtle,#dfe4ea)}
.section-heading,.advanced-actions,.editor-actions-bar{display:flex;align-items:center;gap:12px;margin:16px 0}
.section-heading{justify-content:space-between}.section-heading h2{font-size:16px;margin:0}
.advanced-panel{margin:20px 0}.editor-actions-bar{position:sticky;bottom:0;z-index:5;background:#fff;padding:14px;border-top:1px solid #dfe4ea;flex-wrap:wrap}
:deep(.definition-only){padding:0;gap:0}:deep(.definition-only .editor-section){box-shadow:none;border-radius:0}
</style>
