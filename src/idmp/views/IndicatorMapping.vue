<template>
  <div class="idmp-page indicator-mapping">
    <PageHeader title="指标映射管理" status-label="人工治理" status-tone="info">
      <template #meta><span>维护跨政策指标之间的人工映射关系</span></template>
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="refreshCurrent">刷新</el-button>
        <el-button v-if="activePane === 'mappings'" type="primary" :icon="Plus" @click="openCreateMapping">创建映射</el-button>
        <el-button v-else type="primary" :icon="Plus" @click="groupDialogOpen = true">创建语义组</el-button>
      </template>
    </PageHeader>

    <el-alert class="mapping-notice" type="info" :closable="false" show-icon title="映射仅关联已发布指标版本，不改变指标公式、因子或计算结果。" />

    <el-tabs v-model="activePane" @tab-change="refreshCurrent">
      <el-tab-pane label="映射关系" name="mappings">
        <section class="surface-card filter-card">
          <el-form :model="filters" class="mapping-filter" @submit.prevent="loadMappings">
            <el-form-item label="语义组"><el-select v-model="filters.groupId" clearable filterable placeholder="全部语义组"><el-option v-for="group in groups" :key="group.id" :label="group.name || group.code" :value="String(group.id)" /></el-select></el-form-item>
            <el-form-item label="政策文件 ID"><el-input v-model.trim="filters.policyFileId" placeholder="任一侧政策文件" /></el-form-item>
            <el-form-item label="指标版本"><el-select v-model="filters.indicatorVersionId" clearable filterable allow-create default-first-option placeholder="源或目标已发布版本"><el-option v-for="item in publishedIndicators" :key="item.id" :label="indicatorOptionLabel(item)" :value="String(item.id)" /></el-select></el-form-item>
            <el-form-item label="映射类型"><el-select v-model="filters.mappingType" clearable><el-option v-for="item in MAPPING_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="审核状态"><el-select v-model="filters.reviewStatus" clearable><el-option label="草稿" value="DRAFT" /><el-option label="待审核" value="PENDING_REVIEW" /><el-option label="已驳回" value="REJECTED" /><el-option label="已通过" value="APPROVED" /><el-option label="已失效" value="INVALIDATED" /></el-select></el-form-item>
            <el-form-item class="mapping-filter__actions"><el-button type="primary" native-type="submit" :icon="Search">查询</el-button><el-button @click="resetFilters">重置</el-button></el-form-item>
          </el-form>
          <div class="mapping-type-shortcuts"><span>关系分类</span><el-button size="small" :type="!filters.mappingType ? 'primary' : 'default'" plain @click="setMappingTypeFilter('')">全部</el-button><el-button v-for="item in MAPPING_TYPES" :key="item.value" size="small" :type="filters.mappingType === item.value ? 'primary' : 'default'" plain @click="setMappingTypeFilter(item.value)">{{ item.label }}</el-button></div>
        </section>

        <section class="surface-card table-card">
          <div class="table-heading"><div><h2>映射关系列表</h2><p>源指标、映射关系和目标指标按业务关系分列展示。</p></div><div v-if="currentFilterGroup" class="group-relation-context"><span>当前语义组基准指标</span><strong>{{ indicatorRef(currentFilterGroup.canonicalIndicator) }}</strong></div></div>
          <StatePanel v-if="!loading && !mappings.length" type="empty" title="暂无映射关系" description="可调整筛选条件，或创建一条人工治理映射。" />
          <el-table v-else v-loading="loading" :data="mappings" class="mapping-table" table-layout="fixed">
            <el-table-column label="映射名称" min-width="220"><template #default="{ row }"><div class="mapping-name"><strong>{{ row.name || '未命名映射' }}</strong><small class="mono-data">{{ row.code || row.id }}</small><span>{{ row.group?.name || row.group?.code || '未归类语义组' }}</span></div></template></el-table-column>
            <el-table-column label="源指标" min-width="270"><template #default="{ row }"><div class="mapping-indicator-cell"><small>源侧政策：{{ policyLabel(row.sourceIndicator) }}</small><strong>{{ indicatorRef(row.sourceIndicator) }}</strong><span class="mono-data">版本 {{ row.sourceIndicator?.indicatorVersionId || '-' }}</span></div></template></el-table-column>
            <el-table-column label="映射关系" width="190" align="center"><template #default="{ row }"><div class="mapping-type-cell"><span class="mapping-type-cell__arrow" aria-hidden="true">→</span><StatusBadge :label="mappingTypeLabel(row.mappingType)" /><small>{{ comparabilityLabel(row.comparability) }}</small></div></template></el-table-column>
            <el-table-column label="目标指标" min-width="270"><template #default="{ row }"><div class="mapping-indicator-cell"><small>目标侧政策：{{ policyLabel(row.targetIndicator) }}</small><strong>{{ indicatorRef(row.targetIndicator) }}</strong><span class="mono-data">版本 {{ row.targetIndicator?.indicatorVersionId || '-' }}</span></div></template></el-table-column>
            <el-table-column label="治理状态" width="140"><template #default="{ row }"><div class="mapping-status-cell"><StatusBadge :status="row.reviewStatus" :label="mappingStatusLabel(row.reviewStatus)" /><small>{{ row.publicationStatus === 'PUBLISHED' ? '已发布' : '未发布' }}</small></div></template></el-table-column>
            <el-table-column label="操作" width="88" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.id)">查看</el-button></template></el-table-column>
          </el-table>
          <div class="table-footer"><span>共 {{ mappingTotal }} 条</span><el-pagination v-model:current-page="mappingPage" v-model:page-size="mappingSize" layout="prev, pager, next, sizes" :page-sizes="[10, 20, 50]" :total="mappingTotal" @current-change="loadMappings" @size-change="loadMappings" /></div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="语义组" name="groups">
        <section class="surface-card table-card">
          <div class="table-heading"><div><h2>语义组</h2><p>基准指标版本确定后，创建映射时自动成为源指标。</p></div></div>
          <StatePanel v-if="!groupLoading && !groups.length" type="empty" title="暂无语义组" description="请先选择一个已发布指标版本创建语义组。" />
          <el-table v-else v-loading="groupLoading" :data="groups" table-layout="fixed">
            <el-table-column prop="code" label="编码" min-width="220"><template #default="{ row }"><span class="mono-data">{{ row.code }}</span></template></el-table-column>
            <el-table-column prop="name" label="名称" min-width="220" />
            <el-table-column label="基准指标版本" min-width="250"><template #default="{ row }">{{ indicatorRef(row.canonicalIndicator) }}</template></el-table-column>
            <el-table-column prop="memberCount" label="有效成员" width="110" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><StatusBadge :status="row.status" /></template></el-table-column>
            <el-table-column label="关系" width="100" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openGroupRelations(row)">查看关系</el-button></template></el-table-column>
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="groupDialogOpen" title="创建语义组" width="620px" destroy-on-close>
      <el-form label-position="top" :model="groupForm">
        <el-form-item label="语义组编码" required><el-input v-model.trim="groupForm.code" placeholder="字母开头，可使用字母、数字和下划线" /></el-form-item>
        <el-form-item label="语义组名称" required><el-input v-model.trim="groupForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="groupForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="基准已发布指标版本" required><el-select v-model="groupForm.canonicalIndicatorVersionId" filterable allow-create default-first-option placeholder="选择或输入指标版本 ID" style="width:100%"><el-option v-for="item in publishedIndicators" :key="item.id" :label="indicatorOptionLabel(item)" :value="String(item.id)" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="groupDialogOpen = false">取消</el-button><el-button type="primary" :loading="mutating" @click="saveGroup">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="mappingDialogOpen" :title="editingMappingId ? '编辑映射草稿' : ['选择指标版本', '核对指标口径', '确认映射关系'][creationStep]" width="760px" destroy-on-close @closed="closeMappingDialog">
      <el-steps v-if="!editingMappingId" :active="creationStep" finish-status="success" simple class="mapping-steps"><el-step title="选择版本" /><el-step title="核对口径" /><el-step title="确认映射" /></el-steps>
      <el-form label-position="top" :model="mappingForm">
        <template v-if="!editingMappingId && creationStep === 0"><el-form-item label="所属语义组" required><el-select v-model="mappingForm.groupId" filterable placeholder="选择语义组" style="width:100%"><el-option v-for="group in groups" :key="group.id" :label="`${group.name || group.code} · ${group.code}`" :value="String(group.id)" /></el-select></el-form-item><el-form-item label="源指标版本"><el-input :model-value="indicatorRef(selectedGroup?.canonicalIndicator) || '请先选择语义组'" disabled /></el-form-item><el-form-item label="目标已发布指标版本" required><el-select v-model="mappingForm.targetIndicatorVersionId" filterable allow-create default-first-option placeholder="选择或输入指标版本 ID" style="width:100%"><el-option v-for="item in publishedIndicators" :key="item.id" :label="indicatorOptionLabel(item)" :value="String(item.id)" /></el-select></el-form-item></template>
        <section v-if="!editingMappingId && creationStep === 1" class="comparison-preview"><div class="section-title compact"><div><h3>口径对比结果</h3><p>{{ comparison?.difference?.hasDifferences ? '发现差异，请在下一步明确映射关系与人工依据。' : '当前返回口径未发现差异，可继续确认映射关系。' }}</p></div></div><el-table :data="differenceRows" size="small" max-height="330"><el-table-column prop="label" label="对比项" min-width="150" /><el-table-column label="结果" width="100"><template #default="{ row }"><StatusBadge :status="row.different ? 'WARNING' : 'PASSED'" :label="row.different ? '存在差异' : '一致'" /></template></el-table-column><el-table-column prop="source" label="源侧" min-width="180" show-overflow-tooltip /><el-table-column prop="target" label="目标侧" min-width="180" show-overflow-tooltip /></el-table></section>
        <template v-if="editingMappingId || creationStep === 2"><div class="form-grid"><el-form-item label="映射编码" required><el-input v-model.trim="mappingForm.code" :disabled="Boolean(editingMappingId)" /></el-form-item><el-form-item label="映射名称" required><el-input v-model.trim="mappingForm.name" /></el-form-item><el-form-item label="可比性" required><el-select v-model="mappingForm.comparability"><el-option v-for="item in COMPARABILITY_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></div><section class="mapping-type-picker" aria-label="选择映射类型"><div class="mapping-type-picker__head"><strong>映射类型</strong><small>包含关系始终以源指标为参照。</small></div><button v-for="item in MAPPING_TYPES" :key="item.value" type="button" class="mapping-type-option" :class="{ 'is-selected': mappingForm.mappingType === item.value }" @click="mappingForm.mappingType = item.value"><StatusBadge :label="item.label" /><small>{{ mappingTypeDescription(item.value) }}</small></button></section><el-form-item label="人工核对依据"><el-input v-model="mappingForm.reviewBasis" type="textarea" :rows="2" /></el-form-item><el-form-item label="差异说明"><el-input v-model="mappingForm.differenceNote" type="textarea" :rows="2" /></el-form-item></template>
      </el-form>
      <template #footer><el-button v-if="!editingMappingId && creationStep === 1" @click="creationStep = 0">上一步</el-button><el-button v-if="!editingMappingId && creationStep === 0" type="primary" :disabled="!canCompare" :loading="comparisonLoading" @click="goToComparisonStep">下一步：核对口径</el-button><el-button v-if="!editingMappingId && creationStep === 1" type="primary" @click="creationStep = 2">下一步：确认映射</el-button><el-button v-if="!editingMappingId && creationStep === 2" @click="creationStep = 1">上一步</el-button><el-button @click="mappingDialogOpen = false">取消</el-button><el-button v-if="editingMappingId || creationStep === 2" type="primary" :loading="mutating" @click="saveMapping">{{ editingMappingId ? '保存草稿' : '创建草稿' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { compareIndicatorMappings, createMapping, createMappingGroup, fetchMapping, fetchMappingGroups, fetchMappings, updateMapping } from '@/idmp/api/modules/mappings'
