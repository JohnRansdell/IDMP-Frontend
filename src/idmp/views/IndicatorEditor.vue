<template>
  <div class="idmp-page editor-page">
    <PageHeader
      eyebrow="指标配置 / 指标目录"
      :title="isNew ? '新建指标' : '编辑指标'"
      description="按稳定指标、草稿版本、Formula AST、试算与发布门禁逐步配置。已发布版本的口径变更必须创建新版本。"
      status="DRAFT"
    >
      <template #meta>
        <span class="mono-data">指标 ID：{{ indicatorWorkflow.indicatorId || '尚未创建' }}</span>
        <span class="mono-data">版本 ID：{{ indicatorWorkflow.versionId || '尚未创建' }}</span>
        <span>当前路由标识：{{ route.params.id || '未提供' }}</span>
      </template>
      <template #actions>
        <el-button @click="router.push('/indicator')">返回指标目录</el-button>
      </template>
    </PageHeader>

    <section class="surface-card workflow-overview" aria-label="指标配置生命周期">
      <div
        v-for="(step, index) in workflowSteps"
        :key="step.key"
        class="workflow-step"
        :class="`is-${step.state}`"
      >
        <span class="workflow-step__index">{{ index + 1 }}</span>
        <span class="workflow-step__copy">
          <strong>{{ step.label }}</strong>
          <small>{{ step.description }}</small>
        </span>
      </div>
    </section>

    <div class="notice-strip is-warning editor-contract-note">
      <el-icon><InfoFilled /></el-icon>
      <span>
        当前后端只覆盖创建指标/版本、保存固定因子 AST、编译与试算链路；详情读取、规则/场景持久化和发布接口尚未完整接入。
        下方未接入能力会明确标注，不会显示假成功。
      </span>
    </div>

    <el-tabs v-model="activeTab" class="idmp-tabs editor-tabs">
      <el-tab-pane label="1 基础与版本" name="basic">
        <section class="surface-card form-card">
          <el-form ref="formRef" :model="form" :rules="rules" label-width="108px" status-icon>
            <div class="form-grid">
              <el-form-item label="指标编码" prop="code">
                <el-input v-model="form.code" placeholder="如：KH-01，按规则自动生成或手动输入" />
              </el-form-item>
              <el-form-item label="指标名称" prop="name">
                <el-input v-model="form.name" placeholder="请输入指标完整名称" />
              </el-form-item>
              <el-form-item label="指标简称">
                <el-input v-model="form.shortName" placeholder="用于图表标签的简短名称" />
              </el-form-item>
              <el-form-item label="指标分类" prop="categoryMain">
                <div class="category-row">
                  <el-select v-model="form.categoryMain" aria-label="指标一级分类">
                    <el-option label="医疗质量" value="医疗质量" />
                    <el-option label="运营效率" value="运营效率" />
                  </el-select>
                  <el-icon><Right /></el-icon>
                  <el-select v-model="form.categorySub" aria-label="指标二级分类">
                    <el-option label="质量安全" value="质量安全" />
                    <el-option label="功能定位" value="功能定位" />
                    <el-option label="合理用药" value="合理用药" />
                  </el-select>
                </div>
              </el-form-item>
              <el-form-item label="指标属性" prop="attribute">
                <el-radio-group v-model="form.attribute">
                  <el-radio value="定量">定量</el-radio>
                  <el-radio value="定性">定性</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="计量单位" prop="unit">
                <el-select v-model="form.unit">
                  <el-option label="百分比（%）" value="百分比（%）" />
                  <el-option label="比值" value="比值" />
                  <el-option label="人次" value="人次" />
                  <el-option label="元" value="元" />
                  <el-option label="天数" value="天数" />
                </el-select>
              </el-form-item>
              <el-form-item label="指标导向" prop="direction">
                <el-select v-model="form.direction">
                  <el-option label="逐步降低 ↓" value="逐步降低 ↓" />
                  <el-option label="逐步提高 ↑" value="逐步提高 ↑" />
                  <el-option label="监测比较" value="监测比较" />
                  <el-option label="无导向" value="无导向" />
                </el-select>
              </el-form-item>
              <el-form-item label="统计周期" prop="period">
                <el-select v-model="form.period">
                  <el-option label="年度" value="年度" />
                  <el-option label="季度" value="季度" />
                  <el-option label="月度" value="月度" />
                  <el-option label="自定义" value="自定义" />
                </el-select>
              </el-form-item>
              <el-form-item label="指标定义" prop="definition" class="form-span-2">
                <el-input
                  v-model="form.definition"
                  type="textarea"
                  :rows="3"
                  placeholder="请输入指标的业务含义描述，应引用政策文件原文"
                />
              </el-form-item>
              <el-form-item label="指标意义" class="form-span-2">
                <el-input
                  v-model="form.significance"
                  type="textarea"
                  :rows="2"
                  placeholder="指标设置的目的和管理意义"
                />
              </el-form-item>
              <el-form-item label="数据来源" prop="sources" class="form-span-2">
                <el-checkbox-group v-model="form.sources">
                  <el-checkbox v-for="item in sourceOptions" :key="item" :value="item">{{ item }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="政策文件来源" prop="policies" class="form-span-2">
                <el-checkbox-group v-model="form.policies">
                  <el-checkbox v-for="item in policyOptions" :key="item" :value="item">{{ item }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </div>
          </el-form>
          <div class="business-action-bar">
            <div>
              <span>基本信息操作</span>
              <small>{{ indicatorWorkflow.indicatorId ? `已保存指标 ${indicatorWorkflow.indicatorId}` : '先保存基本信息，再创建可配置版本' }}</small>
            </div>
            <el-button :loading="workflowLoading.basic" @click="saveIndicatorBasicInfo">保存基本信息</el-button>
            <el-button type="primary" :disabled="!indicatorWorkflow.indicatorId" :loading="workflowLoading.version" @click="createIndicatorDraftVersion">
              创建指标版本
            </el-button>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="2 公式与试算" name="formula">
        <section class="surface-card formula-card">
          <div class="notice-strip is-warning formula-contract-note">
            <el-icon><InfoFilled /></el-icon>
            <span>
              可视分子/分母目前仍是演示编辑器；当前真实保存请求只写入固定死亡率因子版本引用。
              页面预览不等于已保存 Formula AST，不能作为发布依据。
            </span>
          </div>
          <h2>计算模式</h2>
          <div class="formula-modes">
            <el-button
              v-for="mode in formulaModes"
              :key="mode.name"
              :type="formulaMode === mode.name ? 'primary' : 'default'"
              :aria-pressed="formulaMode === mode.name ? 'true' : 'false'"
              @click="formulaMode = mode.name"
            >
              {{ mode.name }}
            </el-button>
          </div>
          <div class="mode-help">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ activeMode.description }}</span>
          </div>

          <h2 class="formula-section-title">公式编辑器</h2>
          <div class="formula-builder">
            <div
              class="factor-slot"
              :class="{ 'is-empty': !numeratorFactors.length }"
              data-testid="numerator-slot"
              @dragover.prevent
              @drop="dropFactor('numerator')"
              @mouseup="dropFactor('numerator')"
            >
              <div class="slot-label">分子（NUMERATOR）<span>拖入因子</span></div>
              <div class="slot-content">
                <div v-for="factor in numeratorFactors" :key="factor.code" class="selected-factor">
                  <span>{{ factor.name }}</span>
                  <small>{{ factor.code }}</small>
                  <button type="button" @click="editFactor(factor)">编辑条件</button>
                  <el-button
                    text
                    circle
                    :icon="Close"
                    :aria-label="`移除分子因子 ${factor.name}（${factor.code}）`"
                    @click="removeFactor('numerator', factor.code)"
                  />
                </div>
                <span v-if="!numeratorFactors.length" class="slot-placeholder">从下方拖入分子因子</span>
              </div>
            </div>

            <div class="formula-operator">÷</div>

            <div
              class="factor-slot"
              :class="{ 'is-empty': !denominatorFactors.length }"
              data-testid="denominator-slot"
              @dragover.prevent
              @drop="dropFactor('denominator')"
              @mouseup="dropFactor('denominator')"
            >
              <div class="slot-label">分母（DENOMINATOR）<span>拖入因子</span></div>
              <div class="slot-content">
                <div v-for="factor in denominatorFactors" :key="factor.code" class="selected-factor">
                  <span>{{ factor.name }}</span>
                  <small>{{ factor.code }}</small>
                  <button type="button" @click="editFactor(factor)">编辑条件</button>
                  <el-button
                    text
                    circle
                    :icon="Close"
                    :aria-label="`移除分母因子 ${factor.name}（${factor.code}）`"
                    @click="removeFactor('denominator', factor.code)"
                  />
                </div>
                <span v-if="!denominatorFactors.length" class="slot-placeholder">从下方拖入分母因子</span>
              </div>
            </div>

            <div class="formula-operator multiplier">× <strong>100%</strong></div>
          </div>

          <div class="factor-library">
            <div class="factor-library__head">
              <h3><el-icon><Box /></el-icon>可用因子（拖拽到上方编辑器槽位）</h3>
              <div class="factor-tools">
                <el-input
                  v-model="factorSearch"
                  :prefix-icon="Search"
                  placeholder="搜索因子..."
                  clearable
                  aria-label="搜索可用因子"
                />
                <el-select v-model="factorCategory" aria-label="筛选因子分类">
                  <el-option label="全部分类" value="" />
                  <el-option v-for="item in factorCategories" :key="item" :label="item" :value="item" />
                </el-select>
              </div>
            </div>
            <div class="factor-grid">
              <article
                v-for="factor in availableFactors"
                :key="factor.code"
                class="factor-item"
                :class="{ 'is-dragging': draggedFactor?.code === factor.code }"
                @mousedown.prevent="dragFactor(factor)"
              >
                <el-icon><Tickets /></el-icon>
                <div>
                  <strong>{{ factor.name }}</strong>
                  <small>{{ factor.code }} | {{ factor.aggregation }} | {{ factor.domain }}</small>
                </div>
                <el-button text type="primary" @click="quickAdd(factor)">添加</el-button>
              </article>
            </div>
            <div class="factor-library__footer">
              <el-button :icon="Plus" @click="router.push('/factor')">前往因子管理</el-button>
              <el-tooltip content="当前后端尚未提供因子导入接口">
                <span
                  class="disabled-tooltip-trigger"
                  tabindex="0"
                  aria-label="导入因子不可用：当前后端尚未提供因子导入接口"
                >
                  <el-button :icon="Upload" disabled>导入因子</el-button>
                </span>
              </el-tooltip>
            </div>
            <div class="business-action-bar formula-actions">
              <div>
                <span>公式与试算操作</span>
                <small>{{ indicatorWorkflow.versionId ? `当前版本 ${indicatorWorkflow.versionId}` : '请先在基本信息页签创建指标版本' }}</small>
              </div>
              <el-button :disabled="!indicatorWorkflow.versionId" :loading="workflowLoading.formula" @click="saveIndicatorFormulaOnly">
                保存公式
              </el-button>
              <el-button :disabled="!indicatorWorkflow.formulaSaved" :loading="workflowLoading.compile" @click="compileIndicatorFormulaOnly">
                公式校验
              </el-button>
              <el-button type="primary" :disabled="!indicatorWorkflow.compiled" :loading="workflowLoading.trial" @click="trialIndicatorOnly">
                发起试算
              </el-button>
              <el-button :disabled="!indicatorWorkflow.batchId" :loading="workflowLoading.result" @click="loadIndicatorTrialResultOnly">
                查看结果
              </el-button>
            </div>
            <div v-if="indicatorWorkflow.displayValue" class="workflow-result">
              <span>试算结果</span>
              <strong>{{ indicatorWorkflow.displayValue }}</strong>
              <small>批次 {{ indicatorWorkflow.batchId }}</small>
            </div>
          </div>

          <div class="formula-preview">
            <div>
              <span>公式预览</span>
              <strong>指标值 = {{ formulaPreview }}</strong>
            </div>
            <div class="validation-state" :class="{ 'is-invalid': !formulaValid }">
              <el-icon><CircleCheckFilled v-if="formulaValid" /><CircleCloseFilled v-else /></el-icon>
              <span>{{ formulaValid ? '本地结构检查通过：分子和分母均非空；类型、单位和依赖仍须服务端校验' : '本地结构检查未通过：请补充分子和分母因子' }}</span>
            </div>
            <div class="formula-settings">
              <label>分母为零策略</label>
              <el-select v-model="zeroStrategy" aria-label="分母为零策略">
                <el-option label="返回 NULL" value="返回 NULL" />
                <el-option label="返回 0" value="返回 0" />
                <el-option label="标记异常" value="标记异常" />
              </el-select>
              <label>展示格式</label>
              <span>百分比</span><i /> <span>乘数：100</span><i /> <span>精度：2位</span>
            </div>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="3 规则与排除" name="exclusion">
        <section class="surface-card exclusion-card">
          <div class="section-title">
            <h2>默认排除条件（全局生效，可被场景级配置覆盖）</h2>
          </div>
          <div class="logic-row">
            <span>排除满足以下</span>
            <el-select v-model="exclusionLogic" aria-label="默认排除条件逻辑">
              <el-option label="任意" value="任意" />
              <el-option label="全部" value="全部" />
            </el-select>
            <span>条件的记录：</span>
          </div>
          <div class="condition-list">
            <div v-for="(condition, index) in conditions" :key="condition.id" class="condition-row">
              <span class="condition-index">条件{{ index + 1 }}</span>
              <el-select
                v-model="condition.field"
                :aria-label="`条件 ${index + 1} 字段`"
                @change="resetCondition(condition)"
              >
                <el-option label="出院方式" value="出院方式" />
                <el-option label="住院天数" value="住院天数" />
                <el-option label="手术级别" value="手术级别" />
                <el-option label="年龄" value="年龄" />
              </el-select>
              <el-select v-model="condition.operator" :aria-label="`条件 ${index + 1} 运算符`">
                <el-option v-for="item in operatorOptions(condition.field)" :key="item" :label="item" :value="item" />
              </el-select>
              <el-select
                v-if="condition.field === '出院方式'"
                v-model="condition.value"
                class="condition-value"
                :aria-label="`条件 ${index + 1} 值`"
              >
                <el-option label="放弃治疗自动出院" value="放弃治疗自动出院" />
                <el-option label="死亡" value="死亡" />
                <el-option label="转院" value="转院" />
              </el-select>
              <el-select
                v-else-if="condition.field === '手术级别'"
                v-model="condition.value"
                class="condition-value"
                :aria-label="`条件 ${index + 1} 值`"
              >
                <el-option label="一级" value="一级" />
                <el-option label="二级" value="二级" />
                <el-option label="三级" value="三级" />
                <el-option label="四级" value="四级" />
              </el-select>
              <el-input-number
                v-else
                v-model="condition.value"
                :min="0"
                :controls="false"
                class="condition-value"
                :aria-label="`条件 ${index + 1} 数值`"
              />
              <span class="condition-unit">{{ conditionUnit(condition.field) }}</span>
              <el-button
                type="danger"
                plain
                :icon="Delete"
                :disabled="conditions.length === 1"
                @click="removeCondition(condition.id)"
              >
                删除
              </el-button>
            </div>
          </div>
          <el-button type="primary" plain :icon="Plus" @click="addCondition">添加条件</el-button>
          <div class="readable-rule">
            <span>排除条件说明（业务可读文本）：</span>
            <strong>“{{ readableExclusion }}”</strong>
          </div>
          <div class="exclusion-tip">
            <el-icon><InfoFilled /></el-icon>
            各应用场景可在此基础上追加额外的排除条件，前往「场景关联」页签配置。
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="4 场景关联" name="scene">
        <section class="surface-card table-card">
          <div class="section-title">
            <h2>关联应用场景</h2>
            <el-tooltip content="当前后端尚未提供场景关联写入接口">
              <span
                class="disabled-tooltip-trigger"
                tabindex="0"
                aria-label="添加场景不可用：当前后端尚未提供场景关联写入接口"
              >
                <el-button type="primary" :icon="Plus" disabled>添加场景</el-button>
              </span>
            </el-tooltip>
          </div>
          <div class="table-scroll">
            <el-table :data="editorSceneRows">
              <el-table-column prop="name" label="场景名称" min-width="220" />
              <el-table-column prop="code" label="场景编码" width="120" />
              <el-table-column prop="exclusion" label="排除条件" width="140">
                <template #default="{ row }">
                  <span :class="{ 'highlight-warning': row.exclusion.includes('自定义') }">{{ row.exclusion }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="override" label="参数覆盖" width="140" />
              <el-table-column prop="report" label="上报要求" min-width="180" />
              <el-table-column label="操作" width="120">
                <template #default="{ row }">
                  <el-tooltip content="场景覆盖写入接口尚未接入">
                    <span
                      class="disabled-tooltip-trigger"
                      tabindex="0"
                      :aria-label="`配置 ${row.name} 场景覆盖不可用：场景覆盖写入接口尚未接入`"
                    >
                      <button type="button" class="action-link" disabled>配置覆盖</button>
                    </span>
                  </el-tooltip>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="5 政策依据" name="policy">
        <section class="surface-card table-card">
          <div class="section-title"><h2>政策依据</h2></div>
          <div class="table-scroll">
            <el-table :data="editorPolicyRows">
              <el-table-column prop="policy" label="政策文件" min-width="250" />
              <el-table-column prop="version" label="文件版本" width="110" />
              <el-table-column prop="code" label="原始编码" width="140" />
              <el-table-column prop="originalName" label="原始名称" min-width="220" />
              <el-table-column prop="chapter" label="章节" min-width="180" />
              <el-table-column prop="relation" label="关系类型" width="120">
                <template #default="{ row }">
                  <span class="status-pill" :class="row.relation === '参考' ? 'is-info' : ''">{{ row.relation }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="6 发布检查" name="publish">
        <section class="publish-layout">
          <article class="surface-card publish-gates">
            <div class="section-title">
              <div>
                <h2>发布门禁</h2>
                <p class="section-title__description">仅展示当前前端能够判断的状态，不替代后端最终校验</p>
              </div>
            </div>
            <ul>
              <li v-for="gate in publishGates" :key="gate.label" :class="`is-${gate.state}`">
                <span class="publish-gate__mark" aria-hidden="true" />
                <div>
                  <strong>{{ gate.label }}</strong>
                  <p>{{ gate.description }}</p>
                </div>
                <span>{{ gate.stateLabel }}</span>
              </li>
            </ul>
          </article>
          <StatePanel
            type="unavailable"
            title="发布能力尚未接入"
            description="当前实现没有可确认的指标发布接口。请先完成接口契约、乐观锁、试算 Hash 与质量门禁后再启用发布操作。"
          />
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Box,
  CircleCheckFilled,
  CircleCloseFilled,
  Close,
  Delete,
  InfoFilled,
  Plus,
  Right,
  Search,
  Tickets,
  Upload
} from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import {
  compileIndicatorFormula,
  createIndicator,
  createIndicatorVersion,
  fetchIndicatorTrialResults,
  saveIndicatorFormula,
  trialIndicatorVersion
} from '@/idmp/api/modules/indicators'
import { fetchAsyncTask, fetchCalcBatch } from '@/idmp/api/modules/calculation'
import { mortalityChainConfig } from '@/idmp/api/modules/mortality'
import {
  editorFactors,
  editorPolicyRows,
  editorSceneRows
} from '@/idmp/data/demo'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => !route.params.id || route.params.id === 'new')
const activeTab = ref('basic')
const formRef = ref()
const formulaFactorVersionId = ref(mortalityChainConfig.deathFactorVersionId)
const indicatorWorkflow = reactive({
  indicatorId: '',
  versionId: '',
  resourceVersion: 0,
  formulaSaved: false,
  compiled: false,
  taskId: '',
  batchId: '',
  displayValue: '',
  resultValue: ''
})
const workflowLoading = reactive({
  basic: false,
  version: false,
  formula: false,
  compile: false,
  trial: false,
  result: false
})

