<template>
  <section class="background-asset-picker" aria-label="系统背景">
    <div class="background-asset-picker__tabs" role="tablist" aria-label="图片来源"><button type="button" role="tab" :aria-selected="source === 'system'" :class="{ 'is-active': source === 'system' }" @click="source = 'system'">系统背景</button><button type="button" role="tab" :aria-selected="source === 'custom'" :class="{ 'is-active': source === 'custom' }" @click="source = 'custom'">我的图片</button></div>
    <div v-if="source === 'system'" class="background-asset-picker__grid">
      <button v-for="asset in BACKGROUND_ASSETS" :key="asset.key" type="button" :class="{ 'is-selected': modelValue === asset.key }" :aria-pressed="modelValue === asset.key" @click="$emit('update:modelValue', asset.key)">
        <img :src="asset.url" alt="" /><span>{{ asset.name }}</span>
      </button>
    </div>
    <p v-else class="background-asset-picker__unavailable" role="status"><strong>我的图片暂不可用</strong><span>需要配置图片资源服务后才能上传自定义图片。</span></p>
    <button v-if="modelValue" class="background-asset-picker__clear" type="button" @click="$emit('update:modelValue', '')">清除背景图</button>
  </section>
</template>
<script setup>
import { ref } from 'vue'
import { BACKGROUND_ASSETS } from '../backgroundAssets.js'
defineProps({ modelValue: { type: String, default: '' } })
defineEmits(['update:modelValue'])
const source = ref('system')
</script>
<style scoped>
.background-asset-picker { display:grid; gap:7px; margin:8px 0; }.background-asset-picker__tabs { display:flex; gap:4px; border-bottom:1px solid var(--db-border,#e3e9eb); }.background-asset-picker__tabs button { border:0; border-bottom:2px solid transparent; padding:5px 7px; background:transparent; color:#667780; font-size:12px; cursor:pointer; }.background-asset-picker__tabs button.is-active { border-color:#1261a6; color:#1261a6; font-weight:600; }.background-asset-picker__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.background-asset-picker__grid button { display:grid; grid-template-columns:30px minmax(0,1fr); align-items:center; gap:6px; min-width:0; padding:4px; overflow:hidden; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; background:#fff; color:#52636c; font-size:11px; text-align:left; cursor:pointer; }.background-asset-picker__grid button.is-selected { border-color:#409eff; box-shadow:0 0 0 1px #409eff; }.background-asset-picker img { width:30px; height:22px; border-radius:3px; object-fit:cover; }.background-asset-picker span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.background-asset-picker__clear { justify-self:start; border:0; padding:0; background:transparent; color:#52636c; font-size:11px; cursor:pointer; }.background-asset-picker__unavailable { display:grid; gap:4px; margin:0; padding:9px; border:1px solid #ead9ac; border-radius:5px; background:#fffaf0; color:#7d5d12; font-size:11px; line-height:1.5; }.background-asset-picker__unavailable strong { color:#624700; }
</style>
