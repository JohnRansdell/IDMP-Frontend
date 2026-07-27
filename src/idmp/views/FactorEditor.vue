<template>
  <div class="idmp-page factor-editor">
    <PageHeader :title="pageTitle">
      <template #actions>
        <div class="page-toolbar">
          <el-button :icon="ArrowLeft" @click="goBack">返回列表</el-button>
          <el-button type="primary" :loading="loading.save" @click="saveFactor">
            保存因子定义
          </el-button>
        </div>
      </template>
    </PageHeader>

    <el-alert
      v-if="!isCreateMode"
      class="editor-alert"
      type="info"
      show-icon
      :closable="false"
      :title="loading.detail ? '正在从后端读取因子详情与版本定义。' : '已接入因子详情、版本与 DSL 回显；已有因子当前不改写基础定义，但可以基于已回填版本发起试算并查看结果。'"
    />

    <section class="surface-card editor-section">
      <div class="section-head">
        <span class="section-index">1</span>
        <div>
          <h2>基本信息</h2>
          <p>填写因子的编码、名称和业务说明。保存后，后端会返回因子 ID 和版本 ID，后续校验、试算、发布都基于该版本继续执行。</p>
        </div>
      </div>

      <el-form
        ref="basicFormRef"
        :model="basicForm"
        :rules="basicRules"
        label-width="96px"
        class="basic-form"
      >
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-form-item label="因子编码" prop="code">
              <el-input v-model.trim="basicForm.code" placeholder="请输入唯一业务编码" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="因子名称" prop="name">
              <el-input v-model.trim="basicForm.name" placeholder="请输入因子名称" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="因子类型">
              <el-select v-model="basicForm.type" disabled>
                <el-option label="原子因子" value="ATOMIC" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="说明">
          <el-input
            v-model.trim="basicForm.description"
            type="textarea"
            :rows="3"
            placeholder="说明因子的业务含义、统计口径或使用场景"
          />
        </el-form-item>
      </el-form>

      <div v-if="factorState.factorId || factorState.versionId" class="saved-summary">
        <span>因子 ID：<strong>{{ factorState.factorId || '-' }}</strong></span>
        <span>版本 ID：<strong>{{ factorState.versionId || '-' }}</strong></span>
        <span>保存状态：<strong>{{ factorState.saveStatus || '已保存草稿' }}</strong></span>
      </div>
    </section>

    <section class="surface-card editor-section caliber-section">
      <div class="section-head">
        <span class="section-index">2</span>
        <div>
          <h2>计算口径配置</h2>
          <p>用业务语言配置这个因子如何取数。系统会根据下方选择自动生成后端 DSL，不需要手工编写 JSON。</p>
        </div>
      </div>

      <div class="caliber-preview-banner">
        <span>当前口径</span>
        <strong>{{ caliberPreview }}</strong>
      </div>

      <div class="form-block">
        <div class="block-title">
          <h3>第一步：这个因子要怎么统计？</h3>
          <p>先选择最接近业务含义的统计方式。这里是唯一的计算方式入口，下方不会再重复选择。</p>
        </div>
        <div class="template-row">
          <button
            v-for="template in caliberTemplates"
            :key="template.value"
            type="button"
            class="template-card"
            :class="{ 'is-active': dslForm.template === template.value }"
            @click="applyTemplate(template.value)"
          >
            <strong>{{ template.label }}</strong>
            <span>{{ template.description }}</span>
          </button>
        </div>
      </div>

      <el-form :model="dslForm" label-position="top" class="dsl-form">
        <div class="form-block">
          <div class="block-title">
            <h3>第二步：从哪里取数，统计什么？</h3>
            <p>选择数据来源后，系统会读取该数据域下的语义字段。计数类因子默认统计记录数。</p>
          </div>
          <el-row :gutter="18">
            <el-col :xs="24" :lg="12">
              <el-form-item label="数据来源">
                <el-select
                  v-model="dslForm.domainCode"
                  filterable
                  placeholder="选择数据域"
                  :loading="loading.domains"
                  @change="handleDomainChange"
                >
                  <el-option
                    v-for="domain in domainOptions"
                    :key="domain.domainCode"
                    :label="domain.domainName"
                    :value="domain.domainCode"
                  >
                    <div class="domain-option">
                      <strong>{{ domain.domainName }}</strong>
                      <small>{{ domain.domainCode }}</small>
                    </div>
                  </el-option>
                </el-select>
                <div class="field-help">选择这次统计要读取的后端业务数据，例如住院死亡记录、出院记录。</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-form-item label="语义表">
                <el-select
                  v-model="dslForm.semanticTableCode"
                  filterable
                  clearable
                  placeholder="选择语义表"
                  :loading="loading.semanticTables"
                  @change="handleSemanticTableChange"
                >
                  <el-option
                    v-for="table in semanticTableOptions"
                    :key="table.code"
                    :label="table.optionLabel"
                    :value="table.code"
                  >
                    <div class="domain-option">
                      <strong>{{ table.name }}</strong>
                      <small>{{ table.sourceTableName || table.code }}</small>
                    </div>
                  </el-option>
                </el-select>
                <div class="field-help">语义表随上方数据来源变化；若只看到一张表，请先切换数据来源或到数据管理绑定更多源表。</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-form-item label="统计对象">
                <el-select
                  v-model="dslForm.fieldCode"
                  filterable
                  clearable
                  :disabled="dslForm.aggregationFunction === 'COUNT'"
                  placeholder="计数类因子默认统计记录数"
                  :loading="loading.fields"
                >
                  <el-option
                    v-for="field in semanticFieldOptions"
                    :key="field.fieldCode"
                    :label="field.fieldName"
                    :value="field.fieldCode"
                  />
                </el-select>
                <div class="field-help">计数类默认统计记录条数；求和、平均值、去重计数需要选择字段。</div>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="form-block">
          <div class="block-title">
            <h3>第三步：是否限定统计范围？</h3>
            <p>大多数指标需要按月、季度、年度等周期统计；如果只是验证全量数据，可以先不限定。</p>
          </div>
          <el-row :gutter="18">
            <el-col :xs="24" :lg="12">
              <el-form-item label="统计周期">
                <el-radio-group v-model="dslForm.usePeriodFilter" class="period-radio">
                  <el-radio-button :label="false">不限定统计周期</el-radio-button>
                  <el-radio-button :label="true">按统计周期限定</el-radio-button>
                </el-radio-group>
                <div class="field-help">选择“不限定”会统计数据域内全部记录；选择“限定”会按试算或指标周期过滤。</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-form-item label="统计周期依据字段">
                <el-select
                  v-model="dslForm.periodFieldCode"
                  filterable
                  clearable
                  :disabled="!dslForm.usePeriodFilter"
                  placeholder="选择用于周期过滤的业务时间字段"
                  :loading="loading.fields"
                >
                  <el-option
                    v-for="field in semanticFieldOptions"
                    :key="field.fieldCode"
                    :label="field.fieldName"
                    :value="field.fieldCode"
                  />
                </el-select>
                <div class="field-help">启用统计周期后，用这个业务时间字段判断记录是否落在试算或指标统计窗口内。</div>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <div class="form-block">
          <div class="block-title">
            <h3>第四步：结果是否需要拆分？</h3>
            <p>默认输出一个总数。需要按科室、病区、医生等维度查看时，再选择分组字段。</p>
          </div>
          <el-row :gutter="18">
            <el-col :xs="24" :lg="12">
              <el-form-item label="分组维度">
                <el-select
                  v-model="dslForm.groupBy"
                  multiple
                  collapse-tags
                  collapse-tags-tooltip
                  filterable
                  clearable
                  placeholder="不分组，输出一个汇总值"
                  :loading="loading.fields"
                >
                  <el-option
                    v-for="field in semanticFieldOptions"
                    :key="field.fieldCode"
                    :label="field.fieldName"
                    :value="field.fieldCode"
                  />
                </el-select>
                <div class="field-help">不选择时输出一个汇总值；选择后会按科室、病区等维度拆分结果。</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :lg="12">
              <el-form-item label="结果单位">
                <el-select v-model="dslForm.unit">
                  <el-option label="人次" value="PERSON_TIME" />
                  <el-option label="例" value="CASE" />
                  <el-option label="元" value="YUAN" />
                  <el-option label="条" value="RECORD" />
                </el-select>
                <div class="field-help">用于结果展示，不改变计算逻辑。</div>
              </el-form-item>
            </el-col>
          </el-row>
        </div>
      </el-form>

      <div class="local-actions">
        <div>
          <strong>配置完成后保存</strong>
          <span>保存会创建后端因子草稿；保存并校验会继续调用编译接口。</span>
        </div>
        <div class="local-actions__buttons">
          <el-button :loading="loading.save" @click="saveFactor">保存因子定义</el-button>
          <el-button type="primary" :loading="loading.save || loading.compile" @click="saveAndCompile">
            保存并校验口径
          </el-button>
        </div>
      </div>

      <el-collapse class="dsl-collapse">
        <el-collapse-item title="高级：查看系统生成的 DSL" name="dsl">
          <pre class="dsl-preview">{{ generatedDslText }}</pre>
        </el-collapse-item>
      </el-collapse>
    </section>

    <section class="surface-card editor-section">
      <div class="section-head">
        <span class="section-index">3</span>
        <div>
          <h2>校验口径</h2>
          <p>调用后端编译接口检查计算口径是否有效，并生成可试算的计算产物。</p>
        </div>
      </div>
      <div class="section-actions">
        <el-button
          type="primary"
          :disabled="!factorState.versionId"
          :loading="loading.compile"
          @click="compileDsl"
        >
          校验口径
        </el-button>
        <span class="state-text">产物 ID：{{ factorState.artifactId || '-' }}</span>
        <span class="state-text">校验状态：{{ factorState.compileStatus || '-' }}</span>
      </div>
    </section>

    <section class="surface-card editor-section">
      <div class="section-head">
        <span class="section-index">4</span>
        <div>
          <h2>试算</h2>
          <p>选择试算周期后提交后端异步计算任务，用于确认该因子的结果口径是否符合预期。</p>
        </div>
      </div>
      <el-form :model="trialForm" label-width="96px" class="trial-form">
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-form-item label="开始时间">
              <el-date-picker
                v-model="trialForm.periodStart"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="开始时间"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="结束时间">
              <el-date-picker
                v-model="trialForm.periodEnd"
                type="datetime"
                value-format="YYYY-MM-DDTHH:mm:ss"
                placeholder="结束时间"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="任务状态">
              <el-input :model-value="factorState.taskStatus || '-'" readonly />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <div class="section-actions">
        <el-button
          type="primary"
          :disabled="!factorState.versionId"
          :loading="loading.trial"
          @click="startTrial"
        >
          发起试算
        </el-button>
        <span class="state-text">任务 ID：{{ factorState.taskId || '-' }}</span>
        <span class="state-text">批次 ID：{{ factorState.batchId || '-' }}</span>
      </div>
    </section>

    <section class="surface-card editor-section">
      <div class="section-head">
        <span class="section-index">5</span>
        <div>
          <h2>试算结果</h2>
          <p>读取试算批次的结果集，确认结果后再发布因子版本。</p>
        </div>
      </div>
      <div class="section-actions">
        <el-button
          :disabled="!factorState.batchId"
          :loading="loading.results"
          @click="loadTrialResults"
        >
          查看试算结果
        </el-button>
        <span class="state-text">结果集状态：{{ factorState.resultStatus || '-' }}</span>
        <span class="state-text">最新结果：{{ factorState.resultValue || '-' }}</span>
      </div>
      <el-table
        v-if="trialRecords.length"
        :data="trialRecords"
        table-layout="fixed"
        class="result-table"
      >
        <el-table-column label="结果状态" prop="resultStatus" width="120" />
        <el-table-column label="结果值" min-width="140">
          <template #default="{ row }">{{ row.valueDecimal ?? row.resultValue ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="显示值" prop="displayValue" min-width="120" />
        <el-table-column label="质量状态" prop="qualityStatus" width="120" />
      </el-table>
    </section>

    <section class="surface-card editor-section">
      <div class="section-head">
        <span class="section-index">6</span>
        <div>
          <h2>发布</h2>
          <p>发布后的因子版本可被指标公式引用，适合放入正式演示流程的最后一步。</p>
        </div>
      </div>
      <div class="section-actions">
        <el-button
          type="primary"
          :disabled="!factorState.resultValue"
          :loading="loading.publish"
          @click="publishFactor"
        >
          发布因子版本
        </el-button>
        <span class="state-text">发布状态：{{ factorState.publishStatus || '-' }}</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import {
  fetchDataDomains,
  fetchSemanticFields,
  fetchSemanticTableFields,
  fetchSemanticTables
} from '@/idmp/api/modules/meta'
import {
  compileFactorVersion,
  createFactor,
  fetchCompileArtifact,
  fetchFactor,
  fetchFactors,
  fetchFactorTrialResults,
  fetchFactorVersion,
  fetchFactorVersionsByFactor,
  publishFactorVersion,
  trialFactorVersion
} from '@/idmp/api/modules/factors'
import { fetchAsyncTask, fetchCalcBatch } from '@/idmp/api/modules/calculation'