const workflowSteps = computed(() => [
  {
    key: 'identity',
    label: '基础与版本',
    description: indicatorWorkflow.versionId ? '稳定指标与草稿版本已创建' : '先创建稳定指标与首个草稿版本',
    state: indicatorWorkflow.versionId ? 'complete' : indicatorWorkflow.indicatorId ? 'current' : 'pending'
  },
  {
    key: 'formula',
    label: '公式编译',
    description: indicatorWorkflow.compiled ? '服务端编译状态为 VALID' : '保存 Formula AST 后执行服务端编译',
    state: indicatorWorkflow.compiled ? 'complete' : indicatorWorkflow.versionId ? 'current' : 'pending'
  },
  {
    key: 'rules',
    label: '规则与场景',
    description: '当前仅提供界面演示，写入接口未接入',
    state: 'blocked'
  },
  {
    key: 'trial',
    label: '试算与质量',
    description: indicatorWorkflow.displayValue
      ? `已读取批次 ${indicatorWorkflow.batchId} 的结果`
      : indicatorWorkflow.batchId
        ? `试算批次 ${indicatorWorkflow.batchId} 已提交`
        : '编译通过后发起异步试算',
    state: indicatorWorkflow.displayValue ? 'complete' : indicatorWorkflow.batchId ? 'current' : 'pending'
  },
  {
    key: 'publish',
    label: '发布门禁',
    description: '发布接口与完整门禁尚未接入',
    state: 'blocked'
  }
])

