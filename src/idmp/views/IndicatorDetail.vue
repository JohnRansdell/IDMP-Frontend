<template>
  <div class="idmp-page indicator-detail-page">
    <PageHeader :title="`查看指标 / ${indicatorName}`" :status="indicatorStatus" :status-label="getStatusLabel(indicatorStatus)">
      <template #meta>
        <span class="mono-data">指标编码：{{ detail.code || routeIndicatorKey }}</span>
      </template>
      <template #actions>
        <el-button v-if="selectedVersion" @click="relatedDrawerOpen = true">更多关联</el-button>
        <el-button @click="router.push('/indicator')">返回指标目录</el-button>
        <el-button v-access="{ action: 'indicator.edit', resourceId: detail.id }" type="primary" plain :disabled="detailLoading || !!loadError || !detail.id" @click="openIndicatorEditor">编辑指标</el-button>
      </template>
    </PageHeader>
    <StatePanel v-if="detailLoading" type="loading" title="正在加载指标详情" />
    <StatePanel v-else-if="loadError" :type="detailNotFound ? 'empty' : 'error'" :title="detailNotFound ? '未找到该指标' : '指标详情加载失败'" :description="loadError">
      <template #actions><el-button type="primary" @click="loadIndicatorDetail">重试</el-button></template>
    </StatePanel>
    <section v-else-if="detail.id" class="detail-layout">
      <article class="surface-card formula-definition" aria-label="指标公式">
        <dl class="identity-grid" aria-label="指标标识信息">
          <div><dt>指标名称</dt><dd class="identity-name">{{ indicatorName }}</dd></div>
          <div><dt>指标 ID</dt><dd class="identity-id mono-data">{{ detail.id || '—' }}</dd></div>
          <div>
            <dt>当前版本</dt>
            <dd>
              <el-select v-if="versionRows.length > 1" :model-value="selectedVersionId" class="version-selector" aria-label="查看指标版本" @update:model-value="selectVersionById">
                <el-option v-for="version in versionRows" :key="resolveIndicatorVersionId(version)" :value="resolveIndicatorVersionId(version)" :label="`V${version.versionNo || '-'} · ${getStatusLabel(version.publicationStatus || version.status)}`" />
              </el-select>
              <span v-else class="current-version">{{ selectedVersionLabel }}</span>
              <small class="version-id-text">版本 ID：<span class="mono-data">{{ selectedVersionId || '—' }}</span></small>
            </dd>
          </div>
        </dl>
        <div class="content-heading"><h2>指标公式</h2></div>
        <el-popover v-if="detail.description" placement="bottom-start" trigger="click" :width="380" :content="detail.description">
          <template #reference><button type="button" class="detail-description" aria-label="查看完整指标说明">{{ detail.description }}</button></template>
        </el-popover>
        <StatePanel v-if="versionsLoading || versionLoading" type="loading" title="正在读取指标公式" />
        <StatePanel v-else-if="versionsError" type="error" title="指标版本加载失败" :description="versionsError"><template #actions><el-button @click="loadVersions(detail.id)">重试</el-button></template></StatePanel>
        <StatePanel v-else-if="versionError" type="error" title="公式读取失败" :description="versionError"><template #actions><el-button @click="selectVersion(selectedVersion)">重试</el-button></template></StatePanel>
        <div v-else-if="!selectedVersion" class="content-empty">暂无可查看的指标公式。</div>
        <template v-else>
            <IndicatorFormulaExpression v-if="mathFormulaSupported" :formula="selectedVersion.formula" :factors="readableFormula?.factors || []">
              <template #factor="{ id, text }"><el-tooltip :content="factorVersionTooltip(id)" placement="top" effect="light" :trigger="['hover', 'focus']" :show-after="180" popper-class="formula-factor-version-tooltip"><button type="button" class="formula-factor-link" :disabled="!!factorNavigationPending" @mouseenter="loadFormulaFactorVersion(id)" @focus="loadFormulaFactorVersion(id)" @click="openFactorEditor(id)">{{ text }}</button></el-tooltip></template>
            </IndicatorFormulaExpression>
            <div v-else-if="readableFormula?.expression" class="formula-expression" :aria-label="readableFormula.displayExpression || readableFormula.expression">
              <template v-if="formulaRatio">
                <div class="formula-fraction">
                  <span class="formula-numerator"><template v-for="(segment, index) in formulaRatio.numerator" :key="index"><el-tooltip v-if="segment.factorVersionId" :content="factorVersionTooltip(segment.factorVersionId)" placement="top" effect="light" :trigger="['hover', 'focus']" :show-after="180" popper-class="formula-factor-version-tooltip"><button type="button" class="formula-factor-link" :disabled="!!factorNavigationPending" @mouseenter="loadFormulaFactorVersion(segment.factorVersionId)" @focus="loadFormulaFactorVersion(segment.factorVersionId)" @click="openFactorEditor(segment.factorVersionId)">{{ segment.text }}</button></el-tooltip><span v-else>{{ segment.text }}</span></template></span>
                  <span class="formula-denominator"><template v-for="(segment, index) in formulaRatio.denominator" :key="index"><el-tooltip v-if="segment.factorVersionId" :content="factorVersionTooltip(segment.factorVersionId)" placement="top" effect="light" :trigger="['hover', 'focus']" :show-after="180" popper-class="formula-factor-version-tooltip"><button type="button" class="formula-factor-link" :disabled="!!factorNavigationPending" @mouseenter="loadFormulaFactorVersion(segment.factorVersionId)" @focus="loadFormulaFactorVersion(segment.factorVersionId)" @click="openFactorEditor(segment.factorVersionId)">{{ segment.text }}</button></el-tooltip><span v-else>{{ segment.text }}</span></template></span>
                </div>
                <span v-if="formulaRatio.suffix" class="formula-suffix">{{ formulaRatio.suffix }}</span>
              </template>
              <span v-else><template v-for="(segment, index) in formulaSegments" :key="index"><el-tooltip v-if="segment.factorVersionId" :content="factorVersionTooltip(segment.factorVersionId)" placement="top" effect="light" :trigger="['hover', 'focus']" :show-after="180" popper-class="formula-factor-version-tooltip"><button type="button" class="formula-factor-link" :disabled="!!factorNavigationPending" @mouseenter="loadFormulaFactorVersion(segment.factorVersionId)" @focus="loadFormulaFactorVersion(segment.factorVersionId)" @click="openFactorEditor(segment.factorVersionId)">{{ segment.text }}</button></el-tooltip><template v-else>{{ segment.text }}</template></template></span>
            </div>
            <el-alert v-for="warning in formulaWarnings" :key="warning" :title="warning" type="warning" :closable="false" show-icon />
            <p v-if="formulaNotes.length" class="formula-notes">{{ formulaNotes.join('；') }}</p>
        </template>
      </article>
      <article class="surface-card related-scenarios" aria-label="关联场景">
        <div class="content-heading"><h2>关联场景</h2></div>
        <StatePanel v-if="scenarioLoading" type="loading" title="正在加载关联场景" />
        <StatePanel v-else-if="scenarioError" type="error" title="关联场景加载失败" :description="scenarioError"><template #actions><el-button @click="loadRelatedScenarios">重试</el-button></template></StatePanel>
        <div v-else-if="!scenarioRows.length" class="content-empty">
          <span>暂无关联场景</span>
          <el-button v-access="'scenario.read'" type="primary" link size="small" @click="router.push({ name: 'ScenarioList' })">前往场景管理</el-button>
        </div>
        <el-table v-else :data="scenarioRows" size="small" table-layout="fixed" max-height="280">
          <el-table-column label="场景名称" min-width="240"><template #default="{ row }"><span class="scene-name">{{ row.name || row.scenarioName || '-' }}</span><p v-if="row.description" class="scene-description">{{ row.description }}</p></template></el-table-column>
          <el-table-column label="场景编码" min-width="160" show-overflow-tooltip><template #default="{ row }">{{ row.code || row.scenarioCode || '-' }}</template></el-table-column>
          <el-table-column label="统计周期" width="110"><template #default="{ row }">{{ periodLabel(row.configuredPeriodType || row.defaultPeriodType) }}</template></el-table-column>
          <el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-access="'scenario.create'" link type="primary" @click="openScenario(row)">查看</el-button></template></el-table-column>
        </el-table>
      </article>
    </section>
    <el-drawer v-model="relatedDrawerOpen" title="更多关联" size="min(680px, 100vw)" destroy-on-close>
        <article v-if="selectedVersion" class="surface-card policy-card">
          <div class="section-title compact"><div><h2>政策依据</h2><p class="section-title__description">仅能绑定已发布的指标版本和政策文件版本。</p></div></div>
          <StatePanel v-if="policyReferenceLoading" type="loading" title="正在读取政策引用" />
          <StatePanel v-else-if="policyReferenceError" type="error" title="政策引用读取失败" :description="policyReferenceError"><template #actions><el-button @click="loadPolicyReferences(selectedVersionId)">重试</el-button></template></StatePanel>
          <el-table v-else :data="policyReferences" size="small" table-layout="fixed" empty-text="暂无有效政策引用">
            <el-table-column label="政策文件" min-width="170"><template #default="{ row }">{{ row.policyFileName || row.policyFileCode || row.policyFileVersionId }}</template></el-table-column>
            <el-table-column prop="relationRole" label="角色" width="100" />
            <el-table-column label="操作" width="120"><template #default="{ row }"><el-button link type="primary" @click="policyViewerId = String(row.policyFileVersionId)">查看</el-button><el-button v-access="'mapping.policyReferences.invalidate'" link type="danger" @click="invalidatePolicy(row)">失效</el-button></template></el-table-column>
          </el-table>
          <div v-if="isPublishedVersion && $can('POST', '/mappings/indicator-versions/1/policy-references')" class="policy-reference-form"><PolicyVersionPicker v-model="policyReferenceForm.policyFileVersionId" /><el-select v-model="policyReferenceForm.relationRole"><el-option v-for="item in POLICY_REFERENCE_ROLES" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-button v-access="'mapping.indicatorVersions.policyReferences.create'" type="primary" :loading="policyReferenceSaving" @click="addPolicyReference">添加</el-button></div>
          <el-input v-if="isPublishedVersion && $can('POST', '/mappings/indicator-versions/1/policy-references')" v-model="policyReferenceForm.citationLocation" class="policy-reference-input" placeholder="政策出处（可选）" />
          <el-input v-if="isPublishedVersion && $can('POST', '/mappings/indicator-versions/1/policy-references')" v-model="policyReferenceForm.citationText" class="policy-reference-input" type="textarea" :rows="2" placeholder="政策原文（可选）" />
          <div v-if="$can('GET', '/mappings/by-indicator-version/1')" class="version-mapping-links"><div class="section-title compact"><div><h3>有效指标映射</h3><p class="section-title__description">反查当前指标版本作为源侧或目标侧的已发布有效映射。</p></div></div><StatePanel v-if="mappingReferenceLoading" type="loading" title="正在读取有效映射" /><StatePanel v-else-if="mappingReferenceError" type="error" title="有效映射读取失败" :description="mappingReferenceError"><template #actions><el-button @click="loadMappingReferences(selectedVersionId)">重试</el-button></template></StatePanel><el-table v-else :data="mappingReferences" size="small" empty-text="暂无有效映射"><el-table-column prop="code" label="映射编码" min-width="150" /><el-table-column prop="mappingType" label="关系" width="110" /><el-table-column prop="comparability" label="可比性" width="120" /><el-table-column label="操作" width="68"><template #default="{ row }"><el-button v-access="'mapping.read'" link type="primary" @click="openMapping(row)">查看</el-button></template></el-table-column></el-table></div>
        </article>
    </el-drawer>
    <PolicyFileViewer :version-id="policyViewerId" @close="policyViewerId = ''" />
  </div>
