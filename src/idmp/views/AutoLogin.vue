<template>
  <main class="sso-status" aria-live="polite" :aria-busy="!error">
    <StatePanel :type="error ? 'error' : 'loading'" :title="error ? '单点登录失败' : '正在登录指标平台'" :description="error">
      <template v-if="error" #actions><el-button type="primary" @click="router.replace('/login')">使用工号密码登录</el-button></template>
    </StatePanel>
  </main>
</template>
<script setup>
import { onMounted } from 'vue'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { loginWithMedicalToken } from '@/idmp/auth/session'
import { scalarParameter, safeMedicalRedirect, signedDashboardParameters } from '@/idmp/auth/medicalSso.js'
const route = useRoute(), router = useRouter(), error = ref('')
onMounted(async () => {
  const query = { ...route.query }
  // Remove the credential before making requests or rendering another page.
  const clean = new URL(window.location.href)
  for (const key of ['token', 'sign', 'doctorNo', 'deptCode', 'redirect']) clean.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', `${clean.pathname}${clean.search}${clean.hash}`)
  try {
    const token = scalarParameter(query, 'token')
    if (!token || token.length > 8192) throw new Error('缺少有效登录凭证，请从医务系统重新进入')
    const signed = signedDashboardParameters(query)
    const target = safeMedicalRedirect(scalarParameter(query, 'redirect'))
    const dashboardEntry = signed || target.startsWith('/medical-dashboard')
      || new URL(target, window.location.origin).searchParams.has('dashboardID')
    await loginWithMedicalToken(token, dashboardEntry ? 'DASHBOARD' : 'PLATFORM')
    await router.replace(signed ? { path: '/medical-dashboard', query: signed } : target)
  } catch (cause) { error.value = cause?.message || '单点登录失败，请从医务系统重新进入' }
})
</script>
<style scoped>
.sso-status { display:grid; place-items:center; min-height:100vh; padding:24px; background:#f5f7f9; }
</style>
