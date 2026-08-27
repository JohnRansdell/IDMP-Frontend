<template>
  <div class="idmp-page value-set-editor-page">
    <PageHeader :title="`值集版本 ${version?.versionNo ? `V${version.versionNo}` : '编辑'}`">
      <template #meta><span class="data-source-badge is-live">真实接口</span><span class="header-meta">{{ valueSet?.code || '—' }} · {{ version?.publicationStatus ? getStatusLabel(version.publicationStatus) : '加载中' }}</span></template>
      <template #actions><el-button @click="back">返回详情</el-button><el-button :loading="loading" @click="load">刷新</el-button></template>
    </PageHeader>

    <StatePanel v-if="error" type="error" title="版本加载失败" :description="error" />
    <template v-else>
      <section class="surface-card editor-summary"><div><span>资源版本</span><strong>{{ version?.resourceVersion ?? '—' }}</strong></div><div><span>版本状态</span><StatusBadge :status="version?.publicationStatus" /></div><div><span>匹配模式</span><strong>{{ matchModeLabel(version?.matchMode) || '—' }}</strong></div><div><span>值类型</span><strong>{{ dataTypeLabel(version?.valueType) || '—' }}</strong></div></section>
      <section v-if="isContinuous" class="surface-card table-card continuous-spec-card">
        <div class="section-title"><div><h2>连续值规范</h2><p class="section-title__description">连续值集通过单位、精度和合法边界约束筛选范围，不维护枚举值项。</p></div></div>
        <el-form label-position="top" class="continuous-form"><el-form-item label="单位"><el-input v-model.trim="continuousForm.unit" :disabled="!canEdit" /></el-form-item><div class="continuous-grid"><el-form-item label="总精度"><el-input-number v-model="continuousForm.precision" :min="1" :max="38" :precision="0" :disabled="!canEdit" /></el-form-item><el-form-item v-if="isNumericContinuous" label="小数位"><el-input-number v-model="continuousForm.scale" :min="0" :max="continuousForm.precision || 38" :precision="0" :disabled="!canEdit" /></el-form-item></div><div v-if="isNumericContinuous" class="continuous-grid"><el-form-item label="最小值"><el-input v-model.trim="continuousForm.minimumValue" :disabled="!canEdit" placeholder="不限制可留空" /></el-form-item><el-form-item label="最大值"><el-input v-model.trim="continuousForm.maximumValue" :disabled="!canEdit" placeholder="不限制可留空" /></el-form-item></div><div v-if="isDateContinuous" class="continuous-grid"><el-form-item label="时间粒度"><el-input v-model.trim="continuousForm.timeGranularity" :disabled="!canEdit" placeholder="可选，如 DAY" /></el-form-item><el-form-item label="时区"><el-input v-model.trim="continuousForm.timezone" :disabled="!canEdit" placeholder="可选，如 Asia/Shanghai" /></el-form-item></div><el-button v-if="canEdit" type="primary" :loading="savingSpec" @click="saveContinuousSpec">保存连续值规范</el-button></el-form>
      </section>
      <section v-else class="surface-card table-card">
        <div class="section-title section-title--toolbar"><div><h2>值项维护</h2><p class="section-title__description">保存采用全量替换语义；删除未提交的行会从版本中移除。</p></div><div><el-button @click="addItem">新增值项</el-button><el-button type="primary" :loading="saving" :disabled="!canEdit" @click="saveItems">保存值项</el-button></div></div>
        <el-alert v-if="!canEdit" title="当前版本不可编辑，仅支持查看、校验或发布状态结果。" type="info" :closable="false" />
        <el-table :data="items" table-layout="fixed" class="items-table">
          <el-table-column label="编码" min-width="170"><template #default="{ row }"><el-input v-model.trim="row.code" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="标准值" min-width="170"><template #default="{ row }"><el-input v-model="row.value" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="标签" min-width="170"><template #default="{ row }"><el-input v-model.trim="row.label" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="排序" width="110"><template #default="{ row }"><el-input-number v-model="row.sortOrder" :min="0" :disabled="!canEdit" /></template></el-table-column>
          <el-table-column label="操作" width="90"><template #default="{ $index }"><el-button link type="danger" :disabled="!canEdit" @click="removeItem($index)">删除</el-button></template></el-table-column>
        </el-table>
      </section>
      <section class="surface-card action-card">
        <div><h2>版本状态操作</h2><p>校验成功后才允许发布；当前生效版本不能直接归档。</p></div>
        <div class="action-row"><el-button :loading="validating" :disabled="!version" @click="validate">校验版本</el-button><el-button type="primary" :loading="publishing" :disabled="!canPublish" @click="publish">发布版本</el-button><el-button type="warning" :loading="archiving" :disabled="!canArchive" @click="archive">归档版本</el-button></div>
        <el-alert v-if="validation" :title="validation.valid ? `校验通过，覆盖/结构检查完成` : '校验未通过'" :type="validation.valid ? 'success' : 'error'" :closable="false"><template #default><div>资源版本：{{ validation.resourceVersion ?? '—' }}<ul v-if="validation.diagnostics?.length"><li v-for="item in validation.diagnostics" :key="`${item.code}-${item.path}`">{{ item.path || '值项' }}：{{ item.message }}</li></ul></div></template></el-alert>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { archiveValueSetVersion, fetchValueSetItems, fetchValueSetVersion, publishValueSetVersion, replaceValueSetItems, updateValueSetVersion, validateValueSetVersion } from '@/idmp/api/modules/valueSets'