</template>

<script setup>
import { resolveIndicatorVersionId, extractFormula, pickLatestVersion } from '@/idmp/features/indicator/versionModel.js'
import { toOpaqueId } from '@/idmp/utils/resourceId.js'

import { canRequest } from '@/idmp/auth/session'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import PageHeader from '@/idmp/components/PageHeader.vue'
import PolicyVersionPicker from '@/idmp/components/PolicyVersionPicker.vue'
import PolicyFileViewer from '@/idmp/components/PolicyFileViewer.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import {
  fetchIndicator,
  fetchAllIndicators as fetchIndicators,
  fetchAllIndicatorScenarios as fetchIndicatorScenarios,
  fetchIndicatorVersion,
  fetchIndicatorVersions
} from '@/idmp/api/modules/indicators'
import { getStatusLabel } from '@/idmp/design/status'
import { createPolicyReference, fetchMappingsByIndicatorVersion, fetchPolicyReferences, invalidatePolicyReference } from '@/idmp/api/modules/mappings'
import { POLICY_REFERENCE_ROLES } from '@/idmp/api/adapters/mapping'
import { splitFormulaFraction, splitFormulaLinks } from '@/idmp/utils/formulaLinks'
import { arithmeticFormulaError } from '@/idmp/features/indicator/arithmeticFormula'
import IndicatorFormulaExpression from '@/idmp/components/IndicatorFormulaExpression.vue'
import { fetchFactorVersion } from '@/idmp/api/modules/factors'

