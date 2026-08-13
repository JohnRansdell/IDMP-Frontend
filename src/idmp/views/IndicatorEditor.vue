<template>
  <div class="idmp-page editor-page">
    <PageHeader
      :title="editorTitle"
      :status="editorStatus"
    >
      <template #meta>
        <span>{{ isNew ? '新建模式' : '编辑模式' }}</span>
        <span class="mono-data">指标编码：{{ form.code || routeIndicatorKey || '未填写' }}</span>
        <span class="mono-data">版本 ID：{{ indicatorWorkflow.versionId || '尚未创建' }}</span>
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
        指标详情、版本、公式回显、试算和发布接口已接入；规则/场景持久化仍为界面演示。
        下方未接入能力会明确标注，不会显示假成功。
      </span>
    </div>

    <div v-if="!isNew && (editLoadState.loading || editLoadState.message)" class="notice-strip editor-contract-note" :class="editLoadState.detailReady ? 'is-success' : 'is-warning'">
      <el-icon><InfoFilled /></el-icon>
      <span>{{ editLoadState.loading ? '正在读取指标详情、版本与公式定义...' : editLoadState.message }}</span>
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
              <el-form-item label="指标分类" prop="categoryPath">
                <el-cascader
                  v-model="form.categoryPath"
                  class="category-cascader"
                  :options="indicatorCategoryOptions"
                  :props="indicatorCategoryProps"
                  clearable
                  filterable
                  placeholder="请选择指标分类"
                  aria-label="指标分类"
                  @change="syncCategorySelection"
                  @clear="syncCategorySelection([])"
                />
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
              <div class="drill-config-card form-span-2">
                <div class="drill-config-card__heading">
                  <strong>指标结果下钻路径</strong>
                  <el-tag size="small" type="warning">当前为默认路径配置</el-tag>
                </div>
                <p>首次保存公式时会把公式和下钻路径一起创建为指标版本。总体粒度因子请选择时间路径；组织路径要求分子、分母都输出对应组织粒度。</p>
                <div class="drill-config-card__fields">
                  <el-form-item label="路径编码" label-width="88px" prop="drillPathCode">
                    <el-select v-model="drillConfig.pathCode" aria-label="指标下钻路径" @change="handleDrillPathChange">
                      <el-option label="组织下钻（ORGANIZATION）" value="ORGANIZATION" />
                      <el-option label="时间下钻（TIME）" value="TIME" />
                      <el-option
                        v-if="drillConfig.pathCode && !['ORGANIZATION', 'TIME'].includes(drillConfig.pathCode)"
                        :label="`${drillConfig.pathCode}（环境默认）`"
                        :value="drillConfig.pathCode"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="最大层级" label-width="88px" prop="drillMaxLevel">
                    <el-select v-model="drillConfig.maxLevel" aria-label="下钻最大层级">
                      <template v-if="drillConfig.pathCode === 'TIME'">
                        <el-option label="年度（YEAR）" value="YEAR" />
                        <el-option label="季度（QUARTER）" value="QUARTER" />
                        <el-option label="月度（MONTH）" value="MONTH" />
                      </template>
                      <template v-else>
                        <el-option label="医院（HOSPITAL）" value="HOSPITAL" />
                        <el-option label="出院科室（OUT_DEPT）" value="OUT_DEPT" />
                      </template>
                    </el-select>
                  </el-form-item>
                </div>
                <small class="drill-config-card__hint">路径选择接口接入后将替换为服务端已发布路径，当前配置会随版本创建请求发送。</small>
              </div>
            </div>
          </el-form>
          <div class="business-action-bar">
            <div>
              <span>基本信息操作</span>
              <small>
                {{
                  isNew
                    ? (indicatorWorkflow.indicatorId ? `已保存指标 ${indicatorWorkflow.indicatorId}` : '先保存基本信息，再选择公式并创建版本')
                    : (indicatorWorkflow.indicatorId ? `正在编辑指标 ${indicatorWorkflow.indicatorId}，可创建新的草稿版本` : '等待指标目录摘要或详情接口回填')
                }}
              </small>
            </div>
            <el-button :loading="workflowLoading.basic" @click="saveIndicatorBasicInfo">保存基本信息</el-button>
            <el-button v-if="indicatorWorkflow.versionId" :loading="workflowLoading.version" @click="createIndicatorDraftVersion">
              创建指标版本
            </el-button>
            <el-button
              type="primary"
              :loading="workflowLoading.basic || workflowLoading.version"
              @click="saveBasicAndCreateVersion"
            >
              {{ isNew ? '保存并进入公式配置' : '为当前指标创建草稿版本' }}
            </el-button>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="2 公式与试算" name="formula">
        <section class="surface-card formula-card">
          <div class="notice-strip is-warning formula-contract-note">
            <el-icon><InfoFilled /></el-icon>
            <span>
              可视分子/分母会优先从后端版本公式回显；当前保存仍采用简单比率型 AST，规则/场景配置暂不随公式一起持久化。
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
            <div class="factor-grid" v-loading="workflowLoading.factors">
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
                <small>{{ indicatorWorkflow.versionId ? `当前版本 ${indicatorWorkflow.versionId}` : (indicatorWorkflow.indicatorId ? '选择分子、分母后首次保存将创建指标版本' : '请先保存指标基本信息') }}</small>
              </div>
              <el-button :disabled="!indicatorWorkflow.indicatorId || indicatorWorkflow.published" :loading="workflowLoading.formula || workflowLoading.version" @click="saveIndicatorFormulaOnly">
                {{ indicatorWorkflow.versionId ? '保存公式' : '创建版本并保存公式' }}
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
              <el-button
                type="success"
                :disabled="!indicatorWorkflow.versionId || indicatorWorkflow.published"
                :loading="workflowLoading.publish"
                @click="publishIndicatorVersionOnly"
              >
                发布指标版本
              </el-button>
            </div>
            <div v-if="indicatorWorkflow.displayValue" class="workflow-result">
              <span>试算结果</span>
              <strong>{{ indicatorWorkflow.displayValue }}</strong>
              <small>批次 {{ indicatorWorkflow.batchId }}</small>
            </div>
            <div v-if="workflowDebug.step" class="workflow-debug">
              <div>
                <span>最近一次后端请求</span>
                <strong>{{ workflowDebug.step }}</strong>
              </div>
              <dl>
                <template v-if="workflowDebug.endpoint">
                  <dt>接口</dt>
                  <dd>{{ workflowDebug.endpoint }}</dd>
                </template>
                <template v-if="workflowDebug.apiBaseUrl">
                  <dt>API Base</dt>
                  <dd class="mono-data">{{ workflowDebug.apiBaseUrl }}</dd>
                </template>
                <template v-if="workflowDebug.fullUrl">
                  <dt>完整 URL</dt>
                  <dd class="mono-data">{{ workflowDebug.fullUrl }}</dd>
                </template>
                <template v-if="workflowDebug.indicatorId">
                  <dt>指标 ID</dt>
                  <dd class="mono-data">{{ workflowDebug.indicatorId }}</dd>
                </template>
                <template v-if="workflowDebug.versionId">
                  <dt>指标版本 ID</dt>
                  <dd class="mono-data">{{ workflowDebug.versionId }}</dd>
                </template>
                <template v-if="workflowDebug.resourceVersion !== ''">
                  <dt>资源版本</dt>
                  <dd class="mono-data">{{ workflowDebug.resourceVersion }}</dd>
                </template>
                <dt>分子因子</dt>
                <dd class="mono-data">{{ deathFactorVersionId }}</dd>
                <dt>分母因子</dt>
                <dd class="mono-data">{{ dischargeFactorVersionId }}</dd>
                <dt>构建版本</dt>
                <dd class="mono-data">{{ buildInfo.commit }} / {{ buildInfo.time }}</dd>
                <template v-if="workflowDebug.idempotencyKey">
                  <dt>幂等键</dt>
                  <dd class="mono-data">{{ workflowDebug.idempotencyKey }}</dd>
                </template>
                <template v-if="workflowDebug.traceId">
                  <dt>traceId</dt>
                  <dd class="mono-data">{{ workflowDebug.traceId }}</dd>
                </template>
                <template v-if="workflowDebug.message">
                  <dt>状态</dt>
                  <dd>{{ workflowDebug.message }}</dd>
                </template>
              </dl>
              <pre v-if="workflowDebug.requestBody">{{ workflowDebug.requestBody }}</pre>
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
          <article class="surface-card publish-action-card">
            <div class="section-title">
              <div>
                <h2>发布指标版本</h2>
                <p class="section-title__description">调用当前后端接口发布已编译并试算通过的指标版本。</p>
              </div>
            </div>
            <StatePanel
              :type="indicatorWorkflow.published ? 'empty' : 'permission'"
              :title="indicatorWorkflow.published ? '指标版本已发布' : '等待发布条件'"
              :description="publishPanelDescription"
            />
            <div class="business-action-bar publish-actions">
              <div>
                <span>后端写入接口</span>
                <small class="mono-data">POST /api/v1/indicator-versions/{{ indicatorWorkflow.versionId || '{id}' }}/publish</small>
              </div>
              <el-button
                type="primary"
                :disabled="!indicatorWorkflow.versionId || indicatorWorkflow.published"
                :loading="workflowLoading.publish"
                @click="publishIndicatorVersionOnly"
              >
                发布指标版本
              </el-button>
            </div>
          </article>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
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
  Search,
  Tickets,
  Upload
} from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { API_BASE_URL } from '@/idmp/api/request'
import {
  compileIndicatorFormula,
  createIndicator,
  createIndicatorVersion,
  fetchIndicator,
  fetchIndicatorFormula,
  fetchIndicators,
  fetchIndicatorVersion,
  fetchIndicatorVersions,
  fetchIndicatorTrialResults,
  publishIndicatorVersion,
  saveIndicatorFormula,
  trialIndicatorVersion,
  updateIndicator
} from '@/idmp/api/modules/indicators'
import { buildIndicatorVersionPayload, defaultDrillConfig, findUnsupportedDrillFactors, normalizeDrillConfig } from '@/idmp/api/adapters/indicator'
import { fetchFactorVersions } from '@/idmp/api/modules/factors'
import { fetchAsyncTask, fetchCalcBatch } from '@/idmp/api/modules/calculation'
import {
  createMortalityFormulaPayload,
  createMortalityTrialPayload
} from '@/idmp/api/modules/mortality'
import {
  editorPolicyRows,
  editorSceneRows
} from '@/idmp/data/demo'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => !route.params.id || route.params.id === 'new')
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const activeTab = ref('basic')
const formRef = ref()
const backendEditorFactors = ref([])
const deathFactorVersionId = ref('')
const dischargeFactorVersionId = ref('')
const buildInfo = {
  commit: typeof __APP_GIT_COMMIT__ === 'undefined' ? 'dev' : __APP_GIT_COMMIT__,
  time: typeof __APP_BUILD_TIME__ === 'undefined' ? 'dev' : __APP_BUILD_TIME__
}
const indicatorWorkflow = reactive({
  indicatorId: '',
  versionId: '',
  resourceVersion: 0,
  metadataVersionId: '',
  metadataResourceVersion: 0,
  formulaSaved: false,
  compiled: false,
  taskId: '',
  batchId: '',
  displayValue: '',
  resultValue: '',
  published: false,
  publishedVersionId: '',
  publishIdempotencyKey: ''
})
const drillConfig = reactive(isNew.value
  ? { ...defaultDrillConfig, pathCode: 'TIME', maxLevel: 'MONTH', pathVersionId: '' }
  : { ...defaultDrillConfig })