const route = useRoute()
const router = useRouter()
const basicFormRef = ref()

const isCreateMode = computed(() => !route.params.id || route.params.id === 'new')
const pageTitle = computed(() => (isCreateMode.value ? '因子编辑 / 新增因子' : `因子编辑 / ${route.params.id}`))

const caliberTemplates = [
  { value: 'COUNT', label: '计数类因子', description: '统计记录数、人次数、病例数' },
  { value: 'SUM', label: '求和类因子', description: '统计费用、数量、时长合计' },
  { value: 'AVG', label: '平均值因子', description: '统计均次费用、平均天数' },
  { value: 'COUNT_DISTINCT', label: '去重计数因子', description: '统计唯一患者、唯一就诊号' }
]

const aggregationLabels = {
  COUNT: '计数',
  SUM: '求和',
  AVG: '平均值',
  MIN: '最小值',
  MAX: '最大值',
  COUNT_DISTINCT: '去重计数'
}

const basicForm = reactive({
  code: createFactorCode(),
  name: '住院死亡记录数',
  type: 'ATOMIC',
  description: '统计住院死亡记录数量，可作为住院死亡率分子因子使用。'
})

const dslForm = reactive({
  template: 'COUNT',
  domainCode: '',
  semanticTableCode: '',
  aggregationFunction: 'COUNT',
  fieldCode: '',
  usePeriodFilter: true,
  periodFieldCode: '',
  groupBy: [],
  unit: 'PERSON_TIME'
})

