<template>
  <div class="idmp-page system-page">
    <PageHeader
      title="系统管理"
      :status="hasAccessToken ? 'ENABLED' : 'INACTIVE'"
      :status-label="hasAccessToken ? '已登录' : '未登录'"
    >
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="Refresh" :loading="healthLoading" @click="checkHealth">检查服务</el-button>
          <el-button :disabled="!hasAccessToken" :loading="logoutLoading" @click="handleLogout">退出当前会话</el-button>
          <el-button :disabled="!hasAccessToken" :loading="logoutLoading" @click="handleLogoutAll">退出全部会话</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="system-grid">
      <article class="surface-card system-card session-card">
        <div class="section-title">
          <div>
            <h2>当前会话</h2>
          </div>
        </div>
        <div v-if="sessionFeedback" class="operation-feedback">
          <StatusBadge
            :status="sessionFeedback.status"
            :label="sessionFeedback.label"
            :tone="sessionFeedback.tone"
          />
          <span>{{ sessionFeedback.message }}</span>
        </div>
        <dl v-if="loginState.user" class="detail-list">
          <div><dt>姓名</dt><dd>{{ loginState.user.displayName || loginState.user.username || '-' }}</dd></div>
          <div><dt>工号</dt><dd>{{ loginState.user.username || '-' }}</dd></div>
          <div><dt>角色</dt><dd>{{ formatRoles(loginState.user.roles) }}</dd></div>
          <div v-if="loginState.expiresInSeconds"><dt>登录有效期</dt><dd class="clinical-metric">{{ loginState.expiresInSeconds }} 秒</dd></div>
        </dl>
        <StatePanel
          v-else
          type="permission"
          title="尚未登录"
          description="请登录后查看账户信息。"
        />
      </article>

      <article class="surface-card system-card health-card">
        <div class="section-title">
          <div>
            <h2>服务健康状态</h2>
          </div>
        </div>
        <StatePanel v-if="healthLoading" type="loading" title="正在检查服务" />
        <StatePanel
          v-else-if="healthError"
          :type="stateTypeForError(healthError)"
          title="服务健康检查失败"
          :description="healthError"
        >
          <template #actions>
            <el-button @click="checkHealth">重试检查</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!healthResult"
          type="unavailable"
          title="暂无服务健康状态"
          description="暂时无法获取服务状态，请稍后重试。"
        >
          <template #actions>
            <el-button @click="checkHealth">重新检查</el-button>
          </template>
        </StatePanel>
        <dl v-else class="detail-list health-detail">
          <div class="status-row">
            <dt>状态</dt>
            <dd>
              <StatusBadge
                :status="healthStatus"
                :label="healthStatusLabel"
                :tone="isHealthy ? 'success' : 'warning'"
              />
            </dd>
          </div>
        </dl>
      </article>
    </section>

    <section v-if="canManageUsers" class="surface-card table-card users-card">
      <div class="section-title">
        <div>
          <h2>用户列表</h2>
        </div>
        <el-button :disabled="!hasAccessToken" :loading="usersLoading" @click="loadUsers">读取用户</el-button>
      </div>
      <StatePanel
        v-if="!hasAccessToken"
        type="permission"
        title="登录后可读取用户"
        description="用户列表属于受保护的系统管理数据，当前页面没有可用访问令牌。"
      />
      <StatePanel v-else-if="usersLoading" type="loading" title="正在读取用户列表" />
      <StatePanel
        v-else-if="usersError"
        :type="stateTypeForError(usersError)"
        title="用户列表读取失败"
        :description="usersError"
      >
        <template #actions>
          <el-button @click="loadUsers">重试读取</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!users.length"
        type="empty"
        title="未返回用户记录"
        description="当前账号可见范围内没有可展示的用户。"
      >
        <template #actions>
          <el-button @click="loadUsers">重新读取</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table :data="users" row-key="username" table-layout="fixed">
          <el-table-column prop="username" label="工号" min-width="140" />
          <el-table-column prop="displayName" label="姓名" min-width="160" show-overflow-tooltip />
          <el-table-column prop="orgCode" label="机构" width="120" />
          <el-table-column prop="deptCode" label="科室" width="120" />
          <el-table-column label="状态" width="132">
            <template #default="{ row }">
              <StatusBadge :status="row.status" />
            </template>
          </el-table-column>
          <el-table-column label="角色" min-width="190">
            <template #default="{ row }">{{ formatRoles(row.roles) }}</template>
          </el-table-column>
          <el-table-column prop="lastLoginAt" label="最近登录" min-width="180" />
          <el-table-column prop="createdAt" label="创建时间" min-width="180" />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button :icon="UserFilled" :disabled="roleLoading" @click="selectUserRoles(row.id)">分配角色</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <section v-if="canManageUsers" ref="roleSection" class="surface-card role-card" aria-label="用户角色分配">
      <div class="section-title">
        <div>
          <h2>分配用户角色</h2>
        </div>
      </div>
      <el-form label-position="top" @submit.prevent="handleAssignRoles">
        <el-form-item label="用户" label-for="role-user">
          <el-select id="role-user" v-model="selectedUserId" filterable clearable placeholder="选择工号或姓名" :disabled="roleLoading" :loading="usersLoading" @change="loadUserRoles">
            <el-option v-for="user in users" :key="user.id" :value="String(user.id)" :label="`${user.displayName || user.username}（${user.username}）`" />
          </el-select>
        </el-form-item>
        <StatePanel v-if="rolesLoading || userRolesLoading" type="loading" title="正在读取角色信息" />
        <StatePanel v-else-if="rolesError" type="error" title="角色列表读取失败" :description="rolesError">
          <template #actions><el-button :icon="Refresh" @click="loadRoles">重试读取</el-button></template>
        </StatePanel>
        <StatePanel v-else-if="userRolesError" type="error" title="用户角色读取失败" :description="userRolesError">
          <template #actions><el-button :icon="Refresh" @click="loadUserRoles">重试读取</el-button></template>
        </StatePanel>
        <template v-else-if="selectedUserDetail">
          <el-form-item label="角色">
            <el-checkbox-group v-model="selectedRoleIds" class="role-options" :disabled="roleLoading">
              <el-checkbox v-for="option in roleOptions" :key="option.id" :value="option.id" :disabled="!option.active && !selectedRoleIds.includes(option.id)">
                {{ option.name }}<span v-if="!option.active">（不可用）</span>
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
          <el-button type="primary" :icon="Check" :disabled="!rolesChanged || !selectedRoleIds.length || !roles.length" :loading="roleLoading" @click="handleAssignRoles">保存角色分配</el-button>
          <el-button :disabled="roleLoading || !rolesChanged" @click="resetSelectedRoles">取消修改</el-button>
        </template>
      </el-form>
        <div v-if="roleFeedback" class="operation-feedback">
          <StatusBadge :status="roleFeedback.status" :label="roleFeedback.label" :tone="roleFeedback.tone" />
          <span>{{ roleFeedback.message }}</span>
        </div>
    </section>
    <StatePanel v-else type="permission" title="仅系统管理员可以分配用户角色" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { Check, Refresh, UserFilled } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getStatusLabel } from '@/idmp/design/status'
