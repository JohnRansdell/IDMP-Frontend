<template>
  <div class="idmp-page editor-page">
    <PageHeader
      :title="editorTitle"
      :status="editorStatus"
      :status-label="editorStatusLabel"
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
        公式、试算、独立正式计算和场景配置均使用真实接口。统一在第 6 页发布；政策来源必选，依据说明选填，场景关联可选。
        草稿政策选择仅在当前浏览器暂存，发布后自动绑定；指标级排除规则尚无对应保存接口。
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
                <el-input v-model.trim="form.code" :disabled="!isNew || Boolean(indicatorWorkflow.indicatorId)" maxlength="64" aria-label="指标编码" placeholder="自动生成，可在创建时修改" />
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
                <el-select v-model="form.unit" placeholder="未设置">
                  <el-option label="百分比（%）" value="百分比（%）" />
                  <el-option label="比值" value="比值" />
                  <el-option label="人次" value="人次" />
                  <el-option label="元" value="元" />
                  <el-option label="天数" value="天数" />
                </el-select>
              </el-form-item>
              <el-form-item label="指标导向" prop="direction">
                <el-select v-model="form.direction" placeholder="未设置">
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
                  <el-checkbox v-for="item in sourceOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="政策文件来源" prop="policyDrafts" required class="form-span-2">
                <IndicatorPolicySources :controller="policyPanel" :model-value="form.policyDrafts" :published="indicatorWorkflow.published" />
              </el-form-item>
            </div>
          </el-form>
          <el-alert v-if="!indicatorWorkflow.versionId || indicatorWorkflow.published" type="info" :closable="false" show-icon :title="indicatorWorkflow.published ? '当前是已发布版本；定义、统计周期和数据来源需创建新草稿版本后才能修改。' : '定义、统计周期和数据来源会在首次保存公式、创建草稿版本后写入。当前保存先创建或更新指标基本资料。'" />
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
            <el-button
              type="primary"
              :loading="workflowLoading.basic || workflowLoading.version"
              @click="saveBasicAndOpenFormula"
            >
              保存并进入公式配置
            </el-button>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="2 公式与试算" name="formula">
        <section class="surface-card formula-card">
          <el-alert v-if="unsupportedFormula" title="当前公式含暂不支持的节点类型；原公式不会被修改。" type="warning" :closable="false" />
          <div class="notice-strip is-warning formula-contract-note">
            <el-icon><InfoFilled /></el-icon>
            <span>
              配置公式后保存、校验并试算，查看试算结果。场景在第 4 页单独配置；发布统一在第 6 页完成。
            </span>
          </div>
          <h2>计算模式</h2>
          <div class="formula-modes">
            <el-button
              v-for="mode in formulaModes"
              :key="mode.name"
              :disabled="unsupportedFormula"
              :type="formulaMode === mode.name ? 'primary' : 'default'"
              :aria-pressed="formulaMode === mode.name ? 'true' : 'false'"
              @click="selectFormulaMode(mode.name)"
            >
              {{ mode.name }}
            </el-button>
          </div>
          <div class="mode-help">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ activeMode.description }}</span>
          </div>

          <h2 class="formula-section-title">公式编辑器</h2>
          <div v-if="activeMode.kind === 'advanced'" class="formula-builder advanced-formula-builder">
            <div class="advanced-formula-preview" aria-label="实时公式预览">
              <span>指标值</span><strong>{{ formulaPreview }}</strong>
            </div>
            <IndicatorFormulaComposer v-model="advancedFormulaRoot" :factors="advancedFactorOptions" :disabled="indicatorWorkflow.published" :loading="workflowLoading.factors" />
          </div>
          <div v-else class="formula-builder">
            <div v-if="activeMode.kind === 'statistic'" class="formula-settings formula-settings--top">
              <label>统计方法</label>
              <el-select v-model="statisticOperator" aria-label="选择统计方法">
                <el-option v-for="[code, label] in statisticMethods" :key="code" :label="label" :value="code" />
              </el-select>
            </div>
            <div
              class="factor-slot"
              :class="{ 'is-empty': !numeratorFactors.length }"
              data-testid="numerator-slot"
              @dragover.prevent
              @drop="dropFactor('numerator')"
              @mouseup="dropFactor('numerator')"
            >
              <div class="slot-label">{{ activeMode.leftLabel }}<span>{{ activeMode.leftHint }}</span></div>
              <div class="slot-content">
                <div v-for="factor in numeratorFactors" :key="factor.code" class="selected-factor">
                  <span>{{ factor.name }}</span>
                  <small>{{ factor.code }}</small>
                  <button type="button" @click="editFactor(factor)">查看因子条件</button>
                  <el-button
                    text
                    circle
                    :icon="Close"
                    :aria-label="`移除分子因子 ${factor.name}（${factor.code}）`"
                    @click="removeFactor('numerator', factor.code)"
                  />
                </div>
                <span v-if="!numeratorFactors.length" class="slot-placeholder">{{ activeMode.leftPlaceholder }}</span>
              </div>
            </div>

            <div v-if="activeMode.showRight" class="formula-operator">{{ formulaOperatorLabel }}</div>

            <div
              v-if="activeMode.showRight"
              class="factor-slot"
              :class="{ 'is-empty': !denominatorFactors.length }"
              data-testid="denominator-slot"
              @dragover.prevent
              @drop="dropFactor('denominator')"
              @mouseup="dropFactor('denominator')"
            >
              <div class="slot-label">{{ activeMode.rightLabel }}<span>{{ activeMode.rightHint }}</span></div>
              <div class="slot-content">
                <div v-for="factor in denominatorFactors" :key="factor.code" class="selected-factor">
                  <span>{{ factor.name }}</span>
                  <small>{{ factor.code }}</small>
                  <button type="button" @click="editFactor(factor)">查看因子条件</button>
                  <el-button
                    text
                    circle
                    :icon="Close"
                    :aria-label="`移除分母因子 ${factor.name}（${factor.code}）`"
                    @click="removeFactor('denominator', factor.code)"
                  />
                </div>
                <span v-if="!denominatorFactors.length" class="slot-placeholder">{{ activeMode.rightPlaceholder }}</span>
              </div>
            </div>

            <div v-if="activeMode.multiplier" class="formula-operator multiplier">× <strong>{{ activeMode.multiplier }}</strong></div>
            <div v-if="activeMode.kind === 'custom'" class="formula-settings formula-settings--operator">
              <label>运算符</label>
              <el-select v-model="customOperator" aria-label="选择多因子运算符">
                <el-option label="相加（+）" value="ADD" />
                <el-option label="相减（−）" value="SUB" />
                <el-option label="相乘（×）" value="MUL" />
                <el-option label="相除（÷）" value="DIV" />
              </el-select>
            </div>
          </div>

          <div class="factor-library">
            <div v-if="activeMode.kind !== 'advanced'" class="factor-library__head">
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
            <div v-if="activeMode.kind !== 'advanced'" class="factor-grid" v-loading="workflowLoading.factors">
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
                  <small>{{ factor.code }} | {{ getAggregationLabel(factor.aggregation) }} | {{ factor.domain }}</small>
                </div>
                <el-button text type="primary" @click="quickAdd(factor)">添加</el-button>
              </article>
            </div>
            <div v-if="activeMode.kind !== 'advanced'" class="factor-library__footer">
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
            <section class="drill-capability-card" aria-label="指标版本下钻能力预检">
              <section class="grouping-section" aria-label="下钻配置">
              <OrganizationDrillPathEditor v-model="selectedDrillPaths" :disabled="indicatorWorkflow.published" :legacy-isolation="legacyDepartmentIsolation" @update:model-value="invalidateGroupingConfiguration" />
              <FactorDimensionBindingsEditor v-model="factorDimensionBindings" title="组织下钻字段映射" :table-selections="factorFieldTableSelections" :disabled="indicatorWorkflow.published" :fields="organizationMappingFields" :field-labels="organizationMappingLabels" :factors="dimensionBindingFactors" :field-options="factorFieldState.fieldOptions" :loading="factorFieldState.status === 'loading'" :error="factorFieldState.errorMessage" @retry="loadFactorFieldOptions" @update:model-value="invalidateGroupingConfiguration" />
              <CustomDrillPathEditor v-model="selectedDrillPaths" :disabled="indicatorWorkflow.published" @update:model-value="invalidateGroupingConfiguration" />
              <FactorDimensionBindingsEditor v-model="factorDimensionBindings" title="业务下钻字段映射" class="drill-field-bindings" :table-selections="factorFieldTableSelections" :disabled="indicatorWorkflow.published" :fields="businessDrillMappingFields" :factors="dimensionBindingFactors" :field-options="factorFieldState.fieldOptions" :loading="factorFieldState.status === 'loading'" :error="factorFieldState.errorMessage" @retry="loadFactorFieldOptions" @update:model-value="invalidateGroupingConfiguration" />
                <section v-if="hasCustomDrillPaths" class="custom-drill-validation" aria-label="自定义路径校验结果">
                  <div class="drill-config-card__heading">
                    <h4>自定义路径校验结果</h4>
                    <el-tag :type="drillCapabilityTagType" size="small">{{ customDrillValidationText }}</el-tag>
                  </div>
                  <div class="drill-validation-actions"><el-button :disabled="!formulaValid" :loading="workflowLoading.capability" @click="runDrillCapabilityPreflight()">校验自定义路径</el-button></div>
                  <StatePanel v-if="drillCapability.status === 'loading'" type="loading" title="正在校验自定义路径" />
                  <el-alert v-else-if="drillCapability.status === 'error'" :title="drillCapability.errorMessage || '自定义路径校验失败，请重试'" type="error" :closable="false" show-icon />
                  <template v-else-if="['ready', 'stale'].includes(drillCapability.status)">
                    <el-alert v-if="drillCapability.status === 'stale'" title="配置已变更，请重新校验自定义路径" type="warning" :closable="false" show-icon />
                    <el-table :data="customDrillDimensions" size="small" border class="drill-capability-table">
                      <el-table-column label="自定义路径" min-width="150"><template #default="{ row }">{{ drillDimensionPathName(row) }}</template></el-table-column>
                      <el-table-column label="校验结果" width="120"><template #default="{ row }"><el-tag :type="customDrillPathSupported(row) ? 'success' : 'warning'" size="small">{{ customDrillPathSupported(row) ? '校验通过' : '未完全支持' }}</el-tag></template></el-table-column>
                      <el-table-column label="可用层级" min-width="130"><template #default="{ row }">{{ row.supported ? drillDimensionLevelName(row) : '不支持' }}</template></el-table-column>
                      <el-table-column label="限制原因" min-width="250"><template #default="{ row }"><span v-if="row.limitingFactors.length">{{ limitingFactorText(row) }}</span><span v-else class="muted-text">-</span></template></el-table-column>
                    </el-table>
                  </template>
                </section>
              </section>
              <section class="grouping-section" aria-label="组合粒度配置">
              <h3 class="grouping-section__title">组合粒度</h3>
              <DimensionGrainEditor v-model="indicatorDimensionGrain" :disabled="indicatorWorkflow.published" />
              <FactorDimensionBindingsEditor v-model="factorDimensionBindings" title="组合粒度字段映射" class="grain-field-bindings" :table-selections="factorFieldTableSelections" :disabled="indicatorWorkflow.published" :fields="grainMappingFields" :factors="dimensionBindingFactors" :field-options="factorFieldState.fieldOptions" :loading="factorFieldState.status === 'loading'" :error="factorFieldState.errorMessage" @retry="loadFactorFieldOptions" @update:model-value="invalidateGroupingConfiguration" />
              </section>
              <section class="grouping-section" aria-label="下钻能力校验">
              <div class="drill-config-card__heading">
                <div>
                  <h3 class="grouping-section__title">下钻能力校验</h3>
                </div>
                <el-tag :type="drillCapabilityTagType" size="small">{{ drillCapabilityTagText }}</el-tag>
              </div>
              <div class="business-action-bar drill-capability-actions">
                <el-button type="primary" :disabled="!formulaValid" :loading="workflowLoading.capability" @click="runDrillCapabilityPreflight()">校验下钻能力</el-button>
              </div>
              <el-alert v-if="drillCapability.status === 'idle'" :title="`请按${activeMode.factorRequirement}选择因子后执行预检；修改因子会使已有预检结果失效。`" type="info" :closable="false" show-icon />
              <StatePanel v-else-if="drillCapability.status === 'loading'" type="loading" title="正在预检下钻能力" />
              <el-alert v-else-if="drillCapability.status === 'error'" :title="drillCapability.errorMessage || '下钻能力预检失败'" type="error" :closable="false" show-icon />
              <template v-else-if="['ready', 'stale'].includes(drillCapability.status)">
                <el-alert v-if="organizationValidation" :title="organizationValidation.title" :type="organizationValidation.type" :closable="false" show-icon />
                <p class="drill-capability-coverage">本次预检覆盖因子版本：{{ drillCapability.factorVersionIds.join('、') || '-' }}</p>
                <el-table :data="defaultDrillDimensions" size="small" border class="drill-capability-table">
                  <el-table-column label="启用" width="76"><template #default="{ row }"><el-checkbox :model-value="isDrillPathSelected(row.pathCode)" :disabled="indicatorWorkflow.published || row.pathCode.startsWith('CUSTOM_') || !row.supported" :aria-label="`启用${drillPathLabel(row.pathCode)}下钻路径`" @change="checked => toggleDrillPath(row, checked)" /></template></el-table-column>
                  <el-table-column label="路径" min-width="145"><template #default="{ row }">{{ drillDimensionPathName(row) }}</template></el-table-column>
                  <el-table-column label="能力" min-width="120"><template #default="{ row }"><el-tag :type="row.supported ? 'success' : 'info'" size="small">{{ row.supported ? `最深到${drillDimensionLevelName(row)}` : '不支持' }}</el-tag></template></el-table-column>
                  <el-table-column label="本版本最大层级" min-width="210"><template #default="{ row }"><el-select :model-value="selectedDrillPathLevel(row.pathCode)" :disabled="indicatorWorkflow.published || row.pathCode.startsWith('CUSTOM_') || !row.supported || !isDrillPathSelected(row.pathCode)" placeholder="选择层级" @update:model-value="level => setDrillPathLevel(row.pathCode, level)"><el-option v-for="level in capabilityLevels(row)" :key="level.code" :label="drillLevelOptionLabel(level)" :value="level.code" /></el-select></template></el-table-column>
                  <el-table-column label="限制原因" min-width="280"><template #default="{ row }"><span v-if="row.limitingFactors.length">{{ limitingFactorText(row) }}</span><span v-else class="muted-text">-</span></template></el-table-column>
                </el-table>
              </template>
              </section>
            </section>
            <div v-if="!isStaticIndicator" class="indicator-trial-period">
              <div>
                <strong>本次试算周期</strong>
                <small>仅作为本次运行参数，按半开区间 [开始时间，结束时间) 同时传给分子和分母因子。</small>
              </div>
              <el-date-picker
                v-model="indicatorTrialPeriod"
                type="datetimerange"
                unlink-panels
                value-format="YYYY-MM-DDTHH:mm:ss"
                start-placeholder="开始时间"
                end-placeholder="结束时间"
                :disabled="!indicatorWorkflow.versionId"
                @change="resetIndicatorTrialAfterPeriodChange"
              />
            </div>
            <section v-if="indicatorRuntimeParameters.length" class="indicator-runtime-parameters">
              <div class="indicator-runtime-parameters__heading"><strong>SQL 运行参数</strong><small>参数来自引用因子的已编译声明，本次试算会与周期一起提交。</small></div>
              <el-alert v-if="indicatorRuntimeParameterConflicts.length" type="error" :closable="false" show-icon :title="`存在不兼容的同名参数：${indicatorRuntimeParameterConflicts.map(item => item.code).join('、')}`" />
              <RuntimeParameterFields v-model="indicatorRuntimeParameterValues" :declarations="indicatorRuntimeParameters" @change="resetIndicatorTrialAfterPeriodChange" />
            </section>
            <el-alert
              v-if="isStaticIndicator && indicatorWorkflow.initializationBatchId"
              :type="['SUCCEEDED', 'SUCCESS'].includes(indicatorWorkflow.initializationStatus) ? 'success' : indicatorWorkflow.initializationStatus === 'FAILED' ? 'error' : 'info'"
              :closable="false"
              show-icon
              :title="`静态初始化批次 ${indicatorWorkflow.initializationBatchId}：${getStatusLabel(indicatorWorkflow.initializationStatus || 'RUNNING')}`"
            />
            <div class="business-action-bar formula-actions">
              <div>
                <span>公式与试算操作</span>
                <small>{{ indicatorWorkflow.versionId ? `当前版本 ${indicatorWorkflow.versionId}` : (indicatorWorkflow.indicatorId ? '选择分子、分母后首次保存将创建指标版本' : '请先保存指标基本信息') }}</small>
              </div>
              <el-button
                v-if="indicatorWorkflow.published"
                type="primary"
                :disabled="drillCapability.status !== 'ready'"
                :loading="workflowLoading.version"
                @click="createIndicatorDraftVersion"
              >
                按当前公式与路径创建草稿版本
              </el-button>
              <el-button v-else :disabled="!indicatorWorkflow.indicatorId" :loading="workflowLoading.formula || workflowLoading.version" @click="saveIndicatorFormulaOnly">
                {{ indicatorWorkflow.versionId ? '保存公式' : '创建版本并保存公式' }}
              </el-button>
              <el-button :disabled="!indicatorWorkflow.formulaSaved" :loading="workflowLoading.compile" @click="compileIndicatorFormulaOnly">
                公式校验
              </el-button>
              <el-button type="primary" :disabled="!indicatorWorkflow.compiled || (!isStaticIndicator && !hasIndicatorTrialPeriod)" :loading="workflowLoading.trial || workflowLoading.result" v-access="['POST', '/indicator-versions/1/trial']" @click="trialIndicatorAndLoadResult">
                {{ indicatorTrialButtonLabel }}
              </el-button>
              <el-button type="success" plain @click="activeTab = 'publish'">前往第 6 页发布检查</el-button>
              <el-button v-if="indicatorWorkflow.published && !isStaticIndicator && !hasTemporaryIndicatorRuntimeParameters" type="primary" plain :loading="workflowLoading.formal" v-access="['POST', '/calc/batches']" @click="generateFormalResultAndOpenAnalysis">
                生成正式结果并去指标分析
              </el-button>
            </div>
            <section v-if="indicatorTrialResultsLoaded" class="workflow-trial-results" aria-label="指标试算多粒度结果">
              <div class="workflow-trial-results__head">
                <div>
                  <strong>试算结果</strong>
                  <small>批次 {{ indicatorWorkflow.batchId }} · 共 {{ indicatorTrialResultCount }} 条</small>
                </div>
                <el-radio-group v-if="indicatorTrialTargets.length > 1" v-model="selectedIndicatorTrialTargetKey" size="small" aria-label="试算结果时间粒度">
                  <el-radio-button v-for="target in indicatorTrialTargets" :key="target.key" :value="target.key">
                    {{ indicatorTrialTargetLabel(target) }}（{{ target.total }}）
                  </el-radio-button>
                </el-radio-group>
              </div>
              <StatePanel v-if="!selectedIndicatorTrialTarget || !indicatorTrialRows.length" type="empty" title="当前粒度暂无试算结果" description="后端已完成试算，但该目标没有返回结果记录。" />
              <template v-else>
                <el-table :data="indicatorTrialRows" size="small" border table-layout="fixed" class="indicator-trial-result-table">
                  <el-table-column label="时间" min-width="140"><template #default="{ row }"><span class="mono-data">{{ formatIndicatorTrialPeriod(row, selectedIndicatorTrialTarget) }}</span></template></el-table-column>
                  <el-table-column label="指标结果" min-width="130"><template #default="{ row }"><strong>{{ indicatorTrialResultValue(row) }}</strong></template></el-table-column>
                  <el-table-column v-if="indicatorTrialHasNumerator" label="分子" min-width="110"><template #default="{ row }">{{ row.numeratorValue ?? '-' }}</template></el-table-column>
                  <el-table-column v-if="indicatorTrialHasDenominator" label="分母" min-width="110"><template #default="{ row }">{{ row.denominatorValue ?? '-' }}</template></el-table-column>
                  <el-table-column label="质量状态" width="120"><template #default="{ row }">{{ getStatusLabel(row.qualityStatus || selectedIndicatorTrialTarget.qualityStatus || '-') }}</template></el-table-column>
                  <el-table-column label="结果状态" width="120"><template #default="{ row }">{{ getStatusLabel(row.outcomeStatus || selectedIndicatorTrialTarget.outcomeStatus || '-') }}</template></el-table-column>
                </el-table>
                <div class="workflow-trial-results__footer">
                  <span>{{ selectedIndicatorTrialTarget.periodStart || indicatorTrialResultSet.periodStart || '-' }} 至 {{ selectedIndicatorTrialTarget.periodEnd || indicatorTrialResultSet.periodEnd || '-' }}</span>
                  <el-pagination :current-page="selectedIndicatorTrialTarget.pageNum" :page-size="selectedIndicatorTrialTarget.pageSize" :total="selectedIndicatorTrialTarget.total" :disabled="workflowLoading.result" layout="total, prev, pager, next" @current-change="loadIndicatorTrialPage" />
                </div>
              </template>
            </section>
            <ResultAvailabilityPanel
              v-if="indicatorWorkflow.trialAvailability"
              :availability="indicatorWorkflow.trialAvailability"
              @open-batch="batchId => router.push({ path: '/calc', query: { batchId } })"
            />
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
              <IndicatorFormulaExpression v-if="advancedFormulaValid" :formula="advancedFormulaPayload" :factors="advancedFactorOptions" />
              <strong v-else>指标值 = {{ formulaPreview }}</strong>
            </div>
            <div class="validation-state" :class="{ 'is-invalid': !formulaValid }">
              <el-icon><CircleCheckFilled v-if="formulaValid" /><CircleCloseFilled v-else /></el-icon>
              <span>{{ formulaValid ? '本地结构检查通过；类型、单位和依赖仍须服务端校验' : (activeMode.kind === 'advanced' ? advancedFormulaError : '本地结构检查未通过：请补充公式因子') }}</span>
            </div>
            <div v-if="activeMode.kind === 'advanced'" class="advanced-display-settings" role="group" aria-label="公式展示设置">
              <label>展示格式<el-select :model-value="advancedFormulaPayload.display.format" :disabled="indicatorWorkflow.published" aria-label="嵌套公式展示格式" @update:model-value="savedFormulaDisplay = { ...advancedFormulaPayload.display, format: $event }"><el-option label="数值" value="NUMBER" /><el-option label="百分比" value="PERCENT" /><el-option v-if="savedFormulaDisplay?.format === 'DECIMAL'" label="数值" value="DECIMAL" /></el-select></label>
              <label>展示乘数<el-input :model-value="String(advancedFormulaPayload.display.multiplier ?? '1')" :disabled="indicatorWorkflow.published" aria-label="展示乘数" @update:model-value="savedFormulaDisplay = { ...advancedFormulaPayload.display, multiplier: $event }" /></label>
              <label>小数位数<el-input-number :model-value="advancedFormulaPayload.display.scale ?? 2" :disabled="indicatorWorkflow.published" :min="0" :max="12" :precision="0" aria-label="展示小数位数" @update:model-value="savedFormulaDisplay = { ...advancedFormulaPayload.display, scale: $event }" /></label>
              <label>舍入方式<el-select :model-value="advancedFormulaPayload.display.roundingMode || 'HALF_UP'" :disabled="indicatorWorkflow.published" aria-label="展示舍入方式" @update:model-value="savedFormulaDisplay = { ...advancedFormulaPayload.display, roundingMode: $event }"><el-option v-for="[code, label] in roundingModes" :key="code" :value="code" :label="label" /></el-select></label>
            </div>
            <div v-else class="formula-settings">
              <label>分母为零策略</label>
              <el-select v-model="zeroStrategy" aria-label="分母为零策略">
                <el-option label="返回空值" value="返回 NULL" />
                <el-option label="返回 0" value="返回 0" />
                <el-option label="标记异常" value="标记异常" />
              </el-select>
              <label>展示格式</label>
              <span>{{ activeMode.multiplier ? '百分比' : '数值' }}</span><i /> <span>乘数：{{ activeMode.multiplier ? 100 : 1 }}</span><i /> <span>精度：{{ savedFormulaDisplay?.scale ?? 2 }}位</span>
            </div>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="3 规则与排除" name="exclusion">
        <section class="surface-card exclusion-card">
          <h2>规则与排除</h2>
          <el-alert title="指标版本级默认排除条件暂不支持在此保存。因子过滤条件请到因子编辑页配置；仅特定场景适用的排除条件请到场景编辑页配置。" type="info" :closable="false" show-icon />
          <p>因子过滤、指标默认排除、场景覆盖的作用范围不同。此处不再展示不会保存或执行的模拟条件。</p>
          <el-button @click="activeTab = 'formula'">查看公式及引用因子</el-button><el-button @click="activeTab = 'scene'">查看可选场景配置</el-button>
        </section>
      </el-tab-pane>

      <el-tab-pane label="4 场景关联（可选）" name="scene">
        <IndicatorScenarioLinks :indicator-id="String(indicatorWorkflow.indicatorId || '')" :version-id="String(indicatorWorkflow.versionId || '')" :published="indicatorWorkflow.published" />
      </el-tab-pane>

      <el-tab-pane label="5 政策依据（选填）" name="policy">
        <section class="surface-card table-card">
          <div class="section-title"><div><h2>政策依据（选填）</h2><p>自动同步第 1 页选择的政策来源，可补充章节、条款和依据说明；本页可以跳过。</p></div></div>
          <IndicatorPolicyBasis :controller="policyPanel" :model-value="form.policyDrafts" :published="indicatorWorkflow.published" />
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
            <div class="publish-action-content">
              <StatePanel
                :type="indicatorWorkflow.published ? 'empty' : 'permission'"
                :title="indicatorWorkflow.published ? '指标版本已发布' : '等待发布条件'"
                :description="publishPanelDescription"
              />
            </div>
            <div class="business-action-bar publish-actions">
              <div>
                <span>后端写入接口</span>
                <small class="mono-data">POST /api/v1/indicator-versions/{{ indicatorWorkflow.versionId || '{id}' }}/publish</small>
              </div>
              <el-button
                type="primary"
                :disabled="!indicatorWorkflow.versionId || indicatorWorkflow.published || policySourceState.loading || policySourceState.saving"
                :loading="workflowLoading.publish"
                @click="publishIndicatorVersionOnly"
              >
                发布指标版本
              </el-button>
              <el-button v-if="indicatorWorkflow.published && (form.policyDrafts.length || policySourceState.error)" type="warning" :loading="policySourceState.saving" @click="retryPolicySources">重试保存政策来源</el-button>
              <el-button v-if="indicatorWorkflow.published && !isStaticIndicator && !hasTemporaryIndicatorRuntimeParameters" plain :loading="workflowLoading.formal" v-access="['POST', '/calc/batches']" @click="generateFormalResultAndOpenAnalysis">独立正式计算并查看结果</el-button>

            </div>
          </article>
        </section>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { resolveIndicatorVersionId, extractFormula, pickLatestVersion } from '@/idmp/features/indicator/versionModel.js'
