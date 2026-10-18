import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { fetchPublishedPolicyVersions, fetchPolicy, fetchPolicyVersion } from '@/idmp/api/modules/policies'
import { createPolicyReference, fetchPolicyReferences, invalidatePolicyReference } from '@/idmp/api/modules/mappings'

export function useIndicatorPolicySources(props, emit) {
  const references = ref([]), options = ref([]), loading = ref(false), searching = ref(false), saving = ref(false), error = ref(''), viewerId = ref('')
  const metadata = reactive({})
  const sourceSelect = ref()
  const pendingIds = computed(() => props.modelValue.map(row => String(row.policyFileVersionId)))
  const sourceReferences = computed(() => references.value.filter(row => row.relationRole === 'SOURCE'))
  const savedIds = computed(() => sourceReferences.value.map(row => String(row.policyFileVersionId)))
  let context = 0, readRevision = 0, searchRevision = 0, selectionRevision = 0
  const pendingEdits = new Map()
  watch(() => [sourceReferences.value, props.modelValue, loading.value, saving.value, error.value], () => emit('state', { count: new Set([...savedIds.value, ...pendingIds.value]).size, pending: props.modelValue.length, loading: loading.value, saving: saving.value, error: error.value }), { deep: true, immediate: true })
  async function search(name) {
    const revision = ++searchRevision; searching.value = true
    try { const result = await fetchPublishedPolicyVersions({ name, size: 50 }); if (revision === searchRevision) options.value = result.records || [] }
    catch (e) { if (revision === searchRevision) ElMessage.error(e.message) }
    finally { if (revision === searchRevision) searching.value = false }
  }
  async function selectSources(ids) {
    if (saving.value) return
    const current = context, selection = ++selectionRevision
    const removed = props.modelValue.filter(row => !ids.map(String).includes(String(row.policyFileVersionId)))
    if (removed.some(row => row.citationLocation || row.citationText)) {
      try { await ElMessageBox.confirm('移除来源将同时移除已填写的政策依据，是否继续？', '移除政策来源', { type: 'warning' }) }
      catch { return }
    }
    if (current !== context || selection !== selectionRevision || saving.value) return
    for (const row of removed) pendingEdits.delete(row.policyFileVersionId)
    const previous = new Map(props.modelValue.map(row => [row.policyFileVersionId, row]))
    const selected = [...new Set(ids.map(String))].filter(id => !savedIds.value.includes(id)).map(id => previous.get(id) || (() => {
      const option = options.value.find(item => String(item.id) === id)
      return option ? { policyFileVersionId: id, policyFileId: String(option.policyFileId || ''), policyFileName: option.policyFileName, versionNo: option.versionNo, citationLocation: '', citationText: '', documentNumber: '' } : null
    })()).filter(Boolean)
    emit('update:modelValue', selected)
  }
  async function hydratePendingMetadata() {
    const current = context, selection = selectionRevision
    // Metadata failures do not prevent selection; the user can retry by refreshing.
    await Promise.all(props.modelValue.map(async row => {
      try {
        const version = row.policyFileId ? row : await fetchPolicyVersion(row.policyFileVersionId)
        const id = String(version.policyFileId)
        const detail = await fetchPolicy(id)
        if (current !== context || selection !== selectionRevision || saving.value) return
        metadata[id] = detail.policyFile
        const updated = props.modelValue.map(item => item.policyFileVersionId === row.policyFileVersionId ? { ...item, ...pendingEdits.get(item.policyFileVersionId), policyFileId: id, documentNumber: detail.policyFile.documentNumber || '' } : item)
        emit('update:modelValue', updated)
      } catch (e) { if (current === context) ElMessage.warning(`政策文号读取失败：${e.message}`) }
    }))
  }
  function edit(row, key, value) {
    const patch = { ...pendingEdits.get(row.policyFileVersionId), [key]: value }
    pendingEdits.set(row.policyFileVersionId, patch)
    emit('update:modelValue', props.modelValue.map(item => item.policyFileVersionId === row.policyFileVersionId ? { ...item, ...patch } : item))
  }
  async function loadReferences() {
    const revision = ++readRevision, id = props.versionId
    loading.value = Boolean(id); error.value = ''; references.value = []
    if (!id) return
    try {
      const result = await fetchPolicyReferences(id)
      if (revision !== readRevision) return
      if (!Array.isArray(result)) throw new Error('政策来源响应格式异常，请刷新后重试')
      references.value = result
      await Promise.all([...new Set(result.map(row => String(row.policyFileId || '')).filter(Boolean))].map(async id => {
        try { const detail = await fetchPolicy(id); if (revision === readRevision) metadata[id] = detail.policyFile }
        catch (e) { if (revision === readRevision) ElMessage.warning(`政策文号读取失败：${e.message}`) }
      }))
    } catch (e) { if (revision === readRevision) error.value = e.message || '政策来源读取失败' }
    finally { if (revision === readRevision) loading.value = false }
  }
  async function validateSources() {
    if (loading.value || saving.value || error.value) throw new Error(error.value || '请等待政策来源读取或保存完成')
    if (!sourceReferences.value.length && !props.modelValue.length) throw new Error('请选择至少一份政策文件来源；政策依据说明可以留空')
    for (const row of props.modelValue) {
      const version = await fetchPolicyVersion(row.policyFileVersionId)
      if ((version.publicationStatus || version.status) !== 'PUBLISHED') throw new Error(`${row.policyFileName} 的所选版本已不可用，请重新选择来源`)
    }
    return true
  }
  async function syncPendingSources() {
    if (!props.published || !props.versionId) throw new Error('请先发布指标版本')
    if (saving.value) throw new Error('政策来源正在保存')
    const current = context, id = props.versionId
    sourceSelect.value?.blur?.()
    selectionRevision++
    saving.value = true; error.value = ''
    try {
      const active = await fetchPolicyReferences(id)
      const known = new Set(active.filter(row => row.relationRole === 'SOURCE').map(row => String(row.policyFileVersionId)))
      const pending = props.modelValue.map(row => ({ ...row, ...pendingEdits.get(row.policyFileVersionId) }))
      let remaining = [...pending]
      for (const row of pending) {
        if (current !== context) throw new Error('指标版本已切换，请在原版本中确认政策来源')
        if (!known.has(row.policyFileVersionId)) {
          await createPolicyReference(id, { policyFileVersionId: row.policyFileVersionId, relationRole: 'SOURCE', citationLocation: row.citationLocation || '', citationText: row.citationText || '' })
          known.add(row.policyFileVersionId)
        }
        if (current !== context) return false
        remaining = remaining.filter(item => item.policyFileVersionId !== row.policyFileVersionId)
        pendingEdits.delete(row.policyFileVersionId)
        emit('update:modelValue', remaining)
      }
      await loadReferences()
      if (current !== context) return false
      if (error.value) throw new Error(error.value)
      return true
    } catch (e) { if (current === context) error.value = `指标已发布，政策来源尚未全部确认保存：${e.message}。请重试保存待绑定来源。`; throw e }
    finally { if (current === context) saving.value = false }
  }
  async function savePending() { try { if (await syncPendingSources()) ElMessage.success('政策来源已保存') } catch (e) { ElMessage.error(e.message) } }
  async function invalidate(row) {
    if (saving.value) return
    if (row.relationRole === 'SOURCE' && sourceReferences.value.length <= 1) return ElMessage.warning('至少需要保留一份政策来源，请先保存替代来源再失效当前来源')
    const current = context
    saving.value = true
    try {
      await ElMessageBox.confirm('确认使该政策引用失效？关联的政策依据也将一并失效。', '失效政策引用', { type: 'warning' })
      if (current !== context) return
      await invalidatePolicyReference(row.id, row.resourceVersion)
      if (current !== context) return
      await loadReferences()
    } catch (e) { if (current === context && e !== 'cancel' && e !== 'close') ElMessage.error(e.message) }
    finally { if (current === context) saving.value = false }
  }
  function copySourcesToDraft() {
    return [...sourceReferences.value.map(row => ({ policyFileVersionId: String(row.policyFileVersionId), policyFileId: String(row.policyFileId || ''), policyFileName: row.policyFileName, versionNo: row.policyVersionNo, documentNumber: metadata[row.policyFileId]?.documentNumber || '', citationLocation: row.citationLocation || '', citationText: row.citationText || '' })), ...props.modelValue]
  }
  watch(() => [props.versionId, props.published], () => { context++; selectionRevision++; pendingEdits.clear(); viewerId.value = ''; saving.value = false; void loadReferences() }, { immediate: true })
  watch(() => JSON.stringify([props.versionId, pendingIds.value]), hydratePendingMetadata, { immediate: true })
  onBeforeUnmount(() => { context++; readRevision++; searchRevision++ })
  return reactive({ references, options, loading, searching, saving, error, viewerId, metadata, sourceSelect, pendingIds, sourceReferences, savedIds, search, selectSources, edit, loadReferences, validateSources, syncPendingSources, savePending, invalidate, copySourcesToDraft })
}
