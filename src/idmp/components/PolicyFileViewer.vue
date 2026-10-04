<template>
  <el-dialog :model-value="Boolean(versionId)" title="政策文件" width="min(1000px, 94vw)" @close="$emit('close')">
    <div v-loading="loading" class="policy-viewer">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-else-if="file">
        <div class="file-toolbar"><span>{{ file.originalName }}</span><el-button :icon="Download" @click="download">下载</el-button></div>
        <iframe v-if="url && file.mimeType === 'application/pdf'" :src="url" title="政策文件预览" />
        <template v-else-if="file.mimeType === 'text/plain'"><el-alert v-if="truncated" title="预览仅显示前 1 MB 内容，请下载查看完整文件" type="info" :closable="false" /><pre>{{ text }}</pre></template>
        <el-empty v-else description="此文件格式需下载查看" />
      </template>
      <el-empty v-else-if="!loading && !error" description="该版本没有上传文件" />
    </div>
  </el-dialog>
</template>
<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { fetchPolicyVersion, fetchPolicyFile, fetchPolicyContent } from '@/idmp/api/modules/policies'
const props = defineProps({ versionId: { type: String, default: '' } })
defineEmits(['close'])
const file = ref(null), loading = ref(false), error = ref(''), url = ref(''), text = ref(''), truncated = ref(false)
let revision = 0, controller
function clear() { if (url.value) URL.revokeObjectURL(url.value); url.value = ''; controller?.abort() }
watch(() => props.versionId, async id => {
  const current = ++revision
  clear(); file.value = null; text.value = ''; truncated.value = false; error.value = ''; loading.value = Boolean(id)
  if (!id) return
  controller = new AbortController()
  try {
    const version = await fetchPolicyVersion(id)
    if (current !== revision || !version.fileObjectId) return
    const metadata = await fetchPolicyFile(version.fileObjectId)
    if (current !== revision) return
    const blob = await fetchPolicyContent(version.fileObjectId, { signal: controller.signal })
    const preview = metadata.mimeType === 'text/plain' ? await blob.slice(0, 1024 * 1024).text() : ''
    if (current !== revision) return
    file.value = metadata
    url.value = URL.createObjectURL(blob)
    text.value = preview
    truncated.value = metadata.mimeType === 'text/plain' && blob.size > 1024 * 1024
  } catch (e) { if (current === revision && e.name !== 'AbortError') error.value = e.message }
  finally { if (current === revision) loading.value = false }
})
function download() {
  const link = document.createElement('a')
  link.href = url.value; link.download = file.value.originalName; link.click()
}
onBeforeUnmount(() => { revision++; clear() })
</script>
<style scoped>
.policy-viewer { min-height: 200px; }
.file-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.file-toolbar span { overflow-wrap: anywhere; }
iframe { width: 100%; height: 65vh; border: 1px solid #d9dee5; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 65vh; overflow: auto; font-size: 14px; line-height: 1.7; }
</style>