import { toOpaqueId } from '@/idmp/utils/resourceId.js'

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
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
import IndicatorScenarioLinks from '@/idmp/components/IndicatorScenarioLinks.vue'
import ResultAvailabilityPanel from '@/idmp/components/ResultAvailabilityPanel.vue'
import { API_BASE_URL } from '@/idmp/api/request'
import { resourceConflictEditorPath, resolveResourceConflict } from '@/idmp/api/adapters/resourceConflict'
import {
  compileIndicatorFormula,
  createIndicator,
  createIndicatorVersion,
  fetchIndicatorAnalysis,
  fetchIndicator,
  fetchAllIndicators as fetchIndicators,
  fetchIndicatorVersion,
  fetchIndicatorVersions,
  fetchIndicatorTrialResults,
  preflightIndicatorDrillCapabilities,
  publishIndicatorVersion,
  saveIndicatorFormula,
  trialIndicatorVersion,
  updateIndicator
} from '@/idmp/api/modules/indicators'
import {
  buildIndicatorVersionPayload,
  buildIndicatorDataSources,
  indicatorDataSourceKey,
  normalizeIndicatorDataSources,
  combineFormulaNodes,
  drillLevelLabel,
  drillPathLabel,
  normalizeDrillCapabilities,
  normalizeDrillPaths,
  formatIndicatorTrialPeriod,
  normalizeIndicatorTrialResults,
  selectDefaultIndicatorTrialTarget,
  validateDrillSelection
} from '@/idmp/api/adapters/indicator'
import { createCalcBatch, fetchAsyncTask, fetchCalcBatch } from '@/idmp/api/modules/calculation'
import IndicatorPolicySources from '@/idmp/components/IndicatorPolicySources.vue'
import IndicatorPolicyBasis from '@/idmp/components/IndicatorPolicyBasis.vue'
import { useIndicatorPolicySources } from '@/idmp/features/indicator/useIndicatorPolicySources'
import { restorePolicyDrafts } from '@/idmp/features/indicator/editorWorkflow'
import { getStatusLabel } from '@/idmp/design/status'
import { resolveResultAvailability } from '@/idmp/features/analysis/resultAvailability'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'
import { factorCalculationMode } from '@/idmp/utils/factorPeriod'
import { newResourceCode } from '@/idmp/utils/resourceCode'
import { parseEditorFormula, zeroPolicy, zeroPolicyLabel } from '@/idmp/features/indicator/formulaEditor'
import { arithmeticFormulaError, arithmeticDisplayError, arithmeticFactorIds, arithmeticFormulaText, buildArithmeticFormula, cloneFormula, createArithmeticNode, roundingModes, statisticMethods, createStatisticFunction } from '@/idmp/features/indicator/arithmeticFormula'
import IndicatorFormulaComposer from '@/idmp/components/IndicatorFormulaComposer.vue'
import IndicatorFormulaExpression from '@/idmp/components/IndicatorFormulaExpression.vue'
import { configurableSourceFactors, activeSourceBindings } from '@/idmp/utils/derivedFactor'
import { fetchFactorVersion, fetchPublishedFactorVersions } from '@/idmp/api/modules/factors'
import RuntimeParameterFields from '@/idmp/components/RuntimeParameterFields.vue'
import DimensionGrainEditor from '@/idmp/components/DimensionGrainEditor.vue'
import CustomDrillPathEditor from '@/idmp/components/CustomDrillPathEditor.vue'
import OrganizationDrillPathEditor from '@/idmp/components/OrganizationDrillPathEditor.vue'
import { organizationConfigurationError, codeOnlyOrganizationPaths } from '@/idmp/features/indicator/organizationDrill.js'
import FactorDimensionBindingsEditor from '@/idmp/components/FactorDimensionBindingsEditor.vue'
import { serializeDrillPaths, sqlImportGroupingFields, sqlImportGroupingFieldLabels } from '@/idmp/features/indicator/grouping.js'
import { normalizeDimensionGrain } from '@/idmp/features/indicator/grouping'
import { buildSqlRuntimeParameterValues, collectSqlRuntimeParameters, validateSqlRuntimeParameterValues } from '@/idmp/api/adapters/sqlImport'

