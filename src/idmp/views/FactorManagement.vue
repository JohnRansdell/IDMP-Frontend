<template>
  <div class="idmp-page factor-management">
    <PageHeader title="因子管理">
      <template #actions>
        <div class="page-toolbar">
          <el-button type="primary" :icon="Plus" @click="handleLightAction('新增因子')">
            新增因子
          </el-button>
          <el-button :icon="Upload" @click="showUnavailable">批量导入</el-button>
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
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model.trim="form.name"
            clearable
            placeholder="因子名称"
            @keyup.enter="applyFilters"
          />
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.type" clearable placeholder="因子类型">
            <el-option label="原子因子" value="原子因子" />
            <el-option label="组合因子" value="组合因子" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-select v-model="form.category" clearable placeholder="业务分类">
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

    <section class="surface-card factor-workbench">
      <div class="backend-chain-card__head">
        <div>
          <h2>因子配置工作台</h2>
          <p>按业务步骤完成因子定义、DSL 校验、试算确认和版本发布，发布后的版本可以被指标公式引用。</p>
        </div>
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
          <small>{{ factorWorkflow.resultValue ? `结果 ${factorWorkflow.resultValue}` : factorWorkflow.batchId ? `批次 ${factorWorkflow.batchId}` : '发起试算后查看结果' }}</small>
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
          <el-button type="primary" :disabled="!factorWorkflow.resultValue" :loading="factorWorkflowLoading.publish" @click="publishFactorOnly">
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
              <button class="code-link" type="button" @click="handleLightAction('查看因子')">
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
              <span
                class="status-pill"
                :class="{ 'is-muted': row.status !== '已发布' }"
              >
                {{ row.status }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="188" fixed="right">
            <template #default>
              <button class="action-link" type="button" @click="handleLightAction('查看因子')">
                查看
              </button>
              <button class="action-link" type="button" @click="handleLightAction('编辑因子')">
                编辑
              </button>
              <button class="action-link" type="button" @click="handleLightAction('引用分析')">
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
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
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
const factorWorkflow = reactive({
  factorId: '',
  versionId: '',
  artifactId: '',
  taskId: '',
  batchId: '',
  resultValue: '',
  publishStatus: ''
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
    factorId: factor.id,
    versionId,
    artifactId: '',
    taskId: '',
    batchId: '',
    resultValue: '',
    publishStatus: ''
  })
}