import { invalidateSession, isAuthenticated, sessionState } from '@/idmp/auth/session'
import {
  assignSystemUserRoles,
  fetchSystemRoles,
  fetchSystemUser,
  fetchHealth,
  fetchSystemUsers,
  logout,
  logoutAll
} from '@/idmp/api/modules/system'

const loginState = sessionState

const users = ref([])
const healthResult = ref(null)
const roles = ref([])
const roleSection = ref(null)
const selectedUserId = ref('')
const selectedUserDetail = ref(null)
const selectedRoleIds = ref([])
const userRolesLoading = ref(false)
const userRolesError = ref('')
const rolesLoading = ref(false)
const rolesError = ref('')
let userRoleRequest = 0
const sessionFeedback = ref(null)
const roleFeedback = ref(null)
const healthError = ref('')
const usersError = ref('')
const logoutLoading = ref(false)
const usersLoading = ref(false)
const roleLoading = ref(false)
const healthLoading = ref(false)

const hasAccessToken = isAuthenticated
const canManageUsers = computed(() => hasAccessToken.value && (loginState.roles || loginState.user?.roles || []).some(role => ['ADMIN', 'SYSTEM_ADMIN'].includes(role)))
const roleOptions = computed(() => {
  const options = roles.value.map(({ roleId, role }) => ({ id: String(roleId), name: role.roleName, active: role.status === '0' }))
  for (const id of selectedUserDetail.value?.user.roleIds || []) {
    if (!options.some(option => option.id === String(id))) options.push({ id: String(id), name: '已失效角色', active: false })
  }
  return options
})
const rolesChanged = computed(() => {
  const previous = (selectedUserDetail.value?.user.roleIds || []).map(String).sort()
  return JSON.stringify(previous) !== JSON.stringify([...selectedRoleIds.value].sort())
})
const healthStatus = computed(() => {
  if (typeof healthResult.value === 'string') return healthResult.value
  return String(healthResult.value?.status || 'UNKNOWN')
})
const healthStatusLabel = computed(() => ({
  UP: '正常',
  OK: '正常',
  HEALTHY: '正常',
  DOWN: '异常',
  OUT_OF_SERVICE: '服务不可用'
}[healthStatus.value.toUpperCase()] || getStatusLabel(healthStatus.value)))
const isHealthy = computed(() => ['UP', 'OK', 'HEALTHY', 'RUNNING'].includes(healthStatus.value.toUpperCase()))