const publishGates = computed(() => [
  {
    label: '稳定指标与草稿版本',
    description: indicatorWorkflow.versionId ? `版本 ${indicatorWorkflow.versionId}` : '尚未创建可发布的草稿版本',
    state: indicatorWorkflow.versionId ? 'pass' : 'pending',
    stateLabel: indicatorWorkflow.versionId ? '已具备' : '待完成'
  },
  {
    label: 'Formula AST 服务端编译',
    description: indicatorWorkflow.compiled ? '服务端返回 VALID' : '尚未取得有效编译产物',
    state: indicatorWorkflow.compiled ? 'pass' : 'pending',
    stateLabel: indicatorWorkflow.compiled ? '已通过' : '待完成'
  },
  {
    label: '试算结果与配置一致性',
    description: indicatorWorkflow.displayValue
      ? '已读取试算结果，但当前接口未返回配置 Hash'
      : '尚未取得可核验的试算结果',
    state: indicatorWorkflow.displayValue ? 'warning' : 'pending',
    stateLabel: indicatorWorkflow.displayValue ? '需核验 Hash' : '待完成'
  },
  {
    label: '质量、政策、下钻与隐私',
    description: '当前后端尚未返回完整门禁结果',
    state: 'blocked',
    stateLabel: '接口缺失'
  }
])
const sourceOptions = ['HIS', '手术麻醉', 'EMR', 'LIS', 'PACS', '病案', '药事', '财务']
const policyOptions = ['绩效考核2024版', '2011年版指标', '医院评审2025版', 'NCIS 8.0']

