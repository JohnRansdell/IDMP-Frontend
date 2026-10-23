<template>
  <main v-if="sessionState.status === 'restoring'" class="session-loading">
    <StatePanel type="loading" title="正在恢复登录状态" />
  </main>
  <router-view v-else />
</template>

<script setup>
import StatePanel from '@/idmp/components/StatePanel.vue'
import { sessionState } from '@/idmp/auth/session'
</script>

<style scoped>
.session-loading { min-height: 100vh; display: grid; place-items: center; }
</style>
