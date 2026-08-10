<template>
  <div class="idmp-page data-asset-page">
    <PageHeader
      title="数据管理"
    >
      <template #meta>
        <span class="data-source-badge is-live">真实接口</span>
        <span class="header-meta">列表、新建、同步、绑定与字段查询均直接访问 /api/v1</span>
      </template>
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="Refresh" :loading="domainLoading" @click="loadDataDomains">刷新数据域</el-button>
          <el-button :icon="Connection" :loading="syncLoading" @click="handleSyncMappings">
            同步来源映射
          </el-button>
        </div>
      </template>
    </PageHeader>

    <div v-if="!hasAccessToken" class="notice-strip is-warning auth-notice">
      当前未保存访问令牌；若后端启用鉴权，数据资产查询或写操作会返回未登录或权限错误。
    </div>

    <section class="asset-grid">
      <article class="surface-card form-panel">
        <div class="section-title">
          <div>
            <h2>新建数据域</h2>
            <p class="section-title__description">POST /meta/data-domains</p>
          </div>
        </div>
        <el-form label-position="top" @submit.prevent="handleCreateDomain">
          <div class="form-fields">
            <el-form-item label="域编码">
              <el-input v-model.trim="domainForm.domainCode" placeholder="如 FRONTEND_TEST_DOMAIN" />
            </el-form-item>
            <el-form-item label="域名称">
              <el-input v-model.trim="domainForm.domainName" placeholder="请输入数据域名称" />
            </el-form-item>
          </div>
          <el-form-item label="说明">
            <el-input v-model.trim="domainForm.domainDescription" type="textarea" :rows="2" />
          </el-form-item>
          <el-button type="primary" :loading="createDomainLoading" @click="handleCreateDomain">
            确认并创建数据域
          </el-button>
        </el-form>
        <div v-if="createDomainFeedback" class="operation-feedback">
          <StatusBadge
            :status="createDomainFeedback.status"
            :label="createDomainFeedback.label"
            :tone="createDomainFeedback.tone"
          />
          <span>{{ createDomainFeedback.message }}</span>
        </div>
      </article>

      <article v-if="isDev" class="surface-card form-panel compatibility-tool">
        <div class="section-title">
          <div>
            <h2>源表绑定数据域（开发兼容工具）</h2>
            <p class="section-title__description">POST /meta/source-tables/{tableName}/bind-domain</p>
          </div>
        </div>
        <el-form label-position="top" @submit.prevent="handleBindSourceTable">
          <div class="form-fields">
            <el-form-item label="源表名">
              <el-input v-model.trim="bindForm.tableName" class="mono-input" />
            </el-form-item>
            <el-form-item label="域编码">
              <el-input v-model.trim="bindForm.domainCode" class="mono-input" />
            </el-form-item>
          </div>
          <el-form-item label="域名称">
            <el-input v-model.trim="bindForm.domainName" />
          </el-form-item>
          <div class="form-fields">
            <el-form-item label="语义表编码">
              <el-input v-model.trim="bindForm.semanticTableCode" class="mono-input" />
            </el-form-item>
            <el-form-item label="默认时间字段">
              <el-input v-model.trim="bindForm.defaultTimeSemanticFieldCode" class="mono-input" placeholder="如 DEATH_DATETIME" />
            </el-form-item>
          </div>
          <el-form-item label="语义表名称">
            <el-input v-model.trim="bindForm.semanticTableName" />
          </el-form-item>
          <el-button :loading="bindLoading" @click="handleBindSourceTable">确认并绑定源表</el-button>
        </el-form>
        <div v-if="bindFeedback" class="operation-feedback">
          <StatusBadge :status="bindFeedback.status" :label="bindFeedback.label" :tone="bindFeedback.tone" />
          <span>{{ bindFeedback.message }}</span>
        </div>
      </article>
    </section>

    <section class="surface-card table-card data-table-card">
      <div class="section-title">
        <div>
          <h2>数据域列表</h2>
          <p class="section-title__description">GET /api/v1/meta/data-domains</p>
        </div>
        <span class="table-count">共 {{ dataDomains.length }} 个</span>
      </div>
      <div v-if="syncFeedback" class="operation-feedback sync-feedback">
        <StatusBadge :status="syncFeedback.status" :label="syncFeedback.label" :tone="syncFeedback.tone" />
        <span>{{ syncFeedback.message }}</span>
      </div>
      <StatePanel v-if="domainLoading" type="loading" title="正在加载数据域" />
      <StatePanel
        v-else-if="domainError"
        :type="stateTypeForError(domainError)"
        title="数据域列表加载失败"
        :description="domainError"
      >
        <template #actions>
          <el-button @click="loadDataDomains">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!dataDomains.length"
        type="empty"
        title="未返回数据域"
        description="当前接口没有返回可展示的数据域记录。"
      >
        <template #actions>
          <el-button @click="loadDataDomains">重新读取</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table
          :data="dataDomains"
          row-key="id"
          table-layout="fixed"
          @row-click="selectDomain"
        >
          <el-table-column label="ID" width="184">
            <template #default="{ row }">
              <span class="mono-data">{{ row.id }}</span>
            </template>
          </el-table-column>
           <el-table-column prop="code" label="数据域编码" min-width="210" show-overflow-tooltip />
           <el-table-column prop="name" label="数据域名称" min-width="180" show-overflow-tooltip />
           <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <button type="button" class="action-link" @click.stop="selectDomain(row)">查看语义字段</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <section class="surface-card table-card data-table-card">
      <div class="section-title">
        <div>
          <h2>语义字段</h2>
          <p class="section-title__description">GET /api/v1/meta/data-domains/{domainId}/semantic-tables/{tableCode}/semantic-fields</p>
        </div>
        <span class="selected-context">{{ selectedDomainName || '未选择数据域' }}</span>
      </div>
      <StatePanel v-if="fieldLoading" type="loading" title="正在加载语义字段" />
      <StatePanel
        v-else-if="fieldError"
        :type="stateTypeForError(fieldError)"
        title="语义字段加载失败"
        :description="fieldError"
      >
        <template #actions>
          <el-button :disabled="!selectedDomainId" @click="loadSemanticFields()">重试加载</el-button>
        </template>
      </StatePanel>
      <StatePanel
        v-else-if="!selectedDomainId"
        type="empty"
        title="尚未选择数据域"
        description="从上方数据域列表选择一行后读取对应语义字段。"
      />
      <StatePanel
        v-else-if="!semanticFields.length"
        type="empty"
        title="当前数据域没有语义字段"
        description="后端已返回数据域，但没有返回字段记录。"
      >
        <template #actions>
          <el-button @click="loadSemanticFields()">重新读取</el-button>
        </template>
      </StatePanel>
      <div v-else class="table-scroll">
        <el-table :data="semanticFields" table-layout="fixed">
           <el-table-column prop="code" label="字段编码" min-width="190" show-overflow-tooltip />
           <el-table-column prop="name" label="字段名称" min-width="170" show-overflow-tooltip />
          <el-table-column prop="dataType" label="数据类型" width="132" />
           <el-table-column prop="sourceFieldName" label="源字段" min-width="180" show-overflow-tooltip />
           <el-table-column prop="sensitive" label="敏感字段" width="120">
             <template #default="{ row }">{{ row.sensitive ? '是' : '否' }}</template>
           </el-table-column>
        </el-table>
      </div>
    </section>

    <section class="surface-card developer-card">
      <el-collapse>
        <el-collapse-item name="dev-chain">
          <template #title>
            <div class="developer-title">
              <span>开发验证工具（会写入后端）</span>
              <small>仅用于确认现有数据资产接口闭环，不是日常业务入口。</small>
            </div>
          </template>
          <div class="developer-content">
            <div class="notice-strip is-danger">
              验证会创建一个测试数据域、同步来源映射并绑定源表，且不会自动回滚。执行前必须再次确认。
            </div>
            <div class="developer-head">
              <div>
                <h2>数据资产接口验证</h2>
                <p>依次调用列表、新建、同步、绑定和语义字段查询五个现有端点。</p>
              </div>
              <el-button type="danger" plain :loading="backendChainLoading" @click="runDataAssetBackendChain">
                确认并执行写入验证
              </el-button>
            </div>
            <dl class="developer-context">
              <div><dt>绑定源表</dt><dd class="mono-data">{{ bindForm.tableName || '-' }}</dd></div>
              <div><dt>目标域编码</dt><dd class="mono-data">{{ bindForm.domainCode || '-' }}</dd></div>
              <div><dt>字段查询域 ID</dt><dd class="mono-data">{{ selectedDomainId || '执行后确定' }}</dd></div>
            </dl>
            <ol class="backend-steps">
              <li v-for="(step, index) in backendChainSteps" :key="step.key">
                <span class="step-index">{{ index + 1 }}</span>
                <div class="step-copy">
                  <strong>{{ step.label }}</strong>
                  <small>{{ step.detail }}</small>
                </div>
                <StatusBadge :status="step.status" />
              </li>
            </ol>
            <StatePanel
              v-if="backendChainError"
              :type="stateTypeForError(backendChainError)"
              title="数据资产接口验证中断"
              :description="backendChainError"
            >
              <template #actions>
                <el-button type="danger" plain @click="runDataAssetBackendChain">重新确认并执行</el-button>
              </template>
            </StatePanel>
            <div v-if="backendChainResult" class="backend-result">
              <StatusBadge status="SUCCEEDED" label="验证调用完成" />
              <span>
                接口返回 {{ backendChainResult.domainCount }} 个数据域；新建
                <span class="mono-data">{{ backendChainResult.createdDomainCode }}</span>；读取
                {{ backendChainResult.semanticFieldCount }} 个字段。
              </span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import StatusBadge from '@/idmp/components/StatusBadge.vue'
