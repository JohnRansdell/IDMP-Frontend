<template>
  <div class="idmp-page system-page">
    <PageHeader
      title="系统管理"
      :status="hasAccessToken ? 'ENABLED' : 'INACTIVE'"
      :status-label="hasAccessToken ? '已保存访问令牌' : '未登录'"
    >
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">会话支持 auth/me、刷新令牌轮换与全端退出</span>
      </template>
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
            <h2>登录认证</h2>
            <p class="section-title__description">POST /api/v1/auth/login</p>
          </div>
        </div>
        <el-form :model="loginForm" label-position="top" @submit.prevent="handleLogin">
          <el-form-item label="用户名">
            <el-input v-model.trim="loginForm.username" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="loginForm.password"
              type="password"
              show-password
              autocomplete="current-password"
            />
          </el-form-item>
          <el-button type="primary" :loading="loginLoading" @click="handleLogin">登录并建立会话</el-button>
        </el-form>
        <div v-if="sessionFeedback" class="operation-feedback">
          <StatusBadge
            :status="sessionFeedback.status"
            :label="sessionFeedback.label"
            :tone="sessionFeedback.tone"
          />
          <span>{{ sessionFeedback.message }}</span>
        </div>
        <dl v-if="loginState.user" class="detail-list">
          <div><dt>当前用户</dt><dd>{{ loginState.user.displayName || loginState.user.username || '-' }}</dd></div>
          <div><dt>角色</dt><dd>{{ formatRoles(loginState.user.roles) }}</dd></div>
          <div><dt>有效期</dt><dd class="clinical-metric">{{ loginState.expiresInSeconds || '-' }} 秒</dd></div>
        </dl>
        <StatePanel
          v-else-if="hasAccessToken"
          type="unavailable"
          title="已检测到访问令牌，身份详情不可恢复"
          description="当前后端没有 auth/me 接口，刷新页面后无法还原用户资料；可读取用户列表验证授权，或重新登录。"
        />
        <StatePanel
          v-else
          type="permission"
          title="尚未登录"
          description="登录成功后，请求适配层会为后续受保护接口携带访问令牌。"
        />
      </article>

      <article class="surface-card system-card health-card">
        <div class="section-title">
          <div>
            <h2>服务健康状态</h2>
            <p class="section-title__description">GET /api/v1/health</p>
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
          v-else-if="!healthRequested"
          type="empty"
          title="尚未执行健康检查"
          description="健康检查只读取服务状态，不会修改后端数据。"
        >
          <template #actions>
            <el-button @click="checkHealth">检查服务</el-button>
          </template>
        </StatePanel>
        <StatePanel
          v-else-if="!healthResult"
          type="unavailable"
          title="健康接口未返回可用内容"
          description="接口请求完成，但没有可展示的健康状态。"
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
                :label="healthStatus"
                :tone="isHealthy ? 'success' : 'warning'"
              />
            </dd>
          </div>
          <div><dt>返回内容</dt><dd class="response-copy">{{ stringifyShort(healthResult) }}</dd></div>
        </dl>
      </article>
    </section>

    <section class="surface-card table-card users-card">
      <div class="section-title">
        <div>
          <h2>用户列表</h2>
          <p class="section-title__description">GET /api/v1/system/users</p>
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
        v-else-if="!usersRequested"
        type="empty"
        title="尚未读取用户"
        description="点击“读取用户”后从后端获取当前可见用户。"
      >
        <template #actions>
          <el-button @click="loadUsers">读取用户</el-button>
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
          <el-table-column prop="username" label="登录名" min-width="140" />
          <el-table-column prop="displayName" label="显示名称" min-width="160" show-overflow-tooltip />
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
        </el-table>
      </div>
    </section>

    <section class="surface-card role-card">
      <div class="section-title">
        <div>
          <h2>创建角色</h2>
          <p class="section-title__description">POST /api/v1/system/roles</p>
        </div>
      </div>
      <div class="notice-strip is-warning role-warning">
        角色创建会写入后端；重复 roleCode 会由后端返回冲突，不会在前端伪装成功。
      </div>
      <StatePanel
        v-if="!hasAccessToken"
        type="permission"
        title="登录后可创建角色"
        description="当前页面没有可用于角色写入的访问令牌。"
      />
      <template v-else>
        <el-form :model="roleForm" label-position="top" @submit.prevent="handleCreateRole">
          <div class="role-form-grid">
            <el-form-item label="角色编码">
              <el-input v-model.trim="roleForm.roleCode" class="mono-input" />
            </el-form-item>
            <el-form-item label="角色名称">
              <el-input v-model.trim="roleForm.roleName" />
            </el-form-item>
            <el-form-item label="说明">
              <el-input v-model.trim="roleForm.description" />
            </el-form-item>
          </div>
          <el-button :loading="roleLoading" @click="handleCreateRole">确认并创建角色</el-button>
        </el-form>
        <div v-if="roleFeedback" class="operation-feedback">
          <StatusBadge :status="roleFeedback.status" :label="roleFeedback.label" :tone="roleFeedback.tone" />
          <span>{{ roleFeedback.message }}</span>
        </div>
        <dl v-if="createdRole" class="detail-list role-result">
          <div><dt>角色编码</dt><dd class="mono-data">{{ createdRole.roleCode || '-' }}</dd></div>
          <div class="status-row">
            <dt>后端状态</dt>
            <dd><StatusBadge :status="createdRole.status" /></dd>
          </div>
        </dl>
      </template>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getAccessToken } from '@/idmp/api/request'
import {
  createSystemRole,
  fetchHealth,
  fetchSystemUsers,
  login,
  logout,
  logoutAll
} from '@/idmp/api/modules/system'

const loginForm = reactive({
  username: 'admin',
  password: ''
})

