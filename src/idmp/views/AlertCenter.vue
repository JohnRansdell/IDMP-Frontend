<template>
  <div class="idmp-page alert-center">
    <div class="alert-center__canvas">
    <PageHeader title="预警中心" status-label="真实接口" status-tone="success">
      <template #meta><span class="data-source-badge is-live">预警规则、事件与站内通知</span></template>
      <template #actions><el-button :icon="Refresh" :loading="loading" @click="refreshCurrent">刷新</el-button><el-button v-access="['POST', '/analysis/warning-rules']" v-if="activeTab === 'rules'" type="primary" :icon="Plus" @click="openCreateRule">创建预警规则</el-button></template>
    </PageHeader>

    <el-tabs v-model="activeTab" @tab-change="refreshCurrent">
      <el-tab-pane label="预警事件" name="events">
        <section class="surface-card filter-card">
          <el-form :model="eventFilters" inline @submit.prevent="loadEvents">
            <el-form-item label="规则 ID"><el-input v-model.trim="eventFilters.ruleId" /></el-form-item>
            <el-form-item label="指标版本"><el-select v-model="eventFilters.indicatorVersionId" class="indicator-filter" clearable filterable allow-create><el-option v-for="item in indicatorVersions" :key="item.id" :label="indicatorLabel(item)" :value="item.id" /></el-select></el-form-item>
            <el-form-item label="状态"><el-select v-model="eventFilters.status" aria-label="事件状态" clearable><el-option v-for="item in WARNING_EVENT_STATUSES" :key="item" :label="warningLabel(item)" :value="item" /></el-select></el-form-item>
            <el-form-item label="级别"><el-select v-model="eventFilters.severity" aria-label="事件级别" clearable><el-option v-for="item in WARNING_SEVERITIES" :key="item" :label="warningLabel(item)" :value="item" /></el-select></el-form-item>
            <el-form-item><el-button type="primary" native-type="submit">查询</el-button><el-button @click="resetEventFilters">重置</el-button></el-form-item>
          </el-form>
        </section>
        <section class="surface-card table-card">
          <div class="table-heading"><h2>预警事件</h2></div>
          <StatePanel v-if="eventError" type="error" title="预警事件读取失败" :description="eventError" />
          <StatePanel v-else-if="!eventLoading && !events.length" type="empty" title="暂无匹配的预警事件" />
          <el-table v-else v-loading="eventLoading" :data="eventRows" table-layout="fixed" data-testid="warning-events-table">
            <el-table-column label="级别" width="80"><template #default="{ row }"><StatusBadge :label="warningLabel(row.severity)" :tone="severityTone(row.severity)" /></template></el-table-column>
            <el-table-column label="类型" width="110"><template #default="{ row }">{{ warningLabel(row.warningType) }}</template></el-table-column>
            <el-table-column label="当前值" width="130"><template #default="{ row }"><strong class="event-current-value">{{ displayValue(row.actualValue) }}</strong></template></el-table-column>
            <el-table-column label="触发结果" min-width="340"><template #default="{ row }">
              <div class="event-result-summary">
                <div><span>规则结果范围：</span>{{ row.summary.scope.rule }}</div>
                <div><span>本次触发结果：</span>{{ row.summary.scope.result }}</div>
                <div v-for="item in row.summary.dimensions" :key="item.field"><span>{{ item.label }}：</span>{{ item.value }}</div>
                <div><span>结果统计周期：</span>{{ row.summary.period }}</div>
              </div>
            </template></el-table-column>
            <el-table-column label="触发条件" min-width="260"><template #default="{ row }"><span class="event-condition">{{ row.summary.condition }}</span></template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><StatusBadge :status="row.status" :label="warningLabel(row.status)" /></template></el-table-column>
            <el-table-column label="触发时间" min-width="180"><template #default="{ row }"><span class="mono-data">{{ row.triggerTime?.replace('T', ' ') || '-' }}</span></template></el-table-column>
            <el-table-column label="操作" width="180" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="navigateToEvent(row.id)">详情</el-button><el-button v-access="['POST', '/analysis/warnings/1/acknowledge']" v-if="row.status === 'OPEN'" link type="primary" @click="acknowledgeEvent(row)">确认</el-button><el-button v-access="['POST', '/analysis/warnings/1/close']" v-if="row.status !== 'CLOSED'" link type="danger" @click="closeEvent(row)">关闭</el-button></template></el-table-column>
          </el-table>
          <p v-if="eventDictionaryError" class="event-dictionary-note" role="status">{{ eventDictionaryError }}</p>
          <div class="table-footer"><span>共 {{ eventTotal }} 条</span><el-pagination v-model:current-page="eventPage" v-model:page-size="eventSize" layout="prev, pager, next, sizes" :page-sizes="[6,9,12]" :total="eventTotal" @current-change="loadEvents" @size-change="loadEvents" /></div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="预警规则" name="rules">
        <section class="surface-card filter-card">
          <el-form :model="ruleFilters" inline @submit.prevent="loadRules">
            <el-form-item label="编码"><el-input v-model.trim="ruleFilters.code" /></el-form-item>
            <el-form-item label="名称"><el-input v-model.trim="ruleFilters.name" /></el-form-item>
            <el-form-item label="是否启用"><el-select v-model="ruleFilters.enableStatus" aria-label="规则是否启用" clearable><el-option label="已启用" value="ENABLED" /><el-option label="未启用" value="DISABLED" /></el-select></el-form-item>
            <el-form-item label="发布状态"><el-select v-model="ruleFilters.publicationStatus" aria-label="规则发布状态" clearable><el-option label="未发布" value="DRAFT" /><el-option label="已发布" value="PUBLISHED" /></el-select></el-form-item>
            <el-form-item><el-button type="primary" native-type="submit">查询</el-button><el-button @click="resetRuleFilters">重置</el-button></el-form-item>
          </el-form>
        </section>