const route = useRoute()
const router = useRouter()
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const loadError = ref('')
const detailLoading = ref(true)
const detailNotFound = ref(false)
const relatedDrawerOpen = ref(false)
const versionRows = ref([])
const versionsError = ref('')
const versionsLoading = ref(false)
const selectedVersion = ref(null)
const versionLoading = ref(false)
const versionError = ref('')
let versionRevision = 0
const scenarioRows = ref([])
const scenarioLoading = ref(false)
const scenarioError = ref('')
const policyReferences = ref([])
const policyReferenceLoading = ref(false)
const policyReferenceError = ref('')
const policyReferenceSaving = ref(false)
const policyViewerId = ref('')
const mappingReferences = ref([])
const mappingReferenceLoading = ref(false)
const mappingReferenceError = ref('')
const policyReferenceForm = reactive({ policyFileVersionId: '', citationLocation: '', citationText: '', relationRole: 'SOURCE' })
const detail = reactive({
  id: '',
  code: '',
  name: '',
  status: '',
  description: ''
})

const indicatorName = computed(() => detail.name || detail.code || routeIndicatorKey.value || '待加载')
const indicatorStatus = computed(() => detail.status || 'UNKNOWN')
const selectedVersionId = computed(() => resolveIndicatorVersionId(selectedVersion.value))
const selectedVersionLabel = computed(() => {
  const number = selectedVersion.value?.versionNo ?? selectedVersion.value?.version
  return number == null || number === '' ? (selectedVersionId.value ? '版本号未提供' : '暂无版本') : `V${String(number).replace(/^V/i, '')}`
})
const isPublishedVersion = computed(() => String(selectedVersion.value?.publicationStatus || selectedVersion.value?.status || '').toUpperCase() === 'PUBLISHED')
const readableFormula = computed(() => selectedVersion.value?.formulaDefinition || null)
const mathFormulaSupported = computed(() => !arithmeticFormulaError(selectedVersion.value?.formula?.root))
const formulaWarnings = computed(() => readableFormula.value?.warnings?.length ? readableFormula.value.warnings
  : readableFormula.value?.expression ? [] : ['该版本暂无可读公式定义'])
