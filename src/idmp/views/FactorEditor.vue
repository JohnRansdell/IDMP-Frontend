<template>
  <div class="idmp-page factor-editor">
  <PageHeader :title="pageTitle"><template #actions><div class="page-toolbar"><el-button :icon="ArrowLeft" @click="router.push('/factor')">返回列表</el-button><el-button type="primary" :loading="loading.save" :disabled="workflow.published || (!!unsupportedDsl && !isNativeSql) || !!periodConfigurationError || joins.some(item=>item.saving||item.configuring)" @click="saveFactor">{{ isCreate ? '保存因子定义' : '保存修改' }}</el-button></div></template></PageHeader>
  <el-alert v-if="periodConfigurationError" type="error" :closable="false" :title="periodConfigurationError" /><el-alert v-if="!isCreate" class="editor-alert" :type="unsupportedDsl && !isNativeSql ? 'warning' : 'info'" show-icon :closable="false" :title="workflow.published ? '当前版本已发布，计算口径只读。' : unsupportedDsl && !isNativeSql ? '该因子使用暂不支持的高级表达式，计算口径只读。' : workflow.message || '保存草稿后可继续完成编译、试算和发布。'" />
    <section class="surface-card editor-section">
      <div class="section-title"><span class="section-number">1</span><div><h2>基础信息</h2><p>填写因子的编码、名称和业务说明，保存后会生成可继续校验的因子草稿。</p></div></div>
      <el-form ref="basicFormRef" :model="basicForm" :rules="basicRules" :disabled="workflow.published || loading.save || loading.compile" label-width="88px">
        <el-row :gutter="16"><el-col :xs="24" :md="8"><el-form-item label="因子编码" prop="code"><el-input v-model.trim="basicForm.code" :disabled="!isCreate" maxlength="64" aria-label="因子编码" placeholder="自动生成，可在创建时修改" /></el-form-item></el-col><el-col :xs="24" :md="8"><el-form-item label="因子名称" prop="name"><el-input v-model.trim="basicForm.name" placeholder="请输入因子名称" /></el-form-item></el-col><el-col :xs="24" :md="8"><el-form-item label="业务分类"><el-input v-model.trim="basicForm.category" placeholder="如：医疗质量" /></el-form-item></el-col></el-row>
        <el-form-item label="说明"><el-input v-model.trim="basicForm.description" type="textarea" :rows="2" placeholder="说明因子的业务含义、统计口径或使用场景" /></el-form-item>
        <el-form-item label="因子类别" class="definition-kind-field">
          <el-radio-group v-if="isCreate && !template.templateId" v-model="definitionKind" class="definition-kind-selector" aria-label="因子定义方式">
            <el-radio-button label="SOURCE">原子因子</el-radio-button>
            <el-radio-button label="DERIVED">复合因子</el-radio-button>
          </el-radio-group>
          <strong v-else class="definition-kind-current" :class="{ 'is-derived': isDerived }" aria-label="当前因子类别">{{ isDerived ? '复合因子' : '原子因子' }}</strong>
        </el-form-item>
      </el-form>
      <div v-if="workflow.factorId || workflow.versionId" class="saved-summary"><span>因子 ID：<strong>{{ workflow.factorId || '-' }}</strong></span><span>版本 ID：<strong>{{ workflow.versionId || '-' }}</strong></span><span>保存状态：<strong>{{ getStatusLabel(workflow.status || 'DRAFT') }}</strong></span></div>
    </section>
    <DerivedFactorEditor v-if="isDerived" ref="derivedEditorRef" :model-value="derivedDsl" :auto-configure="isCreate" :domains="domains" @update:model-value="updateDerivedDefinition" :disabled="workflow.published || loading.save || loading.compile" />
    <section v-if="isNativeSql" class="surface-card editor-section" aria-label="SQL 计算口径">
      <div class="section-title"><span class="section-number">2</span><div><h2>SQL 计算口径</h2></div></div>
      <el-input v-model="unsupportedDsl.sqlTemplate" type="textarea" :rows="14" :readonly="workflow.published || loading.save || loading.compile" aria-label="原始 SQL" spellcheck="false" />
      <div v-if="dslForm.calculationMode === 'TEMPORAL'" class="time-binding"><span>统计周期字段</span><strong>{{ nativePeriodDisplay }}</strong></div>
    </section>
    <div v-if="!isDerived && !isNativeSql" :inert="workflow.published || !!unsupportedDsl || loading.save || loading.compile" :aria-disabled="workflow.published || !!unsupportedDsl">
    <section class="surface-card editor-section caliber-section"><div class="section-title"><span class="section-number">2</span><div><h2>计算口径配置</h2><p>按业务顺序选择数据来源、计算方式、筛选范围和输出粒度。</p></div></div><div class="caliber-preview"><span>当前口径</span><strong>{{ caliberDescription }}</strong></div><div class="form-block"><div class="block-title"><h3>第一步：从哪里取数？</h3></div>
      <el-form label-position="top">
        <el-form-item label="取数方式"><el-radio-group v-model="sourceMode" aria-label="取数方式" :disabled="workflow.published || !!unsupportedDsl || joins.some(item=>item.saving)" @change="handleSourceModeChange"><el-radio-button label="PHYSICAL">物理表取数</el-radio-button><el-radio-button label="DOMAIN">数据域取数</el-radio-button></el-radio-group></el-form-item>
        <el-row :gutter="18">
        <el-col v-if="sourceMode === 'DOMAIN'" :xs="24" :lg="12"><el-form-item label="数据域"><el-select v-model="dslForm.domainCode" aria-label="数据域" filterable clearable :loading="loading.domains" :disabled="workflow.published || !!unsupportedDsl || joins.some(item=>item.saving)" placeholder="请选择数据域" @change="handleDomainChange"><el-option v-for="domain in domains" :key="domain.code" :label="metadataOptionLabel(domain)" :value="domain.code" /></el-select></el-form-item></el-col>
        <el-col :xs="24" :lg="12"><el-form-item label="主物理表"><el-select v-model="dslForm.tableName" aria-label="主物理表" filterable clearable :loading="sourceTablesLoading" :disabled="(sourceMode === 'DOMAIN' && !dslForm.domainCode) || workflow.published || !!unsupportedDsl || joins.some(item=>item.saving)" :placeholder="sourceMode === 'DOMAIN' && !dslForm.domainCode ? '请先选择数据域' : '按物理表名称搜索'" @change="handleTableChange"><el-option v-for="table in tables" :key="table.tableName" :label="metadataOptionLabel({name:table.tableComment,code:table.tableName})" :value="table.tableName" /></el-select></el-form-item></el-col>
      </el-row></el-form><div class="join-config">
      <div class="join-config__head"><strong>关联数据表</strong><el-button :icon="Plus" :disabled="!dslForm.tableName || joins.length >= 2 || workflow.published || !!unsupportedDsl || joins.some(item=>item.saving)" @click="addJoin">添加关联表</el-button></div>
      <div v-if="!joins.length" class="join-empty">当前为单表因子</div>
      <div v-for="(join,index) in joins" :key="join.sourceAlias" class="join-row">
        <div class="join-order">{{ index + 1 }}</div>
        <div class="join-source"><span>从</span><strong>{{ sourceLabel(join.fromAlias) }}</strong></div>
        <el-radio-group v-if="!join.inline" class="join-mode" :model-value="join.configuring ? 'CREATE' : 'REUSE'" :disabled="join.saving || workflow.published || !!unsupportedDsl" aria-label="表关系配置方式" @update:model-value="setJoinMode(join,$event)">
          <el-radio label="REUSE">复用已有表关系</el-radio>
          <el-radio label="CREATE">创建并使用新表关系</el-radio>
        </el-radio-group>
        <div class="join-target"><span>关联到</span><strong>{{ join.targetTableName || join.tableName || '待配置' }}</strong><small v-if="join.relationId || join.inline">{{ join.joinType === 'LEFT' ? '左关联' : '内关联' }} · {{ (join.orientedCardinality || join.cardinality) === 'ONE_TO_ONE' ? '一对一' : '多对一' }}</small></div>
        <div class="join-row-actions">
          <el-button :icon="Delete" circle plain type="danger" title="删除关联表" :disabled="join.saving || workflow.published || !!unsupportedDsl" @click="removeJoin(index)" />
        </div>
        <div v-if="join.inline" class="physical-join-config">
          <el-select :model-value="join.tableName" filterable placeholder="关联物理表" aria-label="关联物理表" @update:model-value="selectRawJoinTable(join,index,$event)"><el-option v-for="table in sourceTables" :key="table.tableName" :value="table.tableName" :label="metadataOptionLabel({name:table.tableComment,code:table.tableName})" /></el-select>
          <el-select v-model="join.joinType" aria-label="关联方式"><el-option value="INNER" label="内关联" /><el-option value="LEFT" label="左关联" /></el-select>
          <el-select v-model="join.cardinality" aria-label="关联关系类型"><el-option value="MANY_TO_ONE" label="多对一" /><el-option value="ONE_TO_ONE" label="一对一" /></el-select>
          <div v-for="(key,keyIndex) in join.keys" :key="keyIndex" class="physical-join-keys">
            <el-select v-model="key.fromField" filterable placeholder="来源表关联字段" aria-label="来源表关联字段"><el-option v-for="field in fields.filter(item=>item.sourceAlias===join.fromAlias)" :key="field.physicalColumn" :value="field.physicalColumn" :label="field.label + '（' + field.physicalColumn + '）'" /></el-select><span>=</span>
            <el-select v-model="key.targetField" filterable placeholder="关联表字段" aria-label="关联表字段"><el-option v-for="field in join.fields" :key="field.physicalColumn" :value="field.physicalColumn" :label="field.label + '（' + field.physicalColumn + '）'" /></el-select>
            <el-button :icon="Delete" circle plain title="删除关联键" :disabled="join.keys.length===1" @click="join.keys.splice(keyIndex,1)" />
          </div>
          <el-button link :disabled="join.keys.length>=16" @click="join.keys.push({fromField:'',targetField:''})">添加关联键</el-button>
        </div>
        <div v-else-if="!join.configuring" class="join-reuse">
          <el-select :model-value="join.relationId" filterable :loading="loading.relations" :disabled="join.saving || workflow.published || !!unsupportedDsl" placeholder="请选择已有表关系" @update:model-value="selectExistingRelation(join,index,$event)">
            <el-option v-for="relation in eligibleRelations(join.fromAlias)" :key="relation.id" :label="relationOptionLabel(join.fromAlias,relation)" :value="relation.id" />
          </el-select>
        </div>
        <InlineTableRelationEditor v-if="join.editorOpened && sourceDescriptors[join.fromAlias]" v-show="join.configuring" :key="join.sourceAlias + ':' + sourceDescriptors[join.fromAlias].physicalTableBindingId" :source="sourceDescriptors[join.fromAlias]" :source-fields="fields.filter(field=>field.sourceAlias===join.fromAlias)" :domains="domains" @busy="join.saving=$event" @cancel="setJoinMode(join,'REUSE')" @applied="applyConfiguredRelation(join,index,$event)" />
      </div>
      <el-alert v-if="joins.length && !joins.every(isJoinComplete)" type="warning" :closable="false" show-icon title="请完成关联配置或选择已有表关系后再保存因子。" />
    </div><div class="time-binding"><div><span>统计周期字段</span><el-input v-if="dslForm.calculationMode === 'TEMPORAL' && unsupportedDsl?.definitionType === 'SQL'" :model-value="nativePeriodDisplay" readonly aria-label="统计周期物理字段" /><el-select v-else-if="dslForm.calculationMode === 'TEMPORAL'" v-model="dslForm.periodColumn" filterable clearable placeholder="请选择本因子的统计周期字段"><el-option v-for="field in periodFields" :key="field.code" :label="periodFieldOptionLabel(field)" :value="field.code" /></el-select><strong v-else>静态统计（不按周期限制）</strong></div><small v-if="dslForm.calculationMode === 'TEMPORAL' && unsupportedDsl?.definitionType !== 'SQL'">请按本因子的业务口径选择时间字段；编译后推荐的试算日期范围会使用该字段。</small></div></div></section>
    <section class="surface-card editor-section">
      <div class="section-title"><span class="section-number">3</span><div><h2>统计方式</h2><p>统计方式只选一种；分组维度可不选或多选，决定结果按什么粒度输出。</p></div></div>
      <div class="measure-cards"><button v-for="item in aggregationOptions" :key="item.value" type="button" class="measure-card" :class="{ active: dslForm.aggregation === item.value }" @click="selectAggregation(item.value)"><strong>{{ item.label }}</strong><span>{{ item.description }}</span></button></div>
      <el-form label-width="88px" class="measure-field">
        <el-form-item label="统计对象"><el-radio-group :model-value="aggregateExpression ? 'EXPRESSION' : 'FIELD'" @update:model-value="aggregateExpression = $event === 'EXPRESSION' ? { expressionType: 'FIELD', fieldCode: dslForm.fieldCode } : null"><el-radio label="FIELD">物理字段</el-radio><el-radio label="EXPRESSION">字段表达式</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="aggregateExpression" label="统计表达式"><FactorExpressionEditor v-model="aggregateExpression" :fields="fields" /></el-form-item>
        <el-form-item v-else :label="dslForm.aggregation === 'COUNT' ? '计数字段' : '统计字段'"><el-select v-model="dslForm.fieldCode" filterable clearable :placeholder="dslForm.aggregation === 'COUNT' ? '不选则统计全部记录；选择后仅统计该字段非空的记录' : '选择要聚合的数值或业务键'"><el-option v-for="field in aggregatableFields" :key="field.code" :label="fieldOptionLabel(field)" :value="field.code" /></el-select></el-form-item>
      </el-form>
      <el-form label-width="88px" class="group-by-form"><el-form-item label="分组维度"><el-select v-model="dslForm.groupBy" multiple collapse-tags filterable clearable :disabled="!dslForm.tableName" placeholder="不选表示统计总体"><el-option v-for="field in dimensionFields" :key="field.code" :label="fieldOptionLabel(field)" :value="field.code" /></el-select></el-form-item></el-form><div class="grain-hint">当前结果粒度：{{ grainDescription }}</div>
    </section>
    <section class="surface-card editor-section"><div class="section-title"><span class="section-number">4</span><div><h2>筛选范围</h2></div></div><div class="scope-mode"><el-radio-group v-model="scopeMode"><el-radio label="ALL">全部记录</el-radio><el-radio label="FILTERED" :disabled="!supportedFilterFields.length">显式筛选条件</el-radio></el-radio-group></div><FactorRuleBuilder v-if="scopeMode === 'FILTERED'" :model-value="filters" :fields="supportedFilterFields" @update="ruleVersion++" /><div class="rule-explanation"><strong>口径预览</strong><span>{{ filterPreview }}</span></div></section>
    </div>
    <section v-if="template.templateId" class="surface-card editor-section"><div class="section-title"><span class="section-number">5</span><div><h2>模板参数</h2><p>模板参数仅作为业务输入，保存时由后端实例化为最终 DSL。</p></div></div><el-form label-position="top"><el-form-item v-for="item in parameters" :key="item.code" :label="item.displayName || item.code"><el-date-picker v-if="String(item.dataType || item.type).includes('DATETIME')" v-model="parameterValues[item.code]" type="datetimerange" unlink-panels value-format="YYYY-MM-DDTHH:mm:ss" /><el-select v-else-if="item.valueSourceType === 'ENUM' || item.valueSourceType === 'VALUE_SET'" v-model="parameterValues[item.code]" filterable><el-option v-for="option in item.options || []" :key="option.value || option.code || option" :label="option.label || option.name || option" :value="option.value || option.code || option" /></el-select><el-input v-else v-model="parameterValues[item.code]" /></el-form-item></el-form></section>
    <section class="surface-card editor-section"><div class="section-title"><span class="section-number">{{ 5 + (template.templateId ? 1 : 0) }}</span><div><h2>计算模式</h2><p>时序因子按业务时间持续计算；静态因子只进行一次全量计算。</p></div></div><el-radio-group v-model="dslForm.calculationMode" :disabled="workflow.published || isNativeSql || loading.save || loading.compile"><el-radio label="TEMPORAL">时序</el-radio><el-radio label="STATIC">静态</el-radio></el-radio-group><el-alert v-if="dslForm.calculationMode === 'STATIC'" type="info" :closable="false" title="静态因子试算不传周期，发布后只创建一次全量初始化计算。" /></section>
    <div class="editor-actions-bar"><span v-if="workflow.message">{{ workflow.message }}</span><span v-else>请完成配置后保存草稿，继续进入编译、试算与发布。</span><el-button type="primary" :loading="loading.save" :disabled="workflow.published || (!!unsupportedDsl && !isNativeSql)" @click="saveFactor">{{ isCreate ? '保存草稿并继续' : '保存修改并重新校验' }}</el-button></div>
    <section v-if="workflow.versionId" id="factor-workflow" ref="workflowSectionRef" tabindex="-1" aria-label="编译、试算与发布" class="surface-card editor-section workflow-section"><div class="section-title"><span class="section-number">{{ template.templateId ? 7 : 6 }}</span><div><h2>编译、试算与发布</h2><p v-if="dslForm.calculationMode === 'TEMPORAL'">先确认本次试算周期，再编译校验、试算和发布。编译后也可使用推荐周期。</p><p v-else>依次完成编译校验、试算和发布；静态因子无需选择试算周期。</p></div><el-tag :type="workflow.published ? 'success' : 'info'">{{ getStatusLabel(workflow.status || 'DRAFT') }}</el-tag></div><el-steps :active="workflowActiveStep" finish-status="success" simple class="workflow-steps"><el-step title="保存草稿" /><el-step title="编译校验" /><el-step title="试算验证" /><el-step title="版本发布" /></el-steps>
      <div v-if="$can('POST', '/factor-versions/1/trial') && workflow.versionId && dslForm.calculationMode === 'TEMPORAL'" class="trial-period trial-period-card"><div><strong>本次试算周期</strong><small>可先手动选择周期；未选择时，编译通过后会自动填入推荐周期。已手选的周期不会被覆盖。区间按 [开始时间，结束时间) 计算。</small></div><div v-if="loading.recommendation" class="trial-recommendation"><el-tag type="info">正在获取后端推荐周期</el-tag><span>根据已编译因子和真实匹配数据探测中，不会创建试算任务。</span></div><div v-else-if="trialRecommendation?.availabilityStatus === 'AVAILABLE'" class="trial-recommendation"><el-tag :type="trialPeriodSource === 'USER' ? 'warning' : 'success'">{{ trialPeriodSource === 'USER' ? '用户自定义' : '后端推荐' }}</el-tag><span>数据覆盖：{{ trialRecommendation.earliestDataDate || '—' }} 至 {{ trialRecommendation.latestDataDate || '—' }}；预计匹配 {{ trialRecommendation.estimatedMatchedRecordCount ?? '—' }} 条 / 目标 {{ trialRecommendation.targetMaxRecordCount ?? '—' }} 条。</span><el-button v-if="trialPeriodSource === 'USER'" link type="primary" @click="restoreRecommendedTrialPeriod">恢复推荐周期</el-button></div><el-alert v-if="trialRecommendation?.targetExceeded" title="推荐窗口已尽量缩短，但预计匹配记录数仍超过目标上限；可缩短周期或增加筛选条件。" type="warning" :closable="false" class="trial-recommendation-alert" /><el-alert v-if="trialRecommendation?.availabilityStatus === 'NO_DATA'" title="当前因子过滤条件下没有匹配源数据，后端未生成推荐周期；仍可手动选择周期进行验证。" type="warning" :closable="false" class="trial-recommendation-alert" /><el-alert v-if="trialRecommendationError" :title="trialRecommendationError" type="warning" :closable="false" class="trial-recommendation-alert"><template #default><el-button link type="primary" @click="loadTrialRecommendation({ applyDefault: false })">重新获取推荐周期</el-button></template></el-alert><el-date-picker v-model="trialPeriod" type="datetimerange" unlink-panels value-format="YYYY-MM-DDTHH:mm:ss" start-placeholder="开始时间" end-placeholder="结束时间" @change="onTrialPeriodChange" /></div>
      <div class="workflow-actions"><el-button type="primary" :loading="loading.compile" :disabled="workflow.published" @click="compileCurrentVersion">编译并校验</el-button><el-button :loading="loading.trial || loading.result || loading.recommendation" :disabled="!workflow.compiled || workflow.published || loading.recommendation || runtimeSchemaLoading || !!runtimeSchemaError" v-access="'factorVersion.trial'" @click="trialCurrentVersion">{{ trialButtonLabel }}</el-button><el-button type="success" :loading="loading.publish" :disabled="!canPublish" v-access="'factorVersion.publish'" @click="publishCurrentVersion">发布因子版本</el-button></div><div class="workflow-identity"><div><span>因子 ID</span><strong>{{ workflow.factorId }}</strong></div><div><span>版本 ID</span><strong>{{ workflow.versionId }}</strong></div><div><span>编译产物</span><strong>{{ workflow.artifactId || '-' }}</strong></div><div><span>试算批次</span><strong>{{ workflow.batchId || '-' }}</strong></div></div><div v-if="workflow.taskId" class="workflow-feedback"><span>任务 ID：{{ workflow.taskId }}</span><span>任务状态：<el-tag size="small">{{ getStatusLabel(workflow.taskStatus || 'QUEUED') }}</el-tag></span><el-button v-if="!isTerminalTask" link type="primary" :loading="loading.status" @click="refreshTrialStatus">刷新状态</el-button></div><el-alert v-if="workflow.message" :title="workflow.message" :type="workflow.messageType" :closable="false" show-icon class="workflow-alert"><template #default><el-button v-if="!workflow.compiled && ['error', 'warning'].includes(workflow.messageType)" link type="primary" @click="technicalInfoRef?.open()">查看排查信息</el-button></template></el-alert><div v-if="trialRows.length" class="trial-results"><div class="result-head"><h3>试算结果</h3><span>共 {{ trialPagination.total }} 条</span></div><el-table :data="trialRows" size="small" border><el-table-column type="index" label="#" width="54" /><el-table-column label="维度" min-width="220"><template #default="{ row }"><span class="mono-data">{{ formatDimensions(row) }}</span></template></el-table-column><el-table-column label="结果值" min-width="130"><template #default="{ row }">{{ resultValue(row) }}</template></el-table-column><el-table-column label="质量状态" width="120"><template #default="{ row }">{{ (row.qualityStatus || workflow.qualityStatus) ? getStatusLabel(row.qualityStatus || workflow.qualityStatus) : '-' }}</template></el-table-column></el-table><el-pagination :current-page="trialPagination.page" :page-size="trialPagination.size" :total="trialPagination.total" :disabled="loading.result" layout="total, prev, pager, next" @current-change="loadTrialResults" /></div><div v-if="workflow.published" class="published-next"><strong>因子版本已发布，可以进入下一步。</strong><span>后续创建指标时，请引用因子版本 ID {{ workflow.versionId }}。</span><el-button type="primary" v-access="'indicator.create'" @click="openIndicatorEditor">创建指标</el-button><el-button @click="router.push('/factor')">返回因子目录</el-button></div></section>