const roleForm = reactive({
  roleCode: `DEMO_ROLE_${createCodeSuffix()}`,
  roleName: '演示角色',
  description: '前端系统管理页面创建'
})

const loginState = reactive({
  accessToken: getAccessToken(),
  expiresInSeconds: '',
  user: null
})

const users = ref([])
const healthResult = ref(null)
const createdRole = ref(null)
const sessionFeedback = ref(null)
const roleFeedback = ref(null)
const healthError = ref('')
const usersError = ref('')
const healthRequested = ref(false)
const usersRequested = ref(false)
const loginLoading = ref(false)
const logoutLoading = ref(false)
const usersLoading = ref(false)
const roleLoading = ref(false)
const healthLoading = ref(false)

const hasAccessToken = computed(() => Boolean(loginState.accessToken))
const healthStatus = computed(() => {
  if (typeof healthResult.value === 'string') return healthResult.value
  return String(healthResult.value?.status || 'UNKNOWN')
})
const isHealthy = computed(() => ['UP', 'OK', 'HEALTHY', 'RUNNING'].includes(healthStatus.value.toUpperCase()))

async function handleLogin() {
  if (loginLoading.value) return
  if (!loginForm.username || !loginForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loginLoading.value = true
  sessionFeedback.value = {
    status: 'RUNNING',
    label: '正在登录',
    message: '正在向后端提交认证信息。'
  }
  try {
    const result = await login(loginForm)
    loginState.accessToken = result.accessToken
    loginState.expiresInSeconds = result.expiresInSeconds
    loginState.user = result.user
    loginForm.password = ''
    sessionFeedback.value = {
      status: 'SUCCEEDED',
      label: '登录成功',
      message: '后续请求会自动携带当前访问令牌。'
    }
    ElMessage.success('登录成功')
    await loadUsers()
  } catch (error) {
    sessionFeedback.value = {
      status: 'FAILED',
      label: '登录失败',
      message: error?.message || '登录失败'
    }
    ElMessage.error(sessionFeedback.value.message)
  } finally {
    loginLoading.value = false
  }
}

async function handleLogout() {
  if (!hasAccessToken.value || logoutLoading.value) return
  try {
    await ElMessageBox.confirm(
      '确认退出当前会话？请求适配层会清除本地保存的访问令牌。',
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
    loginState.accessToken = getAccessToken()
    if (!loginState.accessToken) {
      loginState.expiresInSeconds = ''
      loginState.user = null
      users.value = []
      usersRequested.value = false
      usersError.value = ''
      createdRole.value = null
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
    loginState.accessToken = getAccessToken(); loginState.user = null; loginState.expiresInSeconds = ''; logoutLoading.value = false
  }
}

async function checkHealth() {
  if (healthLoading.value) return
  healthRequested.value = true
  healthLoading.value = true
  healthError.value = ''
  try {
    healthResult.value = await fetchHealth()
    ElMessage.success('服务健康检查完成')
  } catch (error) {
    healthResult.value = null
    healthError.value = error?.message || '健康检查失败'
    ElMessage.error(healthError.value)
  } finally {
    healthLoading.value = false
  }
}

async function loadUsers() {
  if (!hasAccessToken.value || usersLoading.value) return
  usersRequested.value = true
  usersLoading.value = true
  usersError.value = ''
  try {
    const result = await fetchSystemUsers()
    users.value = normalizeList(result)
    ElMessage.success('用户列表已更新')
  } catch (error) {
    users.value = []
    usersError.value = error?.message || '用户列表读取失败'
    ElMessage.error(usersError.value)
  } finally {
    usersLoading.value = false
  }
}

async function handleCreateRole() {
  if (!hasAccessToken.value || roleLoading.value) return
  if (!roleForm.roleCode || !roleForm.roleName) {
    ElMessage.warning('请填写角色编码和角色名称')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认创建角色 ${roleForm.roleCode}（${roleForm.roleName}）？该操作会写入后端，重复编码将由后端返回冲突。`,
      '确认创建角色',
      {
        confirmButtonText: '确认创建',
        cancelButtonText: '返回核对',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  roleLoading.value = true
  createdRole.value = null
  roleFeedback.value = {
    status: 'RUNNING',
    label: '正在创建',
    message: `正在提交角色 ${roleForm.roleCode}。`
  }
  try {
    createdRole.value = await createSystemRole({ ...roleForm })
    roleFeedback.value = {
      status: 'SUCCEEDED',
      label: '接口创建成功',
      message: `后端已返回角色 ${createdRole.value?.roleCode || roleForm.roleCode}。`
    }
    ElMessage.success('角色创建成功')
    roleForm.roleCode = `DEMO_ROLE_${createCodeSuffix()}`
  } catch (error) {
    roleFeedback.value = {
      status: 'FAILED',
      label: '创建失败',
      message: error?.message || '角色创建失败'
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

function formatRoles(roles) {
  if (Array.isArray(roles)) return roles.join(', ') || '-'
  return roles || '-'
}

function stringifyShort(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

function createCodeSuffix() {
  return new Date().toISOString().replace(/\D/g, '').slice(8, 14)
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

.header-meta {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 20px;
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
  grid-template-columns: 150px minmax(0, 1fr);
  margin-top: 0;
}

.response-copy {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
}

.users-card,
.role-card {
  margin-bottom: var(--idmp-space-4);
}

.role-warning {
  margin-bottom: var(--idmp-space-4);
}

.role-form-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(220px, 0.8fr) minmax(300px, 1.4fr);
  gap: 0 var(--idmp-space-3);
}

.role-card :deep(.el-form-item) {
  margin-bottom: var(--idmp-space-3);
}

.mono-input :deep(.el-input__inner) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.role-result {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  .role-form-grid,
  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
