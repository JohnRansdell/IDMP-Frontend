<template>
  <section class="surface-card association-card" aria-label="指标关联场景">
    <header class="association-header">
      <div><h2>关联场景</h2><p>选择指标的使用场景；关联变更将在场景发布后生效。</p></div>
      <div class="association-toolbar">
        <el-button :disabled="loading || busy" @click="load">刷新</el-button>
        <el-button v-if="published && canManage" type="primary" :disabled="loading || busy || !versionId" @click="openJoin">加入场景</el-button>
      </div>
    </header>
    <el-alert v-if="!published" title="当前指标版本尚未发布，可查看关联；发布指标后再加入场景。" type="info" :closable="false" />
    <el-alert v-if="notice" :title="notice" type="success" :closable="false" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div v-if="loading" class="association-empty" role="status">正在核对正式关联和待发布变更…</div>
    <template v-else>
      <div v-if="!related.length && !error" class="association-empty">尚未关联场景。指标可以独立使用，也可加入业务场景。</div>
      <div v-else class="association-list">
        <article v-for="row in related" :key="row.scenario.id" class="association-row">
          <div class="association-row-main">
            <div class="association-name"><strong>{{ row.scenario.name || '未命名场景' }}</strong><el-tag :type="statusTone(row)" size="small">{{ row.error ? '待核对' : associationLabels[row.status] }}</el-tag></div>
            <p>{{ row.error || stateDescription(row) }}</p>
          </div>
          <div class="association-row-actions">
            <el-button link type="primary" :disabled="busy" @click="open(row)">{{ row.draft ? '查看变更' : '查看场景' }}</el-button>
            <el-button v-if="published && canManage && !row.error" link :type="row.status === 'ACTIVE' ? 'danger' : 'primary'" :disabled="busy" @click="requestChange(row)">{{ actionLabel(row) }}</el-button>
          </div>
        </article>
      </div>
      <p v-if="pendingCount" class="association-footnote">有 {{ pendingCount }} 项待发布变更。请进入对应场景查看完整变更后发布。</p>
    </template>

    <el-dialog v-model="joinOpen" title="加入场景" width="min(680px, calc(100vw - 24px))" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" destroy-on-close>
      <p class="dialog-description">勾选目标场景即可。系统会保存待发布变更，你无需选择草稿版本。</p>
      <el-input v-model="searchText" clearable placeholder="按场景名称搜索" aria-label="搜索场景" :disabled="busy" />
      <el-alert v-if="joinError" :title="joinError" type="error" :closable="false" show-icon />
      <div class="scenario-choices">
        <div v-for="row in filteredChoices" :key="row.scenario.id" class="scenario-choice" :class="{ 'is-unavailable': !!choiceRestriction(row) }">
          <el-checkbox :model-value="selectedScenarioIds.includes(String(row.scenario.id))" :disabled="busy || !!choiceRestriction(row)" :aria-label="`选择${row.scenario.name}`" @update:model-value="selected => selectScenario(row, selected)" />
          <div><div class="choice-title"><strong>{{ row.scenario.name || '未命名场景' }}</strong><el-tag size="small" :type="row.published ? 'success' : 'info'">{{ row.published ? '已发布' : '未发布' }}</el-tag></div><p>{{ choiceRestriction(row) || (row.published ? '确认后保存为待加入，发布场景后生效。' : '加入未发布场景，发布后生效。') }}</p></div>
        </div>
        <div v-if="!filteredChoices.length" class="association-empty">没有匹配的场景</div>
      </div>
      <p class="dialog-description">已有场景变更会保留。加入场景不会自动发布，也不会改变指标公式。</p>
      <template #footer><el-button :disabled="busy" @click="joinOpen = false">取消</el-button><el-button type="primary" :loading="busy" :disabled="!selectedScenarioIds.length || busy" @click="join">确认加入{{ selectedScenarioIds.length ? `（${selectedScenarioIds.length}）` : '' }}</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { canRequest } from '@/idmp/auth/session'
import { getRequestSessionRevision } from '@/idmp/api/request'
import * as scenarioApi from '@/idmp/api/modules/scenarios'
import { associationLabels, changeRestriction, createScenarioAssociationService } from '@/idmp/features/indicator/scenarioAssociations.js'

