<template>
  <div class="idmp-page mapping-detail-page">
    <PageHeader title="映射详情" :status-label="mappingStatusLabel(mapping?.reviewStatus)" status-tone="info">
      <template #meta>
        <span v-if="mapping" class="mapping-detail-page__name">{{ mapping.name || mapping.code || `映射 ${mapping.id}` }}</span>
      </template>
      <template #actions>
        <div class="mapping-detail-actions">
        <el-button :icon="Back" @click="backToList">返回列表</el-button>
        <el-button v-if="capabilities.canEdit" type="primary" :icon="Edit" @click="openEdit">编辑草稿</el-button>
        <el-button v-if="capabilities.canSubmit" type="primary" :loading="mutating" @click="runCurrentAction('submit')">提交审核</el-button>
        <el-button v-if="capabilities.canApprove" type="success" :loading="mutating" @click="reviewCurrentMapping('approve')">审核通过并发布</el-button>
        <el-button v-if="capabilities.canReject" type="danger" plain :loading="mutating" @click="reviewCurrentMapping('reject')">驳回</el-button>
        <el-button v-if="capabilities.canInvalidate" type="warning" :loading="mutating" @click="invalidateCurrentMapping">人工失效</el-button>
        </div>
      </template>
    </PageHeader>

    <StatePanel v-if="loading" type="loading" title="正在加载映射详情" />
    <StatePanel v-else-if="error" type="error" title="映射详情加载失败" :description="error" />
    <template v-else-if="mapping">
      <section class="surface-card relationship-overview">
        <div class="section-heading">
          <div>
            <h2>跨政策映射关系</h2>
            <p>映射类型以源指标为参照；指标信息、政策来源与关系含义分区展示。</p>
          </div>
          <StatusBadge :status="mapping.reviewStatus" :label="mappingStatusLabel(mapping.reviewStatus)" />
        </div>
        <div class="relationship-flow">
          <article class="relation-party">
            <span class="relation-party__side">源指标</span>
            <div class="relation-party__field">
              <small>政策文件</small>
              <strong>{{ policyLabel(mapping.sourceIndicator) }}</strong>
            </div>
            <div class="relation-party__field">
              <small>指标</small>
              <b>{{ indicatorRef(mapping.sourceIndicator) }}</b>
            </div>
            <span class="relation-party__version mono-data">指标版本 {{ mapping.sourceIndicator?.indicatorVersionId || '-' }}</span>
          </article>
          <div class="relation-center">
            <span class="relation-center__arrow" aria-hidden="true">→</span>
            <StatusBadge :label="mappingTypeLabel(mapping.mappingType)" />
            <small>{{ mappingTypeDescription(mapping.mappingType) }}</small>
            <em>{{ comparabilityLabel(mapping.comparability) }}</em>
          </div>
          <article class="relation-party">
            <span class="relation-party__side">目标指标</span>
            <div class="relation-party__field">
              <small>政策文件</small>
              <strong>{{ policyLabel(mapping.targetIndicator) }}</strong>
            </div>
            <div class="relation-party__field">
              <small>指标</small>
              <b>{{ indicatorRef(mapping.targetIndicator) }}</b>
            </div>
            <span class="relation-party__version mono-data">指标版本 {{ mapping.targetIndicator?.indicatorVersionId || '-' }}</span>
          </article>
        </div>
        <dl class="mapping-summary">
          <div><dt>映射编码</dt><dd class="mono-data">{{ mapping.code || mapping.id }}</dd></div>
          <div><dt>语义组</dt><dd>{{ mapping.group?.name || mapping.group?.code || mapping.group?.id || '-' }}</dd></div>
          <div><dt>当前治理版本</dt><dd>V{{ version?.versionNo || '-' }}</dd></div>
          <div><dt>发布状态</dt><dd>{{ mapping.publicationStatus === 'PUBLISHED' ? '已发布' : '未发布' }}</dd></div>
        </dl>
      </section>

      <section class="surface-card detail-tabs-card">
        <el-tabs v-model="activeTab">
          <el-tab-pane label="口径差异" name="difference">
            <div class="difference-toolbar">
              <div><h2>口径差异对比</h2><p>默认只显示存在差异的项目；复杂结构不直接输出原始英文 JSON。</p></div>
              <el-switch v-model="onlyDifferences" active-text="仅看差异" />
            </div>
            <div class="difference-scroll">
              <div class="difference-table">
                <el-table :data="visibleDifferenceRows" size="small" :max-height="430" empty-text="当前筛选下暂无差异项">
                  <el-table-column prop="label" label="对比项" width="150" />
                  <el-table-column label="结果" width="110">
                    <template #default="{ row }"><StatusBadge :status="row.different ? 'WARNING' : 'PASSED'" :label="row.different ? '存在差异' : '一致'" /></template>
                  </el-table-column>
                  <el-table-column prop="source" label="源指标" min-width="260"><template #default="{ row }"><span class="difference-value">{{ row.source }}</span></template></el-table-column>
                  <el-table-column prop="target" label="目标指标" min-width="260"><template #default="{ row }"><span class="difference-value">{{ row.target }}</span></template></el-table-column>
                </el-table>
              </div>
            </div>
            <el-collapse class="technical-collapse">
              <el-collapse-item title="查看原始差异快照（技术数据）"><pre>{{ formatJson(version?.difference) }}</pre></el-collapse-item>
            </el-collapse>
          </el-tab-pane>

          <el-tab-pane label="人工依据与审核" name="governance">
            <div class="governance-grid">
              <section>
                <h2>人工核对依据</h2>
                <dl class="evidence-list">
                  <template v-if="evidenceEntries.length"><div v-for="item in evidenceEntries" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div></template>
                  <p v-else>暂未填写人工核对依据。</p>
                </dl>
              </section>
              <section>
                <h2>审核与状态</h2>
                <dl class="evidence-list">
                  <div><dt>审核状态</dt><dd>{{ mappingStatusLabel(mapping.reviewStatus) }}</dd></div>
                  <div><dt>审核意见</dt><dd>{{ version?.reviewComment || '暂无审核意见' }}</dd></div>
                  <div v-if="invalidateReason"><dt>失效原因</dt><dd>{{ invalidateReason }}</dd></div>
                  <div><dt>资源版本</dt><dd>{{ mapping.resourceVersion }}</dd></div>
                </dl>
              </section>
            </div>
          </el-tab-pane>

          <el-tab-pane label="政策依据" name="policy">
            <div class="policy-grid">
              <section v-for="side in policySides" :key="side.key" class="policy-panel">
                <div class="policy-panel__head">
                  <div><h2>{{ side.label }}</h2><p>{{ policyLabel(side.indicator) }}</p></div>
                  <el-button link type="primary" @click="togglePolicyForm(side.key)">{{ addingPolicySide === side.key ? '收起添加' : '添加引用' }}</el-button>
                </div>
                <el-form v-if="addingPolicySide === side.key" label-position="top" class="policy-form">
                  <el-form-item label="已发布政策版本 ID"><el-input v-model.trim="policyForms[side.key].policyFileVersionId" /></el-form-item>
                  <el-form-item label="引用角色"><el-select v-model="policyForms[side.key].relationRole"><el-option v-for="item in POLICY_REFERENCE_ROLES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
                  <el-form-item label="出处"><el-input v-model="policyForms[side.key].citationLocation" /></el-form-item>
                  <el-form-item label="政策原文"><el-input v-model="policyForms[side.key].citationText" type="textarea" :rows="2" /></el-form-item>
                  <el-button type="primary" :loading="mutating" @click="savePolicyReference(side.key)">保存引用</el-button>
                </el-form>
                <div class="policy-table-scroll">
                  <div class="policy-table">
                    <el-table :data="policyReferences[side.key]" size="small" max-height="300" empty-text="暂无有效政策引用">
                      <el-table-column label="政策文件" min-width="180"><template #default="{ row }">{{ row.policyFileName || row.policyFileCode || `政策版本 ${row.policyFileVersionId}` }}</template></el-table-column>
                      <el-table-column label="引用角色" width="110"><template #default="{ row }">{{ policyReferenceRoleLabel(row.relationRole) }}</template></el-table-column>
                      <el-table-column prop="citationLocation" label="出处" min-width="150" show-overflow-tooltip />
                      <el-table-column label="操作" width="76"><template #default="{ row }"><el-button link type="danger" @click="invalidatePolicyReference(row, side.key)">失效</el-button></template></el-table-column>
                    </el-table>
                  </div>
                </div>
              </section>
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Back, Edit } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { approveMapping, createPolicyReference, fetchMapping, fetchPolicyReferences, invalidateMapping, invalidatePolicyReference as invalidatePolicyReferenceRequest, rejectMapping, submitMapping } from '@/idmp/api/modules/mappings'
import { POLICY_REFERENCE_ROLES, comparabilityLabel, formatIndicatorRef, mappingActionAllowed, mappingActionCompleted, mappingCapabilities, mappingStatusLabel, mappingTypeDescription, mappingTypeLabel, policyReferenceRoleLabel, toOpaqueId } from '@/idmp/api/adapters/mapping'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const mutating = ref(false)
const error = ref('')
const detail = ref(null)
const activeTab = ref('difference')
const onlyDifferences = ref(true)
const addingPolicySide = ref('')
const policyReferences = reactive({ source: [], target: [] })
const policyForms = reactive({ source: emptyPolicyForm(), target: emptyPolicyForm() })
const mapping = computed(() => detail.value?.mapping || null)
const version = computed(() => detail.value?.version || null)
const invalidateReason = computed(() => detail.value?.invalidateReason || '')
const capabilities = computed(() => mappingCapabilities(detail.value || {}))
const differenceRows = computed(() => buildDifferenceRows(version.value?.difference))
const visibleDifferenceRows = computed(() => onlyDifferences.value ? differenceRows.value.filter(item => item.different) : differenceRows.value)
const evidenceEntries = computed(() => Object.entries(version.value?.evidence || {}).map(([key, value]) => ({ label: evidenceLabel(key), value: evidenceValue(value) })))
const policySides = computed(() => [
  { key: 'source', label: '源指标政策依据', indicator: mapping.value?.sourceIndicator },
  { key: 'target', label: '目标指标政策依据', indicator: mapping.value?.targetIndicator }
])

