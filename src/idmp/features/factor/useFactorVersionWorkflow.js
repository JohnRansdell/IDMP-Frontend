import { getCurrentScope, onScopeDispose } from 'vue'
import { toOpaqueId } from '../../utils/resourceId.js'

const successes = new Set(['SUCCEEDED', 'SUCCESS'])
export const isFactorTaskTerminal = status => successes.has(status)
  || ['FAILED', 'CANCELED', 'CANCELLED', 'PARTIAL_SUCCEEDED'].includes(status)

// Page-specific definition validation, runtime parameters and publication gates stay at the caller.
export function useFactorVersionWorkflow({ workflow, loading, trialRows, trialPagination, api,
  notify, statusLabel = value => value, wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  afterCompile, onCompiled, formatDiagnostics = rows => (rows || []).map(row => row.message || row.code).filter(Boolean).join('；') }) {
  let disposed = false
  let revision = 0
  const current = (version, token) => !disposed && version === workflow.versionId && token === revision
  const taskSuccess = () => successes.has(workflow.taskStatus)
  function dispose() { disposed = true; revision++ }
  if (getCurrentScope()) onScopeDispose(dispose)
  function fail(error, fallback) {
    workflow.message = error?.message || fallback
    workflow.messageType = 'error'
    notify.error(workflow.message)
  }
  async function compile(payload = {}) {
    if (!workflow.versionId || loading.compile || workflow.published) return
    const version = workflow.versionId, token = ++revision
    loading.compile = true
    try {
      const result = await api.compile(version, payload)
      if (!current(version, token)) return
      const detail = await afterCompile?.(result, version)
      if (!current(version, token)) return
      workflow.artifactId = toOpaqueId(result?.artifactId ?? result?.id ?? result?.compileArtifactId)
      const status = String(result?.status ?? result?.compileStatus ?? '').toUpperCase()
      workflow.compiled = ['VALID', 'VALID_WITH_WARNINGS', 'VALIDATED', 'SUCCEEDED', 'SUCCESS'].includes(status)
      workflow.status = detail?.status ?? (workflow.compiled ? 'VALIDATED' : workflow.status)
      workflow.message = workflow.compiled ? `编译校验通过${workflow.artifactId ? `，产物 ID：${workflow.artifactId}` : ''}。`
        : `编译未通过：${formatDiagnostics(result?.diagnostics) || status || '请查看后端诊断信息'}`
      workflow.messageType = workflow.compiled ? 'success' : 'warning'
      if (workflow.compiled) { notify.success('编译校验通过'); await onCompiled?.() }
      else notify.warning(workflow.message)
    } catch (error) {
      if (current(version, token)) { workflow.compiled = false; fail(error, '因子编译失败') }
    } finally { loading.compile = false }
  }
  async function updateTask(version, taskId, token) {
    const task = await api.fetchTask(taskId)
    if (!current(version, token) || workflow.taskId !== taskId) return false
    workflow.taskStatus = String(task?.status ?? workflow.taskStatus).toUpperCase()
    workflow.batchId = toOpaqueId(task?.batchId ?? workflow.batchId)
    return true
  }
  async function pollTrialTask(version = workflow.versionId, token = revision) {
    const taskId = workflow.taskId
    for (let attempt = 0; attempt < 15; attempt++) {
      if (!current(version, token) || workflow.taskId !== taskId) return
      if (!await updateTask(version, taskId, token)) return
      if (isFactorTaskTerminal(workflow.taskStatus)) break
      if (attempt < 14) await wait(2000)
    }
    if (!current(version, token)) return
    workflow.message = taskSuccess() ? '试算任务已完成，正在读取结果。'
      : isFactorTaskTerminal(workflow.taskStatus) ? `试算任务结束，状态：${statusLabel(workflow.taskStatus)}`
        : '试算仍在处理中，可点击“继续查询并查看结果”。'
    workflow.messageType = taskSuccess() ? 'success' : isFactorTaskTerminal(workflow.taskStatus) ? 'warning' : 'info'
  }
  async function loadTrialResults(page = 1) {
    if (!workflow.versionId || !workflow.batchId || loading.result) return
    const version = workflow.versionId, batch = workflow.batchId, token = revision
    loading.result = true
    try {
      const result = await api.fetchResults(version, batch, page, trialPagination.size)
      if (!current(version, token) || batch !== workflow.batchId) return
      const payload = result?.data ?? result ?? {}
      const nestedRows = (payload.targets || []).flatMap(target => (target.resultSets || []).flatMap(set =>
        (set.results || []).map(row => ({ ...row, sourceDataStatus: set.sourceDataStatus,
          sourceRecordCount: set.sourceRecordCount, qualityStatus: row.qualityStatus ?? set.qualityStatus,
          status: row.status ?? set.status }))))
      const records = payload.results?.records ?? payload.records ?? payload.result?.records ?? nestedRows
      const scalar = payload.valueDecimal ?? payload.result?.valueDecimal ?? payload.resultValue ?? payload.value
      const rows = records.length ? records : scalar !== undefined && scalar !== null
        ? [{ valueDecimal: scalar, displayValue: payload.displayValue ?? payload.result?.displayValue ?? scalar,
          qualityStatus: payload.qualityStatus ?? payload.result?.qualityStatus }] : []
      Object.assign(trialPagination, { page: Number(payload.results?.pageNum ?? page),
        size: Number(payload.results?.pageSize ?? trialPagination.size), total: Number(payload.results?.total ?? rows.length) })
      trialRows.value = rows
      workflow.resultsLoaded = successes.has(String(payload.batchStatus ?? payload.status ?? 'SUCCEEDED').toUpperCase())
      workflow.qualityStatus = payload.qualityStatus ?? payload.result?.qualityStatus ?? rows[0]?.qualityStatus ?? ''
      if (!workflow.taskStatus) workflow.taskStatus = 'SUCCEEDED'
      if (!workflow.resultsLoaded) throw new Error(`试算结果状态为 ${statusLabel(payload.batchStatus ?? payload.status ?? 'UNKNOWN')}，尚未达到成功终态`)
      workflow.message = rows.length ? `试算完成，共 ${trialPagination.total} 条结果。` : '试算完成：该时间范围内没有匹配源数据。'
      workflow.messageType = 'success'
    } catch (error) {
      if (current(version, token) && batch === workflow.batchId) { workflow.resultsLoaded = false; fail(error, '试算结果读取失败') }
    }
    finally { loading.result = false }
  }
  async function refreshTrialStatus() {
    if (!workflow.taskId || loading.status) return
    const version = workflow.versionId, taskId = workflow.taskId, token = revision
    loading.status = true
    try {
      if (!await updateTask(version, taskId, token)) return
      workflow.message = `试算任务状态：${statusLabel(workflow.taskStatus)}`
      workflow.messageType = taskSuccess() ? 'success' : isFactorTaskTerminal(workflow.taskStatus) ? 'warning' : 'info'
      if (taskSuccess()) await loadTrialResults()
    } catch (error) { if (current(version, token)) fail(error, '试算任务状态查询失败') }
    finally { loading.status = false }
  }
  async function trial(payload) {
    if (!workflow.compiled || workflow.published || loading.compile || loading.trial || loading.result) return
    if (workflow.taskId && !isFactorTaskTerminal(workflow.taskStatus)) return refreshTrialStatus()
    if (taskSuccess() && workflow.batchId && !workflow.resultsLoaded) return loadTrialResults()
    const version = workflow.versionId, token = ++revision
    loading.trial = true
    trialRows.value = []
    workflow.resultsLoaded = false
    try {
      const accepted = await api.trial(version, payload, `factor-trial-${version}-${Date.now()}`)
      if (!current(version, token)) return
      workflow.taskId = toOpaqueId(accepted?.taskId ?? accepted?.asyncTaskId)
      workflow.batchId = toOpaqueId(accepted?.batchId)
      workflow.taskStatus = String(accepted?.status ?? 'QUEUED').toUpperCase()
      workflow.message = `试算任务已提交，批次 ID：${workflow.batchId || '-'}。正在等待后端完成。`
      workflow.messageType = 'info'
      notify.success('试算任务已提交')
      if (workflow.taskId) await pollTrialTask(version, token)
      if (current(version, token) && taskSuccess()) await loadTrialResults()
    } catch (error) { if (current(version, token)) fail(error, '因子试算失败') }
    finally { loading.trial = false }
  }
  async function publish(confirm) {
    if (!workflow.compiled || workflow.published || loading.compile || loading.trial || loading.result || loading.publish) return
    const version = workflow.versionId, token = revision
    try { await confirm(version) } catch { return }
    if (!current(version, token) || loading.publish) return
    loading.publish = true
    try {
      const result = await api.publish(version)
      if (!current(version, token)) return
      workflow.status = result?.status ?? result?.publicationStatus ?? 'PUBLISHED'
      workflow.published = true
      workflow.message = `因子版本 ${version} 已发布，可供指标引用。`
      workflow.messageType = 'success'
      notify.success('因子版本已发布')
    } catch (error) { if (current(version, token)) fail(error, '因子版本发布失败') }
    finally { loading.publish = false }
  }
  return { compile, trial, pollTrialTask, refreshTrialStatus, loadTrialResults, publish, dispose }
}
