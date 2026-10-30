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
import { loginWithSsoCredentials } from '@/idmp/auth/session'
import { resolveSsoEntry } from '@/idmp/auth/medicalSso.js'
const route = useRoute(), router = useRouter(), error = ref('')
onMounted(async () => {
  const query = { ...route.query }
  // Remove the credential before making requests or rendering another page.
  const clean = new URL(window.location.href)
  for (const key of ['token', 'sign', 'doctorNo', 'displayName', 'timestamp', 'nonce', 'deptCode', 'redirect']) clean.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', `${clean.pathname}${clean.search}${clean.hash}`)
  try {
    const { payload, entry, target } = resolveSsoEntry(query)
    await loginWithSsoCredentials(payload, entry)
    await router.replace(target)
  } catch (cause) { error.value = cause?.message || '单点登录失败，请从来源系统重新进入' }
})
</script>
<style scoped>
.sso-status { display:grid; place-items:center; min-height:100vh; padding:24px; background:#f5f7f9; }
</style>
