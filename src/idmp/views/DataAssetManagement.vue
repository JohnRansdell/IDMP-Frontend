<template>
  <div class="idmp-page data-asset-page">
    <PageHeader title="数据管理">
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="Refresh" :loading="domainLoading" @click="loadDataDomains">刷新数据域</el-button>
          <el-button type="primary" :icon="Connection" :loading="syncLoading" @click="handleSyncMappings">
            同步来源映射
          </el-button>
        </div>
      </template>
    </PageHeader>

    <section class="asset-grid">
      <article class="surface-card form-panel">
        <div class="section-title">
          <h2>新建数据域</h2>
        </div>
        <el-form label-width="92px">
          <el-form-item label="域编码">
            <el-input v-model.trim="domainForm.domainCode" placeholder="如 FRONTEND_TEST_DOMAIN" />
          </el-form-item>
          <el-form-item label="域名称">
            <el-input v-model.trim="domainForm.domainName" placeholder="请输入数据域名称" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model.trim="domainForm.domainDescription" type="textarea" :rows="3" />
          </el-form-item>
          <el-button type="primary" :loading="createDomainLoading" @click="handleCreateDomain">
            创建数据域
          </el-button>
        </el-form>
      </article>

      <article class="surface-card form-panel">
        <div class="section-title">
          <h2>源表绑定数据域</h2>
        </div>
        <el-form label-width="92px">
          <el-form-item label="源表名">
            <el-input v-model.trim="bindForm.tableName" />
          </el-form-item>
          <el-form-item label="域编码">
            <el-input v-model.trim="bindForm.domainCode" />
          </el-form-item>
          <el-form-item label="域名称">
            <el-input v-model.trim="bindForm.domainName" />
          </el-form-item>
          <el-button type="primary" plain :loading="bindLoading" @click="handleBindSourceTable">
            绑定源表
          </el-button>
        </el-form>
      </article>
    </section>

    <section class="surface-card domain-table-card">
      <div class="table-heading">
        <div>
          <h2>数据域列表</h2>
          <p>来自 GET /api/v1/meta/data-domains</p>
        </div>
        <span>共 {{ dataDomains.length }} 个</span>
      </div>
      <div class="table-scroll">
        <el-table
          :data="dataDomains"
          v-loading="domainLoading"
          row-key="id"
          table-layout="fixed"
          class="domain-table"
          @row-click="selectDomain"
        >
          <el-table-column prop="id" label="ID" width="168" />
          <el-table-column prop="domainCode" label="数据域编码" min-width="210" show-overflow-tooltip />
          <el-table-column prop="domainName" label="数据域名称" min-width="180" show-overflow-tooltip />
          <el-table-column prop="sourceTable" label="源表" min-width="180" show-overflow-tooltip />
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <button type="button" class="action-link" @click.stop="loadSemanticFields(row)">查看字段</button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <section class="surface-card semantic-card">
      <div class="table-heading">
        <div>
          <h2>语义字段</h2>
          <p>来自 GET /api/v1/meta/data-domains/{domainId}/semantic-fields</p>
        </div>
        <span>{{ selectedDomainName || '未选择数据域' }}</span>
      </div>
      <div class="table-scroll">
        <el-table :data="semanticFields" v-loading="fieldLoading" table-layout="fixed" class="semantic-table">
          <el-table-column prop="fieldCode" label="字段编码" min-width="180" show-overflow-tooltip />
          <el-table-column prop="fieldName" label="字段名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="dataType" label="数据类型" width="120" />
          <el-table-column prop="sourceColumn" label="源字段" min-width="160" show-overflow-tooltip />
          <el-table-column prop="semanticKind" label="语义类型" width="120" />
        </el-table>
      </div>
    </section>

    <section class="surface-card backend-chain-card">
      <el-collapse>
        <el-collapse-item name="dev-chain">
          <template #title>
            <div class="dev-chain-title">
              <span>开发验证工具</span>
              <small>用于确认数据资产接口闭环，正式使用时主要操作上方表单和列表</small>
            </div>
          </template>
          <div class="backend-chain-card__head">
            <div>
              <h2>数据资产接口验证</h2>
              <p>覆盖数据域列表、新建数据域、来源映射同步、源表绑定数据域、语义字段查询。</p>
            </div>
            <el-button type="primary" :loading="backendChainLoading" @click="runDataAssetBackendChain">
              执行验证
            </el-button>
          </div>
          <div class="backend-chain-meta">
            <span>绑定源表</span>
            <strong>{{ bindForm.tableName }}</strong>
            <span>默认查询语义字段</span>
            <strong>{{ selectedDomainId || '请选择数据域' }}</strong>
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
            <strong>{{ backendChainResult.domainCount }} 个数据域</strong>
            <small>
              新建 {{ backendChainResult.createdDomainCode }} /
              字段 {{ backendChainResult.semanticFieldCount }} 个
            </small>
          </div>
        </el-collapse-item>
      </el-collapse>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Connection, Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import {
  bindSourceTableDomain,
  createDataDomain,
  fetchDataDomains,
  fetchSemanticFields,
  syncSourceMappings
} from '@/idmp/api/modules/meta'