const trialForm = reactive({
  periodStart: '2000-01-01T00:00:00',
  periodEnd: '2030-01-01T00:00:00'
})

const factorState = reactive({
  factorId: '',
  versionId: '',
  saveStatus: '',
  artifactId: '',
  compileStatus: '',
  taskId: '',
  taskStatus: '',
  batchId: '',
  batchStatus: '',
  resultStatus: '',
  resultValue: '',
  publishStatus: ''
})

const loading = reactive({
  detail: false,
  domains: false,
  semanticTables: false,
  fields: false,
  save: false,
  compile: false,
  trial: false,
  results: false,
  publish: false
})

const domainOptions = ref([])
const semanticTableOptions = ref([])
const semanticFieldOptions = ref([])
const trialRecords = ref([])

const basicRules = {
  code: [{ required: true, message: '请输入因子编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入因子名称', trigger: 'blur' }]
}

const currentDomainName = computed(() => {
  const domain = domainOptions.value.find((item) => item.domainCode === dslForm.domainCode)
  return domain?.domainName || dslForm.domainCode || '未选择'
})

const currentFieldName = computed(() => getFieldName(dslForm.fieldCode))
const aggregationLabel = computed(() => aggregationLabels[dslForm.aggregationFunction] || dslForm.aggregationFunction)
const filterPreview = computed(() => {
  if (!dslForm.usePeriodFilter) return '不限定统计周期'
  return `${getFieldName(dslForm.periodFieldCode) || '未选择统计周期依据字段'} 在试算或指标统计周期内`
})
const groupByPreview = computed(() => {
  if (!dslForm.groupBy.length) return '不分组，输出一个汇总值'
  return dslForm.groupBy.map((code) => getFieldName(code)).join('、')
})
const caliberPreview = computed(() => {
  const target = dslForm.aggregationFunction === 'COUNT' ? '记录数' : currentFieldName.value || '所选字段'
  return `从【${currentDomainName.value}】中${filterPreview.value === '不限定统计周期' ? '' : `，限定【${filterPreview.value}】`}，按【${aggregationLabel.value}】统计【${target}】，并按【${groupByPreview.value}】汇总。`
})
const generatedDslText = computed(() => JSON.stringify(buildDsl(), null, 2))