const route = useRoute()
const router = useRouter()
const isNew = computed(() => !route.params.id || route.params.id === 'new')
const routeIndicatorKey = computed(() => String(route.params.id || ''))
const activeTab = ref('basic')
const policyPanel = ref()
const policySourceState = reactive({ count: 0, pending: 0, loading: false, saving: false, error: '' })
let policyCacheReady = false
let policyCacheWarningShown = false
let savedBasicSignature = ''
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
  masterResourceVersion: 0,
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
  publishIdempotencyKey: '',
  formalBatchId: '',
  formalIdempotencyKey: '',
  initializationBatchId: '',
  initializationStatus: '',
  trialAvailability: null
})
const indicatorTrialPeriod = ref(initialIndicatorTrialPeriod())
const indicatorRuntimeParameterGroups = ref([])
const indicatorRuntimeParameterValues = ref({})
const indicatorTrialResultSet = ref({ targets: [] })
const indicatorTrialTargets = ref([])
const selectedIndicatorTrialTargetKey = ref('')
const indicatorTrialResultsLoaded = ref(false)
const selectedDrillPaths = ref([])
const dataOwnership = ref(null)
const legacyDepartmentIsolation = computed(() => indicatorWorkflow.published && dataOwnership.value?.mode === 'DEPARTMENT')
const factorDimensionBindings = ref({})
const factorFieldTableSelections = reactive(new Map())
const factorFieldState = reactive({ status: 'idle', factorVersionIds: [], fieldOptions: [], errorMessage: '' })
const indicatorDimensionGrain = ref([])
const drillMappingFields = computed(() => sqlImportGroupingFields(selectedDrillPaths.value))
const organizationMappingFields = computed(() => sqlImportGroupingFields(codeOnlyOrganizationPaths(selectedDrillPaths.value.filter(path => path.pathCode === 'ORGANIZATION'))))
const organizationMappingLabels = computed(() => sqlImportGroupingFieldLabels(selectedDrillPaths.value.filter(path => path.pathCode === 'ORGANIZATION')))
const businessDrillMappingFields = computed(() => sqlImportGroupingFields(selectedDrillPaths.value.filter(path => path.pathCode !== 'ORGANIZATION')))
const grainMappingFields = computed(() => {
  try { return sqlImportGroupingFields([], indicatorDimensionGrain.value) } catch { return [] }
})
const customGroupingFields = computed(() => [...new Set([...drillMappingFields.value, ...grainMappingFields.value])])
const drillCapability = reactive({
  status: 'idle',
  formulaSignature: '',
  factorVersionIds: [],
  dimensions: [],
  fieldOptions: [],
  dimensionGrainOptions: [],
  defaultOrganizationPath: null,
  suggestedDataOwnership: null,
  errorMessage: ''
})
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
  formal: false,
  factors: false,
  capability: false
})
const editLoadState = reactive({
  loading: false,
  loadedFromList: false,
  detailReady: false,
  message: ''
})

const selectedFormulaFactors = computed(() => activeMode.value.kind === 'advanced'
  ? arithmeticFactorIds(advancedFormulaRoot.value).map(id => findFactorByVersionId(id) || createFormulaFactorPlaceholder('引用因子', id)) : [
  ...numeratorFactors.value,
  ...denominatorFactors.value
])
const dimensionBindingFactors = computed(() => configurableSourceFactors(selectedFormulaFactors.value, factorFieldState, backendEditorFactors.value))
const indicatorCalculationMode = computed(() => {
  const modes = new Set(selectedFormulaFactors.value.map((factor) => String(factor?.calculationMode || factorCalculationMode(factor?.dsl || {})).toUpperCase()))
  return modes.size === 1 ? [...modes][0] : ''
})
const isStaticIndicator = computed(() => indicatorCalculationMode.value === 'STATIC')
const selectedIndicatorTrialTarget = computed(() =>
  indicatorTrialTargets.value.find((target) => target.key === selectedIndicatorTrialTargetKey.value) || null
)
const indicatorTrialRows = computed(() => selectedIndicatorTrialTarget.value?.records || [])
const indicatorTrialResultCount = computed(() =>
  indicatorTrialTargets.value.reduce((total, target) => total + Number(target.total || 0), 0)
)
const hasIndicatorTrialResults = computed(() =>
  indicatorTrialTargets.value.some((target) => target.records.length > 0)
)
const indicatorTrialHasNumerator = computed(() =>
  indicatorTrialRows.value.some((row) => row.numeratorValue !== null && row.numeratorValue !== undefined)
)
const indicatorTrialHasDenominator = computed(() =>
  indicatorTrialRows.value.some((row) => row.denominatorValue !== null && row.denominatorValue !== undefined)
)
const canPublishIndicatorVersion = computed(() =>
  Boolean(
    indicatorWorkflow.versionId &&
    !indicatorWorkflow.published
  )
)

const publishPanelDescription = computed(() => {
  if (indicatorWorkflow.published) {
    return `后端已返回发布结果，版本 ${indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId} 可用于分析查询。`
  }
  if (!indicatorWorkflow.versionId) return '请先创建指标版本。'
  if (!policySourceState.count) return '请先在第 1 页选择政策文件来源；依据说明选填，场景关联可跳过。'
  if (!indicatorWorkflow.compiled) return '发布时会对当前公式执行编译校验，失败时保留草稿。'
  if (!hasIndicatorTrialResults.value) return '发布前需要成功试算；提交发布时会补齐校验，并以后端最终校验为准。'
  return '发布接口已就绪，点击按钮会写入后端发布状态。'
})

const workflowSteps = computed(() => [
  { key: 'basic', label: '基础与版本', description: indicatorWorkflow.versionId ? '指标与版本已创建' : '填写基本信息并选择政策来源', state: indicatorWorkflow.versionId ? 'complete' : 'current' },
  { key: 'formula', label: '公式与试算', description: hasIndicatorTrialResults.value ? '试算结果已读取，可前往发布检查' : indicatorWorkflow.compiled ? '校验通过，可执行试算' : '保存公式后编译、试算', state: hasIndicatorTrialResults.value ? 'complete' : 'pending' },
  { key: 'exclusion', label: '规则与排除', description: '指标级默认排除暂不支持此处保存', state: 'blocked' },
  { key: 'scene', label: '场景关联', description: '可选，不影响独立指标计算', state: 'optional' },
  { key: 'policy', label: '政策依据', description: '选填，自动同步第 1 页政策来源，可跳过', state: 'optional' },
  { key: 'publish', label: '发布检查', description: indicatorWorkflow.published ? '指标已发布，可独立正式计算' : '统一在第 6 页确认发布', state: indicatorWorkflow.published ? 'complete' : 'pending' }
])

const publishGates = computed(() => [
  { label: '政策文件来源（必填）', description: policySourceState.error || `已选择 ${policySourceState.count} 份，待绑定 ${policySourceState.pending} 份；依据说明选填。草稿来源发布后绑定。`, state: policySourceState.error || !policySourceState.count ? 'pending' : policySourceState.pending ? 'warning' : 'pass', stateLabel: policySourceState.error ? '需重试' : !policySourceState.count ? '待选择' : policySourceState.pending ? '待绑定' : '已保存' },
  { label: '场景关联（可选）', description: '无需关联场景即可发布并生成独立正式结果', state: 'pass', stateLabel: '可跳过' },
  {
    label: '稳定指标与草稿版本',
    description: indicatorWorkflow.versionId ? `版本 ${indicatorWorkflow.versionId}` : '尚未创建可发布的草稿版本',
    state: indicatorWorkflow.versionId ? 'pass' : 'pending',
    stateLabel: indicatorWorkflow.versionId ? '已具备' : '待完成'
  },
  {
    label: 'Formula AST 服务端编译',
    description: indicatorWorkflow.compiled ? '服务端编译校验已通过' : '尚未取得有效编译产物',
    state: indicatorWorkflow.compiled ? 'pass' : 'pending',
    stateLabel: indicatorWorkflow.compiled ? '已通过' : '待完成'
  },
  {
    label: '试算结果与配置一致性',
    description: hasIndicatorTrialResults.value
      ? '已读取试算结果，但当前接口未返回配置 Hash'
      : '尚未取得可核验的试算结果',
    state: hasIndicatorTrialResults.value ? 'warning' : 'pending',
    stateLabel: hasIndicatorTrialResults.value ? '需核验 Hash' : '待完成'
  },
  {
    label: '质量、下钻与隐私',
    description: indicatorWorkflow.published ? '发布接口已由后端完成最终校验' : '发布时由后端执行最终门禁校验',
    state: indicatorWorkflow.published ? 'pass' : canPublishIndicatorVersion.value ? 'warning' : 'pending',
    stateLabel: indicatorWorkflow.published ? '已发布' : canPublishIndicatorVersion.value ? '后端校验' : '待发布'
  }
])
const savedDataSources = ref([])
const sourceOptions = computed(() => {
  const options = ['HIS', '手术麻醉', 'EMR', 'LIS', 'PACS', '病案', '药事', '财务'].map(value => ({ value, label: value }))
  for (const source of savedDataSources.value) {
    const value = indicatorDataSourceKey(source)
    if (value && !options.some(option => option.value === value)) options.push({ value, label: source.sourceCategory || `数据源 ${source.dataSourceId}` })
  }
  return options
})
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
  code: isNew.value ? newResourceCode('INDICATOR') : routeIndicatorKey.value,
  name: '',
  shortName: '',
  categoryPath: [...defaultCategoryPath],
  categoryMain: defaultCategoryPath[0],
  categorySub: defaultCategoryPath[1],
  attribute: isNew.value ? '定量' : '',
  unit: isNew.value ? '百分比（%）' : '',
  direction: isNew.value ? '逐步降低 ↓' : '',
  definition: '',
  significance: '',
  sources: [],
  period: '年度',
  policyDrafts: []
})

