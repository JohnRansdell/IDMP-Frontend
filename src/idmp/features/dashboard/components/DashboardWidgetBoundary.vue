<template><section v-if="failed" class="dashboard-widget-error" role="status"><strong>{{ designer ? '组件渲染失败' : '该组件暂时无法显示' }}</strong><small v-if="designer && message">{{ message }}</small></section><slot v-else /></template>
<script setup>
import { onErrorCaptured, ref } from 'vue'
const props = defineProps({ designer: { type: Boolean, default: false } })
const failed = ref(false), message = ref('')
onErrorCaptured((error) => { failed.value = true; message.value = error instanceof Error ? error.message : '未知渲染错误'; if (import.meta.env.DEV) console.error('[Dashboard widget render error]', error); return false })
</script>
<style scoped>.dashboard-widget-error { display:grid; place-items:center; align-content:center; gap:8px; box-sizing:border-box; width:100%; height:100%; min-height:96px; padding:16px; border:1px solid #fecdca; border-radius:inherit; background:#fffbfa; color:#b42318; text-align:center; }.dashboard-widget-error small { color:#7a271a; font-size:12px; overflow-wrap:anywhere; }</style>