const dataDomains = ref([])
const semanticFields = ref([])
const selectedDomainId = ref('')
const selectedDomainName = ref('')
const domainLoading = ref(false)
const fieldLoading = ref(false)
const syncLoading = ref(false)
const createDomainLoading = ref(false)
const bindLoading = ref(false)
const backendChainLoading = ref(false)
const backendChainResult = ref(null)
const backendChainSteps = ref(createBackendChainSteps())

const domainForm = reactive({
  domainCode: '',
  domainName: '',
  domainDescription: '前端数据资产配置创建'
})

const bindForm = reactive({
  tableName: 'vmq_deathpatientdetail',
  domainCode: 'INPATIENT_DEATH_RECORD',
  domainName: '住院死亡患者记录',
  domainDescription: '前端数据资产配置绑定'
})

const firstDomain = computed(() => dataDomains.value[0])

async function loadDataDomains() {
  domainLoading.value = true
  try {
    const rows = await fetchDataDomains()
    dataDomains.value = normalizeList(rows).map(normalizeDomain)
    if (!selectedDomainId.value && firstDomain.value) {
      selectDomain(firstDomain.value)
    }
  } catch (error) {
    dataDomains.value = []
    ElMessage.error(error?.message || '数据域列表加载失败')
  } finally {
    domainLoading.value = false
  }
}

async function handleSyncMappings() {
  syncLoading.value = true
  try {
    await syncSourceMappings()
    ElMessage.success('来源映射同步已触发')
    await loadDataDomains()
  } catch (error) {
    ElMessage.error(error?.message || '来源映射同步失败')
  } finally {
    syncLoading.value = false
  }
}

async function handleCreateDomain() {
  if (!domainForm.domainCode || !domainForm.domainName) {
    ElMessage.warning('请填写数据域编码和名称')
    return
  }
  createDomainLoading.value = true
  try {
    await createDataDomain({ ...domainForm })
    ElMessage.success('数据域创建成功')
    await loadDataDomains()
  } catch (error) {
    ElMessage.error(error?.message || '数据域创建失败')
  } finally {
    createDomainLoading.value = false
  }
}

async function handleBindSourceTable() {
  if (!bindForm.tableName || !bindForm.domainCode) {
    ElMessage.warning('请填写源表名和数据域编码')
    return
  }
  bindLoading.value = true
  try {
    await bindSourceTableDomain(bindForm.tableName, {
      domainCode: bindForm.domainCode,
      domainName: bindForm.domainName,
      domainDescription: bindForm.domainDescription
    })
    ElMessage.success('源表绑定成功')
    await loadDataDomains()
  } catch (error) {
    ElMessage.error(error?.message || '源表绑定失败')
  } finally {
    bindLoading.value = false
  }
}

function selectDomain(row) {
  selectedDomainId.value = row.id
  selectedDomainName.value = row.domainName || row.domainCode
  loadSemanticFields(row)
}

async function loadSemanticFields(row) {
  const domainId = row?.id || selectedDomainId.value
  if (!domainId) return
  fieldLoading.value = true
  try {
    const rows = await fetchSemanticFields(domainId)
    semanticFields.value = normalizeList(rows).map(normalizeField)
  } catch (error) {
    semanticFields.value = []
    ElMessage.error(error?.message || '语义字段加载失败')
  } finally {
    fieldLoading.value = false
  }
}