// One owner for both tabs: saved references, pending sources, optional citations and retries.
policyPanel.value = useIndicatorPolicySources({
  get modelValue() { return form.policyDrafts },
  get versionId() { return String(indicatorWorkflow.versionId || '') },
  get published() { return indicatorWorkflow.published }
}, (event, value) => {
  if (event === 'update:modelValue') form.policyDrafts = value
  else if (event === 'state') Object.assign(policySourceState, value)
})

async function focusPolicySource() {
  activeTab.value = 'basic'
  await nextTick()
  formRef.value?.scrollToField('policyDrafts')
  policyPanel.value.sourceSelect?.focus?.()
}

const editorTitle = computed(() => {
  if (isNew.value) return `新建指标：${form.name || '未命名指标'}`
  return `编辑指标：${form.name || routeIndicatorKey.value || '待加载'}`
})

const editorStatus = computed(() => {
  if (indicatorWorkflow.published) return 'PUBLISHED'
  if (hasIndicatorTrialResults.value) return 'TRIAL_READY'
  if (indicatorWorkflow.batchId) return 'TRIAL_SUBMITTED'
  if (indicatorWorkflow.compiled) return 'COMPILED'
  if (indicatorWorkflow.formulaSaved) return 'FORMULA_SAVED'
  if (indicatorWorkflow.versionId) return 'VERSION_DRAFT'
  if (indicatorWorkflow.indicatorId) return 'INDICATOR_READY'
  return isNew.value ? 'NEW' : 'DETAIL_PENDING'
})
const editorStatusLabel = computed(() => ({
  PUBLISHED: '已发布',
  NEW: '新建',
  DETAIL_PENDING: '等待加载详情',
  INDICATOR_READY: '指标已就绪',
  VERSION_DRAFT: '草稿版本',
  FORMULA_SAVED: '公式已保存',
  COMPILED: '已编译',
  TRIAL_SUBMITTED: '试算已提交',
  TRIAL_READY: '试算结果已就绪'
}[editorStatus.value] || getStatusLabel(editorStatus.value)))

const required = message => ({ required: true, message, trigger: ['blur', 'change'] })
const rules = computed(() => ({
  code: [required('请输入指标编码'), { pattern: /^[A-Z][A-Z0-9_]{0,63}$/, message: '编码须以大写字母开头，仅含大写字母、数字和下划线，最长 64 位', trigger: ['blur', 'change'] }],
  name: [required('请输入指标名称')],
  categoryPath: [required('请选择指标分类')],
  attribute: isNew.value ? [required('请选择指标属性')] : [],
  unit: isNew.value ? [required('请选择计量单位')] : [],
  direction: isNew.value ? [required('请选择指标导向')] : [],
  definition: [required('请输入指标定义')],
  sources: [required('请选择至少一个数据来源')],
  period: [required('请选择统计周期')],
  policyDrafts: [{ validator: (_rule, _value, done) => policySourceState.loading || policySourceState.saving ? done(new Error('请等待政策来源读取或保存完成')) : policySourceState.error ? done(new Error(policySourceState.error)) : policySourceState.count > 0 ? done() : done(new Error('请选择至少一份政策文件来源；依据说明选填')), trigger: 'change' }]
}))

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
  { name: '嵌套公式型', kind: 'advanced', description: '嵌套四则运算、数字常量与舍入', factorRequirement: '完整的嵌套公式' },
  { name: '简单比率型', kind: 'ratio', description: '一个分子 ÷ 一个分母 × 100%，适用于最基本的百分比指标', leftLabel: '分子', leftHint: '拖入一个因子', leftPlaceholder: '从下方拖入分子因子', rightLabel: '分母', rightHint: '拖入一个因子', rightPlaceholder: '从下方拖入分母因子', showRight: true, multiplier: '100%', factorRequirement: '一个分子和一个分母' },
  { name: '加法合成型', kind: 'add', description: '多个同量纲因子相加，适用于总量类指标', leftLabel: '参与合成的因子', leftHint: '可拖入多个因子', leftPlaceholder: '从下方拖入一个或多个因子', showRight: false, multiplier: '', factorRequirement: '至少一个参与合成的因子' },
  { name: '复合比率型', kind: 'ratio', description: '多个因子分别汇总后相除，并按百分比展示，适用于综合比率指标', leftLabel: '分子因子', leftHint: '可拖入多个因子', leftPlaceholder: '从下方拖入一个或多个分子因子', rightLabel: '分母因子', rightHint: '可拖入多个因子', rightPlaceholder: '从下方拖入一个或多个分母因子', showRight: true, multiplier: '100%', factorRequirement: '至少一个分子和一个分母因子' },
  { name: '多因子计算型', kind: 'custom', description: '选择两组因子及运算符，构成可计算的自定义表达式', leftLabel: '左侧因子', leftHint: '可拖入多个因子', leftPlaceholder: '从下方拖入左侧因子', rightLabel: '右侧因子', rightHint: '可拖入多个因子', rightPlaceholder: '从下方拖入右侧因子', showRight: true, multiplier: '', factorRequirement: '左、右两侧各至少一个因子' },
  { name: '统计量型', kind: 'statistic', description: '选择一个或多个因子，并指定平均数、中位数或分位数等统计方法', leftLabel: '统计对象', leftHint: '可拖入多个因子', leftPlaceholder: '从下方拖入一个或多个统计对象', showRight: false, multiplier: '', factorRequirement: '至少一个统计对象' },
  { name: '比值型', kind: 'ratio', description: '分子 ÷ 分母，不自动转换为百分比', leftLabel: '分子', leftHint: '拖入一个因子', leftPlaceholder: '从下方拖入分子因子', rightLabel: '分母', rightHint: '拖入一个因子', rightPlaceholder: '从下方拖入分母因子', showRight: true, multiplier: '', factorRequirement: '一个分子和一个分母' },
  { name: '复合比值型', kind: 'ratio', description: '两组因子分别汇总后相除', leftLabel: '分子因子', leftHint: '可拖入多个因子', leftPlaceholder: '选择分子因子', rightLabel: '分母因子', rightHint: '可拖入多个因子', rightPlaceholder: '选择分母因子', showRight: true, multiplier: '', factorRequirement: '至少一个分子和一个分母因子' }
]
const formulaMode = ref('简单比率型')
const activeMode = computed(() => formulaModes.find(item => item.name === formulaMode.value))
const numeratorFactors = ref([])
const denominatorFactors = ref([])
const customOperator = ref('ADD')
const statisticOperator = ref('AVG')
const draggedFactor = ref()
const factorSearch = ref('')
const factorCategory = ref('')
const factorLibraryRows = computed(() => backendEditorFactors.value)
const factorCategories = computed(() => [...new Set(factorLibraryRows.value.map(item => item.category).filter(Boolean))])
const zeroStrategy = ref('返回 NULL')
const unsupportedFormula = ref(false)
const formulaHydrating = ref(false)
const savedFormulaDisplay = ref(null)
const savedFormulaDefinition = ref(null)
const savedEditorFormulaSignature = ref('')
const savedCalculationDescription = ref(null)
const advancedFormulaRoot = ref(null)
const advancedFormulaError = computed(() => arithmeticFormulaError(advancedFormulaRoot.value) || arithmeticDisplayError(savedFormulaDisplay.value || {}))
const advancedFormulaValid = computed(() => activeMode.value.kind === 'advanced' && !advancedFormulaError.value)
const advancedFactorOptions = computed(() => {
  const factors = new Map(backendEditorFactors.value.map(factor => [String(factor.versionId), factor]))
  for (const factor of numeratorFactors.value) if (!factors.has(String(factor.versionId))) factors.set(String(factor.versionId), factor)
  return [...factors.values()]
})
const advancedFormulaPayload = computed(() => ({ ...savedFormulaDefinition.value, root: advancedFormulaRoot.value, display: savedFormulaDisplay.value || { format: 'NUMBER', multiplier: '1', scale: 2, roundingMode: 'HALF_UP' } }))

function selectFormulaMode(name) {
  if (name === formulaMode.value) return
  if (name === '嵌套公式型') {
    const formula = formulaValid.value ? createIndicatorFormulaPayload(0).formula : null
    advancedFormulaRoot.value = cloneFormula(formula?.root || createArithmeticNode('FACTOR_REF'))
    if (formula?.display) savedFormulaDisplay.value = cloneFormula(formula.display)
  }
  formulaMode.value = name
}

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

const formulaValid = computed(() => {
  if (unsupportedFormula.value) return false
  if (activeMode.value.kind === 'advanced') return !advancedFormulaError.value && selectedFormulaFactors.value.length > 0
  if (activeMode.value.kind === 'add' || activeMode.value.kind === 'statistic') return numeratorFactors.value.length > 0
  return numeratorFactors.value.length > 0 && denominatorFactors.value.length > 0
})
const formulaOperatorLabel = computed(() => {
  if (activeMode.value.kind === 'custom') return ({ ADD: '+', SUB: '−', MUL: '×', DIV: '÷' })[customOperator.value]
  return '÷'
})
const formulaPreview = computed(() => {
  if (activeMode.value.kind === 'advanced') return arithmeticFormulaText(advancedFormulaRoot.value, advancedFactorOptions.value)
  const leftText = numeratorFactors.value.map(item => item.name).join(' + ') || activeMode.value.leftPlaceholder
  const left = numeratorFactors.value.length > 1 && activeMode.value.showRight ? `(${leftText})` : leftText
  if (!activeMode.value.showRight) return activeMode.value.kind === 'statistic' ? `${statisticOperator.value}（${left}）` : left
  const rightText = denominatorFactors.value.map(item => item.name).join(' + ') || activeMode.value.rightPlaceholder
  const right = denominatorFactors.value.length > 1 ? `(${rightText})` : rightText
  return `${left} ${formulaOperatorLabel.value} ${right}${activeMode.value.multiplier ? ` × ${activeMode.value.multiplier}` : ''}`
})
const indicatorTrialButtonLabel = computed(() => {
  if (workflowLoading.trial || workflowLoading.result) return '正在试算并读取结果'
  if (hasIndicatorTrialResults.value) return '重新试算并查看结果'
  if (indicatorWorkflow.batchId) return '继续查询并查看结果'
  return '试算并查看结果'
})
const drillCapabilityTagText = computed(() => ({
  idle: '待预检',
  loading: '预检中',
  ready: '预检完成',
  stale: '待重新预检',
  error: '预检失败'
}[drillCapability.status] || '待预检'))
const drillCapabilityTagType = computed(() => ({
  idle: 'info',
  loading: 'warning',
  ready: 'success',
  stale: 'warning',
  error: 'danger'
}[drillCapability.status] || 'info'))
const hasCustomDrillPaths = computed(() => selectedDrillPaths.value.some(path => path.pathCode.startsWith('CUSTOM_')))
const customDrillDimensions = computed(() => drillCapability.dimensions.filter(dimension => dimension.pathCode.startsWith('CUSTOM_')))
const defaultDrillDimensions = computed(() => drillCapability.dimensions.filter(dimension => !dimension.pathCode.startsWith('CUSTOM_') && dimension.pathCode !== 'ORGANIZATION'))
const organizationValidation = computed(() => {
  const path = selectedDrillPaths.value.find(item => item.pathCode === 'ORGANIZATION')
  if (!path) return null
  if (drillCapability.status === 'stale') return { type: 'warning', title: '组织下钻配置已变更，请重新校验' }
  const dimension = drillCapability.dimensions.find(item => item.pathCode === 'ORGANIZATION')
  if (!dimension?.supported || dimension.maxLevel !== path.maxLevel) return { type: 'error', title: limitingFactorText(dimension || { limitingFactors: [] }) || '组织下钻未完全支持，请检查层级和因子字段映射' }
  return { type: 'success', title: '组织下钻校验通过' }
})
const customDrillValidationText = computed(() => ({ idle: '待校验', loading: '校验中', ready: '校验完成', stale: '待重新校验', error: '校验失败' }[drillCapability.status] || '待校验'))