const workflowDebug = reactive({
  step: '',
  endpoint: '',
  apiBaseUrl: '',
  fullUrl: '',
  indicatorId: '',
  versionId: '',
  resourceVersion: '',
  idempotencyKey: '',
  traceId: '',
  message: '',
  requestBody: ''
})
const workflowLoading = reactive({
  basic: false,
  version: false,
  formula: false,
  compile: false,
  trial: false,
  result: false,
  publish: false,
  factors: false
})
const editLoadState = reactive({
  loading: false,
  loadedFromList: false,
  detailReady: false,
  message: ''
})

const selectedFormulaFactors = computed(() => [
  ...numeratorFactors.value,
  ...denominatorFactors.value
])
const missingPeriodFactors = computed(() =>
  selectedFormulaFactors.value.filter((factor) => factor?.dsl && !hasPeriodPredicate(factor.dsl))
)
const canPublishIndicatorVersion = computed(() =>
  Boolean(
    indicatorWorkflow.versionId &&
    !indicatorWorkflow.published &&
    !missingPeriodFactors.value.length
  )
)

const publishPanelDescription = computed(() => {
  if (indicatorWorkflow.published) {
    return `后端已返回发布结果，版本 ${indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId} 可用于分析查询。`
  }
  if (!indicatorWorkflow.versionId) return '请先创建指标版本。'
  if (missingPeriodFactors.value.length) {
    return `依赖因子缺少 period BETWEEN 时间过滤：${missingPeriodFactors.value.map((item) => item.versionId || item.code).join('、')}。请重新创建并发布带统计周期过滤的因子，再回到公式中选择新因子版本。`
  }
  if (!indicatorWorkflow.compiled) return '发布按钮已开放；若公式尚未编译通过，后端发布接口会返回具体原因。'
  if (!indicatorWorkflow.displayValue) return '发布按钮已开放；建议先试算并查看结果，最终是否允许发布以后端校验为准。'
  return '发布接口已就绪，点击按钮会写入后端发布状态。'
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
    description: '当前仅提供界面演示，不影响公式试算和版本发布',
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
    description: indicatorWorkflow.published ? '指标版本已发布' : '调用服务端发布接口',
    state: indicatorWorkflow.published ? 'complete' : canPublishIndicatorVersion.value ? 'current' : 'pending'
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
    description: indicatorWorkflow.published ? '发布接口已由后端完成最终校验' : '发布时由后端执行最终门禁校验',
    state: indicatorWorkflow.published ? 'pass' : canPublishIndicatorVersion.value ? 'warning' : 'pending',
    stateLabel: indicatorWorkflow.published ? '已发布' : canPublishIndicatorVersion.value ? '后端校验' : '待发布'
  }
])
const sourceOptions = ['HIS', '手术麻醉', 'EMR', 'LIS', 'PACS', '病案', '药事', '财务']
const policyOptions = ['绩效考核2024版', '2011年版指标', '医院评审2025版', 'NCIS 8.0']
const defaultCategoryPath = ['医疗质量', '质量安全']
const indicatorCategoryOptions = [
  {
    value: '医疗质量',
    label: '医疗质量',
    children: [
      {
        value: '质量安全',
        label: '质量安全',
        children: [
          { value: '手术安全', label: '手术安全' },
          { value: '围术期安全', label: '围术期安全' },
          { value: '患者安全', label: '患者安全' }
        ]
      },
      {
        value: '功能定位',
        label: '功能定位',
        children: [
          { value: '门诊服务', label: '门诊服务' },
          { value: '住院服务', label: '住院服务' },
          { value: '日间医疗', label: '日间医疗' }
        ]
      },
      {
        value: '合理用药',
        label: '合理用药',
        children: [
          { value: '抗菌药物', label: '抗菌药物' },
          { value: '药品结构', label: '药品结构' }
        ]
      }
    ]
  },
  {
    value: '运营效率',
    label: '运营效率',
    children: [
      { value: '服务流程', label: '服务流程' },
      { value: '收支结构', label: '收支结构' },
      { value: '经济管理', label: '经济管理' }
    ]
  },
  {
    value: '专项指标',
    label: '专项指标',
    children: [
      { value: '住院死亡类', label: '住院死亡类' },
      { value: '评审指标', label: '评审指标' }
    ]
  }
]
const indicatorCategoryProps = {
  checkStrictly: true,
  emitPath: true
}