const form = reactive({
  code: isNew.value ? '' : 'KH-02',
  name: isNew.value ? '' : '手术患者并发症发生率',
  shortName: isNew.value ? '' : '手术并发症率',
  categoryMain: '医疗质量',
  categorySub: '质量安全',
  attribute: '定量',
  unit: '百分比（%）',
  direction: '逐步降低 ↓',
  definition: isNew.value ? '' : '指统计周期内手术患者中发生并发症的比例，反映手术质量和患者安全管理水平。',
  significance: isNew.value ? '' : '用于识别手术质量风险，推动围手术期安全持续改进。',
  sources: ['HIS', '手术麻醉'],
  period: '年度',
  policies: ['绩效考核2024版', '2011年版指标']
})

const required = message => ({ required: true, message, trigger: ['blur', 'change'] })
const rules = {
  code: [required('请输入指标编码')],
  name: [required('请输入指标名称')],
  categoryMain: [required('请选择指标分类')],
  attribute: [required('请选择指标属性')],
  unit: [required('请选择计量单位')],
  direction: [required('请选择指标导向')],
  definition: [required('请输入指标定义')],
  sources: [required('请选择至少一个数据来源')],
  period: [required('请选择统计周期')],
  policies: [required('请选择至少一个政策文件来源')]
}