const formulaRatio = computed(() => splitFormulaFraction(selectedVersion.value?.formula, readableFormula.value))
const formulaSegments = computed(() => splitFormulaLinks(readableFormula.value?.displayExpression || readableFormula.value?.expression, readableFormula.value?.factors))
const factorNavigationPending = ref('')
const formulaFactorVersions = reactive({})
const formulaFactorVersionErrors = reactive({})
const formulaFactorVersionRequests = new Map()
function factorVersionTooltip(versionId) {
  const id = String(versionId)
  const version = formulaFactorVersions[id]
  const lines = [`版本 ID：${id}`]
  if (version) {
    lines.unshift(version.versionNo == null ? '版本号暂未提供' : `版本：V${version.versionNo}`)
    const status = version.publicationStatus || version.status
    if (status) lines.push(`状态：${getStatusLabel(status)}`)
  } else {
    lines.push(formulaFactorVersionErrors[id] ? '版本信息暂时无法读取，请重新悬停重试' : '正在读取版本信息')
  }
  return lines.join('\n')
}
function loadFormulaFactorVersion(versionId) {
  if (!canRequest('GET', '/factor-versions/1')) return Promise.resolve(null)
  const id = String(versionId)
  if (formulaFactorVersions[id]) return Promise.resolve(formulaFactorVersions[id])
  if (formulaFactorVersionRequests.has(id)) return formulaFactorVersionRequests.get(id)
  formulaFactorVersionErrors[id] = false
  const request = fetchFactorVersion(id).then(version => {
    if (!version?.factorId) throw new Error('因子版本信息不完整')
    formulaFactorVersions[id] = version
    return version
  }).catch(() => {
    formulaFactorVersionErrors[id] = true
    return null
  }).finally(() => formulaFactorVersionRequests.delete(id))
  formulaFactorVersionRequests.set(id, request)
  return request
}
async function openFactorEditor(versionId) {
  if (factorNavigationPending.value) return
  const indicatorVersionId = selectedVersionId.value
  const origin = route.fullPath
  factorNavigationPending.value = versionId
  try {
    const factorVersion = await loadFormulaFactorVersion(versionId)
    if (selectedVersionId.value !== indicatorVersionId || route.fullPath !== origin) return
    if (!factorVersion?.factorId) throw new Error('未找到对应的因子，请刷新后重试。')
    await router.push({ name: 'FactorDetail', params: { id: String(factorVersion.factorId) }, query: { factorVersionId: versionId } })
  } catch (error) {
    if (selectedVersionId.value === indicatorVersionId && route.fullPath === origin) ElMessage.error(error?.message || '暂时无法打开因子，请稍后重试。')
  } finally { factorNavigationPending.value = '' }
}
const formulaNotes = computed(() => {
  const rules = readableFormula.value?.rules || []
  if (mathFormulaSupported.value) {
    const divisions = rules.filter(rule => rule.startsWith('除法 '))
    return divisions.length === 1 ? divisions.map(rule => rule.slice(rule.lastIndexOf('：') + 1)) : divisions
  }
  if (!formulaRatio.value) return rules.filter(rule => rule.startsWith('展示值保留 '))
  return rules.filter(rule => rule.startsWith('展示值保留 ') || rule.startsWith('除法 '))
    .map(rule => rule.startsWith('除法 ') ? rule.slice(rule.lastIndexOf('：') + 1) : rule.replace(/^展示值/, ''))
})