let drillCapabilityRequestId = 0
let factorFieldRequestId = 0
let factorFieldController = null
let factorFieldPromise = null
let factorFieldSignature = ''

function selectedFactorVersionIds() {
  return [...new Set(selectedFormulaFactors.value.map(factor => String(factor.versionId || '')).filter(Boolean))].sort()
}

function resetFactorFieldOptions() {
  factorFieldRequestId += 1
  factorFieldController?.abort()
  factorFieldController = null
  factorFieldPromise = null
  factorFieldSignature = ''
  Object.assign(factorFieldState, { status: 'idle', factorVersionIds: [], fieldOptions: [], errorMessage: '' })
}

async function loadFactorFieldOptions() {
  const ids = selectedFactorVersionIds()
  if (!ids.length) return false
  const signature = JSON.stringify(ids)
  if (factorFieldSignature === signature) {
    if (factorFieldState.status === 'ready') return true
    if (factorFieldPromise) return factorFieldPromise
  }
  resetFactorFieldOptions()
  const requestId = factorFieldRequestId
  const controller = new AbortController()
  factorFieldController = controller
  factorFieldSignature = signature
  factorFieldState.status = 'loading'
  // 只收集已选因子的字段及原子依赖，不要求分子、分母或下钻配置完整。
  const formula = {
    schemaVersion: '1.0', astType: 'INDICATOR_FORMULA',
    root: combineFormulaNodes(ids.map((id, index) => ({ nodeId: `field_${index}`, nodeType: 'FACTOR_REF', factorVersionId: id })), 'ADD', 'fields')
  }
  factorFieldPromise = (async () => {
    try {
      const response = await preflightIndicatorDrillCapabilities(formula, { signal: controller.signal })
      if (requestId !== factorFieldRequestId) return false
      const capability = normalizeDrillCapabilities(response)
      Object.assign(factorFieldState, { status: 'ready', factorVersionIds: capability.factorVersionIds, fieldOptions: capability.fieldOptions, errorMessage: '' })
      return true
    } catch (error) {
      if (requestId !== factorFieldRequestId) return false
      factorFieldState.status = 'error'
      factorFieldState.errorMessage = error?.message || '物理字段加载失败，请重试'
      return false
    } finally {
      if (requestId === factorFieldRequestId) {
        factorFieldController = null
        factorFieldPromise = null
      }
    }
  })()
  return factorFieldPromise
}

onBeforeUnmount(resetFactorFieldOptions)
watch(() => dimensionBindingFactors.value.flatMap(factor => customGroupingFields.value.map(field => JSON.stringify([String(factor.versionId), field]))), keys => {
  const active = new Set(keys)
  for (const key of factorFieldTableSelections.keys()) if (!active.has(key)) factorFieldTableSelections.delete(key)
})

function formulaSignature(formula) {
  return JSON.stringify({ formula, drillPaths: selectedDrillPaths.value, factorDimensionBindings: factorDimensionBindings.value, dimensionGrain: indicatorDimensionGrain.value, dataOwnership: dataOwnership.value })
}

function resetDrillCapability() {
  drillCapabilityRequestId += 1
  Object.assign(drillCapability, {
    status: 'idle',
    formulaSignature: '',
    factorVersionIds: [],
    dimensions: [],
    dimensionGrainOptions: [],
    defaultOrganizationPath: null,
    suggestedDataOwnership: null,
    fieldOptions: [],
    errorMessage: ''
  })
  selectedDrillPaths.value = selectedDrillPaths.value.filter(path => path.pathCode.startsWith('CUSTOM_') || path.pathCode === 'ORGANIZATION')
}

function capabilityLevels(dimension) {
  if (dimension?.levels?.length) return dimension.levels
  return dimension?.maxLevel ? [{ code: dimension.maxLevel, name: dimension.maxLevel }] : []
}

function drillLevelOptionLabel(level) {
  const code = String(level?.code || '')
  const localized = drillLevelLabel(code)
  return localized !== code ? localized : level?.name || code || '-'
}
function drillDimensionPathName(dimension) {
  return selectedDrillPaths.value.find(path => path.pathCode === dimension.pathCode)?.pathName || drillPathLabel(dimension.pathCode)
}
function drillDimensionLevelName(dimension) {
  const configured = selectedDrillPaths.value.find(path => path.pathCode === dimension.pathCode)?.levels?.find(level => level.levelCode === dimension.maxLevel)
  const available = capabilityLevels(dimension).find(level => level.code === dimension.maxLevel)
  return configured?.levelName || drillLevelOptionLabel(available || { code: dimension.maxLevel })
}
function customDrillPathSupported(dimension) {
  return dimension.supported && dimension.maxLevel === selectedDrillPaths.value.find(path => path.pathCode === dimension.pathCode)?.maxLevel
}

function isDrillPathSelected(pathCode) {
  return selectedDrillPaths.value.some((path) => path.pathCode === pathCode)
}

function selectedDrillPathLevel(pathCode) {
  return selectedDrillPaths.value.find((path) => path.pathCode === pathCode)?.maxLevel || ''
}

function toggleDrillPath(dimension, checked) {
  const pathCode = String(dimension?.pathCode || '')
  if (!pathCode || pathCode === 'ORGANIZATION' || !dimension?.supported) return
  if (!checked) {
    selectedDrillPaths.value = selectedDrillPaths.value.filter((path) => path.pathCode !== pathCode)
    invalidateGroupingConfiguration()
    return
  }
  const levels = capabilityLevels(dimension)
  const maxLevel = levels[levels.length - 1]?.code || dimension.maxLevel
  if (!maxLevel) return
  selectedDrillPaths.value = [...selectedDrillPaths.value, { pathCode, maxLevel }]
  invalidateGroupingConfiguration()
}

function setDrillPathLevel(pathCode, maxLevel) {
  selectedDrillPaths.value = selectedDrillPaths.value.map((path) => (
    path.pathCode === pathCode ? { ...path, maxLevel: String(maxLevel || '') } : path
  ))
  invalidateGroupingConfiguration()
}

function limitingFactorText(dimension) {
  return dimension.limitingFactors.map((factor) => (
    `${factor.factorVersionId || '未知因子'}：${factor.reason || `最深到${drillLevelLabel(factor.maxLevel)}`}`
  )).join('；')
}

async function runDrillCapabilityPreflight(providedFormula) {
  let formula = providedFormula
  try {
    formula = formula || createIndicatorFormulaPayload(0).formula
  } catch (error) {
    ElMessage.warning(error?.message || '请先选择已发布的分子、分母因子')
    return false
  }

  const signature = formulaSignature(formula)
  const requestId = ++drillCapabilityRequestId
  Object.assign(drillCapability, {
    status: 'loading',
    formulaSignature: signature,
    factorVersionIds: [],
    dimensions: [],
    errorMessage: ''
  })
  workflowLoading.capability = true
  try {
    const organizationError = organizationConfigurationError(selectedDrillPaths.value)
    if (organizationError) throw new Error(organizationError)
    if (!await loadFactorFieldOptions()) throw new Error(factorFieldState.errorMessage || '物理字段尚未加载完成，请重试')
    if (requestId !== drillCapabilityRequestId) return false
    const paths = serializeDrillPaths(selectedDrillPaths.value)
    const bindings = activeFactorDimensionBindings()
    const response = await preflightIndicatorDrillCapabilities(formula, { drillPaths: paths, factorDimensionBindings: bindings })
    if (requestId !== drillCapabilityRequestId) return false
    const capability = normalizeDrillCapabilities(response)
    Object.assign(drillCapability, {
      status: 'ready',
      formulaSignature: signature,
      factorVersionIds: capability.factorVersionIds,
      dimensions: capability.dimensions,
      fieldOptions: capability.fieldOptions,
      dimensionGrainOptions: capability.dimensionGrainOptions,
      defaultOrganizationPath: capability.defaultOrganizationPath,
      suggestedDataOwnership: capability.suggestedDataOwnership,
      errorMessage: ''
    })
    if (!indicatorWorkflow.published) dataOwnership.value = capability.configuredDataOwnership
      || { mode: 'UNCLASSIFIED', departmentFieldCode: null }
    drillCapability.formulaSignature = formulaSignature(formula)
    return true
  } catch (error) {
    if (requestId !== drillCapabilityRequestId) return false
    Object.assign(drillCapability, {
      status: 'error',
      formulaSignature: signature,
      factorVersionIds: [],
      dimensions: [],
      errorMessage: error?.message || '下钻能力预检失败'
    })
    return false
  } finally {
    if (requestId === drillCapabilityRequestId) workflowLoading.capability = false
  }
}

async function ensureFreshDrillCapability(formula) {
  const signature = formulaSignature(formula)
  if (drillCapability.status === 'ready' && drillCapability.formulaSignature === signature) return true
  return runDrillCapabilityPreflight(formula)
}

watch(indicatorDimensionGrain, () => {
  if (indicatorWorkflow.versionId && !indicatorWorkflow.published) {
    indicatorWorkflow.formulaSaved = false
    indicatorWorkflow.compiled = false
    resetIndicatorTrialAfterPeriodChange()
  }
}, { deep: true, flush: 'sync' })

watch(
  () => [
    formulaMode.value, customOperator.value, statisticOperator.value, zeroStrategy.value,
    JSON.stringify(advancedFormulaRoot.value), JSON.stringify(savedFormulaDisplay.value),
    ...numeratorFactors.value.map((factor) => String(factor.versionId || factor.code || '')),
    '|',
    ...denominatorFactors.value.map((factor) => String(factor.versionId || factor.code || ''))
  ],
  () => {
    resetDrillCapability()
    workflowLoading.capability = false
    if (!formulaHydrating.value && indicatorWorkflow.versionId && !indicatorWorkflow.published) {
      indicatorWorkflow.formulaSaved = false
      indicatorWorkflow.compiled = false
      resetIndicatorTrialAfterPeriodChange()
    }
  },
  { flush: 'sync' }
)
watch(
  () => JSON.stringify(selectedFactorVersionIds()),
  () => {
    resetFactorFieldOptions()
    void loadFactorFieldOptions()
  },
  { flush: 'post' }
)
const hasIndicatorTrialPeriod = computed(() =>
  Array.isArray(indicatorTrialPeriod.value) && indicatorTrialPeriod.value.length === 2
)
const indicatorRuntimeParameters = computed(() => collectSqlRuntimeParameters(indicatorRuntimeParameterGroups.value.map(group => ({ ...group, key: group.factorCode || group.factorVersionId }))))
const indicatorRuntimeParameterConflicts = computed(() => indicatorRuntimeParameters.value.filter(item => item.conflict))
const hasTemporaryIndicatorRuntimeParameters = computed(() => indicatorRuntimeParameters.value.some(item => item.parameterMode === 'TEMPORARY'))

const dragFactor = factor => {
  draggedFactor.value = factor
}