function emptyPolicyForm() { return { policyFileVersionId: '', citationLocation: '', citationText: '', relationRole: 'SOURCE' } }
function indicatorRef(indicator) { return formatIndicatorRef(indicator || {}) }
function policyLabel(indicator) { const references = Array.isArray(indicator?.policyReferences) ? indicator.policyReferences : []; const policy = references.find(item => item?.policyFileName || item?.policyFileCode || item?.policyFileVersionId); return policy?.policyFileName || policy?.policyFileCode || indicator?.policyFileName || indicator?.policyFileCode || '未标注政策来源' }
function differenceLabel(key) { return ({ indicatorName: '指标名称', definition: '指标定义', meaning: '业务含义', formulaAst: '计算公式', factors: '因子与过滤', policyReferences: '政策依据', defaultExclusion: '默认排除规则', unit: '单位', statisticalPeriod: '统计周期', granularity: '统计粒度', organizationScope: '组织范围' })[key] || key }
function differenceValue(value) { if (value === undefined || value === null || value === '') return '未提供'; if (typeof value !== 'object') return String(value); if (Array.isArray(value)) return value.length ? `共 ${value.length} 项配置` : '无配置'; const name = value.name || value.indicatorName || value.policyFileName; if (name) return String(name); return '已返回结构化内容' }
function buildDifferenceRows(difference) { return Object.entries(difference || {}).filter(([key]) => key !== 'hasDifferences').map(([key, item]) => ({ label: differenceLabel(key), different: Boolean(item?.different), source: differenceValue(item?.source), target: differenceValue(item?.target) })) }
function evidenceLabel(key) { return ({ reviewBasis: '人工核对依据', differenceNote: '差异说明', supplemental: '补充说明' })[key] || key }
function evidenceValue(value) { return typeof value === 'object' ? '已保存结构化内容' : String(value || '未填写') }
function formatJson(value) { return JSON.stringify(value || {}, null, 2) }
function indicatorVersionId(side) { return toOpaqueId(side === 'source' ? mapping.value?.sourceIndicator?.indicatorVersionId : mapping.value?.targetIndicator?.indicatorVersionId) }