<section class="surface-card table-card"><div class="table-heading"><div><h2>预警规则</h2><p>规则须先发布再启用；仅后续激活的、周期类型匹配的正式结果参与评估。</p></div></div><StatePanel v-if="ruleError" type="error" title="预警规则读取失败" :description="ruleError" /><StatePanel v-else-if="!ruleLoading && !rules.length" type="empty" title="暂无预警规则" description="可创建一条草稿规则，再发布并启用。" /><el-table v-else v-loading="ruleLoading" :data="rules" table-layout="fixed"><el-table-column prop="name" label="名称" min-width="280"><template #default="{ row }"><CodeTooltip :code="row.code" label="预警规则编码"><span>{{ row.name }}</span></CodeTooltip></template></el-table-column><el-table-column label="规则类型" width="135"><template #default="{ row }">{{ warningLabel(row.version?.warningType) }}</template></el-table-column><el-table-column label="指标版本" min-width="145"><template #default="{ row }"><span class="mono-data">{{ row.version?.indicatorVersionId || '-' }}</span></template></el-table-column><el-table-column label="发布状态" width="110"><template #default="{ row }"><StatusBadge :status="row.version?.publicationStatus" :label="warningLabel(row.version?.publicationStatus)" /></template></el-table-column><el-table-column label="是否启用" width="110"><template #default="{ row }"><StatusBadge :status="row.enableStatus" :label="warningLabel(row.enableStatus)" /></template></el-table-column><el-table-column label="操作" width="300" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openRule(row)">详情</el-button><el-button v-access="['PATCH', '/analysis/warning-rule-versions/1']" v-if="ruleCapabilities(row).canEdit" link type="primary" @click="openEditRule(row)">编辑草稿</el-button><el-button v-access="['POST', '/analysis/warning-rule-versions/1/publish']" v-if="ruleCapabilities(row).canPublish" link type="success" @click="publishRule(row)">发布</el-button><el-button v-access="['POST', '/analysis/warning-rules/1/enable']" v-if="ruleCapabilities(row).canEnable" link type="success" @click="toggleRule(row, true)">启用</el-button><el-button v-access="['POST', '/analysis/warning-rules/1/disable']" v-if="ruleCapabilities(row).canDisable" link type="warning" @click="toggleRule(row, false)">停用</el-button></template></el-table-column></el-table><div class="table-footer"><span>共 {{ ruleTotal }} 条</span><el-pagination v-model:current-page="rulePage" v-model:page-size="ruleSize" layout="prev, pager, next, sizes" :page-sizes="[10,20,50]" :total="ruleTotal" @current-change="loadRules" @size-change="loadRules" /></div></section>
      </el-tab-pane>

      <el-tab-pane v-if="$can('GET', '/me/notifications')" label="站内通知" name="notifications">
        <section class="surface-card table-card"><div class="table-heading"><div><h2>当前用户站内通知</h2><p>阅读通知不改变对应预警事件的确认或关闭状态。</p></div><el-button :disabled="!notifications.some(item => item.notificationStatus === 'UNREAD')" @click="readAllNotifications">全部已读</el-button></div><StatePanel v-if="notificationError" type="error" title="站内通知读取失败" :description="notificationError" /><StatePanel v-else-if="!notificationLoading && !notifications.length" type="empty" title="暂无有效站内通知" /><el-table v-else v-loading="notificationLoading" :data="notifications" table-layout="fixed"><el-table-column prop="title" label="标题" min-width="150" /><el-table-column prop="content" label="内容" min-width="360" :show-overflow-tooltip="{ popperClass: 'notification-content-tooltip' }" /><el-table-column label="状态" width="100"><template #default="{ row }"><StatusBadge :status="row.notificationStatus" :label="row.notificationStatus === 'UNREAD' ? '未读' : '已读'" /></template></el-table-column><el-table-column prop="createdAt" label="时间" min-width="170" /><el-table-column label="操作" width="160"><template #default="{ row }"><el-button v-if="row.businessRefType === 'WARNING_EVENT'" link type="primary" @click="navigateToEvent(row.businessRefId)">查看预警</el-button><el-button v-if="row.notificationStatus === 'UNREAD'" link type="primary" @click="readNotification(row)">标记已读</el-button></template></el-table-column></el-table></section>
      </el-tab-pane>
    </el-tabs>
    </div>

