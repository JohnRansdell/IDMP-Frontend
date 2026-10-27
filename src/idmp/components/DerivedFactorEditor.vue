<template>
  <section class="surface-card derived-editor" aria-label="复合因子定义">
    <h2>复合因子定义</h2>
    <el-form label-position="top" class="definition-fields">
      <el-form-item label="数据域"><el-select :model-value="modelValue.primaryDomain?.domainCode" filterable :disabled="disabled" @update:model-value="value => update('primaryDomain', { ...modelValue.primaryDomain, domainCode: value })"><el-option v-for="domain in domains" :key="domain.code" :value="domain.code" :label="domain.name || '未命名数据域'" /></el-select></el-form-item>
      <el-form-item label="输出分组粒度"><el-select :model-value="modelValue.output?.grain || []" multiple filterable allow-create default-first-option :disabled="disabled" placeholder="不选表示总体" @update:model-value="value => updateOutput('grain', value)"><el-option v-for="grain in grains" :key="grain" :value="grain" :label="grain" /></el-select></el-form-item>
      <el-form-item label="输出量纲"><el-input :model-value="modelValue.output?.dimension" :disabled="disabled" @update:model-value="value => updateOutput('dimension', value)" /></el-form-item>
      <el-form-item label="输出单位"><el-input :model-value="modelValue.output?.unit" :disabled="disabled" @update:model-value="value => updateOutput('unit', value)" /></el-form-item>
    </el-form>
    <div class="formula-heading"><h3>计算公式</h3><el-button :icon="Refresh" size="small" :loading="loading" @click="loadVersions">刷新已发布因子</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="formula-mode" role="group" aria-label="公式编辑方式">
      <el-button :type="editorMode === 'simple' ? 'primary' : 'default'" :disabled="disabled && editorMode !== 'simple'" @click="switchToSimple">快捷计算</el-button>
      <el-button :type="editorMode === 'advanced' ? 'primary' : 'default'" @click="editorMode = 'advanced'">高级公式</el-button>
      <small>常用运算可直接选择因子；条件、函数和嵌套运算在高级公式中配置。</small>
    </div>
    <template v-if="editorMode === 'simple'">
      <div class="operation-choices" role="group" aria-label="计算方式">
        <el-button v-for="item in operations" :key="item.value" :type="simpleOperator === item.value ? 'primary' : 'default'" :disabled="disabled" @click="setOperator(item.value)">{{ item.label }}</el-button>
      </div>
      <div class="formula-builder" v-loading="loading">
        <div class="factor-slot"><label for="derived-left-factor">{{ simpleOperator === 'REF' ? '引用因子' : '左侧因子' }}</label>
          <el-select id="derived-left-factor" :model-value="simpleLeft" filterable :disabled="disabled" placeholder="搜索已发布因子版本" @update:model-value="value => setFactor('left', value)">
            <el-option v-for="item in versions" :key="item.id ?? item.versionId" :value="String(item.id ?? item.versionId)" :label="versionLabel(item)" />
          </el-select>
        </div>
        <strong v-if="simpleOperator !== 'REF'" class="operator-symbol">{{ operatorSymbol }}</strong>
        <div v-if="simpleOperator !== 'REF'" class="factor-slot"><label for="derived-right-factor">右侧因子</label>
          <el-select id="derived-right-factor" :model-value="simpleRight" filterable :disabled="disabled" placeholder="搜索已发布因子版本" @update:model-value="value => setFactor('right', value)">
            <el-option v-for="item in versions" :key="item.id ?? item.versionId" :value="String(item.id ?? item.versionId)" :label="versionLabel(item)" />
          </el-select>
        </div>
      </div>
      <el-form-item v-if="simpleOperator === 'DIV'" label="分母为零时" class="zero-policy"><el-select :model-value="modelValue.expression?.zeroDenominatorPolicy || 'RETURN_NULL'" :disabled="disabled" @update:model-value="setZeroPolicy"><el-option label="返回空值" value="RETURN_NULL" /><el-option label="返回零" value="RETURN_ZERO" /><el-option label="报错" value="ERROR" /></el-select></el-form-item>
    </template>
    <FactorExpressionNode v-else v-loading="loading" :model-value="modelValue.expression" :versions="versions" :disabled="disabled" @update:model-value="value => update('expression', value)" />
    <div class="formula-preview" aria-live="polite"><span>公式预览</span><strong>{{ formulaPreview }}</strong></div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import FactorExpressionNode from './FactorExpressionNode.vue'