<section v-if="$can('POST', '/factor-versions/1/query') && workflow.compiled" class="surface-card editor-section" aria-label="因子即时查询">
      <h2 style="font-size:16px">运行参数与即时查询</h2>
      <RuntimeParameterFields v-model="runtimeValues" :declarations="runtimeDeclarations" :show-metadata="false" />
      <el-alert v-if="runtimeSchemaError" :title="runtimeSchemaError" type="error" :closable="false"><el-button size="small" @click="loadRuntimeDeclarations">重试读取参数</el-button></el-alert>
      <el-button :loading="queryLoading || runtimeSchemaLoading" :disabled="!!runtimeSchemaError" v-access="'factorVersion.query'" @click="queryCurrentVersion">即时查询</el-button>
      <el-table v-if="queryRows.length" :data="queryRows"><el-table-column label="维度" min-width="200"><template #default="{row}">{{ formatDimensions(row) }}</template></el-table-column><el-table-column label="结果值"><template #default="{row}">{{ resultValue(row) }}</template></el-table-column></el-table>
    </section>
    <FactorDependencyPanel v-if="workflow.versionId && workflow.compiled" :version-id="workflow.versionId" :artifact-id="workflow.artifactId" />
    <DslPreview ref="technicalInfoRef" :dsl="currentDsl" />
  </div>