const dropFactor = target => {
  if (unsupportedFormula.value) return
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

async function editFactor(factor) {
  const target = window.open('about:blank', '_blank')
  if (target) target.opener = null
  try {
    const version = factor.factorId ? factor : await fetchFactorVersion(factor.versionId)
    if (!version.factorId) throw new Error('未找到对应因子')
    const href = router.resolve({ name: 'FactorDetail', params: { id: String(version.factorId) }, query: { factorVersionId: String(factor.versionId) } }).href
    if (target) target.location.href = href
    else ElMessage.warning('浏览器阻止了新窗口，请从因子管理打开该因子')
  } catch (error) { target?.close(); ElMessage.error(error.message || '因子读取失败') }
}

async function loadPublishedFactorVersions() {
  workflowLoading.factors = true
  try {
    const payload = await fetchPublishedFactorVersions()
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
    category: item.category || (item.status ? getStatusLabel(item.status) : '已发布版本'),
    domain,
    versionId: toOpaqueId(item.id ?? item.versionId),
    factorId: toOpaqueId(item.factorId),
    status: item.status,
    currentArtifactId: item.currentArtifactId,
    calculationMode: String(item.calculationMode || item.dsl?.calculationMode || item.factorDsl?.calculationMode || '').toUpperCase(),
    dsl: item.dsl || item.factorDsl || item.definition?.dsl || null
  }
}

function refreshSelectedFactorReferences() {
  if (!backendEditorFactors.value.length) return
  applySelectedFactorReferences()
}

function applySelectedFactorReferences() {
  numeratorFactors.value = numeratorFactors.value.map(factor => findFactorByVersionId(factor.versionId) || factor)
  denominatorFactors.value = denominatorFactors.value.map(factor => findFactorByVersionId(factor.versionId) || factor)
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

function hydrateIndicatorSummary(item) {
  savedCalculationDescription.value = item.calculationDescription || null
  form.code = item.code || routeIndicatorKey.value
  form.name = item.name || ''
  form.shortName = item.shortName ?? ''
  syncCategorySelection(resolveCategoryPath(item))
  form.attribute = item.attribute ?? ''
  form.unit = item.unit ?? ''
  form.direction = item.direction ?? ''
  form.definition = item.description || item.definition || ''
  form.significance = item.significance || item.meaning || ''
  savedDataSources.value = normalizeIndicatorDataSources(item.dataSources || item.sources || (item.source ? [item.source] : []))
  form.sources = savedDataSources.value.map(indicatorDataSourceKey)
  form.period = fromApiStatisticalPeriod(item.period || item.statisticalPeriod) || form.period || '年度'
  Object.assign(indicatorWorkflow, {
    indicatorId: toOpaqueId(item.id ?? item.indicatorId ?? routeIndicatorKey.value),
    versionId: toOpaqueId(item.currentVersionId ?? item.latestVersionId ?? item.versionId ?? indicatorWorkflow.versionId),
    resourceVersion: resolveResourceVersion(item),
    masterResourceVersion: resolveResourceVersion(item),
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
    publishIdempotencyKey: '',
    formalBatchId: '',
    formalIdempotencyKey: '',
    initializationBatchId: '',
    initializationStatus: ''
  })
  resetIndicatorTrialResultCollection()
}

function hydrateIndicatorVersion(version) {
  if (!version) return
  const status = version.status || version.publicationStatus || ''
  indicatorDimensionGrain.value = [...(version.dimensionGrain || [])]

  Object.assign(indicatorWorkflow, {
    versionId: resolveIndicatorVersionId(version),
    resourceVersion: resolveResourceVersion(version, indicatorWorkflow.resourceVersion),
    metadataVersionId: resolveIndicatorVersionId(version),
    metadataResourceVersion: resolveResourceVersion(version, indicatorWorkflow.metadataResourceVersion),
    formulaSaved: Boolean(version.formula || version.currentArtifactId),
    compiled: Boolean(version.currentArtifactId),
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: status === 'PUBLISHED',
    publishedVersionId: status === 'PUBLISHED' ? resolveIndicatorVersionId(version) : '',
    formalBatchId: '',
    formalIdempotencyKey: '',
    initializationBatchId: toOpaqueId(version.initializationBatchId),
    initializationStatus: String(version.initializationStatus || '')
  })
  resetIndicatorTrialResultCollection()

  const formula = extractFormula(version)
  resetDrillCapability()
  hydrateFormulaFactors(formula)
  selectedDrillPaths.value = indicatorWorkflow.published ? normalizeDrillPaths(version) : codeOnlyOrganizationPaths(normalizeDrillPaths(version))
  dataOwnership.value = version.dataOwnership ? { ...version.dataOwnership } : null
  factorDimensionBindings.value = version.factorDimensionBindings || version.drillConfig?.factorDimensionBindings || {}
  indicatorRuntimeParameterGroups.value = Array.isArray(version.factorRuntimeParameters) ? version.factorRuntimeParameters : []
  indicatorRuntimeParameterValues.value = {}
}


function hydrateFormulaFactors(formula) {
  formulaHydrating.value = true
  try {
    const parsed = parseEditorFormula(formula)
    unsupportedFormula.value = Boolean(formula && !parsed)
    savedFormulaDisplay.value = formula?.display ? { ...formula.display } : null
    savedFormulaDefinition.value = formula ? JSON.parse(JSON.stringify(formula)) : null
    advancedFormulaRoot.value = parsed?.mode === '嵌套公式型' ? cloneFormula(formula.root || formula) : null
    savedEditorFormulaSignature.value = ''
    numeratorFactors.value = []
    denominatorFactors.value = []
    deathFactorVersionId.value = ''
    dischargeFactorVersionId.value = ''
    if (!parsed) return
    formulaMode.value = parsed.mode
    customOperator.value = parsed.operator || 'ADD'
    statisticOperator.value = parsed.statistic || 'AVG'
    zeroStrategy.value = zeroPolicyLabel(parsed.policy)
    numeratorFactors.value = parsed.left.map(id => findFactorByVersionId(id) || createFormulaFactorPlaceholder('左侧因子', id))
    denominatorFactors.value = parsed.right.map(id => findFactorByVersionId(id) || createFormulaFactorPlaceholder('右侧因子', id))
    deathFactorVersionId.value = parsed.left[0] || ''
    dischargeFactorVersionId.value = parsed.right[0] || ''
    savedEditorFormulaSignature.value = editorFormulaSignature()
  } finally {
    formulaHydrating.value = false
  }
}

function editorFormulaSignature() {
  return JSON.stringify([formulaMode.value, customOperator.value, statisticOperator.value, zeroStrategy.value,
    advancedFormulaRoot.value, savedFormulaDisplay.value,
    numeratorFactors.value.map(factor => String(factor.versionId)), denominatorFactors.value.map(factor => String(factor.versionId))])
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
  const formula = extractFormula(detail)
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
    masterResourceVersion: resourceVersion,
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
    publishIdempotencyKey: '',
    formalBatchId: '',
    formalIdempotencyKey: '',
    initializationBatchId: '',
    initializationStatus: ''
  })
  resetIndicatorTrialResultCollection()
}