import { fetchPublishedFactorVersions } from '@/idmp/api/modules/factors'
import { buildSimpleDerivedExpression, simpleDerivedExpression, validateDerivedFactor } from '@/idmp/utils/derivedFactor'
const props = defineProps({ modelValue: { type: Object, required: true }, domains: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const versions = ref([]), loading = ref(false), error = ref('')
const operations = [
  { value: 'REF', label: '直接引用' }, { value: 'ADD', label: '相加' },
  { value: 'SUB', label: '相减' }, { value: 'MUL', label: '相乘' }, { value: 'DIV', label: '相除' }
]
const editorMode = ref(simpleDerivedExpression(props.modelValue.expression) ? 'simple' : 'advanced')
const simple = computed(() => simpleDerivedExpression(props.modelValue.expression))
const simpleOperator = computed(() => simple.value?.operator || 'ADD')
const simpleLeft = computed(() => String(simple.value?.left?.factorVersionId || ''))
const simpleRight = computed(() => String(simple.value?.right?.factorVersionId || ''))
const operatorSymbol = computed(() => ({ ADD: '+', SUB: '−', MUL: '×', DIV: '÷' })[simpleOperator.value])
const versionName = id => versions.value.find(item => String(item.id ?? item.versionId) === String(id))?.factorName
  || (id ? `因子版本 ${id}` : '请选择因子')
const formulaPreview = computed(() => {
  if (!simple.value) return '当前为高级公式；可在上方逐层查看和修改。'
  const left = versionName(simpleLeft.value)
  return simpleOperator.value === 'REF' ? left : `${left} ${operatorSymbol.value} ${versionName(simpleRight.value)}`
})
const grains = computed(() => [...new Set(versions.value.flatMap(item => item.output?.grain || item.dsl?.output?.grain || []))])
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function updateOutput(key, value) { update('output', { ...props.modelValue.output, [key]: value }) }
function versionLabel(item) { return `${item.factorName || '未命名因子'} · V${item.versionNo} · ${item.id ?? item.versionId}` }
function setOperator(operator) {
  if (operator === simpleOperator.value) return
  update('expression', buildSimpleDerivedExpression(operator, simple.value?.left || '', simple.value?.right || '',
    props.modelValue.expression?.zeroDenominatorPolicy || 'RETURN_NULL'))
}
function setFactor(side, value) {
  const left = simple.value?.left || ''
  const right = simple.value?.right || ''
  update('expression', buildSimpleDerivedExpression(simpleOperator.value,
    side === 'left' ? { ...left, factorVersionId: value } : left,
    side === 'right' ? { ...right, factorVersionId: value } : right,
    props.modelValue.expression?.zeroDenominatorPolicy || 'RETURN_NULL'))
}
function setZeroPolicy(value) { update('expression', { ...props.modelValue.expression, zeroDenominatorPolicy: value }) }
async function switchToSimple() {
  if (editorMode.value === 'simple') return
  if (!simple.value) {
    try { await ElMessageBox.confirm('切换后将用新的两因子公式替换当前高级公式。', '替换公式', { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' }) }
    catch { return }
    update('expression', buildSimpleDerivedExpression('ADD', '', ''))
  }
  editorMode.value = 'simple'
}
watch(() => props.modelValue.expression, expression => {
  if (!simpleDerivedExpression(expression)) editorMode.value = 'advanced'
})
async function loadVersions() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try {
    versions.value = await fetchPublishedFactorVersions()
  } catch (e) { error.value = e?.message || '已发布因子加载失败，请重试' }
  finally { loading.value = false }
}
defineExpose({ validate: () => { if (error.value || loading.value) throw new Error('请先完成已发布因子的加载'); return validateDerivedFactor(props.modelValue, versions.value) } })
onMounted(loadVersions)
</script>
<style scoped>
.derived-editor { margin-bottom: 16px; padding: 18px; }
h2 { margin: 0 0 16px; font-size: 16px; } h3 { margin: 0; font-size: 15px; }
.definition-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.definition-fields :deep(.el-select) { width: 100%; }
.formula-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 10px 0; }
.formula-mode { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 14px 0; }
.formula-mode .el-button + .el-button, .operation-choices .el-button + .el-button { margin-left: 0; }
.formula-mode small { color: var(--idmp-text-helper); }
.operation-choices { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.formula-builder { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; gap: 12px; }
.factor-slot { min-width: 0; padding: 14px; border: 1px solid var(--idmp-border-subtle, #e5e7eb); border-radius: 8px; background: var(--idmp-surface, #fff); }
.factor-slot label { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
.factor-slot .el-select { width: 100%; }
.operator-symbol { padding-bottom: 20px; font-size: 22px; }
.zero-policy { margin-top: 12px; max-width: 280px; }
.formula-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; padding: 12px 14px; border-radius: 8px; background: var(--idmp-bg-subtle, #f5f7fa); }
.formula-preview span { color: var(--idmp-text-helper); }
.formula-preview strong { overflow-wrap: anywhere; }
@media (max-width: 650px) { .formula-builder { grid-template-columns: minmax(0, 1fr); } .operator-symbol { padding: 0; text-align: center; } }
@media (max-width: 650px) { .definition-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