async function loadDetail() { const id = toOpaqueId(route.params.id); if (!id) return; loading.value = true; error.value = ''; detail.value = null; addingPolicySide.value = ''; try { detail.value = await fetchMapping(id); await Promise.all(['source', 'target'].map(loadPolicyReferences)) } catch (loadError) { error.value = loadError?.message || '无法读取映射详情' } finally { loading.value = false } }
async function loadPolicyReferences(side) { const id = indicatorVersionId(side); if (!id) { policyReferences[side] = []; return }; try { policyReferences[side] = await fetchPolicyReferences(id) } catch { policyReferences[side] = [] } }
function backToList() { router.push({ name: 'IndicatorMapping' }) }
function openEdit() { router.push({ name: 'IndicatorMapping', query: { edit: String(mapping.value.id) } }) }
function togglePolicyForm(side) { addingPolicySide.value = addingPolicySide.value === side ? '' : side }
async function runCurrentAction(action, comment = '') {
  if (!mapping.value?.id || mutating.value) return
  const mappingId = toOpaqueId(mapping.value.id)
  const successMessage = { submit: '已提交审核', approve: '映射已通过并发布', reject: '映射已驳回', invalidate: '映射已失效' }[action]
  mutating.value = true
  try {
    // 状态转换前读取最新乐观锁版本，避免详情页停留期间产生的旧版本误冲突。
    const latest = await fetchMapping(mappingId)
    detail.value = latest
    if (mappingActionCompleted(latest, action)) {
      ElMessage.success(successMessage)
      return
    }
    if (!mappingActionAllowed(latest, action)) {
      ElMessage.warning(`当前映射状态为“${mappingStatusLabel(latest?.mapping?.reviewStatus)}”，无法执行该操作。`)
      return
    }

    const resourceVersion = latest?.mapping?.resourceVersion
    const result = action === 'submit'
      ? await submitMapping(mappingId, resourceVersion)
      : action === 'approve'
        ? await approveMapping(mappingId, resourceVersion, comment)
        : action === 'reject'
          ? await rejectMapping(mappingId, resourceVersion, comment)
          : await invalidateMapping(mappingId, resourceVersion, comment)
    detail.value = result
    await Promise.all(['source', 'target'].map(loadPolicyReferences))
    ElMessage.success(successMessage)
  } catch (actionError) {
    if (actionError?.status === 409) {
      const latest = await fetchMapping(mappingId).catch(() => null)
      if (latest) detail.value = latest
      if (latest && mappingActionCompleted(latest, action)) {
        ElMessage.success(successMessage)
      } else {
        ElMessage.warning(actionError?.message || '映射状态已变化，已刷新最新状态，请核对后重试。')
      }
    } else {
      ElMessage.error(actionError?.message || '映射操作失败')
    }
  } finally {
    mutating.value = false
  }
}
async function reviewCurrentMapping(action) { const reject = action === 'reject'; try { const { value } = await ElMessageBox.prompt(reject ? '请填写驳回意见（必填）' : '可填写审核意见', reject ? '驳回映射' : '审核通过并发布', { inputPattern: reject ? /\S+/ : undefined, inputErrorMessage: '驳回意见不能为空', confirmButtonText: reject ? '确认驳回' : '确认通过', cancelButtonText: '取消' }); await runCurrentAction(action, value) } catch { /* 用户取消 */ } }
async function invalidateCurrentMapping() { try { const { value } = await ElMessageBox.prompt('请填写失效原因（必填）', '人工失效映射', { inputPattern: /\S+/, inputErrorMessage: '失效原因不能为空', confirmButtonText: '确认失效', cancelButtonText: '取消' }); await runCurrentAction('invalidate', value) } catch { /* 用户取消 */ } }
async function savePolicyReference(side) { const versionId = indicatorVersionId(side); const form = policyForms[side]; if (!versionId || !form.policyFileVersionId.trim()) return ElMessage.warning('请填写已发布政策版本 ID'); mutating.value = true; try { await createPolicyReference(versionId, { ...form, policyFileVersionId: form.policyFileVersionId.trim() }); ElMessage.success('政策引用已添加'); Object.assign(form, emptyPolicyForm()); addingPolicySide.value = ''; await loadPolicyReferences(side) } catch (saveError) { ElMessage.error(saveError?.message || '添加政策引用失败') } finally { mutating.value = false } }
async function invalidatePolicyReference(reference, side) { try { await ElMessageBox.confirm('确认使该政策引用失效？映射历史仍会保留。', '失效政策引用', { type: 'warning' }); await invalidatePolicyReferenceRequest(reference.id, reference.resourceVersion); ElMessage.success('政策引用已失效'); await loadPolicyReferences(side) } catch (actionError) { if (actionError !== 'cancel' && actionError !== 'close') ElMessage.error(actionError?.message || '失效政策引用失败') } }