onMounted(() => {
  checkHealth({ silent: true })
  loadUsers({ silent: true })
  loadRoles()
})

async function handleLogout() {
  if (!hasAccessToken.value || logoutLoading.value) return
  try {
    await ElMessageBox.confirm(
      '确认退出当前会话？',
      '确认退出登录',
      {
        confirmButtonText: '确认退出',
        cancelButtonText: '返回',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  logoutLoading.value = true
  sessionFeedback.value = {
    status: 'RUNNING',
    label: '正在退出',
    message: '正在通知后端结束当前会话。'
  }
  try {
    await logout()
    sessionFeedback.value = {
      status: 'SUCCEEDED',
      label: '已退出登录',
      message: '访问令牌已清除。'
    }
    ElMessage.success('已退出登录')
  } catch (error) {
    sessionFeedback.value = {
      status: 'FAILED',
      label: '服务端退出失败',
      message: `${error?.message || '退出登录失败'}；本地访问令牌已清除。`
    }
    ElMessage.error(sessionFeedback.value.message)
  } finally {
    if (!hasAccessToken.value) {
      users.value = []
      usersError.value = ''
      selectedUserDetail.value = null
    }
    logoutLoading.value = false
  }
}

async function handleLogoutAll() {
  if (!hasAccessToken.value || logoutLoading.value) return
  try {
    await ElMessageBox.confirm('确认退出该账号在所有终端的会话？', '退出全部会话', { confirmButtonText: '确认退出', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  logoutLoading.value = true
  try {
    await logoutAll()
    ElMessage.success('已退出全部会话')
  } catch (error) {
    ElMessage.error(error?.message || '退出全部会话失败，本地会话已清除')
  } finally {
    logoutLoading.value = false
  }
}

async function checkHealth({ silent = false } = {}) {
  if (healthLoading.value) return
  healthLoading.value = true
  healthError.value = ''
  try {
    healthResult.value = await fetchHealth()
    if (!silent) ElMessage.success('服务健康检查完成')
  } catch (error) {
    healthResult.value = null
    healthError.value = error?.message || '健康检查失败'
    if (!silent) ElMessage.error(healthError.value)
  } finally {
    healthLoading.value = false
  }
}

async function loadUsers({ silent = false } = {}) {
  if (!canManageUsers.value || usersLoading.value) return
  usersLoading.value = true
  usersError.value = ''
  try {
    const result = await fetchSystemUsers()
    users.value = normalizeList(result)
    if (!silent) ElMessage.success('用户列表已更新')
  } catch (error) {
    users.value = []
    usersError.value = error?.message || '用户列表读取失败'
    if (!silent) ElMessage.error(usersError.value)
  } finally {
    usersLoading.value = false
  }
}

async function loadRoles() {
  if (!canManageUsers.value || rolesLoading.value) return
  rolesLoading.value = true
  rolesError.value = ''
  try { roles.value = normalizeList(await fetchSystemRoles()) }
  catch (error) { rolesError.value = error?.message || '角色列表读取失败' }
  finally { rolesLoading.value = false }
}

async function selectUserRoles(id) {
  if (roleLoading.value) return
  selectedUserId.value = String(id)
  await loadUserRoles()
  roleSection.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

async function loadUserRoles() {
  const request = ++userRoleRequest
  selectedUserDetail.value = null
  selectedRoleIds.value = []
  userRolesError.value = ''
  roleFeedback.value = null
  userRolesLoading.value = false
  if (!canManageUsers.value || !selectedUserId.value) return
  userRolesLoading.value = true
  try {
    const detail = await fetchSystemUser(selectedUserId.value)
    if (request !== userRoleRequest) return
    selectedUserDetail.value = detail
    resetSelectedRoles()
  } catch (error) {
    if (request === userRoleRequest) userRolesError.value = error?.message || '用户角色读取失败'
  } finally {
    if (request === userRoleRequest) userRolesLoading.value = false
  }
}

function resetSelectedRoles() {
  selectedRoleIds.value = (selectedUserDetail.value?.user.roleIds || []).map(String)
}

async function handleAssignRoles() {
  if (!canManageUsers.value || roleLoading.value || userRolesLoading.value || rolesLoading.value || rolesError.value || !selectedUserDetail.value || !rolesChanged.value) return
  if (!selectedRoleIds.value.length) {
    ElMessage.warning('请至少选择一个角色')
    return
  }
  if (selectedRoleIds.value.some(id => !roleOptions.value.some(option => option.id === id && option.active))) {
    ElMessage.warning('请移除不可用角色后保存')
    return
  }
  const id = selectedUserId.value
  const roleIds = [...selectedRoleIds.value]
  const user = selectedUserDetail.value.user
  const names = roleIds.map(id => roleOptions.value.find(option => option.id === id).name).join('、')
  roleLoading.value = true
  try {
    await ElMessageBox.confirm(
      `确认将 ${user.nickName}（${user.userName}）的角色设为${names}？该用户现有登录会话将失效，需要重新登录。`,
      '确认角色分配',
      {
        confirmButtonText: '确认保存',
        cancelButtonText: '返回核对',
        type: 'warning'
      }
    )
  } catch {
    roleLoading.value = false
    return
  }
  roleFeedback.value = {
    status: 'RUNNING',
    label: '正在保存',
    message: '正在保存角色分配。'
  }
  try {
    await assignSystemUserRoles(id, roleIds)
    selectedUserDetail.value = { ...selectedUserDetail.value, user: { ...user, roleIds } }
    roleFeedback.value = {
      status: 'SUCCEEDED',
      label: '保存成功',
      message: `${user.nickName}（${user.userName}）的角色已更新。`
    }
    ElMessage.success('角色分配已保存')
    if (String(loginState.user?.id) === id) {
      invalidateSession()
      window.dispatchEvent(new Event('idmp:logout'))
    } else await loadUsers({ silent: true })
  } catch (error) {
    roleFeedback.value = {
      status: 'FAILED',
      label: '保存失败',
      message: error?.message || '角色分配保存失败'
    }
    ElMessage.error(roleFeedback.value.message)
  } finally {
    roleLoading.value = false
  }
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.list)) return payload.list
  return []
}

function formatRoles(codes) {
  if (Array.isArray(codes)) return codes.map(code => roles.value.find(item => item.role.roleKey === code)?.role.roleName || code).join('、') || '-'
  return codes || '-'
}

function stateTypeForError(message) {
  const normalized = String(message || '').toLowerCase()
  if (/401|403|unauthorized|forbidden|未登录|无权限|权限/.test(normalized)) return 'permission'
  if (/404|501|503|not found|not implemented|unavailable|未实现|不可用/.test(normalized)) return 'unavailable'
  return 'error'
}
</script>

<style scoped lang="scss">
.system-page {
  min-width: 0;
}

.system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idmp-space-4);
  margin-bottom: var(--idmp-space-4);
}

.system-card,
.role-card {
  padding: var(--idmp-space-4);
}

.system-card :deep(.el-form-item) {
  margin-bottom: var(--idmp-space-3);
}

.system-card :deep(.el-input) {
  width: 100%;
}

.session-card .state-panel {
  margin-top: var(--idmp-space-4);
}

.operation-feedback {
  display: flex;
  align-items: flex-start;
  margin-top: var(--idmp-space-3);
  padding-top: var(--idmp-space-3);
  gap: var(--idmp-space-2);
  border-top: 1px solid var(--idmp-border-subtle);
  color: var(--idmp-text-secondary);
  line-height: 22px;
}

.operation-feedback > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: var(--idmp-space-4) 0 0;
  border-top: 1px solid var(--idmp-border-subtle);
  border-left: 1px solid var(--idmp-border-subtle);
}

.detail-list > div {
  min-width: 0;
  padding: var(--idmp-space-3);
  border-right: 1px solid var(--idmp-border-subtle);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.detail-list dt {
  margin-bottom: var(--idmp-space-1);
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.detail-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--idmp-text-primary);
  line-height: 20px;
}

.health-detail {
  grid-template-columns: minmax(0, 1fr);
  margin-top: 0;
}

.users-card,
.role-card {
  margin-bottom: var(--idmp-space-4);
}

.role-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 20px;
  width: 100%;
}

.role-card :deep(.el-select) { width: min(100%, 460px); }
.role-options :deep(.el-checkbox) { margin-right: 0; min-width: 0; height: auto; min-height: 32px; }
.role-options :deep(.el-checkbox__label) { white-space: normal; overflow-wrap: anywhere; }

.role-card :deep(.el-form-item) {
  margin-bottom: var(--idmp-space-3);
}

.status-row dd {
  display: flex;
  align-items: center;
}

@media (max-width: 1450px) {
  .system-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .role-options,
  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
