<template><el-drawer v-model="visible" title="技术配置（DSL）" size="520px"><pre class="dsl-preview">{{ JSON.stringify(dsl, null, 2) }}</pre></el-drawer></template>
<script setup>import { computed } from 'vue'; const props=defineProps({ modelValue:Boolean, dsl:{type:Object,default:()=>({})} }); const emit=defineEmits(['update:modelValue']); const visible=computed({get:()=>props.modelValue,set:(value)=>emit('update:modelValue',value)})</script>
<style scoped>.dsl-preview{padding:14px;overflow:auto;white-space:pre-wrap;background:#f6f8fa;border-radius:6px;font:12px/18px Consolas,monospace}</style>
