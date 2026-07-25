<template>
  <div class="idmp-page factor-management">
    <PageHeader
      title="因子管理"
      eyebrow="指标配置"
      description="下方因子列表来自 demo.js；配置工作台调用现有因子接口，并使用页面内固定的住院死亡记录 COUNT 联调负载。"
      status-label="混合数据来源"
      status-tone="info"
    >
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="focusWorkbench">
            创建联调草稿
          </el-button>
          <el-button :icon="Upload" @click="showUnavailable('批量导入')">批量导入</el-button>
        </div>
      </template>
    </PageHeader>

    <section class="filter-card factor-filter" aria-label="因子筛选">
      <el-form :inline="true" @submit.prevent="applyFilters">
        <el-form-item>
          <el-input
            v-model.trim="form.code"
            clearable
            placeholder="因子编码"
            aria-label="按因子编码筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            clearable
            placeholder="因子名称"
            aria-label="按因子名称筛选"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" clearable placeholder="因子类型" aria-label="按因子类型筛选">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" clearable placeholder="业务分类" aria-label="按业务分类筛选">
            <el-option
              v-for="category in categoryOptions"
              :key="category"
              :label="category"
              :value="category"
            />
          </el-select>
        </el-form-item>
        <el-form-item class="filter-actions">
          <el-button type="primary" :icon="Search" native-type="submit">查询</el-button>
          <el-button :icon="Refresh" @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </section>

    <section ref="workbenchRef" class="surface-card factor-workbench">
      <div class="backend-chain-card__head">
        <div>
          <h2>因子配置工作台</h2>
          <p>固定验证负载：INPATIENT_DEATH_RECORD / COUNT(*) / PERSON_TIME；创建会写入真实后端，请先确认。</p>
        </div>
      </div>
      <div class="workflow-state" role="status" aria-live="polite">
        <StatusBadge
          :status="factorWorkflowStatus.code"
          :label="factorWorkflowStatus.label"
          :tone="factorWorkflowStatus.tone"
        />
        <span>{{ factorWorkflowStatus.detail }}</span>
      </div>
      <div class="workflow-card-grid">
        <article class="workflow-card">
          <span>步骤 1</span>
          <strong>保存因子定义</strong>
          <small>{{ factorWorkflow.factorId ? `因子 ${factorWorkflow.factorId} / 版本 ${factorWorkflow.versionId}` : '创建可计算因子草稿' }}</small>
          <el-button type="primary" :loading="factorWorkflowLoading.save" @click="saveFactorDefinitionOnly">
            保存定义
          </el-button>
        </article>
        <article class="workflow-card">
          <span>步骤 2</span>
          <strong>校验 DSL</strong>
          <small>{{ factorWorkflow.artifactId ? `计算产物 ${factorWorkflow.artifactId}` : '生成并检查计算产物' }}</small>
          <el-button :disabled="!factorWorkflow.versionId" :loading="factorWorkflowLoading.compile" @click="compileFactorOnly">
            校验 DSL
          </el-button>
        </article>
        <article class="workflow-card">
          <span>步骤 3</span>
          <strong>试算与结果确认</strong>
          <small>{{ hasTrialResult ? `结果 ${factorWorkflow.resultValue}` : factorWorkflow.batchId ? `批次 ${factorWorkflow.batchId}` : '发起试算后查看结果' }}</small>
          <div class="workflow-card__actions">
            <el-button :disabled="!factorWorkflow.artifactId" :loading="factorWorkflowLoading.trial" @click="trialFactorOnly">
              发起试算
            </el-button>
            <el-button :disabled="!factorWorkflow.batchId" :loading="factorWorkflowLoading.result" @click="loadFactorResultOnly">
              查看结果
            </el-button>
          </div>
        </article>
        <article class="workflow-card">
          <span>步骤 4</span>
          <strong>发布因子版本</strong>
          <small>{{ factorWorkflow.publishStatus ? `状态 ${factorWorkflow.publishStatus}` : '发布后可供指标公式引用' }}</small>
          <el-button type="primary" :disabled="!hasTrialResult" :loading="factorWorkflowLoading.publish" @click="publishFactorOnly">
            发布版本
          </el-button>
        </article>
      </div>
    </section>

    <section class="surface-card backend-chain-card">
      <div class="backend-chain-card__head">
        <div>
          <h2>开发验证工具（完整流程）</h2>
          <p>用于一次性验证因子接口闭环；正式演示请使用上方工作台分步操作。</p>
        </div>
        <el-button type="primary" :loading="backendChainLoading" @click="runFactorBackendChain">
          一键验证完整流程
        </el-button>
      </div>
      <div class="backend-chain-meta">
        <span>测试数据域</span>
        <strong>INPATIENT_DEATH_RECORD</strong>
        <span>聚合方式</span>
        <strong>COUNT(*)</strong>
        <span>试算周期</span>
        <strong>2000-01-01 至 2030-01-01</strong>
      </div>
      <div class="backend-chain-steps">
        <article
          v-for="step in backendChainSteps"
          :key="step.key"
          class="backend-step"
          :class="`is-${step.status}`"
        >
          <span>{{ step.label }}</span>
          <strong>{{ step.statusText }}</strong>
          <small>{{ step.detail }}</small>
        </article>
      </div>
      <div v-if="backendChainResult" class="backend-chain-result">
        <span>最新结果</span>
        <strong>{{ backendChainResult.resultValue }}</strong>
        <small>
          因子 {{ backendChainResult.factorId }} / 版本 {{ backendChainResult.versionId }} /
          批次 {{ backendChainResult.batchId }} / {{ backendChainResult.publishStatus }}
        </small>
      </div>
    </section>

    <section class="surface-card factor-table-card" aria-label="因子列表">
      <div class="table-scroll">
        <el-table
          :data="filteredRows"
          table-layout="fixed"
          empty-text="暂无符合条件的因子"
          class="factor-table"
        >
          <el-table-column prop="code" label="因子编码" width="104">
            <template #default="{ row }">
              <button class="code-link" type="button" @click="showUnavailable('因子详情')">
                {{ row.code }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="因子名称" min-width="250" show-overflow-tooltip />
          <el-table-column label="类型" width="88">
            <template #default="{ row }">{{ row.type.replace('因子', '') }}</template>
          </el-table-column>
          <el-table-column prop="category" label="业务分类" width="102" />
          <el-table-column prop="aggregation" label="聚合方式" width="145" />
          <el-table-column prop="domain" label="数据域" min-width="145" show-overflow-tooltip />
          <el-table-column label="引用次数" width="102" align="center">
            <template #default="{ row }">
              <span class="reference-count">{{ row.references }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="106">
            <template #default="{ row }">
              <StatusBadge
                :status="row.status === '已发布' ? 'PUBLISHED' : 'DRAFT'"
                :label="row.status"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="188" fixed="right">
            <template #default="{ row }">
              <button class="action-link" type="button" @click="showUnavailable(`${row.name}详情`)">
                查看
              </button>
              <button class="action-link" type="button" @click="showUnavailable(`${row.name}编辑`)">
                编辑
              </button>
              <button class="action-link" type="button" @click="showUnavailable(`${row.name}引用分析`)">
                引用分析
              </button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="table-footer">
        <span v-if="hasActiveFilters">筛选到 {{ filteredRows.length }} 条演示数据</span>
        <span v-else>共 35 条</span>
        <span class="table-footer__hint">当前展示 {{ filteredRows.length }} 条</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import {
  compileFactorVersion,
  createFactor,
  fetchCompileArtifact,
  fetchFactorTrialResults,
  publishFactorVersion,
  trialFactorVersion
} from '@/idmp/api/modules/factors'
import { fetchAsyncTask, fetchCalcBatch } from '@/idmp/api/modules/calculation'
import { factorRows } from '@/idmp/data/demo'

const emptyFilters = () => ({
  code: '',
  name: '',
  type: '',
  category: ''
})

const form = reactive(emptyFilters())
const filters = reactive(emptyFilters())
const backendChainLoading = ref(false)
const backendChainResult = ref(null)
const backendChainSteps = ref(createBackendChainSteps())
const workbenchRef = ref()
const factorWorkflow = reactive({
  factorId: '',
  versionId: '',
  artifactId: '',
  taskId: '',
  batchId: '',
  resultValue: '',
  publishStatus: ''
})
const factorWorkflowStatus = reactive({
  code: 'DRAFT',
  label: '尚未开始',
  tone: 'neutral',
  detail: '尚未向后端创建因子；页面刷新后本次工作台状态不会恢复。'
})
const factorWorkflowLoading = reactive({
  save: false,
  compile: false,
  trial: false,
  result: false,
  publish: false
})

const categoryOptions = [...new Set(factorRows.map((item) => item.category))]

const hasActiveFilters = computed(() => Object.values(filters).some(Boolean))
const hasTrialResult = computed(() =>
  factorWorkflow.resultValue !== '' &&
  factorWorkflow.resultValue !== null &&
  factorWorkflow.resultValue !== undefined &&
  factorWorkflow.resultValue !== '-'
)

const filteredRows = computed(() => {
  const code = filters.code.toLowerCase()
  const name = filters.name.toLowerCase()

  return factorRows.filter((row) => {
    return (
      (!code || row.code.toLowerCase().includes(code)) &&
      (!name || row.name.toLowerCase().includes(name)) &&
      (!filters.type || row.type === filters.type) &&
      (!filters.category || row.category === filters.category)
    )
  })
})

const applyFilters = () => {
  Object.assign(filters, form)
}

const resetFilters = () => {
  Object.assign(form, emptyFilters())
  Object.assign(filters, emptyFilters())
}

function createBackendChainSteps() {
  return [
    { key: 'createFactor', label: '保存因子定义', status: 'pending', statusText: '待执行', detail: '生成因子草稿' },
    { key: 'compile', label: '校验 DSL', status: 'pending', statusText: '待执行', detail: '生成计算产物' },
    { key: 'artifact', label: '检查计算产物', status: 'pending', statusText: '待执行', detail: '确认产物可执行' },
    { key: 'trial', label: '发起试算', status: 'pending', statusText: '待执行', detail: '提交因子试算任务' },
    { key: 'task', label: '等待计算完成', status: 'pending', statusText: '待执行', detail: '跟踪异步任务状态' },
    { key: 'batch', label: '检查计算批次', status: 'pending', statusText: '待执行', detail: '确认批次与节点状态' },
    { key: 'results', label: '查看试算结果', status: 'pending', statusText: '待执行', detail: '读取因子计算结果' },
    { key: 'publish', label: '发布因子版本', status: 'pending', statusText: '待执行', detail: '允许指标公式引用' }
  ]
}

function resetBackendChainSteps() {
  backendChainSteps.value = createBackendChainSteps()
}

function setBackendStep(key, status, detail = '') {
  backendChainSteps.value = backendChainSteps.value.map((step) =>
    step.key === key
      ? {
          ...step,
          status,
          statusText: status === 'success' ? '成功' : status === 'running' ? '执行中' : status === 'error' ? '失败' : '待执行',
          detail: detail || step.detail
        }
      : step
  )
}

function resetFactorWorkflowAfterSave(factor, versionId) {
  Object.assign(factorWorkflow, {
    factorId: toOpaqueId(factor.id ?? factor.factorId),
    versionId: toOpaqueId(versionId),
    artifactId: '',
    taskId: '',
    batchId: '',
    resultValue: '',
    publishStatus: ''
  })
}

async function saveFactorDefinitionOnly() {
  const confirmed = await confirmOperation(
    '将使用页面标注的固定 COUNT 联调负载，在真实后端创建因子及草稿版本。是否继续？',
    '确认创建因子草稿'
  )
  if (!confirmed) return

  factorWorkflowLoading.save = true
  setWorkflowStatus('RUNNING', '正在创建', '正在提交固定验证负载，请勿重复操作。', 'info')
  try {
    const suffix = createBackendCodeSuffix()
    const factor = await createFactor(createCountFactorPayload(suffix))
    const versionId = factor.draftVersionId ?? factor.versionId ?? factor.currentVersionId
    if (!versionId) throw new Error('后端未返回因子版本 ID')
    resetFactorWorkflowAfterSave(factor, versionId)
    setWorkflowStatus('DRAFT', '草稿已创建', `因子 ${factorWorkflow.factorId || '-'} / 版本 ${factorWorkflow.versionId}`, 'neutral')
    ElMessage.success('因子定义已保存')
  } catch (error) {
    setWorkflowStatus('FAILED', '创建失败', error?.message || '因子定义保存失败', 'danger')
    ElMessage.error(error?.message || '因子定义保存失败')
  } finally {
    factorWorkflowLoading.save = false
  }
}

async function compileFactorOnly() {
  if (!factorWorkflow.versionId) {
    ElMessage.warning('请先保存因子定义')
    return
  }

  factorWorkflowLoading.compile = true
  setWorkflowStatus('VALIDATING', '正在校验', `正在校验版本 ${factorWorkflow.versionId} 的 DSL。`, 'info')
  try {
    const compile = await compileFactorVersion(factorWorkflow.versionId, {
      compileMode: 'VALIDATE_AND_GENERATE',
      includePlanAssessment: true
    })
    const artifactId = toOpaqueId(compile.artifactId)
    if (!artifactId) throw new Error('后端未返回计算产物 ID')
    const artifact = await fetchCompileArtifact(artifactId)
    if (artifact.status === 'VALID') {
      factorWorkflow.artifactId = artifactId
      setWorkflowStatus('VALIDATED', 'DSL 已验证', `计算产物 ${factorWorkflow.artifactId}`, 'success')
      ElMessage.success('DSL 校验通过')
    } else {
      factorWorkflow.artifactId = ''
      setWorkflowStatus('VALIDATING', '校验未通过', `后端返回状态 ${artifact.status || '未知'}`, 'warning')
      ElMessage.warning(`DSL 校验状态：${artifact.status || '未知'}`)
    }
  } catch (error) {
    setWorkflowStatus('FAILED', '校验失败', error?.message || 'DSL 校验失败', 'danger')
    ElMessage.error(error?.message || 'DSL 校验失败')
  } finally {
    factorWorkflowLoading.compile = false
  }
}

async function trialFactorOnly() {
  if (!factorWorkflow.artifactId) {
    ElMessage.warning('请先完成 DSL 校验')
    return
  }

  factorWorkflowLoading.trial = true
  setWorkflowStatus('RUNNING', '试算运行中', `版本 ${factorWorkflow.versionId} 正在提交异步试算。`, 'info')
  try {
    const suffix = createBackendCodeSuffix()
    const trial = await trialFactorVersion(
      factorWorkflow.versionId,
      { periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' },
      `factor-workflow-${suffix}`
    )
    factorWorkflow.taskId = toOpaqueId(trial.taskId)
    factorWorkflow.batchId = toOpaqueId(trial.batchId)
    if (!factorWorkflow.taskId || !factorWorkflow.batchId) {
      throw new Error('后端未返回试算任务或批次 ID')
    }
    const task = await pollBackendTask(trial.taskId)
    if (task.status === 'SUCCEEDED') {
      setWorkflowStatus('SUCCEEDED', '试算已完成', `批次 ${factorWorkflow.batchId} 已完成，等待读取结果。`, 'success')
      ElMessage.success('因子试算已完成，可以查看结果')
    } else {
      setWorkflowStatus(task.status || 'FAILED', '试算未成功', `异步任务状态 ${task.status || '未知'}`, 'warning')
      ElMessage.warning(`因子试算任务状态：${task.status || '未知'}`)
    }
  } catch (error) {
    setWorkflowStatus('FAILED', '试算失败', error?.message || '因子试算失败', 'danger')
    ElMessage.error(error?.message || '因子试算失败')
  } finally {
    factorWorkflowLoading.trial = false
  }
}

async function loadFactorResultOnly() {
  if (!factorWorkflow.batchId) {
    ElMessage.warning('请先发起因子试算')
    return
  }

  factorWorkflowLoading.result = true
  try {
    const batch = await pollBackendBatch(factorWorkflow.batchId)
    if (batch.status !== 'SUCCEEDED') {
      throw new Error(`因子计算批次未成功：${batch.status || '未知状态'}`)
    }
    const resultSet = await pollFactorResults(factorWorkflow.versionId, factorWorkflow.batchId)
    const record = resultSet.results?.records?.[0]
    factorWorkflow.resultValue = record?.valueDecimal ?? '-'
    if (hasTrialResult.value) {
      setWorkflowStatus('VALIDATED', '结果已确认', `试算结果 ${factorWorkflow.resultValue}，可以进入发布确认。`, 'success')
      ElMessage.success('因子试算结果已读取')
    } else {
      setWorkflowStatus('FAILED', '未返回试算结果', '批次已查询，但没有可用于发布的结果记录。', 'warning')
      ElMessage.warning('未读取到可发布的因子试算结果')
    }
  } catch (error) {
    setWorkflowStatus('FAILED', '结果读取失败', error?.message || '因子试算结果读取失败', 'danger')
    ElMessage.error(error?.message || '因子试算结果读取失败')
  } finally {
    factorWorkflowLoading.result = false
  }
}

async function publishFactorOnly() {
  if (!hasTrialResult.value) {
    ElMessage.warning('请先确认因子试算结果')
    return
  }

  const confirmed = await confirmOperation(
    `将发布因子版本 ${factorWorkflow.versionId}；已发布版本应保持不可变。当前试算结果为 ${factorWorkflow.resultValue}。是否继续？`,
    '确认发布因子版本'
  )
  if (!confirmed) return

  factorWorkflowLoading.publish = true
  setWorkflowStatus('RUNNING', '正在发布', `正在发布版本 ${factorWorkflow.versionId}。`, 'info')
  try {
    const published = await publishFactorVersion(factorWorkflow.versionId)
    factorWorkflow.publishStatus = published.status || 'PUBLISHED'
    setWorkflowStatus('PUBLISHED', '版本已发布', `后端状态 ${factorWorkflow.publishStatus}`, 'success')
    ElMessage.success('因子版本已发布')
  } catch (error) {
    setWorkflowStatus('FAILED', '发布失败', error?.message || '因子版本发布失败', 'danger')
    ElMessage.error(error?.message || '因子版本发布失败')
  } finally {
    factorWorkflowLoading.publish = false
  }
}

async function runFactorBackendChain() {
  const confirmed = await confirmOperation(
    '该操作会在真实后端依次创建、编译、试算并发布一个固定 COUNT 因子，可能产生持久业务数据。是否继续？',
    '确认执行完整接口闭环'
  )
  if (!confirmed) return

  backendChainLoading.value = true
  backendChainResult.value = null
  resetBackendChainSteps()
  let activeStep = ''

  try {
    const suffix = createBackendCodeSuffix()
    activeStep = 'createFactor'
    setBackendStep('createFactor', 'running')
    const factor = await createFactor(createCountFactorPayload(suffix))
    const versionId = toOpaqueId(factor.draftVersionId ?? factor.versionId ?? factor.currentVersionId)
    if (!versionId) throw new Error('后端未返回因子版本 ID')
    const factorId = toOpaqueId(factor.id ?? factor.factorId)
    setBackendStep('createFactor', 'success', `因子ID ${factorId || '-'}，版本ID ${versionId}`)

    activeStep = 'compile'
    setBackendStep('compile', 'running')
    const compile = await compileFactorVersion(versionId, {
      compileMode: 'VALIDATE_AND_GENERATE',
      includePlanAssessment: false
    })
    const artifactId = toOpaqueId(compile.artifactId)
    if (!artifactId) throw new Error('后端未返回计算产物 ID')
    setBackendStep('compile', 'success', `产物 ${artifactId}，${compile.status}`)

    activeStep = 'artifact'
    setBackendStep('artifact', 'running')
    const artifact = await fetchCompileArtifact(artifactId)
    setBackendStep('artifact', artifact.status === 'VALID' ? 'success' : 'error', `状态 ${artifact.status}`)
    if (artifact.status !== 'VALID') {
      throw new Error(`计算产物不可执行：${artifact.status || '未知状态'}`)
    }

    activeStep = 'trial'
    setBackendStep('trial', 'running')
    const trial = await trialFactorVersion(
      versionId,
      { periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' },
      `factor-management-${suffix}`
    )
    const taskId = toOpaqueId(trial.taskId)
    const batchId = toOpaqueId(trial.batchId)
    if (!taskId || !batchId) throw new Error('后端未返回试算任务或批次 ID')
    setBackendStep('trial', 'success', `任务 ${taskId}，批次 ${batchId}`)

    activeStep = 'task'
    setBackendStep('task', 'running')
    const task = await pollBackendTask(taskId)
    setBackendStep('task', task.status === 'SUCCEEDED' ? 'success' : 'error', `状态 ${task.status}`)
    if (task.status !== 'SUCCEEDED') {
      throw new Error(`因子试算任务未成功：${task.status || '未知状态'}`)
    }

    activeStep = 'batch'
    setBackendStep('batch', 'running')
    const batch = await pollBackendBatch(batchId)
    setBackendStep('batch', batch.status === 'SUCCEEDED' ? 'success' : 'error', `状态 ${batch.status}`)
    if (batch.status !== 'SUCCEEDED') {
      throw new Error(`因子计算批次未成功：${batch.status || '未知状态'}`)
    }

    activeStep = 'results'
    setBackendStep('results', 'running')
    const resultSet = await pollFactorResults(versionId, batchId)
    const record = resultSet.results?.records?.[0]
    if (record?.valueDecimal === undefined || record?.valueDecimal === null) {
      throw new Error('因子试算未返回可发布的结果')
    }
    setBackendStep('results', 'success', `结果 ${record?.valueDecimal ?? '-'}`)

    activeStep = 'publish'
    setBackendStep('publish', 'running')
    const published = await publishFactorVersion(versionId)
    setBackendStep('publish', published.status === 'PUBLISHED' ? 'success' : 'error', `状态 ${published.status}`)
    if (published.status !== 'PUBLISHED') {
      throw new Error(`因子版本未发布：${published.status || '未知状态'}`)
    }

    backendChainResult.value = {
      factorId,
      versionId,
      batchId,
      resultValue: record?.valueDecimal ?? '-',
      publishStatus: published.status || '-'
    }
    ElMessage.success('因子创建、试算并发布成功')
  } catch (error) {
    if (activeStep) setBackendStep(activeStep, 'error', error?.message || '接口调用失败')
    ElMessage.error(error?.message || '因子创建、试算或发布失败')
  } finally {
    backendChainLoading.value = false
  }
}

function createCountFactorPayload(suffix) {
  return {
    code: `FRONTEND_TEST_FACTOR_${suffix}`,
    name: `前端联调因子 ${suffix}`,
    description: '前端因子管理闭环联调创建：统计住院死亡记录数',
    dsl: {
      schemaVersion: '1.0',
      dslType: 'FACTOR',
      primaryDomain: { domainCode: 'INPATIENT_DEATH_RECORD' },
      filters: { nodeType: 'TRUE' },
      aggregation: { function: 'COUNT' },
      groupBy: [],
      parameters: [],
      output: {
        valueType: 'DECIMAL',
        semanticKind: 'MEASURE',
        dimension: 'COUNT',
        unit: 'PERSON_TIME',
        nullable: false,
        precision: 30,
        scale: 10,
        grain: []
      }
    }
  }
}

async function pollBackendTask(taskId) {
  let task = await fetchAsyncTask(taskId)
  for (const waitMs of POLL_DELAYS) {
    if (TERMINAL_TASK_STATUSES.includes(task.status)) break
    await delay(waitMs)
    task = await fetchAsyncTask(taskId)
  }
  return task
}

async function pollBackendBatch(batchId) {
  let batch = await fetchCalcBatch(batchId)
  for (const waitMs of POLL_DELAYS) {
    if (TERMINAL_TASK_STATUSES.includes(batch.status)) break
    await delay(waitMs)
    batch = await fetchCalcBatch(batchId)
  }
  return batch
}

async function pollFactorResults(versionId, batchId) {
  let lastError
  for (let index = 0; index <= POLL_DELAYS.length; index += 1) {
    try {
      return await fetchFactorTrialResults(versionId, batchId)
    } catch (error) {
      lastError = error
      if (index < POLL_DELAYS.length) await delay(POLL_DELAYS[index])
    }
  }
  throw lastError || new Error('因子结果查询超时')
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const POLL_DELAYS = [1000, 2000, 3000, 5000, 10000, 10000]
const TERMINAL_TASK_STATUSES = [
  'SUCCEEDED',
  'PARTIAL_SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'CANCELED'
]

function createBackendCodeSuffix() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17)
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${timestamp}_${random}`
}

function toOpaqueId(value) {
  return value === null || value === undefined ? '' : String(value)
}

function setWorkflowStatus(code, label, detail, tone) {
  Object.assign(factorWorkflowStatus, { code, label, detail, tone })
}

async function confirmOperation(message, title) {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '确认继续',
      cancelButtonText: '取消'
    })
    return true
  } catch {
    return false
  }
}

function focusWorkbench() {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  workbenchRef.value?.scrollIntoView({
    behavior: reducedMotion ? 'auto' : 'smooth',
    block: 'start'
  })
}

const showUnavailable = (capability) => {
  ElMessage.info(`${capability}尚未接入真实接口，当前演示列表不会伪造操作结果。`)
}
</script>

<style scoped lang="scss">
.factor-management {
  min-width: 0;
}

.factor-filter {
  margin-bottom: 16px;
  padding: 16px;

  :deep(.el-form) {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  :deep(.el-form-item) {
    margin: 0;
  }

  :deep(.el-input) {
    width: 178px;
  }

  :deep(.el-select) {
    width: 136px;
  }
}

.filter-actions {
  margin-left: 2px !important;
}

.factor-workbench {
  margin-bottom: 16px;
  padding: 16px 18px;
}

.workflow-state {
  display: flex;
  align-items: center;
  gap: var(--idmp-space-3);
  margin-top: var(--idmp-space-3);
  padding: var(--idmp-space-2) var(--idmp-space-3);
  border-left: 3px solid var(--idmp-support-info);
  background: var(--idmp-layer-02);
  color: var(--idmp-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.workflow-card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.workflow-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 150px;
  padding: 14px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-01);

  > span {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  > strong {
    margin: 7px 0 6px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 20px;
  }

  > small {
    min-height: 36px;
    margin-bottom: 14px;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }

  > .el-button,
  .workflow-card__actions {
    margin-top: auto;
  }
}

.workflow-card__actions {
  display: flex;
  gap: 8px;

  .el-button {
    flex: 1;
    margin: 0;
  }
}

.backend-chain-card {
  margin-bottom: 16px;
  padding: 16px 18px;
}

.backend-chain-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;

  h2 {
    margin: 0 0 4px;
    color: var(--idmp-text-primary);
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

.backend-chain-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 12px 0;
  padding: 9px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-interactive-subtle);

  span {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  strong {
    color: var(--idmp-interactive);
    font-size: 13px;
  }
}

.backend-chain-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.backend-step {
  min-width: 0;
  min-height: 82px;
  padding: 10px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: var(--idmp-radius-md);
  background: var(--idmp-layer-01);

  span,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  strong {
    display: block;
    margin: 7px 0;
    color: var(--idmp-text-secondary);
    font-size: 15px;
    line-height: 20px;
  }

  small {
    color: var(--idmp-text-disabled);
    font-size: 12px;
  }

  &.is-running {
    border-color: var(--idmp-support-info);
    background: var(--idmp-support-info-bg);

    strong {
      color: var(--idmp-support-info);
    }
  }

  &.is-success {
    border-color: var(--idmp-support-success);
    background: var(--idmp-support-success-bg);

    strong {
      color: var(--idmp-support-success);
    }
  }

  &.is-error {
    border-color: var(--idmp-support-danger);
    background: var(--idmp-support-danger-bg);

    strong {
      color: var(--idmp-support-danger);
    }
  }
}

.backend-chain-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--idmp-border-soft);

  span,
  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  strong {
    color: var(--idmp-interactive);
    font-size: 20px;
  }
}

.factor-table-card {
  min-width: 0;
  padding: 16px 16px 12px;
}

.table-scroll {
  min-width: 0;
  overflow-x: auto;
}

.factor-table {
  min-width: 1080px;

  :deep(th.el-table__cell) {
    height: 46px;
    padding: 0;
    color: var(--idmp-text-primary);
    font-weight: 600;
    background: var(--idmp-layer-02);
  }

  :deep(td.el-table__cell) {
    height: 47px;
    padding: 0;
    color: var(--idmp-text-secondary);
  }

  :deep(.cell) {
    line-height: 20px;
  }
}

.code-link,
.action-link {
  padding: 0;
  font: inherit;
  color: var(--idmp-interactive);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.code-link {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

.action-link {
  margin-right: 0;

  & + & {
    margin-left: 13px;
  }
}

.reference-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  color: var(--idmp-support-info);
  font-size: 12px;
  line-height: 22px;
  background: var(--idmp-support-info-bg);
  border-radius: var(--idmp-radius-sm);
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  padding: 11px 4px 0;
  color: var(--idmp-text-helper);
  font-size: 13px;
}

.table-footer__hint {
  color: var(--idmp-text-disabled);
}

@media (max-width: 1450px) {
  .workflow-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .factor-filter {
    :deep(.el-input) {
      width: 158px;
    }
  }
}
</style>