function openIndicatorEditor() {
  // 编辑页的详情、版本读取接口以主键为准。编码只是展示/业务检索字段，
  // 不能作为路由主键，否则编辑页还要依赖列表接口二次反查。
  const indicatorId = detail.id || (/^\d+$/.test(routeIndicatorKey.value) ? routeIndicatorKey.value : '')
  if (!indicatorId) {
    loadError.value = '未获取到指标 ID，暂时无法进入编辑页；请刷新详情后重试。'
    return
  }
  router.push({ name: 'IndicatorEditor', params: { id: indicatorId } })
}

function hydrateDetail(item) {
  Object.assign(detail, {
    id: toOpaqueId(item.id ?? item.indicatorId ?? ''),
    code: item.code || item.indicatorCode || routeIndicatorKey.value,
    name: item.name || item.indicatorName || '',
    status: item.publicationStatus || item.status || 'UNKNOWN',
    description: item.description || ''
  })
}

async function loadIndicatorDetail() {
  detailLoading.value = true
  detailNotFound.value = false
  loadError.value = ''
  versionRows.value = []
  selectedVersion.value = null
  try {
    if (!(await loadBackendDetail())) {
      detailNotFound.value = true
      loadError.value = `未找到指标 ${routeIndicatorKey.value}，请返回目录确认记录是否存在。`
    }
  } catch (error) {
    detailNotFound.value = Number(error?.status) === 404
    loadError.value = error?.message || '指标详情加载失败，请重试。'
  } finally {
    detailLoading.value = false
  }
}