import { COMPARABILITY_TYPES, MAPPING_TYPES, comparabilityLabel, formatIndicatorRef, mappingStatusLabel, mappingTypeDescription, mappingTypeLabel, normalizePage, toOpaqueId } from '@/idmp/api/adapters/mapping'

const route = useRoute()
const router = useRouter()
const activePane = ref('mappings')
const loading = ref(false); const groupLoading = ref(false); const mutating = ref(false)
const mappings = ref([]); const groups = ref([]); const publishedIndicators = ref([])
const mappingTotal = ref(0); const mappingPage = ref(1); const mappingSize = ref(20)
const groupDialogOpen = ref(false); const mappingDialogOpen = ref(false); const editingMappingId = ref(''); const editingDetail = ref(null)
const creationStep = ref(0); const comparison = ref(null); const comparisonLoading = ref(false); const mappingEvidenceExtras = ref({})
const filters = reactive({ groupId: '', policyFileId: '', indicatorVersionId: '', mappingType: '', reviewStatus: '' })
const groupForm = reactive(emptyGroupForm()); const mappingForm = reactive(emptyMappingForm())
const selectedGroup = computed(() => groups.value.find(item => String(item.id) === String(mappingForm.groupId)) || null)
const currentFilterGroup = computed(() => groups.value.find(item => String(item.id) === String(filters.groupId)) || null)
const canCompare = computed(() => Boolean(selectedGroup.value?.canonicalIndicator?.indicatorVersionId && mappingForm.targetIndicatorVersionId))
const differenceRows = computed(() => buildDifferenceRows(comparison.value?.difference))
function emptyGroupForm() { return { code: '', name: '', description: '', canonicalIndicatorVersionId: '' } }
function emptyMappingForm() { return { code: '', name: '', groupId: '', targetIndicatorVersionId: '', mappingType: 'SAME_CONCEPT', comparability: 'CONDITIONAL', reviewBasis: '', differenceNote: '' } }
function indicatorRef(value) { return formatIndicatorRef(value || {}) }
function indicatorOptionLabel(item) { return `${item.name || item.indicatorName || item.code || '未命名指标'} · ${item.id}` }
function policyLabel(indicator) { const references = Array.isArray(indicator?.policyReferences) ? indicator.policyReferences : []; const policy = references.find(item => item?.policyFileName || item?.policyFileCode || item?.policyFileVersionId); return policy?.policyFileName || policy?.policyFileCode || indicator?.policyFileName || indicator?.policyFileCode || '未标注政策来源' }
function displayObject(value) { if (value === undefined || value === null || value === '') return '-'; return typeof value === 'object' ? '已返回结构化内容' : String(value) }
function differenceLabel(key) { return ({ indicatorName: '指标名称', definition: '定义', meaning: '业务含义', formulaAst: '计算公式', factors: '因子与过滤', policyReferences: '政策依据', defaultExclusion: '默认排除规则', unit: '单位', statisticalPeriod: '统计周期', granularity: '统计粒度', organizationScope: '组织范围' })[key] || key }
function buildDifferenceRows(difference) { return Object.entries(difference || {}).filter(([key]) => key !== 'hasDifferences').map(([key, item]) => ({ label: differenceLabel(key), different: Boolean(item?.different), source: displayObject(item?.source), target: displayObject(item?.target) })) }
function normalizeList(payload) { return Array.isArray(payload) ? payload : payload?.records || payload?.items || payload?.list || [] }
async function bootstrap() { await Promise.all([loadGroups(), loadPublishedIndicators()]); await loadMappings() }
async function loadGroups() { groupLoading.value = true; try { groups.value = normalizePage(await fetchMappingGroups({ page: 1, size: 200 })).items } catch (error) { ElMessage.error(error?.message || '语义组加载失败') } finally { groupLoading.value = false } }
async function loadPublishedIndicators() { try { publishedIndicators.value = normalizeList(await fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 200 })).map(item => ({ ...item, id: toOpaqueId(item.id || item.versionId || item.indicatorVersionId) })).filter(item => item.id) } catch (error) { ElMessage.warning(error?.message || '已发布指标版本列表加载失败；仍可手工输入版本 ID。') } }
async function loadMappings() { loading.value = true; try { const page = normalizePage(await fetchMappings({ ...filters, page: mappingPage.value, size: mappingSize.value })); mappings.value = page.items; mappingTotal.value = page.total } catch (error) { mappings.value = []; mappingTotal.value = 0; ElMessage.error(error?.message || '映射列表加载失败') } finally { loading.value = false } }
function resetFilters() { Object.assign(filters, { groupId: '', policyFileId: '', indicatorVersionId: '', mappingType: '', reviewStatus: '' }); mappingPage.value = 1; loadMappings() }
function setMappingTypeFilter(mappingType) { filters.mappingType = mappingType; mappingPage.value = 1; loadMappings() }
function openGroupRelations(group) { activePane.value = 'mappings'; filters.groupId = String(group.id); mappingPage.value = 1; loadMappings() }
function refreshCurrent() { return activePane.value === 'groups' ? loadGroups() : loadMappings() }
function openDetail(mappingId) { router.push({ name: 'IndicatorMappingDetail', params: { id: String(mappingId) } }) }
function openCreateMapping() { editingMappingId.value = ''; editingDetail.value = null; creationStep.value = 0; comparison.value = null; mappingEvidenceExtras.value = {}; Object.assign(mappingForm, emptyMappingForm()); mappingDialogOpen.value = true }
function closeMappingDialog() { if (route.query.edit) { const query = { ...route.query }; delete query.edit; router.replace({ query }) } }
function openEditMapping(detail) { const mapping = detail?.mapping; if (!mapping) return; creationStep.value = 2; editingDetail.value = detail; editingMappingId.value = toOpaqueId(mapping.id); const evidence = detail.version?.evidence || {}; mappingEvidenceExtras.value = Object.fromEntries(Object.entries(evidence).filter(([key]) => !['reviewBasis', 'differenceNote'].includes(key))); comparison.value = detail.version?.difference ? { difference: detail.version.difference } : null; Object.assign(mappingForm, { code: mapping.code || '', name: mapping.name || '', groupId: toOpaqueId(mapping.group?.id), targetIndicatorVersionId: toOpaqueId(mapping.targetIndicator?.indicatorVersionId), mappingType: mapping.mappingType || 'SAME_CONCEPT', comparability: mapping.comparability || 'CONDITIONAL', reviewBasis: evidence.reviewBasis || '', differenceNote: evidence.differenceNote || '' }); mappingDialogOpen.value = true }
async function openEditFromRoute(id) { if (!id || (mappingDialogOpen.value && editingMappingId.value === String(id))) return; try { openEditMapping(await fetchMapping(id)) } catch (error) { ElMessage.error(error?.message || '映射草稿加载失败') } }
async function saveGroup() { if (!groupForm.code || !groupForm.name || !groupForm.canonicalIndicatorVersionId) return ElMessage.warning('请填写编码、名称和基准已发布指标版本'); mutating.value = true; try { await createMappingGroup({ ...groupForm, canonicalIndicatorVersionId: String(groupForm.canonicalIndicatorVersionId) }); ElMessage.success('语义组已创建'); groupDialogOpen.value = false; Object.assign(groupForm, emptyGroupForm()); await loadGroups() } catch (error) { ElMessage.error(error?.message || '创建语义组失败') } finally { mutating.value = false } }
async function loadComparison() { if (!canCompare.value) return false; comparisonLoading.value = true; try { comparison.value = await compareIndicatorMappings(selectedGroup.value.canonicalIndicator.indicatorVersionId, mappingForm.targetIndicatorVersionId); return true } catch (error) { ElMessage.error(error?.message || '口径对比失败'); return false } finally { comparisonLoading.value = false } }
async function goToComparisonStep() { if (!canCompare.value) return ElMessage.warning('请先选择语义组和目标已发布指标版本'); if (await loadComparison()) creationStep.value = 1 }
function evidencePayload() { const evidence = { ...mappingEvidenceExtras.value }; if (mappingForm.reviewBasis.trim()) evidence.reviewBasis = mappingForm.reviewBasis.trim(); if (mappingForm.differenceNote.trim()) evidence.differenceNote = mappingForm.differenceNote.trim(); return evidence }
async function saveMapping() { if (!mappingForm.name || !mappingForm.mappingType || !mappingForm.comparability) return ElMessage.warning('请完善映射名称、类型和可比性'); if (!editingMappingId.value && (!mappingForm.code || !mappingForm.groupId || !mappingForm.targetIndicatorVersionId)) return ElMessage.warning('请完善映射编码、语义组和目标指标版本'); mutating.value = true; try { const result = editingMappingId.value ? await updateMapping(editingMappingId.value, { resourceVersion: editingDetail.value?.mapping?.resourceVersion, name: mappingForm.name, mappingType: mappingForm.mappingType, comparability: mappingForm.comparability, evidence: evidencePayload() }) : await createMapping({ code: mappingForm.code, name: mappingForm.name, groupId: String(mappingForm.groupId), targetIndicatorVersionId: String(mappingForm.targetIndicatorVersionId), mappingType: mappingForm.mappingType, comparability: mappingForm.comparability, evidence: evidencePayload() }); mappingDialogOpen.value = false; ElMessage.success(editingMappingId.value ? '映射草稿已保存' : '映射草稿已创建'); await loadMappings(); openDetail(result.mapping?.id || result.id || editingMappingId.value) } catch (error) { ElMessage.error(error?.message || '保存映射失败') } finally { mutating.value = false } }
watch(() => route.query.edit, id => { if (id) void openEditFromRoute(String(id)) }, { immediate: true })
watch([() => mappingForm.groupId, () => mappingForm.targetIndicatorVersionId], () => { if (!editingMappingId.value) comparison.value = null })
onMounted(bootstrap)
</script>