async function saveIndicatorBasicInfo() {
  try {
    await formRef.value?.validate()
  } catch {
    if (!policySourceState.count || policySourceState.error) await focusPolicySource()
    else activeTab.value = 'basic'
    ElMessage.warning('请先完善指标基本信息')
    return false
  }

  workflowLoading.basic = true
  try {
    if (!isNew.value) {
      if (!indicatorWorkflow.indicatorId) throw new Error('未读取到指标 ID，无法保存基本信息')
      const hasDraftVersion = Boolean(indicatorWorkflow.versionId && !indicatorWorkflow.published)
      const updated = await updateIndicator(indicatorWorkflow.indicatorId, createIndicatorMetadataPayload({ includeVersionMetadata: hasDraftVersion }))
      applySavedIndicatorMetadata(updated, hasDraftVersion)
      rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
      ElMessage.success(hasDraftVersion ? '指标基本信息与草稿版本元数据已保存' : '指标基本资料已保存；定义、周期和来源将在创建草稿版本后保存')
      return true
    }

    const categoryPath = syncCategorySelection(form.categoryPath)
    const indicator = await createIndicator({
      code: form.code,
      name: form.name,
      shortName: form.shortName,
      attribute: form.attribute,
      unit: form.unit,
      direction: form.direction,
      description: form.definition || null,
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
    form.code = indicator.code ?? form.code
    rememberIndicatorEditorForm(indicatorId, true)
    await router.replace(`/indicator/edit/${encodeURIComponent(indicatorId)}`)
    ElMessage.success('指标已创建；定义、周期和来源将在首次保存公式后写入草稿版本')
    return true
  } catch (error) {
    await handleIndicatorSaveError(error)
    return false
  } finally {
    workflowLoading.basic = false
  }
}

function applySavedIndicatorMetadata(updated, hasDraftVersion) {
  form.code = updated?.code ?? form.code
  form.name = updated?.name ?? form.name
  for (const key of ['shortName', 'attribute', 'unit', 'direction']) {
    if (updated && Object.hasOwn(updated, key)) form[key] = updated[key] ?? ''
  }
  syncCategorySelection(resolveCategoryPath(updated, form.categoryPath))
  indicatorWorkflow.masterResourceVersion = resolveResourceVersion(updated, indicatorWorkflow.masterResourceVersion)
  savedBasicSignature = basicMetadataSignature()
  if (!hasDraftVersion) return
  form.definition = updated?.definition ?? updated?.description ?? form.definition
  form.significance = updated?.meaning ?? form.significance
  if (updated?.dataSources) {
    savedDataSources.value = normalizeIndicatorDataSources(updated.dataSources)
    form.sources = savedDataSources.value.map(indicatorDataSourceKey)
  }
  form.period = fromApiStatisticalPeriod(updated?.statisticalPeriod) || form.period
  savedBasicSignature = basicMetadataSignature()
  indicatorWorkflow.metadataVersionId = toOpaqueId(updated?.metadataVersionId ?? indicatorWorkflow.metadataVersionId)
  indicatorWorkflow.metadataResourceVersion = resolveMetadataResourceVersion(updated, indicatorWorkflow.metadataResourceVersion)
  if (indicatorWorkflow.metadataVersionId === indicatorWorkflow.versionId) {
    indicatorWorkflow.resourceVersion = indicatorWorkflow.metadataResourceVersion
    indicatorWorkflow.compiled = false
    resetIndicatorTrialAfterPeriodChange()
  }
}

async function handleIndicatorSaveError(error) {
  const conflict = resolveResourceConflict(error)
  if (!conflict) {
    ElMessage.error(error?.message || '指标基本信息保存失败')
    return
  }
  const action = await ElMessageBox.confirm(
    `已存在同名指标：${conflict.resource.name}（${conflict.resource.code}）。未创建新指标。`,
    '指标名称冲突',
    { type: 'warning', confirmButtonText: '打开已有指标', cancelButtonText: '返回修改', distinguishCancelAndClose: true }
  ).catch(() => 'cancel')
  if (action === 'confirm') {
    const path = resourceConflictEditorPath(conflict)
    if (path) router.push(path)
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

  try {
    const formula = createIndicatorFormulaPayload(0).formula
    if (!await ensureFreshDrillCapability(formula)) return false
    const validationMessage = validateFormulaAndDrillSelection(formula)
    if (validationMessage) {
      ElMessage.warning(validationMessage)
      return false
    }

    workflowLoading.version = true
    const copiedPolicySources = policyPanel.value?.copySourcesToDraft() || []
    const copyFromVersionId = indicatorWorkflow.versionId
    const versionPayload = buildIndicatorVersionPayload({ copyFromVersionId, drillPaths: selectedDrillPaths.value, calculationMode: indicatorCalculationMode.value, dimensionGrain: indicatorDimensionGrain.value, factorDimensionBindings: activeFactorDimensionBindings(), dataOwnership: dataOwnership.value })
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
      metadataVersionId: versionId,
      metadataResourceVersion: resolveResourceVersion(version),
      formulaSaved: Boolean(extractFormula(version)),
      compiled: Boolean(version.currentArtifactId),
      taskId: '',
      batchId: '',
      displayValue: '',
      resultValue: '',
      published: false,
      publishedVersionId: '',
      publishIdempotencyKey: '',
      formalBatchId: '',
      formalIdempotencyKey: '',
      initializationBatchId: '',
      initializationStatus: ''
    })
    form.policyDrafts = copiedPolicySources
    rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
    resetIndicatorTrialResultCollection()
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

async function saveBasicAndOpenFormula() {
  const basicSaved = await saveIndicatorBasicInfo()
  if (!basicSaved) return
  activeTab.value = 'formula'
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

  let formula
  try {
    formula = createIndicatorFormulaPayload(0).formula
  } catch (error) {
    ElMessage.warning(error?.message || '请先选择已发布的分子、分母因子')
    return
  }
  if (!await ensureFreshDrillCapability(formula)) return
  const validationMessage = validateFormulaAndDrillSelection(formula)
  if (validationMessage) {
    ElMessage.warning(validationMessage)
    return
  }

  workflowLoading.formula = true
  try {
    if (!indicatorWorkflow.versionId) {
      await createFirstIndicatorVersionWithFormula(formula)
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

function validateFormulaAndDrillSelection(formula) {
  if (!formulaValid.value) return `请按${activeMode.value.factorRequirement}选择因子`
  if (!indicatorCalculationMode.value) return '同一指标不能混用静态因子和时序因子'
  if (['简单比率型', '比值型'].includes(formulaMode.value) && numeratorFactors.value.length !== 1) return `${formulaMode.value}必须选择一个分子因子`
  if (['简单比率型', '比值型'].includes(formulaMode.value) && denominatorFactors.value.length !== 1) return `${formulaMode.value}必须选择一个分母因子`
  if (drillCapability.status !== 'ready' || drillCapability.formulaSignature !== formulaSignature(formula)) {
    return '请先对当前公式执行下钻能力预检'
  }
  return validateDrillSelection(drillCapability, selectedDrillPaths.value)
}

async function createFirstIndicatorVersionWithFormula(formula) {
  const versionPayload = buildIndicatorVersionPayload({
    drillPaths: selectedDrillPaths.value,
    formula,
    calculationMode: indicatorCalculationMode.value,
    dimensionGrain: indicatorDimensionGrain.value,
    factorDimensionBindings: activeFactorDimensionBindings(),
    dataOwnership: dataOwnership.value
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
    metadataResourceVersion: resolveMetadataResourceVersion(version, resolveResourceVersion(version)),
    formulaSaved: true,
    compiled: Boolean(version.currentArtifactId),
    taskId: '',
    batchId: '',
    displayValue: '',
    resultValue: '',
    published: false,
    publishedVersionId: '',
    publishIdempotencyKey: '',
    formalBatchId: '',
    formalIdempotencyKey: '',
    initializationBatchId: '',
    initializationStatus: ''
  })
  resetIndicatorTrialResultCollection()
  selectedDrillPaths.value = codeOnlyOrganizationPaths(normalizeDrillPaths(version))
  dataOwnership.value = version.dataOwnership ? { ...version.dataOwnership } : null
  factorDimensionBindings.value = version.factorDimensionBindings || version.drillConfig?.factorDimensionBindings || {}
  rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
  recordWorkflowSuccess(`首个指标版本及公式已保存：${versionId}`)
  try {
    const updated = await updateIndicator(indicatorWorkflow.indicatorId, createIndicatorMetadataPayload())
    applySavedIndicatorMetadata(updated, true)
    rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
  } catch (error) {
    throw new Error(`草稿版本和公式已创建，但定义、周期和来源保存失败：${error?.message || '请返回基础页重试保存'}`)
  }
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
    recordWorkflowSuccess(`公式校验状态：${compileStatus ? getStatusLabel(compileStatus) : '未知'}`)
    if (indicatorWorkflow.compiled) {
      ElMessage.success('公式校验通过')
    } else {
      ElMessage.warning(`公式校验状态：${compileStatus ? getStatusLabel(compileStatus) : '未知'}`)
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

  if (!isStaticIndicator.value && !hasIndicatorTrialPeriod.value) {
    ElMessage.warning('请选择完整的指标试算周期')
    return
  }

  const parameterMessage = validateSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value)
  if (parameterMessage) {
    ElMessage.warning(parameterMessage)
    return
  }

  workflowLoading.trial = true
  resetIndicatorTrialResultCollection()
  try {
    const trialPayload = isStaticIndicator.value ? {} : {
      periodStart: indicatorTrialPeriod.value[0],
      periodEnd: indicatorTrialPeriod.value[1]
    }
    if (indicatorRuntimeParameters.value.length) trialPayload.parameters = buildSqlRuntimeParameterValues(indicatorRuntimeParameters.value, indicatorRuntimeParameterValues.value)
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

async function trialIndicatorAndLoadResult() {
  if (!indicatorWorkflow.compiled) {
    ElMessage.warning('请先完成公式校验')
    return
  }

  if (indicatorWorkflow.batchId && !indicatorTrialResultsLoaded.value) {
    await loadIndicatorTrialResultOnly()
    return
  }

  await trialIndicatorOnly()
  if (indicatorWorkflow.batchId) await loadIndicatorTrialResultOnly()
}

function resetIndicatorTrialAfterPeriodChange() {
  indicatorWorkflow.taskId = ''
  indicatorWorkflow.batchId = ''
  indicatorWorkflow.formalBatchId = ''
  indicatorWorkflow.formalIdempotencyKey = ''
  resetIndicatorTrialResultCollection()
}

function resetIndicatorTrialResultCollection() {
  indicatorTrialResultSet.value = { targets: [] }
  indicatorTrialTargets.value = []
  selectedIndicatorTrialTargetKey.value = ''
  indicatorTrialResultsLoaded.value = false
  indicatorWorkflow.displayValue = ''
  indicatorWorkflow.resultValue = ''
  indicatorWorkflow.trialAvailability = null
}

function indicatorTrialTargetLabel(target) {
  if (target.pathCode === 'TIME') return drillLevelLabel(target.levelCode)
  const path = drillPathLabel(target.pathCode)
  const level = drillLevelLabel(target.levelCode)
  return path === '-' ? level : `${path} · ${level}`
}

function indicatorTrialResultValue(row) {
  return row?.displayValue ?? row?.resultValue ?? '-'
}

function openIndicatorAnalysis() {
  const query = {
    indicator: indicatorWorkflow.indicatorId,
    indicatorVersionId: indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId,
    ...(isStaticIndicator.value ? { granularity: 'STATIC' } : {})
  }
  if (!isStaticIndicator.value && hasIndicatorTrialPeriod.value) {
    query.periodStart = indicatorTrialPeriod.value[0]
    query.periodEnd = indicatorTrialPeriod.value[1]
    rememberAnalysisPeriod(query.indicator, query.indicatorVersionId, indicatorTrialPeriod.value)
  }
  router.push({ path: '/analysis', query })
}

async function generateFormalResultAndOpenAnalysis() {
  if (!indicatorWorkflow.published) {
    ElMessage.warning('请先发布指标版本')
    return
  }
  if (!hasIndicatorTrialPeriod.value) {
    ElMessage.warning('请选择需要查看的正式结果周期')
    return
  }

  workflowLoading.formal = true
  const versionId = indicatorWorkflow.publishedVersionId || indicatorWorkflow.versionId
  const [periodStart, periodEnd] = indicatorTrialPeriod.value
  try {
    try {
      const existing = await fetchIndicatorAnalysis(indicatorWorkflow.indicatorId, {
        indicatorVersionId: versionId,
        periodStart,
        periodEnd,
        granularity: 'MONTHLY'
      })
      if (existing?.dataAvailable && (existing?.overview || existing?.dimensionComparison?.length)) {
        openIndicatorAnalysis()
        return
      }
    } catch {
      // 当前周期尚无已激活正式结果，继续创建正式计算批次。
    }

    const payload = {
      ownerType: 'INDICATOR',
      ownerVersionId: versionId,
      batchType: 'FULL',
      periodStart,
      periodEnd
    }
    const idempotencyKey = indicatorWorkflow.formalIdempotencyKey ||
      (indicatorWorkflow.formalIdempotencyKey = createIdempotencyKey(`indicator-full-${versionId}`))
    recordWorkflowRequest({
      step: '生成指定周期正式结果',
      endpoint: '/api/v1/calc/batches',
      versionId,
      idempotencyKey,
      requestBody: payload
    })
    const accepted = await createCalcBatch(payload, idempotencyKey)
    const batchId = resolveBatchId(accepted)
    if (!batchId) throw new Error('后端未返回正式计算批次 ID')
    indicatorWorkflow.formalBatchId = batchId
    const batch = await pollBackendBatch(batchId)
    const status = batch.status || batch.batchStatus
    if (!['SUCCEEDED', 'PARTIAL_SUCCEEDED'].includes(status)) {
      throw new Error(`正式计算尚未成功，当前状态：${getStatusLabel(status || 'UNKNOWN')}`)
    }
    recordWorkflowSuccess(`指定周期正式结果已生成，批次 ${batchId}`)
    ElMessage.success('正式结果已生成，正在进入指标分析')
    openIndicatorAnalysis()
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.error(error?.message || '生成正式指标结果失败')
  } finally {
    workflowLoading.formal = false
  }
}

async function loadIndicatorTrialResultOnly() {
  if (!indicatorWorkflow.batchId) {
    ElMessage.warning('请先发起指标试算')
    return
  }

  const versionId = indicatorWorkflow.versionId
  const batchId = indicatorWorkflow.batchId
  workflowLoading.result = true
  try {
    recordWorkflowRequest({
      step: '查看结果',
      endpoint: `/api/v1/indicator-versions/${indicatorWorkflow.versionId}/trials/${indicatorWorkflow.batchId}/results?page=1&size=100`,
      versionId: indicatorWorkflow.versionId
    })
    const batch = await pollBackendBatch(indicatorWorkflow.batchId)
    const batchStatus = batch.status || batch.batchStatus
    if (!['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED', 'CANCELED'].includes(batchStatus)) {
      recordWorkflowSuccess(`试算批次仍在处理中：${batchStatus ? getStatusLabel(batchStatus) : '未知'}`)
      ElMessage.info('试算仍在处理中，请稍后再查看结果')
      return
    }
    const resultSet = await fetchIndicatorTrialResults(versionId, batchId)
    if (versionId !== indicatorWorkflow.versionId || batchId !== indicatorWorkflow.batchId) return
    indicatorWorkflow.trialAvailability = resolveResultAvailability({ ...resultSet, batchStatus })
    const normalized = normalizeIndicatorTrialResults(resultSet)
    indicatorTrialResultSet.value = normalized
    indicatorTrialTargets.value = normalized.targets
    const defaultTarget = selectDefaultIndicatorTrialTarget(normalized.targets)
    selectedIndicatorTrialTargetKey.value = defaultTarget?.key || ''
    indicatorTrialResultsLoaded.value = true
    const compatibilityRecord = defaultTarget?.records?.[defaultTarget.records.length - 1]
    indicatorWorkflow.displayValue = compatibilityRecord?.displayValue ?? ''
    indicatorWorkflow.resultValue = compatibilityRecord?.resultValue ?? ''
    recordWorkflowSuccess(`试算结论：${getStatusLabel(indicatorWorkflow.trialAvailability.status)}`)
    if (indicatorWorkflow.trialAvailability.status === 'CALCULATION_ERROR') ElMessage.warning('试算失败，已展示源数据画像与错误详情')
    else ElMessage.success('试算结果已读取')
  } catch (error) {
    indicatorTrialResultsLoaded.value = false
    recordWorkflowError(error)
    ElMessage.error(error?.message || '试算结果读取失败')
  } finally {
    workflowLoading.result = false
  }
}

async function loadIndicatorTrialPage(page) {
  if (workflowLoading.result || !selectedIndicatorTrialTarget.value) return
  const versionId = indicatorWorkflow.versionId
  const batchId = indicatorWorkflow.batchId
  const key = selectedIndicatorTrialTargetKey.value
  const size = selectedIndicatorTrialTarget.value.pageSize
  workflowLoading.result = true
  try {
    const normalized = normalizeIndicatorTrialResults(await fetchIndicatorTrialResults(versionId, batchId, page, size))
    if (versionId !== indicatorWorkflow.versionId || batchId !== indicatorWorkflow.batchId) return
    const target = normalized.targets.find(item => item.key === key)
    if (!target) throw new Error('该计算目标的结果暂不可用，请重新读取')
    indicatorTrialTargets.value = indicatorTrialTargets.value.map(item => item.key === key ? target : item)
  } catch (error) {
    ElMessage.error(error?.message || '试算结果翻页失败，请重试')
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
    if (form.policyDrafts.length) await retryPolicySources()
    ElMessage.success('指标版本已发布')
    return
  }

  workflowLoading.publish = true
  try {
    try { await policyPanel.value?.validateSources() } catch (error) { await focusPolicySource(); throw error }
    if (!policySourceState.count) { await focusPolicySource(); throw new Error('请选择至少一份政策文件来源') }
    try { await formRef.value?.validate() } catch { activeTab.value = 'basic'; throw new Error('请先完善指标基本信息') }
    if (basicMetadataSignature() !== savedBasicSignature && !await saveIndicatorBasicInfo()) return
    const ready = await ensureIndicatorPublishPrerequisites()
    if (!ready) return
    await refreshIndicatorVersionState()
    if (indicatorWorkflow.published) {
      await nextTick()
      await retryPolicySources()
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
    indicatorWorkflow.initializationBatchId = isStaticIndicator.value ? resolveBatchId(result?.initializationBatchId || result) : ''
    indicatorWorkflow.initializationStatus = indicatorWorkflow.initializationBatchId ? 'RUNNING' : ''
    indicatorWorkflow.published = true
    indicatorWorkflow.publishedVersionId = resolveIndicatorVersionId(result) || indicatorWorkflow.versionId
    await nextTick()
    await retryPolicySources()
    recordWorkflowSuccess(isStaticIndicator.value && indicatorWorkflow.initializationBatchId ? `静态指标版本已发布，正在初始化批次 ${indicatorWorkflow.initializationBatchId}` : `指标版本已发布：${indicatorWorkflow.publishedVersionId}`)
    ElMessage.success(isStaticIndicator.value ? '静态指标已发布，正在执行一次全量初始化' : '指标版本已发布')
    if (isStaticIndicator.value && indicatorWorkflow.initializationBatchId) {
      try {
        const initialization = await pollBackendBatch(indicatorWorkflow.initializationBatchId)
        indicatorWorkflow.initializationStatus = String(initialization?.status || initialization?.batchStatus || 'RUNNING').toUpperCase()
        if (['SUCCEEDED', 'SUCCESS'].includes(indicatorWorkflow.initializationStatus)) {
          recordWorkflowSuccess(`静态指标初始化完成，批次 ${indicatorWorkflow.initializationBatchId}`)
          ElMessage.success('静态指标全量初始化已完成')
        } else if (indicatorWorkflow.initializationStatus === 'FAILED') {
          recordWorkflowSuccess(`静态指标已发布，但初始化批次 ${indicatorWorkflow.initializationBatchId} 执行失败；请前往计算任务中心查看节点诊断`)
          ElMessage.warning('静态指标已发布，但全量初始化批次执行失败')
        } else {
          recordWorkflowSuccess(`静态指标已发布，初始化批次 ${indicatorWorkflow.initializationBatchId} 仍在执行，可前往计算任务中心继续跟踪`)
        }
      } catch (initializationError) {
        recordWorkflowSuccess(`静态指标已发布，初始化批次 ${indicatorWorkflow.initializationBatchId} 暂未查询到终态：${initializationError?.message || '请稍后重试'}`)
      }
    }
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.error(error?.message || '指标版本发布失败')
  } finally {
    workflowLoading.publish = false
  }
}

async function persistIndicatorFormula() {
  const formulaPayload = createIndicatorFormulaPayload(indicatorWorkflow.resourceVersion)
  formulaPayload.dimensionGrain = normalizeDimensionGrain(indicatorDimensionGrain.value)
  formulaPayload.drillPaths = serializeDrillPaths(selectedDrillPaths.value)
  formulaPayload.factorDimensionBindings = activeFactorDimensionBindings()
  if (dataOwnership.value) formulaPayload.dataOwnership = { ...dataOwnership.value }
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
  selectedDrillPaths.value = codeOnlyOrganizationPaths(normalizeDrillPaths(savedFormula))
  dataOwnership.value = savedFormula.dataOwnership ? { ...savedFormula.dataOwnership } : null
  factorDimensionBindings.value = savedFormula.factorDimensionBindings || savedFormula.drillConfig?.factorDimensionBindings || {}
  indicatorWorkflow.formulaSaved = true
  indicatorWorkflow.compiled = false
  resetIndicatorTrialAfterPeriodChange()
  recordWorkflowSuccess('保存公式成功')
}

function activeFactorDimensionBindings() {
  return activeSourceBindings(factorDimensionBindings.value, dimensionBindingFactors.value, customGroupingFields.value)
}

function invalidateGroupingConfiguration() {
  drillCapabilityRequestId += 1
  drillCapability.status = drillCapability.dimensions.length ? 'stale' : 'idle'
  drillCapability.formulaSignature = ''
  if (indicatorWorkflow.versionId && !indicatorWorkflow.published) {
    indicatorWorkflow.formulaSaved = false
    indicatorWorkflow.compiled = false
    resetIndicatorTrialAfterPeriodChange()
  }
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
  if (!hasIndicatorTrialResults.value) {
    await loadIndicatorTrialResultOnly()
    if (!hasIndicatorTrialResults.value) return false
  }
  if (['FAILED', 'CANCELLED', 'CANCELED'].includes(indicatorWorkflow.trialAvailability?.executionStatus) || indicatorWorkflow.trialAvailability?.status === 'CALCULATION_ERROR') {
    ElMessage.warning('本次试算未成功，请返回第 2 页处理后重新试算')
    return false
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
  if (Array.isArray(latest.factorRuntimeParameters)) indicatorRuntimeParameterGroups.value = latest.factorRuntimeParameters
  return latest
}

function isOptimisticLockError(error) {
  return error?.status === 409 || /已被修改|乐观锁|resourceVersion/i.test(error?.message || '')
}

function createIndicatorFormulaPayload(resourceVersion) {
  if (unsupportedFormula.value) throw new Error('当前公式不支持在此编辑，请保留原定义或通过原创建方式修改')
  if (!formulaValid.value) throw new Error(`请按${activeMode.value.factorRequirement}选择已发布因子`)
  if (savedFormulaDefinition.value && savedEditorFormulaSignature.value === editorFormulaSignature()) {
    if (savedFormulaDefinition.value.root?.nodeType !== 'STATISTIC') return { resourceVersion, formula: JSON.parse(JSON.stringify(savedFormulaDefinition.value)) }
  }
  if (activeMode.value.kind === 'advanced') {
    return { resourceVersion, formula: buildArithmeticFormula(advancedFormulaRoot.value, advancedFormulaPayload.value) }
  }
  const factorRef = (factor, index) => ({ nodeId: `factor_${index}_${factor.versionId}`, nodeType: 'FACTOR_REF', factorVersionId: String(factor.versionId) })
  const combine = (factors, operator, prefix) => combineFormulaNodes(
    factors.map((factor, index) => factorRef(factor, `${prefix}_${index}`)),
    operator,
    prefix
  )
  const left = combine(numeratorFactors.value, 'ADD', 'left')
  let root
  if (activeMode.value.kind === 'add') root = left
  else if (activeMode.value.kind === 'statistic') root = { nodeId: 'statistic_root', ...createStatisticFunction(statisticOperator.value, numeratorFactors.value.map((factor, index) => factorRef(factor, `stat_${index}`))) }
  else {
    const right = combine(denominatorFactors.value, 'ADD', 'right')
    const operator = activeMode.value.kind === 'custom' ? customOperator.value : 'DIV'
    root = { nodeId: 'formula_root', nodeType: 'BINARY', operator, left, right, ...(operator === 'DIV' ? { zeroDenominatorPolicy: zeroPolicy(zeroStrategy.value) } : {}) }
  }
  const percent = activeMode.value.multiplier === '100%'
  return {
    resourceVersion,
    formula: {
      schemaVersion: '1.0',
      astType: 'INDICATOR_FORMULA',
      root,
      display: { scale: 2, roundingMode: 'HALF_UP', ...savedFormulaDisplay.value, format: percent ? 'PERCENT' : 'DECIMAL', multiplier: percent ? '100' : '1' }
    }
  }
}

function createIndicatorMetadataPayload({ includeVersionMetadata = true } = {}) {
  const categoryPath = syncCategorySelection(form.categoryPath)
  return {
    resourceVersion: indicatorWorkflow.masterResourceVersion,
    name: form.name,
    shortName: form.shortName,
    attribute: form.attribute,
    unit: form.unit,
    direction: form.direction,
    category: categoryPath[categoryPath.length - 1] || '',
    categoryMain: categoryPath[0] || '',
    categorySub: categoryPath[1] || '',
    description: form.definition || null,
    ...(includeVersionMetadata ? {
      metadataVersionId: indicatorWorkflow.metadataVersionId || indicatorWorkflow.versionId,
      metadataResourceVersion: indicatorWorkflow.metadataVersionId === indicatorWorkflow.versionId
      ? indicatorWorkflow.resourceVersion : indicatorWorkflow.metadataResourceVersion,
      definition: form.definition || null,
      meaning: form.significance || null,
      calculationDescription: unsupportedFormula.value ? savedCalculationDescription.value : (formulaValid.value ? formulaPreview.value : null),
      statisticalPeriod: toApiStatisticalPeriod(form.period),
      dataSources: buildIndicatorDataSources(form.sources, savedDataSources.value)
    } : {})
  }
}

function indicatorEditorStorageKey(indicatorId) {
  return `idmp:indicator-editor-form:${indicatorId}`
}

function basicMetadataSignature() {
  return JSON.stringify([form.name, form.categoryPath, form.definition, form.significance, form.period, form.sources])
}

function rememberIndicatorEditorForm(indicatorId, openFormula = false) {
  if (!indicatorId) return
  try {
    sessionStorage.setItem(indicatorEditorStorageKey(indicatorId), JSON.stringify({
      form: { ...form, categoryPath: [...form.categoryPath], sources: [...form.sources] },
      policyDraftVersionId: String(indicatorWorkflow.versionId || ''),
      openFormula
    }))
    policyCacheWarningShown = false
  } catch {
    if (form.policyDrafts.length && !policyCacheWarningShown) {
      policyCacheWarningShown = true
      ElMessage.warning('浏览器无法暂存政策来源，当前选择仅保留在页面内，请勿刷新或关闭页面')
    }
  }
}

function restoreIndicatorEditorForm() {
  const indicatorId = indicatorWorkflow.indicatorId || (!isNew.value && routeIndicatorKey.value)
  if (!indicatorId) return
  try {
    const saved = JSON.parse(sessionStorage.getItem(indicatorEditorStorageKey(indicatorId)) || 'null')
    if (!saved?.form) return
    form.policyDrafts = restorePolicyDrafts(saved, indicatorWorkflow.versionId)
    if (!indicatorWorkflow.versionId) {
      const persistedCode = indicatorWorkflow.indicatorId ? form.code : ''
      const persistedPresentation = indicatorWorkflow.indicatorId
        ? Object.fromEntries(['shortName', 'attribute', 'unit', 'direction'].map(key => [key, form[key]])) : null
      const savedForm = { ...saved.form }
      delete savedForm.policies
      delete savedForm.policyDrafts
      Object.assign(form, savedForm)
      if (persistedCode) form.code = persistedCode
      if (persistedPresentation) Object.assign(form, persistedPresentation)
      syncCategorySelection(form.categoryPath)
    }
    if (saved.openFormula) activeTab.value = 'formula'
  } catch { /* Ignore invalid or unavailable session data and use the backend response. */ }
}

watch(() => form.policyDrafts, () => { if (policyCacheReady && indicatorWorkflow.indicatorId) rememberIndicatorEditorForm(indicatorWorkflow.indicatorId) }, { deep: true })

async function retryPolicySources() {
  try {
    const saved = await policyPanel.value?.syncPendingSources()
    if (saved === false) throw new Error('指标版本已切换')
    rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
    return true
  } catch (error) {
    rememberIndicatorEditorForm(indicatorWorkflow.indicatorId)
    ElMessage.error(`指标已发布，但政策来源未全部保存：${error.message}。请在第 6 页重试。`)
    return false
  }
}

function initialIndicatorTrialPeriod() {
  return route.query.periodStart && route.query.periodEnd
    ? [String(route.query.periodStart), String(route.query.periodEnd)]
    : []
}

function rememberAnalysisPeriod(indicatorId, versionId, range) {
  if (typeof localStorage === 'undefined' || !Array.isArray(range) || range.length !== 2) return
  const payload = { periodStart: String(range[0]), periodEnd: String(range[1]) }
  if (indicatorId) localStorage.setItem(`idmp:analysis-period:indicator:${indicatorId}`, JSON.stringify(payload))
  if (versionId) localStorage.setItem(`idmp:analysis-period:version:${versionId}`, JSON.stringify(payload))
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
  if (typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'bigint') return toOpaqueId(payload)
  return toOpaqueId(
    payload?.batchId ??
    payload?.calcBatchId ??
    payload?.batch?.id ??
    payload?.batch?.batchId
  )
}


function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.records)) return payload.records
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  return []
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
    recordWorkflowSuccess(`试算任务状态：${task.status ? getStatusLabel(task.status) : '未知'}，批次：${indicatorWorkflow.batchId}`)
    if (task.status === 'SUCCEEDED') {
      ElMessage.success('指标试算已完成，可以查看结果')
    } else if (['FAILED', 'CANCELED', 'CANCELLED'].includes(task.status)) {
      ElMessage.warning(`指标试算任务状态：${getStatusLabel(task.status)}`)
    }
  } catch (error) {
    recordWorkflowError(error)
    ElMessage.warning('试算已提交，但任务状态轮询失败，请稍后点击查看结果或检查任务中心')
  }
}

onMounted(async () => {
  await loadPublishedFactorVersions()
  await loadIndicatorForEdit()
  restoreIndicatorEditorForm()
  await nextTick()
  policyCacheReady = true
  savedBasicSignature = basicMetadataSignature()
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 16px;
}

.publish-gates {
  padding: 18px;
}

.publish-action-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 18px;
}

.publish-action-content {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
}

.publish-action-content :deep(.state-panel) {
  width: 100%;
}

.publish-actions {
  align-items: flex-end;
}

.publish-actions small {
  overflow-wrap: anywhere;
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

.indicator-trial-period {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 16px 14px;
  padding: 12px 14px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 8px;
  background: var(--idmp-layer-02);

  > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  strong {
    color: var(--idmp-text-primary);
    font-size: 14px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }
}

.indicator-runtime-parameters {
  display: grid;
  gap: 12px;
  margin: 0 16px 14px;
  padding: 14px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 8px;
  background: var(--idmp-layer-02);
}

.indicator-runtime-parameters__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.indicator-runtime-parameters__heading strong { color: var(--idmp-text-primary); font-size: 14px; }
.indicator-runtime-parameters__heading small { color: var(--idmp-text-helper); font-size: 12px; }

.drill-capability-card {
  margin: 16px;
  padding: 14px 16px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 8px;
  background: var(--idmp-layer-02);
}

.drill-capability-card .drill-config-card__heading p {
  margin: 5px 0 0;
  color: var(--idmp-text-helper);
  font-size: 12px;
  line-height: 18px;
}

.drill-capability-actions {
  margin: 12px 0;
}

.drill-capability-coverage {
  margin: 12px 0 8px;
  color: var(--idmp-text-helper);
  font-size: 12px;
}

.grouping-section { min-width: 0; margin-bottom: 24px; }
.grouping-section + .grouping-section { border-top: 1px solid var(--idmp-border-subtle); padding-top: 20px; }
.grouping-section :deep(.custom-paths) { margin: 0; }
.grouping-section__title { display: flex; align-items: center; min-height: 32px; margin: 0 0 12px; font-size: 15px; font-weight: 600; line-height: 22px; color: var(--idmp-text-primary); }
.grouping-section > .bindings { padding-left: 12px; }
.custom-drill-validation { padding-left: 12px; margin-top: 16px; min-width: 0; }
.custom-drill-validation h4 { margin: 0; font-size: 13px; font-weight: 600; line-height: 20px; color: var(--idmp-text-secondary); }
.drill-validation-actions { display: flex; justify-content: flex-end; margin: 10px 0; }

.workflow-trial-results {
  margin: 0 16px 16px;
  padding: 14px;
  border: 1px solid var(--idmp-border-subtle);
  border-radius: 8px;
  background: var(--idmp-layer-01);
}

.workflow-trial-results__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 12px;
  gap: 10px 16px;

  > div:first-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  strong {
    color: var(--idmp-text-primary);
    font-size: 15px;
  }

  small {
    color: var(--idmp-text-helper);
    font-size: 12px;
  }
}

.indicator-trial-result-table strong {
  color: var(--idmp-interactive);
  font-size: 14px;
}

.workflow-trial-results__footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-top: 10px;
  gap: 8px 16px;
  color: var(--idmp-text-helper);
  font-size: 12px;
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

.formula-settings--top {
  margin: 0 0 16px;
  padding-top: 0;
  border-top: 0;
}

.formula-settings--operator {
  margin-top: 16px;
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
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--idmp-border-soft);

  .el-button {
    margin: 0;
  }
}

@media (max-width: 560px) {
  .factor-library__footer .el-button {
    padding-inline: 8px;
  }
}

.formula-preview {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--idmp-support-success);
  border-radius: 8px;
  background: var(--idmp-support-success-bg);

  > div:first-child {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 14px;

    span { color: var(--idmp-text-helper); }
    strong { color: var(--idmp-text-primary); }
  }
}

.advanced-formula-preview {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--idmp-border-soft);
  font-size: 13px;
  span { color: var(--idmp-text-helper); }
  strong { min-width: 0; font-weight: 500; overflow-wrap: anywhere; color: var(--idmp-text-primary); }
}

.advanced-display-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--idmp-border-soft);
  label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; color: var(--idmp-text-helper); }
  .el-select, .el-input, .el-input-number { width: 100%; min-width: 0; }
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