async function loadBackendDetail() {
  const key = routeIndicatorKey.value
  let target = null

  if (/^\d+$/.test(key)) {
    target = await fetchIndicator(key)
  } else {
    const rows = await fetchIndicators()
    target = findIndicator(normalizeList(rows))
    if (target?.id || target?.indicatorId) {
      target = await fetchIndicator(target.id ?? target.indicatorId)
    }
  }

  if (!target) return false

  hydrateDetail(target)
  await Promise.allSettled([loadRelatedScenarios(), loadVersions(detail.id)])
  return true
}

async function loadRelatedScenarios() {
  if (!detail.id) return
  scenarioLoading.value = true
  scenarioError.value = ''
  try {
    const page = await fetchIndicatorScenarios(detail.id, { page: 1, size: 100 })
    scenarioRows.value = normalizeList(page)
  } catch (error) {
    scenarioRows.value = []
    scenarioError.value = error?.message || '关联场景接口暂不可用。'
  } finally {
    scenarioLoading.value = false
  }
}

function periodLabel(value) {
  return ({ DAILY: '日', WEEKLY: '周', MONTHLY: '月', QUARTERLY: '季', YEARLY: '年' })[value] || value || '未设置'
}

function selectVersionById(id) {
  const version = versionRows.value.find(item => resolveIndicatorVersionId(item) === String(id))
  if (version) void selectVersion(version)
}

function openScenario(row) {
  const scenarioId = row.id || row.scenarioId
  if (!scenarioId) return
  router.push({ name: 'ScenarioEditor', params: { scenarioId }, query: { versionId: row.scenarioVersionId } })
}

async function loadVersions(indicatorId) {
  if (!indicatorId) return
  versionsLoading.value = true
  versionsError.value = ''
  try {
    const versions = normalizeList(await fetchIndicatorVersions(indicatorId))
    versionRows.value = versions
    const requested = toOpaqueId(route.query.versionId || route.query.indicatorVersionId)
    const latest = versions.find(version => resolveIndicatorVersionId(version) === requested) || pickLatestVersion(versions)
    if (resolveIndicatorVersionId(latest) || latest?.id) await selectVersion(latest)
  } catch (error) {
    versionRows.value = []
    versionsError.value = error?.message || '指标版本读取失败'
  } finally { versionsLoading.value = false }
}