import { getAccessToken } from '@/idmp/api/request'
import {
  bindSourceTableDomain,
  createDataDomain,
  fetchDataDomains,
  fetchSemanticFields,
  fetchSemanticTableFields,
  fetchSemanticTables,
  syncSourceMappings
} from '@/idmp/api/modules/meta'
import {
  adaptDataDomainList,
  adaptSemanticFieldList,
  adaptSemanticTableList,
  toOpaqueId
} from '@/idmp/api/adapters/meta'

const dataDomains = ref([])
const semanticFields = ref([])
const selectedDomainId = ref('')
const selectedDomainName = ref('')
const domainError = ref('')
const fieldError = ref('')
const domainLoading = ref(false)
const fieldLoading = ref(false)
const syncLoading = ref(false)
const createDomainLoading = ref(false)
const bindLoading = ref(false)
const backendChainLoading = ref(false)
const backendChainError = ref('')
const backendChainResult = ref(null)
const backendChainSteps = ref(createBackendChainSteps())
const createDomainFeedback = ref(null)
const bindFeedback = ref(null)
const syncFeedback = ref(null)
const hasAccessToken = ref(Boolean(getAccessToken()))
const isDev = import.meta.env.DEV

const domainForm = reactive({
  domainCode: '',
  domainName: '',
  domainDescription: '前端数据资产配置创建'
})

