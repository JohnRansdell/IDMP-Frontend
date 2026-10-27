<template>
  <div class="indicator-policy-sources">
    <el-alert :title="published ? '政策来源已保存；依据说明选填。' : '政策来源必选，可在第 5 页补充选填的政策依据。草稿选择暂存在当前浏览器，发布后自动绑定；发布前不会写入政策引用。'" type="info" :closable="false" show-icon />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="source-toolbar"><strong>已选政策来源</strong><el-button :loading="loading" :disabled="saving" @click="loadReferences">刷新已保存来源</el-button></div>
    <el-select ref="sourceSelect" :model-value="pendingIds" multiple filterable remote :remote-method="search" :loading="searching" :disabled="saving" aria-label="政策文件来源" placeholder="搜索并选择来源政策，可多选" @update:model-value="selectSources" @visible-change="visible => visible && search('')">
      <el-option v-for="option in options" :key="option.id" :value="String(option.id)" :label="`${option.policyFileName} · 版本 ${option.versionNo}`" :disabled="savedIds.includes(String(option.id))" />
    </el-select>
    <p>已保存来源 {{ sourceReferences.length }} 项，待绑定 {{ modelValue.length }} 项。文件名称及文号自动读取，无需重复填写。</p>
    <el-table v-if="sourceReferences.length" v-loading="loading" :data="sourceReferences" empty-text="暂无已保存政策引用" table-layout="fixed">
      <el-table-column label="政策文件" min-width="200"><template #default="{ row }">{{ row.policyFileName || '未命名政策文件' }}</template></el-table-column>
      <el-table-column prop="policyVersionNo" label="版本" width="80" />
      <el-table-column label="文号" min-width="140"><template #default="{ row }">{{ metadata[row.policyFileId]?.documentNumber || '未提供' }}</template></el-table-column>
      <el-table-column label="操作" width="130"><template #default="{ row }"><el-button link type="primary" @click="viewerId = String(row.policyFileVersionId)">查看文件</el-button><el-button v-if="published" link type="danger" :disabled="saving" @click="invalidate(row)">失效</el-button></template></el-table-column>
    </el-table>
    <article v-for="row in modelValue" :key="row.policyFileVersionId" class="pending-source">
      <div class="source-toolbar"><strong>{{ row.policyFileName }} · 版本 {{ row.versionNo }}</strong><el-button link type="danger" :disabled="saving" @click="selectSources(pendingIds.filter(id => id !== row.policyFileVersionId))">移除待绑定来源</el-button></div>
      <p>文号：{{ row.documentNumber || '未提供' }} · {{ published ? '待保存' : '仅当前浏览器暂存，发布后保存' }} <el-button link type="primary" @click="viewerId = row.policyFileVersionId">查看文件</el-button></p>
    </article>
    <el-button v-if="published && modelValue.length" type="primary" :loading="saving" @click="savePending">保存待绑定政策来源</el-button>
    <PolicyFileViewer :version-id="viewerId" @close="viewerId = ''" />
  </div>
</template>
<script setup>
import { toRefs } from 'vue'
import { useIndicatorPolicySources } from '@/idmp/features/indicator/useIndicatorPolicySources'
import PolicyFileViewer from './PolicyFileViewer.vue'

const props = defineProps({ controller: Object, modelValue: { type: Array, default: () => [] }, versionId: { type: String, default: '' }, published: Boolean })
const emit = defineEmits(['update:modelValue', 'state'])
const controller = props.controller || useIndicatorPolicySources(props, emit)
const { references, options, loading, searching, saving, error, viewerId, metadata, sourceSelect, pendingIds, sourceReferences, savedIds } = toRefs(controller)
const { search, selectSources, edit, loadReferences, validateSources, syncPendingSources, savePending, invalidate, copySourcesToDraft } = controller

defineExpose({ validateSources, syncPendingSources, copySourcesToDraft })
</script>
<style scoped>
.indicator-policy-sources { width: 100%; min-width: 0; }
.indicator-policy-sources > .el-select { width: 100%; }
.source-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin: 16px 0 8px; }
.pending-source { border: 1px solid var(--el-border-color); padding: 12px; margin: 12px 0; border-radius: 6px; }
.pending-source .el-input { margin-bottom: 8px; }
</style>