<style scoped lang="scss">
.indicator-mapping { min-width: 0; }.mapping-notice { margin-bottom: 16px; }.mapping-filter { display: flex; flex-wrap: wrap; gap: 10px 14px; }.mapping-filter :deep(.el-form-item) { margin: 0; }.mapping-filter :deep(.el-input), .mapping-filter :deep(.el-select) { width: 190px; }.mapping-filter__actions { margin-left: auto !important; }.mapping-type-shortcuts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }.mapping-type-shortcuts > span, .table-heading p { color: var(--idmp-text-helper); font-size: 12px; }.table-card { padding: 0; overflow: hidden; }.table-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px; border-bottom: 1px solid var(--idmp-border-subtle); }.table-heading h2, .section-title h3 { margin: 0; font-size: 16px; }.table-heading p, .section-title p { margin: 4px 0 0; }.group-relation-context { display: grid; gap: 3px; min-width: 220px; padding: 8px 10px; border-left: 3px solid var(--idmp-interactive); border-radius: 0 var(--idmp-radius-sm) var(--idmp-radius-sm) 0; background: var(--idmp-layer-02); }.group-relation-context span { color: var(--idmp-text-helper); font-size: 12px; }.mapping-table { min-width: 1200px; }.mapping-name, .mapping-indicator-cell, .mapping-status-cell { display: grid; gap: 5px; min-width: 0; }.mapping-name strong, .mapping-indicator-cell strong { overflow: hidden; color: var(--idmp-text-primary); text-overflow: ellipsis; white-space: nowrap; }.mapping-name small, .mapping-name span, .mapping-indicator-cell small, .mapping-indicator-cell span, .mapping-status-cell small { overflow: hidden; color: var(--idmp-text-helper); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.mapping-type-cell { display: grid; justify-items: center; gap: 5px; }.mapping-type-cell__arrow { color: var(--idmp-interactive); font-size: 22px; line-height: 1; }.mapping-type-cell small { color: var(--idmp-text-helper); font-size: 12px; }.table-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; color: var(--idmp-text-helper); }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }.comparison-preview { padding: 14px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); background: var(--idmp-layer-02); }.mapping-steps { margin: 0 0 20px; }.mapping-type-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 18px; }.mapping-type-picker__head { grid-column: 1 / -1; display: grid; gap: 3px; }.mapping-type-picker__head small, .mapping-type-option small { color: var(--idmp-text-helper); font-size: 12px; }.mapping-type-option { display: grid; gap: 6px; min-height: 82px; padding: 10px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); background: var(--idmp-layer-02); cursor: pointer; text-align: left; }.mapping-type-option:hover, .mapping-type-option.is-selected { border-color: var(--idmp-interactive); background: var(--idmp-interactive-subtle); } @media (max-width: 760px) { .mapping-filter__actions { margin-left: 0 !important; }.table-heading, .table-footer { align-items: flex-start; flex-direction: column; }.form-grid, .mapping-type-picker { grid-template-columns: 1fr; }.table-footer :deep(.el-pagination) { flex-wrap: wrap; } }
</style>
