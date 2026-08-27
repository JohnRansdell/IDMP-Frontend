<template>
  <div class="idmp-page value-set-create-page">
    <PageHeader title="新建值集">
      <template #meta><span class="header-meta">先定义值集的数据组织方式，再完成对应的业务配置。</span></template>
      <template #actions><el-button @click="cancel">返回值集管理</el-button></template>
    </PageHeader>

    <section class="surface-card create-card">
      <el-steps :active="2" finish-status="success" simple class="create-steps"><el-step title="基础信息" /><el-step title="组织方式与配置" /><el-step title="创建版本" /></el-steps>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="section-title"><span>1</span><div><h2>基础信息</h2><p>这些信息适用于所有值集类型。</p></div></div>
        <div class="form-grid"><el-form-item label="值集编码" prop="code"><el-input v-model.trim="form.code" placeholder="如 VS_INPATIENT_TOTAL_COST" /></el-form-item><el-form-item label="值集名称" prop="name"><el-input v-model.trim="form.name" placeholder="如 住院总费用" /></el-form-item><el-form-item label="值类型" prop="valueType"><el-select v-model="form.valueType" @change="handleValueTypeChange"><el-option label="文本" value="STRING" /><el-option label="整数" value="INTEGER" /><el-option label="小数" value="DECIMAL" /><el-option label="日期" value="DATE" /><el-option label="日期时间" value="DATETIME" /></el-select></el-form-item><el-form-item label="来源标准名称"><el-input v-model.trim="form.sourceStandardName" placeholder="如 vmq_basicinformationba.total_cost" /></el-form-item></div>
        <el-form-item label="说明"><el-input v-model.trim="form.description" type="textarea" :rows="2" placeholder="说明值集的业务用途和使用范围" /></el-form-item>

        <el-divider />
        <div class="section-title"><span>2</span><div><h2>数据组织方式</h2><p>选择最符合业务数据形态的方式；系统会自动提交对应的接口匹配模式。</p></div></div>
        <div class="mode-grid" role="radiogroup" aria-label="数据组织方式">
          <button v-for="mode in modes" :key="mode.value" type="button" class="mode-card" :class="{ 'is-selected': form.matchMode === mode.value }" @click="selectMode(mode.value)"><strong>{{ mode.title }}</strong><span>{{ mode.description }}</span><small>接口模式：{{ mode.value }}</small></button>
        </div>

        <section class="mode-config">
          <template v-if="isContinuous">
            <div class="section-title section-title--compact"><span>3</span><div><h2>连续范围规范</h2><p>适用于金额、数量、时长、日期等连续字段；不维护枚举值项。</p></div></div>
            <el-alert type="info" :closable="false" show-icon title="单位、精度和合法边界是字段约束，不是因子本次的筛选区间。" />
            <div class="form-grid"><el-form-item label="单位" required><el-input v-model.trim="form.continuousSpec.unit" placeholder="如 CNY" /></el-form-item><el-form-item v-if="isNumericContinuous" label="总精度" required><el-input-number v-model="form.continuousSpec.precision" :min="1" :max="38" :precision="0" /></el-form-item><el-form-item v-if="isNumericContinuous" label="小数位" required><el-input-number v-model="form.continuousSpec.scale" :min="0" :max="form.continuousSpec.precision || 38" :precision="0" /></el-form-item></div>
            <div v-if="isNumericContinuous" class="form-grid"><el-form-item label="最小值"><el-input v-model.trim="form.continuousSpec.minimumValue" placeholder="可留空，如 0.00" /></el-form-item><el-form-item label="最大值"><el-input v-model.trim="form.continuousSpec.maximumValue" placeholder="可留空，如 100000000.00" /></el-form-item></div>
            <div v-if="isDateContinuous" class="form-grid"><el-form-item label="时间粒度"><el-input v-model.trim="form.continuousSpec.timeGranularity" placeholder="可选，如 DAY" /></el-form-item><el-form-item label="时区"><el-input v-model.trim="form.continuousSpec.timezone" placeholder="可选，如 Asia/Shanghai" /></el-form-item></div>
          </template>
          <template v-else>
            <div class="section-title section-title--compact"><span>3</span><div><h2>{{ selectedMode.title }}配置</h2><p>{{ selectedMode.nextStep }}</p></div></div>
            <el-alert type="info" :closable="false" show-icon :title="selectedMode.helper" />
          </template>
        </section>

        <div class="create-summary"><span>即将创建</span><strong>{{ selectedMode.title }}</strong><span>值类型：{{ dataTypeText }}</span><span>接口匹配模式：{{ form.matchMode }}</span></div>
        <div class="create-actions"><el-button @click="cancel">取消</el-button><el-button type="primary" :loading="creating" @click="submit">{{ submitLabel }}</el-button></div>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { createValueSet } from '@/idmp/api/modules/valueSets'