async function saveFactorDefinitionOnly() {
  factorWorkflowLoading.save = true
  try {
    const suffix = createBackendCodeSuffix()
    const factor = await createFactor(createCountFactorPayload(suffix))
    const versionId = factor.draftVersionId || factor.versionId || factor.currentVersionId
    if (!versionId) throw new Error('后端未返回因子版本 ID')
    resetFactorWorkflowAfterSave(factor, versionId)
    ElMessage.success('因子定义已保存')
  } catch (error) {
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
  try {
    const compile = await compileFactorVersion(factorWorkflow.versionId, {
      compileMode: 'VALIDATE_AND_GENERATE',
      includePlanAssessment: true
    })
    const artifact = await fetchCompileArtifact(compile.artifactId)
    factorWorkflow.artifactId = compile.artifactId
    if (artifact.status === 'VALID') {
      ElMessage.success('DSL 校验通过')
    } else {
      ElMessage.warning(`DSL 校验状态：${artifact.status || '未知'}`)
    }
  } catch (error) {
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
  try {
    const suffix = createBackendCodeSuffix()
    const trial = await trialFactorVersion(
      factorWorkflow.versionId,
      { periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' },
      `factor-workflow-${suffix}`
    )
    factorWorkflow.taskId = trial.taskId
    factorWorkflow.batchId = trial.batchId
    const task = await pollBackendTask(trial.taskId)
    if (task.status === 'SUCCEEDED') {
      ElMessage.success('因子试算已完成，可以查看结果')
    } else {
      ElMessage.warning(`因子试算任务状态：${task.status || '未知'}`)
    }
  } catch (error) {
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
    await pollBackendBatch(factorWorkflow.batchId)
    const resultSet = await pollFactorResults(factorWorkflow.versionId, factorWorkflow.batchId)
    const record = resultSet.results?.records?.[0]
    factorWorkflow.resultValue = record?.valueDecimal ?? '-'
    ElMessage.success('因子试算结果已读取')
  } catch (error) {
    ElMessage.error(error?.message || '因子试算结果读取失败')
  } finally {
    factorWorkflowLoading.result = false
  }
}

async function publishFactorOnly() {
  if (!factorWorkflow.resultValue) {
    ElMessage.warning('请先确认因子试算结果')
    return
  }

  factorWorkflowLoading.publish = true
  try {
    const published = await publishFactorVersion(factorWorkflow.versionId)
    factorWorkflow.publishStatus = published.status || 'PUBLISHED'
    ElMessage.success('因子版本已发布')
  } catch (error) {
    ElMessage.error(error?.message || '因子版本发布失败')
  } finally {
    factorWorkflowLoading.publish = false
  }
}

async function runFactorBackendChain() {
  backendChainLoading.value = true
  backendChainResult.value = null
  resetBackendChainSteps()
  let activeStep = ''

  try {
    const suffix = createBackendCodeSuffix()
    activeStep = 'createFactor'
    setBackendStep('createFactor', 'running')
    const factor = await createFactor(createCountFactorPayload(suffix))
    const versionId = factor.draftVersionId || factor.versionId || factor.currentVersionId
    if (!versionId) throw new Error('后端未返回因子版本 ID')
    setBackendStep('createFactor', 'success', `因子ID ${factor.id}，版本ID ${versionId}`)

    activeStep = 'compile'
    setBackendStep('compile', 'running')
    const compile = await compileFactorVersion(versionId, {
      compileMode: 'VALIDATE_AND_GENERATE',
      includePlanAssessment: false
    })
    setBackendStep('compile', 'success', `产物 ${compile.artifactId}，${compile.status}`)

    activeStep = 'artifact'
    setBackendStep('artifact', 'running')
    const artifact = await fetchCompileArtifact(compile.artifactId)
    setBackendStep('artifact', artifact.status === 'VALID' ? 'success' : 'error', `状态 ${artifact.status}`)

    activeStep = 'trial'
    setBackendStep('trial', 'running')
    const trial = await trialFactorVersion(
      versionId,
      { periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' },
      `factor-management-${suffix}`
    )
    const taskId = trial.taskId
    const batchId = trial.batchId
    setBackendStep('trial', 'success', `任务 ${taskId}，批次 ${batchId}`)

    activeStep = 'task'
    setBackendStep('task', 'running')
    const task = await pollBackendTask(taskId)
    setBackendStep('task', task.status === 'SUCCEEDED' ? 'success' : 'error', `状态 ${task.status}`)

    activeStep = 'batch'
    setBackendStep('batch', 'running')
    const batch = await pollBackendBatch(batchId)
    setBackendStep('batch', batch.status === 'SUCCEEDED' ? 'success' : 'error', `状态 ${batch.status}`)

    activeStep = 'results'
    setBackendStep('results', 'running')
    const resultSet = await pollFactorResults(versionId, batchId)
    const record = resultSet.results?.records?.[0]
    setBackendStep('results', 'success', `结果 ${record?.valueDecimal ?? '-'}`)

    activeStep = 'publish'
    setBackendStep('publish', 'running')
    const published = await publishFactorVersion(versionId)
    setBackendStep('publish', published.status === 'PUBLISHED' ? 'success' : 'error', `状态 ${published.status}`)

    backendChainResult.value = {
      factorId: factor.id,
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
  for (let index = 0; index < 24 && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(task.status); index += 1) {
    await delay(1000)
    task = await fetchAsyncTask(taskId)
  }
  return task
}

async function pollBackendBatch(batchId) {
  let batch = await fetchCalcBatch(batchId)
  for (let index = 0; index < 10 && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(batch.status); index += 1) {
    await delay(1000)
    batch = await fetchCalcBatch(batchId)
  }
  return batch
}

async function pollFactorResults(versionId, batchId) {
  let lastError
  for (let index = 0; index < 12; index += 1) {
    try {
      return await fetchFactorTrialResults(versionId, batchId)
    } catch (error) {
      lastError = error
      await delay(1000)
    }
  }
  throw lastError || new Error('因子结果查询超时')
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createBackendCodeSuffix() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 17)
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${timestamp}_${random}`
}

const showUnavailable = () => {
  ElMessage.info('演示版暂不可用')
}

const handleLightAction = (action) => {
  ElMessage.success(`${action}操作已触发`)
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
  border: 1px solid #e5e8ef;
  border-radius: 6px;
  background: #fff;

  > span {
    color: #8c8c8c;
    font-size: 12px;
  }

  > strong {
    margin: 7px 0 6px;
    color: #262626;
    font-size: 15px;
    line-height: 20px;
  }

  > small {
    min-height: 36px;
    margin-bottom: 14px;
    color: #8c8c8c;
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
    color: #262626;
    font-size: 15px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
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
  border: 1px solid #e6f4ff;
  border-radius: 6px;
  background: #f7fbff;

  span {
    color: #8c8c8c;
    font-size: 12px;
  }

  strong {
    color: #1890ff;
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
  border: 1px solid #e5e8ef;
  border-radius: 6px;
  background: #fff;

  span,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: #8c8c8c;
    font-size: 12px;
  }

  strong {
    display: block;
    margin: 7px 0;
    color: #595959;
    font-size: 15px;
    line-height: 20px;
  }

  small {
    color: #a0a3a8;
    font-size: 12px;
  }

  &.is-running {
    border-color: #91d5ff;
    background: #f7fbff;

    strong {
      color: #1890ff;
    }
  }

  &.is-success {
    border-color: #b7eb8f;
    background: #fcfff8;

    strong {
      color: #389e0d;
    }
  }

  &.is-error {
    border-color: #ffa39e;
    background: #fff7f6;

    strong {
      color: #f5222d;
    }
  }
}

.backend-chain-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;

  span,
  small {
    color: #8c8c8c;
    font-size: 12px;
  }

  strong {
    color: #1890ff;
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
    color: #1f2329;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 47px;
    padding: 0;
    color: #31343a;
  }

  :deep(.cell) {
    line-height: 20px;
  }
}

.code-link,
.action-link {
  padding: 0;
  font: inherit;
  color: #1890ff;
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
  color: #168ad3;
  font-size: 12px;
  line-height: 22px;
  background: #eaf7ff;
  border-radius: 11px;
}

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 45px;
  padding: 11px 4px 0;
  color: #8c8c8c;
  font-size: 13px;
}

.table-footer__hint {
  color: #b0b3b8;
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