<el-dialog class="warning-rule-dialog" v-model="ruleDialogOpen" :title="editingRule ? '预警规则' : '创建预警规则'" width="min(960px, 96vw)" destroy-on-close><el-alert type="info" :closable="false" show-icon title="指标预警当前只支持 IN_APP 站内通知；规则必须先发布，再启用。" /><div v-if="editingRule" class="rule-workflow"><div><span>当前流程</span><strong>{{ ruleWorkflowText(editingRule) }}</strong></div><p>{{ ruleWorkflowHint(editingRule) }}</p></div><el-form label-position="top" class="rule-form" :class="{ 'is-readonly': editingRule?.readOnly }"><div class="form-grid"><el-form-item label="规则编码" required><el-input v-model.trim="ruleForm.code" :disabled="Boolean(editingRule)" /></el-form-item><el-form-item label="规则名称" required><el-input v-model.trim="ruleForm.name" :disabled="Boolean(editingRule)" /></el-form-item><el-form-item label="预警类型" required><el-select v-model="ruleForm.warningType" :disabled="editingRule?.readOnly"><el-option v-for="item in WARNING_TYPES" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item><el-form-item label="严重程度" required><el-select v-model="ruleForm.severity" :disabled="editingRule?.readOnly"><el-option v-for="item in WARNING_SEVERITIES" :key="item" :label="warningLabel(item)" :value="item" /></el-select></el-form-item><el-form-item label="已发布指标版本" required><el-select v-model="ruleForm.indicatorVersionId" filterable allow-create default-first-option :disabled="Boolean(editingRule)"><el-option v-for="item in indicatorVersions" :key="item.id" :label="indicatorLabel(item)" :value="item.id" /></el-select></el-form-item><el-form-item label="统计周期" required><el-select v-model="ruleForm.periodType" :disabled="editingRule?.readOnly"><el-option v-for="item in WARNING_PERIOD_TYPES" :key="item" :label="warningLabel(item)" :value="item" /></el-select></el-form-item><el-form-item label="生效开始日期"><el-date-picker v-model="ruleForm.effectiveStartDate" type="date" value-format="YYYY-MM-DD" :disabled="editingRule?.readOnly" /></el-form-item><el-form-item label="生效结束日期"><el-date-picker v-model="ruleForm.effectiveEndDate" type="date" value-format="YYYY-MM-DD" :disabled="editingRule?.readOnly" /></el-form-item></div><el-form-item label="说明"><el-input v-model="ruleForm.description" type="textarea" :rows="2" :disabled="Boolean(editingRule)" /></el-form-item><WarningRuleConditions v-model:condition="ruleForm.conditionTree" v-model:scope="ruleForm.resultScope" :indicator-version-id="ruleForm.indicatorVersionId" :warning-type="ruleForm.warningType" :disabled="editingRule?.readOnly" /><section class="rule-section"><h3>站内通知</h3><el-form-item label="接收用户" required><el-alert v-if="editingRule?.version?.notificationPolicy?.unavailableRecipientCount" type="warning" :closable="false" title="原接收用户中有账号已不可用，请核对并重新选择接收用户。" /><el-select v-model="ruleForm.recipientUsernames" multiple filterable :loading="usersLoading" :disabled="editingRule?.readOnly"><el-option v-for="user in users" :key="user.username" :label="userLabel(user)" :value="user.username" /></el-select></el-form-item></section></el-form><template #footer><el-button @click="ruleDialogOpen = false">关闭</el-button><el-button v-access="['POST', '/analysis/warning-rules']" v-if="!editingRule || dialogRuleCapabilities.canEdit" :loading="mutating" @click="saveRule">{{ editingRule ? '保存草稿' : '创建草稿' }}</el-button><el-button v-access="['POST', '/analysis/warning-rule-versions/1/publish']" v-if="dialogRuleCapabilities.canPublish" type="primary" :loading="mutating" @click="publishRule(editingRule)">发布规则</el-button><el-button v-access="['POST', '/analysis/warning-rules/1/enable']" v-if="dialogRuleCapabilities.canEnable" type="success" :loading="mutating" @click="toggleRule(editingRule, true)">启用规则</el-button><el-button v-access="['POST', '/analysis/warning-rules/1/disable']" v-if="dialogRuleCapabilities.canDisable" type="warning" :loading="mutating" @click="toggleRule(editingRule, false)">停用规则</el-button></template></el-dialog>

    <el-dialog class="warning-event-dialog" v-model="eventDialogOpen" title="预警事件详情" width="min(820px, 96vw)" destroy-on-close>
      <StatePanel v-if="eventDetailLoading" type="loading" title="正在读取预警事件" />
      <StatePanel v-else-if="eventDetailError" type="error" title="预警详情读取失败" :description="eventDetailError" />
      <template v-else-if="eventDetail">
        <WarningEventSummary :event="eventDetail" />
        <section class="event-deliveries"><h3>站内投递记录</h3>
          <StatePanel v-if="deliveriesLoading" type="loading" title="正在读取投递记录" />
          <StatePanel v-else-if="deliveriesError" type="error" title="投递记录读取失败" :description="deliveriesError" />
          <el-table v-else :data="deliveries" size="small" empty-text="暂无投递记录"><el-table-column prop="channel" label="渠道" width="100" /><el-table-column prop="recipient" label="接收人" min-width="120" /><el-table-column prop="status" label="状态" width="100" /><el-table-column prop="attemptCount" label="尝试次数" width="100" /><el-table-column prop="lastError" label="最近错误" min-width="160" /></el-table>
        </section>
      </template>
      <template #footer><el-button v-access="['POST', '/analysis/results/1/drill/search']" v-if="eventDetail?.indicatorResultId" @click="openResultDrill(eventDetail)">查看结果下钻</el-button><el-button @click="eventDialogOpen = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { canRequest } from '@/idmp/auth/session'