onMounted(async () => {
  await loadDomains()
  await loadFactorForEdit()
})

async function loadFactorForEdit() {
  if (isCreateMode.value) return

  loading.detail = true
  try {
    const factor = await fetchEditableFactor()
    hydrateFactor(factor)

    const version = await fetchEditableFactorVersion(factor)
    if (version) {
      hydrateFactorVersion(version)
      await loadSemanticTables()
    }
    if (!factorState.versionId) {
      ElMessage.warning('已加载因子基础信息，但未找到可试算的因子版本')
    } else if (!factorState.artifactId) {
      ElMessage.warning('已加载因子版本，但未找到编译产物 ID，请先点击校验口径')
    } else {
      ElMessage.success('已从后端加载因子详情，可直接发起试算')
    }
  } catch (error) {
    ElMessage.warning(error?.message || '因子详情接口读取失败，当前保留本地默认表单')
  } finally {
    loading.detail = false
  }
}

async function fetchEditableFactor() {
  const key = String(route.params.id || '')
  if (/^\d+$/.test(key)) {
    try {
      return await fetchFactor(key)
    } catch {
      const version = await fetchFactorVersion(key)
      return {
        id: version.factorId,
        factorId: version.factorId,
        code: version.factorCode,
        name: version.factorName,
        status: version.status,
        draftVersionId: version.id,
        currentArtifactId: version.currentArtifactId,
        latestVersion: version
      }
    }
  }

  const rows = normalizeList(await fetchFactors({ code: key, page: 1, size: 100 }))
  const summary = rows.find((item) => [item.id, item.factorId, item.code, item.factorCode].map(toOpaqueId).includes(key))
  const factorId = summary?.id ?? summary?.factorId
  return factorId ? fetchFactor(factorId) : summary
}

async function fetchEditableFactorVersion(factor) {
  const inlineVersion = factor?.latestVersion || factor?.version || factor?.factorVersion
  if (inlineVersion?.id || inlineVersion?.versionId || inlineVersion?.factorVersionId) {
    return inlineVersion
  }

  const candidateIds = [
    route.params.id,
    factor?.publishedVersionId,
    factor?.draftVersionId,
    factor?.currentVersionId,
    factor?.latestVersionId,
    factor?.factorVersionId,
    factor?.versionId
  ].map(toOpaqueId).filter(Boolean)

  for (const versionId of candidateIds) {
    try {
      const version = await fetchFactorVersion(versionId)
      if (version?.id || version?.versionId || version?.factorVersionId) {
        return version
      }
    } catch {
      // Try the next candidate; route params can be factor IDs rather than version IDs.
    }
  }

  if (factorState.factorId) {
    const versions = normalizeList(await fetchFactorVersionsByFactor(factorState.factorId))
    const latest = pickLatestVersion(versions)
    const latestVersionId = resolveFactorVersionId(latest) || toOpaqueId(latest?.id)
    return latestVersionId ? fetchFactorVersion(latestVersionId) : latest
  }

  return null
}

function hydrateFactor(factor) {
  if (!factor) throw new Error(`未找到因子 ${route.params.id}`)
  basicForm.code = factor.code || factor.factorCode || basicForm.code
  basicForm.name = factor.name || factor.factorName || basicForm.name
  basicForm.description = factor.description || factor.factorDescription || basicForm.description
  factorState.factorId = toOpaqueId(factor.id ?? factor.factorId ?? factorState.factorId)
  factorState.saveStatus = factor.status || factorState.saveStatus
}