const form = reactive({
  code: isNew.value ? 'INPATIENT_MORTALITY_RATE' : routeIndicatorKey.value,
  name: isNew.value ? '住院死亡率' : '',
  shortName: isNew.value ? '住院死亡率' : '',
  categoryPath: [...defaultCategoryPath],
  categoryMain: defaultCategoryPath[0],
  categorySub: defaultCategoryPath[1],
  attribute: '定量',
  unit: '百分比（%）',
  direction: '逐步降低 ↓',
  definition: isNew.value ? '统计周期内死亡患者记录数除以出院病案记录数，用于反映住院诊疗安全结果。' : '',
  significance: isNew.value ? '用于监测医疗质量安全结果，辅助医院质量改进和趋势分析。' : '',
  sources: isNew.value ? ['HIS', '病案'] : [],
  period: '年度',
  policies: isNew.value ? ['绩效考核2024版', '2011年版指标'] : []
})

const editorTitle = computed(() => {
  if (isNew.value) return `新建指标：${form.name || '未命名指标'}`
  return `编辑指标：${form.name || routeIndicatorKey.value || '待加载'}`
})

const editorStatus = computed(() => {
  if (indicatorWorkflow.displayValue) return 'TRIAL_READY'
  if (indicatorWorkflow.batchId) return 'TRIAL_SUBMITTED'
  if (indicatorWorkflow.compiled) return 'COMPILED'
  if (indicatorWorkflow.formulaSaved) return 'FORMULA_SAVED'
  if (indicatorWorkflow.versionId) return 'VERSION_DRAFT'
  if (indicatorWorkflow.indicatorId) return 'INDICATOR_READY'
  return isNew.value ? 'NEW' : 'DETAIL_PENDING'
})

const required = message => ({ required: true, message, trigger: ['blur', 'change'] })
const rules = {
  code: [required('请输入指标编码')],
  name: [required('请输入指标名称')],
  categoryPath: [required('请选择指标分类')],
  attribute: [required('请选择指标属性')],
  unit: [required('请选择计量单位')],
  direction: [required('请选择指标导向')],
  definition: [required('请输入指标定义')],
  sources: [required('请选择至少一个数据来源')],
  period: [required('请选择统计周期')],
  policies: [required('请选择至少一个政策文件来源')]
}

function findCategoryPath(target, options, trail = []) {
  const needle = String(target || '').trim()
  if (!needle) return []

  for (const option of options) {
    const nextTrail = [...trail, option.value]
    if (option.value === needle || option.label === needle) return nextTrail
    if (Array.isArray(option.children) && option.children.length) {
      const matched = findCategoryPath(needle, option.children, nextTrail)
      if (matched.length) return matched
    }
  }

  return []
}

function normalizeCategoryPath(source) {
  if (Array.isArray(source)) {
    return source.map(segment => String(segment || '').trim()).filter(Boolean)
  }

  if (!source || typeof source !== 'object') return []

  const explicitPath = Array.isArray(source.categoryPath) ? source.categoryPath : []
  if (explicitPath.length) {
    return explicitPath.map(segment => String(segment || '').trim()).filter(Boolean)
  }

  const categoryText = String(source.category || '').trim()
  if (categoryText.includes('/')) {
    const parsedPath = categoryText.split('/').map(segment => segment.trim()).filter(Boolean)
    if (parsedPath.length) return parsedPath
  }

  const categoryMain = String(source.categoryMain || categoryText).trim()
  const categorySub = String(source.categorySub || '').trim()
  if (!categoryMain && !categorySub) return []

  if (categorySub) {
    const subPath = findCategoryPath(categorySub, indicatorCategoryOptions)
    if (subPath.length && (!categoryMain || subPath[0] === categoryMain || subPath.includes(categoryMain))) {
      return subPath
    }
  }

  if (!categoryMain) return [categorySub]

  const matchedPath = findCategoryPath(categoryMain, indicatorCategoryOptions)
  const path = matchedPath.length ? matchedPath : [categoryMain]
  if (categorySub && path[path.length - 1] !== categorySub) {
    path.push(categorySub)
  }
  return path
}

function resolveCategoryPath(source, fallback = defaultCategoryPath) {
  const path = normalizeCategoryPath(source)
  return path.length ? path : [...fallback]
}

