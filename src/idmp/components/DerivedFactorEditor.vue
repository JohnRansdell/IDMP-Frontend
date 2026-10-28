<template>
  <section class="surface-card derived-editor" aria-label="复合因子定义">
    <h2>复合因子定义</h2>
    <p class="creation-hint">先选择已发布因子并设置计算方式。新建时自动匹配结果分组与可确认的输出属性；无需查看技术信息或选择数据域。</p>
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
    <p v-if="loadingMetadata" class="creation-hint">正在核对引用因子信息，请稍候……</p>
    <el-alert v-if="metadataError || metadataConflict" :title="metadataError || metadataConflict" type="error" :closable="false"><el-button v-if="metadataError" link type="primary" @click="retryMetadata">重试读取因子信息</el-button></el-alert>
    <div class="result-summary" aria-label="复合因子结果设置"><span>结果分组：{{ modelValue.output?.grain?.length ? modelValue.output.grain.join('、') : '总体（不分组）' }}</span><span>单位：{{ modelValue.output?.unit || '未指定' }}</span><small>保存后执行编译校验和试算，核对业务结果。</small></div>
    <details class="advanced-settings">
      <summary>高级设置（选填）</summary>
      <p class="creation-hint">仅在需要指定结果分组、单位或管理归类时调整。已保存配置会保留；未声明的量纲或单位不必猜填。</p>
      <el-form label-position="top" class="definition-fields">
        <el-form-item label="所属数据域（选填）"><el-select :model-value="modelValue.primaryDomain?.domainCode" clearable filterable :disabled="disabled" placeholder="可留空，计算数据来自引用因子" @update:model-value="setDomain"><el-option v-for="domain in domains" :key="domain.code" :value="domain.code" :label="domain.name || domain.code" /></el-select></el-form-item>
        <el-form-item label="结果分组"><el-select :model-value="modelValue.output?.grain || []" multiple filterable allow-create default-first-option :disabled="disabled" placeholder="不选表示总体" @update:model-value="value => updateOutput('grain', value)"><el-option v-for="grain in grains" :key="grain" :value="grain" :label="grain" /></el-select></el-form-item>
        <el-form-item label="输出量纲（选填）"><el-input :model-value="modelValue.output?.dimension" :disabled="disabled" placeholder="沿用已确认的定义，可不填写" @update:model-value="value => updateOutput('dimension', value)" /></el-form-item>
        <el-form-item label="输出单位（选填）"><el-input :model-value="modelValue.output?.unit" :disabled="disabled" placeholder="沿用已确认的单位，可不填写" @update:model-value="value => updateOutput('unit', value)" /></el-form-item>
      </el-form>
    </details>

  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import FactorExpressionNode from './FactorExpressionNode.vue'
import { fetchPublishedFactorVersions, fetchFactorVersion, fetchCompileArtifact } from '@/idmp/api/modules/factors'
import { buildSimpleDerivedExpression, simpleDerivedExpression, validateDerivedFactor, derivedReferenceIds, derivedResultDefaults } from '@/idmp/utils/derivedFactor'
const props = defineProps({ modelValue: { type: Object, required: true }, domains: { type: Array, default: () => [] }, disabled: Boolean, autoConfigure: Boolean })
const emit = defineEmits(['update:modelValue'])
const versions = ref([]), loading = ref(false), error = ref('')
const selectedVersions = ref([]), loadingMetadata = ref(false), metadataError = ref('')
const metadataCache = new Map(), manualOutputKeys = new Set()
let metadataRevision = 0
const metadataConflict = computed(() => { try { derivedResultDefaults(props.modelValue.expression, selectedVersions.value); return '' } catch (e) { return e.message } })
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
  || versions.value.find(item => String(item.id ?? item.versionId) === String(id))?.factorCode || (id ? `因子版本 ${id}` : '请选择因子')