function hydrateFactorVersion(version) {
  factorState.versionId = resolveFactorVersionId(version) || factorState.versionId
  factorState.artifactId = version.currentArtifactId || version.artifactId || factorState.artifactId
  factorState.compileStatus = version.status || factorState.compileStatus
  factorState.publishStatus = version.status === 'PUBLISHED' ? 'PUBLISHED' : factorState.publishStatus

  const dsl = version.dsl || version.factorDsl || version.definition?.dsl || {}
  dslForm.domainCode = dsl.primaryDomain?.domainCode || dsl.domainCode || dslForm.domainCode
  dslForm.semanticTableCode = dsl.primaryDomain?.semanticTableCode || dsl.semanticTableCode || dslForm.semanticTableCode
  dslForm.aggregationFunction = dsl.aggregation?.function || dslForm.aggregationFunction
  dslForm.template = dslForm.aggregationFunction
  dslForm.fieldCode = dsl.aggregation?.fieldCode || ''
  dslForm.groupBy = Array.isArray(dsl.groupBy) ? dsl.groupBy.map((item) => item.fieldCode || item) : []
  dslForm.unit = dsl.output?.unit || dslForm.unit

  const periodFieldCode = extractPeriodFieldCode(dsl.filters)
  if (periodFieldCode) {
    dslForm.usePeriodFilter = true
    dslForm.periodFieldCode = periodFieldCode
  } else {
    dslForm.usePeriodFilter = false
    dslForm.periodFieldCode = ''
  }
}

function extractPeriodFieldCode(node) {
  if (!node || typeof node !== 'object') return ''
  if (
    node.nodeType === 'PREDICATE' &&
    node.operator === 'BETWEEN' &&
    node.parameter === 'period' &&
    node.fieldCode
  ) {
    return node.fieldCode
  }
  if (Array.isArray(node.children)) {
    return node.children.map(extractPeriodFieldCode).find(Boolean) || ''
  }
  return ''
}

async function loadDomains() {
  loading.domains = true
  try {
    const domains = normalizeList(await fetchDataDomains())
    domainOptions.value = domains
      .map(normalizeDomainOption)
      .filter((item) => item.domainCode)
      .sort(sortDomainOptions)

    const preferred = domainOptions.value.find((item) => item.domainCode === 'INPATIENT_DEATH_RECORD')
    dslForm.domainCode = preferred?.domainCode || domainOptions.value[0]?.domainCode || 'INPATIENT_DEATH_RECORD'
    await loadSemanticTables()
  } catch (error) {
    dslForm.domainCode = 'INPATIENT_DEATH_RECORD'
    ElMessage.warning(error?.message || '数据域读取失败，已使用默认数据域')
  } finally {
    loading.domains = false
  }
}

function normalizeDomainOption(item) {
  const domainCode = item.domainCode ?? item.code
  const rawName = item.domainName ?? item.name
  return {
    id: item.id ?? item.domainId,
    domainCode,
    domainName: rawName || domainCode
  }
}

function sortDomainOptions(a, b) {
  const order = [
    'INPATIENT_DEATH_RECORD',
    'INPATIENT_DISCHARGE_RECORD',
    'INPATIENT_QUALITY_WORKLOAD',
    'INPATIENT_VISIT',
    'ANTIMICORVIAL_USE',
    'ANTIMICROBIAL_USE',
    'PREPERATIVE_DISCUSSION',
    'PREOPERATIVE_DISCUSSION',
    'SURGERY_INFORMED_CONSENT',
    'SOURCE_RAW'
  ]
  const aIndex = order.indexOf(a.domainCode)
  const bIndex = order.indexOf(b.domainCode)
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
  }
  return a.domainCode.localeCompare(b.domainCode)
}

async function handleDomainChange() {
  dslForm.semanticTableCode = ''
  dslForm.fieldCode = ''
  dslForm.periodFieldCode = ''
  dslForm.groupBy = []
  await loadSemanticTables()
}

async function handleSemanticTableChange() {
  dslForm.fieldCode = ''
  dslForm.periodFieldCode = ''
  dslForm.groupBy = []
  await loadSemanticFields()
}

async function loadSemanticTables() {
  const domain = domainOptions.value.find((item) => item.domainCode === dslForm.domainCode)
  semanticTableOptions.value = []
  if (!domain?.id) {
    semanticFieldOptions.value = []
    return
  }

  loading.semanticTables = true
  try {
    const tables = normalizeList(await fetchSemanticTables(domain.id))
    semanticTableOptions.value = tables.map(normalizeSemanticTableOption).filter((item) => item.code)
    if (!semanticTableOptions.value.length) {
      semanticTableOptions.value = [createCompatSemanticTableOption(domain)]
    }
    const preferred = semanticTableOptions.value.find((item) => item.code === dslForm.domainCode)
    dslForm.semanticTableCode = dslForm.semanticTableCode || preferred?.code || semanticTableOptions.value[0]?.code || ''
  } catch {
    semanticTableOptions.value = [createCompatSemanticTableOption(domain)]
    dslForm.semanticTableCode = dslForm.semanticTableCode || domain.domainCode
  } finally {
    loading.semanticTables = false
  }

  await loadSemanticFields()
}