import { dataTypeLabel } from '@/idmp/features/meta'

const router = useRouter()
const formRef = ref()
const creating = ref(false)
const form = reactive({ code: '', name: '', description: '', matchMode: 'EXACT', valueType: 'STRING', sourceStandardName: '', continuousSpec: { unit: '', precision: 18, scale: 2, minimumValue: '', maximumValue: '', minimumInclusive: true, maximumInclusive: true, timeGranularity: '', timezone: '' } })
const modes = [{ value: 'EXACT', title: '精确枚举', description: '固定编码与标准值的一一对应。', helper: '创建后进入版本页维护“编码、值、名称”等枚举值项。', nextStep: '创建后继续维护具体的枚举值项。' }, { value: 'PREFIX', title: '前缀编码', description: '按编码前缀归类，例如疾病或行政编码。', helper: '创建后进入版本页维护前缀值项和展示名称。', nextStep: '创建后继续维护前缀值项。' }, { value: 'RANGE', title: '区间档位', description: '多个有名称的离散区间，例如年龄段。', helper: '创建后进入版本页维护每个档位的开始值、结束值和名称。', nextStep: '创建后继续维护区间档位。' }, { value: 'HIERARCHICAL', title: '层级目录', description: '具有父子关系的组织、地区或分类目录。', helper: '创建后进入版本页维护值项及其父子关系。', nextStep: '创建后继续维护层级值项。' }, { value: 'CONTINUOUS', title: '连续数值/日期', description: '连续字段的单位、精度和合法边界。', helper: '', nextStep: '' }]
const rules = { code: [{ required: true, message: '请输入值集编码', trigger: 'blur' }, { pattern: /^[A-Za-z][A-Za-z0-9_]*$/, message: '编码以字母开头，仅使用字母、数字和下划线', trigger: 'blur' }], name: [{ required: true, message: '请输入值集名称', trigger: 'blur' }], valueType: [{ required: true, message: '请选择值类型', trigger: 'change' }] }
const isContinuous = computed(() => form.matchMode === 'CONTINUOUS')
const isNumericContinuous = computed(() => ['INTEGER', 'DECIMAL'].includes(form.valueType))
const isDateContinuous = computed(() => ['DATE', 'DATETIME'].includes(form.valueType))
const selectedMode = computed(() => modes.find(item => item.value === form.matchMode) || modes[0])
const dataTypeText = computed(() => dataTypeLabel(form.valueType) || form.valueType)
const submitLabel = computed(() => isContinuous.value ? '创建连续值集并继续' : '创建并维护值项')

