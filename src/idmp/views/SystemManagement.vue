<template>
  <div class="idmp-page system-page">
    <PageHeader title="系统管理">
      <template #actions>
        <el-button :icon="Refresh" :loading="healthLoading" @click="checkHealth">健康检查</el-button>
        <el-button :disabled="!loginState.accessToken" @click="handleLogout">退出登录</el-button>
      </template>
    </PageHeader>

    <section class="system-grid">
      <article class="surface-card system-card">
        <div class="system-card__head">
          <h2>登录认证</h2>
          <span>POST /auth/login</span>
        </div>
        <el-form :model="loginForm" label-width="76px" @submit.prevent="handleLogin">
          <el-form-item label="用户名">
            <el-input v-model.trim="loginForm.username" autocomplete="username" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="loginForm.password" type="password" show-password autocomplete="current-password" />
          </el-form-item>
          <el-button type="primary" :loading="loginLoading" @click="handleLogin">登录并保存 Token</el-button>
        </el-form>
        <dl v-if="loginState.user" class="compact-detail">
          <div><dt>当前用户</dt><dd>{{ loginState.user.displayName || loginState.user.username }}</dd></div>
          <div><dt>角色</dt><dd>{{ (loginState.user.roles || []).join(', ') || '-' }}</dd></div>
          <div><dt>有效期</dt><dd>{{ loginState.expiresInSeconds || '-' }} 秒</dd></div>
        </dl>
      </article>

      <article class="surface-card system-card">
        <div class="system-card__head">
          <h2>服务健康状态</h2>
          <span>GET /health</span>
        </div>
        <el-empty v-if="!healthResult" description="点击右上角进行健康检查" />
        <dl v-else class="compact-detail">
          <div><dt>状态</dt><dd><span class="status-pill is-success">{{ healthResult.status || healthResult }}</span></dd></div>
          <div><dt>返回内容</dt><dd>{{ stringifyShort(healthResult) }}</dd></div>
        </dl>
      </article>

      <article class="surface-card system-card">
        <div class="system-card__head">
          <h2>角色创建</h2>
          <span>POST /system/roles</span>
        </div>
        <el-form :model="roleForm" label-width="76px" @submit.prevent="handleCreateRole">
          <el-form-item label="角色编码">
            <el-input v-model.trim="roleForm.roleCode" />
          </el-form-item>
          <el-form-item label="角色名称">
            <el-input v-model.trim="roleForm.roleName" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model.trim="roleForm.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-button type="primary" :loading="roleLoading" @click="handleCreateRole">创建角色</el-button>
        </el-form>
        <dl v-if="createdRole" class="compact-detail">
          <div><dt>创建结果</dt><dd>{{ createdRole.roleCode }} / {{ createdRole.status }}</dd></div>
        </dl>
      </article>
    </section>

    <section class="surface-card users-card">
      <div class="users-card__head">
        <div>
          <h2>用户列表</h2>
          <span>GET /system/users</span>
        </div>
        <el-button type="primary" :loading="usersLoading" @click="loadUsers">读取用户</el-button>
      </div>
      <el-table :data="users" table-layout="fixed" empty-text="暂无用户数据">
        <el-table-column prop="username" label="登录名" min-width="120" />
        <el-table-column prop="displayName" label="显示名称" min-width="150" show-overflow-tooltip />
        <el-table-column prop="orgCode" label="机构" width="110" />
        <el-table-column prop="deptCode" label="科室" width="110" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span class="status-pill" :class="{ 'is-muted': row.status !== 'ACTIVE', 'is-success': row.status === 'ACTIVE' }">
              {{ row.status }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="180">
          <template #default="{ row }">{{ (row.roles || []).join(', ') || '-' }}</template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最近登录" min-width="170" />
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
      </el-table>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import { getAccessToken } from '@/idmp/api/request'
import {
  createSystemRole,
  fetchHealth,
  fetchSystemUsers,
  login,
  logout
} from '@/idmp/api/modules/system'

const loginForm = reactive({
  username: 'admin',
  password: ''
})

const roleForm = reactive({
  roleCode: `DEMO_ROLE_${new Date().toISOString().replace(/\D/g, '').slice(8, 14)}`,
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
const loginLoading = ref(false)
const usersLoading = ref(false)
const roleLoading = ref(false)
const healthLoading = ref(false)

async function handleLogin() {
  if (!loginForm.username || !loginForm.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loginLoading.value = true
  try {
    const result = await login(loginForm)
    loginState.accessToken = result.accessToken
    loginState.expiresInSeconds = result.expiresInSeconds
    loginState.user = result.user
    ElMessage.success('登录成功，后续请求会自动携带 Token')
    await loadUsers()
  } catch (error) {
    ElMessage.error(error?.message || '登录失败')
  } finally {
    loginLoading.value = false
  }
}

async function handleLogout() {
  try {
    await logout()
    loginState.accessToken = ''
    loginState.expiresInSeconds = ''
    loginState.user = null
    ElMessage.success('已退出登录')
  } catch (error) {
    ElMessage.error(error?.message || '退出登录失败')
  }
}

async function checkHealth() {
  healthLoading.value = true
  try {
    healthResult.value = await fetchHealth()
    ElMessage.success('服务健康检查完成')
  } catch (error) {
    ElMessage.error(error?.message || '健康检查失败')
  } finally {
    healthLoading.value = false
  }
}

async function loadUsers() {
  usersLoading.value = true
  try {
    users.value = await fetchSystemUsers()
    ElMessage.success('用户列表已更新')
  } catch (error) {
    ElMessage.error(error?.message || '用户列表读取失败')
  } finally {
    usersLoading.value = false
  }
}

async function handleCreateRole() {
  if (!roleForm.roleCode || !roleForm.roleName) {
    ElMessage.warning('请填写角色编码和角色名称')
    return
  }
  roleLoading.value = true
  try {
    createdRole.value = await createSystemRole({ ...roleForm })
    ElMessage.success('角色创建成功')
    roleForm.roleCode = `DEMO_ROLE_${new Date().toISOString().replace(/\D/g, '').slice(8, 14)}`
  } catch (error) {
    ElMessage.error(error?.message || '角色创建失败')
  } finally {
    roleLoading.value = false
  }
}

function stringifyShort(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}
</script>

<style scoped lang="scss">
.system-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.system-card,
.users-card {
  padding: 16px 18px;
}

.system-card__head,
.users-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 16px;

  h2 {
    margin: 0;
    color: #262626;
    font-size: 16px;
    line-height: 24px;
  }

  span {
    color: #8c8c8c;
    font-size: 12px;
  }
}

.system-card :deep(.el-input),
.system-card :deep(.el-textarea) {
  width: 100%;
}

.compact-detail {
  display: grid;
  margin: 14px 0 0;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  gap: 8px;

  div {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 8px;
  }

  dt {
    color: #8c8c8c;
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #262626;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.status-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  background: #f2f3f5;
  color: #6b7280;
  font-size: 12px;

  &.is-success {
    background: #f6ffed;
    color: #389e0d;
  }
}

@media (max-width: 1450px) {
  .system-grid {
    grid-template-columns: 1fr;
  }
}
</style>