function syncCategorySelection(path = form.categoryPath) {
  const normalized = normalizeCategoryPath(path)
  form.categoryPath = normalized
  form.categoryMain = normalized[0] || ''
  form.categorySub = normalized[1] || ''
  return normalized
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
const numeratorFactors = ref([])
const denominatorFactors = ref([])
const draggedFactor = ref()
const factorSearch = ref('')
const factorCategory = ref('')
const factorLibraryRows = computed(() => backendEditorFactors.value)
const factorCategories = computed(() => [...new Set(factorLibraryRows.value.map(item => item.category).filter(Boolean))])
const zeroStrategy = ref('返回 NULL')

const selectedFactorCodes = computed(() => new Set([
  ...numeratorFactors.value.map(item => item.code),
  ...denominatorFactors.value.map(item => item.code)
]))

const availableFactors = computed(() => factorLibraryRows.value.filter(item => {
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

async function loadPublishedFactorVersions() {
  workflowLoading.factors = true
  try {
    const payload = await fetchFactorVersions({ publicationStatus: 'PUBLISHED', page: 1, size: 100 })
    backendEditorFactors.value = normalizeList(payload).map(toEditorFactor).filter(item => item.code && item.versionId)
    refreshSelectedFactorReferences()
  } catch (error) {
    backendEditorFactors.value = []
    ElMessage.warning(error?.message || '已发布因子版本接口暂不可用，无法配置真实指标公式')
  } finally {
    workflowLoading.factors = false
  }
}

function toEditorFactor(item) {
  const aggregation = item.dsl?.aggregation?.function || item.aggregation || item.output?.dimension || '-'
  const domain = item.dsl?.primaryDomain?.domainCode || item.domainCode || item.domain || '-'
  return {
    code: item.factorCode || item.code || `FV-${item.id}`,
    name: item.factorName || item.name || item.factorCode || item.code || `因子版本 ${item.id}`,
    aggregation,
    category: item.category || item.status || '已发布版本',
    domain,
    versionId: toOpaqueId(item.id ?? item.versionId),
    factorId: toOpaqueId(item.factorId),
    status: item.status,
    currentArtifactId: item.currentArtifactId,
    dsl: item.dsl || item.factorDsl || item.definition?.dsl || null
  }
}

function refreshSelectedFactorReferences() {
  if (!backendEditorFactors.value.length) return
  applySelectedFactorReferences()
}

function applySelectedFactorReferences() {
  const numerator = findFactorByVersionId(deathFactorVersionId.value)
  const denominator = findFactorByVersionId(dischargeFactorVersionId.value)
  if (numerator) {
    numeratorFactors.value = [numerator]
  } else if (deathFactorVersionId.value) {
    numeratorFactors.value = [createFormulaFactorPlaceholder('分子因子', deathFactorVersionId.value)]
  }
  if (denominator) {
    denominatorFactors.value = [denominator]
  } else if (dischargeFactorVersionId.value) {
    denominatorFactors.value = [createFormulaFactorPlaceholder('分母因子', dischargeFactorVersionId.value)]
  }
}

function findFactorByVersionId(versionId) {
  return backendEditorFactors.value.find(item => toOpaqueId(item.versionId) === toOpaqueId(versionId))
}

function createFormulaFactorPlaceholder(label, versionId) {
  return {
    code: `FV-${versionId}`,
    name: `${label}（版本 ${versionId}）`,
    aggregation: '-',
    category: '公式回显',
    domain: '-',
    versionId: toOpaqueId(versionId),
    dsl: null
  }
}

function hasPeriodPredicate(node) {
  if (!node || typeof node !== 'object') return false
  if (
    node.nodeType === 'PREDICATE' &&
    node.operator === 'BETWEEN' &&
    node.parameter === 'period' &&
    node.fieldCode
  ) {
    return true
  }
  if (Array.isArray(node.children) && node.children.some(hasPeriodPredicate)) return true
  return hasPeriodPredicate(node.filters)
}

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

function hydrateIndicatorSummary(item) {
  form.code = item.code || routeIndicatorKey.value
  form.name = item.name || ''
  form.shortName = item.shortName || item.name || ''
  syncCategorySelection(resolveCategoryPath(item))
  form.attribute = item.attribute || form.attribute || '定量'
  form.unit = item.unit || form.unit || '百分比（%）'
  form.direction = item.direction || form.direction || '监测比较'
  form.definition = item.description || item.definition || ''
  form.significance = item.significance || item.meaning || ''
  form.sources = item.sources || item.dataSources || (item.source ? [item.source] : [])
  form.period = fromApiStatisticalPeriod(item.period || item.statisticalPeriod) || form.period || '年度'
  form.policies = item.policies || []
  Object.assign(indicatorWorkflow, {
    indicatorId: toOpaqueId(item.id ?? item.indicatorId ?? routeIndicatorKey.value),
    versionId: toOpaqueId(item.currentVersionId ?? item.latestVersionId ?? item.versionId ?? indicatorWorkflow.versionId),
    resourceVersion: resolveResourceVersion(item),
    metadataVersionId: toOpaqueId(item.metadataVersionId ?? item.currentVersionId ?? item.latestVersionId ?? item.versionId ?? ''),
    metadataResourceVersion: resolveMetadataResourceVersion(item),
    formulaSaved: Boolean(item.formula || item.currentArtifactId),
    compiled: Boolean(item.currentArtifactId),
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: false,
     publishedVersionId: '',
     publishIdempotencyKey: ''
  })
}

function hydrateIndicatorVersion(version) {
  if (!version) return
  const status = version.status || version.publicationStatus || ''

  Object.assign(indicatorWorkflow, {
    versionId: resolveIndicatorVersionId(version),
    resourceVersion: resolveResourceVersion(version, indicatorWorkflow.resourceVersion),
    formulaSaved: Boolean(version.formula || version.currentArtifactId),
    compiled: Boolean(version.currentArtifactId),
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: status === 'PUBLISHED',
    publishedVersionId: status === 'PUBLISHED' ? resolveIndicatorVersionId(version) : ''
  })

  Object.assign(drillConfig, normalizeDrillConfig(version, drillConfig))

  const formula = extractFormula(version)
  hydrateFormulaFactors(formula)
}

function extractFormula(payload) {
  return payload?.formula?.formula || payload?.formula || payload?.formulaAst || payload?.definition?.formula || null
}

function hydrateFormulaFactors(formula) {
  const refs = collectFactorRefs(formula?.root || formula)
  if (refs[0]) deathFactorVersionId.value = toOpaqueId(refs[0])
  if (refs[1]) dischargeFactorVersionId.value = toOpaqueId(refs[1])
  applySelectedFactorReferences()
}

function collectFactorRefs(node, refs = []) {
  if (!node || typeof node !== 'object') return refs
  if (Array.isArray(node.factorRefs)) {
    node.factorRefs.forEach(item => {
      const id = item.factorVersionId ?? item.versionId ?? item.id
      if (id) refs.push(id)
    })
  }
  if (node.nodeType === 'FACTOR_REF') {
    const factorVersionId = node.factorVersionId ?? node.versionId ?? node.refVersionId
    if (factorVersionId) refs.push(factorVersionId)
  }
  collectFactorRefs(node.left, refs)
  collectFactorRefs(node.right, refs)
  if (Array.isArray(node.children)) {
    node.children.forEach(child => collectFactorRefs(child, refs))
  }
  return refs
}

async function loadIndicatorForEdit() {
  if (isNew.value) return

  editLoadState.loading = true
  editLoadState.message = ''
  try {
    const target = await fetchEditableIndicator()
    if (target) {
      hydrateIndicatorSummary(target)
      await loadEditableIndicatorVersion(indicatorWorkflow.indicatorId)
      editLoadState.loadedFromList = true
      editLoadState.detailReady = Boolean(indicatorWorkflow.versionId)
      editLoadState.message = indicatorWorkflow.versionId
        ? '已从指标详情与版本接口回填当前指标配置。'
        : '已从指标详情接口回填基础信息，当前指标尚未返回版本定义。'
    } else {
      editLoadState.loadedFromList = false
      editLoadState.detailReady = false
      editLoadState.message = `未在指标目录接口中找到 ${routeIndicatorKey.value}，页面不会填充演示数据。`
    }
  } catch (error) {
    editLoadState.loadedFromList = false
    editLoadState.detailReady = false
    editLoadState.message = error?.message || '指标详情接口尚未接入，且目录接口读取失败。'
  } finally {
    editLoadState.loading = false
  }
}

async function fetchEditableIndicator() {
  const key = routeIndicatorKey.value
  if (/^\d+$/.test(key)) {
    return fetchIndicator(key)
  }

  const rows = await fetchIndicators()
  const summary = normalizeList(rows)
    .find(item => [item.id, item.indicatorId, item.code].map(toOpaqueId).includes(key))

  const indicatorId = summary?.id ?? summary?.indicatorId
  return indicatorId ? fetchIndicator(indicatorId) : summary
}

async function loadEditableIndicatorVersion(indicatorId) {
  if (!indicatorId) return

  const versions = normalizeList(await fetchIndicatorVersions(indicatorId))
  const latest = pickLatestVersion(versions)
  const latestVersionId = resolveIndicatorVersionId(latest) || toOpaqueId(latest?.id)
  if (!latestVersionId) return

  const detail = await fetchIndicatorVersion(latestVersionId)
  let formula = extractFormula(detail)
  if (!formula) {
    try {
      formula = await fetchIndicatorFormula(latestVersionId)
    } catch {
      formula = null
    }
  }
  hydrateIndicatorVersion({
    ...detail,
    formula: formula || detail.formula || detail.formulaAst
  })
}

function resetIndicatorWorkflowAfterBasic(indicatorId, versionId = '', resourceVersion = 0) {
  Object.assign(indicatorWorkflow, {
    indicatorId: toOpaqueId(indicatorId),
    versionId: toOpaqueId(versionId),
    resourceVersion,
    metadataVersionId: toOpaqueId(versionId),
    metadataResourceVersion: 0,
    formulaSaved: false,
    compiled: false,
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: false,
    publishedVersionId: '',
    publishIdempotencyKey: ''
  })
}

async function saveIndicatorBasicInfo() {
  try {
    await formRef.value?.validate()
  } catch {
    activeTab.value = 'basic'
    ElMessage.warning('请先完善指标基本信息')
    return false
  }

  workflowLoading.basic = true
  try {
    if (!isNew.value) {
      if (!indicatorWorkflow.indicatorId) throw new Error('未读取到指标 ID，无法保存基本信息')
      const updated = await updateIndicator(indicatorWorkflow.indicatorId, createIndicatorMetadataPayload())
      form.name = updated?.name ?? form.name
      syncCategorySelection(resolveCategoryPath(updated, form.categoryPath))
      form.definition = updated?.definition ?? updated?.description ?? form.definition
      form.significance = updated?.meaning ?? form.significance
      form.sources = updated?.dataSources ?? form.sources
      form.period = fromApiStatisticalPeriod(updated?.statisticalPeriod) || form.period
      indicatorWorkflow.metadataVersionId = toOpaqueId(updated?.metadataVersionId ?? indicatorWorkflow.metadataVersionId)
      indicatorWorkflow.metadataResourceVersion = resolveMetadataResourceVersion(updated, indicatorWorkflow.metadataResourceVersion)
      ElMessage.success('指标基本信息已更新')
      return true
    }

    const suffix = createBackendCodeSuffix()
    const indicatorCode = normalizeBusinessCode(form.code) || `FRONTEND_INDICATOR_${suffix}`
    const categoryPath = syncCategorySelection(form.categoryPath)
    const indicator = await createIndicator({
      code: `${indicatorCode}_${suffix}`,
      name: form.name || `前端指标 ${suffix}`,
      description: form.definition || '前端指标配置流程创建',
      category: categoryPath[categoryPath.length - 1] || '',
      categoryMain: categoryPath[0] || '',
      categorySub: categoryPath[1] || ''
    })
    const indicatorId = resolveIndicatorId(indicator)
    if (!indicatorId) {
      throw new Error('后端未返回指标 ID，无法继续创建指标版本')
    }
    resetIndicatorWorkflowAfterBasic(
      indicatorId,
      '',
      resolveResourceVersion(indicator)
    )
    await router.replace(`/indicator/edit/${encodeURIComponent(indicatorId)}`)
    ElMessage.success('指标基本信息已保存到后端')
    return true
  } catch (error) {
    ElMessage.error(error?.message || '指标基本信息保存失败')
    return false
  } finally {
    workflowLoading.basic = false
  }
}

async function createIndicatorDraftVersion() {
  if (!indicatorWorkflow.indicatorId) {
    ElMessage.warning('请先保存指标基本信息')
    return false
  }

  if (!indicatorWorkflow.versionId) {
    activeTab.value = 'formula'
    ElMessage.info('请先选择分子、分母；首次保存公式时会同时创建指标版本')
    return false
  }

  workflowLoading.version = true
  try {
    const copyFromVersionId = indicatorWorkflow.versionId
    const versionPayload = buildIndicatorVersionPayload({ copyFromVersionId, drillConfig })
    recordWorkflowRequest({
      step: '创建指标版本',
      endpoint: `/api/v1/indicators/${indicatorWorkflow.indicatorId}/versions`,
      indicatorId: indicatorWorkflow.indicatorId,
      requestBody: versionPayload
    })
    const version = await createIndicatorVersion(
      indicatorWorkflow.indicatorId,
      versionPayload
    )
    const versionId = resolveIndicatorVersionId(version)
    if (!versionId) {
      throw new Error('后端未返回指标版本 ID，无法保存公式')
    }
    Object.assign(indicatorWorkflow, {
      versionId,
      resourceVersion: resolveResourceVersion(version),
      formulaSaved: Boolean(extractFormula(version)),
      compiled: Boolean(version.currentArtifactId),
      taskId: '',
      batchId: '',
      displayValue: '',
      resultValue: '',
      published: false,
      publishedVersionId: '',
      publishIdempotencyKey: ''
    })
    hydrateFormulaFactors(extractFormula(version))
    activeTab.value = 'formula'
    ElMessage.success('指标版本已创建，可以配置公式')
    return true
  } catch (error) {
    ElMessage.error(error?.message || '指标版本创建失败')
    return false
  } finally {
    workflowLoading.version = false
  }
}

async function saveBasicAndCreateVersion() {
  const basicSaved = await saveIndicatorBasicInfo()
  if (!basicSaved) return
  activeTab.value = 'formula'
  ElMessage.success(indicatorWorkflow.versionId ? '基本信息已保存，可以继续配置公式' : '基本信息已保存，请选择分子、分母并创建首个版本')
}

function handleDrillPathChange(pathCode) {
  drillConfig.maxLevel = pathCode === 'TIME' ? 'MONTH' : 'OUT_DEPT'
}

async function saveIndicatorFormulaOnly() {
  if (!indicatorWorkflow.indicatorId) {
    ElMessage.warning('请先保存指标基本信息')
    return
  }
  if (indicatorWorkflow.published) {
    ElMessage.warning('已发布版本不可直接修改，请先创建草稿版本')
    return
  }

  const validationMessage = validateFormulaAndDrillSelection()
  if (validationMessage) {
    ElMessage.warning(validationMessage)
    return
  }

  workflowLoading.formula = true
  try {
    if (!indicatorWorkflow.versionId) {
      await createFirstIndicatorVersionWithFormula()
    } else {
      await refreshIndicatorVersionState()
      try {
        await persistIndicatorFormula()
      } catch (error) {
        if (!isOptimisticLockError(error)) throw error
        await refreshIndicatorVersionState()
        await persistIndicatorFormula()
      }
    }
    ElMessage.success('计算公式已保存')
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.error(error?.message || '计算公式保存失败')
  } finally {
    workflowLoading.formula = false
  }
}

function validateFormulaAndDrillSelection() {
  if (numeratorFactors.value.length !== 1) return '简单比率型必须选择一个分子因子'
  if (denominatorFactors.value.length !== 1) return '简单比率型必须选择一个分母因子'
  if (!drillConfig.pathCode || !drillConfig.maxLevel) return '请选择下钻路径和最大层级'

  const unsupported = findUnsupportedDrillFactors(
    [...numeratorFactors.value, ...denominatorFactors.value],
    drillConfig
  )
  if (!unsupported.length) return ''

  return unsupported.map(({ factor, missing }) =>
    `${factor.name || factor.code || factor.versionId} 的输出粒度缺少 ${missing.join('、')}`
  ).join('；') + '。请选择时间下钻，或重新发布包含所需组织粒度的因子'
}

async function createFirstIndicatorVersionWithFormula() {
  const formulaPayload = createIndicatorFormulaPayload(0)
  const versionPayload = buildIndicatorVersionPayload({
    drillConfig,
    formula: formulaPayload.formula
  })
  recordWorkflowRequest({
    step: '创建首个指标版本并保存公式',
    endpoint: `/api/v1/indicators/${indicatorWorkflow.indicatorId}/versions`,
    indicatorId: indicatorWorkflow.indicatorId,
    requestBody: versionPayload
  })
  const version = await createIndicatorVersion(indicatorWorkflow.indicatorId, versionPayload)
  const versionId = resolveIndicatorVersionId(version)
  if (!versionId) throw new Error('后端未返回指标版本 ID，无法继续公式流程')

  Object.assign(indicatorWorkflow, {
    versionId,
    resourceVersion: resolveResourceVersion(version),
    metadataVersionId: toOpaqueId(version.metadataVersionId ?? versionId),
    metadataResourceVersion: resolveMetadataResourceVersion(version),
    formulaSaved: true,
    compiled: Boolean(version.currentArtifactId),
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: false,
    publishedVersionId: '',
    publishIdempotencyKey: ''
  })
  recordWorkflowSuccess(`首个指标版本及公式已保存：${versionId}`)
}

async function compileIndicatorFormulaOnly() {
  if (!indicatorWorkflow.formulaSaved) {
    ElMessage.warning('请先保存计算公式')
    return
  }

  workflowLoading.compile = true
  try {
    await refreshIndicatorVersionState()
    const compilePayload = {
      resourceVersion: indicatorWorkflow.resourceVersion
    }
    recordWorkflowRequest({
      step: '公式校验',
      endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/formula/compile`,
      versionId: indicatorWorkflow.versionId,
      resourceVersion: indicatorWorkflow.resourceVersion,
      requestBody: compilePayload
    })
    const artifact = await compileIndicatorFormula(indicatorWorkflow.versionId, compilePayload)
    const compileStatus = artifact.status || artifact.compileStatus
    indicatorWorkflow.resourceVersion = resolveResourceVersion(artifact, indicatorWorkflow.resourceVersion)
    indicatorWorkflow.compiled = ['VALID', 'VALID_WITH_WARNINGS', 'COMPILED', 'COMPILED_WITH_WARNINGS'].includes(compileStatus)
    await refreshIndicatorVersionState()
    recordWorkflowSuccess(`公式校验状态：${compileStatus || '未知'}`)
    if (indicatorWorkflow.compiled) {
      ElMessage.success('公式校验通过')
    } else {
      ElMessage.warning(`公式校验状态：${compileStatus || '未知'}`)
    }
  } catch (error) {
    indicatorWorkflow.compiled = false
    recordWorkflowError(error)
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
    const trialPayload = createMortalityTrialPayload()
    const idempotencyKey = createIdempotencyKey('indicator-workflow')
    recordWorkflowRequest({
      step: '发起试算',
      endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/trial`,
      versionId: indicatorWorkflow.versionId,
      resourceVersion: indicatorWorkflow.resourceVersion,
      idempotencyKey,
      requestBody: trialPayload
    })
    const trial = await trialIndicatorVersion(
      indicatorWorkflow.versionId,
      trialPayload,
      idempotencyKey
    )
    indicatorWorkflow.taskId = resolveTaskId(trial)
    indicatorWorkflow.batchId = resolveBatchId(trial)
    if (!indicatorWorkflow.taskId || !indicatorWorkflow.batchId) {
      throw new Error('后端未返回试算任务 ID 或批次 ID，无法继续读取结果')
    }
    recordWorkflowSuccess(`试算已提交，任务 ${indicatorWorkflow.taskId}，批次 ${indicatorWorkflow.batchId}`)
    ElMessage.success('指标试算已提交，可以稍后查看结果')
    await refreshTrialTaskStatus()
  } catch (error) {
    recordWorkflowError(error)
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
    recordWorkflowRequest({
      step: '查看结果',
      endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/trials/${indicatorWorkflow.batchId}/results?page=1&size=100`,
      versionId: indicatorWorkflow.versionId
    })
    const batch = await pollBackendBatch(indicatorWorkflow.batchId)
    const batchStatus = batch.status || batch.batchStatus
    if (!['SUCCEEDED', 'PARTIAL_SUCCEEDED'].includes(batchStatus)) {
      recordWorkflowSuccess(`试算批次仍在处理中：${batchStatus || '未知'}`)
      ElMessage.info('试算仍在处理中，请稍后再查看结果')
      return
    }
    const resultSet = await fetchIndicatorTrialResults(indicatorWorkflow.versionId, indicatorWorkflow.batchId)
    const record = resultSet.results?.records?.[0]
    indicatorWorkflow.displayValue = record?.displayValue || '-'
    indicatorWorkflow.resultValue = record?.resultValue ?? ''
    recordWorkflowSuccess(`试算结果：${indicatorWorkflow.displayValue}`)
    ElMessage.success('试算结果已读取')
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.error(error?.message || '试算结果读取失败')
  } finally {
    workflowLoading.result = false
  }
}

async function publishIndicatorVersionOnly() {
  if (!indicatorWorkflow.versionId) {
    ElMessage.warning('请先创建指标版本')
    return
  }
  if (indicatorWorkflow.published) {
    ElMessage.success('指标版本已发布')
    return
  }

  workflowLoading.publish = true
  try {
    const ready = await ensureIndicatorPublishPrerequisites()
    if (!ready) return
    await refreshIndicatorVersionState()
    if (indicatorWorkflow.published) {
      recordWorkflowSuccess(`指标版本已发布：${indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId}`)
      ElMessage.success('指标版本已发布')
      return
    }

    recordWorkflowRequest({
      step: '发布指标版本',
      endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/publish`,
      versionId: indicatorWorkflow.versionId
    })
    let result
    try {
      const publishKey = indicatorWorkflow.publishIdempotencyKey || (indicatorWorkflow.publishIdempotencyKey = createIdempotencyKey(`indicator-publish-${indicatorWorkflow.versionId}`))
      workflowDebug.idempotencyKey = publishKey
      result = await publishIndicatorVersion(indicatorWorkflow.versionId, publishKey)
    } catch (error) {
      if (!isOptimisticLockError(error)) throw error
      await refreshIndicatorVersionState()
      if (indicatorWorkflow.published) {
        result = { indicatorVersionId: indicatorWorkflow.versionId, status: 'PUBLISHED' }
      } else {
        result = await publishIndicatorVersion(indicatorWorkflow.versionId, indicatorWorkflow.publishIdempotencyKey)
      }
    }
    indicatorWorkflow.published = true
    indicatorWorkflow.publishedVersionId = resolveIndicatorVersionId(result) || indicatorWorkflow.versionId
    recordWorkflowSuccess(`指标版本已发布：${indicatorWorkflow.publishedVersionId}`)
    ElMessage.success('指标版本已发布')
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.error(error?.message || '指标版本发布失败')
  } finally {
    workflowLoading.publish = false
  }
}

async function persistIndicatorFormula() {
  const formulaPayload = createIndicatorFormulaPayload(indicatorWorkflow.resourceVersion)
  recordWorkflowRequest({
    step: '保存公式',
    endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/formula`,
    versionId: indicatorWorkflow.versionId,
    resourceVersion: indicatorWorkflow.resourceVersion,
    requestBody: formulaPayload
  })
  const savedFormula = await saveIndicatorFormula(
    indicatorWorkflow.versionId,
    formulaPayload
  )
  indicatorWorkflow.resourceVersion = resolveResourceVersion(savedFormula, indicatorWorkflow.resourceVersion)
  indicatorWorkflow.formulaSaved = true
  indicatorWorkflow.compiled = false
  indicatorWorkflow.displayValue = ''
  recordWorkflowSuccess('保存公式成功')
}

async function ensureIndicatorPublishPrerequisites() {
  if (!indicatorWorkflow.formulaSaved) {
    await saveIndicatorFormulaOnly()
    if (!indicatorWorkflow.formulaSaved) return false
  }

  if (!indicatorWorkflow.compiled) {
    await compileIndicatorFormulaOnly()
    if (!indicatorWorkflow.compiled) return false
  }
  if (!indicatorWorkflow.batchId) {
    await trialIndicatorOnly()
    if (!indicatorWorkflow.batchId) return false
  }
  if (!indicatorWorkflow.displayValue) {
    await loadIndicatorTrialResultOnly()
    if (!indicatorWorkflow.displayValue) return false
  }
  return true
}

async function refreshIndicatorVersionState() {
  if (!indicatorWorkflow.versionId) return null
  const latest = await fetchIndicatorVersion(indicatorWorkflow.versionId)
  const status = latest.status || latest.publicationStatus || ''
  indicatorWorkflow.resourceVersion = resolveResourceVersion(latest, indicatorWorkflow.resourceVersion)
  indicatorWorkflow.formulaSaved = indicatorWorkflow.formulaSaved || Boolean(extractFormula(latest) || latest.currentArtifactId)
  indicatorWorkflow.compiled = indicatorWorkflow.compiled || Boolean(latest.currentArtifactId)
  indicatorWorkflow.published = status === 'PUBLISHED'
  indicatorWorkflow.publishedVersionId = status === 'PUBLISHED' ? resolveIndicatorVersionId(latest) : indicatorWorkflow.publishedVersionId
  return latest
}

function isOptimisticLockError(error) {
  return error?.status === 409 || /已被修改|乐观锁|resourceVersion/i.test(error?.message || '')
}

function createIndicatorFormulaPayload(resourceVersion) {
  const numeratorVersionId = numeratorFactors.value[0]?.versionId
  const denominatorVersionId = denominatorFactors.value[0]?.versionId
  if (!numeratorVersionId || !denominatorVersionId) {
    throw new Error('请先选择已发布的分子、分母因子')
  }
  deathFactorVersionId.value = toOpaqueId(numeratorVersionId)
  dischargeFactorVersionId.value = toOpaqueId(denominatorVersionId)

  return createMortalityFormulaPayload({
    deathFactorVersionId: deathFactorVersionId.value,
    dischargeFactorVersionId: dischargeFactorVersionId.value,
    resourceVersion
  })
}

function createIndicatorMetadataPayload() {
  const categoryPath = syncCategorySelection(form.categoryPath)
  return {
    name: form.name,
    category: categoryPath[categoryPath.length - 1] || '',
    categoryMain: categoryPath[0] || '',
    categorySub: categoryPath[1] || '',
    description: form.definition || null,
    metadataVersionId: indicatorWorkflow.metadataVersionId || indicatorWorkflow.versionId || null,
    metadataResourceVersion: indicatorWorkflow.metadataResourceVersion,
    definition: form.definition || null,
    meaning: form.significance || null,
    calculationDescription: `${numeratorFactors.value[0]?.name || '分子因子'} / ${denominatorFactors.value[0]?.name || '分母因子'} × 100%`,
    statisticalPeriod: toApiStatisticalPeriod(form.period),
    dataSources: form.sources
  }
}

function toApiStatisticalPeriod(period) {
  return ({ 年度: 'YEARLY', 季度: 'QUARTERLY', 月度: 'MONTHLY', 自定义: 'CUSTOM' })[period] || period || 'YEARLY'
}

function fromApiStatisticalPeriod(period) {
  return ({ YEARLY: '年度', QUARTERLY: '季度', MONTHLY: '月度', CUSTOM: '自定义' })[period] || period || ''
}

function recordWorkflowRequest({
  step,
  endpoint,
  indicatorId = '',
  versionId = '',
  resourceVersion = '',
  idempotencyKey = '',
  requestBody = ''
}) {
  Object.assign(workflowDebug, {
    step,
    endpoint,
    apiBaseUrl: API_BASE_URL,
    fullUrl: resolveRequestUrl(endpoint),
    indicatorId: toOpaqueId(indicatorId),
    versionId: toOpaqueId(versionId),
    resourceVersion: resourceVersion === null || resourceVersion === undefined ? '' : String(resourceVersion),
    idempotencyKey,
    traceId: '',
    message: '请求已发起',
    requestBody: requestBody ? JSON.stringify(requestBody, null, 2) : ''
  })
}

function resolveRequestUrl(endpoint) {
  const path = endpoint.startsWith('/api/v1/')
    ? endpoint.slice('/api/v1'.length)
    : endpoint
  const base = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : `${window.location.origin}${API_BASE_URL}`
  return `${base}${path}`
}

function recordWorkflowSuccess(message) {
  workflowDebug.message = message
  workflowDebug.traceId = ''
}

function recordWorkflowError(error) {
  workflowDebug.message = error?.message || '请求失败'
  workflowDebug.traceId = error?.payload?.traceId || ''
}

async function pollBackendTask(taskId) {
  let task = await fetchAsyncTask(taskId)
  const intervals = [1000, 2000, 3000, 5000, 10000, 15000, 20000]
  const terminalStatuses = ['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELED', 'CANCELLED']
  for (let index = 0; index < intervals.length && !terminalStatuses.includes(task.status); index += 1) {
    await delay(intervals[index])
    task = await fetchAsyncTask(taskId)
  }
  return task
}

async function pollBackendBatch(batchId) {
  let batch = await fetchCalcBatch(batchId)
  const intervals = [1000, 2000, 3000, 5000, 10000, 15000, 20000]
  const status = () => batch.status || batch.batchStatus
  const terminalStatuses = ['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELED', 'CANCELLED']
  for (let index = 0; index < intervals.length && !terminalStatuses.includes(status()); index += 1) {
    await delay(intervals[index])
    batch = await fetchCalcBatch(batchId)
  }
  return batch
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

function createIdempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function resolveIndicatorId(indicator) {
  return toOpaqueId(
    indicator?.indicatorId ??
    indicator?.id ??
    indicator?.indicator?.id ??
    indicator?.indicator?.indicatorId
  )
}

function resolveIndicatorVersionId(version) {
  return toOpaqueId(
    version?.indicatorVersionId ??
    version?.versionId ??
    version?.draftVersionId ??
    version?.currentVersionId ??
    version?.latestVersionId ??
    version?.id ??
    version?.version?.id ??
    version?.version?.indicatorVersionId
  )
}

function resolveResourceVersion(payload, fallback = 0) {
  const value =
    payload?.resourceVersion ??
    payload?.versionResourceVersion ??
    payload?.version ??
    payload?.revision ??
    payload?.version?.resourceVersion ??
    fallback

  return Number(value) || 0
}

function resolveMetadataResourceVersion(payload, fallback = 0) {
  const value = payload?.metadataResourceVersion ?? payload?.metadataVersion ?? fallback
  return Number(value) || 0
}

function resolveTaskId(payload) {
  return toOpaqueId(
    payload?.taskId ??
    payload?.asyncTaskId ??
    payload?.task?.id ??
    payload?.task?.taskId
  )
}

function resolveBatchId(payload) {
  return toOpaqueId(
    payload?.batchId ??
    payload?.calcBatchId ??
    payload?.batch?.id ??
    payload?.batch?.batchId
  )
}

function toOpaqueId(value) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
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

async function refreshTrialTaskStatus() {
  if (!indicatorWorkflow.taskId) return

  try {
    recordWorkflowRequest({
      step: '轮询试算任务',
      endpoint: `/api/v1/async-tasks/${indicatorWorkflow.taskId}`,
      versionId: indicatorWorkflow.versionId
    })
    const task = await pollBackendTask(indicatorWorkflow.taskId)
    recordWorkflowSuccess(`试算任务状态：${task.status || '未知'}，批次：${indicatorWorkflow.batchId}`)
    if (task.status === 'SUCCEEDED') {
      ElMessage.success('指标试算已完成，可以查看结果')
    } else if (['FAILED', 'CANCELED', 'CANCELLED'].includes(task.status)) {
      ElMessage.warning(`指标试算任务状态：${task.status}`)
    }
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.warning('试算已提交，但任务状态轮询失败，请稍后点击查看结果或检查任务中心')
  }
}

onMounted(async () => {
  await loadPublishedFactorVersions()
  await loadIndicatorForEdit()
})

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

.workflow-debug {
  display: grid;
  margin: 0 16px 16px;
  padding: 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 6px;
  background: var(--idmp-layer-02);
  gap: 10px;

  > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    span {
      color: var(--idmp-text-helper);
      font-size: 12px;
    }

    strong {
      color: var(--idmp-text-primary);
      font-size: 13px;
    }
  }

  dl {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    margin: 0;
    gap: 6px 10px;
    font-size: 12px;
  }

  dt {
    color: var(--idmp-text-helper);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--idmp-text-secondary);
  }

  pre {
    max-height: 180px;
    margin: 0;
    padding: 10px;
    overflow: auto;
    border: 1px solid var(--idmp-border-subtle);
    border-radius: 6px;
    background: var(--idmp-layer-01);
    color: var(--idmp-text-secondary);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
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

.drill-config-card {
  margin-top: 8px;
  padding: 14px 16px 12px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 8px;
  background: var(--idmp-layer-02);
}

.drill-config-card__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--idmp-text-primary);
  font-size: 14px;
}

.drill-config-card p {
  margin: 6px 0 10px;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.drill-config-card__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.drill-config-card__fields :deep(.el-form-item) {
  margin-bottom: 4px;
}

.drill-config-card__hint {
  display: block;
  margin-top: 6px;
  color: var(--idmp-text-helper);
  font-size: 11px;
}

.category-cascader {
  width: 100%;
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

@media (max-width: 720px) {
  .drill-config-card__fields {
    grid-template-columns: 1fr;
  }
}
</style>