watch(() => route.params.id, () => { void loadDetail() }, { immediate: true })
</script>

<style scoped lang="scss">
.mapping-detail-page {
  max-width: 1440px;
}

.mapping-detail-page__name {
  display: block;
  max-width: min(720px, 60vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mapping-detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  :deep(.el-button + .el-button) {
    margin-left: 0;
  }
}

.relationship-overview,
.detail-tabs-card {
  margin-top: 16px;
}

.relationship-overview {
  padding: 20px;
}

.section-heading,
.difference-toolbar,
.policy-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading > div,
.difference-toolbar > div,
.policy-panel__head > div {
  min-width: 0;
}

.section-heading h2,
.difference-toolbar h2,
.governance-grid h2,
.policy-panel h2 {
  margin: 0;
  color: var(--idmp-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.section-heading p,
.difference-toolbar p,
.policy-panel p {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.relationship-flow {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(140px, 180px) minmax(260px, 1fr);
  align-items: stretch;
  gap: 16px;
  margin-top: 18px;
}

.relation-party {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-02);
}

.relation-party__side {
  align-self: flex-start;
  margin-bottom: 14px;
  padding: 3px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--idmp-interactive) 10%, transparent);
  color: var(--idmp-interactive);
  font-size: 12px;
  font-weight: 650;
  line-height: 20px;
}

.relation-party__field {
  display: grid;
  min-width: 0;
  gap: 4px;

  & + & {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--idmp-border-subtle);
  }
}