const formulaModes = [
  { name: '简单比率型', description: '简单比率型：分子 ÷ 分母 × 常数，适用于最基本的百分比指标' },
  { name: '加法合成型', description: '加法合成型：多个同量纲因子相加，适用于总量类指标' },
  { name: '复合比率型', description: '复合比率型：多个子比率按权重合成，适用于综合评价指标' },
  { name: '多因子计算型', description: '多因子计算型：通过多个因子和运算符构成自定义计算表达式' },
  { name: '统计量型', description: '统计量型：计算平均数、中位数、分位数等统计量' },
  { name: '比值型', description: '比值型：两个独立统计量直接相除，不自动转换为百分比' }
]
const formulaMode = ref('简单比率型')
const activeMode = computed(() => formulaModes.find(item => item.name === formulaMode.value))
const numeratorFactors = ref([editorFactors.find(item => item.code === 'F-002')])
const denominatorFactors = ref([editorFactors.find(item => item.code === 'F-001')])
const draggedFactor = ref()
const factorSearch = ref('')
const factorCategory = ref('')
const factorCategories = [...new Set(editorFactors.map(item => item.category))]
const zeroStrategy = ref('返回 NULL')

const selectedFactorCodes = computed(() => new Set([
  ...numeratorFactors.value.map(item => item.code),
  ...denominatorFactors.value.map(item => item.code)
]))

const availableFactors = computed(() => editorFactors.filter(item => {
  const matchesSearch = !factorSearch.value
    || item.name.includes(factorSearch.value)
    || item.code.toLowerCase().includes(factorSearch.value.toLowerCase())
  const matchesCategory = !factorCategory.value || item.category === factorCategory.value
  return !selectedFactorCodes.value.has(item.code) && matchesSearch && matchesCategory
}))

const formulaValid = computed(() => numeratorFactors.value.length > 0 && denominatorFactors.value.length > 0)
const formulaPreview = computed(() => {
  const numerator = numeratorFactors.value.map(item => item.name).join(' + ') || '请拖入分子因子'
  const denominator = denominatorFactors.value.map(item => item.name).join(' + ') || '请拖入分母因子'
  return `${numerator} ÷ ${denominator} × 100%`
})

const dragFactor = factor => {
  draggedFactor.value = factor
}

const dropFactor = target => {
  if (!draggedFactor.value) return
  const list = target === 'numerator' ? numeratorFactors : denominatorFactors
  const opposite = target === 'numerator' ? denominatorFactors : numeratorFactors
  opposite.value = opposite.value.filter(item => item.code !== draggedFactor.value.code)
  if (!list.value.some(item => item.code === draggedFactor.value.code)) list.value.push(draggedFactor.value)
  draggedFactor.value = undefined
}

const quickAdd = factor => {
  numeratorFactors.value.push(factor)
}

const removeFactor = (target, code) => {
  if (target === 'numerator') {
    numeratorFactors.value = numeratorFactors.value.filter(item => item.code !== code)
  } else {
    denominatorFactors.value = denominatorFactors.value.filter(item => item.code !== code)
  }
}

const editFactor = factor => ElMessage.info(`“${factor.name}”条件编辑为演示操作`)

let nextConditionId = 3
const exclusionLogic = ref('任意')
const conditions = reactive([
  { id: 1, field: '出院方式', operator: '等于', value: '放弃治疗自动出院' },
  { id: 2, field: '住院天数', operator: '小于等于', value: 1 }
])

const operatorOptions = field => (
  ['住院天数', '年龄'].includes(field)
    ? ['小于', '小于等于', '等于', '大于等于', '大于']
    : ['等于', '不等于', '属于', '不属于']
)

const conditionUnit = field => ({ 住院天数: '天', 年龄: '岁' }[field] || '')
const conditionText = condition => `${condition.field}${condition.operator}${condition.value}${conditionUnit(condition.field)}`
const readableExclusion = computed(() => conditions.map(conditionText).join(exclusionLogic.value === '任意' ? '，或' : '，且'))