import { computed, onActivated, onDeactivated, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { Plus, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import CodeTooltip from '@/idmp/components/CodeTooltip.vue'
import WarningRuleConditions from '@/idmp/components/WarningRuleConditions.vue'
import WarningEventSummary from '@/idmp/components/WarningEventSummary.vue'
import { fetchDepartmentNames } from '@/idmp/api/modules/departments.js'
import { isDepartmentCodeField } from '@/idmp/features/shared/departmentDictionary.js'
import { warningEventCondition, warningEventDimensions, warningEventPeriod, warningEventScope } from '@/idmp/features/warnings/eventDetail.js'
import { notifyNotificationsRead } from '@/idmp/layout/shellState.js'
import { fetchAllIndicatorVersions } from '@/idmp/api/modules/indicators'
import { acknowledgeWarningEvent, closeWarningEvent, createWarningRule, disableWarningRule, enableWarningRule, fetchNotifications, fetchWarningDeliveries, fetchWarningEvent, fetchWarningRule, fetchWarningRules, fetchWarnings, fetchWarningRecipients, markAllNotificationsRead, markNotificationRead, publishWarningRuleVersion, updateWarningRuleVersion } from '@/idmp/api/modules/warnings'
import { WARNING_EVENT_STATUSES, WARNING_PERIOD_TYPES, WARNING_SEVERITIES, WARNING_TYPES, buildWarningRulePayload, normalizePage, normalizeWarningRule, validateWarningRuleForm, warningLabel, warningRuleCapabilities, warningRecipientLabel } from '@/idmp/api/adapters/warning'

const router = useRouter()
const route = useRoute()
const activeTab = ref('events')
const loading = computed(() => eventLoading.value || ruleLoading.value || notificationLoading.value)
const mutating = ref(false)
const eventLoading = ref(false); const ruleLoading = ref(false); const notificationLoading = ref(false)
const eventError = ref(''); const ruleError = ref(''); const notificationError = ref('')
const events = ref([]); const rules = ref([]); const notifications = ref([])
const departmentNames = ref(new Map())
const eventDictionaryError = ref('')
const eventRows = computed(() => events.value.map(event => ({ ...event, summary: {
  scope: warningEventScope(event), dimensions: warningEventDimensions(event, departmentNames.value),
  period: warningEventPeriod(event), condition: warningEventCondition(event)
} })))
let dictionaryGeneration = 0
watch(events, async records => {
  const generation = ++dictionaryGeneration
  eventDictionaryError.value = ''
  if (!records.some(event => warningEventDimensions(event).some(item => isDepartmentCodeField(item.field)))) return
  try {
    const names = await fetchDepartmentNames()
    if (generation === dictionaryGeneration) departmentNames.value = names
  } catch {
    if (generation === dictionaryGeneration) eventDictionaryError.value = '科室字典暂不可用，已保留事件中的原始维度取值。'
  }
})
const eventTotal = ref(0); const ruleTotal = ref(0)
const eventPage = ref(1); const eventSize = ref(9); const rulePage = ref(1); const ruleSize = ref(20)
const indicatorVersions = ref([]); const users = ref([]); const usersLoading = ref(false)
const eventFilters = reactive({ ruleId: '', indicatorVersionId: '', status: '', severity: '' })
const ruleFilters = reactive({ code: '', name: '', enableStatus: '', publicationStatus: '' })
const ruleDialogOpen = ref(false); const editingRule = ref(null)
const dialogRuleCapabilities = computed(() => editingRule.value ? ruleCapabilities(editingRule.value) : {})
const eventDialogOpen = ref(false); const eventDetail = ref(null); const eventDetailLoading = ref(false); const eventDetailError = ref(''); const deliveries = ref([]); const deliveriesLoading = ref(false)
const deliveriesError = ref('')
const ruleForm = reactive(emptyRuleForm())

function emptyRuleForm() { return { code: '', name: '', description: '', warningType: 'THRESHOLD', indicatorVersionId: '', periodType: 'MONTHLY', conditionTree: { operator: 'GT', threshold: '', measure: 'DELTA', windowSize: 3 }, resultScope: { mode: 'MAIN', dimensions: [], members: {} }, operator: 'GT', threshold: '', measure: 'DELTA', windowSize: 2, recipientUsernames: [], severity: 'MEDIUM', effectiveStartDate: '', effectiveEndDate: '' } }
function normalizeList(payload) { return Array.isArray(payload) ? payload : payload?.records || payload?.items || payload?.list || [] }
function opaqueId(value) { return value === undefined || value === null || value === '' ? '' : String(value) }
function indicatorLabel(item) { return `${item.indicatorName || item.name || item.indicatorCode || item.code || '未命名指标'} · ${item.id}` }
function userLabel(user) { return warningRecipientLabel(user) }
function displayValue(value) { return value === undefined || value === null || value === '' ? '-' : String(value) }
function severityTone(value) { return ({ CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'info', INFO: 'neutral' })[String(value).toUpperCase()] || 'neutral' }
function ruleCapabilities(rule) { return warningRuleCapabilities(rule) }
function ruleWorkflowText(rule) { const capabilities = ruleCapabilities(rule); if (capabilities.canPublish) return '① 草稿已保存 → ② 发布规则 → ③ 启用规则'; if (capabilities.canEnable) return '① 草稿已保存 → ② 已发布 → ③ 启用规则'; if (capabilities.canDisable) return '① 草稿已保存 → ② 已发布 → ③ 已启用'; return `当前状态：${warningLabel(rule.version?.publicationStatus)} / ${warningLabel(rule.enableStatus)}` }
function ruleWorkflowHint(rule) { const capabilities = ruleCapabilities(rule); if (capabilities.canPublish) return '发布用于冻结并校验当前规则定义；发布成功后仍不会触发预警，还需要继续启用。'; if (capabilities.canEnable) return '规则定义已经发布。点击“启用规则”后，后续新激活且范围匹配的正式结果才会参与评估。'; if (capabilities.canDisable) return '规则正在运行，只评估启用之后新激活且周期、有效期匹配的正式结果。'; return '请根据当前状态完成下一步操作。' }

async function bootstrap() { await Promise.all([loadEvents(), loadRules(), loadIndicatorVersions(), loadUsers()]) }
async function loadIndicatorVersions() {
  try { indicatorVersions.value = normalizeList(await fetchAllIndicatorVersions({ publicationStatus: 'PUBLISHED', size: 200 })).map(item => ({ ...item, id: opaqueId(item.id || item.versionId || item.indicatorVersionId) })).filter(item => item.id) }
  catch (error) { ElMessage.warning(error?.message || '已发布指标版本加载失败；可手工输入版本 ID') }
}
async function loadUsers() {
  if (!canRequest('GET', '/analysis/warning-rules/recipient-options')) return
  usersLoading.value = true
  try { users.value = normalizeList(await fetchWarningRecipients()).filter(item => item.username) }
  catch (error) { ElMessage.warning(error?.message || '接收用户列表加载失败，请稍后重试') }
  finally { usersLoading.value = false }
}
async function loadEvents() {
  eventLoading.value = true; eventError.value = ''
  try {
    const page = normalizePage(await fetchWarnings({ ...eventFilters, page: eventPage.value, size: eventSize.value }))
    events.value = page.records; eventTotal.value = page.total
  } catch (error) { events.value = []; eventTotal.value = 0; eventError.value = error?.message || '无法读取预警事件' }
  finally { eventLoading.value = false }
}
async function loadRules() {
  ruleLoading.value = true; ruleError.value = ''
  try {
    const page = normalizePage(await fetchWarningRules({ ...ruleFilters, page: rulePage.value, size: ruleSize.value }))
    rules.value = page.records.map(normalizeWarningRule); ruleTotal.value = page.total
  } catch (error) { rules.value = []; ruleTotal.value = 0; ruleError.value = error?.message || '无法读取预警规则' }
  finally { ruleLoading.value = false }
}
async function loadNotifications() {
  notificationLoading.value = true; notificationError.value = ''
  try { notifications.value = normalizePage(await fetchNotifications({ page: 1, size: 100 })).records }
  catch (error) { notifications.value = []; notificationError.value = error?.message || '无法读取站内通知' }
  finally { notificationLoading.value = false }
}
function refreshCurrent() { if (activeTab.value === 'rules') return loadRules(); if (activeTab.value === 'notifications') return loadNotifications(); return loadEvents() }
function resetEventFilters() { Object.assign(eventFilters, { ruleId: '', indicatorVersionId: '', status: '', severity: '' }); eventPage.value = 1; loadEvents() }
function resetRuleFilters() { Object.assign(ruleFilters, { code: '', name: '', enableStatus: '', publicationStatus: '' }); rulePage.value = 1; loadRules() }

function openCreateRule() { editingRule.value = null; Object.assign(ruleForm, emptyRuleForm()); ruleDialogOpen.value = true }
async function openRule(rule) { try { const detail = normalizeWarningRule(await fetchWarningRule(rule.id)); openEditRule(detail, true) } catch (error) { ElMessage.error(error?.message || '预警规则详情读取失败') } }
function openEditRule(sourceRule, readOnly = false) { const rule = normalizeWarningRule(sourceRule); const version = rule.version || {}; editingRule.value = readOnly ? { ...rule, readOnly: true } : rule; Object.assign(ruleForm, { ...emptyRuleForm(), code: rule.code || '', name: rule.name || '', description: rule.description || '', warningType: version.warningType || 'THRESHOLD', indicatorVersionId: opaqueId(version.indicatorVersionId), periodType: version.periodType || 'MONTHLY', conditionTree: JSON.parse(JSON.stringify(version.condition || { operator: 'GT', threshold: '' })), resultScope: JSON.parse(JSON.stringify(version.scopePolicy?.resultScope || { mode: 'ALL', dimensions: [], members: {} })), operator: version.condition?.operator || 'GT', threshold: version.condition?.threshold ?? '', measure: version.condition?.measure || 'DELTA', windowSize: version.condition?.windowSize ?? 2, recipientUsernames: (version.notificationPolicy?.recipientUsernames || []).map(String), severity: version.severity || 'MEDIUM', effectiveStartDate: version.effectiveStartDate || '', effectiveEndDate: version.effectiveEndDate || '' }); ruleDialogOpen.value = true }
async function saveRule() { if (editingRule.value?.readOnly) return ElMessage.info('当前规则已发布，仅供查看；如需调整，请创建新的草稿规则'); const validation = validateWarningRuleForm(ruleForm); if (validation) return ElMessage.warning(validation); mutating.value = true; try { const payload = buildWarningRulePayload(ruleForm); if (editingRule.value) { if (!ruleCapabilities(editingRule.value).canEdit) throw new Error('当前规则不是可编辑草稿'); const versionId = opaqueId(editingRule.value.version?.id || editingRule.value.version?.versionId); const result = await updateWarningRuleVersion(versionId, { resourceVersion: editingRule.value.version?.resourceVersion ?? editingRule.value.resourceVersion, ...stripRuleIdentity(payload) }); ElMessage.success('预警规则草稿已保存'); ruleDialogOpen.value = false; await loadRules(); openEditRule(result) } else { const result = await createWarningRule(payload); ElMessage.success('预警规则草稿已创建，请继续发布并启用'); ruleDialogOpen.value = false; await loadRules(); openEditRule(result) } } catch (error) { ElMessage.error(error?.message || '预警规则保存失败') } finally { mutating.value = false } }
function stripRuleIdentity(payload) { const { code, name, description, ...definition } = payload; return definition }
async function publishRule(sourceRule) { const rule = normalizeWarningRule(sourceRule); const versionId = opaqueId(rule.version?.id || rule.version?.versionId); if (!versionId) return ElMessage.error('规则未返回草稿版本 ID'); try { await ElMessageBox.confirm('发布会冻结并校验当前草稿定义；发布成功后还需要启用，确认发布？', '发布预警规则', { type: 'warning', confirmButtonText: '发布规则', cancelButtonText: '取消' }) } catch { return } const result = await mutateRule(() => publishWarningRuleVersion(versionId, rule.version?.resourceVersion ?? rule.resourceVersion), '预警规则已发布，请继续启用'); syncDialogRule(rule, result, true) }
async function toggleRule(sourceRule, enable) { const rule = normalizeWarningRule(sourceRule); if (enable) { try { await ElMessageBox.confirm('启用后，后续新激活且范围匹配的正式结果会参与预警评估，确认启用？', '启用预警规则', { type: 'warning', confirmButtonText: '启用规则', cancelButtonText: '取消' }) } catch { return } } const result = await mutateRule(() => enable ? enableWarningRule(rule.id, rule.resourceVersion) : disableWarningRule(rule.id, rule.resourceVersion), enable ? '预警规则已启用' : '预警规则已停用'); syncDialogRule(rule, result, true) }
async function mutateRule(action, message) { mutating.value = true; try { const result = await action(); ElMessage.success(message); await loadRules(); return result } catch (error) { ElMessage.error(error?.status === 409 ? '规则已被其他操作修改，请刷新后重试' : error?.message || '规则操作失败'); return null } finally { mutating.value = false } }
function syncDialogRule(previous, result, readOnly) { if (!result || !ruleDialogOpen.value || opaqueId(editingRule.value?.id) !== opaqueId(previous.id)) return; const prior = normalizeWarningRule(previous); const next = normalizeWarningRule(result); openEditRule({ ...prior, ...next, version: { ...prior.version, ...next.version } }, readOnly) }

let eventDetailGeneration = 0
function navigateToEvent(eventId) {
  const id = String(eventId ?? '')
  if (!/^[1-9]\d*$/.test(id)) return
  activeTab.value = 'events'
  if (String(route.query.eventId || '') === id) void openEvent(id)
  else void router.push({ name: 'AlertCenter', query: { ...route.query, eventId: id } })
}
async function openEvent(eventId) {
  const generation = ++eventDetailGeneration
  eventDialogOpen.value = true
  eventDetail.value = null
  deliveries.value = []
  deliveriesError.value = ''
  eventDetailError.value = ''
  eventDetailLoading.value = true
  try {
    const detail = await fetchWarningEvent(eventId)
    if (generation !== eventDetailGeneration) return
    eventDetail.value = detail
    eventDetailLoading.value = false
    deliveriesLoading.value = true
    try {
      const page = normalizePage(await fetchWarningDeliveries(eventId, { page: 1, size: 100 }))
      if (generation !== eventDetailGeneration) return
      deliveries.value = page.records
    } catch (error) {
      if (generation === eventDetailGeneration) deliveriesError.value = error?.message || '无法读取投递记录'
    }
  } catch (error) {
    if (generation === eventDetailGeneration) eventDetailError.value = error?.message || '无法读取预警详情'
  } finally {
    if (generation === eventDetailGeneration) {
      eventDetailLoading.value = false
      deliveriesLoading.value = false
    }
  }
}
async function acknowledgeEvent(event) { try { await ElMessageBox.confirm('确认该预警事件已被知悉？此操作不会关闭事件。', '确认预警', { type: 'warning' }); await acknowledgeWarningEvent(event.id); ElMessage.success('预警已确认'); await loadEvents(); if (eventDetail.value?.id === event.id) await openEvent(event.id) } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '确认预警失败') } }
async function closeEvent(event) { try { const { value } = await ElMessageBox.prompt('请填写关闭原因编码，例如 DATA_CONFIRMED。', '关闭预警', { inputPattern: /\S+/, inputErrorMessage: '关闭原因不能为空', confirmButtonText: '关闭事件', cancelButtonText: '取消' }); await closeWarningEvent(event.id, value.trim()); ElMessage.success('预警已关闭'); await loadEvents(); if (eventDetail.value?.id === event.id) await openEvent(event.id) } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.message || '关闭预警失败') } }
function openResultDrill(event) { eventDialogOpen.value = false; router.push({ path: '/analysis/drill', query: { resultId: opaqueId(event.indicatorResultId), source: 'live' } }) }
async function readNotification(notification) { try { await markNotificationRead(notification.id); notifyNotificationsRead(); await loadNotifications() } catch (error) { ElMessage.error(error?.message || '标记已读失败') } }
async function readAllNotifications() { try { await markAllNotificationsRead(); notifyNotificationsRead(); ElMessage.success('当前有效通知已全部标记为已读'); await loadNotifications() } catch (error) { ElMessage.error(error?.message || '全部已读失败') } }