async function selectVersion(version) {
  const revision = ++versionRevision
  selectedVersion.value = version
  versionError.value = ''
  versionLoading.value = true
  policyReferences.value = []
  mappingReferences.value = []
  const versionId = resolveIndicatorVersionId(version) || toOpaqueId(version?.id)
  if (!versionId) { versionLoading.value = false; return }
  try {
    const versionDetail = await fetchIndicatorVersion(versionId)
    const formula = extractFormula(versionDetail)
    if (revision !== versionRevision) return
    selectedVersion.value = {
      ...version,
      ...versionDetail,
      id: versionId,
      formula: formula || versionDetail.formula || versionDetail.formulaAst
    }
    detail.status = selectedVersion.value?.publicationStatus || selectedVersion.value?.status || detail.status
  } catch (error) {
    if (revision !== versionRevision) return
    versionError.value = error?.message || '公式定义读取失败，请重新选择版本后重试'
  } finally { if (revision === versionRevision) versionLoading.value = false }
  if (revision !== versionRevision) return
  void loadPolicyReferences(selectedVersionId.value)
  void loadMappingReferences(selectedVersionId.value)
}

async function loadPolicyReferences(versionId) {
  if (!canRequest('GET', '/mappings/indicator-versions/1/policy-references')) return
  if (!versionId) return
  policyReferenceLoading.value = true
  policyReferenceError.value = ''
  try {
    const references = await fetchPolicyReferences(versionId)
    if (versionId === selectedVersionId.value) policyReferences.value = references
  } catch (error) {
    if (versionId !== selectedVersionId.value) return
    policyReferences.value = []
    policyReferenceError.value = error?.message || '政策引用读取失败'
  } finally { if (versionId === selectedVersionId.value) policyReferenceLoading.value = false }
}

async function addPolicyReference() {
  if (!selectedVersionId.value || !policyReferenceForm.policyFileVersionId) return ElMessage.warning('请选择已发布政策文件版本')
  policyReferenceSaving.value = true
  try {
    await createPolicyReference(selectedVersionId.value, {
      ...policyReferenceForm,
      policyFileVersionId: String(policyReferenceForm.policyFileVersionId)
    })
    Object.assign(policyReferenceForm, { policyFileVersionId: '', citationLocation: '', citationText: '', relationRole: 'SOURCE' })
    await loadPolicyReferences(selectedVersionId.value)
    ElMessage.success('政策引用已添加')
  } catch (error) { ElMessage.error(error?.message || '添加政策引用失败') } finally { policyReferenceSaving.value = false }
}

async function loadMappingReferences(versionId) {
  if (!canRequest('GET', '/mappings/by-indicator-version/1')) return
  if (!versionId) return
  mappingReferenceLoading.value = true
  mappingReferenceError.value = ''
  try {
    const references = await fetchMappingsByIndicatorVersion(versionId)
    if (versionId === selectedVersionId.value) mappingReferences.value = references
  } catch (error) {
    if (versionId !== selectedVersionId.value) return
    mappingReferences.value = []
    mappingReferenceError.value = error?.message || '无法读取有效映射'
  } finally { if (versionId === selectedVersionId.value) mappingReferenceLoading.value = false }
}

function openMapping(row) {
  if (row?.id === undefined || row?.id === null) return
  router.push({ name: 'IndicatorMappingDetail', params: { id: String(row.id) } })
}

async function invalidatePolicy(reference) {
  try {
    await ElMessageBox.confirm('确认使该政策引用失效？', '失效政策引用', { type: 'warning' })
    await invalidatePolicyReference(reference.id, reference.resourceVersion)
    await loadPolicyReferences(selectedVersionId.value)
    ElMessage.success('政策引用已失效')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '失效政策引用失败')
  }
}

function findIndicator(rows) {
  return rows.find(item => [item.id, item.indicatorId, item.code].map(toOpaqueId).includes(routeIndicatorKey.value))
}


function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
}




onMounted(loadIndicatorDetail)
</script>