const resetCondition = condition => {
  condition.operator = ['住院天数', '年龄'].includes(condition.field) ? '小于等于' : '等于'
  condition.value = condition.field === '出院方式' ? '放弃治疗自动出院' : condition.field === '手术级别' ? '一级' : 1
}

const addCondition = () => {
  conditions.push({ id: nextConditionId++, field: '年龄', operator: '大于等于', value: 65 })
}

const removeCondition = id => {
  if (conditions.length > 1) conditions.splice(conditions.findIndex(item => item.id === id), 1)
}

function resetIndicatorWorkflowAfterBasic(indicatorId) {
  Object.assign(indicatorWorkflow, {
    indicatorId,
    versionId: '',
    resourceVersion: 0,
    formulaSaved: false,
    compiled: false,
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: ''
  })
}

async function saveIndicatorBasicInfo() {
  try {
    await formRef.value?.validate()
  } catch {
    activeTab.value = 'basic'
    ElMessage.warning('请先完善指标基本信息')
    return
  }

  workflowLoading.basic = true
  try {
    const suffix = createBackendCodeSuffix()
    const indicatorCode = normalizeBusinessCode(form.code) || `FRONTEND_INDICATOR_${suffix}`
    const indicator = await createIndicator({
      code: `${indicatorCode}_${suffix}`,
      name: form.name || `前端指标 ${suffix}`,
      description: form.definition || '前端指标配置流程创建'
    })
    resetIndicatorWorkflowAfterBasic(indicator.id)
    ElMessage.success('指标基本信息已保存到后端')
  } catch (error) {
    ElMessage.error(error?.message || '指标基本信息保存失败')
  } finally {
    workflowLoading.basic = false
  }
}

async function createIndicatorDraftVersion() {
  if (!indicatorWorkflow.indicatorId) {
    ElMessage.warning('请先保存指标基本信息')
    return
  }

  workflowLoading.version = true
  try {
    const version = await createIndicatorVersion(indicatorWorkflow.indicatorId, {})
    Object.assign(indicatorWorkflow, {
      versionId: version.id,
      resourceVersion: version.version || 0,
      formulaSaved: false,
      compiled: false,
      taskId: '',
      batchId: '',
      displayValue: '',
      resultValue: ''
    })
    activeTab.value = 'formula'
    ElMessage.success('指标版本已创建，可以配置公式')
  } catch (error) {
    ElMessage.error(error?.message || '指标版本创建失败')
  } finally {
    workflowLoading.version = false
  }
}

async function saveIndicatorFormulaOnly() {
  if (!indicatorWorkflow.versionId) {
    ElMessage.warning('请先创建指标版本')
    return
  }

  workflowLoading.formula = true
  try {
    const savedFormula = await saveIndicatorFormula(
      indicatorWorkflow.versionId,
      createSingleFactorFormulaPayload(indicatorWorkflow.resourceVersion)
    )
    indicatorWorkflow.resourceVersion = savedFormula.version
    indicatorWorkflow.formulaSaved = true
    indicatorWorkflow.compiled = false
    indicatorWorkflow.displayValue = ''
    ElMessage.success('计算公式已保存')
  } catch (error) {
    ElMessage.error(error?.message || '计算公式保存失败')
  } finally {
    workflowLoading.formula = false
  }
}

async function compileIndicatorFormulaOnly() {
  if (!indicatorWorkflow.formulaSaved) {
    ElMessage.warning('请先保存计算公式')
    return
  }

  workflowLoading.compile = true
  try {
    const artifact = await compileIndicatorFormula(indicatorWorkflow.versionId, {
      resourceVersion: indicatorWorkflow.resourceVersion
    })
    indicatorWorkflow.compiled = artifact.status === 'VALID'
    if (indicatorWorkflow.compiled) {
      ElMessage.success('公式校验通过')
    } else {
      ElMessage.warning(`公式校验状态：${artifact.status || '未知'}`)
    }
  } catch (error) {
    indicatorWorkflow.compiled = false
    ElMessage.error(error?.message || '公式校验失败')
  } finally {
    workflowLoading.compile = false
  }
}

async function trialIndicatorOnly() {
  if (!indicatorWorkflow.compiled) {
    ElMessage.warning('请先完成公式校验')
    return
  }

  workflowLoading.trial = true
  try {
    const suffix = createBackendCodeSuffix()
    const trial = await trialIndicatorVersion(
      indicatorWorkflow.versionId,
      { periodStart: '2000-01-01T00:00:00', periodEnd: '2030-01-01T00:00:00' },
      `indicator-workflow-${suffix}`
    )
    indicatorWorkflow.taskId = trial.taskId
    indicatorWorkflow.batchId = trial.batchId
    const task = await pollBackendTask(trial.taskId)
    if (task.status === 'SUCCEEDED') {
      ElMessage.success('指标试算已完成，可以查看结果')
    } else {
      ElMessage.warning(`指标试算任务状态：${task.status || '未知'}`)
    }
  } catch (error) {
    ElMessage.error(error?.message || '指标试算失败')
  } finally {
    workflowLoading.trial = false
  }
}

async function loadIndicatorTrialResultOnly() {
  if (!indicatorWorkflow.batchId) {
    ElMessage.warning('请先发起指标试算')
    return
  }

  workflowLoading.result = true
  try {
    await fetchCalcBatch(indicatorWorkflow.batchId)
    const resultSet = await fetchIndicatorTrialResults(indicatorWorkflow.versionId, indicatorWorkflow.batchId)
    const record = resultSet.results?.records?.[0]
    indicatorWorkflow.displayValue = record?.displayValue || '-'
    indicatorWorkflow.resultValue = record?.resultValue ?? ''
    ElMessage.success('试算结果已读取')
  } catch (error) {
    ElMessage.error(error?.message || '试算结果读取失败')
  } finally {
    workflowLoading.result = false
  }
}

