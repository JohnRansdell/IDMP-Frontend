<template>
  <main class="medical-entry">
    <StatePanel :type="error ? 'error' : 'loading'" :title="error ? '看板访问失败' : '正在验证看板访问权限'" :description="error">
      <template v-if="error" #actions><el-button @click="router.replace('/login')">返回登录页</el-button></template>
    </StatePanel>
  </main>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { getAccessToken, isMedicalSession } from '@/idmp/api/request'
import { signedDashboardParameters, scalarParameter } from '@/idmp/auth/medicalSso.js'
import { enterSignedDashboard } from '@/idmp/auth/session.js'
import { fetchMedicalSession, openMedicalDashboard } from '@/idmp/api/modules/medical'
const route = useRoute(), router = useRouter(), error = ref('')
onMounted(async () => {
  const query = { ...route.query }
  const clean = new URL(window.location.href)
  for (const key of ['doctorNo', 'deptCode', 'sign']) clean.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', `${clean.pathname}${clean.search}`)
  try {
    const signed = signedDashboardParameters(query)
    let id = scalarParameter(query, 'id')
    if (signed) id = (await enterSignedDashboard(signed)).dashboardId
    else {
      if (!isMedicalSession() || !getAccessToken()) throw new Error('请使用来源系统提供的签名看板链接进入')
      await fetchMedicalSession()
      if (id) id = (await openMedicalDashboard(id)).dashboardId
    }
    await router.replace({ path: '/dashboard', query: { ...(id ? { id } : {}), medical: '1' } })
  } catch (cause) { error.value = cause?.message || '看板访问失败' }
})
</script>
<style scoped>
.medical-entry { display:grid; place-items:center; min-height:100vh; padding:24px; background:#f5f7f9; }
</style>
