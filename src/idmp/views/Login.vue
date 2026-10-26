<template>
  <main class="login-page">
    <section class="login-card">
      <p class="eyebrow">IDMP · 医疗质量指标数据管理平台</p>
      <h1>登录指标平台</h1>
      <el-alert v-if="sessionState.status === 'restoring'" title="正在尝试恢复已有会话…" type="info" :closable="false" show-icon />
      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="工号"><el-input v-model.trim="form.username" placeholder="请输入工号" autocomplete="username" @keyup.enter="submit" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password autocomplete="current-password" @keyup.enter="submit" /></el-form-item>
        <el-button type="primary" class="submit" :loading="loading" @click="submit">登录</el-button>
      </el-form>
    </section>
  </main>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from '@/idmp/utils/message'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/idmp/api/modules/system'
import { sessionState } from '@/idmp/auth/session'
import { safeLoginRedirect } from '@/idmp/auth/navigation.js'

const router = useRouter()
const route = useRoute()
const form = reactive({ username: '', password: '' })
const loading = ref(false)

async function submit() {
  if (loading.value) return
  if (!form.username || !form.password) {
    ElMessage.warning('请输入工号和密码')
    return
  }
  loading.value = true
  try {
    await login(form)
    form.password = ''
    ElMessage.success('登录成功，已恢复权限上下文')
    const redirect = safeLoginRedirect(route.query.redirect, path => router.resolve(path))
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