const bindForm = reactive({
  tableName: 'vmq_deathpatientdetail',
  domainCode: 'INPATIENT_DEATH_RECORD',
  domainName: '住院死亡患者记录',
  domainDescription: '前端数据资产配置绑定',
  semanticTableCode: 'INPATIENT_DEATH_RECORD',
  semanticTableName: '住院死亡患者记录',
  defaultTimeSemanticFieldCode: 'DEATH_DATETIME'
})

const firstDomain = computed(() => dataDomains.value[0])

async function loadDataDomains() {
  domainLoading.value = true
  domainError.value = ''
  try {
    const rows = await fetchDataDomains()
    dataDomains.value = adaptDataDomainList(rows)
    const current = dataDomains.value.find((item) => item.id === selectedDomainId.value)
    if (current) {
      selectedDomainName.value = current.name || current.code
    } else if (firstDomain.value) {
      selectDomain(firstDomain.value)
    } else {
      selectedDomainId.value = ''
      selectedDomainName.value = ''
      semanticFields.value = []
      fieldError.value = ''
    }
  } catch (error) {
    dataDomains.value = []
    domainError.value = error?.message || '数据域列表加载失败'
    ElMessage.error(domainError.value)
  } finally {
    domainLoading.value = false
  }
}

async function handleSyncMappings() {
  if (syncLoading.value) return
  try {
    await ElMessageBox.confirm(
      '同步来源映射会修改后端映射关系。确认使用当前后端配置执行同步？',
      '确认同步来源映射',
      {
        confirmButtonText: '确认同步',
        cancelButtonText: '返回',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  syncLoading.value = true
  syncFeedback.value = {
    status: 'RUNNING',
    label: '正在同步',
    message: '正在向后端提交来源映射同步请求。'
  }
  try {
    await syncSourceMappings()
    syncFeedback.value = {
      status: 'SUCCEEDED',
      label: '同步请求成功',
      message: '接口已返回成功，数据域列表正在重新读取。'
    }
    ElMessage.success('来源映射同步请求成功')
    await loadDataDomains()
  } catch (error) {
    await loadDataDomains().catch(() => {})
    const canContinue = hasMortalityDomains()
    syncFeedback.value = {
      status: canContinue ? 'WARNING' : 'FAILED',
      label: canContinue ? '同步失败，可继续测试' : '同步失败',
      tone: canContinue ? 'warning' : undefined,
      message: canContinue
        ? `${error?.message || '来源映射同步失败'}。当前已能看到住院死亡/出院数据域，可继续执行源表绑定或后续因子创建；如需排查同步本身，请按 traceId 查看后端日志。`
        : `${error?.message || '来源映射同步失败'}。请先确认后端远程源库连接与来源映射配置，或查看 traceId 对应后端日志。`
    }
    if (canContinue) {
      ElMessage.warning('来源映射同步失败，但已有核心数据域，可继续后续页面测试')
    } else {
      ElMessage.error(syncFeedback.value.message)
    }
  } finally {
    syncLoading.value = false
  }
}

async function handleCreateDomain() {
  if (createDomainLoading.value) return
  if (!domainForm.domainCode || !domainForm.domainName) {
    ElMessage.warning('请填写数据域编码和名称')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认创建数据域 ${domainForm.domainCode}（${domainForm.domainName}）？该操作会写入后端，重复编码可能返回冲突。`,
      '确认创建数据域',
      {
        confirmButtonText: '确认创建',
        cancelButtonText: '返回核对',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  createDomainLoading.value = true
  createDomainFeedback.value = {
    status: 'RUNNING',
    label: '正在创建',
    message: `正在提交数据域 ${domainForm.domainCode}。`
  }
  try {
    await createDataDomain({
      code: domainForm.domainCode,
      name: domainForm.domainName,
      description: domainForm.domainDescription
    })
    createDomainFeedback.value = {
      status: 'SUCCEEDED',
      label: '接口创建成功',
      message: `后端已接受数据域 ${domainForm.domainCode}，列表正在重新读取。`
    }
    ElMessage.success('数据域创建成功')
    await loadDataDomains()
  } catch (error) {
    createDomainFeedback.value = {
      status: 'FAILED',
      label: '创建失败',
      message: error?.message || '数据域创建失败'
    }
    ElMessage.error(createDomainFeedback.value.message)
  } finally {
    createDomainLoading.value = false
  }
}

async function handleBindSourceTable() {
  if (bindLoading.value) return
  if (!bindForm.tableName || !bindForm.domainCode) {
    ElMessage.warning('请填写源表名和数据域编码')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将源表 ${bindForm.tableName} 绑定到数据域 ${bindForm.domainCode}？该操作会修改后端映射关系。`,
      '确认绑定源表',
      {
        confirmButtonText: '确认绑定',
        cancelButtonText: '返回核对',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  bindLoading.value = true
  bindFeedback.value = {
    status: 'RUNNING',
    label: '正在绑定',
    message: `正在提交 ${bindForm.tableName} → ${bindForm.domainCode}。`
  }
  try {
    await bindSourceTableDomain(bindForm.tableName, {
      domainCode: bindForm.domainCode,
      domainName: bindForm.domainName,
      domainDescription: bindForm.domainDescription,
      semanticTableCode: bindForm.semanticTableCode,
      semanticTableName: bindForm.semanticTableName,
      defaultTimeSemanticFieldCode: bindForm.defaultTimeSemanticFieldCode || null
    })
    bindFeedback.value = {
      status: 'SUCCEEDED',
      label: '绑定请求成功',
      message: '接口已返回成功，数据域列表正在重新读取。'
    }
    ElMessage.success('源表绑定成功')
    await loadDataDomains()
  } catch (error) {
    bindFeedback.value = {
      status: 'FAILED',
      label: '绑定失败',
      message: error?.message || '源表绑定失败'
    }
    ElMessage.error(bindFeedback.value.message)
  } finally {
    bindLoading.value = false
  }
}

function selectDomain(row) {
  selectedDomainId.value = toOpaqueId(row?.id)
  selectedDomainName.value = row?.name || row?.code || ''
  semanticFields.value = []
  fieldError.value = ''
  loadSemanticFields(row)
}

async function loadSemanticFields(row) {
  const domainId = toOpaqueId(row?.id) || selectedDomainId.value
  if (!domainId) return
  fieldLoading.value = true
  fieldError.value = ''
  try {
    const domainCode = row?.code || dataDomains.value.find((item) => item.id === domainId)?.code || ''
    const tableCode = await resolveSemanticTableCode(domainId, domainCode)
    const rows = tableCode
      ? await fetchSemanticTableFields(domainId, tableCode)
      : await fetchSemanticFields(domainId)
    semanticFields.value = adaptSemanticFieldList(rows)
  } catch (error) {
    try {
      const rows = await fetchSemanticFields(domainId)
      semanticFields.value = adaptSemanticFieldList(rows)
    } catch {
      semanticFields.value = []
      fieldError.value = error?.message || '语义字段加载失败'
      ElMessage.error(fieldError.value)
    }
  } finally {
    fieldLoading.value = false
  }
}

async function resolveSemanticTableCode(domainId, domainCode) {
  try {
    const tables = adaptSemanticTableList(await fetchSemanticTables(domainId))
    const preferred = tables.find((item) => item.code === domainCode) || tables[0]
    return preferred?.code || ''
  } catch {
    return ''
  }
}

function createBackendChainSteps() {
  return [
    { key: 'list', label: '加载数据域', status: 'PENDING', detail: '读取可用数据域' },
    { key: 'create', label: '新建测试数据域', status: 'PENDING', detail: '写入一条测试数据域' },
    { key: 'sync', label: '同步来源映射', status: 'PENDING', detail: '刷新来源映射关系' },
    { key: 'bind', label: '绑定源表', status: 'PENDING', detail: '建立源表和数据域关系' },
    { key: 'fields', label: '查看语义字段', status: 'PENDING', detail: '读取字段语义信息' }
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
          detail: detail || step.detail
        }
      : step
  )
}

async function runDataAssetBackendChain() {
  if (backendChainLoading.value) return
  if (!bindForm.tableName || !bindForm.domainCode) {
    ElMessage.warning('请先填写源表名和数据域编码')
    return
  }

  const suffix = createBackendCodeSuffix()
  const createdDomainCode = `FRONTEND_TEST_DOMAIN_${suffix}`
  try {
    await ElMessageBox.confirm(
      `验证将创建 ${createdDomainCode}，同步来源映射，并把 ${bindForm.tableName} 绑定到 ${bindForm.domainCode}。这些写入不会自动回滚，是否继续？`,
      '确认执行数据资产写入验证',
      {
        confirmButtonText: '确认执行',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  backendChainLoading.value = true
  backendChainError.value = ''
  backendChainResult.value = null
  resetBackendChainSteps()
  let activeStep = 'list'

  try {
    setBackendStep(activeStep, 'RUNNING')
    const beforeDomains = adaptDataDomainList(await fetchDataDomains())
    dataDomains.value = beforeDomains
    domainError.value = ''
    setBackendStep(activeStep, 'SUCCEEDED', `${beforeDomains.length} 个数据域`)

    activeStep = 'create'
    setBackendStep(activeStep, 'RUNNING')
    await createDataDomain({
      code: createdDomainCode,
      name: `前端配置数据域 ${suffix}`,
      description: '前端数据资产接口验证创建'
    })
    setBackendStep(activeStep, 'SUCCEEDED', createdDomainCode)

    activeStep = 'sync'
    setBackendStep(activeStep, 'RUNNING')
    await syncSourceMappings()
    setBackendStep(activeStep, 'SUCCEEDED', '同步接口返回成功')

    activeStep = 'bind'
    setBackendStep(activeStep, 'RUNNING')
    await bindSourceTableDomain(bindForm.tableName, {
      domainCode: bindForm.domainCode,
      domainName: bindForm.domainName,
      domainDescription: bindForm.domainDescription,
      semanticTableCode: bindForm.semanticTableCode,
      semanticTableName: bindForm.semanticTableName,
      defaultTimeSemanticFieldCode: bindForm.defaultTimeSemanticFieldCode || null
    })
    setBackendStep(activeStep, 'SUCCEEDED', `${bindForm.tableName} → ${bindForm.domainCode}`)

    const afterDomains = adaptDataDomainList(await fetchDataDomains())
    dataDomains.value = afterDomains
    const targetDomain = afterDomains.find((item) => item.code === bindForm.domainCode) || afterDomains[0]
    if (!targetDomain?.id) {
      throw new Error('接口未返回可用于语义字段查询的数据域')
    }

    activeStep = 'fields'
    setBackendStep(activeStep, 'RUNNING')
    const fields = adaptSemanticFieldList(await fetchSemanticFields(targetDomain.id))
    semanticFields.value = fields
    fieldError.value = ''
    selectedDomainId.value = targetDomain.id
    selectedDomainName.value = targetDomain.name || targetDomain.code
    setBackendStep(activeStep, 'SUCCEEDED', `${fields.length} 个字段`)

    backendChainResult.value = {
      domainCount: afterDomains.length,
      createdDomainCode,
      semanticFieldCount: fields.length
    }
    ElMessage.success('数据资产接口验证调用完成')
  } catch (error) {
    backendChainError.value = error?.message || '数据资产接口验证失败'
    setBackendStep(activeStep, 'FAILED', backendChainError.value)
    ElMessage.error(backendChainError.value)
  } finally {
    backendChainLoading.value = false
  }
}

function hasMortalityDomains() {
  const codes = new Set(dataDomains.value.map((item) => item.code))
  return codes.has('INPATIENT_DEATH_RECORD') && codes.has('INPATIENT_DISCHARGE_RECORD')
}

function createBackendCodeSuffix() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

function stateTypeForError(message) {
  const normalized = String(message || '').toLowerCase()
  if (/401|403|unauthorized|forbidden|未登录|无权限|权限/.test(normalized)) return 'permission'
  if (/404|501|503|not found|not implemented|unavailable|未实现|不可用/.test(normalized)) return 'unavailable'
  return 'error'
}

onMounted(() => {
  loadDataDomains()
})
</script>

<style scoped lang="scss">
.data-asset-page {
  min-width: 0;
}

.header-meta,
.table-count,
.selected-context {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 20px;
}

.auth-notice {
  margin-bottom: var(--idmp-space-4);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--idmp-space-4);
  margin-bottom: var(--idmp-space-4);
}

.form-panel {
  padding: var(--idmp-space-4);
}

.form-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--idmp-space-3);
}

.form-panel :deep(.el-form-item) {
  margin-bottom: var(--idmp-space-3);
}

.form-panel :deep(.el-input),
.form-panel :deep(.el-textarea) {
  width: 100%;
}

.mono-input :deep(.el-input__inner) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.operation-feedback {
  display: flex;
  align-items: flex-start;
  margin-top: var(--idmp-space-3);
  padding-top: var(--idmp-space-3);
  gap: var(--idmp-space-2);
  border-top: 1px solid var(--idmp-border-subtle);
  color: var(--idmp-text-secondary);
  line-height: 22px;
}

.operation-feedback > span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sync-feedback {
  margin: 0 0 var(--idmp-space-3);
  padding: 0 0 var(--idmp-space-3);
}

.data-table-card,
.developer-card {
  margin-bottom: var(--idmp-space-4);
}

.data-table-card {
  overflow: hidden;
}

.data-table-card :deep(.el-table__row) {
  cursor: pointer;
}

.developer-card {
  padding: 0 var(--idmp-space-4);
}

.developer-card :deep(.el-collapse) {
  border: 0;
}

.developer-card :deep(.el-collapse-item__header) {
  min-height: 58px;
  border-bottom: 0;
  background: transparent;
}

.developer-card :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
  background: transparent;
}

.developer-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--idmp-space-1);
}

.developer-title span {
  color: var(--idmp-text-primary);
  font-weight: 650;
  line-height: 20px;
}

.developer-title small,
.developer-head p {
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.developer-content {
  padding: 0 0 var(--idmp-space-4);
}

.developer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin: var(--idmp-space-4) 0;
  gap: var(--idmp-space-4);
}

.developer-head h2,
.developer-head p {
  margin: 0;
}

.developer-head h2 {
  color: var(--idmp-text-primary);
  font-size: 16px;
  line-height: 24px;
}

.developer-head p {
  margin-top: var(--idmp-space-1);
}

.developer-context {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0 0 var(--idmp-space-4);
  border-top: 1px solid var(--idmp-border-subtle);
  border-left: 1px solid var(--idmp-border-subtle);
}

.developer-context > div {
  min-width: 0;
  padding: var(--idmp-space-3);
  border-right: 1px solid var(--idmp-border-subtle);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.developer-context dt {
  margin-bottom: var(--idmp-space-1);
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.developer-context dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--idmp-text-primary);
}

.backend-steps {
  margin: 0 0 var(--idmp-space-4);
  padding: 0;
  border-top: 1px solid var(--idmp-border-subtle);
  list-style: none;
}

.backend-steps li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 54px;
  padding: var(--idmp-space-2) 0;
  gap: var(--idmp-space-3);
  border-bottom: 1px solid var(--idmp-border-subtle);
}

.step-index {
  color: var(--idmp-text-helper);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.step-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.step-copy strong {
  color: var(--idmp-text-primary);
  font-size: 13px;
  line-height: 20px;
}

.step-copy small {
  overflow: hidden;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backend-result {
  display: flex;
  align-items: flex-start;
  padding-top: var(--idmp-space-3);
  gap: var(--idmp-space-2);
  border-top: 1px solid var(--idmp-border-subtle);
  color: var(--idmp-text-secondary);
  line-height: 22px;
}

@media (max-width: 1450px) {
  .asset-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1180px) {
  .form-fields,
  .developer-context {
    grid-template-columns: 1fr;
  }

  .developer-head {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
