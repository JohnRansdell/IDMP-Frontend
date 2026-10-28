<template>
  <div class="indicator-policy-sources">
    <el-alert :title="published ? '可查看已保存的政策来源和依据；已保存依据为只读，调整时请创建新的指标草稿版本。' : '至少选择一份政策来源。每份文件可展开补充章节和依据说明，留空不影响发布；草稿内容仅在当前浏览器暂存，发布后保存。'" type="info" :closable="false" show-icon />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="source-toolbar"><strong>政策来源与依据</strong><el-button :loading="loading" :disabled="saving" @click="loadReferences">刷新已保存来源</el-button></div>
    <el-select ref="sourceSelect" :model-value="pendingIds" multiple filterable remote :remote-method="search" :loading="searching" :disabled="saving" aria-label="政策文件来源" placeholder="搜索并选择来源政策，可多选" @update:model-value="selectSources" @visible-change="visible => visible && search('')">
      <el-option v-for="option in options" :key="option.id" :value="String(option.id)" :label="`${option.policyFileName} · 版本 ${option.versionNo}`" :disabled="savedIds.includes(String(option.id))" />
    </el-select>
    <p>已保存来源 {{ sourceReferences.length }} 项，待保存来源 {{ modelValue.length }} 项。文件名称及文号自动读取，无需重复填写。</p>
    <article v-for="row in references" :key="row.id || `${row.relationRole}:${row.policyFileVersionId}`" class="saved-source" v-loading="loading">
      <div class="source-toolbar"><strong>{{ row.policyFileName || '未命名政策文件' }} · 版本 {{ row.policyVersionNo }}</strong><span>{{ row.relationRole === 'SOURCE' ? '已保存来源' : '已保存依据' }}</span></div>
      <p>文号：{{ metadata[row.policyFileId]?.documentNumber || '未提供' }}</p>
      <div class="source-actions"><el-button link type="primary" @click="viewerId = String(row.policyFileVersionId)">查看文件</el-button><el-button v-if="published && row.relationRole === 'SOURCE'" link type="danger" :disabled="saving" @click="invalidate(row)">失效</el-button></div>
      <details class="policy-basis-details">
        <summary>查看依据（只读）<span class="basis-status">{{ row.citationLocation?.trim() || row.citationText?.trim() ? '已补充依据' : '未补充依据' }}</span></summary>
        <dl><dt>章节或条款</dt><dd>{{ row.citationLocation || '未填写' }}</dd><dt>依据说明</dt><dd>{{ row.citationText || '未填写' }}</dd></dl>
      </details>
    </article>
    <article v-for="row in modelValue" :key="row.policyFileVersionId" class="pending-source">
      <div class="source-toolbar"><strong>{{ row.policyFileName }} · 版本 {{ row.versionNo }}</strong><el-button link type="danger" :disabled="saving" @click="selectSources(pendingIds.filter(id => id !== row.policyFileVersionId))">移除待保存来源</el-button></div>
      <p>文号：{{ row.documentNumber || '未提供' }} · {{ published ? '等待保存' : '草稿暂存' }} <el-button link type="primary" @click="viewerId = row.policyFileVersionId">查看文件</el-button></p>
      <details class="policy-basis-details">
        <summary>补充依据（选填）<span class="basis-status">{{ row.citationLocation?.trim() || row.citationText?.trim() ? '已补充依据' : '未补充依据' }}</span></summary>
        <div class="basis-fields">
          <label>章节或条款（选填）<el-input :model-value="row.citationLocation" :disabled="saving" maxlength="500" aria-label="政策章节或条款（选填）" placeholder="例如：第三章第二条" @update:model-value="value => edit(row, 'citationLocation', value)" /></label>
          <label>依据说明（选填）<el-input :model-value="row.citationText" :disabled="saving" type="textarea" :rows="3" maxlength="10000" aria-label="政策依据说明（选填）" placeholder="填写指标对应的依据说明或引用原文，留空不影响发布" @update:model-value="value => edit(row, 'citationText', value)" /></label>
        </div>
      </details>
    </article>
    <el-button v-if="published && modelValue.length" type="primary" :loading="saving" @click="savePending">保存待绑定来源及依据</el-button>
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
.source-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin: 16px 0 8px; }
.source-toolbar strong { min-width: 0; overflow-wrap: anywhere; }
.pending-source, .saved-source { border: 1px solid var(--el-border-color); padding: 12px; margin: 12px 0; border-radius: 6px; overflow-wrap: anywhere; }
.pending-source p, .saved-source p { line-height: 1.7; }
.source-actions { display: flex; flex-wrap: wrap; gap: 12px; }
.source-actions .el-button { margin-left: 0; }
.policy-basis-details { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--el-border-color-lighter); }
.policy-basis-details summary { cursor: pointer; color: var(--el-color-primary); line-height: 1.8; }
.policy-basis-details summary:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }
.basis-status { margin-left: 12px; color: var(--el-text-color-secondary); font-size: 12px; }
.basis-fields { display: grid; gap: 12px; margin-top: 14px; }
.basis-fields label { display: grid; gap: 6px; color: var(--el-text-color-regular); font-size: 13px; }
.policy-basis-details dt { color: var(--el-text-color-secondary); margin-top: 10px; }
.policy-basis-details dd { margin: 4px 0 12px; white-space: pre-wrap; line-height: 1.8; }
</style>
