<template>
  <main class="login-page">
    <section class="login-card">
      <p class="eyebrow">IDMP · 医疗质量指标数据管理平台</p>
      <h1>登录并恢复工作会话</h1>
      <p class="description">登录后会保存短期访问令牌；刷新页面时将通过安全 Refresh Cookie 自动恢复身份和权限上下文。</p>
      <el-alert v-if="sessionState.status === 'restoring'" title="正在尝试恢复已有会话…" type="info" :closable="false" show-icon />
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="用户名"><el-input v-model.trim="form.username" autocomplete="username" @keyup.enter="submit" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password autocomplete="current-password" @keyup.enter="submit" /></el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="submit">登录</el-button>
      </el-form>
      <p class="hint">后端需允许跨域凭据并设置 `IDMP_REFRESH_TOKEN`、`IDMP_REFRESH_CSRF` Cookie，才能启用无感恢复。</p>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/idmp/api/modules/system'
import { sessionState } from '@/idmp/auth/session'

const router = useRouter()
const route = useRoute()
const form = reactive({ username: '', password: '' })
const loading = ref(false)

async function submit() {
  if (loading.value) return
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await login(form)
    form.password = ''
    ElMessage.success('登录成功，已恢复权限上下文')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.replace(redirect)
  } catch (error) {
    ElMessage.error(error?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(circle at top right, #dcecff, #f5f8fc 46%, #eef3f8); }
.login-card { width: min(440px, 100%); padding: 38px; border: 1px solid #dce5ee; border-radius: 16px; background: #fff; box-shadow: 0 18px 48px rgba(41, 73, 112, .12); }
.eyebrow { margin: 0 0 10px; color: #2c6bb2; font-size: 13px; font-weight: 700; letter-spacing: .05em; }
h1 { margin: 0; color: #182d45; font-size: 28px; }
.description { margin: 14px 0 22px; color: #64748b; line-height: 1.7; }
.submit { width: 100%; margin-top: 8px; }
.hint { margin: 20px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.7; }
</style>