const formulaPreview = computed(() => {
  if (!simple.value) return '当前为高级公式；可在上方逐层查看和修改。'
  const left = versionName(simpleLeft.value)
  return simpleOperator.value === 'REF' ? left : `${left} ${operatorSymbol.value} ${versionName(simpleRight.value)}`
})
const grains = computed(() => [...new Set(versions.value.flatMap(item => item.output?.grain || item.dsl?.output?.grain || []))])
function update(key, value) { if (!props.disabled) emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function updateOutput(key, value) { manualOutputKeys.add(key); const output = { ...props.modelValue.output, [key]: value }; if (value === '' && key !== 'grain') delete output[key]; update('output', output) }
function setDomain(value) { const domain = { ...props.modelValue.primaryDomain }; if (value) domain.domainCode = value; else delete domain.domainCode; update('primaryDomain', domain) }
function versionLabel(item) { return `${item.factorName || item.factorCode} · V${item.versionNo} · ${item.id ?? item.versionId}` }
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
async function loadSelectedMetadata() {
  const revision = ++metadataRevision
  const ids = derivedReferenceIds(props.modelValue.expression)
  loadingMetadata.value = !!ids.length; metadataError.value = ''
  try {
    const selected = await Promise.all(ids.map(async id => {
      if (metadataCache.has(id)) return metadataCache.get(id)
      const detail = await fetchFactorVersion(id)
      if (String(detail?.id ?? detail?.versionId) !== id) throw new Error('引用因子版本信息不一致，请重新选择')
      let output = detail.output || detail.dsl?.output || {}
      const artifactId = detail.currentArtifactId || detail.artifactId
      if (artifactId) {
        const artifact = await fetchCompileArtifact(artifactId)
        output = artifact.outputDescriptor || artifact.output || output
      }
      const item = { ...versions.value.find(row => String(row.id ?? row.versionId) === id), ...detail, output,
        calculationMode: detail.calculationMode || detail.dsl?.calculationMode || 'TEMPORAL' }
      metadataCache.set(id, item)
      return item
    }))
    if (revision !== metadataRevision) return
    selectedVersions.value = selected
    if (props.autoConfigure && !props.disabled && ids.length) {
      const defaults = derivedResultDefaults(props.modelValue.expression, selected)
      const output = { ...props.modelValue.output }
      for (const key of ['valueType', 'semanticKind', 'grain', 'dimension', 'unit']) {
        if (manualOutputKeys.has(key)) continue
        if (Object.hasOwn(defaults.output, key)) output[key] = defaults.output[key]
        else delete output[key]
      }
      const value = { ...props.modelValue, primaryDomain: props.modelValue.primaryDomain || {}, output,
        ...(defaults.calculationMode ? { calculationMode: defaults.calculationMode } : {}) }
      if (JSON.stringify(value) !== JSON.stringify(props.modelValue)) emit('update:modelValue', value)
    }
  } catch (e) {
    if (revision === metadataRevision) { selectedVersions.value = []; metadataError.value = e?.message || '引用因子信息读取失败，请重试' }
  } finally { if (revision === metadataRevision) loadingMetadata.value = false }
}
function retryMetadata() { metadataCache.clear(); return loadSelectedMetadata() }
watch(() => JSON.stringify(props.modelValue.expression), loadSelectedMetadata, { immediate: true })
async function loadVersions() {
  if (loading.value) return
  loading.value = true; error.value = ''
  try {
    versions.value = await fetchPublishedFactorVersions()
  } catch (e) { error.value = e?.message || '已发布因子加载失败，请重试' }
  finally { loading.value = false }
}
defineExpose({ validate: () => { if (error.value || loading.value) throw new Error('请先完成已发布因子的加载'); if (loadingMetadata.value || metadataError.value) throw new Error(metadataError.value || '请等待引用因子信息读取完成'); if (metadataConflict.value) throw new Error(metadataConflict.value); return validateDerivedFactor(props.modelValue, selectedVersions.value) } })
onBeforeUnmount(() => { metadataRevision++ })
onMounted(loadVersions)
</script>
<style scoped>
.creation-hint { color: var(--idmp-text-secondary); line-height: 1.7; }
.result-summary { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-top: 14px; }
.result-summary small { flex-basis: 100%; color: var(--idmp-text-helper); }
.advanced-settings { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--idmp-border-soft); }
.advanced-settings summary { cursor: pointer; color: var(--idmp-text-secondary); }
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