function createBackendChainSteps() {
  return [
    { key: 'list', label: '加载数据域', status: 'pending', statusText: '待执行', detail: '读取可用数据域' },
    { key: 'create', label: '新建数据域', status: 'pending', statusText: '待执行', detail: '保存数据域配置' },
    { key: 'sync', label: '同步来源映射', status: 'pending', statusText: '待执行', detail: '刷新源表映射关系' },
    { key: 'bind', label: '绑定源表', status: 'pending', statusText: '待执行', detail: '建立源表和数据域关系' },
    { key: 'fields', label: '查看语义字段', status: 'pending', statusText: '待执行', detail: '读取字段语义信息' }
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

async function runDataAssetBackendChain() {
  backendChainLoading.value = true
  backendChainResult.value = null
  resetBackendChainSteps()

  try {
    setBackendStep('list', 'running')
    const beforeDomains = normalizeList(await fetchDataDomains()).map(normalizeDomain)
    dataDomains.value = beforeDomains
    setBackendStep('list', 'success', `${beforeDomains.length} 个数据域`)

    const suffix = createBackendCodeSuffix()
    const createdDomainCode = `FRONTEND_TEST_DOMAIN_${suffix}`
    setBackendStep('create', 'running')
    await createDataDomain({
      domainCode: createdDomainCode,
      domainName: `前端配置数据域 ${suffix}`,
      domainDescription: '前端数据资产接口验证创建'
    })
    setBackendStep('create', 'success', createdDomainCode)

    setBackendStep('sync', 'running')
    await syncSourceMappings()
    setBackendStep('sync', 'success', '同步请求成功')

    setBackendStep('bind', 'running')
    await bindSourceTableDomain(bindForm.tableName, {
      domainCode: bindForm.domainCode,
      domainName: bindForm.domainName,
      domainDescription: bindForm.domainDescription
    })
    setBackendStep('bind', 'success', `${bindForm.tableName} -> ${bindForm.domainCode}`)

    const afterDomains = normalizeList(await fetchDataDomains()).map(normalizeDomain)
    dataDomains.value = afterDomains
    const targetDomain = afterDomains.find((item) => item.domainCode === bindForm.domainCode) || afterDomains[0]

    setBackendStep('fields', 'running')
    const fields = normalizeList(await fetchSemanticFields(targetDomain.id)).map(normalizeField)
    semanticFields.value = fields
    selectedDomainId.value = targetDomain.id
    selectedDomainName.value = targetDomain.domainName || targetDomain.domainCode
    setBackendStep('fields', 'success', `${fields.length} 个字段`)

    backendChainResult.value = {
      domainCount: afterDomains.length,
      createdDomainCode,
      semanticFieldCount: fields.length
    }
    ElMessage.success('数据资产接口验证成功')
  } catch (error) {
    ElMessage.error(error?.message || '数据资产接口验证失败')
  } finally {
    backendChainLoading.value = false
  }
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.list)) return payload.list
  return []
}

function normalizeDomain(item) {
  return {
    id: item.id || item.domainId,
    domainCode: item.domainCode || item.code,
    domainName: item.domainName || item.name,
    sourceTable: item.sourceTable || item.tableName || item.physicalTable || '-',
    raw: item
  }
}

function normalizeField(item) {
  return {
    fieldCode: item.fieldCode || item.code || item.semanticCode || item.columnName,
    fieldName: item.fieldName || item.name || item.semanticName || item.columnComment,
    dataType: item.dataType || item.type || item.columnType || '-',
    sourceColumn: item.sourceColumn || item.columnName || item.physicalColumn || '-',
    semanticKind: item.semanticKind || item.kind || '-'
  }
}

function createBackendCodeSuffix() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

onMounted(() => {
  loadDataDomains()
})
</script>

<style scoped lang="scss">
.data-asset-page {
  min-width: 0;
}

.page-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.backend-chain-card,
.domain-table-card,
.semantic-card {
  margin-bottom: 16px;
  padding: 16px 18px;
}

.backend-chain-card {
  :deep(.el-collapse) {
    border: 0;
  }

  :deep(.el-collapse-item__header) {
    border-bottom: 0;
  }

  :deep(.el-collapse-item__wrap) {
    border-bottom: 0;
  }
}

.dev-chain-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;

  span {
    color: #262626;
    font-weight: 600;
    line-height: 20px;
  }

  small {
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }
}

.backend-chain-card__head,
.table-heading {
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

  > span {
    color: #8c8c8c;
    font-size: 12px;
    white-space: nowrap;
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
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

.asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.form-panel {
  padding: 18px;
}

.section-title {
  margin-bottom: 12px;

  h2 {
    margin: 0;
    color: #262626;
    font-size: 15px;
  }
}

.table-scroll {
  min-width: 0;
  margin-top: 12px;
  overflow-x: auto;
}

.domain-table,
.semantic-table {
  min-width: 900px;

  :deep(th.el-table__cell) {
    height: 44px;
    padding: 0;
    color: #262626;
    font-weight: 600;
    background: #fafafa;
  }

  :deep(td.el-table__cell) {
    height: 46px;
    padding: 0;
    color: #3f4146;
  }
}

.action-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: #1890ff;
  cursor: pointer;
}

@media (max-width: 1450px) {
  .backend-chain-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .asset-grid {
    grid-template-columns: 1fr;
  }
}
</style>