async function loadSemanticFields() {
  const domain = domainOptions.value.find((item) => item.domainCode === dslForm.domainCode)
  if (!domain?.id) {
    semanticFieldOptions.value = []
    return
  }

  loading.fields = true
  try {
    const fields = dslForm.semanticTableCode
      ? normalizeList(await fetchSemanticTableFields(domain.id, dslForm.semanticTableCode))
      : normalizeList(await fetchSemanticFields(domain.id))
    semanticFieldOptions.value = fields.map(normalizeSemanticFieldOption).filter((item) => item.fieldCode)
    if (dslForm.usePeriodFilter && !dslForm.periodFieldCode) {
      dslForm.periodFieldCode = getDefaultPeriodFieldCode(dslForm.domainCode)
    }
  } catch (error) {
    if (dslForm.semanticTableCode) {
      try {
        const fallbackFields = normalizeList(await fetchSemanticFields(domain.id))
        semanticFieldOptions.value = fallbackFields.map(normalizeSemanticFieldOption).filter((item) => item.fieldCode)
        if (dslForm.usePeriodFilter && !dslForm.periodFieldCode) {
          dslForm.periodFieldCode = getDefaultPeriodFieldCode(dslForm.domainCode)
        }
        return
      } catch {
        semanticFieldOptions.value = []
      }
    } else {
      semanticFieldOptions.value = []
    }
    ElMessage.warning(error?.message || '语义字段读取失败')
  } finally {
    loading.fields = false
  }
}

function normalizeSemanticTableOption(item) {
  const code = item.code ?? item.semanticTableCode
  const name = item.name ?? item.semanticTableName ?? code
  const sourceTableName = item.sourceTableName || item.tableName || ''
  return {
    id: item.id,
    code,
    name,
    defaultTimeSemanticFieldCode: item.defaultTimeSemanticFieldCode || '',
    sourceTableName,
    optionLabel: sourceTableName ? `${name}（${sourceTableName}）` : name
  }
}

function createCompatSemanticTableOption(domain) {
  return {
    id: domain.id,
    code: domain.domainCode,
    name: domain.domainName || domain.domainCode,
    defaultTimeSemanticFieldCode: '',
    sourceTableName: '兼容字段视图',
    optionLabel: `${domain.domainName || domain.domainCode}（兼容字段视图）`
  }
}

function normalizeSemanticFieldOption(item) {
  return {
    fieldCode: item.fieldCode ?? item.code,
    fieldName: item.fieldName ?? item.name ?? item.fieldCode ?? item.code,
    dataType: item.dataType ?? item.fieldType ?? ''
  }
}

function applyTemplate(template) {
  dslForm.template = template
  dslForm.aggregationFunction = template
  if (template === 'COUNT') {
    dslForm.fieldCode = ''
    dslForm.unit = 'PERSON_TIME'
  }
  if (template === 'SUM') dslForm.unit = 'YUAN'
  if (template === 'AVG') dslForm.unit = 'CASE'
  if (template === 'COUNT_DISTINCT') dslForm.unit = 'PERSON_TIME'
}

async function saveAndCompile() {
  const saved = await saveFactor()
  if (saved) {
    await compileDsl()
  }
}

async function saveFactor() {
  if (!isCreateMode.value) {
    ElMessage.warning('已有因子的基础信息更新接口暂未接入，当前仅支持真实回显与新增流程。')
    return false
  }

  await basicFormRef.value?.validate()

  if (dslForm.aggregationFunction !== 'COUNT' && !dslForm.fieldCode) {
    ElMessage.warning('当前统计方式需要选择具体统计对象')
    return false
  }
  if (dslForm.usePeriodFilter && !dslForm.periodFieldCode) {
    ElMessage.warning('启用统计周期限定时需要选择统计周期依据字段')
    return false
  }

  loading.save = true
  try {
    const factor = await createFactor({
      code: basicForm.code,
      name: basicForm.name,
      description: basicForm.description,
      dsl: buildDsl()
    })
    const versionId = resolveFactorVersionId(factor)
    if (!versionId) {
      throw new Error('后端未返回 draftVersionId，无法继续校验口径')
    }
    Object.assign(factorState, {
      factorId: factor.id || factor.factorId,
      versionId,
      saveStatus: factor.status || 'DRAFT',
      artifactId: '',
      compileStatus: '',
      taskId: '',
      taskStatus: '',
      batchId: '',
      batchStatus: '',
      resultStatus: '',
      resultValue: '',
      publishStatus: ''
    })
    trialRecords.value = []
    ElMessage.success('因子定义已保存')
    return true
  } catch (error) {
    ElMessage.error(error?.message || '因子定义保存失败')
    return false
  } finally {
    loading.save = false
  }
}

async function compileDsl() {
  if (!factorState.versionId) {
    ElMessage.warning('请先保存因子定义')
    return
  }

  loading.compile = true
  try {
    const compile = await compileFactorVersion(factorState.versionId, {
      compileMode: 'VALIDATE_AND_GENERATE',
      includePlanAssessment: true
    })
    factorState.artifactId = compile.artifactId
    factorState.compileStatus = compile.status || 'SUBMITTED'

    if (compile.artifactId) {
      const artifact = await fetchCompileArtifact(compile.artifactId)
      factorState.compileStatus = artifact.status || factorState.compileStatus
    }

    if (factorState.compileStatus === 'VALID') {
      ElMessage.success('计算口径校验通过')
    } else {
      ElMessage.info(`计算口径校验状态：${factorState.compileStatus}`)
    }
  } catch (error) {
    ElMessage.error(error?.message || '计算口径校验失败')
  } finally {
    loading.compile = false
  }
}