function createSingleFactorFormulaPayload(resourceVersion) {
  return {
    resourceVersion,
    formula: {
      schemaVersion: '1.0',
      astType: 'INDICATOR_FORMULA',
      root: {
        nodeId: 'factor_ref',
        nodeType: 'FACTOR_REF',
        factorVersionId: String(formulaFactorVersionId.value)
      },
      display: {
        format: 'NUMBER',
        multiplier: '1',
        scale: 0,
        roundingMode: 'HALF_UP'
      }
    }
  }
}

async function pollBackendTask(taskId) {
  let task = await fetchAsyncTask(taskId)
  const intervals = [1000, 2000, 3000, 5000, 10000]
  const terminalStatuses = ['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELED', 'CANCELLED']
  for (let index = 0; index < intervals.length && !terminalStatuses.includes(task.status); index += 1) {
    await delay(intervals[index])
    task = await fetchAsyncTask(taskId)
  }
  return task
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function normalizeBusinessCode(value) {
  return String(value || '').trim().replace(/[^\w]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
}

function createBackendCodeSuffix() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

</script>

<style scoped lang="scss">
.editor-tabs {
  :deep(.el-tabs__content) {
    overflow: visible;
  }
}

.disabled-tooltip-trigger {
  display: inline-flex;
}

.workflow-overview {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: 12px;
  padding: 14px 16px;
  gap: 0;
}

.workflow-step {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: flex-start;
  padding-right: 16px;
  gap: 9px;

  &::after {
    position: absolute;
    top: 11px;
    right: 6px;
    left: 30px;
    z-index: 0;
    height: 1px;
    background: var(--idmp-border-strong);
    content: "";
  }

  &:last-child::after {
    display: none;
  }
}

.workflow-step__index {
  position: relative;
  z-index: 1;
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: 1px solid var(--idmp-border-strong);
  border-radius: var(--idmp-radius-sm);
  background: var(--idmp-layer-01);
  color: var(--idmp-text-helper);
  place-items: center;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.workflow-step__copy {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  padding-right: 6px;
  background: var(--idmp-layer-01);
  gap: 2px;

  strong {
    color: var(--idmp-text-primary);
    font-size: 12px;
    line-height: 20px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 11px;
    line-height: 16px;
  }
}

.workflow-step.is-current .workflow-step__index {
  border-color: var(--idmp-interactive);
  background: var(--idmp-interactive-subtle);
  color: var(--idmp-interactive);
  font-weight: 650;
}

.workflow-step.is-complete .workflow-step__index {
  border-color: var(--idmp-support-success);
  background: var(--idmp-support-success-bg);
  color: var(--idmp-support-success);
}

.workflow-step.is-blocked .workflow-step__index {
  border-color: var(--idmp-support-warning);
  background: var(--idmp-support-warning-bg);
  color: var(--idmp-support-warning);
}

.editor-contract-note {
  margin-bottom: 16px;
}

.formula-contract-note {
  margin-bottom: 18px;
}

.publish-layout {
  display: grid;
  grid-template-columns: minmax(560px, 1.35fr) minmax(320px, 0.65fr);
  gap: 16px;
}

.publish-gates {
  padding: 18px;
}

.publish-gates ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.publish-gates li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 60px;
  padding: 8px 4px;
  gap: 12px;
  border-top: 1px solid var(--idmp-border-soft);

  strong {
    color: var(--idmp-text-primary);
    font-size: 13px;
  }

  p {
    margin: 2px 0 0;
    color: var(--idmp-text-helper);
    font-size: 11px;
  }

  > span:last-child {
    color: var(--idmp-text-secondary);
    font-size: 12px;
  }
}

.publish-gate__mark {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--idmp-border-strong);
}

.publish-gates li.is-pass .publish-gate__mark {
  background: var(--idmp-support-success);
}

.publish-gates li.is-warning .publish-gate__mark,
.publish-gates li.is-blocked .publish-gate__mark {
  background: var(--idmp-support-warning);
}

.action-link:disabled {
  color: var(--idmp-text-disabled);
  cursor: not-allowed;
  text-decoration: none;
}

.business-action-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--idmp-border-soft);

  > div {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin-right: auto;
    gap: 2px;
  }

  span {
    color: var(--idmp-text-primary);
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
    line-height: 18px;
  }
}

@media (max-width: 1280px) {
  .workflow-overview {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 0;
  }

  .publish-layout {
    grid-template-columns: 1fr;
  }
}

.formula-actions {
  margin: 0 16px 0;
  padding-bottom: 14px;
}

.workflow-result {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 0 16px 16px;
  padding: 10px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 6px;
  background: var(--idmp-interactive-subtle);

  span,
  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }

  strong {
    color: var(--idmp-interactive);
    font-size: 18px;
  }
}

.form-card {
  padding: 22px 28px 8px;
}

.form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.form-span-2 {
  grid-column: 1 / -1;
}

.category-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  width: 100%;
  gap: 6px;

  .el-icon {
    color: var(--idmp-text-disabled);
  }
}

.form-card :deep(.el-select) {
  width: 100%;
}

.form-card :deep(.el-form-item) {
  margin-bottom: 20px;
}

.formula-card {
  padding: 20px;

  > h2 {
    margin: 0 0 14px;
    color: var(--idmp-text-primary);
    font-size: 16px;
  }
}

.formula-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  .el-button {
    margin: 0;
  }
}

