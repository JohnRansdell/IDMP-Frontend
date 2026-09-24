<template>
  <section class="background-asset-picker" aria-label="系统背景">
    <div class="background-asset-picker__tabs" role="tablist" aria-label="图片来源"><button type="button" role="tab" :aria-selected="source === 'system'" :class="{ 'is-active': source === 'system' }" @click="source = 'system'">系统背景</button><button type="button" role="tab" :aria-selected="source === 'custom'" :class="{ 'is-active': source === 'custom' }" @click="source = 'custom'">我的图片</button></div>
    <div v-if="source === 'system'" class="background-asset-picker__grid">
      <button v-for="asset in BACKGROUND_ASSETS" :key="asset.key" type="button" :class="{ 'is-selected': modelValue === asset.key }" :aria-pressed="modelValue === asset.key" @click="$emit('update:modelValue', asset.key)">
        <img :src="asset.url" alt="" /><span>{{ asset.name }}</span>
      </button>
    </div>
    <div v-else class="background-asset-picker__custom">
      <label class="background-asset-picker__upload">
        <input type="file" accept="image/png,image/jpeg,image/webp" @change="readCustomImage" />
        <span>{{ isCustomImage ? '更换我的图片' : '选择本机图片' }}</span>
      </label>
      <img v-if="isCustomImage" class="background-asset-picker__custom-preview" :src="activeCustomImage" alt="当前自定义背景预览" />
      <small>支持 PNG、JPG、WebP，图片最大 1 MB。图片保存在当前浏览器中。</small>
      <button v-if="isCustomImage" class="background-asset-picker__clear" type="button" @click="clearCustomImage">移除自定义图片</button>
    </div>
    <button v-if="modelValue" class="background-asset-picker__clear" type="button" @click="$emit('update:modelValue', '')">清除背景图</button>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { BACKGROUND_ASSETS } from '../backgroundAssets.js'
const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const source = ref('system')
const uploadedImage = ref('')
const activeCustomImage = computed(() => props.modelValue ? (props.modelValue.startsWith('data:image/') ? props.modelValue : '') : uploadedImage.value)
const isCustomImage = computed(() => Boolean(activeCustomImage.value))
const MAX_CUSTOM_IMAGE_SIZE = 1024 * 1024
function clearCustomImage() { uploadedImage.value = ''; emit('update:modelValue', '') }
function readCustomImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage.warning('请选择 PNG、JPG 或 WebP 图片。')
    return
  }
  if (file.size > MAX_CUSTOM_IMAGE_SIZE) {
    ElMessage.warning('图片不能超过 1 MB。')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
      uploadedImage.value = reader.result
      emit('update:modelValue', reader.result)
    }
  }
  reader.onerror = () => ElMessage.error('读取图片失败，请重新选择。')
  reader.readAsDataURL(file)
}
</script>
<style scoped>
.background-asset-picker { display:grid; gap:7px; margin:8px 0; }.background-asset-picker__tabs { display:flex; gap:4px; border-bottom:1px solid var(--db-border,#e3e9eb); }.background-asset-picker__tabs button { border:0; border-bottom:2px solid transparent; padding:5px 7px; background:transparent; color:#667780; font-size:12px; cursor:pointer; }.background-asset-picker__tabs button.is-active { border-color:#1261a6; color:#1261a6; font-weight:600; }.background-asset-picker__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }.background-asset-picker__grid button { display:grid; grid-template-columns:30px minmax(0,1fr); align-items:center; gap:6px; min-width:0; padding:4px; overflow:hidden; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; background:#fff; color:#52636c; font-size:11px; text-align:left; cursor:pointer; }.background-asset-picker__grid button.is-selected { border-color:#409eff; box-shadow:0 0 0 1px #409eff; }.background-asset-picker img { width:30px; height:22px; border-radius:3px; object-fit:cover; }.background-asset-picker span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.background-asset-picker__clear { justify-self:start; border:0; padding:0; background:transparent; color:#52636c; font-size:11px; cursor:pointer; }.background-asset-picker__unavailable { display:grid; gap:4px; margin:0; padding:9px; border:1px solid #ead9ac; border-radius:5px; background:#fffaf0; color:#7d5d12; font-size:11px; line-height:1.5; }.background-asset-picker__unavailable strong { color:#624700; }
.background-asset-picker__custom { display:grid; gap:7px; color:#667780; font-size:11px; }.background-asset-picker__upload { justify-self:start; }.background-asset-picker__upload input { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }.background-asset-picker__upload span { display:inline-block; padding:6px 9px; border:1px solid var(--db-border,#e3e9eb); border-radius:4px; color:#1261a6; background:#fff; cursor:pointer; }.background-asset-picker__custom-preview { width:100% !important; height:80px !important; border:1px solid var(--db-border,#e3e9eb); object-fit:cover; }
</style>