async function startTrial() {
  if (!factorState.versionId) {
    ElMessage.warning('请先加载或创建因子版本')
    return
  }

  loading.trial = true
  try {
    const trial = await trialFactorVersion(
      factorState.versionId,
      {
        periodStart: trialForm.periodStart,
        periodEnd: trialForm.periodEnd
      },
      `factor-editor-${Date.now()}`
    )
    factorState.taskId = trial.taskId
    factorState.batchId = trial.batchId
    factorState.taskStatus = trial.status || 'SUBMITTED'

    if (trial.taskId) {
      const task = await pollTask(trial.taskId)
      factorState.taskStatus = task.status || factorState.taskStatus
    }

    ElMessage.success('试算任务已提交')
  } catch (error) {
    ElMessage.error(error?.message || '发起试算失败')
  } finally {
    loading.trial = false
  }
}

async function loadTrialResults() {
  if (!factorState.batchId) {
    ElMessage.warning('请先发起试算')
    return
  }

  loading.results = true
  try {
    const batch = await pollBatch(factorState.batchId)
    factorState.batchStatus = batch.status || factorState.batchStatus

    const resultSet = await fetchFactorTrialResults(factorState.versionId, factorState.batchId)
    factorState.resultStatus = resultSet.resultSetStatus || resultSet.status || 'READY'
    trialRecords.value = resultSet.results?.records || []
    const firstRecord = trialRecords.value[0]
    factorState.resultValue = firstRecord?.valueDecimal ?? firstRecord?.resultValue ?? firstRecord?.displayValue ?? ''
    ElMessage.success('试算结果已读取')
  } catch (error) {
    ElMessage.error(error?.message || '试算结果读取失败')
  } finally {
    loading.results = false
  }
}

async function publishFactor() {
  if (!factorState.resultValue) {
    ElMessage.warning('请先确认试算结果')
    return
  }
  if (!dslForm.usePeriodFilter || !dslForm.periodFieldCode) {
    ElMessage.warning('发布前请为因子 DSL 声明 period BETWEEN 时间过滤，否则指标发布无法自动回补')
    return
  }

  loading.publish = true
  try {
    const published = await publishFactorVersion(factorState.versionId)
    factorState.publishStatus = published.status || 'PUBLISHED'
    ElMessage.success('因子版本已发布')
  } catch (error) {
    ElMessage.error(error?.message || '因子版本发布失败')
  } finally {
    loading.publish = false
  }
}

function buildDsl() {
  const isCount = dslForm.aggregationFunction === 'COUNT'

  return {
    schemaVersion: '1.0',
    dslType: 'FACTOR',
    primaryDomain: {
      domainCode: dslForm.domainCode,
      ...(dslForm.semanticTableCode ? { semanticTableCode: dslForm.semanticTableCode } : {})
    },
    filters: dslForm.usePeriodFilter
      ? {
          nodeType: 'PREDICATE',
          fieldCode: dslForm.periodFieldCode,
          operator: 'BETWEEN',
          parameter: 'period'
        }
      : { nodeType: 'TRUE' },
    aggregation: isCount
      ? { function: 'COUNT' }
      : { function: dslForm.aggregationFunction, fieldCode: dslForm.fieldCode },
    groupBy: dslForm.groupBy,
    parameters: dslForm.usePeriodFilter ? [{ code: 'period', type: 'DATETIME_RANGE' }] : [],
    output: {
      valueType: 'DECIMAL',
      semanticKind: 'MEASURE',
      dimension: isCount ? 'COUNT' : 'AMOUNT',
      unit: dslForm.unit || 'PERSON_TIME',
      nullable: false,
      precision: 30,
      scale: 10,
      grain: []
    }
  }
}

function getFieldName(fieldCode) {
  if (!fieldCode) return ''
  const field = semanticFieldOptions.value.find((item) => item.fieldCode === fieldCode)
  return field?.fieldName || fieldCode
}

function resolveFactorVersionId(factor) {
  return toOpaqueId(
    factor?.draftVersionId ??
    factor?.versionId ??
    factor?.factorVersionId ??
    factor?.currentVersionId ??
    factor?.latestVersionId ??
    factor?.publishedVersionId ??
    factor?.id
  )
}

function getDefaultPeriodFieldCode(domainCode) {
  const preferredFields = {
    INPATIENT_DEATH_RECORD: 'DEATH_DATETIME',
    INPATIENT_DISCHARGE_RECORD: 'OUT_DATE',
    DISCHARGE_CASE: 'OUT_DATE'
  }
  const preferred = preferredFields[domainCode]
  if (preferred && semanticFieldOptions.value.some((item) => item.fieldCode === preferred)) {
    return preferred
  }
  const dateField = semanticFieldOptions.value.find((item) =>
    /DATE|TIME/i.test(item.dataType) || /DATE|TIME|DATETIME|OUT|DISCHARGE|DEATH/i.test(item.fieldCode)
  )
  return dateField?.fieldCode || ''
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

function pickLatestVersion(versions) {
  return [...versions].sort((a, b) => {
    const aNo = Number(a.versionNo ?? a.version ?? 0)
    const bNo = Number(b.versionNo ?? b.version ?? 0)
    if (aNo !== bNo) return bNo - aNo
    return String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || ''))
  })[0]
}