import { getStatusLabel } from '@/idmp/design/status'
import { dataTypeLabel, matchModeLabel } from '@/idmp/features/meta'

const route = useRoute(); const router = useRouter(); const versionId = String(route.params.versionId)
const valueSet = ref(null); const version = ref(null); const items = ref([]); const originalItems = ref([]); const validation = ref(null); const loading = ref(false); const saving = ref(false); const savingSpec = ref(false); const validating = ref(false); const publishing = ref(false); const archiving = ref(false); const error = ref('')
const continuousForm = reactive({ unit: '', precision: 18, scale: 2, minimumValue: '', maximumValue: '', minimumInclusive: true, maximumInclusive: true, timeGranularity: '', timezone: '' })
const canEdit = computed(() => ['DRAFT', 'VALIDATED'].includes(String(version.value?.publicationStatus || '').toUpperCase()))
const canPublish = computed(() => canEdit.value && validation.value?.valid === true)
const canArchive = computed(() => Boolean(version.value) && String(version.value.publicationStatus).toUpperCase() !== 'PUBLISHED' && String(version.value.publicationStatus).toUpperCase() !== 'ARCHIVED')
const isContinuous = computed(() => String(version.value?.matchMode || '').toUpperCase() === 'CONTINUOUS')
const continuousSpec = computed(() => version.value?.continuousSpec || {})
const precisionText = computed(() => { const spec = continuousSpec.value; if (spec.precision == null) return '—'; return spec.scale == null ? String(spec.precision) : `${spec.precision}, ${spec.scale}` })
const isNumericContinuous = computed(() => ['INTEGER', 'DECIMAL'].includes(String(version.value?.valueType || '').toUpperCase()))
const isDateContinuous = computed(() => ['DATE', 'DATETIME'].includes(String(version.value?.valueType || '').toUpperCase()))
function copyItems(rows) { return (Array.isArray(rows) ? rows : []).map((item, index) => ({ ...item, sortOrder: item.sortOrder ?? index + 1 })) }
async function load() { loading.value = true; error.value = ''; try { if (!/^\d+$/.test(versionId)) throw new Error(`无效的值集版本 ID：${versionId}`); const detail = await fetchValueSetVersion(versionId); valueSet.value = detail?.valueSet || null; version.value = detail?.version || detail; if (isContinuous.value) Object.assign(continuousForm, { minimumInclusive: true, maximumInclusive: true, ...continuousSpec.value, minimumValue: continuousSpec.value.minimumValue ?? '', maximumValue: continuousSpec.value.maximumValue ?? '', timeGranularity: continuousSpec.value.timeGranularity ?? '', timezone: continuousSpec.value.timezone ?? '' }); const rows = isContinuous.value ? [] : await fetchValueSetItems(versionId); items.value = copyItems(Array.isArray(rows) ? rows : (rows?.items || detail?.version?.items || [])); originalItems.value = copyItems(items.value); validation.value = null } catch (err) { error.value = err?.message || '值集版本加载失败。' } finally { loading.value = false } }
function addItem() { items.value.push({ code: '', value: '', label: '', sortOrder: items.value.length + 1, valueStart: null, valueEnd: null, parentItemId: null, effectiveStartDate: null, effectiveEndDate: null }) }
function removeItem(index) { items.value.splice(index, 1) }
function changed() { return JSON.stringify(items.value.map(({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate }) => ({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate }))) !== JSON.stringify(originalItems.value.map(({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate }) => ({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate }))) }
function validateItems() { const codes = new Set(); for (const item of items.value) { if (!item.code || !item.label) return '编码和标签不能为空'; if (codes.has(item.code)) return `编码重复：${item.code}`; codes.add(item.code) } return '' }
async function saveItems() { const message = validateItems(); if (message) { ElMessage.warning(message); return } if (!changed()) { ElMessage.info('值项没有变化'); return } try { await ElMessageBox.confirm(`本次将全量替换 ${items.value.length} 个值项，未保留的旧值项会被删除。`, '确认保存值项', { type: 'warning', confirmButtonText: '确认替换', cancelButtonText: '取消' }) } catch { return } saving.value = true; try { const data = await replaceValueSetItems(versionId, { resourceVersion: version.value.resourceVersion, items: items.value.map(({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate }) => ({ id, code, value, label, sortOrder, valueStart, valueEnd, parentItemId, effectiveStartDate, effectiveEndDate })) }); version.value = data?.version || version.value; items.value = copyItems(data?.version?.items || items.value); originalItems.value = copyItems(items.value); validation.value = null; ElMessage.success('值项保存成功') } catch (err) { ElMessage.error(err?.message || '值项保存失败；如提示版本冲突，请刷新后重试。') } finally { saving.value = false } }
async function saveContinuousSpec() { const spec = { ...continuousForm }; if (!spec.unit) return ElMessage.warning('请填写单位'); if (isNumericContinuous.value) { if (!Number.isInteger(spec.precision) || spec.precision < 1 || spec.precision > 38) return ElMessage.warning('总精度必须为 1 至 38 的整数'); if (String(version.value?.valueType).toUpperCase() === 'INTEGER') spec.scale = 0; if (!Number.isInteger(spec.scale) || spec.scale < 0 || spec.scale > spec.precision) return ElMessage.warning('小数位必须在 0 至总精度之间') } ;['minimumValue', 'maximumValue', 'timeGranularity', 'timezone'].forEach(key => { if (spec[key] === '') spec[key] = null }); savingSpec.value = true; try { const data = await updateValueSetVersion(versionId, { resourceVersion: version.value.resourceVersion, name: valueSet.value?.name, description: valueSet.value?.description || '', matchMode: version.value.matchMode, valueType: version.value.valueType, sourceStandardName: version.value.sourceStandardName ?? valueSet.value?.sourceStandardName ?? null, continuousSpec: spec }); version.value = data?.version || version.value; valueSet.value = data?.valueSet || valueSet.value; if (!version.value.continuousSpec) version.value = { ...version.value, continuousSpec: spec }; validation.value = null; ElMessage.success('连续值规范已保存，请重新校验版本') } catch (err) { ElMessage.error(err?.message || '连续值规范保存失败') } finally { savingSpec.value = false } }
async function validate() { validating.value = true; try { validation.value = await validateValueSetVersion(versionId); if (validation.value.resourceVersion != null && version.value) version.value.resourceVersion = validation.value.resourceVersion; ElMessage[validation.value.valid ? 'success' : 'warning'](validation.value.valid ? '值集版本校验通过' : '值集版本校验未通过') } catch (err) { ElMessage.error(err?.message || '值集版本校验失败') } finally { validating.value = false } }
async function publish() { try { await ElMessageBox.confirm('发布后该版本将成为当前生效版本，确认继续？', '确认发布', { type: 'warning' }) } catch { return } publishing.value = true; try { const data = await publishValueSetVersion(valueSet.value.id, versionId, version.value.resourceVersion); valueSet.value = data?.valueSet || valueSet.value; version.value = data?.version || version.value; ElMessage.success('值集版本发布成功') } catch (err) { ElMessage.error(err?.message || '发布失败；请检查校验结果和资源版本。') } finally { publishing.value = false } }
async function archive() { try { await ElMessageBox.confirm('归档后该版本将退出正常版本列表，确认继续？', '确认归档', { type: 'warning' }) } catch { return } archiving.value = true; try { const data = await archiveValueSetVersion(versionId, version.value.resourceVersion); version.value = data?.version || version.value; ElMessage.success('值集版本归档成功') } catch (err) { ElMessage.error(err?.message || '归档失败；当前生效版本不能直接归档。') } finally { archiving.value = false } }
function back() { router.push({ name: 'ValueSetDetail', params: { valueSetId: valueSet.value?.id || route.query.valueSetId } }) }
onMounted(load)
</script>

<style scoped>
.editor-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding: 18px; margin-bottom: 16px; }.editor-summary div { display: flex; flex-direction: column; gap: 6px; }.editor-summary span { color: var(--idmp-text-secondary); font-size: 12px; }.editor-summary strong { font-size: 16px; }.table-card,.action-card { margin-bottom: 16px; }.section-title--toolbar,.action-card { display: flex; justify-content: space-between; align-items: center; gap: 18px; }.items-table { margin-top: 16px; }.action-card { padding: 18px; flex-wrap: wrap; }.action-row { display: flex; gap: 10px; }.continuous-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 16px; }.continuous-form { max-width:680px; }
</style>