</template>
<script setup>
import { useFactorVersionWorkflow } from '@/idmp/features/factor/useFactorVersionWorkflow.js'
import { toOpaqueId } from '@/idmp/utils/resourceId.js'

import { canRequest } from '@/idmp/auth/session'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import { fieldLabel, toUserMessage } from '@/idmp/utils/userMessage'
import { ArrowLeft, Delete, Plus } from '@element-plus/icons-vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import FactorRuleBuilder from '@/idmp/components/FactorRuleBuilder.vue'
import FactorExpressionEditor from '@/idmp/components/FactorExpressionEditor.vue'
import DslPreview from '@/idmp/components/DslPreview.vue'
import DerivedFactorEditor from '@/idmp/components/DerivedFactorEditor.vue'
import InlineTableRelationEditor from '@/idmp/components/InlineTableRelationEditor.vue'
import FactorDependencyPanel from '@/idmp/components/FactorDependencyPanel.vue'
import RuntimeParameterFields from '@/idmp/components/RuntimeParameterFields.vue'
import { newDerivedFactor } from '@/idmp/utils/derivedFactor'
import { inheritedFactorParameters } from '@/idmp/utils/factorRuntimeParameters'
import { queryFactorVersion } from '@/idmp/api/modules/factors'
import { buildSqlRuntimeParameterValues, validateSqlRuntimeParameterValues } from '@/idmp/api/adapters/sqlImport'
import { fetchDataDomains, fetchPhysicalTableFields, fetchPhysicalTableRelations, fetchPhysicalTables, fetchSourceTables, fetchSourceTableFields, fetchSourceTimeFieldOptions } from '@/idmp/api/modules/meta'
import { fetchSemanticFieldValueSet, fetchValueSetItems } from '@/idmp/api/modules/valueSets'
import { adaptDataDomainList, adaptSemanticFieldList, adaptPhysicalTableList, adaptSourceFieldList, adaptSourceTableList } from '@/idmp/api/adapters/meta'
import { adaptFactorPhysicalFields, adaptFactorSourceFields, isFactorPeriodField } from '@/idmp/api/adapters/factorMetadata'
import { resourceConflictEditorPath, resolveResourceConflict } from '@/idmp/api/adapters/resourceConflict'
import { compileFactorVersion, createFactor, fetchFactor, fetchCompileArtifact, fetchFactorTemplateParameterSchema, fetchFactorTrialPeriodRecommendation, fetchFactorTrialResults, fetchFactorVersion, fetchFactorVersionsByFactor, instantiateFactorTemplateVersion, publishFactorVersion, trialFactorVersion, updateFactor } from '@/idmp/api/modules/factors'
import { fetchAsyncTask } from '@/idmp/api/modules/calculation'
import { fieldByCode } from '@/idmp/utils/semanticField'
import { buildFactorDsl, hasUnsupportedFactorDslExpressions, validateFilterNode, validateExpression, editableFilterTree, describeFieldExpression } from '@/idmp/utils/dslBuilder'; import { factorCalculationMode, factorPeriodColumn, canonicalPeriodColumn, withoutLegacyPeriod } from '@/idmp/utils/factorPeriod'
import { normalizeTrialPeriodRecommendation, recommendationPeriod, resolveTrialPeriod } from '@/idmp/utils/trialPeriodRecommendation'
import { getStatusLabel } from '@/idmp/design/status'
import { newResourceCode } from '@/idmp/utils/resourceCode'
import { sqlPhysicalFieldLabel, sqlPhysicalFieldName } from '@/idmp/features/indicator/sqlImportFields'
// 保留页面不直接编辑的兼容字段，避免保存时丢失原有配置。
const definitionKind = ref('SOURCE')
const isDerived = computed(() => definitionKind.value === 'DERIVED')
const derivedDsl = ref(newDerivedFactor())
const derivedEditorRef = ref()
function updateDerivedDefinition(value) { derivedDsl.value = value; if (value.calculationMode) dslForm.calculationMode = value.calculationMode }
const runtimeDeclarations = ref([]), runtimeValues = ref({}), queryRows = ref([]), queryLoading = ref(false)
const currentCompileArtifact = ref(null)
const currentCompileArtifactId = ref(''), runtimeSchemaError = ref(''), runtimeSchemaLoading = ref(false)
const existingDslMissingRowPolicy = ref(null)
const aggregateExpression = ref(null)
const sourceTables = ref([])
const sourceTablesLoading = ref(false)
const sourceMode = ref('PHYSICAL')
const existingRuntimeParameters = ref([])
const unsupportedDsl = ref(null); const periodConfigurationError = ref('')
const isNativeSql = computed(() => unsupportedDsl.value?.definitionType === 'SQL')
const versionResourceVersion = ref(null)
const savedDefinition = ref('')
const definitionDirty = computed(() => !!savedDefinition.value && definitionSnapshot(currentDsl.value) !== savedDefinition.value)
function definitionSnapshot(dsl) {
  return JSON.stringify(dsl, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value)
}
const nativePeriodBinding = ref(null)
const nativePeriodLoading = ref(false)
const nativePeriodDisplay = computed(() => {
  if (nativePeriodLoading.value) return '正在读取物理字段'
  const binding = nativePeriodBinding.value
  if (binding?.physicalTable && binding?.physicalColumn) {
    return sqlPhysicalFieldName({ physicalTable: binding.physicalTable, columnName: binding.physicalColumn })
  }
  return dslForm.periodColumn ? '尚未确认物理表，请重新编译因子' : '未配置统计周期字段'
})
const route=useRoute();const router=useRouter();const basicFormRef=ref();const workflowSectionRef=ref();const technicalInfoRef=ref();const ruleVersion=ref(0);const isCreate=computed(()=>!route.params.id||route.params.id==='new');const pageTitle=computed(()=>isCreate.value?'因子编辑 / 新增因子':`因子编辑 / ${basicForm.name||route.params.id}`)
const basicForm=reactive({code:newResourceCode('FACTOR'),name:'',description:'',category:''});const dslForm=reactive({domainCode:'',tableName:'',baseAlias:'base',aggregation:'COUNT',fieldCode:'',groupBy:[],calculationMode:'TEMPORAL',periodColumn:''});const filters=reactive({nodeType:'AND',children:[]});const scopeMode=ref('ALL');const template=reactive({templateId:route.query.templateId||'',versionId:route.query.versionId||''});const parameters=ref([]);const parameterValues=reactive({});const domains=ref([]);const tables=ref([]);const fields=ref([]);const baseFields=ref([]);const joins=ref([]);const sourceDescriptors=reactive({});const relationOptions=reactive({});const metadataRequestVersion=ref(0);const recommendationRequestVersion=ref(0);const resourceVersion=ref(0);const loading=reactive({domains:false,template:false,save:false,compile:false,recommendation:false,trial:false,result:false,publish:false,status:false,relations:false});const trialPeriod=ref([]);const trialPeriodSource=ref('');const trialRecommendation=ref(null);const trialRecommendationError=ref('');const trialPagination=reactive({page:1,size:100,total:0});const trialRows=ref([]);const workflow=reactive({factorId:'',versionId:'',status:'',artifactId:'',compiled:false,taskId:'',batchId:'',taskStatus:'',qualityStatus:'',resultsLoaded:false,published:false,message:'',messageType:'info'});
const factorVersionWorkflow = useFactorVersionWorkflow({
  workflow, loading, trialRows, trialPagination, notify: ElMessage,
  api: { compile: compileFactorVersion, trial: trialFactorVersion, fetchTask: fetchAsyncTask,
    fetchResults: fetchFactorTrialResults, publish: publishFactorVersion },
  statusLabel: getStatusLabel, formatDiagnostics: formatCompileDiagnostics,
  async afterCompile(_, versionId) {
    const version = await fetchFactorVersion(versionId)
    if (workflow.versionId === versionId) versionResourceVersion.value = version.resourceVersion ?? version.version
    return version
  },
  async onCompiled() {
    if (isNativeSql.value) await loadNativePeriodBinding()
    await loadRuntimeDeclarations()
    await loadTrialRecommendation({ applyDefault: true })
  }
})
const aggregationOptions=[{value:'COUNT',label:'记录计数',description:'统计符合条件的记录行数'},{value:'COUNT_DISTINCT',label:'去重计数',description:'按患者、就诊或其他业务键去重计数'},{value:'SUM',label:'数值求和',description:'汇总金额、数量、天数等数值字段'},{value:'AVG',label:'平均值',description:'计算数值字段的平均值'},{value:'MIN',label:'最小值',description:'取数值或时间字段的最小值'},{value:'MAX',label:'最大值',description:'取数值或时间字段的最大值'}];const basicRules={code:[{required:true,message:'请输入因子编码',trigger:'blur'}],name:[{required:true,message:'请输入因子名称',trigger:'blur'}]};const currentDomainName=computed(()=>domains.value.find(x=>x.code===dslForm.domainCode)?.name||'未选择数据域');const currentTableName=computed(()=>tables.value.find(x=>x.tableName===dslForm.tableName)?.tableComment||dslForm.tableName);const aggregatableFields=computed(()=>fields.value.filter(field=>{if(field.aggregatable===false)return false;if(dslForm.aggregation==='COUNT_DISTINCT')return true;return ['SUM','AVG'].includes(dslForm.aggregation)?field.kind==='NUMBER':['MIN','MAX'].includes(dslForm.aggregation)?['NUMBER','DATETIME'].includes(field.kind):true}));const dimensionFields=computed(()=>fields.value.filter(field=>field.groupable !== false && ['CODE','STRING','VALUE_SET'].includes(field.kind)));const filterFields=computed(()=>fields.value.filter(field=>field.filterable !== false));const grainDescription=computed(()=>dslForm.groupBy.length?dslForm.groupBy.map(code=>fieldByCode(fields.value,code)?.label||code).join(' × '):'总体（不分组）');const currentDsl=computed(()=>isDerived.value?{...derivedDsl.value,calculationMode:dslForm.calculationMode}:unsupportedDsl.value||buildDsl());const ruleExplanation=computed(()=>{ruleVersion.value;if(scopeMode.value==='ALL')return '统计当前物理表中的全部记录（无筛选条件）';if(!filters.children?.length)return '尚未添加筛选条件';if(validateFilterNode(filters,[],fields.value).length)return '条件尚未完成，请先选择字段、判断方式和值';return describeNode(filters)});const workflowActiveStep=computed(()=>workflow.published?4:workflow.taskStatus==='SUCCEEDED'&&workflow.resultsLoaded?3:workflow.compiled?2:1);const isTerminalTask=computed(()=>['SUCCEEDED','SUCCESS','FAILED','CANCELED','CANCELLED','PARTIAL_SUCCEEDED'].includes(String(workflow.taskStatus).toUpperCase()));const canPublish=computed(()=>workflow.compiled&&['SUCCEEDED','SUCCESS'].includes(String(workflow.taskStatus).toUpperCase())&&workflow.resultsLoaded&&['PASSED','PASS',''].includes(String(workflow.qualityStatus||'').toUpperCase())&&!workflow.published&&!loading.publish);const trialButtonLabel=computed(()=>{if(loading.trial||loading.result)return '正在试算并读取结果';if(workflow.resultsLoaded)return '重新试算并查看结果';if(workflow.taskId&&!isTerminalTask.value)return '继续查询并查看结果';return '试算并查看结果'});
const periodFields=computed(()=>fields.value.filter(isFactorPeriodField))
function periodFieldOptionLabel(field) {
  const option = item => ({
    physicalTable: sourceDescriptors[item.sourceAlias]?.tableName || (item.sourceAlias === dslForm.baseAlias ? dslForm.tableName : ''),
    columnName: item.physicalColumn || item.code, fieldReference: item.code,
    columnType: fieldTypeLabel(item.kind || item.dataType), comment: item.label
  })
  const label = sqlPhysicalFieldLabel(option(field), periodFields.value.map(option))
  return field.periodRequiresConfirmation ? `${label} · 文本日期（抽样识别）` : label
}
async function loadNativePeriodBinding() {
  nativePeriodBinding.value = null
  if (!workflow.artifactId || !dslForm.periodColumn) return
  nativePeriodLoading.value = true
  const artifactId = workflow.artifactId
  try {
    const artifact = await fetchCompileArtifact(artifactId)
    if (workflow.artifactId === artifactId) { currentCompileArtifact.value = artifact; currentCompileArtifactId.value = artifactId; nativePeriodBinding.value = artifact.logicalPlan?.periodBinding || null }
  } catch { ElMessage.warning('暂时无法读取统计周期的物理字段映射，请稍后重试') }
  finally { nativePeriodLoading.value = false }
}
const supportedFilterFields=computed(()=>filterFields.value)
function filterChildren(node) { return node?.nodeType === 'NOT' ? filterChildren(node.child) : node?.children || [] }
const filterPreview=computed(()=>{ruleVersion.value;if(scopeMode.value==='ALL')return '统计当前物理表中的全部记录（无筛选条件）';if(!filterChildren(filters).length)return '请添加一条筛选条件';const errors=validateFilterNode(filters,[],fields.value);return errors[0]||describeNode(filters)})
const caliberDescription=computed(()=>{const aggregation=aggregationOptions.find(item=>item.value===dslForm.aggregation)?.label||'未选择统计方式';const selectedField=fieldByCode(fields.value,dslForm.fieldCode);const expression=aggregateExpression.value?describeFieldExpression(aggregateExpression.value,fields.value):'';const object=expression||selectedField?.label;const target=dslForm.aggregation==='COUNT'?(object?`${object}的非空值`:'全部记录'):object||'未选择统计字段';const scope=scopeMode.value==='ALL'?'全部记录':filterPreview.value;const joined=joins.value.filter(isJoinComplete).map(item=>item.targetTableName||item.tableName).join('、');const domain=dslForm.domainCode?`“${currentDomainName.value}”的`:'';return `从${domain}“${currentTableName.value||'未选择物理表'}”中${joined?`关联“${joined}”后`:''}，按${aggregation}统计${target}；业务范围：${scope}；结果粒度：${grainDescription.value}。`})
onMounted(async()=>{
  await loadDomains()
  if(template.templateId) await loadParameterSchema()
  if(!isCreate.value) await loadExisting()
  if(route.hash === '#factor-workflow') await focusWorkflow()
})
async function focusWorkflow() {
  await nextTick()
  const section = workflowSectionRef.value
  if (!section?.isConnected) return
  section.focus({ preventScroll: true })
  section.scrollIntoView({ behavior: 'instant', block: 'start' })
}
async function loadExisting() {
  try {
    const factor = await fetchFactor(route.params.id)
    basicForm.code = factor.code ?? factor.factorCode ?? basicForm.code
    basicForm.name = factor.name ?? factor.factorName ?? ''
    basicForm.description = factor.description ?? ''; basicForm.category = factor.category ?? ''
    resourceVersion.value = Number(factor.resourceVersion ?? factor.version ?? 0)
    const version = await loadLatestFactorVersion(factor)
    const dsl = version?.dsl ?? factor.dsl ?? factor.factorDsl ?? factor.latestVersion?.dsl ?? {}
    existingDslMissingRowPolicy.value = dsl.missingRowPolicy ?? null
    existingRuntimeParameters.value = dsl.parameters || []
    aggregateExpression.value = dsl.aggregation?.fieldExpression ? structuredClone(dsl.aggregation.fieldExpression) : null
    definitionKind.value = dsl.definitionKind === 'DERIVED' ? 'DERIVED' : 'SOURCE'
    if (isDerived.value) {
      derivedDsl.value = JSON.parse(JSON.stringify(dsl)); dslForm.calculationMode = factorCalculationMode(dsl)
      hydrateWorkflow(factor, version); unsupportedDsl.value = null; periodConfigurationError.value = ''
      savedDefinition.value = definitionSnapshot(currentDsl.value)
      if (workflow.compiled) { await loadRuntimeDeclarations(); await loadTrialRecommendation({ applyDefault: true }) }
      return
    }
    unsupportedDsl.value = dsl.definitionType === 'SQL' || hasUnsupportedFactorDslExpressions(dsl) ? dsl : null
    dslForm.calculationMode = factorCalculationMode(dsl); dslForm.periodColumn = factorPeriodColumn(dsl)
    dslForm.domainCode = dsl.primaryDomain?.domainCode ?? dsl.domainCode ?? ''
    sourceMode.value = dslForm.domainCode ? 'DOMAIN' : 'PHYSICAL'
    dslForm.tableName = dsl.primaryDomain?.tableName ?? dsl.primaryDomain?.semanticTableCode ?? ''
    dslForm.baseAlias = dsl.primaryDomain?.sourceAlias || 'base'
    joins.value = (dsl.joins || []).map((item, index) => ({ ...item, inline: !item.relationId && !!item.tableName, relationId: toOpaqueId(item.relationId), fromAlias: item.fromAlias || dslForm.baseAlias, sourceAlias: item.sourceAlias || `join${index + 1}`, fields: [] }))
    dslForm.aggregation = dsl.aggregation?.function ?? 'COUNT'; dslForm.fieldCode = fieldKey(dsl.aggregation?.fieldRef ?? dsl.aggregation?.fieldCode)
    dslForm.groupBy = (dsl.groupBy || []).map(fieldKey)
    Object.keys(filters).forEach(key => delete filters[key]); Object.assign(filters, toEditableFilterRoot(withoutLegacyPeriod(dsl.filters)))
    scopeMode.value = filters.children?.length ? 'FILTERED' : 'ALL'; hydrateWorkflow(factor, version)
    if (dsl.definitionType === 'SQL') await loadNativePeriodBinding(); else await loadTables(true)
    if (!isNativeSql.value) {
      try { canonicalPeriodColumn(dsl.periodColumn, dsl.filters, fields.value) } catch (error) { periodConfigurationError.value = error.message; throw error }
    }
    savedDefinition.value = definitionSnapshot(currentDsl.value)
    if (workflow.compiled) { await loadRuntimeDeclarations(); await loadTrialRecommendation({ applyDefault: true }) }
  } catch (e) { ElMessage.warning(e?.message || '因子详情读取失败') }
}
async function loadLatestFactorVersion(factor){
  const factorId=factor.id??factor.factorId??route.params.id
  const requested=toOpaqueId(route.query.factorVersionId)
  if(requested){
    const version=await fetchFactorVersion(requested)
    if(toOpaqueId(version?.factorId)!==toOpaqueId(factorId))throw new Error('所选版本不属于当前因子，请从指标公式重新进入。')
    return version
  }
  const versions = await fetchFactorVersionsByFactor(factorId)
  const rows = normalize(versions).sort((a, b) => Number(b.versionNo || 0) - Number(a.versionNo || 0))
  const preferred = rows.find(item => ['DRAFT', 'VALIDATED'].includes(item.publicationStatus || item.status)) || rows[0]
  const versionId = preferred?.id ?? preferred?.versionId
  return versionId ? fetchFactorVersion(versionId) : null
}
async function loadDomains(){
  loading.domains=true
  const initialTables=loadTables(!isCreate.value)
  try{domains.value=adaptDataDomainList(await fetchDataDomains()).filter(x=>x.code&&(x.status||'PUBLISHED')==='PUBLISHED')}
  catch(e){ElMessage.warning(e?.message||'数据域读取失败')}
  finally{loading.domains=false}
  await initialTables
}
async function handleSourceModeChange(){dslForm.domainCode='';await handleDomainChange()}
async function handleDomainChange(){metadataRequestVersion.value++;dslForm.tableName='';resetSourceConfiguration();aggregateExpression.value=null;dslForm.periodColumn='';dslForm.fieldCode='';dslForm.groupBy=[];fields.value=[];filterChildren(filters).splice(0);await loadTables(false)}
async function handleTableChange(){metadataRequestVersion.value++;resetSourceConfiguration();aggregateExpression.value=null;dslForm.periodColumn='';dslForm.fieldCode='';dslForm.groupBy=[];fields.value=[];filterChildren(filters).splice(0);await loadFields()}
async function loadTables(preserveTable=false){
  const requestId=++metadataRequestVersion.value
  const domain=sourceMode.value==='DOMAIN'?domains.value.find(x=>x.code===dslForm.domainCode):null
  tables.value=[]
  sourceTablesLoading.value=false
  if(sourceMode.value==='DOMAIN'&&!domain?.id)return
  const requestedTable=preserveTable?dslForm.tableName:''
  sourceTablesLoading.value=true
  try{
    let loaded
    if(domain?.id)loaded=adaptPhysicalTableList(await fetchPhysicalTables(domain.id)).filter(x=>x.tableName&&(x.status||'PUBLISHED')==='PUBLISHED')
    else{loaded=adaptSourceTableList(await fetchSourceTables());if(requestId===metadataRequestVersion.value)sourceTables.value=loaded}
    if(requestId!==metadataRequestVersion.value)return
    tables.value=loaded
    dslForm.tableName=requestedTable&&loaded.some(x=>x.tableName===requestedTable)?requestedTable:''
    sourceTablesLoading.value=false
    if(dslForm.tableName)await loadFields()
  }catch(error){if(requestId===metadataRequestVersion.value)ElMessage.warning(error?.message||'物理表读取失败')}
  finally{if(requestId===metadataRequestVersion.value)sourceTablesLoading.value=false}
}
async function loadFields(){
  const requestId=++metadataRequestVersion.value
  const domain=domains.value.find(x=>x.code===dslForm.domainCode)
  const table=tables.value.find(x=>x.tableName===dslForm.tableName)
  if(dslForm.domainCode&&!domain?.id||!table){fields.value=[];return}
  try{
    const loaded=await loadSourceFields(domain?.id,table.tableName,dslForm.baseAlias,table.tableComment||table.tableName,true)
    if(requestId!==metadataRequestVersion.value)return
    baseFields.value=loaded
    sourceDescriptors[dslForm.baseAlias]={alias:dslForm.baseAlias,physicalTableBindingId:domain?table.id:null,domainId:domain?.id,domainCode:domain?.code,tableName:table.tableName}
    await loadRelationsForSource(dslForm.baseAlias,requestId)
    if(requestId!==metadataRequestVersion.value)return
    if(joins.value.length)await hydrateJoins(requestId)
    if(requestId!==metadataRequestVersion.value)return
    rebuildFields();restorePhysicalFieldReferences();pruneFieldReferences()
  }catch(error){if(requestId===metadataRequestVersion.value)ElMessage.warning(error?.message||'物理字段读取失败')}
}
async function loadSourceFields(domainId,tableName,sourceAlias,sourceName,isBase=false){
  const [mapped,source,timeFieldOptions]=await Promise.all([domainId?fetchPhysicalTableFields(domainId,tableName):Promise.resolve([]),fetchSourceTableFields(tableName),fetchSourceTimeFieldOptions(tableName)])
  const mappings=adaptSemanticFieldList(mapped)
  const options={sourceAlias,sourceName,isBase,timeFieldOptions:normalize(timeFieldOptions)}
  const loaded=(domainId?adaptFactorPhysicalFields(mappings,adaptSourceFieldList(source),options):adaptFactorSourceFields(adaptSourceFieldList(source),options)).map(field=>({...field,relationDataType:mappings.find(item=>item.code===field.semanticFieldCode)?.dataType}))
  await Promise.all(loaded.map(loadFieldValueSet))
  return loaded
}
async function loadFieldValueSet(field){if(!field.id)return;try{const binding=await fetchSemanticFieldValueSet(field.id);const version=binding?.publishedVersion;if(!binding?.bound||!version?.id)return;field.valueSetId=binding.valueSet?.id||field.valueSetId;field.valueSetVersionId=String(version.id);field.valueSetMatchMode=String(version.matchMode||binding.valueSet?.matchMode||'').toUpperCase();if(field.valueSetMatchMode==='CONTINUOUS'){field.continuousSpec=version.continuousSpec||{};field.valueSetBinding={matchMode:'CONTINUOUS',valueSetVersionId:String(version.id),continuousSpec:field.continuousSpec};return}const items=version.items||await fetchValueSetItems(version.id);if(items?.length){field.kind='VALUE_SET';field.options=items}}catch{ /* 未绑定值集的字段保持普通字段 */ }}
function resetSourceConfiguration(){loading.relations=false;joins.value=[];baseFields.value=[];Object.keys(sourceDescriptors).forEach(key=>delete sourceDescriptors[key]);Object.keys(relationOptions).forEach(key=>delete relationOptions[key])}
function rebuildFields(){fields.value=[...baseFields.value,...joins.value.flatMap(item=>item.fields||[])]}
async function loadRelationsForSource(alias,requestId=metadataRequestVersion.value){
  const source=sourceDescriptors[alias]
  if(!source?.physicalTableBindingId)return relationOptions[alias]=[]
  loading.relations=true
  try{
    const loaded=normalize(await fetchPhysicalTableRelations(source.physicalTableBindingId,{status:'PUBLISHED',enableStatus:'ENABLED'})).map(normalizeRelation)
    if(requestId===metadataRequestVersion.value&&sourceDescriptors[alias]===source)relationOptions[alias]=loaded
  }finally{if(requestId===metadataRequestVersion.value)loading.relations=false}
}
function normalizeRelation(item){return{...item,id:toOpaqueId(item.id??item.relationId),leftPhysicalTableBindingId:toOpaqueId(item.leftPhysicalTableBindingId),rightPhysicalTableBindingId:toOpaqueId(item.rightPhysicalTableBindingId)}}
function relationDirection(alias,relation){
  const sourceId=toOpaqueId(sourceDescriptors[alias]?.physicalTableBindingId)
  if(!sourceId)return null
  if(sourceId===relation.leftPhysicalTableBindingId)return{targetPhysicalTableBindingId:relation.rightPhysicalTableBindingId,targetDomainId:toOpaqueId(relation.rightDomainId),targetDomainCode:relation.rightDomainCode,targetTableName:relation.rightTableName,cardinality:relation.cardinality}
  if(sourceId===relation.rightPhysicalTableBindingId)return{targetPhysicalTableBindingId:relation.leftPhysicalTableBindingId,targetDomainId:toOpaqueId(relation.leftDomainId),targetDomainCode:relation.leftDomainCode,targetTableName:relation.leftTableName,cardinality:reverseCardinality(relation.cardinality)}
  return null
}
function reverseCardinality(value){return({ONE_TO_MANY:'MANY_TO_ONE',MANY_TO_ONE:'ONE_TO_MANY'})[value]||value}
function eligibleRelations(alias){return(relationOptions[alias]||[]).filter(relation=>{const direction=relationDirection(alias,relation);return direction&&['INNER','LEFT'].includes(String(relation.joinType).toUpperCase())&&['ONE_TO_ONE','MANY_TO_ONE'].includes(String(direction.cardinality).toUpperCase())})}
function relationOptionLabel(alias,relation){const target=relationDirection(alias,relation);return target?`${target.targetTableName}（${relation.joinType} · ${target.cardinality}）`:relation.code}
function sourceLabel(alias){const source=sourceDescriptors[alias];return source?.tableName?`${source.tableName}（${alias}）`:alias}
async function addJoin(){
  if(joins.value.length>=2||loading.relations)return
  const requestId=metadataRequestVersion.value
  const fromAlias=joins.value.length?joins.value[joins.value.length-1].sourceAlias:dslForm.baseAlias
  if(!sourceDescriptors[fromAlias]?.physicalTableBindingId){
    joins.value.push({inline:true,tableName:'',joinType:'INNER',cardinality:'MANY_TO_ONE',keys:[{fromField:'',targetField:''}],fromAlias,sourceAlias:`join${joins.value.length+1}`,fields:[]})
    return
  }
  try{
    await loadRelationsForSource(fromAlias,requestId)
    if(requestId===metadataRequestVersion.value&&sourceDescriptors[fromAlias])joins.value.push({relationId:'',fromAlias,sourceAlias:`join${joins.value.length+1}`,fields:[],configuring:false,editorOpened:false,saving:false})
  }catch(error){if(requestId===metadataRequestVersion.value)ElMessage.warning(error?.message||'表关系读取失败')}
}
function isJoinComplete(join){return join.inline?Boolean(join.tableName&&join.fields?.length&&join.keys?.length&&join.keys.every(key=>key.fromField&&key.targetField)):Boolean(join.relationId)}
async function selectRawJoinTable(join,index,tableName,requestId=metadataRequestVersion.value,deferPrune=false){
  const fieldRequestVersion=(join.fieldRequestVersion||0)+1
  join.fieldRequestVersion=fieldRequestVersion
  const removed=joins.value.splice(index+1)
  removed.forEach(item=>{delete sourceDescriptors[item.sourceAlias];delete relationOptions[item.sourceAlias]})
  join.tableName=tableName;join.targetTableName=tableName;join.fields=[]
  if(!deferPrune)(join.keys||[]).forEach(key=>{key.targetField=''})
  delete sourceDescriptors[join.sourceAlias]
  rebuildFields()
  if(!tableName){if(!deferPrune)pruneFieldReferences();return}
  join.saving=true
  try{
    const loaded=await loadSourceFields(null,tableName,join.sourceAlias,tableName)
    if(requestId!==metadataRequestVersion.value||joins.value[index]!==join||join.fieldRequestVersion!==fieldRequestVersion)return
    join.fields=loaded
    sourceDescriptors[join.sourceAlias]={alias:join.sourceAlias,tableName}
    rebuildFields();if(!deferPrune)pruneFieldReferences()
  }catch(error){if(requestId===metadataRequestVersion.value&&join.fieldRequestVersion===fieldRequestVersion)ElMessage.warning(error?.message||'关联表字段读取失败')}
  finally{if(joins.value[index]===join&&join.fieldRequestVersion===fieldRequestVersion)join.saving=false}
}
function setJoinMode(join,mode){
  if(join.saving||workflow.published||unsupportedDsl.value)return
  join.configuring=mode==='CREATE'
  if(join.configuring)join.editorOpened=true
}
async function selectExistingRelation(join,index,relationId){
  join.configuring=false
  await selectJoinRelation(join,index,relationId)
}
async function applyConfiguredRelation(join,index,relation){
  if(joins.value[index]!==join||!sourceDescriptors[join.fromAlias])return
  const configured=normalizeRelation(relation)
  const existing=relationOptions[join.fromAlias]||[]
  relationOptions[join.fromAlias]=[...existing.filter(item=>item.id!==configured.id),configured]
  join.saving=true
  try{
    await selectJoinRelation(join,index,configured.id)
    if(joins.value[index]===join&&join.relationId===configured.id){join.configuring=false;join.editorOpened=false;ElMessage.success('关联配置已保存并用于当前因子')}
  }finally{join.saving=false}
}
async function selectJoinRelation(join,index,relationId,deferPrune=false,requestId=metadataRequestVersion.value){
  const removed=joins.value.splice(index+1)
  removed.forEach(item=>{delete sourceDescriptors[item.sourceAlias];delete relationOptions[item.sourceAlias]})
  delete sourceDescriptors[join.sourceAlias];delete relationOptions[join.sourceAlias]
  join.relationId=toOpaqueId(relationId);join.fields=[]
  const relation=eligibleRelations(join.fromAlias).find(item=>item.id===join.relationId)
  const target=relation&&relationDirection(join.fromAlias,relation)
  if(!target){join.relationId='';rebuildFields();if(!deferPrune)pruneFieldReferences();return}
  Object.assign(join,{...target,joinType:String(relation.joinType).toUpperCase(),orientedCardinality:String(target.cardinality).toUpperCase()})
  const descriptor=reactive({alias:join.sourceAlias,physicalTableBindingId:target.targetPhysicalTableBindingId,domainId:target.targetDomainId,domainCode:target.targetDomainCode,tableName:target.targetTableName})
  sourceDescriptors[join.sourceAlias]=descriptor
  rebuildFields()
  try{
    const loaded=await loadSourceFields(target.targetDomainId,target.targetTableName,join.sourceAlias,target.targetTableName)
    if(requestId!==metadataRequestVersion.value||!joins.value.includes(join)||sourceDescriptors[join.sourceAlias]!==descriptor)return
    join.fields=loaded
    await loadRelationsForSource(join.sourceAlias,requestId)
    if(requestId!==metadataRequestVersion.value)return
    rebuildFields();if(!deferPrune)pruneFieldReferences()
  }catch(error){
    if(requestId===metadataRequestVersion.value&&sourceDescriptors[join.sourceAlias]===descriptor){
      join.relationId='';join.fields=[];delete sourceDescriptors[join.sourceAlias];delete relationOptions[join.sourceAlias]
      rebuildFields();ElMessage.warning(error?.message||'关联表字段读取失败，请重新选择')
    }
  }
}
async function hydrateJoins(requestId){
  const saved=joins.value.map(item=>({...item,fields:[]}))
  joins.value=[]
  for(let index=0;index<saved.length;index+=1){
    if(requestId!==metadataRequestVersion.value)return
    const join=reactive(saved[index]);joins.value.push(join)
    if(join.inline){await selectRawJoinTable(join,index,join.tableName,requestId,true);continue}
    await loadRelationsForSource(join.fromAlias,requestId)
    if(requestId!==metadataRequestVersion.value)return
    await selectJoinRelation(join,index,join.relationId,true,requestId)
  }
  if(requestId===metadataRequestVersion.value)rebuildFields()
}
function removeJoin(index){const removed=joins.value.splice(index);removed.forEach(item=>{delete sourceDescriptors[item.sourceAlias];delete relationOptions[item.sourceAlias]});rebuildFields();pruneFieldReferences()}
function restorePhysicalFieldReferences(){
  const resolve=code=>{const prefix=`${dslForm.baseAlias}.`;if(code?.startsWith(prefix))code=code.slice(prefix.length);
    if(fields.value.some(field=>field.code===code))return code
    return fields.value.find(field=>(field.sourceAlias===dslForm.baseAlias?field.semanticFieldCode:`${field.sourceAlias}.${field.semanticFieldCode}`)===code)?.code||code
  }
  dslForm.periodColumn=resolve(dslForm.periodColumn);dslForm.fieldCode=resolve(dslForm.fieldCode);dslForm.groupBy=dslForm.groupBy.map(resolve)
  const expression = node => { if (!node) return; if (node.expressionType === 'FIELD') { node.fieldCode = resolve(fieldKey(node.fieldRef || node.fieldCode)); delete node.fieldRef }; ['left', 'right', 'start', 'end'].forEach(key => expression(node[key])); (node.arguments || []).forEach(expression) }
  expression(aggregateExpression.value)
  const visit=node=>{if(!node)return;if(node.nodeType==='PREDICATE'){node.fieldCode=resolve(node.fieldCode);expression(node.left);expression(node.right)};(node.children||[]).forEach(visit);visit(node.child)}
  visit(filters)
}
function pruneFieldReferences(){const valid=new Set(fields.value.map(x=>x.code));if(!valid.has(dslForm.periodColumn))dslForm.periodColumn='';if(!valid.has(dslForm.fieldCode))dslForm.fieldCode='';dslForm.groupBy=dslForm.groupBy.filter(code=>valid.has(code));pruneFilterNode(filters,valid)}
function pruneFilterNode(node,valid){if(!node)return;if(node.nodeType==='PREDICATE'&&!node.left&&!valid.has(node.fieldCode)){node.fieldCode='';node.value='';node.itemCodes=[];node.operator=''};(node.children||[]).forEach(child=>pruneFilterNode(child,valid));if(node.child)pruneFilterNode(node.child,valid)}
async function loadParameterSchema(){if(!template.templateId)return;loading.template=true;try{const data=await fetchFactorTemplateParameterSchema(template.templateId);parameters.value=normalize(data?.parameters??data);parameters.value.forEach(x=>{if(!(x.code in parameterValues))parameterValues[x.code]=x.defaultValue??''})}catch(e){ElMessage.error(e?.message||'模板参数读取失败')}finally{loading.template=false}}
function selectAggregation(value){dslForm.aggregation=value;if(value!=='COUNT'&&!aggregatableFields.value.some(field=>field.code===dslForm.fieldCode))dslForm.fieldCode=''}
function buildDsl(){return buildFactorDsl({domainCode:dslForm.domainCode,tableName:dslForm.tableName,sourceAlias:dslForm.baseAlias,joins:joins.value.filter(isJoinComplete),aggregation:dslForm.aggregation,fieldCode:dslForm.fieldCode,fieldExpression:aggregateExpression.value,groupBy:dslForm.groupBy,filters:scopeMode.value==='ALL'?{nodeType:'TRUE'}:filters,fields:fields.value,missingRowPolicy:existingDslMissingRowPolicy.value,calculationMode:dslForm.calculationMode,periodColumn:dslForm.periodColumn})}
function hasPeriodParameter(node){return !!node&&(node.nodeType==='PREDICATE'&&node.parameter==='period'||(node.children||[]).some(hasPeriodParameter)||hasPeriodParameter(node.child))}
function removePeriodPredicates(node){if(!node||typeof node!=='object')return;if(Array.isArray(node.children)){node.children=node.children.filter(item=>!(item?.nodeType==='PREDICATE'&&item.parameter==='period'));node.children.forEach(removePeriodPredicates)}if(node.child)removePeriodPredicates(node.child)}
watch(()=>dslForm.calculationMode,(mode)=>{if(mode==='STATIC'){dslForm.periodColumn='';removePeriodPredicates(filters);trialPeriod.value=[];trialRecommendation.value=null;trialRecommendationError.value=''}})
function hasInvalidPeriodParameter(node){if(!node)return false;if(node.nodeType==='PREDICATE')return node.parameter==='period'&&!periodFields.value.some(field=>field.code===node.fieldCode);return hasInvalidPeriodParameter(node.child)||(node.children||[]).some(hasInvalidPeriodParameter)}
async function saveFactor() {
  if (workflow.published || loading.save || loading.compile) return
  if (isDerived.value) return saveDerivedFactor()
  if (isNativeSql.value) return saveNativeSqlFactor()
  if (joins.value.some(item => item.saving || item.configuring)) return ElMessage.warning('请先完成或取消关联配置')
  if (periodConfigurationError.value) return ElMessage.warning(periodConfigurationError.value)
  if (unsupportedDsl.value) return ElMessage.warning('该因子使用 SQL 或不支持的表达式，请通过原创建方式修改计算口径')
  if (!(await basicFormRef.value?.validate().catch(() => false))) return
  if (sourceMode.value === 'DOMAIN' && !dslForm.domainCode) return ElMessage.warning('请选择数据域')
  if (!dslForm.tableName) return ElMessage.warning('请选择物理表')
  if (joins.value.some(item => !isJoinComplete(item))) return ElMessage.warning('请选择完整的关联关系')
  const valid = new Set(fields.value.map(x => x.code))
  if ((!aggregateExpression.value && dslForm.fieldCode && !valid.has(dslForm.fieldCode)) || dslForm.groupBy.some(code => !valid.has(code))) return ElMessage.warning('统计字段和分组维度必须来自当前参与计算的物理表')
  const errors = scopeMode.value === 'FILTERED' ? validateFilterNode(filters, [], fields.value) : []
  if (aggregateExpression.value) validateExpression(aggregateExpression.value, errors, fields.value)
  if (errors.length) return ElMessage.warning(errors[0])
  if (dslForm.calculationMode === 'TEMPORAL' && !periodFields.value.some(field => field.code === dslForm.periodColumn)) return ElMessage.warning('请选择当前参与计算的日期时间字段作为统计周期字段')
  if (scopeMode.value === 'FILTERED' && hasPeriodParameter(filters) && hasInvalidPeriodParameter(filters)) return ElMessage.warning('统计周期必须绑定到当前参与计算的日期时间字段')
  if (dslForm.aggregation !== 'COUNT' && !dslForm.fieldCode && !aggregateExpression.value) return ElMessage.warning('请选择统计字段')
  loading.save = true
  try {
    const wasCreate = isCreate.value
    const payload = definitionPayload(buildDsl())
    const result = wasCreate ? (template.versionId ? await instantiateFactorTemplateVersion(template.versionId, { parameters: parameterValues, overrides: { code: basicForm.code, name: basicForm.name, description: basicForm.description } }) : await createFactor({ code: basicForm.code, ...payload })) : await updateFactor(route.params.id, payload)
    resourceVersion.value = Number(result?.resourceVersion ?? result?.version ?? resourceVersion.value)
    workflow.factorId = toOpaqueId(result?.id ?? result?.factorId ?? workflow.factorId ?? route.params.id)
    workflow.versionId = toOpaqueId(result?.draftVersionId ?? result?.versionId ?? workflow.versionId)
    workflow.status = result?.status || workflow.status || 'DRAFT'; workflow.published = workflow.status === 'PUBLISHED'
    resetWorkflowAfterDefinitionChange()
    await refreshSavedVersion()
    if (wasCreate && workflow.factorId) await router.replace({ path: `/factor/edit/${encodeURIComponent(workflow.factorId)}`, hash: '#factor-workflow' })
    workflow.message = `因子草稿已保存，版本 ID：${workflow.versionId}。请继续执行编译校验。`; workflow.messageType = 'success'
    await focusWorkflow()
    ElMessage.success(wasCreate ? '因子草稿已保存，请继续编译校验' : '因子修改已保存，请重新编译校验')
  } catch (e) { await handleFactorSaveError(e) } finally { loading.save = false }
}
async function saveDerivedFactor() {
  if (workflow.published || loading.save || loading.compile) return
  if (!(await basicFormRef.value?.validate().catch(() => false))) return
  try { derivedEditorRef.value.validate() } catch (e) { return ElMessage.warning(e.message) }
  loading.save = true
  try {
    const payload = { code: basicForm.code, ...definitionPayload(currentDsl.value) }
    const result = isCreate.value ? await createFactor(payload) : await updateFactor(route.params.id, payload)
    resourceVersion.value = Number(result.resourceVersion ?? resourceVersion.value)
    workflow.factorId = toOpaqueId(result.id ?? result.factorId)
    workflow.versionId = toOpaqueId(result.draftVersionId ?? result.versionId ?? workflow.versionId)
    workflow.status = 'DRAFT'
    resetWorkflowAfterDefinitionChange()
    await refreshSavedVersion()
    if (isCreate.value) await router.replace({ path: `/factor/edit/${encodeURIComponent(workflow.factorId)}`, hash: '#factor-workflow' })
    workflow.message = '复合因子草稿已保存，请继续编译、试算和发布。'
    workflow.messageType = 'success'
    await focusWorkflow()
    ElMessage.success('复合因子草稿已保存')
  } catch (e) { await handleFactorSaveError(e) }
  finally { loading.save = false }
}
function definitionPayload(dsl) {
  return { name: basicForm.name, description: basicForm.description, category: basicForm.category || null,
    dsl, resourceVersion: resourceVersion.value, factorVersionId: workflow.versionId || undefined,
    versionResourceVersion: versionResourceVersion.value }
}
async function refreshSavedVersion() {
  if (!workflow.versionId) return
  const version = await fetchFactorVersion(workflow.versionId)
  if (!isCreate.value && versionResourceVersion.value != null && Number(version.resourceVersion ?? version.version) <= Number(versionResourceVersion.value)) {
    throw new Error('后端未保存计算配置，请确认后端已更新并刷新后重试')
  }
  hydrateWorkflow({ id: workflow.factorId }, version)
  savedDefinition.value = definitionSnapshot(version.dsl)
}
async function saveNativeSqlFactor() {
  if (workflow.published || loading.save || loading.compile) return
  if (!(await basicFormRef.value?.validate().catch(() => false))) return
  if (!unsupportedDsl.value.sqlTemplate?.trim()) return ElMessage.warning('请输入 SQL')
  loading.save = true
  try {
    const result = await updateFactor(route.params.id, definitionPayload(currentDsl.value))
    resourceVersion.value = Number(result.resourceVersion ?? resourceVersion.value)
    resetWorkflowAfterDefinitionChange()
    await refreshSavedVersion()
    workflow.message = 'SQL 草稿已保存，请重新编译、试算后发布。'
    workflow.messageType = 'success'
    await focusWorkflow()
    ElMessage.success(workflow.message)
  } catch (e) { await handleFactorSaveError(e) }
  finally { loading.save = false }
}
async function loadRuntimeDeclarations() {
  const artifactId = workflow.artifactId
  if (!artifactId) return
  runtimeSchemaLoading.value = true; runtimeSchemaError.value = ''
  try {
    const artifact = currentCompileArtifactId.value === artifactId ? currentCompileArtifact.value : await fetchCompileArtifact(artifactId)
    if (workflow.artifactId !== artifactId) return
    currentCompileArtifact.value = artifact; currentCompileArtifactId.value = artifactId
    const upstream = new Map()
    const declarations = await inheritedFactorParameters(artifact, versionId => {
      if (!upstream.has(versionId)) upstream.set(versionId, (async () => {
        const version = await fetchFactorVersion(versionId)
        if (!version.currentArtifactId) throw new Error('上游因子缺少编译信息，请重新编译后再试')
        return fetchCompileArtifact(version.currentArtifactId)
      })())
      return upstream.get(versionId)
    })
    if (workflow.artifactId === artifactId) runtimeDeclarations.value = declarations
  } catch (e) { if (workflow.artifactId === artifactId) runtimeSchemaError.value = e?.message || '运行参数加载失败，请重试后查询或试算' }
  finally { if (workflow.artifactId === artifactId) runtimeSchemaLoading.value = false }
}
async function queryCurrentVersion() {
  if (definitionDirty.value) return ElMessage.warning('计算口径已修改，请先保存并重新编译')
  if (runtimeSchemaLoading.value || runtimeSchemaError.value) return ElMessage.warning('请先完成运行参数的读取')
  const error = validateSqlRuntimeParameterValues(runtimeDeclarations.value, runtimeValues.value)
  if (error) return ElMessage.warning(error)
  if (dslForm.calculationMode === 'TEMPORAL' && trialPeriod.value?.length !== 2) return ElMessage.warning('请选择完整的查询周期')
  queryLoading.value = true; queryRows.value = []
  const versionId = workflow.versionId
  try {
    const payload = { ...(dslForm.calculationMode === 'TEMPORAL' ? {periodStart:trialPeriod.value[0], periodEnd:trialPeriod.value[1]} : {}),
      parameters: buildSqlRuntimeParameterValues(runtimeDeclarations.value, runtimeValues.value) }
    const result = await queryFactorVersion(versionId, payload)
    if (workflow.versionId === versionId) queryRows.value = (result.records || result.rows || []).map(row => ({...row, dimensions: row.dimensions || Object.fromEntries((result.grainFieldCodes || []).map(field => [field,row[field]]))}))
  } catch (e) { ElMessage.error(e?.message || '即时查询失败') }
  finally { queryLoading.value = false }
}
watch(() => [route.params.id, route.query.factorVersionId], async ([id]) => {
  if (!id || id === 'new') return
  savedDefinition.value = ''
  resetWorkflowAfterDefinitionChange()
  await loadExisting()
})
watch(definitionDirty, dirty => {
  if (!dirty || workflow.published) return
  workflow.compiled = false
  workflow.resultsLoaded = false
})
function hydrateWorkflow(factor,version){workflow.factorId=toOpaqueId(factor?.id??factor?.factorId??route.params.id);workflow.versionId=toOpaqueId(version?.id??version?.versionId??factor?.draftVersionId??factor?.currentPublishedVersionId);workflow.status=version?.publicationStatus??version?.status??factor?.status??'DRAFT';workflow.artifactId=toOpaqueId(version?.currentArtifactId??version?.artifactId);workflow.compiled=Boolean(workflow.artifactId)||['VALID','VALIDATED'].includes(String(version?.compileStatus||'').toUpperCase());workflow.published=workflow.status==='PUBLISHED';versionResourceVersion.value=version?.resourceVersion??version?.version??null}
function resetWorkflowAfterDefinitionChange(){workflow.artifactId='';workflow.compiled=false;workflow.taskId='';workflow.batchId='';workflow.taskStatus='';workflow.qualityStatus='';workflow.resultsLoaded=false;trialRows.value=[];queryRows.value=[];runtimeDeclarations.value=[];runtimeValues.value={};currentCompileArtifact.value=null;currentCompileArtifactId.value='';runtimeSchemaError.value='';runtimeSchemaLoading.value=false;clearTrialRecommendation(true);workflow.published=false}
async function compileCurrentVersion() {
  if (loading.save || workflow.published) return
  if (definitionDirty.value) return ElMessage.warning('口径有修改，请先保存草稿')
  return factorVersionWorkflow.compile({ resourceVersion: versionResourceVersion.value })
}
function clearTrialRecommendation(clearRecommendedPeriod=false){recommendationRequestVersion.value++;trialRecommendation.value=null;trialRecommendationError.value='';if(clearRecommendedPeriod&&trialPeriodSource.value==='RECOMMENDED'){trialPeriod.value=[];trialPeriodSource.value=''}}
async function loadTrialRecommendation({applyDefault=false}={}){if(!canRequest('GET', '/factor-versions/1/trial-period-recommendation'))return;if(dslForm.calculationMode==='STATIC'||!workflow.versionId||!workflow.compiled||loading.recommendation)return;const requestId=++recommendationRequestVersion.value;loading.recommendation=true;trialRecommendationError.value='';try{const recommendation=normalizeTrialPeriodRecommendation(await fetchFactorTrialPeriodRecommendation(workflow.versionId));if(requestId!==recommendationRequestVersion.value)return;trialRecommendation.value=recommendation;const period=recommendationPeriod(recommendation);if(recommendation.availabilityStatus==='AVAILABLE'&&period.length&& (applyDefault&&(!trialPeriod.value?.length||trialPeriodSource.value!=='USER'))){trialPeriod.value=period;trialPeriodSource.value='RECOMMENDED';workflow.message=`已获取后端推荐试算周期：${period[0]} 至 ${period[1]}。未修改时将直接使用该周期试算。`;workflow.messageType='success'}else if(recommendation.availabilityStatus==='NO_DATA'){workflow.message='当前因子过滤条件下没有匹配源数据，未生成推荐周期；可手动选择周期验证。';workflow.messageType='warning'}}catch(e){if(requestId!==recommendationRequestVersion.value)return;trialRecommendationError.value=e?.message||'推荐试算周期获取失败，可手动选择周期后试算。';if(!trialPeriod.value?.length){workflow.message=trialRecommendationError.value;workflow.messageType='warning'}}finally{if(requestId===recommendationRequestVersion.value)loading.recommendation=false}}
function onTrialPeriodChange(value){trialPeriodSource.value=Array.isArray(value)&&value.length===2?'USER':''}
function restoreRecommendedTrialPeriod(){const period=recommendationPeriod(trialRecommendation.value);if(!period.length)return ElMessage.warning('当前没有可恢复的推荐试算周期');trialPeriod.value=period;trialPeriodSource.value='RECOMMENDED';ElMessage.success('已恢复后端推荐试算周期')}
async function trialCurrentVersion(){if(runtimeSchemaLoading.value||runtimeSchemaError.value)return ElMessage.warning('请先完成运行参数的读取');const parameterError=validateSqlRuntimeParameterValues(runtimeDeclarations.value,runtimeValues.value);if(parameterError)return ElMessage.warning(parameterError);if(!workflow.compiled||loading.trial||loading.result||loading.recommendation)return;if(workflow.taskId&&!isTerminalTask.value)return refreshTrialStatus();if(workflow.taskStatus==='SUCCEEDED'&&workflow.batchId&&!workflow.resultsLoaded)return loadTrialResults();let payload={};if(dslForm.calculationMode==='TEMPORAL'){let resolved=resolveTrialPeriod(trialPeriod.value,trialRecommendation.value);if(!resolved.period.length&&!trialRecommendationError.value){await loadTrialRecommendation({applyDefault:true});resolved=resolveTrialPeriod(trialPeriod.value,trialRecommendation.value)}if(!resolved.period.length)return ElMessage.warning('暂无可用推荐试算周期，请手动选择完整的试算时间范围');if(!trialPeriod.value?.length){trialPeriod.value=resolved.period;trialPeriodSource.value='RECOMMENDED'}payload={periodStart:resolved.period[0],periodEnd:resolved.period[1]}}payload.parameters=buildSqlRuntimeParameterValues(runtimeDeclarations.value,runtimeValues.value);return factorVersionWorkflow.trial(payload)}
async function pollTrialTask() { return factorVersionWorkflow.pollTrialTask() }
async function refreshTrialStatus() { return factorVersionWorkflow.refreshTrialStatus() }
async function loadTrialResults(page=1) { return factorVersionWorkflow.loadTrialResults(page) }
async function publishCurrentVersion() { if (!canPublish.value) return; return factorVersionWorkflow.publish(versionId => ElMessageBox.confirm(`确认发布因子版本 ${versionId}？发布后该版本可供指标正式引用。`, '发布因子版本', { confirmButtonText: '确认发布', cancelButtonText: '返回检查', type: 'warning' })) }
function formatDimensions(row){const dimensions=row?.dimensions??row?.dimensionValues??row?.dimension??{};if(!dimensions||!Object.keys(dimensions).length)return '总体';return Object.entries(dimensions).map(([key,value])=>`${key}=${value}`).join('，')}
function resultValue(row){return row?.displayValue??row?.valueDecimal??row?.resultValue??row?.value??row?.factor_value??'-'}
function openIndicatorEditor(){const query={};if(Array.isArray(trialPeriod.value)&&trialPeriod.value.length===2){query.periodStart=trialPeriod.value[0];query.periodEnd=trialPeriod.value[1]}router.push({path:'/indicator/edit/new',query})}
async function handleFactorSaveError(error){const conflict=resolveResourceConflict(error);if(!conflict){ElMessage.error(error?.message||'因子保存失败');return}const action=await ElMessageBox.confirm(`已存在同名因子：${conflict.resource.name}（${conflict.resource.code}）。未创建新因子。`, '因子名称冲突', {type:'warning',confirmButtonText:'打开已有因子',cancelButtonText:'返回修改',distinguishCancelAndClose:true}).catch(()=> 'cancel');if(action==='confirm'){const path=resourceConflictEditorPath(conflict);if(path)router.push(path)}}
function formatCompileDiagnostics(diagnostics){return(diagnostics||[]).map(item=>{const label=fieldLabel(item.path);const message=toUserMessage(item.message||item.suggestion,'因子配置未通过校验，请检查计算口径');const suggestion=item.suggestion?toUserMessage(item.suggestion,''):'';return `${label==='填写的信息'?'':label+'：'}${message}${suggestion&&suggestion!==message?`（建议：${suggestion}）`:''}`}).join('；')}
function fieldKey(reference){if(reference&&typeof reference==='object'){const alias=reference.sourceAlias||dslForm.baseAlias;const code=reference.fieldName||reference.fieldCode||'';return alias===dslForm.baseAlias?code:`${alias}.${code}`}return String(reference||'')}
function toEditableFilterRoot(node){return editableFilterTree(node,existingRuntimeParameters.value,fieldKey)}
function metadataOptionLabel(item){const name=String(item?.name||'').trim();const code=String(item?.code||'').trim();return name&&name!==code?`${name}（${code}）`:code||name||'未命名'}
function fieldOptionLabel(field){const code=field.physicalColumn||field.code;const label=metadataOptionLabel({name:field.label,code});const type=fieldTypeLabel(field.kind||field.dataType);const table=field.sourceAlias!==dslForm.baseAlias?` · ${field.sourceName||field.sourceAlias}`:'';const source=field.sourceFieldName?` · 来源：${field.sourceFieldName}`:'';const sensitive=field.sensitive?' · 敏感':'';return `${label} · ${type}${table}${source}${sensitive}`}
function fieldTypeLabel(value){return({STRING:'文本',CODE:'编码',VALUE_SET:'值集',NUMBER:'数值',DATETIME:'日期时间'} )[String(value||'').toUpperCase()]||value||'字段'}
function describeNode(node) {
  if (!node) return ''
  if (node.nodeType === 'NOT') return `不满足（${describeNode(node.child)}）`
  if (node.nodeType !== 'PREDICATE') return `（${(node.children || []).map(describeNode).filter(Boolean).join(node.nodeType === 'OR' ? '，或' : '，且')}）`
  const field = fieldByCode(fields.value, node.fieldCode)
  const label = node.left ? describeFieldExpression(node.left, fields.value) : field?.label || node.fieldCode || '未选择字段'
  if (['IS_NULL', 'IS_NOT_NULL'].includes(node.operator)) return `${label}${node.operator === 'IS_NULL' ? '为空' : '非空'}`
  if (node.parameter) return `${label}${operatorLabel(node.operator)}参数「${node.parameter}」`
  if (node.right) return `${label}${operatorLabel(node.operator)}${describeFieldExpression(node.right, fields.value)}`
  if (node.operator === 'BETWEEN') return `${label}在 [${node.value?.start || '—'}, ${node.value?.end || '—'}) 范围内`
  const codes = node.operator === 'IN_VALUE_SET' ? node.itemCodes || [] : Array.isArray(node.value) ? node.value : node.value !== '' && node.value != null ? [node.value] : []
  return `${label}${operatorLabel(node.operator)}${codes.map(code => field?.options?.find(item => (item.code || item.value) === code)?.label || String(code)).join('、') || '未填写'}`
}
function operatorLabel(value){return({EQ:'等于',NE:'不等于',IN:'属于',IN_VALUE_SET:'属于值集',GTE:'大于或等于',LTE:'小于或等于',GT:'大于',LT:'小于',BETWEEN:'位于范围',LIKE:'匹配文本',NOT_LIKE:'不匹配文本'})[value]||value||''}function normalize(x){if(Array.isArray(x))return x;return x?.records||x?.list||x?.items||x?.data||[]}
</script>
<style scoped>
.definition-kind-field{margin-bottom:0}
.definition-kind-field :deep(.el-form-item__label){height:38px;line-height:38px}
.definition-kind-current{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:4px;background:#eef5fd;color:#175b9c;font-size:14px;font-weight:600;line-height:22px}
.definition-kind-current.is-derived{background:#edf7f3;color:#206b51}
.definition-kind-selector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:264px;max-width:100%;padding:3px;background:#f1f3f5;border:1px solid #e5e7eb;border-radius:6px}
.definition-kind-selector :deep(.el-radio-button){min-width:0}
.definition-kind-selector :deep(.el-radio-button__inner){display:flex;align-items:center;justify-content:center;width:100%;height:30px;padding:0 12px;border:0!important;border-radius:4px;box-shadow:none!important;background:transparent;color:#606770;font-size:14px;font-weight:400;transition:background-color .15s,color .15s}
.definition-kind-selector :deep(.el-radio-button:not(.is-disabled):not(.is-active):hover .el-radio-button__inner){background:#e8ebef;color:#303640}
.definition-kind-selector :deep(.el-radio-button.is-active .el-radio-button__inner){background:#fff;color:#1677c2;font-weight:600;box-shadow:0 1px 3px #00000014!important}
.definition-kind-selector :deep(.el-radio-button.is-disabled .el-radio-button__inner){cursor:not-allowed}
.definition-kind-selector :deep(.el-radio-button__original-radio:focus-visible + .el-radio-button__inner){outline:2px solid #1677ff;outline-offset:3px}
@media(max-width:480px){.definition-kind-field{flex-direction:column}.definition-kind-field :deep(.el-form-item__label){justify-content:flex-start;width:auto!important;height:28px;line-height:28px}.definition-kind-field :deep(.el-form-item__content){width:100%;margin-left:0!important}.definition-kind-selector{width:100%}.definition-kind-selector :deep(.el-radio-button__inner){padding:0 8px}}
@media (max-width: 600px) {
  .workflow-steps { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
  .workflow-steps :deep(.el-step.is-simple) { flex: none; max-width: none; }
  .workflow-steps :deep(.el-step__title) { max-width: none; font-size: 13px; word-break: keep-all; }
  .workflow-steps :deep(.el-step__arrow) { display: none; }
}
</style>
<style scoped>
.factor-editor .join-row { grid-template-columns: 28px minmax(0, .7fr) minmax(0, 1.7fr) minmax(0, .7fr) 32px; }
.factor-editor .join-row > * { min-width: 0; }
.physical-join-config{grid-column:2 / -1;display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0}
.physical-join-config>.el-select{width:220px;max-width:100%}
.physical-join-keys{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) 32px;gap:10px;align-items:center;width:100%}
@media(max-width:700px){.physical-join-config{grid-column:1 / -1}.physical-join-keys{grid-template-columns:minmax(0,1fr) 32px}.physical-join-keys>span{display:none}.physical-join-keys>.el-select{grid-column:1}.physical-join-keys>.el-button{grid-column:2;grid-row:1 / 3}}
.factor-editor .join-reuse > .el-select, .factor-editor .inline-relation-editor :deep(.el-select) { width: 100%; min-width: 0; max-width: 100%; }
.factor-editor .join-source strong, .factor-editor .join-target strong { overflow-wrap: anywhere; }
.join-row-actions { display: flex; gap: 8px; align-items: center; }
.join-row-actions :deep(.el-button + .el-button) { margin-left: 0; }
.join-row > .inline-relation-editor, .join-reuse { grid-column: 2 / -1; }
.join-mode { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.join-mode :deep(.el-radio) { margin-right: 0; min-width: 0; height: auto; min-height: 32px; }
.join-mode :deep(.el-radio__label) { white-space: normal; line-height: 20px; }
@media(max-width: 1100px) {
  .factor-editor .join-row { grid-template-columns: 28px minmax(0, 1fr); }
  .factor-editor .join-source, .factor-editor .join-target, .factor-editor .join-mode, .factor-editor .join-row-actions { grid-column: 2; }
  .factor-editor .join-row-actions { grid-column: 2; justify-content: flex-end; }
}
@media(max-width: 700px) {
  .join-row > .inline-relation-editor, .join-reuse { grid-column: 1 / -1; }
  .join-row-actions { flex-wrap: wrap; }
}
</style>
<style scoped>
.page-toolbar{display:flex;align-items:center;gap:10px}.editor-alert{margin-bottom:16px}.saved-summary{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:4px;padding:11px 12px;color:#595959;font-size:13px;background:#f7fbff;border:1px solid #d6ecff;border-radius:6px}.saved-summary strong{color:#1677c2;font-family:Consolas,monospace}.caliber-section{padding:22px}.caliber-preview{display:flex;align-items:center;gap:14px;margin-bottom:20px;padding:15px 18px;background:#f7fbff;border:1px solid #d6ecff;border-radius:8px}.caliber-preview span{flex:0 0 auto;color:#8c8c8c}.caliber-preview strong{color:#1677c2;line-height:22px}.form-block{padding:18px;background:#fafcff;border:1px solid #e8edf3;border-radius:8px}.block-title{margin-bottom:16px}.block-title h3{margin:0 0 5px;font-size:15px}.block-title p{margin:0;color:#8c8c8c;font-size:13px}.join-config{margin-top:4px;padding:14px 0;border-top:1px solid #edf0f5}.join-config__head,.join-row{display:flex;align-items:center;gap:12px}.join-config__head{justify-content:space-between;margin-bottom:10px}.join-config__head strong,.join-config__head small,.join-source span,.join-source strong,.join-target span,.join-target strong,.join-target small{display:block}.join-config__head small,.join-source span,.join-target span,.join-target small{margin-top:3px;color:#8c8c8c;font-size:12px}.join-empty{padding:12px;color:#8c8c8c;background:#fff;border:1px dashed #d9d9d9;border-radius:6px;text-align:center}.join-row{display:grid;grid-template-columns:28px minmax(130px,.7fr) minmax(260px,1.5fr) minmax(150px,.8fr) 34px;margin-top:10px;padding:12px;background:#fff;border:1px solid #e5e8ef;border-radius:6px}.join-order{display:flex;align-items:center;justify-content:center;width:24px;height:24px;color:#1677c2;background:#e6f4ff;border-radius:50%;font-size:12px;font-weight:600}.join-row+.el-alert{margin-top:10px}.time-binding{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:4px;padding:13px 15px;background:#fff;border:1px dashed #91caff;border-radius:6px}.time-binding>div{width:100%;max-width:480px}.time-binding>div>span,.time-binding>div>strong{display:block}.time-binding>div>span{margin-bottom:4px;color:#8c8c8c;font-size:12px}.time-binding strong{color:#1677c2}.time-binding small{color:#6b7280}.trial-period-card{max-width:none!important;margin:16px 0!important;padding:16px 18px;background:#f7fbff;border:1px solid #d6ecff;border-radius:8px}.trial-period-card strong,.trial-period-card small{display:block}.trial-period-card small{margin:5px 0 12px;color:#6b7280}.trial-recommendation{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0;color:#595959;font-size:13px}.trial-recommendation span{line-height:20px}.trial-recommendation-alert{margin:10px 0}.editor-actions-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;position:static!important;margin:16px 0 20px!important;padding:14px 16px!important;background:#fff!important;border:1px solid #e5e8ef!important;box-shadow:none!important}.editor-actions-bar span{color:#595959;font-size:13px}.factor-editor :deep(.el-form-item__label){color:#262626;font-weight:500}@media(max-width:900px){.join-row{grid-template-columns:28px 1fr 34px}.join-source,.join-target{grid-column:2}.join-row>.el-select{grid-column:2}.join-row>.el-button{grid-column:3;grid-row:1}}@media(max-width:700px){.page-toolbar{flex-wrap:wrap}.caliber-preview,.time-binding,.editor-actions-bar,.join-config__head{align-items:flex-start;flex-direction:column}}
</style>
<style scoped lang="scss">.editor-section{margin-bottom:16px;padding:18px}.section-title{display:flex;gap:12px;align-items:flex-start;justify-content:flex-start;min-width:0;margin-bottom:16px}.section-title>div{min-width:0;flex:1}.section-title>.section-number{flex:0 0 28px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;color:#fff;background:#1890ff;border-radius:50%;font-weight:600}.section-title h2{margin:0 0 4px;font-size:16px}.section-title p{margin:0;color:#8c8c8c;font-size:13px}.business-summary{display:flex;gap:12px;align-items:center;margin-bottom:16px;padding:14px;background:#f7fbff;border:1px solid #d6ecff;border-radius:6px}.business-summary span,.business-summary small{color:#8c8c8c}.business-summary strong{color:#1677c2}.option-description{display:block;margin-top:3px;color:#8c8c8c;font-size:12px}.measure-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.measure-card{padding:14px;text-align:left;background:#fff;border:1px solid #e5e8ef;border-radius:6px;cursor:pointer}.measure-card strong,.measure-card span{display:block}.measure-card span{margin-top:6px;color:#8c8c8c;font-size:12px}.measure-card.active{border-color:#1890ff;background:#f7fbff}.measure-card.active strong{color:#1677c2}.measure-field{margin-top:16px}.group-by-form{margin-top:18px;padding-top:16px;border-top:1px solid #edf0f5}.scope-mode{margin-bottom:14px}.grain-hint{margin-top:10px;color:#1677c2;font-size:13px}.rule-explanation{display:flex;gap:12px;align-items:flex-start;margin-top:14px;padding:12px 14px;background:#fffbe6;border:1px solid #ffe58f;border-radius:6px}.rule-explanation strong{flex:0 0 auto;color:#ad6800}.rule-explanation span{color:#614700;line-height:20px}.section-footer{margin-top:10px;text-align:right}.workflow-section{border-top:3px solid #1890ff;scroll-margin-top:88px}.workflow-section:focus-visible{outline:2px solid #1890ff;outline-offset:3px}.workflow-identity{margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.workflow-identity>div{padding:12px;background:#f7f8fa;border-radius:6px}.workflow-identity span,.workflow-identity strong{display:block}.workflow-identity span{margin-bottom:5px;color:#8c8c8c;font-size:12px}.workflow-identity strong{overflow:hidden;font-family:Consolas,monospace;text-overflow:ellipsis}.workflow-steps{margin-bottom:18px}.trial-period{max-width:520px;margin-bottom:14px}.workflow-actions,.workflow-feedback,.published-next{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.workflow-feedback{margin-top:14px;padding:12px;background:#f7fbff;border-radius:6px;color:#595959}.workflow-alert{margin-top:14px}.trial-results{margin-top:18px}.result-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.result-head h3{margin:0;font-size:15px}.result-head span{color:#8c8c8c;font-size:12px}.mono-data{font-family:Consolas,monospace}.published-next{margin-top:18px;padding:16px;background:#f6ffed;border:1px solid #b7eb8f;border-radius:8px}.published-next strong{color:#389e0d}.published-next span{margin-right:auto;color:#595959}@media(max-width:900px){.measure-cards{grid-template-columns:repeat(2,1fr)}.workflow-identity{grid-template-columns:repeat(2,minmax(0,1fr))}}:deep(.el-select),:deep(.el-input),:deep(.el-date-editor){width:100%}</style>