const props = defineProps({ indicatorId: { type: String, default: '' }, versionId: { type: String, default: '' }, published: Boolean })
const router = useRouter()
const service = createScenarioAssociationService(scenarioApi, canRequest)
const states = ref([]), loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const joinOpen = ref(false), joinError = ref(''), searchText = ref(''), selectedScenarioIds = ref([])
let context = 0, readRevision = 0
const canManage = computed(() => canRequest('PUT', '/scenario-versions/1/indicators'))
const related = computed(() => states.value.filter(row => row.status !== 'NONE' || row.error))
const pendingCount = computed(() => related.value.filter(row => ['ADD', 'REMOVE'].includes(row.status)).length)
const filteredChoices = computed(() => states.value.filter(row => !searchText.value || String(row.scenario.name || '').toLowerCase().includes(searchText.value.toLowerCase())))
function choiceRestriction(row) {
  if (row.status === 'REMOVE') return '已有待移出变更，请在关联列表中撤销移出'
  if (row.status !== 'NONE') return row.status === 'ADD' ? '已在待加入列表中' : '已关联当前指标版本'
  return changeRestriction(row, props.versionId, 'ADD', canRequest)
}
function stateDescription(row) {
  if (row.status === 'REMOVE') return '正式版本仍在使用；发布本次变更后移出。'
  if (row.status === 'ADD') return row.published ? '已保存加入操作，发布场景后生效。' : '已加入未发布场景，尚未正式生效。'
  return row.draft ? '当前正式版本已生效；该场景还有待发布配置。' : '当前正式版本正在使用此指标。'
}
function statusTone(row) { return row.error ? 'danger' : row.status === 'ACTIVE' ? 'success' : 'warning' }
function actionLabel(row) { return row.status === 'ADD' ? '撤销加入' : row.status === 'REMOVE' ? '撤销移出' : '移出场景' }
function open(row) {
  const version = row.draft || row.published
  router.push({ name: 'ScenarioEditor', params: { scenarioId: String(row.scenario.id) }, query: { ...(version ? { versionId: String(version.id) } : {}), tab: 'indicators' } })
}
function assertContext(current, session) {
  if (context !== current || getRequestSessionRevision() !== session) throw new Error('页面或账号已切换，已停止后续操作')
}
async function load() {
  const revision = ++readRevision, current = context, session = getRequestSessionRevision()
  if (!props.indicatorId || !props.versionId) { states.value = []; return }
  loading.value = true; error.value = ''
  try {
    const result = await service.catalog(props.versionId)
    if (revision === readRevision && context === current && session === getRequestSessionRevision()) states.value = result
  } catch (cause) {
    if (revision === readRevision && context === current) { states.value = []; error.value = cause.message || '场景读取失败，请刷新重试' }
  } finally { if (revision === readRevision && context === current) loading.value = false }
}
function openJoin() { selectedScenarioIds.value = []; searchText.value = ''; joinError.value = ''; joinOpen.value = true }
function selectScenario(row, selected) {
  const value = String(row.scenario.id)
  selectedScenarioIds.value = selected ? [...new Set([...selectedScenarioIds.value, value])] : selectedScenarioIds.value.filter(id => id !== value)
}
async function join() {
  if (busy.value || !props.published || !canManage.value || !selectedScenarioIds.value.length) return
  const current = context, session = getRequestSessionRevision(), versionId = props.versionId
  const targets = states.value.filter(row => selectedScenarioIds.value.includes(String(row.scenario.id)))
  if (!targets.length || targets.some(row => choiceRestriction(row))) return
  busy.value = true; joinError.value = ''; error.value = ''; notice.value = ''
  const completed = []
  try {
    for (const row of targets) {
      assertContext(current, session)
      await service.change(row, versionId, 'ADD', () => assertContext(current, session))
      completed.push(String(row.scenario.id))
    }
    assertContext(current, session)
    joinOpen.value = false
    notice.value = `已为 ${completed.length} 个场景保存待加入变更，请查看变更并发布场景。`
  } catch (cause) {
    if (current === context) {
      selectedScenarioIds.value = selectedScenarioIds.value.filter(id => !completed.includes(id))
      joinError.value = `${completed.length ? `已完成 ${completed.length} 项；` : ''}${cause.message}`
    }
  } finally {
    if (current === context) {
      await load()
      if (current === context) {
        selectedScenarioIds.value = selectedScenarioIds.value.filter(id => states.value.some(row => String(row.scenario.id) === id && !choiceRestriction(row)))
        busy.value = false
      }
    }
  }
}
async function requestChange(row) {
  if (busy.value || !props.published || !canManage.value) return
  const action = row.status === 'REMOVE' ? 'ADD' : 'REMOVE'
  const restriction = changeRestriction(row, props.versionId, action, canRequest)
  if (restriction) { error.value = restriction; return }
  const current = context, session = getRequestSessionRevision(), versionId = props.versionId
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const description = row.status === 'ADD' ? '撤销尚未生效的加入操作。' : row.status === 'REMOVE' ? '撤销待移出操作，并恢复正式版本中的关联设置。' : '将保存为待移出变更，发布场景后生效；历史结果保留。'
    await ElMessageBox.confirm(`${actionLabel(row)}「${row.scenario.name}」？${description}场景中其他待发布变更将保留。`, actionLabel(row), { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' })
    assertContext(current, session)
    await service.change(row, versionId, action, () => assertContext(current, session))
    assertContext(current, session)
    notice.value = row.status === 'ACTIVE' ? '已保存待移出变更，发布场景后生效。' : row.status === 'ADD' ? '已撤销待加入操作。' : '已撤销待移出操作。'
  } catch (cause) { if (current === context && cause !== 'cancel' && cause !== 'close') error.value = cause.message || '操作失败，请刷新重试' }
  finally { if (current === context) { await load(); busy.value = false } }
}
watch(() => [props.indicatorId, props.versionId, props.published], () => {
  context++; readRevision++; states.value = []; error.value = ''; notice.value = ''; busy.value = false; joinOpen.value = false; selectedScenarioIds.value = []; void load()
}, { immediate: true })
onBeforeUnmount(() => { context++; readRevision++ })
</script>

<style scoped>
.association-card { min-width:0; padding:20px; }
.association-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
.association-header h2 { margin:0; font-size:16px; line-height:24px; }
.association-header p, .association-row p, .scenario-choice p, .association-footnote, .dialog-description { margin:6px 0 0; color:var(--idmp-text-helper); font-size:13px; line-height:1.7; }
.association-toolbar, .association-row-actions { display:flex; gap:12px; flex-shrink:0; align-items:center; }
.association-toolbar .el-button + .el-button, .association-row-actions .el-button + .el-button { margin-left:0; }
.association-list { border-top:1px solid var(--idmp-border-subtle); }
.association-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 0; border-bottom:1px solid var(--idmp-border-subtle); }
.association-row-main { min-width:0; }
.association-name, .choice-title { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.association-name strong, .choice-title strong { overflow-wrap:anywhere; font-size:14px; font-weight:500; }
.association-empty { padding:20px 0; font-size:13px; color:var(--idmp-text-helper); line-height:1.7; }
.association-card :deep(.el-alert) { margin-bottom:12px; }
.dialog-description { margin:0 0 16px; }
.scenario-choices { max-height:360px; overflow-y:auto; margin:16px 0; border-top:1px solid var(--idmp-border-subtle); }
.scenario-choice { display:flex; gap:12px; padding:16px 4px; align-items:flex-start; border-bottom:1px solid var(--idmp-border-subtle); cursor:pointer; }
.scenario-choice > div { min-width:0; }
.scenario-choice.is-unavailable { cursor:default; }
.scenario-choice.is-unavailable strong { color:var(--idmp-text-helper); }
.scenario-choice :deep(.el-checkbox) { height:24px; }
@media(max-width:640px) {
  .association-card { padding:16px; }
  .association-header, .association-row { align-items:stretch; flex-direction:column; }
  .association-toolbar, .association-row-actions { justify-content:flex-end; }
}
</style>