function selectMode(mode) { form.matchMode = mode; if (mode === 'CONTINUOUS' && !['INTEGER', 'DECIMAL', 'DATE', 'DATETIME'].includes(form.valueType)) form.valueType = 'DECIMAL' }
function handleValueTypeChange() { if (isContinuous.value && !['INTEGER', 'DECIMAL', 'DATE', 'DATETIME'].includes(form.valueType)) form.valueType = 'DECIMAL'; if (form.valueType === 'INTEGER') form.continuousSpec.scale = 0 }
function continuousValidation() { if (!isContinuous.value) return ''; const spec = form.continuousSpec; if (!spec.unit) return '请填写连续值集单位'; if (isNumericContinuous.value) { if (!Number.isInteger(spec.precision) || spec.precision < 1 || spec.precision > 38) return '总精度必须为 1 至 38 的整数'; if (!Number.isInteger(spec.scale) || spec.scale < 0 || spec.scale > spec.precision) return '小数位必须在 0 至总精度之间'; if (form.valueType === 'INTEGER' && spec.scale !== 0) return '整数值集的小数位必须为 0' } return '' }
function payload() { const result = { code: form.code, name: form.name, description: form.description, matchMode: form.matchMode, valueType: form.valueType }; if (form.sourceStandardName) result.sourceStandardName = form.sourceStandardName; if (isContinuous.value) { const spec = { ...form.continuousSpec }; if (form.valueType === 'INTEGER') spec.scale = 0; ['minimumValue', 'maximumValue', 'timeGranularity', 'timezone'].forEach(key => { if (spec[key] === '') spec[key] = null }); result.continuousSpec = spec } return result }
async function submit() { if (!(await formRef.value?.validate().catch(() => false))) return; const validation = continuousValidation(); if (validation) return ElMessage.warning(validation); creating.value = true; try { const data = await createValueSet(payload()); const valueSet = data?.valueSet || data; const version = data?.version || valueSet?.version || {}; const versionId = version.id || version.versionId || data?.versionId; if (!valueSet?.id) throw new Error('创建成功但未返回值集 ID'); ElMessage.success(`值集 ${valueSet.code || form.code} 创建成功`); if (versionId) router.replace({ name: 'ValueSetVersionEditor', params: { versionId }, query: { valueSetId: valueSet.id } }); else router.replace({ name: 'ValueSetDetail', params: { valueSetId: valueSet.id } }) } catch (error) { ElMessage.error(error?.message || '值集创建失败') } finally { creating.value = false } }
async function cancel() { if (form.code || form.name || form.description || form.sourceStandardName) { try { await ElMessageBox.confirm('当前填写内容尚未保存，确认离开吗？', '放弃创建', { type: 'warning' }) } catch { return } } router.push({ name: 'ValueSetManagement' }) }
</script>

<style scoped>
.value-set-create-page { display: flex; flex-direction: column; gap: 16px; }
.create-card { padding: 22px; }
.create-steps { margin-bottom: 24px; }
.section-title { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; margin: 20px 0 14px; }
.section-title > span { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: var(--idmp-interactive); color: #fff; font-weight: 650; }
.section-title h2 { margin: 2px 0 4px; font-size: 16px; }
.section-title p { margin: 0; color: var(--idmp-text-helper); font-size: 13px; line-height: 20px; }
.section-title--compact { margin-top: 0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.form-grid :deep(.el-select), .form-grid :deep(.el-input-number) { width: 100%; }
.mode-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.mode-card { min-height: 152px; padding: 16px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); background: var(--idmp-layer-01); color: var(--idmp-text-secondary); cursor: pointer; text-align: left; transition: border-color .2s, background .2s, box-shadow .2s; }
.mode-card:hover { border-color: var(--idmp-interactive); }
.mode-card.is-selected { border-color: var(--idmp-interactive); background: var(--idmp-layer-hover); box-shadow: 0 0 0 2px color-mix(in srgb, var(--idmp-interactive) 16%, transparent); }
.mode-card strong, .mode-card span, .mode-card small { display: block; }
.mode-card strong { color: var(--idmp-text-primary); font-size: 14px; }
.mode-card span { margin-top: 8px; font-size: 12px; line-height: 18px; }
.mode-card small { margin-top: 12px; color: var(--idmp-text-helper); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }
.mode-config { margin-top: 20px; padding: 18px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); background: var(--idmp-layer-02); }
.mode-config :deep(.el-alert) { margin-bottom: 16px; }
.create-summary { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 20px; padding: 14px 16px; border-radius: var(--idmp-radius-md); background: var(--idmp-layer-02); color: var(--idmp-text-secondary); font-size: 13px; }
.create-summary strong { color: var(--idmp-text-primary); }
.create-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
@media (max-width: 1100px) { .mode-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 720px) { .form-grid, .mode-grid { grid-template-columns: 1fr; } .mode-card { min-height: auto; } }
</style>