.mode-help {
  display: flex;
  align-items: center;
  min-height: 42px;
  margin: 14px 0 18px;
  padding: 9px 14px;
  border: 1px solid var(--idmp-support-info);
  border-radius: 6px;
  background: var(--idmp-support-info-bg);
  color: var(--idmp-support-info);
  gap: 8px;
}

.formula-section-title {
  padding-top: 2px;
}

.formula-builder {
  padding: 20px;
  border: 1px solid var(--idmp-border-soft);
  border-radius: 8px;
  background: var(--idmp-field);
}

.factor-slot {
  min-height: 92px;
  padding: 14px 16px;
  border: 2px solid var(--idmp-support-success);
  border-radius: 8px;
  background: var(--idmp-support-success-bg);
  transition: border-color 0.18s ease;

  &.is-empty {
    border-style: dashed;
    border-color: var(--idmp-interactive);
    background: var(--idmp-interactive-subtle);
  }
}

.slot-label {
  margin-bottom: 8px;
  color: var(--idmp-text-helper);
  font-size: 12px;

  span {
    margin-left: 12px;
    color: var(--idmp-text-disabled);
  }
}

.slot-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.selected-factor {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--idmp-support-info);
  border-radius: 4px;
  background: var(--idmp-support-info-bg);
  gap: 8px;

  span {
    color: var(--idmp-support-info);
  }

  small {
    color: var(--idmp-text-helper);
  }

  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--idmp-support-warning);
    cursor: pointer;
    font-size: 12px;
  }
}

.slot-placeholder {
  color: var(--idmp-text-disabled);
}

.formula-operator {
  padding: 8px 0;
  color: var(--idmp-text-helper);
  text-align: center;
  font-size: 20px;

  &.multiplier {
    padding-bottom: 0;
    text-align: left;
  }

  strong {
    color: var(--idmp-text-primary);
    font-size: 16px;
  }
}

.factor-library {
  margin-top: 16px;
  border: 1px solid var(--idmp-border-soft);
  border-radius: 8px;
  background: var(--idmp-layer-01);
}

.factor-library__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--idmp-border-soft);
  gap: 16px;

  h3 {
    display: flex;
    align-items: center;
    margin: 0;
    gap: 8px;
    font-size: 14px;
  }
}

.factor-tools {
  display: flex;
  gap: 8px;

  .el-input {
    width: 220px;
  }

  .el-select {
    width: 130px;
  }
}

.factor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-height: 250px;
  padding: 14px 16px;
  overflow-y: auto;
  gap: 10px;
}

.factor-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid var(--idmp-border-soft);
  border-radius: 6px;
  background: var(--idmp-field);
  cursor: grab;
  gap: 10px;

  &:active { cursor: grabbing; }
  &:hover { border-color: var(--idmp-interactive); }
  &.is-dragging {
    border-color: var(--idmp-interactive);
    background: var(--idmp-interactive-subtle);
  }

  > .el-icon {
    color: var(--idmp-interactive);
    font-size: 19px;
  }

  strong,
  small {
    display: block;
  }

  strong {
    margin-bottom: 4px;
    color: var(--idmp-text-secondary);
    font-size: 13px;
  }

  small {
    color: var(--idmp-text-disabled);
    font-size: 11px;
  }
}

.factor-library__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--idmp-border-soft);
}

.formula-preview {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--idmp-support-success);
  border-radius: 8px;
  background: var(--idmp-support-success-bg);

  > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 14px;

    span { color: var(--idmp-text-helper); }
    strong { color: var(--idmp-text-primary); }
  }
}

.validation-state {
  display: flex;
  align-items: center;
  margin: 12px 0;
  color: var(--idmp-support-success);
  gap: 7px;

  &.is-invalid { color: var(--idmp-support-danger); }
}

.formula-settings {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid var(--idmp-border-soft);
  color: var(--idmp-text-secondary);
  gap: 10px;

  label {
    color: var(--idmp-text-helper);
  }

  .el-select {
    width: 140px;
    margin-right: 16px;
  }

  i {
    width: 1px;
    height: 14px;
    background: var(--idmp-border-strong);
  }
}

.exclusion-card {
  padding: 22px;
}

.logic-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  color: var(--idmp-text-secondary);
  gap: 10px;

  .el-select {
    width: 92px;
  }
}

.condition-list {
  display: grid;
  margin-bottom: 14px;
  gap: 10px;
}

.condition-row {
  display: grid;
  grid-template-columns: 70px 180px 140px minmax(200px, 1fr) 36px 96px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--idmp-border-soft);
  border-radius: 6px;
  background: var(--idmp-field);
  gap: 10px;
}

.condition-index {
  color: var(--idmp-text-secondary);
  font-weight: 600;
}

.condition-value {
  width: 100%;
}

.condition-unit {
  color: var(--idmp-text-helper);
}

.readable-rule {
  margin-top: 18px;
  padding: 14px 16px;
  border-left: 3px solid var(--idmp-interactive);
  border-radius: 3px;
  background: var(--idmp-interactive-subtle);

  span {
    display: block;
    margin-bottom: 7px;
    color: var(--idmp-text-helper);
  }

  strong {
    color: var(--idmp-text-secondary);
    font-weight: 500;
  }
}

.exclusion-tip {
  display: flex;
  align-items: center;
  margin-top: 14px;
  color: var(--idmp-text-helper);
  gap: 7px;

  .el-icon {
    color: var(--idmp-interactive);
  }
}

.highlight-warning {
  color: var(--idmp-support-warning);
}

@media (max-width: 1400px) {
  .form-card {
    padding-right: 20px;
    padding-left: 20px;
  }

  .backend-chain-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .condition-row {
    grid-template-columns: 62px 150px 120px minmax(170px, 1fr) 26px 90px;
  }
}
</style>