<style scoped lang="scss">
.detail-layout { display: grid; gap: 14px; min-width: 0; }
.formula-definition, .related-scenarios { min-width: 0; padding: 18px 20px; }
.identity-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.25fr); gap: 14px 24px; margin: 0 0 16px; padding: 0 0 14px; border-bottom: 1px solid var(--idmp-border-subtle); }
.identity-grid > div { min-width: 0; }
.identity-grid dt { color: var(--idmp-text-helper); font-size: 12px; line-height: 20px; }
.identity-grid dd { margin: 5px 0 0; color: var(--idmp-text-primary); font-size: 14px; line-height: 24px; overflow-wrap: anywhere; }
.identity-name, .current-version { font-weight: 600; }
.identity-id, .version-id-text .mono-data { user-select: all; }
.version-id-text { display: block; margin-top: 3px; color: var(--idmp-text-helper); font-size: 12px; line-height: 20px; overflow-wrap: anywhere; }
.content-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.content-heading h2 { margin: 0; font-size: 16px; }
.version-selector { width: 180px; }
.detail-description { display: block; width: 100%; margin: -2px 0 14px; padding: 0; overflow: hidden; color: var(--idmp-text-secondary); font: inherit; font-size: 13px; line-height: 22px; text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; background: none; border: 0; }
.detail-description:focus-visible { outline: 2px solid var(--idmp-interactive); outline-offset: 3px; }
.content-empty { display: flex; align-items: center; gap: 12px; min-height: 56px; color: var(--idmp-text-helper); font-size: 13px; }
.formula-definition .formula-expression { min-height: 86px; padding: 14px 18px; border-radius: var(--idmp-radius-sm); background: var(--idmp-layer-02); }
.scene-name { font-weight: 500; }
.scene-description { margin: 3px 0 0; overflow: hidden; color: var(--idmp-text-helper); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.formula-expression { display: flex; align-items: center; gap: 16px; max-width: 100%; margin: 0; font-size: 15px; font-weight: 500; line-height: 1.7; color: var(--idmp-text-primary); overflow-wrap: anywhere; }
.formula-expression > span { min-width: 0; }
.formula-fraction { display: grid; min-width: 0; max-width: 100%; text-align: center; }
.formula-numerator, .formula-denominator { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 8px; }
.formula-numerator { padding: 0 8px 10px; border-bottom: 1px solid var(--idmp-text-secondary); }
.formula-denominator { padding: 10px 8px 0; }
.formula-suffix { flex-shrink: 0; font-size: 14px; }
.formula-factor-link { max-width: 100%; padding: 0; font: inherit; text-align: inherit; color: inherit; background: transparent; border: 0; border-radius: 3px; cursor: pointer; overflow-wrap: anywhere; transition: background-color .15s, box-shadow .15s; }
.formula-factor-link:disabled { cursor: wait; }
.formula-factor-link:hover:not(:disabled) { background: #f0f2f4; box-shadow: 0 0 0 3px #f0f2f4; }
.formula-factor-link:focus-visible { outline: 2px solid var(--idmp-interactive); outline-offset: 3px; }
.formula-notes { margin: 16px 0 0; color: var(--idmp-text-helper); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.formula-definition .el-alert { margin-top: 8px; }


.policy-card { min-width: 0; }
.section-title.compact { margin-bottom: 12px; }
.section-title h2, .section-title h3 { margin: 0; font-size: 16px; }
.section-title__description { color: var(--idmp-text-helper); font-size: 12px; line-height: 1.6; }
.policy-reference-form { display: grid; grid-template-columns: minmax(0, 1fr) 128px auto; gap: 8px; margin: 12px 0 8px; }
.policy-reference-input { margin-bottom: 8px; }
.version-mapping-links { margin-top: 24px; }
@media (max-width: 640px) {
  .identity-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .formula-definition, .related-scenarios { padding: 14px; }
  .formula-expression { flex-wrap: wrap; gap: 10px; font-size: 14px; }
  .formula-suffix { flex-shrink: 1; }
  .policy-reference-form { grid-template-columns: 1fr; }
}
</style>

<style>
.el-popper.formula-factor-version-tooltip {
  max-width: min(320px, calc(100vw - 32px));
  white-space: pre-line;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
}
</style>