.relation-party small {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.relation-party strong,
.relation-party b {
  overflow-wrap: anywhere;
  color: var(--idmp-text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.relation-party__version {
  margin-top: auto;
  padding-top: 16px;
  overflow-wrap: anywhere;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.relation-center {
  display: grid;
  align-content: center;
  justify-items: center;
  min-width: 0;
  gap: 10px;
  padding: 16px 4px;
  text-align: center;
}

.relation-center__arrow {
  width: 100%;
  overflow: hidden;
  color: var(--idmp-interactive);
  font-size: 30px;
  line-height: 1;
}

.relation-center small {
  max-width: 180px;
  overflow-wrap: anywhere;
  color: var(--idmp-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.relation-center em {
  color: var(--idmp-text-helper);
  font-size: 12px;
  font-style: normal;
  line-height: 18px;
}

.mapping-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 20px 0 0;
  overflow: hidden;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-border-subtle);
}

.mapping-summary > div {
  min-width: 0;
  padding: 13px 15px;
  background: var(--idmp-layer-01);
}

.mapping-summary dt,
.evidence-list dt {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.mapping-summary dd,
.evidence-list dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  color: var(--idmp-text-primary);
  line-height: 22px;
}

.detail-tabs-card {
  padding: 0 20px 20px;
  overflow: hidden;
}

.detail-tabs-card :deep(.el-tabs__header) {
  margin-bottom: 18px;
}

.detail-tabs-card :deep(.el-tabs__content),
.detail-tabs-card :deep(.el-tab-pane) {
  min-width: 0;
}

.difference-toolbar {
  align-items: center;
  padding: 2px 0 16px;
}

.difference-toolbar :deep(.el-switch) {
  flex: 0 0 auto;
}

.difference-scroll,
.policy-table-scroll {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
}

.difference-table {
  min-width: 780px;
}

.difference-value {
  display: block;
  white-space: normal;
  word-break: break-word;
}

.technical-collapse {
  margin-top: 14px;
}

.technical-collapse pre {
  max-height: 260px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-word;
}

.governance-grid,
.policy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.governance-grid > section,
.policy-panel {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
}

.evidence-list {
  display: grid;
  gap: 0;
  margin: 14px 0 0;
}

.evidence-list > div {
  min-width: 0;
  padding: 11px 0;
  border-top: 1px solid var(--idmp-border-subtle);
}

.evidence-list p {
  margin: 0;
  padding: 12px 0;
  color: var(--idmp-text-helper);
}

.policy-grid {
  align-items: start;
}

.policy-panel__head {
  margin-bottom: 14px;
}

.policy-panel__head :deep(.el-button) {
  flex: 0 0 auto;
}

.policy-form {
  margin: 0 0 16px;
  padding: 14px;
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-02);
}

.policy-form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.policy-form :deep(.el-select) {
  width: 100%;
}

.policy-table-scroll {
  border-radius: var(--idmp-radius-sm);
}

.policy-table {
  min-width: 520px;
}

@media (max-width: 1180px) {
  .mapping-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .governance-grid,
  .policy-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .mapping-detail-page :deep(.page-heading) {
    flex-direction: column;
    gap: 14px;
  }

  .mapping-detail-page :deep(.page-heading__actions),
  .mapping-detail-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .relationship-flow {
    grid-template-columns: 1fr;
  }

  .relation-center {
    justify-items: start;
    padding: 0 12px;
    text-align: left;
  }

  .relation-center__arrow {
    width: auto;
    transform: rotate(90deg);
  }
}

@media (max-width: 600px) {
  .mapping-detail-page__name {
    max-width: 100%;
    white-space: normal;
  }

  .relationship-overview {
    padding: 16px;
  }

  .section-heading,
  .difference-toolbar,
  .policy-panel__head {
    flex-direction: column;
  }

  .mapping-summary {
    grid-template-columns: 1fr;
  }

  .detail-tabs-card {
    padding: 0 14px 16px;
  }

  .detail-tabs-card :deep(.el-tabs__nav-wrap) {
    overflow-x: auto;
  }

  .detail-tabs-card :deep(.el-tabs__nav) {
    float: none;
    width: max-content;
  }

  .governance-grid > section,
  .policy-panel {
    padding: 14px;
  }
}
</style>