function toOpaqueId(value) {
  return value === null || value === undefined ? '' : String(value)
}

async function pollTask(taskId) {
  let task = await fetchAsyncTask(taskId)
  for (let index = 0; index < 18 && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(task.status); index += 1) {
    await delay(1000)
    task = await fetchAsyncTask(taskId)
  }
  return task
}

async function pollBatch(batchId) {
  let batch = await fetchCalcBatch(batchId)
  for (let index = 0; index < 10 && !['SUCCEEDED', 'FAILED', 'CANCELED'].includes(batch.status); index += 1) {
    await delay(1000)
    batch = await fetchCalcBatch(batchId)
  }
  return batch
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function createFactorCode() {
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `FRONTEND_FACTOR_${timestamp}`
}

function goBack() {
  router.push('/factor')
}
</script>

<style scoped lang="scss">
.factor-editor {
  min-width: 0;
}

.editor-alert {
  margin-bottom: 16px;
}

.domain-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  align-items: center;
  gap: 12px;
  line-height: 20px;

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--idmp-text-primary, #262626);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    flex: 0 0 auto;
    color: var(--idmp-text-disabled, #b8b8b8);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 11px;
  }
}

.editor-section {
  margin-bottom: 16px;
  padding: 18px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;

  h2 {
    margin: 0 0 4px;
    color: #262626;
    font-size: 16px;
    line-height: 22px;
  }

  p {
    margin: 0;
    color: #8c8c8c;
    font-size: 13px;
    line-height: 20px;
  }
}

.section-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  color: #fff;
  font-weight: 600;
  background: #1890ff;
  border-radius: 50%;
}

.basic-form,
.dsl-form,
.trial-form {
  :deep(.el-select),
  :deep(.el-date-editor.el-input) {
    width: 100%;
  }
}

.dsl-form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-form-item__label) {
    display: block;
    margin-bottom: 6px;
    color: var(--idmp-text-primary, #262626);
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
    white-space: normal;
  }
}

.saved-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 4px;
  padding: 11px 12px;
  color: #595959;
  font-size: 13px;
  background: #f7fbff;
  border: 1px solid #d6ecff;
  border-radius: 6px;

  strong {
    color: #1677c2;
  }
}

.caliber-preview-banner {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  margin-bottom: 16px;
  padding: 14px 16px;
  background: #f7fbff;
  border: 1px solid #d6ecff;
  border-radius: 6px;

  span {
    color: #1677c2;
    font-size: 13px;
    font-weight: 600;
    line-height: 22px;
  }

  strong {
    color: #262626;
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
  }
}

.form-block {
  padding: 16px 16px 0;
  margin-bottom: 14px;
  background: #fafafa;
  border: 1px solid #edf0f5;
  border-radius: 6px;
}

.block-title {
  margin-bottom: 14px;

  h3 {
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

.field-help {
  margin-top: 6px;
  color: var(--idmp-text-helper, #8c8c8c);
  font-size: 12px;
  line-height: 18px;
}

.template-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.template-card {
  min-height: 82px;
  padding: 13px 14px;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5e8ef;
  border-radius: 6px;

  strong,
  span {
    display: block;
  }

  strong {
    color: #262626;
    font-size: 14px;
    line-height: 20px;
  }

  span {
    margin-top: 6px;
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }

  &.is-active {
    border-color: #1890ff;
    background: #f7fbff;

    strong {
      color: #1677c2;
    }
  }
}

.period-radio {
  display: flex;
  width: 100%;

  :deep(.el-radio-button) {
    flex: 1;
  }

  :deep(.el-radio-button__inner) {
    width: 100%;
    min-height: 32px;
    padding-right: 10px;
    padding-left: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.local-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e5e8ef;
  border-radius: 6px;

  strong,
  span {
    display: block;
  }

  strong {
    color: #262626;
    font-size: 14px;
    line-height: 20px;
  }

  span {
    margin-top: 4px;
    color: #8c8c8c;
    font-size: 12px;
    line-height: 18px;
  }
}

.local-actions__buttons {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
}

.dsl-collapse {
  margin-top: 14px;

  :deep(.el-collapse-item__header) {
    color: #595959;
    font-size: 13px;
  }
}

.dsl-preview {
  max-height: 320px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  color: #31343a;
  font-size: 12px;
  line-height: 18px;
  background: #f6f8fa;
  border: 1px solid #edf0f5;
  border-radius: 6px;
}

.section-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.state-text {
  color: #595959;
  font-size: 13px;
}

.result-table {
  margin-top: 14px;

  :deep(th.el-table__cell) {
    color: #1f2329;
    font-weight: 600;
    background: #fafafa;
  }
}

@media (max-width: 1280px) {
  .template-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .local-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .local-actions__buttons {
    justify-content: flex-end;
  }
}
</style>