watch(activeTab, (tab) => { if (tab === 'notifications' && !notifications.value.length) void loadNotifications() })
watch([() => route.name, () => route.query.eventId], ([name, rawEventId]) => {
  if (name !== 'AlertCenter') return
  const eventId = typeof rawEventId === 'string' && /^[1-9]\d*$/.test(rawEventId) ? rawEventId : ''
  if (!eventId) { eventDialogOpen.value = false; return }
  activeTab.value = 'events'
  void openEvent(eventId)
}, { immediate: true })
watch(eventDialogOpen, open => {
  if (open) return
  eventDetailGeneration += 1
  if (route.name === 'AlertCenter' && route.query.eventId) void router.replace({ name: 'AlertCenter', query: { ...route.query, eventId: undefined } })
})
let deactivatedAt = 0
onDeactivated(() => { deactivatedAt = Date.now() })
onActivated(() => {
  if (!deactivatedAt) return
  if (Date.now() - deactivatedAt > 10_000) void refreshCurrent()
  deactivatedAt = 0
})
onMounted(bootstrap)
</script>

<style scoped lang="scss">
.event-result-summary { font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.event-result-summary span { color: var(--idmp-text-helper); }
.event-current-value { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.event-condition { line-height: 1.7; overflow-wrap: anywhere; }
.event-dictionary-note { margin: 12px 16px; color: var(--idmp-text-helper); font-size: 12px; }
:global(.warning-event-dialog) { max-height: calc(100dvh - 48px); margin: 24px auto; display: flex; flex-direction: column; }
:global(.warning-event-dialog .el-dialog__body) { min-height: 0; overflow-y: auto; }
:global(.warning-event-dialog .el-dialog__header), :global(.warning-event-dialog .el-dialog__footer) { flex-shrink: 0; }
.event-deliveries { margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--idmp-border-subtle); }
.event-deliveries h3 { margin: 0 0 12px; font-size: 14px; }
:global(.warning-rule-dialog) { max-height: calc(100dvh - 48px); margin: 24px auto; display: flex; flex-direction: column; }
:global(.warning-rule-dialog .el-dialog__body) { overflow-y: auto; min-height: 0; }
:global(.warning-rule-dialog .el-dialog__header), :global(.warning-rule-dialog .el-dialog__footer) { flex-shrink: 0; }
:global(.notification-content-tooltip.el-popper) {
  box-sizing: border-box;
  max-width: min(420px, calc(100vw - 32px));
  max-height: min(320px, 50vh);
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.alert-center { height: calc(100vh - var(--idmp-topbar-height) - 56px); min-height: 0; padding-right: 8px; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; scrollbar-color: var(--idmp-border-strong) transparent; scrollbar-width: thin; }
.alert-center__canvas { min-width: 0; padding-bottom: 8px; }
.alert-center::-webkit-scrollbar { width: 8px; }.alert-center::-webkit-scrollbar-track { background: transparent; }.alert-center::-webkit-scrollbar-thumb { border-radius: 999px; background: var(--idmp-border-strong); }.alert-center::-webkit-scrollbar-thumb:hover { background: var(--idmp-text-helper); }
.alert-center :deep(.el-tabs__header) { position: sticky; top: 0; z-index: 8; margin-bottom: 16px; padding-top: 4px; background: var(--idmp-background); }
.filter-card :deep(.el-form-item) { flex: 0 0 auto; }
.filter-card :deep(.el-select) { flex: 0 0 160px; width: 160px; min-width: 160px; }
.filter-card :deep(.indicator-filter) { flex-basis: 280px; width: 280px; }
.filter-card { margin-bottom: 16px; }.table-card { min-width: 0; padding: 0; overflow: hidden; }.table-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px; border-bottom: 1px solid var(--idmp-border-subtle); }.table-heading h2, .rule-section h3 { margin: 0; font-size: 16px; }.table-heading p { margin: 5px 0 0; color: var(--idmp-text-helper); font-size: 12px; }.table-footer { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; }.el-table { padding: 0 16px; }.el-table small { display: block; color: var(--idmp-text-helper); }.rule-form { margin-top: 16px; }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }.rule-section { margin-top: 18px; padding: 16px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-md); }.rule-section h3 { margin-bottom: 14px; }.rule-scope-note { margin: 0; color: var(--idmp-text-helper); font-size: 13px; line-height: 1.6; }.rule-section pre { max-height: 240px; overflow: auto; margin: 0; padding: 12px; border-radius: var(--idmp-radius-sm); background: var(--idmp-layer-02); white-space: pre-wrap; word-break: break-word; }.rule-section :deep(.el-select) { width: 100%; }.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }.detail-grid div { padding: 10px; border: 1px solid var(--idmp-border-subtle); border-radius: var(--idmp-radius-sm); }.detail-grid dt { color: var(--idmp-text-helper); font-size: 12px; }.detail-grid dd { margin: 6px 0 0; word-break: break-word; } @media (max-width: 760px) { .alert-center { height: auto; min-height: calc(100vh - var(--idmp-topbar-height) - 56px); padding-right: 0; }.alert-center :deep(.el-tabs__header) { position: static; }.form-grid, .detail-grid { grid-template-columns: 1fr; }.table-footer, .table-heading { align-items: flex-start; flex-direction: column; } }
.rule-workflow { margin-top: 14px; padding: 12px 14px; border: 1px solid var(--el-color-primary-light-7); border-radius: var(--idmp-radius-md); background: var(--el-color-primary-light-9); }.rule-workflow div { display: flex; align-items: center; gap: 12px; }.rule-workflow span { color: var(--idmp-text-helper); font-size: 12px; }.rule-workflow strong { color: var(--el-color-primary); }.rule-workflow p { margin: 7px 0 0; color: var(--idmp-text-secondary); font-size: 13px; line-height: 1.6; }
.table-card { overflow-x: auto; }
.table-card > .el-table { min-width: 1120px; }
.table-footer { gap: 12px; flex-wrap: wrap; }
.table-footer :deep(.el-pagination) { max-width: 100%; overflow-x: auto; }
@media (max-width: 760px) {
  .filter-card :deep(.el-form-item) { flex: 1 1 100%; min-width: 0; max-width: 100%; }
  .filter-card :deep(.el-form-item__label) { flex: 0 0 70px; }
  .filter-card :deep(.el-form-item__content) { flex: 1; min-width: 0; }
  .filter-card :deep(.el-select), .filter-card :deep(.indicator-filter) { flex: 1; min-width: 0; width: 100%; }
}
</style>
