<template>
  <div ref="presentationRef" class="idmp-page dashboard-page dashboard-v2" :class="[`theme-${dashboardTheme}`, { 'is-presentation-mode': presentationMode === 'presentation' }]" :style="dashboardSurfaceStyle">
    <PageHeader v-if="!isEditing"
      :title="dashboardSchema?.name || '医疗质量指标总览'"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': dashboardStatus === 'ready' }">
          {{ dashboardSourceLabel }}
        </span>
        <span v-if="dashboardStatus === 'demo'" class="data-source-badge" role="status">演示数据</span>
      </template>
      <template #actions>
        <template v-if="!isEditing">
          <el-button @click="enterPresentation">大屏展示</el-button>
        </template>
        <template v-if="isEditing">
          <el-button :icon="RefreshLeft" @click="resetDashboardLayout">恢复默认</el-button>
          <el-button data-testid="dashboard-undo" title="撤销上一步编辑" :disabled="!canUndo" @click="undoDashboardEdit">撤销</el-button>
          <el-button data-testid="dashboard-redo" title="重做上一步编辑" :disabled="!canRedo" @click="redoDashboardEdit">重做</el-button>
          <el-button data-testid="dashboard-configure-widget" :disabled="!activeDesignerWidget" @click="openWidgetConfig(activeWidgetId)">配置组件</el-button>
          <el-button data-testid="dashboard-delete-widget" :icon="Delete" :disabled="!activeDesignerWidget" @click="deleteActiveWidget">删除组件</el-button>
          <span class="dashboard-save-state" :class="`is-${saveState}`">{{ saveStateLabel }}</span>
          <el-button v-if="isDev" text @click="showDashboardSchemaDiagnostic">查看当前 Schema</el-button>
          <el-button :icon="Close" @click="exitDashboardEdit">退出编辑</el-button>
          <el-button data-testid="dashboard-save" type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
        </template>
        <el-button v-if="!isEditing" data-testid="dashboard-edit" type="primary" :icon="Edit" :loading="dashboardEditLoading" @click="startDashboardEdit">编辑看板</el-button>
        <el-button v-if="dashboardStatus === 'unpublished'" @click="loadDashboard">重新加载</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="!isEditing && hasUnpublishedDashboardDraft"
      type="info"
      :closable="false"
      show-icon
      title="存在未发布的看板草稿"
      description="当前查看态仍展示已发布版本，草稿将在发布后对查看者生效。"
    />

    <el-alert
      v-if="dashboardRecovery.status === DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA"
      type="error"
      :closable="false"
      show-icon
      title="已保存的看板配置无法恢复"
      description="原始本地数据仍被保留，当前仅展示安全回退内容；保存前请确认是否要覆盖该数据。"
    />

    <StatePanel
      v-if="dashboardStatus === 'loading'"
      type="loading"
      title="正在加载质量看板"
      description="正在读取已发布看板定义和当前筛选条件下的正式结果。"
    />
    <StatePanel
      v-else-if="dashboardStatus === 'select'"
      type="empty"
      title="请选择场景看板"
      description="请先从页面顶部的场景选择器中选择一个看板，选中后会自动加载对应内容。"
    />
    <StatePanel
      v-else-if="dashboardStatus === 'error'"
      type="error"
      title="质量看板加载失败"
      :description="dashboardLoadMessage || '未展示演示数据，请检查后端看板是否已发布后重试。'"
    >
      <template #actions>
        <el-button type="primary" @click="retryRemoteDashboardCatalog">重新加载</el-button>
        <el-button v-if="remoteCatalogIsEmpty" @click="newDashboardForm('blank')">创建服务端看板</el-button>
      </template>
    </StatePanel>
    <StatePanel
      v-else-if="dashboardStatus === 'empty'"
      type="empty"
      title="当前条件暂无正式结果"
      description="后端已返回看板，但当前统计周期和范围没有可展示的正式数据。"
    >
      <template #actions><el-button @click="loadDashboard">重新加载</el-button></template>
    </StatePanel>
    <StatePanel
      v-else-if="dashboardStatus === 'unpublished' && !isEditing"
      type="empty"
      title="看板尚未发布"
      description="当前仅存在草稿配置，请进入编辑模式保存并发布后查看正式数据。"
    />

    <template v-else-if="dashboardStatus === 'ready' || dashboardStatus === 'demo' || (dashboardStatus === 'unpublished' && isEditing)">
    <section v-if="!isEditing && useSchemaViewer" class="dashboard-schema-viewer">
      <section class="dashboard-canvas-frame">
        <div class="dashboard-toolbar" aria-label="看板查询条件">
          <div class="dashboard-query-controls">
            <label class="dashboard-query-control"><span>期间</span>
              <span v-if="isFormalRemoteDashboard" class="dashboard-period-selects" aria-label="统计期间">
                <el-select v-model="remotePeriodStart" class="dashboard-filter dashboard-filter--period" size="small" aria-label="开始月份" data-testid="dashboard-period-start">
                  <el-option v-for="option in periodOptions" :key="`start-${option.value}`" :label="option.label" :value="option.value" />
                </el-select>
                <span aria-hidden="true">至</span>
                <el-select v-model="remotePeriodEnd" class="dashboard-filter dashboard-filter--period" size="small" aria-label="结束月份" data-testid="dashboard-period-end">
                  <el-option v-for="option in periodOptions" :key="`end-${option.value}`" :label="option.label" :value="option.value" />
                </el-select>
                <el-button type="primary" size="small" :loading="remoteQueryLoading" :disabled="!canApplyRemotePeriod" data-testid="dashboard-period-apply" @click="applyRemotePeriodRange">确定</el-button>
              </span>
              <el-select v-else v-model="period" class="dashboard-filter dashboard-filter--compact" size="small" aria-label="统计期间">
                <el-option v-for="option in periodOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
            <label v-if="departmentOptions.length > 1" class="dashboard-query-control"><span>范围</span>
              <el-select v-model="department" class="dashboard-filter dashboard-filter--compact" size="small" aria-label="统计范围">
              <el-option v-for="option in departmentOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
            <div v-else class="dashboard-query-scope" aria-label="统计范围"><span>范围</span><strong>{{ department || departmentOptions[0]?.label || '全院' }}</strong></div>
          </div>
          <DashboardFilterBar class="dashboard-toolbar__filters" compact :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
        </div>
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="activeInteractionFilters" :drill-states="drillRuntimeState" :widgets="viewerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-interactions="clearAllInteractionFilters" @clear-drills="clearAllWidgetDrills" />
        <DashboardCanvas
        :key="`viewer-${dashboardSchema?.id}-${viewerBreakpoint}`"
        ref="viewerCanvasRef"
        class="dashboard-schema-canvas"
        :style="dashboardCanvasStyle"
        :widgets="viewerWidgets"
        :editable="false"
        :columns="viewerColumns"
        :float="dashboardSchema.layout.float"
        aria-label="医疗质量指标看板"
      >
        <template #default="{ widget }">
          <WidgetRenderer
            :widget="widget"
            :primary-kpi="visibleKpis[0]"
            :supporting-kpis="visibleKpis.slice(1)"
            :warnings="getWidgetWarnings(widget)"
            :warning-state="getWarningWidgetState(widget)"
            :ranking="departmentRanking"
            :department="department"
            :updated-at="dashboardQueryLabel"
            interactive
            :get-widget-kpi="getWidgetKpi"
            :get-title="getWidgetTitle"
            :get-description="getWidgetDescription"
            :get-icon="getWidgetIcon"
            :get-chart-option="getWidgetChartOption"
            :is-chart-empty="isChartEmpty"
            :get-chart-aria-label="getWidgetChartAriaLabel"
            :get-table-columns="getWidgetTableColumns"
            :get-table-rows="getWidgetTableRows"
            :get-pie-drill-targets="getWidgetPieDrillTargets"
            :get-pie-drill-source="getWidgetPieDrillSource"
            @primary-analysis="goPrimaryMetricAnalysis"
            @indicator-analysis="goIndicatorAnalysis"
            @widget-analysis="goWidgetAnalysis"
            @chart-click="handleWidgetChartClick"
            @alerts="goAlerts"
          />
        </template>
        </DashboardCanvas>
      </section>
    </section>

    <div v-else class="dashboard-studio">
      <header class="dashboard-command">
        <button class="studio-back" aria-label="退出看板设计" @click="exitDashboardEdit">←</button>
        <div class="studio-title"><span>医疗质量 · DASHBOARD STUDIO</span><h1>{{ editingDashboardSchema?.name || '医疗质量指标总览' }}</h1></div>
        <el-select v-model="requestedDashboardId" size="small" class="studio-scene-switcher" aria-label="看板选择器">
          <el-option v-for="item in dashboardSelectorOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <span class="dashboard-save-state" :class="`is-${saveState}`" role="status">{{ saveStateLabel }}</span>
        <div class="studio-command-actions">
          <el-dropdown @command="handleDashboardMenuCommand">
            <el-button data-testid="dashboard-board-menu" aria-label="看板菜单">看板 ▾</el-button>
            <template #dropdown><el-dropdown-menu>
              <el-dropdown-item disabled>当前：{{ currentDashboardName }}</el-dropdown-item>
              <el-dropdown-item v-for="item in dashboardMenuCommands" :key="item.id" :command="item.id" :divided="item.divided" :disabled="item.id === 'delete' && currentDashboardProtected">{{ item.label }}</el-dropdown-item>
            </el-dropdown-menu></template>
          </el-dropdown>
          <el-button v-if="canRestoreQualitySafetyDemo" data-testid="dashboard-restore-quality-safety-demo" @click="restoreQualitySafetyDemoLayout">恢复演示布局</el-button>
          <el-button v-if="isRemoteDashboard()" @click="openDashboardHistory">版本历史</el-button>
          <el-button data-testid="dashboard-preview" @click="studioPreview = true">预览</el-button>
          <el-button data-testid="dashboard-undo" title="撤销上一步编辑" :disabled="!canUndo" @click="undoDashboardEdit">撤销</el-button>
          <el-button data-testid="dashboard-redo" title="重做上一步编辑" :disabled="!canRedo" @click="redoDashboardEdit">重做</el-button>
          <el-button data-testid="dashboard-save" type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
          <el-button v-if="isRemoteDashboard()" data-testid="dashboard-publish" @click="publishCurrentDashboard">发布</el-button>
          <el-dropdown @command="handleStudioCommand">
            <el-button aria-label="更多看板操作" title="更多看板操作">···</el-button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="reset">恢复默认布局</el-dropdown-item><el-dropdown-item command="exit">退出编辑</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>
      <div class="dashboard-designer-shell">
      <aside class="studio-library" aria-label="组件库">
        <h2>组件库</h2><p>选择指标，再添加分析组件</p>
        <input v-model="librarySearch" class="studio-search" placeholder="搜索组件…" aria-label="搜索组件" />
        <label class="studio-field-label">数据来源</label>
        <el-select v-model="selectedDataCode" aria-label="指标数据" :loading="dashboardLoading || indicatorCatalogLoading">
          <el-option-group v-if="catalogIndicatorSources.length" label="已发布指标">
            <el-option v-for="source in catalogIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
          </el-option-group>
          <el-option-group label="验收数据 / 演示数据">
            <el-option v-for="source in acceptanceIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
          </el-option-group>
          <el-option-group label="当前看板演示指标">
            <el-option v-for="source in indicatorDataSources" :key="source.code" :label="source.name" :value="source.code" />
          </el-option-group>
        </el-select>
        <section v-if="selectedDataSource?.code === UAT_COMPOSITE_SOURCE_CODE" class="dashboard-acceptance-source" data-testid="dashboard-acceptance-source">
          <strong>固定验收数据</strong><span>2026 Q3 · 18 条记录</span><el-button text type="primary" @click="acceptanceDataDialog = true">查看数据</el-button>
        </section>
        <p v-else-if="selectedDataSource?.origin === 'acceptance'" class="dashboard-acceptance-source">验收数据 / 演示数据，不代表医院真实业务数据。</p>
        <p v-if="dashboardStatus === 'demo'" class="dashboard-demo-source" role="status">演示数据：用于功能预览，不是医院真实业务数据。</p>
        <section v-for="group in groupedWidgetLibrary" :key="group.name" class="studio-library-group" :aria-label="group.name">
          <h3>{{ group.name }}</h3>
          <StudioHoverPreview v-for="item in group.items" :key="item.type" :widget-item="item">
            <button :data-testid="`dashboard-library-${item.type}`" class="studio-library-item" :class="{ 'is-current': addWidgetType === item.type }" @click="addWidgetType = item.type">
              <span class="studio-library-icon" aria-hidden="true">{{ item.icon }}</span><span><strong>{{ item.name }}</strong><small>{{ item.hint }}</small></span>
            </button>
          </StudioHoverPreview>
        </section>
        <p v-if="!filteredLibrary.length">没有匹配的组件</p>
        <el-button data-testid="dashboard-add-widget" type="primary" plain :disabled="!selectedDataSource && !['text', 'metric-group'].includes(addWidgetType)" :icon="Plus" @click="addDashboardWidget">添加组件</el-button>
        <section class="studio-template-library" aria-label="布局模板">
          <div class="studio-template-library__heading"><h3>设计模板</h3><span><button type="button" @click="newDashboardForm('blank')">空白看板</button><button type="button" @click="saveCurrentLayoutAsTemplate">保存当前布局</button></span></div>
          <p>选择后查看用途与构图；系统模板与本地模板相互独立。</p>
          <StudioHoverPreview v-for="template in layoutTemplates" :key="template.id" :template="template">
            <article :data-template-id="template.id" class="studio-template-item" :class="{ 'is-selected': selectedTemplateId === template.id }" tabindex="0" @click="selectedTemplateId = template.id">
              <div class="studio-template-preview" aria-hidden="true"><i v-for="(widget, index) in template.widgets" :key="index" :style="templatePreviewStyle(widget)" /></div>
              <div><strong>{{ template.name }}</strong><small>{{ template.description }}</small><span v-if="template.tags" class="studio-template-tags"><em v-for="tag in template.tags.slice(0, 3)" :key="tag">{{ tag }}</em><em v-if="template.density">{{ template.density }}</em></span></div>
              <div class="studio-template-item__actions"><button type="button" @click.stop="applyLayoutTemplate(template)">使用</button><button v-if="!template.id.startsWith('builtin-')" type="button" class="is-danger" @click.stop="removeLocalLayoutTemplate(template.id)">删除</button></div>
            </article>
          </StudioHoverPreview>
          <section v-if="selectedTemplateDetail" class="studio-template-detail" data-testid="dashboard-template-detail"><strong>{{ selectedTemplateDetail.name }}</strong><dl><dt>适用</dt><dd>{{ selectedTemplateDetail.detail?.useCase || selectedTemplateDetail.description }}</dd><dt>布局</dt><dd>{{ selectedTemplateDetail.detail?.layout || '可编辑布局模板' }}</dd><dt>视觉</dt><dd>{{ selectedTemplateDetail.detail?.visual || '沿用组件样式' }}</dd><dt>组件</dt><dd>{{ selectedTemplateDetail.detail?.components || `${selectedTemplateDetail.widgets.length} 个组件` }}</dd></dl></section>
        </section>
        <div class="studio-library-note">点击添加 · 拖动布局<br />空白处拖拽框选 · Ctrl/Shift 追加</div>
      </aside>
      <main class="studio-workspace">
        <div class="studio-canvas-heading"><span>画布</span><span>{{ editingDashboardSchema?.layout?.columns || 24 }} 列 · Clinical Light</span></div>
        <div class="studio-canvas-scroll">
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="activeInteractionFilters" :drill-states="drillRuntimeState" :widgets="designerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-interactions="clearAllInteractionFilters" @clear-drills="clearAllWidgetDrills" />
        <div v-if="!designerWidgets.length" class="studio-empty">
          <span aria-hidden="true">▦</span><h2>创建你的第一个看板组件</h2><p>从左侧选择指标与组件，开始构建分析看板。</p>
          <el-button :disabled="!selectedDataSource" @click="addWidgetType = 'kpi'; addDashboardWidget()">添加 KPI</el-button>
        </div>
      <DashboardCanvas
        :key="`designer-${editingDashboardSchema?.id}`"
        ref="designerCanvasRef"
        class="dashboard-designer-canvas"
        :style="dashboardCanvasStyle"
        :widgets="designerWidgets"
        :editable="true"
        :columns="editingDashboardSchema?.layout?.columns || 24"
        :float="false"
        :selected-widget-id="activeWidgetId"
        :selected-widget-ids="selectedWidgetIds"
        :primary-selected-widget-id="primarySelectedWidgetId"
        aria-label="GridStack 指标看板设计器"
        @widget-select="selectDesignerWidgets($event)"
        @layout-change="syncDesignerLayout($event, true)"
      >
        <template #default="{ widget }">
          <WidgetRenderer
            :widget="widget"
            :primary-kpi="visibleKpis[0]"
            :supporting-kpis="visibleKpis.slice(1)"
            :warnings="getWidgetWarnings(widget)"
            :warning-state="getWarningWidgetState(widget)"
            :ranking="departmentRanking"
            :department="department"
            :updated-at="dashboardQueryLabel"
            editing
            designer
            :selected-metric-item-id="widget.id === activeWidgetId ? selectedMetricItemId : ''"
            :get-widget-kpi="getWidgetKpi"
            :get-title="getWidgetTitle"
            :get-description="getWidgetDescription"
            :get-icon="getWidgetIcon"
            :get-chart-option="getWidgetChartOption"
            :is-chart-empty="isChartEmpty"
            :get-chart-aria-label="getWidgetChartAriaLabel"
            :get-table-columns="getWidgetTableColumns"
            :get-table-rows="getWidgetTableRows"
            :get-pie-drill-targets="getWidgetPieDrillTargets"
            :get-pie-drill-source="getWidgetPieDrillSource"
            @metric-item-select="selectMetricGroupItem"
            @metric-item-add="addMetricGroupItemFromCanvas"
            @metric-item-duplicate="duplicateMetricGroupItemFromCanvas"
            @metric-item-remove="removeMetricGroupItemFromCanvas"
            @metric-item-reorder="reorderMetricGroupItemFromCanvas"
          />
        </template>
      </DashboardCanvas>
        </div>
      </main>
      <aside class="studio-inspector" aria-label="组件属性">
        <div class="studio-inspector-heading"><div><h2>{{ inspectorObjectTitle }}</h2><p>{{ inspectorObjectType }}</p></div><span class="studio-inspector-heading__actions"><button data-testid="dashboard-settings" @click="showDashboardSettings">看板设置</button><button data-testid="dashboard-configure-widget" :disabled="!activeDesignerWidget" @click="openWidgetConfig(activeWidgetId)">配置</button></span></div>
        <template v-if="!selectedWidgetIds.length">
          <section class="dashboard-settings-inspector"><h3>看板设置</h3><label>名称<input :value="editingDashboardSchema?.name" @change="updateDashboardMetadata('name', $event.target.value)" /></label><label>描述<textarea :value="editingDashboardSchema?.description" @change="updateDashboardMetadata('description', $event.target.value)" /></label><label>类型<select :value="editingDashboardSchema?.dashboardType" @change="updateDashboardMetadata('dashboardType', $event.target.value)"><option value="hospital-overview">全院概览</option><option value="topic">专题看板</option><option value="scene">场景看板</option><option value="department">科室看板</option><option value="custom">自定义看板</option></select><small>定义业务用途与入口类型，不直接改变组件数据。</small></label><label>分类<input :value="editingDashboardSchema?.category" @change="updateDashboardMetadata('category', $event.target.value)" /><small>用于看板分类和检索，不直接影响图表数据。</small></label><label>范围<select :value="editingDashboardSchema?.scope" @change="updateDashboardMetadata('scope', $event.target.value)"><option value="hospital">全院</option><option value="department">科室</option><option value="personal">个人</option></select><small>定义适用业务范围；实际权限由服务端控制。</small></label><label>背景预设<select :value="editingDashboardSchema?.appearance?.background?.value || '#ffffff'" @change="updateDashboardBackground($event.target.value)"><option value="#ffffff">临床白</option><option value="#eaf5ff">雾蓝</option><option value="#eaf8f6">浅青医疗</option><option value="linear-gradient(135deg,#d9efff 0%,#f7fbff 52%,#e5f6ef 100%)">蓝青渐变</option><option value="linear-gradient(135deg,#0f4c81 0%,#1261a6 52%,#1f7f91 100%)">深海蓝</option><option value="linear-gradient(135deg,#e8f0ff 0%,#f7f4ff 52%,#f0fbf7 100%)">清透渐变</option></select><small>编辑画布与预览会同步显示该背景。</small></label><BackgroundAssetPicker :model-value="editingDashboardSchema?.appearance?.background?.assetKey || ''" @update:model-value="updateDashboardBuiltinBackground" /><label>图片适配<select :value="editingDashboardSchema?.appearance?.background?.size || 'cover'" @change="updateDashboardBackgroundOption('size', $event.target.value)"><option value="cover">覆盖</option><option value="contain">包含</option><option value="auto">原始尺寸</option></select></label><label>图片位置<select :value="editingDashboardSchema?.appearance?.background?.position || 'center'" @change="updateDashboardBackgroundOption('position', $event.target.value)"><option value="center">居中</option><option value="top">顶部</option><option value="bottom">底部</option></select></label><label>背景叠层<input type="range" min="0" max="0.8" step="0.05" :value="editingDashboardSchema?.appearance?.background?.overlay || 0" @input="updateDashboardBackgroundOption('overlay', Number($event.target.value))" /></label><label>背景强度 <output>{{ dashboardBackgroundIntensity }}%</output><input type="range" min="35" max="100" step="5" :value="dashboardBackgroundIntensity" @input="updateDashboardBackgroundIntensity($event.target.value)" /></label><small>降低强度可柔化渐变；深色背景会保留浅色卡片对比度。</small></section>
          <CardSurfaceControls @apply="applyDashboardCardSurface" />
          <section class="dashboard-settings-inspector"><h3>网格</h3><label>Grid Columns<select :value="editingDashboardSchema?.layout?.columns || 24" @change="changeDesignerGridColumns($event.target.value)"><option :value="24">24 列</option><option :value="12">12 列</option></select></label><small>切换将安全重排组件；Viewer 保持自动响应式，不提供平板或手机配置。</small></section>
          <section class="dashboard-settings-inspector dashboard-global-filter-settings" data-testid="dashboard-global-filter-settings"><h3>全局筛选（{{ globalFilterDefinitions.length }}）</h3><GlobalFilterDesigner :definitions="globalFilterDefinitions" :catalog="filterCatalog" :option-sources="globalFilterOptionSources" :widgets="designerWidgets" :compatible-widget-ids-by-filter="compatibleWidgetIdsByGlobalFilter" @change="updateGlobalFilters" @delete="deleteGlobalFilter" @scope-change="updateGlobalFilterScope" /></section>
        </template>
        <section v-else-if="selectedWidgetIds.length > 1" class="dashboard-multi-inspector" aria-label="多组件布局操作">
          <h3>已选择 {{ selectedWidgetIds.length }} 个组件</h3><p>布局操作以 24 列逻辑网格计算。</p>
          <h4>布局</h4><div><button v-for="item in alignmentActions" :key="item.mode" type="button" :disabled="selectionHasLockedWidget" @click="applySelectedLayoutOperation(item.mode)">{{ item.label }}</button></div>
          <h4>分布</h4><div><button type="button" :disabled="selectionHasLockedWidget || selectedWidgetIds.length < 3" @click="applySelectedLayoutOperation('distribute-x')">水平等间距</button><button type="button" :disabled="selectionHasLockedWidget || selectedWidgetIds.length < 3" @click="applySelectedLayoutOperation('distribute-y')">垂直等间距</button></div>
          <button class="studio-delete" type="button" @click="deleteSelectedDesignerWidgets">删除所选</button>
        </section>
        <template v-else>
          <el-tabs v-model="designerInspectorTab">

            <el-tab-pane label="数据" name="data">
              <div class="dashboard-style-form">
                <label>标题 <input data-testid="dashboard-widget-title" type="text" :value="activeDesignerWidget.title || ''" @input="updateDesignerWidget({ title: $event.target.value })" /></label>
              </div>
              <section v-if="activeDesignerWidget.type === 'text'" class="dashboard-style-form dashboard-text-content"><h3>内容</h3><label>标题<input :value="activeDesignerWidget.config?.text?.title || ''" @input="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, text: { ...widget.config?.text, title: $event.target.value } } }))" /></label><label>正文<textarea aria-label="文本正文" :value="activeDesignerWidget.config?.text?.body || ''" @input="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, text: { ...widget.config?.text, body: $event.target.value } } }))" /></label><small>可输入多行看板说明、数据口径或业务提示。</small></section>
              <label v-if="activeWidgetVisualizationOptions.length" class="studio-field-label">展示形式</label>
              <el-select v-if="activeWidgetVisualizationOptions.length" v-model="activeWidgetVisualizationType" aria-label="选中组件展示形式"><el-option v-for="option in activeWidgetVisualizationOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select>
              <MetricGroupInspector v-if="activeDesignerWidget.type === 'metric-group'" :widget="activeDesignerWidget" :sources="availableIndicatorSources" :get-datasets="getBindingDatasets" :selected-item-id="selectedMetricItemId" @change="updateMetricGroupConfig" @select-item="selectedMetricItemId = $event" />
              <WarningWidgetInspector v-else-if="activeDesignerWidget.type === 'warnings'" :model-value="activeDesignerWidget.config?.warning" @update:model-value="updateWarningWidgetConfig" />
              <dl v-else class="dashboard-property-list"><dt>指标</dt><dd>{{ activeDesignerWidget.sourceName || activeDesignerWidget.sourceCode || '未绑定' }}</dd><dt>展示类型</dt><dd>{{ activeDesignerWidget.chartKind || activeDesignerWidget.type }}</dd></dl>
              <section class="dashboard-precise-layout">
                <h3>位置与尺寸</h3>
                <label>X<input :value="activeDesignerWidget.layout.x" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ x: $event.target.value })" /></label>
                <label>Y<input :value="activeDesignerWidget.layout.y" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ y: $event.target.value })" /></label>
                <label>宽度<input :value="activeDesignerWidget.layout.w" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: $event.target.value })" /></label>
                <label>高度<input :value="activeDesignerWidget.layout.h" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ h: $event.target.value })" /></label>
                <label>宽度（%）<input :value="gridWidthToPercentage(activeDesignerWidget.layout.w, editingDashboardSchema.layout.columns)" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: percentageToGridWidth($event.target.value, editingDashboardSchema.layout.columns) })" /></label>
                <small>实际尺寸约 {{ precisePixelSize.width }} × {{ precisePixelSize.height }} px；仅作显示，不保存。</small>
              </section>
              <MultiIndicatorInspector
                v-if="activeDesignerWidget.type === 'chart' && ['line', 'bar', 'table', 'radar'].includes(activeDesignerWidget.chartKind)"
                :widget="activeDesignerWidget"
                :sources="availableIndicatorSources"
                @change="updateDesignerIndicatorBindings"
              />
              <BindingInspector v-if="!['text', 'metric-group', 'warnings'].includes(activeDesignerWidget.type)" :key="`${activeDesignerWidget.id}-${activeDesignerWidget.config?.indicatorBindings?.length || 0}`" :widget="activeDesignerWidget" :datasets="getBindingDatasets(activeDesignerWidget)" @change="updateDesignerBinding" @query-change="updateDesignerQuery" />
              <MapConfigInspector v-if="activeDesignerWidget.type === 'chart' && activeDesignerWidget.chartKind === 'map'" :model-value="activeDesignerWidget.config?.chart" @change="updateDesignerChartConfig" />
              <ComponentScopeInspector
                v-if="!['text', 'metric-group'].includes(activeDesignerWidget.type)"
                :model-value="activeDesignerWidget.config?.backendQuery"
                @change="updateDesignerBackendQuery"
              />
            </el-tab-pane>
            <el-tab-pane label="样式" name="style">
              <div class="dashboard-style-form">
                <template v-if="activeDesignerWidget.type === 'text'"><h3>文本样式</h3><label>对齐<select :value="activeDesignerWidget.config?.text?.align || 'left'" @change="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, text: { ...widget.config?.text, align: $event.target.value } } }))"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><label>字号<input type="number" min="10" max="48" :value="activeDesignerWidget.config?.text?.fontSize || 14" @change="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, text: { ...widget.config?.text, fontSize: Number($event.target.value) } } }))" /></label><label>字重<select :value="activeDesignerWidget.config?.text?.fontWeight || 400" @change="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, text: { ...widget.config?.text, fontWeight: Number($event.target.value) } } }))"><option :value="400">常规</option><option :value="500">中等</option><option :value="600">加粗</option><option :value="700">粗体</option></select></label><label>正文颜色<input type="color" :value="designerStyle.text?.bodyColor || activeDesignerWidget.config?.text?.color || '#52636c'" @input="updateDesignerStyle({ text: { ...designerStyle.text, bodyColor: $event.target.value } })" /></label><label>标题颜色<input type="color" :value="designerStyle.text?.titleColor || '#25343b'" @input="updateDesignerStyle({ text: { ...designerStyle.text, titleColor: $event.target.value } })" /></label></template>
                <ChartStyleInspector :widget="activeDesignerWidget" @update="updateDesignerStyle" @reset="resetDesignerVisualStyle" />
                <SurfaceEffectPicker :style="designerStyle" @update="setWidgetSurfaceEffect" />
                <section class="style-section">
                  <h3>卡片外观</h3><p>卡片背景只影响当前组件；页面背景请在看板设置中调整。</p>
                  <div class="background-mode" role="radiogroup" aria-label="卡片背景"><button v-for="mode in backgroundModes" :key="mode.id" type="button" :class="{ 'is-active': widgetBackgroundMode === mode.id }" @click="setWidgetBackgroundMode(mode.id)">{{ mode.label }}</button></div>
                  <label v-if="widgetBackgroundMode === 'solid'">背景颜色 <input type="color" :value="designerStyle.background" @input="updateDesignerStyle({ background: $event.target.value })" /></label>
                  <div v-if="widgetBackgroundMode === 'gradient'" class="gradient-color-controls" aria-label="卡片渐变颜色">
                    <label>起始颜色 <input type="color" :value="widgetGradientColors[0]" @input="updateWidgetGradientColor(0, $event.target.value)" /></label>
                    <label>结束颜色 <input type="color" :value="widgetGradientColors[1]" @input="updateWidgetGradientColor(1, $event.target.value)" /></label>
                  </div>
                  <template v-if="widgetBackgroundMode === 'image'"><BackgroundAssetPicker :model-value="designerStyle.backgroundAssetKey || ''" @update:model-value="updateDesignerStyle({ ...applyWidgetBackgroundMode(designerStyle, 'image'), backgroundAssetKey: $event, backgroundImage: '' })" /><label>图片适配<select :value="designerStyle.backgroundSize || 'cover'" @change="updateDesignerStyle({ backgroundSize: $event.target.value })"><option value="cover">覆盖</option><option value="contain">包含</option><option value="auto">原始尺寸</option></select></label><label>图片位置<select :value="designerStyle.backgroundPosition || 'center'" @change="updateDesignerStyle({ backgroundPosition: $event.target.value })"><option value="center">居中</option><option value="top">顶部</option><option value="bottom">底部</option></select></label><label>背景叠层<input type="range" min="0" max="0.8" step="0.05" :value="designerStyle.backgroundOverlay || 0" @input="updateDesignerStyle({ backgroundOverlay: Number($event.target.value) })" /></label></template>
                </section>
                <section class="style-section style-section--separated">
                  <h3>边框</h3>
                  <label>边框颜色 <input type="color" :value="designerStyle.borderColor" @input="updateDesignerStyle({ borderColor: $event.target.value })" /></label>
                  <label>边框宽度 <input data-testid="dashboard-widget-border-width" type="number" min="0" max="8" :value="designerStyle.borderWidth" @input="updateDesignerStyle({ borderWidth: Number($event.target.value) })" /></label>
                  <label>圆角 <input type="number" min="0" max="32" :value="designerStyle.borderRadius" @input="updateDesignerStyle({ borderRadius: Number($event.target.value) })" /></label>
                </section>
                <h3>间距</h3><label>内边距 <input type="number" min="0" max="48" :value="designerStyle.padding" @input="updateDesignerStyle({ padding: Number($event.target.value) })" /></label>
                <h3>效果</h3><label>透明度 <input type="number" min="0" max="1" step="0.05" :value="designerStyle.opacity" @input="updateDesignerStyle({ opacity: Number($event.target.value) })" /></label><label>阴影 <select :value="designerStyle.shadow" @change="updateDesignerStyle({ shadow: $event.target.value })"><option value="none">无</option><option value="sm">小</option><option value="md">中</option><option value="lg">大</option><option value="glow">发光</option></select></label>
              </div>
            </el-tab-pane>
            <el-tab-pane v-if="!['warnings', 'text'].includes(activeDesignerWidget.type)" label="交互" name="interaction">
              <BindingInteractionInspector
                :widget="activeDesignerWidget"
                :datasets="getBindingDatasets(activeDesignerWidget)"
                @change="updateDesignerInteraction"
                @query-change="updateDesignerQuery"
              />
            </el-tab-pane>
            <el-tab-pane label="高级" name="advanced">
              <div class="dashboard-style-form"><label><input data-testid="dashboard-widget-locked" type="checkbox" :checked="activeDesignerWidget.config?.locked === true" @change="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, locked: $event.target.checked } }))" />锁定位置和尺寸</label><p class="dashboard-property-inspector__empty">锁定后仍可选中和编辑数据/样式，但不能拖动或调整尺寸。</p></div>
            </el-tab-pane>
          </el-tabs>
        </template>
        <button v-if="selectedWidgetIds.length <= 1" class="studio-delete" data-testid="dashboard-delete-widget" :disabled="!activeDesignerWidget" @click="deleteActiveWidget">删除组件</button>
      </aside>
      </div>
      <footer class="studio-status"><span>{{ designerWidgets.length }} 个组件 · {{ activeDesignerWidget ? '已选中 ' + getWidgetTitle(activeDesignerWidget) : '未选中组件' }}</span><span>拖动调整位置 · 右下角调整大小</span></footer>
      <el-dialog v-model="studioPreview" title="看板预览" width="88%" destroy-on-close>
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="activeInteractionFilters" :drill-states="drillRuntimeState" :widgets="designerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-interactions="clearAllInteractionFilters" @clear-drills="clearAllWidgetDrills" />
        <div class="dashboard-preview-frame">
        <DashboardCanvas v-if="studioPreview" :style="dashboardCanvasStyle" :widgets="previewWidgets" :columns="24" :editable="false">
          <template #default="{ widget }"><WidgetRenderer :widget="widget" :primary-kpi="visibleKpis[0]" :supporting-kpis="visibleKpis.slice(1)" :warnings="getWidgetWarnings(widget)" :warning-state="getWarningWidgetState(widget)" :ranking="departmentRanking" :department="department" :updated-at="dashboardQueryLabel" interactive :get-widget-kpi="getWidgetKpi" :get-title="getWidgetTitle" :get-description="getWidgetDescription" :get-icon="getWidgetIcon" :get-chart-option="getWidgetChartOption" :is-chart-empty="isChartEmpty" :get-chart-aria-label="getWidgetChartAriaLabel" :get-table-columns="getWidgetTableColumns" :get-table-rows="getWidgetTableRows" :get-pie-drill-targets="getWidgetPieDrillTargets" :get-pie-drill-source="getWidgetPieDrillSource" @chart-click="handleWidgetChartClick" /></template>
        </DashboardCanvas>
        </div>
      </el-dialog>
      <el-dialog v-model="dashboardMenuDialog" title="新建看板" width="520px" destroy-on-close>
        <div class="dashboard-create-form">
          <label>名称<input v-model="dashboardCreateForm.name" maxlength="80" /></label>
          <label>描述<textarea v-model="dashboardCreateForm.description" maxlength="300" /></label>
          <label>类型<select v-model="dashboardCreateForm.dashboardType"><option value="hospital-overview">全院概览</option><option value="topic">专题看板</option><option value="scene">场景看板</option><option value="department">科室看板</option><option value="custom">自定义看板</option></select></label>
          <label>分类<input v-model="dashboardCreateForm.category" maxlength="80" /></label>
          <label>适用范围<select v-model="dashboardCreateForm.scope"><option value="hospital">全院</option><option value="department">科室</option><option value="personal">个人</option></select></label>
          <label v-if="dashboardCreateMode === 'template'">布局模板<select v-model="dashboardCreateForm.templateId"><option v-for="template in layoutTemplates" :key="template.id" :value="template.id">{{ template.name }}</option></select></label>
        </div>
        <template #footer><el-button @click="dashboardMenuDialog = false">取消</el-button><el-button type="primary" @click="createDashboardFromMenu">创建并编辑</el-button></template>
      </el-dialog>
      <el-dialog v-model="acceptanceDataDialog" title="固定验收数据 · 2026 Q3" width="960px" destroy-on-close>
        <p class="dashboard-acceptance-note">本数据仅用于 Dashboard 前端验收，不代表医院真实业务数据。</p>
        <section class="dashboard-acceptance-summary"><strong>月度全院平均：</strong><span>2026-07 = 47.33</span><span>2026-08 = 48.83</span><span>2026-09 = 50.33</span><strong>2026-09 科室平均：</strong><span>呼吸内科 = 56</span><span>心内科 = 49</span><span>普外科 = 46</span></section>
        <el-table :data="dashboardAcceptanceRows" size="small" max-height="440"><el-table-column prop="month" label="month" width="100" /><el-table-column prop="department" label="department" width="100" /><el-table-column prop="disease" label="disease" width="100" /><el-table-column prop="scene" label="scene" width="125" /><el-table-column prop="indicatorCategory" label="indicatorCategory" width="120" /><el-table-column prop="numerator" label="numerator" /><el-table-column prop="denominator" label="denominator" /><el-table-column prop="indicatorValue" label="indicatorValue" /></el-table>
      </el-dialog>
    </div>
    </template>
    <el-dialog v-if="dashboardStatus === 'error'" v-model="dashboardMenuDialog" title="新建服务端看板" width="520px" destroy-on-close>
      <div class="dashboard-create-form">
        <label>名称<input v-model="dashboardCreateForm.name" maxlength="80" /></label>
        <label>描述<textarea v-model="dashboardCreateForm.description" maxlength="300" /></label>
        <label>类型<select v-model="dashboardCreateForm.dashboardType"><option value="hospital-overview">全院概览</option><option value="topic">专题看板</option><option value="scene">场景看板</option><option value="department">科室看板</option><option value="custom">自定义看板</option></select></label>
        <label>分类<input v-model="dashboardCreateForm.category" maxlength="80" /></label>
        <label>适用范围<select v-model="dashboardCreateForm.scope"><option value="hospital">全院</option><option value="department">科室</option><option value="personal">个人</option></select></label>
      </div>
      <template #footer><el-button @click="dashboardMenuDialog = false">取消</el-button><el-button type="primary" @click="createDashboardFromMenu">创建并编辑</el-button></template>
    </el-dialog>
    <el-drawer v-model="dashboardHistoryVisible" title="看板版本历史" size="440px" destroy-on-close>
      <StatePanel v-if="dashboardHistoryLoading" type="loading" title="正在读取版本历史" />
      <StatePanel v-else-if="!dashboardServerVersions.length" type="empty" title="暂无历史版本" description="保存看板后，版本记录会显示在这里。" />
      <div v-else class="dashboard-version-list">
        <article v-for="version in dashboardServerVersions" :key="version.id" class="dashboard-version-item">
          <header><strong>版本 {{ version.versionNo }}</strong><el-tag size="small" :type="version.publicationStatus === 'PUBLISHED' ? 'success' : 'info'">{{ dashboardVersionStatusLabel(version.publicationStatus) }}</el-tag></header>
          <p>{{ formatDashboardVersionTime(version.publishedAt || version.updatedAt || version.createdAt) }}</p>
          <span>{{ Array.isArray(version.widgets) ? version.widgets.length : 0 }} 个组件</span>
          <el-button type="primary" plain size="small" :loading="restoringDashboardVersionId === String(version.id)" @click="restoreServerDashboardVersion(version)">恢复为新草稿</el-button>
        </article>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Check,
  Close,
  Delete,
  Edit,
  Histogram,
  InfoFilled,
  PieChart,
  Plus,
  RefreshLeft,
  TrendCharts,
  TrophyBase,
  WarningFilled
} from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import DashboardCanvas from '@/idmp/features/dashboard/components/DashboardCanvas.vue'
import WidgetRenderer from '@/idmp/features/dashboard/components/WidgetRenderer.vue'
import BindingInspector from '@/idmp/features/dashboard/components/BindingInspector.vue'
import MultiIndicatorInspector from '@/idmp/features/dashboard/components/MultiIndicatorInspector.vue'
import ComponentScopeInspector from '@/idmp/features/dashboard/components/ComponentScopeInspector.vue'
import MapConfigInspector from '@/idmp/features/dashboard/components/MapConfigInspector.vue'
import MetricGroupInspector from '@/idmp/features/dashboard/components/MetricGroupInspector.vue'
import WarningWidgetInspector from '@/idmp/features/dashboard/components/WarningWidgetInspector.vue'
import StudioHoverPreview from '@/idmp/features/dashboard/components/StudioHoverPreview.vue'
import BindingInteractionInspector from '@/idmp/features/dashboard/components/BindingInteractionInspector.vue'
import DashboardFilterBar from '@/idmp/features/dashboard/components/DashboardFilterBar.vue'
import DashboardContextBar from '@/idmp/features/dashboard/components/DashboardContextBar.vue'
import GlobalFilterDesigner from '@/idmp/features/dashboard/components/GlobalFilterDesigner.vue'
import { initialFilterValues } from '@/idmp/features/dashboard/filterEngine.js'
import { dashboardFilterCatalog, deriveDependentFilterOptions, normalizeDependentFilterValues } from '@/idmp/features/dashboard/queryAdapter.js'
import { provide } from 'vue'
import { compareDashboardGridMembership } from '@/idmp/features/dashboard/gridMembership.js'
import { createWidgetBindingDatasets } from '@/idmp/features/dashboard/fieldCatalog.js'
import { bindingKind } from '@/idmp/features/dashboard/bindingEngine.js'
import { resolveDrillHierarchy } from '@/idmp/features/dashboard/drillDown.js'
import { createDefaultBinding } from '@/idmp/features/dashboard/smartDefaultBinding.js'
import { createMultiIndicatorDataset, multiIndicatorMeasureField, normalizeIndicatorBindings } from '@/idmp/features/dashboard/multiIndicator.js'
import { buildRemoteFilterOptionQuery, buildRemoteWidgetQuery, resolveDashboardQueryState } from '@/idmp/features/dashboard/remoteQuery.js'
import { buildIndicatorAnalysisPeriodContext, buildIndicatorAnalysisRouteQuery } from '@/idmp/features/dashboard/analysisNavigation.js'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import {
  copyDashboard, createDashboard, deleteDashboard, fetchDashboardCatalog,
  fetchDashboardDataSourceFields, fetchDashboardDataSources, fetchDashboardDefinition,
  fetchDashboardVersions, fetchDashboardDataSourcePeriods, fetchDashboardFilterOptions, previewDashboardWidget, publishDashboard, queryDashboard, restoreDashboardVersion, saveDashboard
} from '@/idmp/api/modules/analysisDashboard'
import {
  applyDefaultDashboardBindings, dashboardDataSourceToFrontend, dashboardDetailMeta,
  dashboardDetailToSchema, dashboardFieldsToFrontend, dashboardSummaryToCatalogEntry,
  isMockDashboardDetail, schemaToDashboardPayload, schemaToMockDashboardPayload,
  selectDashboardVersion, sortDashboardDataSourcesByIndicatorCreatedAt, widgetResultToDataset
} from '@/idmp/api/adapters/dashboard'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import { fetchWarnings } from '@/idmp/api/modules/warnings'
import { fetchIndicatorAnalysis, fetchIndicators } from '@/idmp/api/modules/indicators'
import { normalizePage } from '@/idmp/api/adapters/warning'
import { dashboardTrend, dashboardWarnings as mockDashboardWarnings } from '@/idmp/data/demo'
import { mockDashboardDepartmentRanking, mockIndicatorDataSources } from '@/idmp/features/dashboard/mockData'
import { dashboardAcceptanceRows, dashboardAcceptanceSources } from '@/idmp/features/dashboard/acceptanceData.js'
import { applyMortalityReadonlyChain } from '@/idmp/features/dashboard/mortalityAdapter'
import {
  DASHBOARD_CODE,
  DASHBOARD_DESIGN_WIDTH,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  widgetTypeOptions
} from '@/idmp/features/dashboard/constants'
import { LOCAL_SCENE_DASHBOARDS, findLocalSceneByDashboardId, shouldConfirmDashboardSceneSwitch } from '@/idmp/features/dashboard/sceneRegistry.js'
import { canApplyDashboardLoad, canRefreshRemoteDashboard, createDashboardSelectorOptions, shouldSkipRemoteDashboardBootstrap } from '@/idmp/features/dashboard/dashboardIdentity.js'
import { dashboardDemoPolicy, shouldUseDashboardDemoFallback } from '@/idmp/features/dashboard/demoPolicy.js'
import { createDashboardEditingSnapshot } from '@/idmp/features/dashboard/editSession.js'
import { buildPublishedIndicatorAnalysisQuery, buildPublishedIndicatorTrendPreviewQuery, createPublishedDashboardPeriodOptions, dateRangeForMonths, resolvePublishedDashboardPeriod, resolvePublishedDashboardPeriodRange, schemaPublishedIndicatorSourceCodes } from '@/idmp/features/dashboard/publishedIndicatorRuntime.js'
import { dashboardActiveId, dashboardRequestedId, dashboardSceneCode, designerImmersive, notifyDashboardCatalogChanged } from '@/idmp/layout/shellState.js'
import { createQualitySafetyDemoSchema } from '@/idmp/features/dashboard/acceptanceExample.js'
import { addMetricGroupItem, createMetricGroupConfig, duplicateMetricGroupItem, metricGroupSourceCodes, removeMetricGroupItem, reorderMetricGroupItem } from '@/idmp/features/dashboard/metricGroup.js'
import { createWarningWidgetConfig, normalizeWarningWidgetConfig, warningEventToDashboardItem, warningWidgetQuery } from '@/idmp/features/dashboard/warningWidget.js'
import { canRestoreQualitySafetyDemo as canRestoreQualitySafetyDemoEntry, createQualitySafetyDemoRestoreResult } from '@/idmp/features/dashboard/qualitySafetyDemoRestore.js'
import { applyGlobalFilterScope, removeGlobalFilter } from '@/idmp/features/dashboard/globalFilterDesignerModel.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '@/idmp/features/dashboard/globalFilterCompatibility.js'
import {
  getDashboardSchemaStorageKey,
  migrateDashboardSchema,
  normalizeDashboardSchema,
  validateDashboardSchema,
  getDefaultGridLayout,
  mergeWidgetMetadataAndLayout,
  normalizeWidgetMetadata,
  synchronizeDashboardGridLayout,
  changeDashboardGridColumns,
  updateDashboardWidget,
  clonePersistableValue
} from '@/idmp/features/dashboard/schema'
import { DASHBOARD_RECOVERY_STATUS, persistDashboardSchema, recoverDashboardSchema } from '@/idmp/features/dashboard/persistence'
import { BUILT_IN_DASHBOARD_IDS, DASHBOARD_STUDIO_MENU_COMMANDS, duplicateLocalDashboard, removeLocalDashboard, renameLocalDashboard } from '@/idmp/features/dashboard/catalog.js'
import { DASHBOARD_UNSAVED_MESSAGE, handleDashboardBeforeUnload, shouldProtectDashboardNavigation } from '@/idmp/features/dashboard/navigationProtection'
import { getWidgetGridConstraints, legacyPixelLayoutToGrid } from '@/idmp/features/dashboard/gridLayout'
import { clearWidgetSelection, nextWidgetSelection, nextMarqueeSelection, alignSelectedLayout, distributeSelectedLayout } from '@/idmp/features/dashboard/layoutOperations.js'
import { dashboardBreakpointForWidth, deriveResponsiveLayout, responsiveColumns } from '@/idmp/features/dashboard/responsiveLayout.js'
import { applyWidgetLayoutToCanvas, gridWidthToPercentage, percentageToGridWidth, validatePreciseLayout } from '@/idmp/features/dashboard/preciseLayout.js'
import { BUILT_IN_LAYOUT_TEMPLATES, applyLayoutTemplateToDashboard, createLayoutTemplateFromDashboard, deleteLocalLayoutTemplate, readLocalLayoutTemplates, saveLocalLayoutTemplate, validateLayoutTemplate } from '@/idmp/features/dashboard/layoutTemplates.js'
import {
  createDefaultLayout,
  getWidgetVisualizationType,
  getWidgetVisualizationTypes,
  normalizeLayout
} from '@/idmp/features/dashboard/layout'
import {
  buildDashboardDrillRouteQuery,
  applyIndicatorAnalysisToSource,
  createDashboardChartOption,
  createKpiData,
  getVisualizationTitle,
  normalizeDashboardDrillTarget,
  resolveDashboardChartDrillTarget
} from '@/idmp/features/dashboard/visualization'
import { applyWidgetBackgroundMode, createWidgetGradient, parseWidgetGradientColors, resetWidgetVisualStyle, resolveWidgetBackgroundMode } from '@/idmp/features/dashboard/visualStyle'
import ChartStyleInspector from '@/idmp/features/dashboard/components/ChartStyleInspector.vue'
import BackgroundAssetPicker from '@/idmp/features/dashboard/components/BackgroundAssetPicker.vue'
import CardSurfaceControls from '@/idmp/features/dashboard/components/CardSurfaceControls.vue'
import SurfaceEffectPicker from '@/idmp/features/dashboard/components/SurfaceEffectPicker.vue'
import { resolveBackgroundAsset, resolveDashboardSurfaceTone } from '@/idmp/features/dashboard/backgroundAssets.js'
import { applyCardSurface, applyCardSurfaceToWidgets } from '@/idmp/features/dashboard/cardSurface.js'

import '@/idmp/features/dashboard/dashboard-v2.css'
const studioPreview = ref(false)
const acceptanceDataDialog = ref(false)
const UAT_COMPOSITE_SOURCE_CODE = 'UAT_QUALITY_SAFETY_Q3'
const dashboardMenuDialog = ref(false)
const dashboardHistoryVisible = ref(false)
const dashboardHistoryLoading = ref(false)
const dashboardServerVersions = ref([])
const restoringDashboardVersionId = ref('')
const dashboardCreateMode = ref('blank')
const localDashboardCatalog = ref([])
const dashboardCreateForm = ref({ name: '', description: '', dashboardType: 'custom', category: '', scope: 'personal', templateId: BUILT_IN_LAYOUT_TEMPLATES[0].id })
const librarySearch = ref('')
const localLayoutTemplates = ref([])
const layoutTemplates = computed(() => [...BUILT_IN_LAYOUT_TEMPLATES, ...localLayoutTemplates.value])
const selectedTemplateId = ref(BUILT_IN_LAYOUT_TEMPLATES[0].id)
const selectedTemplateDetail = computed(() => layoutTemplates.value.find(template => template.id === selectedTemplateId.value) || layoutTemplates.value[0] || null)
const acceptanceIndicatorSources = dashboardAcceptanceSources
const dashboardMenuCommands = DASHBOARD_STUDIO_MENU_COMMANDS
const libraryItems = [
  { group: '指标', type: 'metric-group', name: '指标组', hint: '集中展示多个关键指标', icon: '▦' },
  { group: '指标', type: 'kpi', name: 'KPI 指标卡', hint: '指标 · 单值与目标', icon: '◫' },
  { group: '常用图表', type: 'bar', name: '比较柱状', hint: '比较 · 分类对比', icon: '▥' },
  { group: '常用图表', type: 'line', name: '趋势折线', hint: '趋势 · 时间序列', icon: '⌁' },
  { group: '常用图表', type: 'pie', name: '构成环形', hint: '构成 · 占比分析', icon: '◉' },
  { group: '分析图表', type: 'scatter', name: '散点图', hint: '双度量 · 分布', icon: '⠿' },
  { group: '分析图表', type: 'radar', name: '雷达图', hint: '多维 · 对比分析', icon: '◇' },
  { group: '分析图表', type: 'funnel', name: '漏斗图', hint: '阶段 · 转化分析', icon: '▽' },
  { group: '分析图表', type: 'heatmap', name: '热力图', hint: '维度 · 数值矩阵', icon: '▦' },
  { group: '展示', type: 'gauge', name: '仪表盘', hint: '单值 · 进度展示', icon: '◌' },
  { group: '展示', type: 'map', name: '地图 / 区域分布', hint: '区域维度 · 数值度量', icon: '⌖' },
  { group: '展示', type: 'table', name: '数据表格', hint: '明细 · 分组数值', icon: '▤' },
  { group: '展示', type: 'warnings', name: '预警事件', hint: '监控 · 事件列表与状态', icon: '!' },
  { group: '展示', type: 'text', name: '文本', hint: '文本说明 · 口径与提示', icon: 'T' }
]
const filteredLibrary = computed(() => libraryItems.filter(item => (item.name + item.hint).includes(librarySearch.value.trim())))
const groupedWidgetLibrary = computed(() => ['指标', '常用图表', '分析图表', '展示']
  .map(name => ({ name, items: filteredLibrary.value.filter(item => item.group === name) }))
  .filter(group => group.items.length))
function handleStudioCommand(command) {
  if (command === 'reset') resetDashboardLayout()
  if (command === 'exit') exitDashboardEdit()
}
const router = useRouter()
const route = useRoute()
const isDev = import.meta.env.DEV
const activeSceneCode = dashboardSceneCode
const managedDashboardId = computed(() => typeof route.query.id === 'string' && route.query.id.trim() ? route.query.id.trim() : '')
const activeDashboardId = dashboardActiveId
const requestedDashboardId = dashboardRequestedId
if (managedDashboardId.value) { activeDashboardId.value = managedDashboardId.value; requestedDashboardId.value = managedDashboardId.value }
const loadedDashboardId = ref('')
const activeScene = computed(() => findLocalSceneByDashboardId(activeDashboardId.value))
const activeDashboardStorageKey = computed(() => getDashboardSchemaStorageKey(activeDashboardId.value))
const currentDashboardId = computed(() => activeDashboardId.value)
const currentDashboardName = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.name || activeScene.value?.name || '本地看板')
const currentDashboardProtected = computed(() => !activeScene.value && !BUILT_IN_DASHBOARD_IDS.has(currentDashboardId.value) ? false : true)
const dashboardSelectorOptions = computed(() => [
  ...localDashboardCatalog.value.map(item => ({ ...item, origin: 'remote' })),
  ...LOCAL_SCENE_DASHBOARDS.map(item => ({ id: item.dashboardId, name: `演示 · ${item.name}`, origin: 'system-scene' }))
])
const canRestoreQualitySafetyDemo = computed(() => canRestoreQualitySafetyDemoEntry({ isEditing: isEditing.value, dashboardId: activeDashboardId.value }))
const periodOptions = ref([
  { label: '全部期间', value: '' },
  { label: '2025 年 12 月', value: '2025-12' }
])
const departmentOptions = [{ label: '全院', value: '' }]
const period = ref('2025-12')
const remotePeriodRange = ref([])
const remotePeriodDraft = ref([])
const remoteQueryLoading = ref(false)
function setRemotePeriodBoundary(index, value) {
  const next = [...remotePeriodDraft.value]
  next[index] = value
  if (!next[index === 0 ? 1 : 0]) next[index === 0 ? 1 : 0] = value
  if (next[0] > next[1]) next[index === 0 ? 1 : 0] = value
  remotePeriodDraft.value = next
}
const remotePeriodStart = computed({
  get: () => remotePeriodDraft.value[0] || '',
  set: value => setRemotePeriodBoundary(0, value)
})
const remotePeriodEnd = computed({
  get: () => remotePeriodDraft.value[1] || '',
  set: value => setRemotePeriodBoundary(1, value)
})
const canApplyRemotePeriod = computed(() => {
  const draft = resolvePublishedDashboardPeriodRange(remotePeriodDraft.value, periodOptions.value)
  return draft.every(Boolean) && JSON.stringify(draft) !== JSON.stringify(remotePeriodRange.value)
})
function applyRemotePeriodRange() {
  if (!canApplyRemotePeriod.value) return
  remotePeriodRange.value = resolvePublishedDashboardPeriodRange(remotePeriodDraft.value, periodOptions.value)
}
const department = ref('')
const designerCanvasRef = ref()
const viewerCanvasRef = ref()
const isEditing = ref(false)
const dashboardEditLoading = ref(false)
const selectedWidgetIds = ref([])
const primarySelectedWidgetId = ref('')
// Selection is a Designer affordance only. It is deliberately not written to the schema.
const selectedMetricItemId = ref('')
const activeWidgetId = computed({
  get: () => primarySelectedWidgetId.value,
  set: value => {
    const id = String(value || '')
    selectedWidgetIds.value = id ? [id] : []
    primarySelectedWidgetId.value = id
  }
})
const alignmentActions = [{ mode: 'left', label: '左对齐' }, { mode: 'h-center', label: '水平居中' }, { mode: 'right', label: '右对齐' }, { mode: 'top', label: '顶部对齐' }, { mode: 'v-center', label: '垂直居中' }, { mode: 'bottom', label: '底部对齐' }]
const selectionHasLockedWidget = computed(() => designerWidgets.value.some(widget => selectedWidgetIds.value.includes(widget.id) && widget.config?.locked === true))
const selectedDataCode = ref('')
const addWidgetType = ref('kpi')
const indicatorDataSources = ref(cloneDashboardSources(mockIndicatorDataSources))
const catalogIndicatorSources = ref([])
const remoteWidgetDatasets = ref({})
const remoteMultiIndicatorDatasets = ref({})
const remoteWidgetPreviewGenerations = new Map()
const remoteFieldCatalog = ref({})
const remoteFilterOptions = ref({})
const remoteDashboardMeta = ref(null)
const remoteDashboardIsMock = ref(false)
const isFormalRemoteDashboard = computed(() => Boolean(remoteDashboardMeta.value?.dashboardId)
  && String(remoteDashboardMeta.value.dashboardId) === String(activeDashboardId.value)
  && !remoteDashboardIsMock.value)
const remoteCatalogIsEmpty = computed(() => localDashboardCatalog.value.length === 0)
// The eager filter watcher evaluates bindingDatasets during setup, so this source catalog must exist first.
const availableIndicatorSources = computed(() => {
  const sources = [...acceptanceIndicatorSources, ...indicatorDataSources.value, ...catalogIndicatorSources.value]
  return [...new Map(sources.map(source => [source.code, source])).values()]
})
const indicatorCatalogLoading = ref(false)
const indicatorHydrationRequests = new Map()
const dashboardStatus = ref('select')
const dashboardLoadMessage = ref('')
const canRefreshCurrentRemoteDashboard = computed(() => canRefreshRemoteDashboard({
  activeDashboardId: activeDashboardId.value,
  schemaDashboardId: dashboardSchema.value?.id,
  metadataDashboardId: remoteDashboardMeta.value?.dashboardId,
  publishedVersionId: remoteDashboardMeta.value?.currentPublishedVersionId,
  isMock: remoteDashboardIsMock.value,
  isLoading: dashboardStatus.value === 'loading'
}))
const editingDashboardSchema = ref(null)
const dashboardHistory = ref([])
const dashboardHistoryIndex = ref(-1)
let restoringDashboardHistory = false
let reconcilingRemotePeriod = false
const designerWidgets = computed(() => editingDashboardSchema.value?.widgets || [])
const inspectorObjectTitle = computed(() => selectedWidgetIds.value.length > 1 ? `已选择 ${selectedWidgetIds.value.length} 个组件` : activeDesignerWidget.value ? getWidgetTitle(activeDesignerWidget.value) : '看板设置')
const inspectorObjectType = computed(() => {
  if (!activeDesignerWidget.value) return '页面背景、卡片背景与全局筛选'
  if (selectedWidgetIds.value.length > 1) return `已选择 ${selectedWidgetIds.value.length} 个组件 · 布局操作`
  const labels = { kpi: '指标卡', 'metric-group': '指标组', text: '文本', chart: '图表' }
  const widget = activeDesignerWidget.value
  return labels[widget.type] || widget.chartKind || '组件'
})
const canUndo = computed(() => isEditing.value && dashboardHistoryIndex.value > 0)
const canRedo = computed(() => isEditing.value && dashboardHistoryIndex.value >= 0 && dashboardHistoryIndex.value < dashboardHistory.value.length - 1)
const designerInspectorTab = ref('data')
const designerDrawerOpen = ref(false)
const dashboardDirty = ref(false)
const saveState = ref('saved')
const lastSavedAt = ref('')
const presentationMode = ref('standard')
const presentationRef = ref()
const dashboardSchema = ref(null)
const dashboardBackgroundConfig = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.appearance?.background || {})
const dashboardTheme = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.appearance?.theme === 'mint-medical' ? 'mint-medical' : 'default')
const dashboardBackground = computed(() => dashboardBackgroundConfig.value.value || '#ffffff')
const dashboardBackgroundIntensity = computed(() => {
  const value = Number((isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.appearance?.background?.intensity)
  return Number.isFinite(value) ? Math.min(100, Math.max(35, Math.round(value))) : 100
})
const dashboardSurfaceStyle = computed(() => ({
  '--dashboard-background': dashboardBackground.value
}))
const dashboardCanvasStyle = computed(() => {
  const config = dashboardBackgroundConfig.value
  const value = String(config.value || '').trim()
  const gradient = /^linear-gradient\(/i.test(value) ? value : ''
  const color = gradient ? '#ffffff' : (value || '#ffffff')
  const image = safeBackgroundImage(resolveBackgroundAsset(config.assetKey) || config.image)
  const layers = []
  const sizes = []
  const positions = []
  const overlay = Math.min(0.8, Math.max(0, Number(config.overlay) || 0))
  const wash = 1 - dashboardBackgroundIntensity.value / 100
  if (overlay > 0) { layers.push(`linear-gradient(rgba(255,255,255,${overlay}),rgba(255,255,255,${overlay}))`); sizes.push('auto'); positions.push('center') }
  if (wash > 0) { layers.push(`linear-gradient(rgba(255,255,255,${wash}),rgba(255,255,255,${wash}))`); sizes.push('auto'); positions.push('center') }
  if (gradient && image === 'none') { layers.push(gradient); sizes.push('auto'); positions.push('center') }
  if (image !== 'none') { layers.push(image); sizes.push(config.size || 'cover'); positions.push(config.position || 'center') }
  return {
    backgroundColor: color,
    backgroundImage: layers.length ? layers.join(', ') : 'none',
    backgroundSize: sizes.join(', '),
    backgroundPosition: positions.join(', '),
    backgroundRepeat: layers.map(() => 'no-repeat').join(', ')
  }
})
const viewerViewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const viewerBreakpoint = computed(() => dashboardBreakpointForWidth(viewerViewportWidth.value))
const viewerColumns = computed(() => responsiveColumns(viewerBreakpoint.value))
const viewerWidgets = computed(() => deriveResponsiveLayout(dashboardSchema.value?.widgets || [], viewerBreakpoint.value, dashboardSchema.value?.responsivePolicy))
// The studio preview intentionally renders the same desktop geometry as GridStack.
// Responsive derivation remains a Viewer concern and no longer creates a second
// preview layout that can diverge from the active Designer schema.
const previewWidgets = computed(() => designerWidgets.value)
const dashboardRecovery = ref({ status: DASHBOARD_RECOVERY_STATUS.NO_SCHEMA, schema: null, raw: null, error: null })
const useSchemaViewer = computed(() => Boolean(dashboardSchema.value))
const dashboardDefinition = ref(null)
const dashboardQueryResult = ref(null)
// Only data dependencies invalidate this catalog; selection/hover does not aggregate rows.
const bindingDatasets = computed(() => new Map(availableIndicatorSources.value.map(source => [source.code, createWidgetBindingDatasets(source, { result: dashboardQueryResult.value, demo: dashboardStatus.value === 'demo', months: dashboardTrend.months })])))
function getBindingDatasets(widget) {
  const remote = remoteWidgetDatasets.value[String(widget?.id)]
  const indicatorBindings = normalizeIndicatorBindings(widget?.config?.indicatorBindings, widget)
  if (indicatorBindings.length > 1) {
    if (remote?.status === 'ERROR' && !remoteMultiIndicatorDatasets.value[String(widget?.id)]) return [{ ...remote, id: 'multi-indicator' }]
    const combined = createMultiIndicatorDataset(widget, remoteMultiIndicatorDatasets.value[String(widget?.id)] || bindingDatasets.value)
    if (combined) return [combined]
  }
  const source = getWidgetSource(widget) || (!widget.sourceCode ? indicatorDataSources.value[0] : null)
  const analysisDatasets = bindingDatasets.value.get(source?.code) || []
  if (['indicator-catalog', 'dashboard-data-source'].includes(source?.origin)) {
    const kind = bindingKind(widget)
    const fallbackId = ['kpi', 'gauge'].includes(kind) ? 'current' : kind === 'line' ? 'trend' : 'departments'
    const fallback = analysisDatasets.find(dataset => dataset.id === fallbackId)
    const remoteReady = remote && remote.status !== 'LOADING' && remote.status !== 'ERROR' && Array.isArray(remote.rows) && remote.rows.length > 0
    const shouldUseFallback = fallback && (!remoteReady || (kind === 'line' && !isFormalRemoteDashboard.value))
    const bindingDatasetId = widget?.config?.dataBinding?.dataset
    if (shouldUseFallback && bindingDatasetId && bindingDatasetId !== fallback.id) {
      const catalogFields = remoteFieldCatalog.value[source.code] || []
      const remapped = bindingDatasetId === 'backend' && catalogFields.length
        ? widgetResultToDataset({ status: 'READY', rows: fallback.rows }, catalogFields, bindingDatasetId)
        : { ...fallback, id: bindingDatasetId }
      const normalized = { ...remapped, fields: remapped.fields.map(field => field.id === 'value' ? { ...field, unit: source.unit || field.unit } : field) }
      return [normalized, ...analysisDatasets.filter(dataset => dataset.id !== bindingDatasetId)]
    }
    if (remote) return [{ ...remote, id: indicatorBindings.length > 1 ? 'multi-indicator' : bindingDatasetId || remote.id }, ...analysisDatasets]
    if (analysisDatasets.length) return analysisDatasets
    if (source.origin !== 'dashboard-data-source') return []
    const fields = dashboardFieldsToFrontend(remoteFieldCatalog.value[source.code] || [])
    return fields.length ? [{ id: 'backend', label: `${source.name} · 正式结果`, fields, rows: [] }] : []
  }
  if (remote) return [{ ...remote, id: indicatorBindings.length > 1 ? 'multi-indicator' : widget?.config?.dataBinding?.dataset || remote.id }]
  return analysisDatasets
}
provide('dashboardBindingDatasets', getBindingDatasets)
provide('dashboardSurfaceTone', computed(() => resolveDashboardSurfaceTone(dashboardBackgroundConfig.value)))
provide('dashboardAppearanceTheme', dashboardTheme)
const globalFilterDefinitions = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.globalFilters || [])
const compatibleWidgetIdsByGlobalFilter = computed(() => Object.fromEntries(globalFilterDefinitions.value.map(definition => [definition.id, resolveCompatibleGlobalFilterWidgetIds(definition, designerWidgets.value, getBindingDatasets)])))
const filterRuntimeValues = ref({})
// Interaction filters are a viewer/preview concern. They never enter schema state
// or persistence, unlike global filter definitions and widget interaction rules.
const interactionFilterState = ref({})
const activeInteractionFilters = computed(() => Object.values(interactionFilterState.value).map((interaction) => ({
  ...interaction,
  label: filterCatalog.value.find(field => field.id === interaction.field)?.label || interaction.field
})))
// Widget-local drill position is deliberately runtime-only and never participates
// in the schema/history/persistence chain.
const drillRuntimeState = ref({})
const filterDatasets = computed(() => [
  ...[...bindingDatasets.value.entries()].flatMap(([sourceCode, datasets]) => datasets.map(dataset => ({ ...dataset, sourceCode }))),
  ...Object.entries(remoteFieldCatalog.value).map(([sourceCode, fields]) => ({
    sourceCode, fields: dashboardFieldsToFrontend(fields), rows: []
  }))
])
const filterCatalog = computed(() => dashboardFilterCatalog(filterDatasets.value))
const globalFilterOptionSources = computed(() => availableIndicatorSources.value
  .filter(source => filterDatasets.value.some(dataset => dataset.sourceCode === source.code && dataset.fields.some(field => field.filterable)))
  .map(source => ({ code: source.code, name: source.name })))
const dependentFilterOptions = computed(() => deriveDependentFilterOptions(filterDatasets.value, globalFilterDefinitions.value, filterRuntimeValues.value))
const filterOptionsById = computed(() => ({ ...Object.fromEntries(dependentFilterOptions.value), ...remoteFilterOptions.value }))
const currentDependentFilterOptions = computed(() => new Map([...dependentFilterOptions.value, ...Object.entries(remoteFilterOptions.value)]))
// Only definition/lifecycle changes reinitialize defaults. Runtime selections never
// write into canonical schema or trigger dirty/persistence.
watch(() => JSON.stringify(globalFilterDefinitions.value), () => { filterRuntimeValues.value = initialFilterValues(globalFilterDefinitions.value) }, { immediate: true })
watch([globalFilterDefinitions, filterRuntimeValues, currentDependentFilterOptions], () => {
  const readyDefinitions = globalFilterDefinitions.value.filter(definition =>
    !definition.dependsOn?.length || !definition.optionSourceCode || Object.hasOwn(remoteFilterOptions.value, definition.id))
  const normalized = normalizeDependentFilterValues(readyDefinitions, filterRuntimeValues.value, currentDependentFilterOptions.value)
  if (JSON.stringify(normalized) !== JSON.stringify(filterRuntimeValues.value)) filterRuntimeValues.value = normalized
}, { deep: true })
watch([globalFilterDefinitions, period, remotePeriodRange, filterRuntimeValues, () => JSON.stringify(remoteFieldCatalog.value)], () => { void loadRemoteFilterOptions() }, { deep: true })
watch(requestedDashboardId, nextDashboardId => { if (nextDashboardId !== activeDashboardId.value) void requestDashboardSwitch(nextDashboardId) })
watch(selectedDataCode, code => { if (code) void ensureRemoteDataSourceFields(code) })
const currentDashboardWidgets = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.widgets || [])
provide('dashboardFilterContext', { definitions: globalFilterDefinitions, values: filterRuntimeValues, interactions: interactionFilterState })
provide('dashboardWidgetsContext', { widgets: currentDashboardWidgets, interactions: interactionFilterState, clearInteraction: clearInteractionFilter })
provide('dashboardDrillContext', { states: drillRuntimeState, advance: advanceWidgetDrill, back: returnWidgetDrillTo, reset: resetWidgetDrill })
function updateGlobalFilters(definitions) {
  if (!editingDashboardSchema.value) return
  void runDashboardHistoryTransaction(() => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, globalFilters: definitions }
    markDashboardDirty()
  })
}
function showDashboardSettings() {
  const cleared = clearWidgetSelection()
  selectedWidgetIds.value = cleared.ids
  primarySelectedWidgetId.value = cleared.primaryId
  activeWidgetId.value = ''
}
function updateGlobalFilterScope({ filterId, targetWidgetIds }) {
  if (!editingDashboardSchema.value || !filterId) return
  void runDashboardHistoryTransaction(() => {
    const definition = editingDashboardSchema.value.globalFilters.find(item => item.id === filterId)
    const compatibleWidgetIds = resolveCompatibleGlobalFilterWidgetIds(definition, editingDashboardSchema.value.widgets, getBindingDatasets)
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: applyGlobalFilterScope(editingDashboardSchema.value.widgets, filterId, targetWidgetIds, compatibleWidgetIds) }
    markDashboardDirty()
  })
}
function deleteGlobalFilter(filterId) {
  if (!editingDashboardSchema.value || !filterId) return
  void runDashboardHistoryTransaction(() => {
    const next = removeGlobalFilter(editingDashboardSchema.value.globalFilters, editingDashboardSchema.value.widgets, filterId)
    editingDashboardSchema.value = { ...editingDashboardSchema.value, globalFilters: next.definitions, widgets: next.widgets }
    markDashboardDirty()
  })
}
function updateDashboardMetadata(field, value) {
  if (!editingDashboardSchema.value) return
  editingDashboardSchema.value = { ...editingDashboardSchema.value, [field]: String(value ?? '') }
  markDashboardDirty()
}
  async function refreshDashboardCatalog() {
    try {
      const remote = await fetchDashboardCatalog()
      localDashboardCatalog.value = (Array.isArray(remote) ? remote : []).map(dashboardSummaryToCatalogEntry)
      notifyDashboardCatalogChanged()
      return localDashboardCatalog.value
    } catch (error) {
      // Never turn a backend failure into a browser-local "saved" dashboard.
      localDashboardCatalog.value = []
      notifyDashboardCatalogChanged()
      throw error
    }
  }
  function isRemoteDashboard(id = activeDashboardId.value) {
    return localDashboardCatalog.value.some(item => item.origin === 'remote' && String(item.id) === String(id)) || (String(id) === managedDashboardId.value && !findLocalSceneByDashboardId(id))
  }
function dashboardTypeLabel(type) { return ({ 'hospital-overview': '全院概览', topic: '专题', scene: '场景', department: '科室', custom: '自定义' })[type] || '自定义' }
function scopeLabel(scope) { return ({ hospital: '全院', department: '科室', personal: '个人' })[scope] || '全院' }
async function retryRemoteDashboardCatalog() {
  try {
    const remoteCatalog = await refreshDashboardCatalog()
    const dashboardId = remoteCatalog.find(item => String(item.id) === String(activeDashboardId.value))?.id || remoteCatalog[0]?.id
    if (!dashboardId) throw new Error('服务端看板目录为空，请创建看板或联系管理员授权。')
    activeDashboardId.value = dashboardId
    requestedDashboardId.value = dashboardId
    loadDashboardSchema(dashboardId)
    await loadDashboard(dashboardId)
  } catch (error) {
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = formatDashboardLoadError(error)
  }
}
function newDashboardForm(mode) {
  dashboardCreateMode.value = mode
  dashboardCreateForm.value = { name: '', description: '', dashboardType: 'custom', category: '', scope: 'personal', templateId: layoutTemplates.value[0]?.id || '' }
  dashboardMenuDialog.value = true
}
async function handleDashboardMenuCommand(command) {
  if (command === 'create-blank') return newDashboardForm('blank')
  if (command === 'create-template') return newDashboardForm('template')
  if (command === 'rename') return renameCurrentDashboard()
  if (command === 'copy') return copyCurrentDashboard()
  if (command === 'delete') return deleteCurrentDashboard()
}
async function createDashboardFromMenu() {
  const metadata = dashboardCreateForm.value
  if (!metadata.name.trim()) { ElMessage.warning('请填写看板名称'); return }
    const template = dashboardCreateMode.value === 'template' ? layoutTemplates.value.find(item => item.id === metadata.templateId) : null
    try {
      let schema = normalizeDashboardSchema({ version: 1, id: 'new-dashboard', name: metadata.name, description: metadata.description || '', dashboardType: metadata.dashboardType, category: metadata.category || '', scope: metadata.scope, layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [], globalFilters: [] })
      if (template) schema = normalizeDashboardSchema(applyLayoutTemplateToDashboard(schema, template, { createWidgetId: index => `dashboard-widget-${Date.now()}-${index + 1}` }))
      const created = await createDashboard(schemaToDashboardPayload(schema, { dataSources: availableIndicatorSources.value }))
      const createdMeta = dashboardDetailMeta(created)
      dashboardMenuDialog.value = false
      await refreshDashboardCatalog()
      await selectDashboard(createdMeta.dashboardId)
      startDashboardEdit()
      ElMessage.success('已创建看板')
  } catch (error) { ElMessage.error(`创建看板失败：${error.message || '未知错误'}`) }
}
  async function renameCurrentDashboard() {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的看板名称', '重命名当前看板', { inputValue: currentDashboardName.value, inputPattern: /\S+/, inputErrorMessage: '名称不能为空', confirmButtonText: '保存', cancelButtonText: '取消' })
      if (isRemoteDashboard()) {
        const schema = normalizeDashboardSchema({ ...(editingDashboardSchema.value || dashboardSchema.value), name: value })
        const payload = remoteDashboardIsMock.value
          ? schemaToMockDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion })
          : schemaToDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion, dataSources: availableIndicatorSources.value })
        const saved = await saveDashboard(currentDashboardId.value, payload)
        remoteDashboardMeta.value = dashboardDetailMeta(saved)
        dashboardSchema.value = saved?.version?.layout ? dashboardDetailToSchema(saved) : schema
        if (editingDashboardSchema.value) editingDashboardSchema.value = clonePersistableValue(dashboardSchema.value)
      } else {
        const renamed = renameLocalDashboard(currentDashboardId.value, value, localStorage)
        dashboardSchema.value = renamed
        if (editingDashboardSchema.value) editingDashboardSchema.value = clonePersistableValue(renamed)
      }
      await refreshDashboardCatalog()
    ElMessage.success('看板已重命名')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(`重命名失败：${error.message || '当前系统演示看板尚未保存为本地看板'}`) }
}
  async function copyCurrentDashboard() {
    try {
      if (isRemoteDashboard()) {
        const copied = await copyDashboard(currentDashboardId.value, {})
        await refreshDashboardCatalog()
        await selectDashboard(dashboardDetailMeta(copied).dashboardId)
      } else {
        const copied = duplicateLocalDashboard(currentDashboardId.value, localStorage)
        await refreshDashboardCatalog()
        await openLocalDashboard(copied.id, { startEditing: true })
      }
    ElMessage.success('已创建看板副本')
  } catch (error) { ElMessage.error(`复制失败：${error.message || '请先保存当前看板'}`) }
}
async function deleteCurrentDashboard() {
  if (currentDashboardProtected.value) return
  try {
    await ElMessageBox.confirm(`删除后，“${currentDashboardName.value}”将不再出现在看板列表中，相关版本和组件会一并归档。`, '删除看板', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    if (isRemoteDashboard()) await deleteDashboard(currentDashboardId.value)
    else removeLocalDashboard(currentDashboardId.value, localStorage)
    await refreshDashboardCatalog()
    finishDashboardEdit()
    const nextDashboardId = localDashboardCatalog.value[0]?.id
    if (nextDashboardId) await selectDashboard(nextDashboardId)
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(`删除失败：${error.message || '未知错误'}`) }
}
async function openLocalDashboard(id, { startEditing = false } = {}) {
  await selectDashboard(id)
  if (startEditing && !isEditing.value) startDashboardEdit()
}
async function selectDashboard(id) {
  if (!id || id === activeDashboardId.value) return
  requestedDashboardId.value = id
  await requestDashboardSwitch(id)
}
async function changeDesignerGridColumns(value) {
  if (!editingDashboardSchema.value) return
  const columns = Number(value)
  if (![12, 24].includes(columns) || columns === editingDashboardSchema.value.layout.columns) return
  try {
    await ElMessageBox.confirm('切换列数会重新调整布局，组件不会被删除。', '调整网格列数', { confirmButtonText: '确认切换', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  await runDashboardHistoryTransaction(async () => {
    editingDashboardSchema.value = changeDashboardGridColumns(editingDashboardSchema.value, columns)
    markDashboardDirty()
    await nextTick()
    await reconcileDesignerCanvasLayout()
  })
}
function updateDesignerQuery(query) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, query } }))
}
function updateDesignerBackendQuery(backendQuery) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, backendQuery } }))
  const updatedWidget = designerWidgets.value.find(widget => String(widget.id) === String(activeWidgetId.value))
  const source = availableIndicatorSources.value.find(item => item.code === updatedWidget?.sourceCode)
  if (source?.origin === 'dashboard-data-source') void previewRemoteWidget(updatedWidget)
}
function updateDesignerChartConfig(chart) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, chart } }))
  const updatedWidget = designerWidgets.value.find(widget => String(widget.id) === String(activeWidgetId.value))
  const source = availableIndicatorSources.value.find(item => item.code === updatedWidget?.sourceCode)
  if (source?.origin === 'dashboard-data-source') void previewRemoteWidget(updatedWidget)
}
function updateDesignerIndicatorBindings(indicatorBindings) {
  updateDesignerWidget(widget => {
    const normalized = normalizeIndicatorBindings(indicatorBindings, widget)
    const config = { ...widget.config, indicatorBindings: normalized }
    if (normalized.length > 1) {
      const old = config.dataBinding || { dimensions: [], series: [], sort: [] }
      config.dataBinding = {
        ...old,
        dataset: 'multi-indicator',
        measures: normalized.map(item => ({
          field: multiIndicatorMeasureField(item.sourceCode),
          label: item.alias,
          aggregation: 'direct',
          axis: item.axis
        }))
      }
    } else if (config.dataBinding?.dataset === 'multi-indicator') {
      delete config.dataBinding
    }
    return { ...widget, config }
  })
  const updatedWidget = designerWidgets.value.find(widget => String(widget.id) === String(activeWidgetId.value))
  if (!updatedWidget) return
  const source = availableIndicatorSources.value.find(item => item.code === updatedWidget.sourceCode)
  if (source?.origin === 'dashboard-data-source') void previewRemoteWidget(updatedWidget)
}
function updateDesignerInteraction(interaction) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, interaction } }))
}
function updateDesignerBinding(dataBinding) {
  updateDesignerWidget(widget => {
    const config = { ...widget.config }
    if (dataBinding === null) delete config.dataBinding
    else config.dataBinding = dataBinding
    return { ...widget, config }
  })
  const updatedWidget = designerWidgets.value.find(widget => String(widget.id) === String(activeWidgetId.value))
  const source = availableIndicatorSources.value.find(item => item.code === updatedWidget?.sourceCode)
  if (dataBinding && source?.origin === 'dashboard-data-source') void previewRemoteWidget(updatedWidget)
}
// The bounded history records canonical, plain schema data only. GridStack nodes,
// Vue proxies, filter runtime values and preview interaction state stay outside it.
let dashboardHistoryTransactionDepth = 0
function recordDashboardHistorySnapshot() {
  if (!isEditing.value || restoringDashboardHistory || !editingDashboardSchema.value) return
  const snapshot = clonePersistableValue(editingDashboardSchema.value)
  if (JSON.stringify(dashboardHistory.value[dashboardHistoryIndex.value]) === JSON.stringify(snapshot)) return
  dashboardHistory.value = [...dashboardHistory.value.slice(0, dashboardHistoryIndex.value + 1), snapshot].slice(-50)
  dashboardHistoryIndex.value = dashboardHistory.value.length - 1
}
async function runDashboardHistoryTransaction(operation) {
  dashboardHistoryTransactionDepth += 1
  try { return await operation() } finally {
    dashboardHistoryTransactionDepth -= 1
    if (dashboardHistoryTransactionDepth === 0) recordDashboardHistorySnapshot()
  }
}
watch(() => JSON.stringify(editingDashboardSchema.value), () => {
  if (dashboardHistoryTransactionDepth > 0) return
  recordDashboardHistorySnapshot()
})
let dashboardAbortController
let dashboardLoadGeneration = 0

onBeforeRouteLeave(() => {
  if (!shouldProtectDashboardNavigation(dashboardDirty.value)) return true
  return window.confirm(DASHBOARD_UNSAVED_MESSAGE)
})

function onDashboardBeforeUnload(event) {
  handleDashboardBeforeUnload(event, dashboardDirty.value)
}
function syncViewerViewport() { viewerViewportWidth.value = window.innerWidth }

const dashboardLoading = computed(() => dashboardStatus.value === 'loading')
const dashboardQueryLabel = computed(() => {
  if (isFormalRemoteDashboard.value) {
    const [start, end] = resolvePublishedDashboardPeriodRange(remotePeriodRange.value, periodOptions.value)
    return `查询条件：${start === end ? start : `${start} 至 ${end}`} · ${department.value ? department.value : '全院'}`
  }
  const selectedPeriod = periodOptions.value.find((item) => item.value === period.value)?.label || '全部期间'
  return `查询条件：${selectedPeriod} · ${department.value ? department.value : '全院'}`
})

const warningWidgetRuntime = ref({})
let warningWidgetLoadGeneration = 0
const dashboardWarnings = computed(() => dashboardStatus.value === 'ready' ? [] : mockDashboardWarnings)
function getWidgetWarnings(widget) {
  if (widget?.type !== 'warnings') return dashboardWarnings.value
  const config = normalizeWarningWidgetConfig(widget.config?.warning)
  if (dashboardStatus.value === 'demo') {
    const severityToLevel = { CRITICAL: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'info', INFO: 'info' }
    return mockDashboardWarnings
      .map(item => ({ ...item, status: 'OPEN', severity: item.level === 'danger' ? 'HIGH' : item.level === 'warning' ? 'MEDIUM' : 'INFO' }))
      .filter(item => (!config.status || item.status === config.status) && (!config.severity || severityToLevel[config.severity] === item.level))
      .slice(0, config.pageSize)
  }
  return warningWidgetRuntime.value[String(widget.id)]?.records || []
}
function getWarningWidgetState(widget) {
  if (widget?.type !== 'warnings') return { status: 'ready', total: 0, error: '' }
  if (dashboardStatus.value === 'demo') return { status: 'ready', total: getWidgetWarnings(widget).length, error: '' }
  if (dashboardStatus.value !== 'ready') return { status: 'idle', total: 0, error: '' }
  return warningWidgetRuntime.value[String(widget.id)] || { status: 'loading', total: 0, error: '' }
}
async function refreshWarningWidgets() {
  const widgets = viewerWidgets.value.filter(widget => widget.type === 'warnings')
  const generation = ++warningWidgetLoadGeneration
  if (dashboardStatus.value !== 'ready' || !widgets.length) {
    warningWidgetRuntime.value = {}
    return
  }
  const loading = Object.fromEntries(widgets.map(widget => [String(widget.id), { status: 'loading', records: [], total: 0, error: '' }]))
  warningWidgetRuntime.value = loading
  await Promise.all(widgets.map(async (widget) => {
    try {
      const config = normalizeWarningWidgetConfig(widget.config?.warning)
      const page = normalizePage(await fetchWarnings(warningWidgetQuery(config)))
      if (generation !== warningWidgetLoadGeneration) return
      warningWidgetRuntime.value = { ...warningWidgetRuntime.value, [String(widget.id)]: { status: 'ready', records: page.records.map(item => warningEventToDashboardItem(item, config)), total: page.total, error: '' } }
    } catch (error) {
      if (generation !== warningWidgetLoadGeneration) return
      warningWidgetRuntime.value = { ...warningWidgetRuntime.value, [String(widget.id)]: { status: 'error', records: [], total: 0, error: error?.message || '无法读取预警事件' } }
    }
  }))
}
watch(() => JSON.stringify(viewerWidgets.value.filter(widget => widget.type === 'warnings').map(widget => ({ id: widget.id, warning: widget.config?.warning }))), () => { void refreshWarningWidgets() }, { immediate: true })
watch(() => dashboardStatus.value, () => { void refreshWarningWidgets() })
const departmentRanking = computed(() => {
  const rows = normalizeRanking(dashboardQueryResult.value?.departmentRanking, 'live')
  if (rows.length) return rows
  return dashboardStatus.value === 'demo'
    ? normalizeRanking(mockDashboardDepartmentRanking, 'mock')
    : []
})

const selectedDataSource = computed(() =>
  availableIndicatorSources.value.find((source) => source.code === selectedDataCode.value)
)

const dashboardSourceLabel = computed(() => ({
  select: '尚未选择看板',
  loading: '正在加载正式数据',
  ready: '正式接口数据',
  empty: '正式接口数据（暂无结果）',
  demo: '演示数据',
  error: '正式接口数据加载失败'
}[dashboardStatus.value] || '正在加载正式数据'))

const activeDesignerWidget = computed(() => editingDashboardSchema.value?.widgets.find((widget) => widget.id === activeWidgetId.value))
const precisePixelSize = computed(() => { const widget = activeDesignerWidget.value; const geometry = designerCanvasRef.value?.getGridGeometry?.() || { cellWidth: 0, cellHeight: 60, margin: 0 }; const width = widget?.layout.w || 0, height = widget?.layout.h || 0; return { width: Math.round(width * geometry.cellWidth + Math.max(0, width - 1) * geometry.margin), height: Math.round(height * geometry.cellHeight + Math.max(0, height - 1) * geometry.margin) } })
const designerStyle = computed(() => activeDesignerWidget.value?.config?.style || {})
const widgetBackgroundMode = computed(() => resolveWidgetBackgroundMode(designerStyle.value))
const widgetGradientColors = computed(() => parseWidgetGradientColors(designerStyle.value.backgroundGradient))
const backgroundModes = Object.freeze([{ id: 'none', label: '无' }, { id: 'solid', label: '纯色' }, { id: 'gradient', label: '渐变' }, { id: 'image', label: '图片' }])
const hasUnpublishedDashboardDraft = computed(() => {
  const meta = remoteDashboardMeta.value || {}
  if (!isRemoteDashboard() || !meta.currentPublishedVersionId) return false
  return String(meta.publicationStatus || '').toUpperCase() === 'DRAFT' ||
    Boolean(meta.workingVersionId && meta.workingVersionId !== meta.currentPublishedVersionId)
})
const saveStateLabel = computed(() => {
  if (saveState.value === 'error') return '保存失败'
  if (dashboardDirty.value) return '● 有未保存更改'
  const draftLabel = hasUnpublishedDashboardDraft.value ? '草稿已保存' : '已保存'
  return lastSavedAt.value ? `✓ ${draftLabel} ${lastSavedAt.value}` : `✓ ${draftLabel}`
})

const activeWidgetVisualizationTypes = computed(() =>
  activeDesignerWidget.value ? getWidgetVisualizationTypes(activeDesignerWidget.value) : []
)

const activeWidgetVisualizationOptions = computed(() =>
  widgetTypeOptions.filter((option) => activeWidgetVisualizationTypes.value.includes(option.value))
)

const activeWidgetVisualizationType = computed({
  get: () => activeDesignerWidget.value ? getWidgetVisualizationType(activeDesignerWidget.value) : '',
  set: (nextType) => {
    const widget = activeDesignerWidget.value
    if (!widget || !getWidgetVisualizationTypes(widget).includes(nextType)) return
    const nextTypeName = nextType === 'kpi' ? (widget.kpiIndex === 0 ? 'primary' : 'kpi') : 'chart'
    const constraints = getWidgetGridConstraints({ type: nextTypeName, chartKind: nextType })
    updateDesignerWidget({
      type: nextTypeName,
      visualType: nextType,
      ...(nextType === 'kpi' ? {} : { chartKind: nextType }),
      layout: {
        ...widget.layout,
        w: Math.max(widget.layout.w, constraints.minW),
        h: Math.max(widget.layout.h, constraints.minH)
      }
    })
    nextTick(() => designerCanvasRef.value?.applyLayout(designerWidgets.value.map((item) => ({ id: item.id, ...item.layout }))))
  }
})

const activeWidgetName = computed(() => {
  if (!activeDesignerWidget.value) return '未选中组件'
  const widget = activeDesignerWidget.value
  const visualizationHint = activeWidgetVisualizationOptions.value.length
    ? ''
    : ' 此组件展示形式固定。'
  return `已选中：${getWidgetTitle(widget)}。位置 ${widget.x}, ${widget.y}；尺寸 ${widget.w} × ${widget.h}。方向键移动，Shift 加方向键调整尺寸，Delete 删除。${visualizationHint}`
})

const visibleKpis = computed(() => indicatorDataSources.value.map(createKpiData))

const trendTableRows = computed(() => {
  const rows = normalizeMonthlyTrend(dashboardQueryResult.value?.monthlyTrend)
  return rows.length ? rows : dashboardTrend.months.map((period, index) => ({ period, value: dashboardTrend.mortality[index] }))
})

const trendOption = computed(() => ({
  color: [IDMP_CHART_COLORS[0]],
  tooltip: { trigger: 'axis' },
  legend: { show: false },
  grid: { top: 12, left: 44, right: 44, bottom: 46, containLabel: false },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: trendTableRows.value.map((item) => item.period)
  },
  yAxis: [{ type: 'value' }],
  series: [
    {
      name: '指标值',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: trendTableRows.value.map((item) => item.value)
    }
  ]
}))

const rateOption = computed(() => ({
  color: IDMP_CHART_COLORS,
  tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
  legend: {
    bottom: 2,
    left: 'center',
    itemWidth: 18,
    itemHeight: 10
  },
  series: [
    {
      type: 'pie',
      radius: ['49%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        fontSize: 12,
        formatter: '{b}\n{d}%'
      },
      labelLine: { length: 12, length2: 10 },
        data: departmentRanking.value.map(toDepartmentChartDatum)
    }
  ]
}))

function isKpiWidget(widget) {
  return widget.type === 'kpi'
}

function getWidgetKpi(widget) {
  const source = getWidgetSource(widget)
  if (source) return { ...createKpiData(source), ...(widget.title ? { title: widget.title } : {}) }
  return {
    code: widget.sourceCode || '',
    title: widget.sourceName || '指标数据不可用',
    value: '暂无数据',
    yoy: null,
    mom: null,
    trendDirection: null,
    change: '当前筛选条件无数据',
    target: '请调整筛选条件或重新添加',
    status: 'info'
  }
}

function getDashboardIndicatorSource(code) {
  return availableIndicatorSources.value.find((source) => source.code === code) ||
    availableIndicatorSources.value.find((source) => source.indicatorCode === code || source.analysisIndicatorId === code)
}

function getWidgetSource(widget) {
  if (typeof widget.kpiIndex === 'number') return indicatorDataSources.value[widget.kpiIndex]
  return getDashboardIndicatorSource(widget.sourceCode)
}

function goWidgetAnalysis(widget) {
  if (isEditing.value) return
  const source = getWidgetSource(widget) || {
    code: widget.sourceCode || '',
    indicatorCode: widget.sourceCode || '',
    indicatorName: widget.title || widget.sourceName || '',
    analysisIndicatorVersionId: widget.config?.analysisIndicatorVersionId || ''
  }
  const result = dashboardQueryResult.value?.widgets?.[widget.id]
  const drillContext = result?.drillContext || result?.rows?.find(row => row?.drillContext)?.drillContext || null
  goIndicatorAnalysis(source, widget.config?.backendQuery, drillContext)
}

function goPrimaryMetricAnalysis() {
  if (isEditing.value) return
  goIndicatorAnalysis(visibleKpis.value[0])
}

function getWidgetTitle(widget) {
  if (widget.title) return widget.title
  if (widget.type === 'primary') return visibleKpis.value[0]?.title || '重点指标'
  if (widget.type === 'supporting') return '其他核心指标'
  if (isKpiWidget(widget)) return getWidgetKpi(widget).title
  if (widget.type === 'warnings') return '预警指标'
  if (widget.type === 'ranking') return '科室指标排名'
  if (widget.preset === 'trend') return '月度指标趋势'
  if (widget.preset === 'rate') return '科室指标分布'
  if (typeof widget.kpiIndex === 'number') {
    return getVisualizationTitle(getWidgetSource(widget)?.name || '重点指标', widget.chartKind)
  }
  if (widget.sourceName) return getVisualizationTitle(widget.sourceName, widget.chartKind)
  return widget.title || widgetTypeOptions.find((item) => item.value === widget.chartKind)?.label || '图表'
}

function getWidgetDescription(widget) {
  if (widget.preset === 'trend') return '按当前筛选条件读取已发布看板的月度数据'
  if (widget.preset === 'rate') {
    return widgetHasDrillTargets(widget)
      ? '按当前筛选条件读取已发布看板的科室数据；点击科室查看下钻'
      : '按当前筛选条件读取已发布看板的科室数据；当前数据未提供下钻上下文'
  }
  if (widgetHasDrillTargets(widget)) return '点击科室查看下钻'
  return ''
}

function getWidgetChartAriaLabel(widget) {
  const action = widgetHasDrillTargets(widget) ? '；可点击科室查看下钻' : ''
  return `${getWidgetTitle(widget)}图表${action}`
}

function getWidgetIcon(widget) {
  if (widget.chartKind === 'bar') return Histogram
  if (widget.chartKind === 'pie') return PieChart
  return TrendCharts
}

function getWidgetChartOption(widget) {
  return createDashboardChartOption(widget, {
    trendOption: trendOption.value,
    rateOption: rateOption.value,
    getSource: () => getWidgetSource(widget)
  })
}
function updateMetricGroupConfig(config) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, ...config } }))
}
function selectMetricGroupItem(itemId) { selectedMetricItemId.value = itemId }
function updateWarningWidgetConfig(config) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, warning: createWarningWidgetConfig(config) } }))
}
function mutateMetricGroup(mutator) {
  if (activeDesignerWidget.value?.type !== 'metric-group') return null
  let result
  updateDesignerWidget(widget => {
    result = mutator(widget.config?.metricGroup || {})
    const config = result?.config || result || widget.config?.metricGroup
    return { ...widget, config: { ...widget.config, metricGroup: config } }
  })
  return result
}
function addMetricGroupItemFromCanvas() { const result = mutateMetricGroup(config => addMetricGroupItem(config, availableIndicatorSources.value[0] || {})); if (result?.item) selectedMetricItemId.value = result.item.id }
function duplicateMetricGroupItemFromCanvas(itemId) { const result = mutateMetricGroup(config => duplicateMetricGroupItem(config, itemId)); if (result?.item) selectedMetricItemId.value = result.item.id }
function removeMetricGroupItemFromCanvas(itemId) { const result = mutateMetricGroup(config => removeMetricGroupItem(config, itemId)); selectedMetricItemId.value = result?.selectedId || '' }
function reorderMetricGroupItemFromCanvas({ itemId, targetId }) { mutateMetricGroup(config => reorderMetricGroupItem(config, itemId, targetId)) }

function isChartEmpty(widget) {
  if (widget.preset === 'trend') return !trendTableRows.value.length
  if (widget.preset === 'rate') return !departmentRanking.value.length
  const source = getWidgetSource(widget)
  if (!source) return true
  if (widget.chartKind === 'bar') return !source.departmentData?.length
  if (widget.chartKind === 'pie') return !source.pieData?.length
  return !source.trendData?.length
}

function getWidgetTableColumns(widget) {
  if (widget.preset === 'trend') {
    return [
      { key: 'period', label: '月份' },
      { key: 'value', label: '指标值' }
    ]
  }
  if (widget.preset === 'rate') {
    return [
      { key: 'label', label: '科室' },
      { key: 'value', label: '指标值' }
    ]
  }
  return [
    { key: 'label', label: widget.chartKind === 'line' ? '月份' : '数据项' },
    { key: 'value', label: getWidgetTitle(widget) }
  ]
}

function getWidgetTableRows(widget) {
  if (widget.preset === 'trend') return trendTableRows.value
  if (widget.preset === 'rate') {
    return departmentRanking.value.map((item) => ({
      label: item.department,
      value: item.value,
      drillTarget: item.drillTarget
    }))
  }

  const source = getWidgetSource(widget)
  if (!source) return []

  if (widget.chartKind === 'bar') {
    return (source.departmentData || []).map((item) => ({
      label: item.name,
      value: item.value,
      drillTarget: normalizeDashboardDrillTarget(item.drillTarget, dashboardDrillSource())
    }))
  }
  if (widget.chartKind === 'pie') {
    return (source.pieData || []).map((item) => ({
      label: item.name,
      value: item.value,
      drillTarget: normalizeDashboardDrillTarget(item.drillTarget, dashboardDrillSource())
    }))
  }
  return trendTableRows.value.map((item, index) => ({
    label: item.period,
    value: source.trendData?.[index] ?? '-'
  }))
}

function widgetHasDrillTargets(widget) {
  return getWidgetTableRows(widget).some((row) => row.drillTarget)
}

function dashboardDrillSource() {
  return dashboardStatus.value === 'demo' ? 'mock' : 'live'
}

function getWidgetPieDrillSource(widget) {
  return getWidgetSource(widget)?.origin === 'backend' ? 'live' : dashboardDrillSource()
}

function getWidgetPieDrillTargets(widget) {
  // Bound schema widgets render through BindingWidget, where schema drill and
  // cross-filter semantics already own the click. This adapter is only for
  // legacy/live pie payloads carrying the formal server drill contract.
  if (widget.config?.dataBinding || widget.chartKind !== 'pie') return []
  const source = getWidgetSource(widget)
  if (source?.origin !== 'backend') return []
  const targets = widget.preset === 'rate'
    ? departmentRanking.value.map(row => row.drillTarget)
    : (source.pieData || []).map(row => row.drillTarget)
  return targets.map(target => normalizeDashboardDrillTarget(target, 'live')).filter(Boolean)
}

function toDepartmentChartDatum(item) {
  return {
    name: item.department,
    value: item.rawValue,
    ...(item.drillTarget ? { drillTarget: item.drillTarget, cursor: 'pointer' } : {})
  }
}

function handleWidgetChartClick(widget, params) {
  if (applyWidgetClickFilter(widget, params)) return
  if (isEditing.value || !widgetHasDrillTargets(widget)) return
  const target = resolveDashboardChartDrillTarget(params, dashboardDrillSource())
  if (target) openDashboardDrill(target)
}

function applyWidgetClickFilter(widget, params) {
  const clickFilter = widget.config?.interaction?.clickFilter
  if (!clickFilter?.enabled || !clickFilter.targetWidgetIds?.length) return false
  // V1 deliberately supports only an actual bound dimension. ECharts' category
  // name then represents a real row value; no inferred hierarchy or synthetic
  // cross-dataset mapping is introduced here.
  const dimensions = widget.config?.dataBinding?.dimensions || []
  if (!dimensions.some(dimension => dimension.field === clickFilter.field)) return false
  const value = params?.data?.dimensionValues?.[clickFilter.field] ?? params?.name
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return false
  const id = `interaction-${widget.id}`
  interactionFilterState.value = {
    ...interactionFilterState.value,
    [id]: { id, sourceWidgetId: String(widget.id), field: clickFilter.field, value, targetWidgetIds: [...clickFilter.targetWidgetIds] }
  }
  return true
}

function clearInteractionFilter(sourceWidgetId) {
  const id = `interaction-${sourceWidgetId}`
  if (!Object.hasOwn(interactionFilterState.value, id)) return
  const next = { ...interactionFilterState.value }
  delete next[id]
  interactionFilterState.value = next
}

function openDashboardDrill(target) {
  const query = buildDashboardDrillRouteQuery(target)
  if (query) router.push({ name: 'ResultDrill', query })
}

function addDashboardWidget() {
  if (isEditing.value) addDesignerWidget()
}

let designerWidgetSequence = 0
async function addDesignerWidget() {
  let source = selectedDataSource.value
  if (!source && !['text', 'metric-group', 'warnings'].includes(addWidgetType.value)) return
  try {
    if (source && !['metric-group', 'warnings'].includes(addWidgetType.value)) {
      await ensureRemoteDataSourceFields(source.code, { required: source.origin === 'dashboard-data-source' })
      source = await hydrateIndicatorSource(source)
    }
  } catch (error) {
    ElMessage.warning(error?.message || '指标数据字段暂不可用，请稍后重试')
    return
  }
  const type = addWidgetType.value
  let id
  do { id = `dashboard-widget-${Date.now()}-${++designerWidgetSequence}` } while (designerWidgets.value.some(widget => String(widget.id) === id))
  const metadata = type === 'metric-group'
    ? { id, type: 'metric-group', title: '指标组', visualType: 'metric-group', config: { metricGroup: createMetricGroupConfig(availableIndicatorSources.value) }, layout: getDefaultGridLayout('metric-group') }
    : type === 'text'
    ? { id, type: 'text', title: '说明', visualType: 'text', config: { text: { title: '看板说明', body: '请输入数据口径、业务提示或分区说明。', align: 'left', fontSize: 14, fontWeight: 400 } }, layout: getDefaultGridLayout('text') }
    : type === 'warnings'
    ? { id, type: 'warnings', title: '预警事件', visualType: 'warnings', config: { warning: createWarningWidgetConfig() }, layout: getDefaultGridLayout('warnings') }
    : type === 'kpi'
    ? { id, type: 'kpi', sourceCode: source.code, sourceName: source.name, visualType: 'kpi', config: {}, layout: getDefaultGridLayout('kpi') }
    : { id, type: 'chart', chartKind: type, title: getVisualizationTitle(source.name, type), sourceCode: source.code, sourceName: source.name, visualType: type, config: {}, layout: getDefaultGridLayout({ type: 'chart', chartKind: type }) }
  const normalizedMetadata = normalizeWidgetMetadata(metadata)
  const dataBinding = !['text', 'metric-group', 'warnings'].includes(type) ? createDefaultBinding(bindingKind(normalizedMetadata), getBindingDatasets(normalizedMetadata)) : null
  const widget = { ...normalizedMetadata, ...(dataBinding ? { config: { ...normalizedMetadata.config, dataBinding } } : {}), layout: metadata.layout }
  editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: [...designerWidgets.value, widget] }
  markDashboardDirty()
  await nextTick()
  await designerCanvasRef.value?.registerWidget(id, { ...widget.layout, autoPosition: true })
  syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], false)
  activeWidgetId.value = id
  markDashboardDirty()
  if (source?.origin === 'dashboard-data-source') void previewRemoteWidget(widget)
}

function deleteActiveWidget() {
  if (isEditing.value) {
    deleteSelectedDesignerWidgets()
  }
}
function clearAllInteractionFilters() { interactionFilterState.value = {} }
function clearAllWidgetDrills() { drillRuntimeState.value = {} }
function advanceWidgetDrill(widget, dataset, value) {
  const hierarchy = resolveDrillHierarchy(widget.config?.interaction?.drill?.hierarchy, dataset?.fields)
  const current = drillRuntimeState.value[String(widget.id)]?.path || []
  if (!hierarchy.length || current.length >= hierarchy.length - 1 || value === null || value === undefined) return
  drillRuntimeState.value = { ...drillRuntimeState.value, [String(widget.id)]: { path: [...current, value] } }
}
function returnWidgetDrillTo(widgetId, breadcrumbIndex) {
  const path = drillRuntimeState.value[String(widgetId)]?.path || []
  drillRuntimeState.value = { ...drillRuntimeState.value, [String(widgetId)]: { path: path.slice(0, Math.max(0, breadcrumbIndex)) } }
}
function resetWidgetDrill(widgetId) {
  const next = { ...drillRuntimeState.value }
  delete next[String(widgetId)]
  drillRuntimeState.value = next
}
function safeBackgroundImage(value) {
  const url = typeof value === 'string' ? value.trim() : ''
  return /^(https?:|data:image\/|\/)/i.test(url) ? `url("${url.replace(/["\\]/g, '')}")` : 'none'
}
function updateDashboardBackground(value) {
  if (!editingDashboardSchema.value) return
  const allowed = ['#ffffff', '#eaf5ff', '#eaf8f6', 'linear-gradient(135deg,#d9efff 0%,#f7fbff 52%,#e5f6ef 100%)', 'linear-gradient(135deg,#0f4c81 0%,#1261a6 52%,#1f7f91 100%)', 'linear-gradient(135deg,#e8f0ff 0%,#f7f4ff 52%,#f0fbf7 100%)']
  const background = allowed.includes(value) ? value : '#ffffff'
  editingDashboardSchema.value = { ...editingDashboardSchema.value, appearance: { ...editingDashboardSchema.value.appearance, background: { ...editingDashboardSchema.value.appearance?.background, type: background.startsWith('linear-gradient') ? 'gradient' : 'color', value: background, image: '', assetKey: '', intensity: dashboardBackgroundIntensity.value } } }
  markDashboardDirty()
}
function updateDashboardBackgroundIntensity(value) {
  if (!editingDashboardSchema.value) return
  const intensity = Math.min(100, Math.max(35, Math.round(Number(value) || 100)))
  editingDashboardSchema.value = { ...editingDashboardSchema.value, appearance: { ...editingDashboardSchema.value.appearance, background: { ...editingDashboardSchema.value.appearance?.background, intensity } } }
  markDashboardDirty()
}

function deleteDesignerWidget(widgetId) {
  if (!widgetId) return
  designerCanvasRef.value?.unregisterWidget(widgetId)
  editingDashboardSchema.value = {
    ...editingDashboardSchema.value,
    widgets: designerWidgets.value.filter((widget) => widget.id !== widgetId)
  }
  if (activeWidgetId.value === widgetId) activeWidgetId.value = ''
  markDashboardDirty()
}

function selectDesignerWidgets(detail) {
  if (!detail) {
    const cleared = clearWidgetSelection()
    selectedWidgetIds.value = cleared.ids; primarySelectedWidgetId.value = cleared.primaryId
    return
  }
  const current = { ids: selectedWidgetIds.value, primaryId: primarySelectedWidgetId.value }
  const selection = typeof detail === 'object' && Array.isArray(detail.ids)
    ? nextMarqueeSelection(current, detail.ids, { additive: detail.additive })
    : nextWidgetSelection(current, typeof detail === 'string' ? detail : detail.id, { additive: typeof detail === 'object' && detail.additive })
  selectedWidgetIds.value = selection.ids; primarySelectedWidgetId.value = selection.primaryId
}

async function applySelectedLayoutOperation(mode) {
  if (!editingDashboardSchema.value || selectionHasLockedWidget.value) return
  const result = mode === 'distribute-x' || mode === 'distribute-y'
    ? distributeSelectedLayout(designerWidgets.value, selectedWidgetIds.value, mode === 'distribute-x' ? 'x' : 'y')
    : alignSelectedLayout(designerWidgets.value, selectedWidgetIds.value, mode)
  if (!result.ok) { ElMessage.warning(result.reason || '当前选择无法进行等间距分布'); return }
  await runDashboardHistoryTransaction(async () => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: result.widgets }
    await applyDesignerWidgetsLayout(result.widgets)
  })
}

async function deleteSelectedDesignerWidgets() {
  const ids = new Set(selectedWidgetIds.value)
  if (!ids.size) return
  await runDashboardHistoryTransaction(async () => {
    for (const id of ids) designerCanvasRef.value?.unregisterWidget(id)
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: designerWidgets.value.filter(widget => !ids.has(widget.id)) }
    const cleared = clearWidgetSelection()
    selectedWidgetIds.value = cleared.ids; primarySelectedWidgetId.value = cleared.primaryId
    markDashboardDirty()
    await nextTick()
  })
}

function templatePreviewStyle(widget) {
  const layout = widget?.layout || {}
  return { gridColumn: `${Number(layout.x) + 1} / span ${Number(layout.w)}`, gridRow: `${Number(layout.y) + 1} / span ${Number(layout.h)}` }
}

function refreshLocalLayoutTemplates() { localLayoutTemplates.value = readLocalLayoutTemplates(localStorage) }

function saveCurrentLayoutAsTemplate() {
  if (!editingDashboardSchema.value) return
  const name = window.prompt('本地模板名称', `${editingDashboardSchema.value.name || '看板'}布局模板`)
  if (!name?.trim()) return
  try {
    const template = createLayoutTemplateFromDashboard(editingDashboardSchema.value, { name })
    saveLocalLayoutTemplate(template, localStorage)
    refreshLocalLayoutTemplates()
    ElMessage.success('已保存为本地模板')
  } catch (error) { ElMessage.error(`保存模板失败：${error instanceof Error ? error.message : '未知错误'}`) }
}

async function removeLocalLayoutTemplate(templateId) {
  try {
    await ElMessageBox.confirm('删除后无法恢复这个本地模板。', '删除本地模板', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    deleteLocalLayoutTemplate(templateId, localStorage)
    refreshLocalLayoutTemplates()
    ElMessage.success('本地模板已删除')
  } catch { /* User cancelled the confirmation. */ }
}

async function applyLayoutTemplate(template) {
  const validation = validateLayoutTemplate(template)
  if (!validation.valid) { ElMessage.error(`模板不可用：${validation.errors[0] || '格式错误'}`); return }
  if (designerWidgets.value.length) {
    try {
      await ElMessageBox.confirm('应用模板将替换当前组件和布局。', '应用布局模板', { confirmButtonText: '应用', cancelButtonText: '取消', type: 'warning' })
    } catch { return }
  }
  try {
    const nextSchema = applyLayoutTemplateToDashboard(editingDashboardSchema.value, template, { createWidgetId: (index) => {
      let id
      do { id = `dashboard-widget-${Date.now()}-${++designerWidgetSequence}-${index + 1}` } while (designerWidgets.value.some(widget => widget.id === id))
      return id
    } })
    const widgets = nextSchema.widgets
    await runDashboardHistoryTransaction(async () => {
      editingDashboardSchema.value = nextSchema
      const cleared = clearWidgetSelection()
      selectedWidgetIds.value = cleared.ids; primarySelectedWidgetId.value = cleared.primaryId
      markDashboardDirty()
      await nextTick()
      await designerCanvasRef.value?.whenMembershipSettled()
      designerCanvasRef.value?.applyLayout(widgets.map(widget => ({ id: widget.id, ...widget.layout })))
      const membership = designerCanvasRef.value?.getMembershipDiagnostic()
      if (membership && !membership.valid) throw new Error('组件与 GridStack 成员不一致')
      syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], false)
    })
    ElMessage.success(`已应用模板：${template.name}`)
  } catch (error) { ElMessage.error(`应用模板失败：${error instanceof Error ? error.message : '未知错误'}`) }
}

function updateDesignerStyle(partial) {
  if (!activeWidgetId.value) return
  if (String(partial.backgroundAssetKey || '').startsWith('data:image/')) {
    partial = { ...partial, backgroundImage: partial.backgroundAssetKey, backgroundAssetKey: '' }
  }
  updateDesignerWidget((widget) => ({ ...widget, config: { ...widget.config, style: { ...widget.config?.style, ...partial } } }))
}

function updateDesignerWidget(partialOrUpdater) {
  if (!editingDashboardSchema.value || !activeWidgetId.value) return
  editingDashboardSchema.value = updateDashboardWidget(editingDashboardSchema.value, activeWidgetId.value, partialOrUpdater)
  markDashboardDirty()
}
async function commitPreciseLayout(patch) {
  const widget = activeDesignerWidget.value
  if (!widget || !editingDashboardSchema.value) return
  const result = validatePreciseLayout(designerWidgets.value, widget.id, { ...widget.layout, ...patch }, editingDashboardSchema.value.layout.columns)
  if (!result.ok) { ElMessage.warning(result.reason); return }
  await runDashboardHistoryTransaction(async () => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: result.widgets }
    await applyDesignerWidgetsLayout(result.widgets)
  })
}

async function applyDesignerWidgetsLayout(widgets) {
  await nextTick()
  const appliedLayout = await applyWidgetLayoutToCanvas(designerCanvasRef.value, widgets)
  syncDesignerLayout(appliedLayout, true)
}

function syncDesignerLayout(layout, userInitiated = false) {
  if (!editingDashboardSchema.value) return
  const result = synchronizeDashboardGridLayout(editingDashboardSchema.value, layout, userInitiated)
  editingDashboardSchema.value = result.schema
  if (result.dirty) markDashboardDirty()
}

async function reconcileDesignerCanvasLayout() {
  await nextTick()
  const canvas = designerCanvasRef.value
  if (!canvas) return []
  await canvas.whenMembershipSettled()
  const layout = await canvas.applyLayout(designerWidgets.value.map(widget => ({ id: widget.id, ...widget.layout })))
  // GridStack is allowed to resolve an invalid/colliding target. Its settled public
  // save() result is then the single canonical layout, without creating a new dirty
  // action or history entry for this programmatic reconciliation.
  syncDesignerLayout(layout, false)
  return layout
}

function markDashboardDirty() {
  if (!isEditing.value) return
  dashboardDirty.value = true
  if (saveState.value !== 'error') saveState.value = 'dirty'
}

function openWidgetConfig(widgetId) {
  activeWidgetId.value = widgetId
  designerInspectorTab.value = 'data'
  designerDrawerOpen.value = true
}

function beginDashboardEdit(schema = dashboardSchema.value) {
  try {
    editingDashboardSchema.value = createDashboardEditingSnapshot(schema, loadDesignerSchema)
  } catch {
    editingDashboardSchema.value = createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
  }
  activeWidgetId.value = ''
  designerDrawerOpen.value = false
  dashboardDirty.value = false
  saveState.value = 'saved'
  lastSavedAt.value = ''
  isEditing.value = true
  designerImmersive.value = true
  dashboardHistory.value = [clonePersistableValue(editingDashboardSchema.value)]
  dashboardHistoryIndex.value = 0
}

async function startDashboardEdit() {
  if (dashboardEditLoading.value || isEditing.value) return
  if (!isRemoteDashboard()) return beginDashboardEdit()
  const targetDashboardId = activeDashboardId.value
  dashboardEditLoading.value = true
  try {
    const detail = await fetchDashboardDefinition(targetDashboardId)
    if (route.name !== 'Dashboard' || targetDashboardId !== activeDashboardId.value || isEditing.value) return
    const meta = dashboardDetailMeta(detail)
    let versions = []
    if (meta.workingVersionId && String(detail?.version?.id || '') !== meta.workingVersionId) {
      versions = await fetchDashboardVersions(meta.dashboardId || targetDashboardId)
      if (route.name !== 'Dashboard' || targetDashboardId !== activeDashboardId.value || isEditing.value) return
    }
    const workingDetail = { ...detail, version: selectDashboardVersion(detail, versions, { editing: true }) }
    remoteDashboardMeta.value = dashboardDetailMeta(workingDetail)
    remoteDashboardIsMock.value = isMockDashboardDetail(workingDetail)
    dashboardDefinition.value = workingDetail
    beginDashboardEdit(dashboardDetailToSchema(workingDetail))
  } catch (error) {
    ElMessage.error(`读取看板草稿失败：${error.message || '未知错误'}`)
  } finally {
    dashboardEditLoading.value = false
  }
}

async function applyDashboardHistory(index) {
  const snapshot = dashboardHistory.value[index]
  if (!snapshot) return
  restoringDashboardHistory = true
  try {
    editingDashboardSchema.value = clonePersistableValue(snapshot)
    dashboardHistoryIndex.value = index
    dashboardDirty.value = index !== 0
    saveState.value = dashboardDirty.value ? 'dirty' : 'saved'
    await reconcileDesignerCanvasLayout()
  } finally { restoringDashboardHistory = false }
}
function undoDashboardEdit() { if (canUndo.value) void applyDashboardHistory(dashboardHistoryIndex.value - 1) }
function redoDashboardEdit() { if (canRedo.value) void applyDashboardHistory(dashboardHistoryIndex.value + 1) }

function finishDashboardEdit() {
  editingDashboardSchema.value = null
  dashboardHistory.value = []
  dashboardHistoryIndex.value = -1
  activeWidgetId.value = ''
  designerDrawerOpen.value = false
  isEditing.value = false
  dashboardDirty.value = false
  saveState.value = 'saved'
  designerImmersive.value = false
}
async function exitDashboardEdit() {
  if (!isEditing.value) return
  if (!dashboardDirty.value) return finishDashboardEdit()
  try {
    await ElMessageBox.confirm('退出前可保存当前修改；选择“不保存并退出”将丢弃本次未保存内容。关闭弹窗则继续编辑。', '有未保存的看板修改', {
      confirmButtonText: '保存并退出', cancelButtonText: '不保存并退出', distinguishCancelAndClose: true, closeOnClickModal: false
    })
    if (await saveDashboardSchema()) finishDashboardEdit()
  } catch (action) {
    if (action === 'cancel') finishDashboardEdit()
  }
}

function saveDashboardLayout() {
  if (isEditing.value) saveDashboardSchema()
}
function setWidgetBackgroundMode(mode) {
  if (!activeWidgetId.value) return
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, style: applyWidgetBackgroundMode(widget.config?.style, mode) } }))
}
function setWidgetSurfaceEffect(surface) {
  if (!activeWidgetId.value) return
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, style: applyCardSurface(widget.config?.style, surface) } }))
}
function updateDashboardBackgroundOption(key, value) {
  if (!editingDashboardSchema.value || !['image', 'assetKey', 'size', 'position', 'overlay'].includes(key)) return
  editingDashboardSchema.value = { ...editingDashboardSchema.value, appearance: { ...editingDashboardSchema.value.appearance, background: { ...editingDashboardSchema.value.appearance?.background, [key]: value } } }
  markDashboardDirty()
}
function updateDashboardBuiltinBackground(assetKey) {
  if (!editingDashboardSchema.value) return
  const background = editingDashboardSchema.value.appearance?.background || {}
  const customImage = String(assetKey || '').startsWith('data:image/')
  editingDashboardSchema.value = {
    ...editingDashboardSchema.value,
    appearance: {
      ...editingDashboardSchema.value.appearance,
      background: { ...background, assetKey: customImage ? '' : assetKey, image: customImage ? assetKey : '', type: assetKey ? 'image' : background.type }
    }
  }
  markDashboardDirty()
}
function updateWidgetGradientColor(index, color) {
  const colors = [...widgetGradientColors.value]
  colors[index] = color
  updateDesignerStyle({ backgroundGradient: createWidgetGradient(colors) })
}
function updateDashboardBackgroundAsset(asset) {
  updateDashboardBuiltinBackground(asset)
}
function updateDesignerBackgroundAsset(asset) {
  if (!activeWidgetId.value) return
  const style = applyWidgetBackgroundMode(designerStyle.value, 'image')
  const customImage = String(asset || '').startsWith('data:image/')
  updateDesignerStyle({ ...style, backgroundAssetKey: customImage ? '' : asset, backgroundImage: customImage ? asset : '' })
}
async function applyDashboardCardSurface({ surface, scope }) {
  if (!editingDashboardSchema.value) return
  await runDashboardHistoryTransaction(() => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: applyCardSurfaceToWidgets(editingDashboardSchema.value.widgets, surface, scope) }
    markDashboardDirty()
  })
  ElMessage.success('已应用卡片表面；可继续单独调整组件背景')
}

async function publishCurrentDashboard() {
  if (!isRemoteDashboard()) return
  if (dashboardDirty.value && !(await saveDashboardSchema())) return
  try {
    const published = await publishDashboard(activeDashboardId.value, remoteDashboardMeta.value?.resourceVersion)
    remoteDashboardMeta.value = dashboardDetailMeta(published)
    ElMessage.success('看板已发布')
    await loadDashboard(activeDashboardId.value)
  } catch (error) {
    if (Number(error?.status) === 409) {
      await reloadDashboardAfterConflict('发布前看板已被其他用户更新，请重新确认最新内容。')
      return
    }
    ElMessage.error(`发布失败：${error.message || '未知错误'}`)
  }
}

async function openDashboardHistory() {
  if (!isRemoteDashboard()) return
  dashboardHistoryVisible.value = true
  dashboardHistoryLoading.value = true
  try {
    dashboardServerVersions.value = await fetchDashboardVersions(remoteDashboardMeta.value?.dashboardId || activeDashboardId.value)
  } catch (error) {
    dashboardServerVersions.value = []
    ElMessage.error(`版本历史读取失败：${error.message || '未知错误'}`)
  } finally {
    dashboardHistoryLoading.value = false
  }
}

async function restoreServerDashboardVersion(version) {
  if (!version?.id || restoringDashboardVersionId.value) return
  try {
    await ElMessageBox.confirm(
      `将基于版本 ${version.versionNo} 创建一个新的草稿版本，不会覆盖历史版本，也不会自动发布。${dashboardDirty.value ? '当前未保存修改将被替换。' : ''}`,
      '恢复历史版本',
      { type: 'warning', confirmButtonText: '恢复为新草稿', cancelButtonText: '取消' }
    )
  } catch { return }
  restoringDashboardVersionId.value = String(version.id)
  try {
    const restored = await restoreDashboardVersion(remoteDashboardMeta.value?.dashboardId || activeDashboardId.value, version.id)
    applyRemoteDashboardDetail(restored)
    dashboardHistoryVisible.value = false
    await refreshDashboardCatalog()
    ElMessage.success(`已从版本 ${version.versionNo} 创建新草稿`)
  } catch (error) {
    ElMessage.error(`恢复版本失败：${error.message || '未知错误'}`)
  } finally {
    restoringDashboardVersionId.value = ''
  }
}

function dashboardVersionStatusLabel(status) {
  return ({ DRAFT: '草稿', VALIDATED: '已校验', PUBLISHED: '已发布' })[String(status || '').toUpperCase()] || status || '未知状态'
}

function formatDashboardVersionTime(value) {
  if (!value) return '尚无更新时间'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function applyRemoteDashboardDetail(detail, fallbackSchema = null) {
  remoteDashboardMeta.value = dashboardDetailMeta(detail)
  const schema = detail?.version?.layout ? dashboardDetailToSchema(detail) : fallbackSchema
  if (!schema) return
  editingDashboardSchema.value = schema
  if (!remoteDashboardMeta.value.currentPublishedVersionId) dashboardSchema.value = schema
  dashboardHistory.value = [clonePersistableValue(schema)]
  dashboardHistoryIndex.value = 0
  dashboardDirty.value = false
  saveState.value = 'saved'
}

async function reloadDashboardAfterConflict(message) {
  try {
    await ElMessageBox.alert(message, '版本冲突', { type: 'warning', confirmButtonText: '加载最新版本' })
    const detail = await fetchDashboardDefinition(activeDashboardId.value)
    applyRemoteDashboardDetail(detail)
    await refreshDashboardCatalog()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(`最新版本读取失败：${error.message || '未知错误'}`)
  }
}

async function resolveDashboardSaveConflict(localSchema) {
  let action
  try {
    action = await ElMessageBox.confirm(
      '服务器上的看板已被其他用户更新。可以加载最新版本，或将当前编辑内容另存为一个新看板。',
      '看板版本冲突',
      { type: 'warning', confirmButtonText: '加载最新版本', cancelButtonText: '另存为副本', distinguishCancelAndClose: true }
    )
  } catch (error) {
    action = error
  }
  if (action === 'confirm') {
    const detail = await fetchDashboardDefinition(activeDashboardId.value)
    applyRemoteDashboardDetail(detail)
    await refreshDashboardCatalog()
    ElMessage.success('已加载服务器最新版本')
    return true
  }
  if (action !== 'cancel') return false
  const copied = await copyDashboard(activeDashboardId.value, {})
  const copiedMeta = dashboardDetailMeta(copied)
  const payload = remoteDashboardIsMock.value
    ? schemaToMockDashboardPayload(localSchema, { resourceVersion: copiedMeta.resourceVersion })
    : schemaToDashboardPayload(localSchema, { resourceVersion: copiedMeta.resourceVersion, dataSources: availableIndicatorSources.value })
  const saved = await saveDashboard(copiedMeta.dashboardId, payload)
  activeDashboardId.value = copiedMeta.dashboardId
  requestedDashboardId.value = copiedMeta.dashboardId
  await router.replace({ query: { ...route.query, id: copiedMeta.dashboardId } })
  applyRemoteDashboardDetail(saved, localSchema)
  await refreshDashboardCatalog()
  ElMessage.success('当前修改已另存为看板副本')
  return true
}

async function saveDashboardSchema() {
  try {
    await nextTick()
    await designerCanvasRef.value?.whenMembershipSettled()
    const layout = designerCanvasRef.value?.getLayout() || []
    const membership = designerCanvasRef.value?.getMembershipDiagnostic()
    if (!membership?.valid || !compareDashboardGridMembership(designerWidgets.value, layout).valid) {
      console.error('[Dashboard grid membership]', JSON.stringify(membership || compareDashboardGridMembership(designerWidgets.value, layout)))
      throw new Error('组件与 GridStack 布局不一致，请查看控制台诊断')
    }
    syncDesignerLayout(layout, false)
    const schema = editingDashboardSchema.value
    const validation = validateDashboardSchema(schema)
    if (!validation.valid) throw new Error(validation.errors.join('；'))
    if (isRemoteDashboard()) {
      const payload = remoteDashboardIsMock.value
        ? schemaToMockDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion })
        : schemaToDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion, dataSources: availableIndicatorSources.value })
      const saved = await saveDashboard(activeDashboardId.value, payload)
      remoteDashboardMeta.value = dashboardDetailMeta(saved)
      const normalizedRemote = saved?.version?.layout ? dashboardDetailToSchema(saved) : schema
      editingDashboardSchema.value = normalizedRemote
      if (!remoteDashboardMeta.value.currentPublishedVersionId) dashboardSchema.value = normalizedRemote
      dashboardHistory.value = [clonePersistableValue(normalizedRemote)]
      dashboardHistoryIndex.value = 0
      dashboardDirty.value = false
      saveState.value = 'saved'
      lastSavedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
      await refreshDashboardCatalog()
      ElMessage.success(remoteDashboardMeta.value.currentPublishedVersionId
        ? '看板草稿已保存，发布后对查看者生效'
        : '看板配置已保存')
      return true
    }
    if (activeScene.value) {
      const saved = await createDashboard(schemaToMockDashboardPayload(schema))
      const meta = dashboardDetailMeta(saved)
      remoteDashboardMeta.value = meta
      remoteDashboardIsMock.value = true
      const normalizedRemote = dashboardDetailToSchema(saved)
      activeDashboardId.value = meta.dashboardId
      requestedDashboardId.value = meta.dashboardId
      editingDashboardSchema.value = normalizedRemote
      dashboardSchema.value = normalizedRemote
      dashboardHistory.value = [clonePersistableValue(normalizedRemote)]
      dashboardHistoryIndex.value = 0
      dashboardDirty.value = false
      saveState.value = 'saved'
      lastSavedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
      await refreshDashboardCatalog()
      dashboardStatus.value = 'unpublished'
      ElMessage.success('演示看板已保存到服务端草稿，可继续发布')
      return true
    }
    throw new Error('当前看板无法保存到服务端。')
  } catch (error) {
    if (Number(error?.status) === 409 && isRemoteDashboard()) {
      try {
        return await resolveDashboardSaveConflict(clonePersistableValue(editingDashboardSchema.value))
      } catch (conflictError) {
        saveState.value = 'error'
        ElMessage.error(`冲突处理失败：${conflictError.message || '未知错误'}`)
        return false
      }
    }
    saveState.value = 'error'
    const message = error instanceof Error ? error.message : '未知错误'
    ElMessage.error(`保存布局失败：${message}`)
    return false
  }
}

function showDashboardSchemaDiagnostic() {
  const schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value
  const canvas = isEditing.value ? designerCanvasRef.value : viewerCanvasRef.value
  const diagnostics = (schema?.widgets || []).map(widget => canvas?.collectWidgetLayoutDiagnostic?.(widget.id))
  // Dev-only four-layer evidence for a layout issue: canonical schema, GridStack
  // node, gs-* attributes, and rendered/content rectangles.
  console.table(diagnostics)
  ElMessage.info(`Schema: ${schema?.id || activeDashboardId.value}；组件 ${diagnostics.length} 个；Key: ${activeDashboardStorageKey.value}${lastSavedAt.value ? `；最近保存 ${lastSavedAt.value}` : ''}`)
}

async function resetDashboardLayout() {
  if (!isEditing.value) return
  editingDashboardSchema.value = createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
  await reconcileDesignerCanvasLayout()
  activeWidgetId.value = ''
  markDashboardDirty()
}

function createBlankLocalSchema(dashboardId = activeDashboardId.value) {
  const metadata = localDashboardCatalog.value.find(item => item.id === dashboardId)
  return normalizeDashboardSchema({ version: 1, id: dashboardId, name: metadata?.name || findLocalSceneByDashboardId(dashboardId)?.name || '本地看板', dashboardType: metadata?.dashboardType || 'custom', category: metadata?.category || '', scope: metadata?.scope || 'personal', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [], globalFilters: [] })
}

// Demo scenes are source-controlled fixtures. They intentionally ignore each
// browser's localStorage so everyone on the same deployed version sees the
// same layout and mock values while backend data is still being built.
function createDemoSceneSchema(dashboardId = activeDashboardId.value) {
  const scene = findLocalSceneByDashboardId(dashboardId)
  if (scene?.sceneCode === 'quality-safety') {
    return createQualitySafetyDemoSchema({ id: dashboardId, sceneCode: scene.sceneCode })
  }
  return normalizeDashboardSchema({
    version: 1,
    id: dashboardId,
    name: scene?.name || '医疗质量演示看板',
    description: '统一演示模板，使用 Mock 数据。',
    dashboardType: scene?.dashboardType || 'scene',
    category: '演示看板',
    scope: 'hospital',
    sceneCode: scene?.sceneCode || '',
    layout: { engine: 'gridstack', columns: 24, float: false },
    widgets: createDesignerWidgets(createDefaultLayout()),
    globalFilters: []
  })
}

function resetDesignerVisualStyle() {
  if (!activeWidgetId.value) return
  updateDesignerWidget((widget) => ({ ...widget, config: { ...widget.config, style: resetWidgetVisualStyle(widget.config?.style) } }))
}
function loadDesignerSchema(dashboardId = activeDashboardId.value) {
  const recovery = recoverDashboardSchema(localStorage, getDashboardSchemaStorageKey(dashboardId))
  dashboardRecovery.value = recovery
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    presentationMode.value = recovery.schema.presentation.defaultMode === 'presentation' ? 'presentation' : 'standard'
    return recovery.schema
  }
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA) {
    return createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
  }
  if (shouldSkipRemoteDashboardBootstrap(dashboardId)) return createBlankLocalSchema(dashboardId)

  const legacy = readLegacyDashboardLayout()
  const sourceLayout = legacy.length ? legacy : createDefaultLayout()
  const gridLayout = legacyPixelLayoutToGrid(sourceLayout, { designWidth: DASHBOARD_DESIGN_WIDTH, columns: 24, cellHeight: 60 })
  const migrated = migrateDashboardSchema({
    id: dashboardId,
    name: `${findLocalSceneByDashboardId(dashboardId)?.name || '医疗质量'}看板`,
    layout: { engine: 'gridstack', columns: 24, float: false },
    appearance: dashboardSchema.value?.appearance,
    presentation: dashboardSchema.value?.presentation,
    widgets: mergeWidgetMetadataAndLayout(sourceLayout, gridLayout)
  }, { fromVersion: 'legacy-pixel-layout', toVersion: 1 })
  if (legacy.length) dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.MIGRATED_LEGACY_SCHEMA, schema: migrated, raw: null, error: null }
  return migrated
}

function createEditingDashboardSchema(widgets, dashboardId = activeDashboardId.value) {
  if (shouldSkipRemoteDashboardBootstrap(dashboardId)) return createBlankLocalSchema(dashboardId)
  const scene = findLocalSceneByDashboardId(dashboardId)
  return normalizeDashboardSchema({
    version: 1,
    id: dashboardId,
    name: `${scene?.name || '医疗质量'}看板`,
    dashboardType: scene?.dashboardType || 'scene',
    category: '本地场景看板',
    sceneCode: scene?.sceneCode || '',
    layout: { engine: 'gridstack', columns: 24, float: false },
    appearance: dashboardSchema.value?.appearance,
    presentation: dashboardSchema.value?.presentation,
    widgets
  })
}

function createDesignerWidgets(layout) {
  const gridLayout = legacyPixelLayoutToGrid(layout, { designWidth: DASHBOARD_DESIGN_WIDTH, columns: 24, cellHeight: 60 })
  return mergeWidgetMetadataAndLayout(layout, gridLayout)
}

function readLegacyDashboardLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) || 'null')
    return Array.isArray(saved) ? normalizeLayout(saved, getDashboardIndicatorSource) : []
  } catch {
    return []
  }
}

function loadDashboardSchema(dashboardId = activeDashboardId.value) {
  if (findLocalSceneByDashboardId(dashboardId)) {
    dashboardSchema.value = createDemoSceneSchema(dashboardId)
    dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA, schema: dashboardSchema.value, raw: null, error: null }
    loadedDashboardId.value = dashboardId
    return
  }
  const recovery = recoverDashboardSchema(localStorage, getDashboardSchemaStorageKey(dashboardId))
  dashboardRecovery.value = recovery
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    dashboardSchema.value = recovery.schema
    presentationMode.value = recovery.schema.presentation.defaultMode === 'presentation' ? 'presentation' : 'standard'
  } else if (shouldSkipRemoteDashboardBootstrap(dashboardId)) {
    // A cataloged local dashboard is local-only. An empty widgets array is valid
    // and is never treated as a missing dashboard or replaced with a demo seed.
    dashboardSchema.value = createBlankLocalSchema(dashboardId)
  } else {
    // Preview seeds are session-only; disabling preview never leaves a persisted demo schema behind.
    if (isDemoRuntime()) {
      const scene = findLocalSceneByDashboardId(dashboardId)
      const seed = scene?.sceneCode === 'quality-safety'
        ? createQualitySafetyDemoSchema({ id: dashboardId, sceneCode: scene.sceneCode })
        : createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()), dashboardId)
      dashboardSchema.value = getDashboardDemoPolicy().persistDefaultSchema
        ? persistDashboardSchema(localStorage, activeDashboardStorageKey.value, seed)
        : seed
      dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA, schema: dashboardSchema.value, raw: null, error: null }
    } else dashboardSchema.value = loadDesignerSchema(dashboardId)
  }
  loadedDashboardId.value = dashboardId
}

async function enterPresentation() {
  presentationMode.value = 'presentation'
  const element = presentationRef.value
  if (element?.requestFullscreen && !document.fullscreenElement) {
    try { await element.requestFullscreen() } catch { /* CSS fallback remains active. */ }
  }
}

async function exitPresentation() {
  if (document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen() } catch { /* fullscreenchange reconciles when available */ }
  }
  presentationMode.value = 'standard'
}

function syncFullscreenState() {
  if (!document.fullscreenElement) presentationMode.value = 'standard'
}

async function loadDashboard(targetDashboardId = activeDashboardId.value) {
  dashboardAbortController?.abort()
  remoteQueryLoading.value = false
  for (const [widgetId, generation] of remoteWidgetPreviewGenerations) remoteWidgetPreviewGenerations.set(widgetId, generation + 1)
  const generation = ++dashboardLoadGeneration
  const isCurrentLoad = () => canApplyDashboardLoad({ generation, latestGeneration: dashboardLoadGeneration, targetDashboardId, activeDashboardId: activeDashboardId.value })
  if (isRemoteDashboard(targetDashboardId)) {
    const controller = new AbortController()
    dashboardAbortController = controller
    return loadRemoteDashboard(targetDashboardId, isCurrentLoad, controller.signal)
  }
  if (shouldSkipRemoteDashboardBootstrap(targetDashboardId)) {
    // Local dashboards only recover their Schema and use frontend sources. They
    // must never request the quality-overview definition/query endpoints.
    if (!isCurrentLoad()) return
    dashboardDefinition.value = null
    dashboardQueryResult.value = null
    indicatorDataSources.value = cloneDashboardSources(mockIndicatorDataSources)
    selectedDataCode.value = selectedDataCode.value || indicatorDataSources.value[0]?.code || ''
    dashboardStatus.value = 'demo'
    dashboardLoadMessage.value = ''
    return
  }
  if (getDashboardDemoPolicy().skipDashboardBootstrap) {
    if (!isCurrentLoad()) return
    dashboardDefinition.value = null
    dashboardQueryResult.value = null
    applyDemoDashboard()
    return
  }
  const controller = new AbortController()
  dashboardAbortController = controller
  dashboardStatus.value = 'loading'
  dashboardLoadMessage.value = ''

  try {
    const [definition, queryResult] = await Promise.all([
      fetchDashboardDefinition(DASHBOARD_CODE, { signal: controller.signal }),
      queryDashboard(DASHBOARD_CODE, buildDashboardQuery(), { signal: controller.signal })
    ])
    if (controller.signal.aborted || !isCurrentLoad()) return

    dashboardDefinition.value = definition
    dashboardQueryResult.value = queryResult
    indicatorDataSources.value = createDashboardSources(queryResult)
    selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
    dashboardStatus.value = indicatorDataSources.value.length ? 'ready' : 'empty'
  } catch (error) {
    if (controller.signal.aborted || !isCurrentLoad()) return
    dashboardDefinition.value = null
    dashboardQueryResult.value = null
    if (shouldUseDashboardDemoFallback(error, getDashboardDemoPolicy())) applyDemoDashboard()
    else {
      indicatorDataSources.value = []
      dashboardStatus.value = 'error'
      dashboardLoadMessage.value = formatDashboardLoadError(error)
    }
  }
}

function formatDashboardLoadError(error) {
  const path = String(error?.path || '')
  const status = Number(error?.status)
  const statusLabel = Number.isFinite(status) && status > 0 ? `（HTTP ${status}）` : ''
  const message = String(error?.message || '').trim()
  if (!path) return message || '服务端看板目录为空，请创建看板或联系管理员授权。'
  return `正式看板请求失败：${path}${statusLabel}${message ? `。${message}` : '。生产环境不会自动使用演示数据。'}`
}

function buildDashboardQuery() {
  const [year, month] = String(period.value || '').split('-')
  return {
    year: year ? Number(year) : null,
    month: month ? Number(month) : null,
    deptCode: department.value || null
  }
}

function createDashboardSources(result = {}) {
  const summary = result?.summaryCards || {}
  const trendData = trendTableRows.value.map((item) => item.value)
  const departmentData = departmentRanking.value.map((item) => ({ name: item.department, value: item.rawValue }))
  const labels = {
    deathNum: '死亡人数',
    dischargeNum: '出院人次',
    outpatientNum: '门诊人次'
  }
  return Object.entries(labels)
    .filter(([key]) => Number.isFinite(Number(summary[key]?.value ?? summary[key])))
    .map(([key, fallbackName]) => {
      const card = summary[key]
      const rawValue = card?.value ?? card
      const indicatorId = String(card?.indicatorId || '')
      const indicatorCode = String(card?.indicatorCode || '')
      const indicatorVersionId = String(card?.indicatorVersionId || '')
      return {
      // `code` identifies the real indicator; the backend card location is independent.
      code: indicatorCode || indicatorId || `dashboard-summary-${key}`,
      dashboardSummaryKey: key,
      indicatorId,
      indicatorCode,
      indicatorName: String(card?.indicatorName || card?.name || fallbackName),
      indicatorVersionId,
      analysisIndicatorId: indicatorId,
      analysisIndicatorVersionId: indicatorVersionId,
      analysisEnabled: Boolean(indicatorId || indicatorCode),
      name: card?.indicatorName || card?.name || fallbackName,
      category: '质量看板汇总',
      unit: '',
      currentValue: formatNumber(rawValue),
      yoy: card?.yoy ?? card?.yearOnYear ?? null,
      mom: card?.mom ?? card?.monthOnMonth ?? null,
      comparisonUnit: card?.comparisonUnit || card?.changeUnit || '',
      trendDirection: card?.trendDirection || null,
      change: '当前查询结果',
      target: '来源：已发布看板',
      status: 'success',
      origin: 'backend',
      originLabel: '正式结果',
      trendData,
      trendLabels: trendTableRows.value.map((item) => item.period),
      departmentData,
      pieData: departmentData
      }
    })
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.records || payload?.rows || payload?.list || payload?.data?.records || payload?.data?.rows || payload?.data?.list || []
}

async function loadPublishedIndicatorCatalog() {
  indicatorCatalogLoading.value = true
  try {
    const [sources, indicators] = await Promise.all([
      fetchDashboardDataSources(),
      fetchIndicators({ page: 1, size: 100 }).catch(() => [])
    ])
    const orderedSources = sortDashboardDataSourcesByIndicatorCreatedAt(sources, normalizeList(indicators))
    catalogIndicatorSources.value = orderedSources.map(dashboardDataSourceToFrontend)
    if (!selectedDataSource.value) selectedDataCode.value = availableIndicatorSources.value[0]?.code || ''
    await refreshSchemaPublishedIndicatorSources()
  } catch {
    // Catalog availability must not replace the current dashboard data path.
  } finally {
    indicatorCatalogLoading.value = false
  }
}

async function ensureRemoteDataSourceFields(code, { required = false } = {}) {
  const source = availableIndicatorSources.value.find(item => item.code === code)
  if (!source || source.origin !== 'dashboard-data-source') return []
  if (remoteFieldCatalog.value[code]) return remoteFieldCatalog.value[code]
  try {
    const [fields, periods] = await Promise.all([
      fetchDashboardDataSourceFields(code), fetchDashboardDataSourcePeriods(code).catch(() => [])
    ])
    remoteFieldCatalog.value = { ...remoteFieldCatalog.value, [code]: fields }
    const options = (Array.isArray(periods) ? periods : []).map(item => {
      const date = String(item.periodStart || '').slice(0, 7)
      return date ? { value: date, label: `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月` } : null
    }).filter(Boolean)
    if (options.length) {
      periodOptions.value = [{ label: '全部期间', value: '' }, ...new Map(options.map(item => [item.value, item])).values()]
      if (!periodOptions.value.some(item => item.value === period.value)) period.value = options[0].value
    }
    if (required && !fields.length) throw new Error('该指标未提供可用于图表的数据字段')
    return fields
  } catch (error) {
    if (required) throw error
    // The inspector will show an empty binding state and the user can retry by reselecting the source.
    return []
  }
}

let remoteFilterOptionGeneration = 0
async function loadRemoteFilterOptions() {
  const generation = ++remoteFilterOptionGeneration
  const definitions = globalFilterDefinitions.value || []
  const widgets = (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.widgets || []
  const next = {}
  await Promise.all(definitions.map(async definition => {
    const sourceCode = definition.optionSourceCode || widgets.find(widget => widget.sourceCode && remoteFieldCatalog.value[widget.sourceCode]?.some(field => field.code === definition.field))?.sourceCode
    if (!sourceCode || !availableIndicatorSources.value.some(source => source.code === sourceCode && source.origin === 'dashboard-data-source')) return
    try {
      const fields = await ensureRemoteDataSourceFields(sourceCode)
      if (!fields.some(field => field.filterable && field.code?.toLowerCase() === definition.field?.toLowerCase())) return
      const range = isFormalRemoteDashboard.value
        ? dateRangeForMonths(resolvePublishedDashboardPeriodRange(remotePeriodRange.value, periodOptions.value))
        : dateRangeForMonths(period.value)
      const query = buildRemoteFilterOptionQuery(definition, definitions, filterRuntimeValues.value, fields, {
        periodStart: range.periodStart || null,
        periodEnd: range.periodEnd ? new Date(new Date(`${range.periodEnd}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : null
      })
      const rows = await fetchDashboardFilterOptions(sourceCode, query)
      next[definition.id] = (Array.isArray(rows) ? rows : []).map(item => item.value)
    } catch { /* Invalid/unsupported fields retain locally derived options. */ }
  }))
  if (generation === remoteFilterOptionGeneration) remoteFilterOptions.value = next
}

async function previewRemoteWidget(widget) {
  if (!widget?.sourceCode) return
  const widgetId = String(widget.id)
  const generation = (remoteWidgetPreviewGenerations.get(widgetId) || 0) + 1
  remoteWidgetPreviewGenerations.set(widgetId, generation)
  const fields = remoteFieldCatalog.value[widget.sourceCode] || []
  remoteWidgetDatasets.value = {
    ...remoteWidgetDatasets.value,
    [widgetId]: widgetResultToDataset({ status: 'LOADING', rows: [] }, fields, 'backend')
  }
  try {
    const payload = schemaToDashboardPayload({
      ...(editingDashboardSchema.value || dashboardSchema.value || {}),
      widgets: [widget]
    }, { dataSources: availableIndicatorSources.value }).widgets[0]
    const range = dateRangeForMonths(resolvePublishedDashboardPeriodRange(remotePeriodRange.value, periodOptions.value))
    if (normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1) {
      const datasets = await queryRemoteMultiIndicatorSources(widget, range)
      if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
      remoteMultiIndicatorDatasets.value = { ...remoteMultiIndicatorDatasets.value, [widgetId]: datasets }
      remoteWidgetDatasets.value = { ...remoteWidgetDatasets.value, [widgetId]: createMultiIndicatorDataset(widget, datasets) }
      return
    }
    const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(range, widget.sourceCode))
    if (planned.error) throw new Error(planned.error)
    if (planned.empty) throw new Error('组件范围与看板周期没有交集')
    const { widgetCodes, ...baseQuery } = planned.query
    const query = buildPublishedIndicatorTrendPreviewQuery(widget, baseQuery)
    const result = await previewDashboardWidget({ widget: payload, ...query })
    if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
    remoteWidgetDatasets.value = {
      ...remoteWidgetDatasets.value,
      [widgetId]: widgetResultToDataset(result, fields, 'backend')
    }
  } catch (error) {
    if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
    remoteWidgetDatasets.value = {
      ...remoteWidgetDatasets.value,
      [widgetId]: widgetResultToDataset({ status: 'ERROR', message: error?.message || '数据预览请求失败', rows: [] }, fields, 'backend')
    }
  }
}

async function hydrateIndicatorSource(source) {
  if (!['indicator-catalog', 'dashboard-data-source'].includes(source?.origin) || !source.analysisIndicatorId) return source
  const periodSelection = isFormalRemoteDashboard.value ? remotePeriodRange.value : period.value
  const query = buildPublishedIndicatorAnalysisQuery(source, periodSelection)
  const queryKey = JSON.stringify(query)
  if (source.analysisLoaded && source.analysisQueryKey === queryKey) return source
  const requestKey = `${source.code}:${queryKey}`
  if (indicatorHydrationRequests.has(requestKey)) return indicatorHydrationRequests.get(requestKey)
  const trendQuery = { ...query }
  delete trendQuery.periodStart
  delete trendQuery.periodEnd
  const request = Promise.all([
    fetchIndicatorAnalysis(source.analysisIndicatorId, query),
    !Array.isArray(periodSelection) && query.periodStart ? fetchIndicatorAnalysis(source.analysisIndicatorId, trendQuery) : Promise.resolve(null)
  ]).then(([payload, trendPayload]) => {
    const analysisPayload = trendPayload?.dataAvailable
      ? { ...payload, trend: Array.isArray(trendPayload.trend) ? trendPayload.trend : payload?.trend }
      : payload
    const hydrated = { ...applyIndicatorAnalysisToSource(source, analysisPayload), analysisLoaded: true }
    hydrated.analysisQueryKey = queryKey
    catalogIndicatorSources.value = catalogIndicatorSources.value.map(item => item.code === hydrated.code ? hydrated : item)
    return hydrated
  }).finally(() => indicatorHydrationRequests.delete(requestKey))
  indicatorHydrationRequests.set(requestKey, request)
  return request
}

async function refreshSchemaPublishedIndicatorSources() {
  const schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value
  const sourceCodes = [...new Set([
    ...(schema?.widgets || []).flatMap(widget => [widget?.sourceCode, ...metricGroupSourceCodes(widget)]).filter(Boolean),
    ...schemaPublishedIndicatorSourceCodes(schema)
  ])]
  const sources = sourceCodes
    .map(code => catalogIndicatorSources.value.find(source => source.code === code))
    .filter(Boolean)
  await Promise.allSettled(sources.map(source => hydrateIndicatorSource(source)))
}

function applyDemoDashboard() {
  indicatorDataSources.value = cloneDashboardSources(mockIndicatorDataSources)
  selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
  dashboardStatus.value = 'demo'
  dashboardLoadMessage.value = ''
  if (!getDashboardDemoPolicy().skipDashboardBootstrap) void loadMortalityReadonlyChain()
}
let dashboardSwitchPromise = null
let dashboardSwitchTargetId = ''
async function requestDashboardSwitch(nextDashboardId) {
  const previousDashboardId = activeDashboardId.value
  if (!nextDashboardId || nextDashboardId === previousDashboardId) { requestedDashboardId.value = previousDashboardId; return }
  if (dashboardSwitchPromise) {
    if (dashboardSwitchTargetId === nextDashboardId) return dashboardSwitchPromise
    requestedDashboardId.value = previousDashboardId
    return
  }
  dashboardSwitchTargetId = nextDashboardId
  dashboardSwitchPromise = performDashboardSwitch(nextDashboardId, previousDashboardId).finally(() => { dashboardSwitchPromise = null; dashboardSwitchTargetId = '' })
  return dashboardSwitchPromise
}

async function loadRemoteDashboard(targetDashboardId, isCurrentLoad = () => true, signal) {
  dashboardStatus.value = 'loading'
  dashboardLoadMessage.value = ''
  try {
    const detail = await fetchDashboardDefinition(targetDashboardId, { signal })
    if (!isCurrentLoad()) return
    remoteDashboardMeta.value = dashboardDetailMeta(detail)
    let version = detail.version
    if (remoteDashboardMeta.value.currentPublishedVersionId && !isEditing.value) {
      const versions = await fetchDashboardVersions(remoteDashboardMeta.value.dashboardId, { signal })
      if (!isCurrentLoad()) return
      version = selectDashboardVersion(detail, versions, { editing: false })
    }
    remoteDashboardIsMock.value = isMockDashboardDetail({ dashboard: detail.dashboard, version })
    const rawSchema = dashboardDetailToSchema({ dashboard: detail.dashboard, version })
    if (remoteDashboardIsMock.value) {
      indicatorDataSources.value = cloneDashboardSources(mockIndicatorDataSources)
      selectedDataCode.value = selectedDataCode.value || indicatorDataSources.value[0]?.code || ''
      dashboardSchema.value = rawSchema
      if (isEditing.value) {
        editingDashboardSchema.value = clonePersistableValue(rawSchema)
        dashboardHistory.value = [clonePersistableValue(rawSchema)]
        dashboardHistoryIndex.value = 0
      }
      dashboardDefinition.value = detail
      dashboardQueryResult.value = null
      remoteWidgetDatasets.value = {}
      remoteMultiIndicatorDatasets.value = {}
      dashboardStatus.value = remoteDashboardMeta.value.currentPublishedVersionId ? 'demo' : 'unpublished'
      return
    }
    if (rawSchema.widgets.some(widget => normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1)) {
      const sources = await fetchDashboardDataSources({ signal })
      if (!isCurrentLoad()) return
      catalogIndicatorSources.value = (Array.isArray(sources) ? sources : []).map(dashboardDataSourceToFrontend)
    }
    const sourceCodes = [...new Set(rawSchema.widgets.flatMap(widget => [widget.sourceCode, ...normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).map(binding => binding.sourceCode), ...metricGroupSourceCodes(widget)]).filter(Boolean))]
    const metadataEntries = await Promise.all(sourceCodes.map(async code => {
      const [fields, periods] = await Promise.all([
        fetchDashboardDataSourceFields(code, { signal }).catch(error => {
          if (signal?.aborted) throw error
          return []
        }),
        fetchDashboardDataSourcePeriods(code, { signal }).catch(error => {
          if (signal?.aborted) throw error
          return []
        })
      ])
      return { code, fields, periods }
    }))
    if (!isCurrentLoad()) return
    remoteFieldCatalog.value = Object.fromEntries(metadataEntries.map(item => [item.code, item.fields]))
    const availablePeriods = createPublishedDashboardPeriodOptions(metadataEntries.map(item => item.periods))
    if (availablePeriods.length) {
      periodOptions.value = availablePeriods
      const nextPeriodRange = resolvePublishedDashboardPeriodRange(remotePeriodRange.value, availablePeriods)
      if (JSON.stringify(remotePeriodRange.value) !== JSON.stringify(nextPeriodRange)) {
        reconcilingRemotePeriod = true
        try {
          remotePeriodRange.value = nextPeriodRange
          remotePeriodDraft.value = [...nextPeriodRange]
          await nextTick()
        } finally {
          reconcilingRemotePeriod = false
        }
      } else if (!remotePeriodDraft.value.length) {
        remotePeriodDraft.value = [...nextPeriodRange]
      }
    }
    const result = remoteDashboardMeta.value.currentPublishedVersionId
      ? await queryRemoteDashboardByPeriod(rawSchema, signal, targetDashboardId)
      : null
    if (!isCurrentLoad()) return
    const schema = applyDefaultDashboardBindings(rawSchema, remoteFieldCatalog.value)
    dashboardSchema.value = schema
    if (isEditing.value) {
      editingDashboardSchema.value = clonePersistableValue(schema)
      dashboardHistory.value = [clonePersistableValue(schema)]
      dashboardHistoryIndex.value = 0
    }
    dashboardDefinition.value = detail
    dashboardQueryResult.value = null
    remoteWidgetDatasets.value = {}
    remoteMultiIndicatorDatasets.value = {}
    if (!remoteDashboardMeta.value.currentPublishedVersionId) {
      dashboardStatus.value = 'unpublished'
      return
    }
    dashboardQueryResult.value = result
    remoteMultiIndicatorDatasets.value = result.multiDatasets || {}
    remoteWidgetDatasets.value = Object.fromEntries(schema.widgets.map(widget => [
      String(widget.id),
      widgetResultToDataset(dashboardWidgetResult(result, schema.widgets, widget), remoteFieldCatalog.value[widget.sourceCode], 'backend')
    ]))
    const queryState = resolveDashboardQueryState(result, schema.widgets.length)
    dashboardStatus.value = queryState.status
    dashboardLoadMessage.value = queryState.message
    if (isEditing.value) {
      for (const widget of schema.widgets.filter(widget => bindingKind(widget) === 'line' && widget.sourceCode)) void previewRemoteWidget(widget)
    }
  } catch (error) {
    if (!isCurrentLoad()) return
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = formatDashboardLoadError(error)
  }
}

function remoteWidgetQueryContext(range, sourceCode, schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value) {
  const definitions = schema?.globalFilters || globalFilterDefinitions.value
  return {
    ...range, definitions, values: schema === dashboardSchema.value || schema === editingDashboardSchema.value ? filterRuntimeValues.value : initialFilterValues(definitions),
    fields: remoteFieldCatalog.value[sourceCode] || [], department: department.value
  }
}

async function queryRemoteMultiIndicatorSources(widget, range, signal, schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value) {
  const datasets = new Map()
  const bindings = normalizeIndicatorBindings(widget.config?.indicatorBindings, widget)
  await Promise.all(bindings.map(async binding => {
    const source = availableIndicatorSources.value.find(item => item.code === binding.sourceCode)
    if (source?.origin !== 'dashboard-data-source') {
      datasets.set(binding.sourceCode, [{ id: 'backend', fields: [], rows: [], status: 'ERROR', message: `指标 ${binding.sourceCode} 不是可查询的正式数据源` }])
      return
    }
    const fields = remoteFieldCatalog.value[binding.sourceCode] || await fetchDashboardDataSourceFields(binding.sourceCode, { signal })
    remoteFieldCatalog.value = { ...remoteFieldCatalog.value, [binding.sourceCode]: fields }
    const sourceWidget = { ...widget, sourceCode: binding.sourceCode, config: { ...widget.config, indicatorBindings: [], analysisIndicatorVersionId: binding.indicatorVersionId || source.indicatorVersionId } }
    const planned = buildRemoteWidgetQuery(sourceWidget, remoteWidgetQueryContext(range, binding.sourceCode, schema))
    if (planned.error || planned.empty) {
      datasets.set(binding.sourceCode, [{ id: 'backend', fields: [], rows: [], status: planned.error ? 'ERROR' : 'EMPTY', message: planned.error || '组件范围与看板周期没有交集' }])
      return
    }
    const payload = schemaToDashboardPayload({ ...(editingDashboardSchema.value || dashboardSchema.value || {}), widgets: [sourceWidget] }, { dataSources: availableIndicatorSources.value }).widgets[0]
    const { widgetCodes, ...query } = planned.query
    const result = await previewDashboardWidget({ widget: payload, ...query }, { signal })
    datasets.set(binding.sourceCode, [widgetResultToDataset(result, fields, 'backend')])
  }))
  return datasets
}

async function queryRemoteDashboardByPeriod(schema, signal, dashboardId) {
  const [startMonth, endMonth] = resolvePublishedDashboardPeriodRange(remotePeriodRange.value, periodOptions.value)
  const widgets = uniqueDashboardQueryWidgets(schema)
  const fullRange = dateRangeForMonths([startMonth, endMonth])
  const parts = await mapWithConcurrency(widgets, 3, async widget => {
    const trend = String(widget.config?.backendQuery?.resultShape || '').toUpperCase() === 'TREND'
    const range = trend ? fullRange : dateRangeForMonths([endMonth, endMonth])
    if (normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1) {
      try {
        const datasets = await queryRemoteMultiIndicatorSources(widget, range, signal, schema)
        const combined = createMultiIndicatorDataset(widget, datasets)
        return { widgets: { [widget.id]: { status: combined.status, message: combined.message, rows: combined.rows } }, multiDatasets: { [String(widget.id)]: datasets } }
      } catch (error) {
        if (signal?.aborted) throw error
        return { widgets: { [widget.id]: { status: 'ERROR', message: error?.message || '多指标查询失败', rows: [] } } }
      }
    }
    const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(range, widget.sourceCode, schema))
    if (planned.error || planned.empty) return { widgets: { [widget.id]: { status: planned.error ? 'ERROR' : 'EMPTY', message: planned.error || '组件范围与看板周期没有交集', rows: [] } } }
    const query = planned.query
    if (trend && query.granularity === 'MONTHLY') {
      const months = monthsBetween(query.periodStart.slice(0, 7), new Date(new Date(`${query.periodEnd}T00:00:00Z`).getTime() - 1).toISOString().slice(0, 7))
      return queryDashboardTrendMonths(dashboardId, query, [widget], months, signal)
    }
    return queryRemoteDashboardCached(dashboardId, query, signal)
  })
  return {
    ...parts[0],
    generatedAt: parts.map(part => part.generatedAt).filter(Boolean).sort().at(-1),
    widgets: Object.assign({}, ...parts.map(part => part.widgets || {})),
    multiDatasets: Object.assign({}, ...parts.map(part => part.multiDatasets || {}))
  }
}

const remoteDashboardQueryCache = new Map()
const REMOTE_DASHBOARD_QUERY_CACHE_TTL_MS = 30_000
function remoteDashboardQueryCacheKey(dashboardId, query) {
  return `${dashboardId}:${remoteDashboardMeta.value.currentPublishedVersionId || ''}:${JSON.stringify(query)}`
}
async function queryRemoteDashboardCached(dashboardId, query, signal) {
  const key = remoteDashboardQueryCacheKey(dashboardId, query)
  const cached = remoteDashboardQueryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.result
  remoteDashboardQueryCache.delete(key)
  const result = await queryDashboard(dashboardId, query, { signal, cache: 'no-store' })
  const widgets = Object.values(result?.widgets || {})
  if (!signal?.aborted && widgets.length && widgets.every(widget => widget?.status === 'READY')) {
    remoteDashboardQueryCache.set(key, { result, expiresAt: Date.now() + REMOTE_DASHBOARD_QUERY_CACHE_TTL_MS })
    while (remoteDashboardQueryCache.size > 64) remoteDashboardQueryCache.delete(remoteDashboardQueryCache.keys().next().value)
  }
  return result
}
function monthsBetween(startMonth, endMonth) {
  const [startYear, startValue] = String(startMonth).split('-').map(Number)
  const [endYear, endValue] = String(endMonth).split('-').map(Number)
  if (![startYear, startValue, endYear, endValue].every(Number.isFinite)) return []
  const months = []
  for (let cursor = new Date(startYear, startValue - 1, 1), end = new Date(endYear, endValue - 1, 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}
function mergeMonthlyDashboardResults(parts) {
  const widgets = {}
  for (const part of parts) {
    for (const [widgetCode, result] of Object.entries(part?.widgets || {})) {
      const previous = widgets[widgetCode]
      widgets[widgetCode] = { ...previous, ...result, rows: [...(previous?.rows || []), ...(result?.rows || [])] }
    }
  }
  for (const result of Object.values(widgets)) {
    const unique = new Map(result.rows.map(row => [JSON.stringify([row.periodStart, row.periodEnd, row.dimensionHash, row.resultId, row.value]), row]))
    result.rows = [...unique.values()].sort((left, right) => String(left.periodStart || '').localeCompare(String(right.periodStart || '')))
  }
  return {
    ...parts[0],
    generatedAt: parts.map(part => part?.generatedAt).filter(Boolean).sort().at(-1),
    widgets
  }
}
async function queryDashboardTrendMonths(dashboardId, baseQuery, widgets, months, signal) {
  const widgetCodes = widgets.map(widget => String(widget.id))
  const parts = await mapWithConcurrency(months, 3, month => {
    const range = dateRangeForMonths([month, month])
    return queryRemoteDashboardCached(dashboardId, {
      ...baseQuery,
      periodStart: baseQuery.periodStart > range.periodStart ? baseQuery.periodStart : range.periodStart,
      periodEnd: baseQuery.periodEnd < range.periodEnd ? baseQuery.periodEnd : range.periodEnd,
      widgetCodes
    }, signal)
  })
  return mergeMonthlyDashboardResults(parts)
}

async function refreshRemoteDashboardData() {
  const schema = dashboardSchema.value
  const targetDashboardId = activeDashboardId.value
  if (!isRemoteDashboard(targetDashboardId) || !canRefreshCurrentRemoteDashboard.value) return
  dashboardAbortController?.abort()
  const controller = new AbortController()
  dashboardAbortController = controller
  const generation = ++dashboardLoadGeneration
  const isCurrentLoad = () => canApplyDashboardLoad({ generation, latestGeneration: dashboardLoadGeneration, targetDashboardId, activeDashboardId: activeDashboardId.value })
  remoteQueryLoading.value = true
  dashboardLoadMessage.value = ''
  try {
    const result = await queryRemoteDashboardByPeriod(schema, controller.signal, targetDashboardId)
    if (controller.signal.aborted || !isCurrentLoad()) return
    dashboardQueryResult.value = result
    remoteMultiIndicatorDatasets.value = result.multiDatasets || {}
    remoteWidgetDatasets.value = Object.fromEntries(schema.widgets.map(widget => [
      String(widget.id),
      widgetResultToDataset(dashboardWidgetResult(result, schema.widgets, widget), remoteFieldCatalog.value[widget.sourceCode], 'backend')
    ]))
    const queryState = resolveDashboardQueryState(result, schema.widgets.length)
    dashboardStatus.value = queryState.status
    dashboardLoadMessage.value = queryState.message
  } catch (error) {
    if (controller.signal.aborted || !isCurrentLoad()) return
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = formatDashboardLoadError(error)
  } finally {
    if (isCurrentLoad()) remoteQueryLoading.value = false
  }
}

function dashboardWidgetQuerySignature(widget = {}) {
  return JSON.stringify({
    sourceCode: widget.sourceCode || '',
    indicatorVersionId: widget.config?.analysisIndicatorVersionId || '',
    dataBinding: widget.config?.dataBinding || {},
    backendQuery: widget.config?.backendQuery || {},
    query: widget.config?.query || {},
    indicatorBindings: widget.config?.indicatorBindings || []
  })
}

function uniqueDashboardQueryWidgets(schema = {}) {
  const signatures = new Set()
  return (schema?.widgets || []).filter(widget => {
    if (normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1) return true
    const signature = dashboardWidgetQuerySignature(widget)
    if (signatures.has(signature)) return false
    signatures.add(signature)
    return true
  })
}

function dashboardWidgetResult(result, widgets, widget) {
  const direct = result?.widgets?.[widget.id]
  if (direct) return direct
  const signature = dashboardWidgetQuerySignature(widget)
  const representative = widgets.find(candidate => dashboardWidgetQuerySignature(candidate) === signature && result?.widgets?.[candidate.id])
  return representative ? result.widgets[representative.id] : undefined
}
async function performDashboardSwitch(nextDashboardId, previousDashboardId) {
  if (shouldConfirmDashboardSceneSwitch({ isEditing: isEditing.value, dirty: dashboardDirty.value })) {
    try {
      await ElMessageBox.confirm('切换场景前，请选择如何处理这些修改。关闭弹窗将继续编辑。', '当前看板有未保存的修改', { confirmButtonText: '保存并切换', cancelButtonText: '不保存并切换', distinguishCancelAndClose: true, closeOnClickModal: false })
      if (!(await saveDashboardSchema())) { requestedDashboardId.value = previousDashboardId; return }
    } catch (action) {
      if (action !== 'cancel') { requestedDashboardId.value = previousDashboardId; return }
    }
  }
  globalThis.clearTimeout(remoteFilterReloadTimer)
  dashboardAbortController?.abort()
  dashboardLoadGeneration += 1
  remoteQueryLoading.value = false
  dashboardStatus.value = 'loading'
  remoteDashboardMeta.value = null
  remoteDashboardIsMock.value = false
  filterRuntimeValues.value = {}
  interactionFilterState.value = {}
  drillRuntimeState.value = {}
  selectedWidgetIds.value = []
  primarySelectedWidgetId.value = ''
  dashboardHistory.value = []
  dashboardHistoryIndex.value = -1
  dashboardDirty.value = false
  // Schema recovery is synchronous; commit identity and schema in the same
  // Vue update batch so selector, title, canvas and editing snapshot agree.
  loadDashboardSchema(nextDashboardId)
  activeDashboardId.value = nextDashboardId
  requestedDashboardId.value = nextDashboardId
  const scene = findLocalSceneByDashboardId(nextDashboardId)
  if (scene) activeSceneCode.value = scene.sceneCode
  if (isEditing.value && dashboardSchema.value) {
    editingDashboardSchema.value = clonePersistableValue(dashboardSchema.value)
    dashboardHistory.value = [clonePersistableValue(editingDashboardSchema.value)]
    dashboardHistoryIndex.value = 0
    await reconcileDesignerCanvasLayout()
  }
  await loadDashboard(nextDashboardId)
}
function isDemoRuntime() {
  return getDashboardDemoPolicy().useDemoOnFailure
}
function getDashboardDemoPolicy() {
  return dashboardDemoPolicy({
    previewMode: import.meta.env.VITE_DASHBOARD_PREVIEW_MODE,
    development: import.meta.env.DEV,
    test: import.meta.env.MODE === 'test',
    explicit: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dashboardDemo') === '1'
  })
}
async function restoreQualitySafetyDemoLayout() {
  if (!canRestoreQualitySafetyDemo.value || !editingDashboardSchema.value) return
  try {
    await ElMessageBox.confirm('恢复演示布局将替换当前质量安全看板的组件、布局和筛选配置。是否继续？', '恢复演示布局', {
      confirmButtonText: '恢复演示布局', cancelButtonText: '取消', type: 'warning', closeOnClickModal: false
    })
  } catch { return }
  await runDashboardHistoryTransaction(async () => {
    const restored = createQualitySafetyDemoRestoreResult(createQualitySafetyDemoSchema({ id: activeDashboardId.value, sceneCode: activeScene.value?.sceneCode || '' }))
    editingDashboardSchema.value = restored.schema
    const cleared = clearWidgetSelection()
    selectedWidgetIds.value = cleared.ids
    primarySelectedWidgetId.value = cleared.primaryId
    activeWidgetId.value = ''
    interactionFilterState.value = {}
    drillRuntimeState.value = {}
    await reconcileDesignerCanvasLayout()
    if (restored.dirty) markDashboardDirty()
  })
  ElMessage.success('已恢复质量安全演示布局，请保存后生效')
}

async function loadMortalityReadonlyChain() {
  const chain = await fetchMortalityReadonlyChain().catch(() => null)
  const source = applyMortalityReadonlyChain(indicatorDataSources.value, chain)
  if (source) indicatorDataSources.value = indicatorDataSources.value.map((item) => item.code === source.code ? { ...source, origin: 'backend', originLabel: '后端试算结果' } : item)
}

function cloneDashboardSources(sources) {
  return sources.map((source) => ({
    ...source,
    origin: source.origin || 'demo',
    originLabel: source.originLabel || '演示',
    trendData: [...(source.trendData || [])],
    trendLabels: [...(source.trendLabels || dashboardTrend.months)],
    departmentData: (source.departmentData || []).map((item) => ({ ...item })),
    pieData: (source.pieData || []).map((item) => ({ ...item }))
  }))
}

function normalizeMonthlyTrend(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item) => ({
      period: item?.period || item?.month || '',
      value: Number(item?.value)
    }))
    .filter((item) => item.period !== '' && Number.isFinite(item.value))
}

function normalizeRanking(rows, source = 'live') {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item, index) => {
      const rawValue = Number(item?.value)
      return {
        rank: index + 1,
        departmentCode: String(item?.deptCode || item?.departmentCode || ''),
        department: item?.deptName || item?.deptCode || '未命名科室',
        rawValue,
        value: Number.isFinite(rawValue) ? formatNumber(rawValue) : '-',
        drillTarget: normalizeDashboardDrillTarget(item?.drillTarget, source)
      }
    })
    .filter((item) => Number.isFinite(item.rawValue))
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value))
}

const goAlerts = () => {
  if (isEditing.value) return
  router.push('/alerts')
}
const goIndicatorAnalysis = (indicator, backendQuery = {}, drillContext = null) => {
  if (isEditing.value) return
  const source = typeof indicator === 'object' && indicator ? indicator : getDashboardIndicatorSource(indicator)
  const context = buildIndicatorAnalysisPeriodContext(isFormalRemoteDashboard.value ? remotePeriodRange.value : period.value, backendQuery)
  const query = buildIndicatorAnalysisRouteQuery(source || { code: indicator }, context)
  if (!query || source?.analysisEnabled === false) return
  router.push({
    path: '/analysis',
    query: {
      ...query,
      ...(drillContext?.resultId ? { drillResultId: String(drillContext.resultId) } : {}),
      ...(drillContext?.currentLevel ? { drillStartLevel: String(drillContext.currentLevel) } : {}),
      ...(drillContext?.parentKeys && Object.keys(drillContext.parentKeys).length ? { drillParentKeys: JSON.stringify(drillContext.parentKeys) } : {})
    }
  })
}

watch(period, () => {
  if (reconcilingRemotePeriod) return
  loadDashboard()
  if (getDashboardDemoPolicy().loadPublishedIndicators) void refreshSchemaPublishedIndicatorSources()
})
watch([remotePeriodRange, department], () => {
  if (reconcilingRemotePeriod) return
  if (isFormalRemoteDashboard.value) void refreshRemoteDashboardData()
  else void loadDashboard()
})
watch(activeWidgetId, () => { selectedMetricItemId.value = '' })
let remoteFilterReloadTimer
watch(filterRuntimeValues, () => {
  if (!isEditing.value && isRemoteDashboard() && canRefreshCurrentRemoteDashboard.value) {
    globalThis.clearTimeout(remoteFilterReloadTimer)
    remoteFilterReloadTimer = globalThis.setTimeout(() => {
      if (canRefreshCurrentRemoteDashboard.value) void refreshRemoteDashboardData()
    }, 180)
  }
}, { deep: true })

function onDesignerGlobalKeydown(event) {
  if (!isEditing.value || !selectedWidgetIds.value.length || event.defaultPrevented) return
  const target = event.target
  if (target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable || target.closest('[contenteditable="true"]'))) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedDesignerWidgets()
  }
}

function addDashboardListeners() {
  document.addEventListener('fullscreenchange', syncFullscreenState)
  window.addEventListener('beforeunload', onDashboardBeforeUnload)
  window.addEventListener('keydown', onDesignerGlobalKeydown)
  window.addEventListener('resize', syncViewerViewport, { passive: true })
}

function removeDashboardListeners() {
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  window.removeEventListener('beforeunload', onDashboardBeforeUnload)
  window.removeEventListener('keydown', onDesignerGlobalKeydown)
  window.removeEventListener('resize', syncViewerViewport)
}

let dashboardDeactivatedAt = 0
onDeactivated(() => {
  dashboardDeactivatedAt = Date.now()
  designerImmersive.value = false
  globalThis.clearTimeout(remoteFilterReloadTimer)
  removeDashboardListeners()
})
onActivated(() => {
  if (!dashboardDeactivatedAt) return
  addDashboardListeners()
  designerImmersive.value = isEditing.value
  if (Date.now() - dashboardDeactivatedAt > 30_000 && isFormalRemoteDashboard.value) {
    remoteDashboardQueryCache.clear()
    globalThis.setTimeout(() => { void refreshRemoteDashboardData() }, 0)
  }
  dashboardDeactivatedAt = 0
})

onMounted(async () => {
  addDashboardListeners()
  if (!isEditing.value) designerImmersive.value = false
  try {
    refreshLocalLayoutTemplates()
    if (!managedDashboardId.value) {
      await refreshDashboardCatalog()
    } else if (!findLocalSceneByDashboardId(managedDashboardId.value)) {
      // A deep-linked dashboard can load by its id directly; refresh the selector list in parallel.
      void refreshDashboardCatalog().catch(() => {})
    }
    if (!managedDashboardId.value && !activeDashboardId.value) {
      const defaultScene = LOCAL_SCENE_DASHBOARDS[0]
      if (defaultScene) {
        activeDashboardId.value = defaultScene.dashboardId
        requestedDashboardId.value = defaultScene.dashboardId
        activeSceneCode.value = defaultScene.sceneCode
      }
    }
    if (managedDashboardId.value || activeDashboardId.value) {
      loadDashboardSchema()
      await loadDashboard()
      void loadPublishedIndicatorCatalog()
    } else {
      // A dashboard route without a selected scene is an intentional idle state,
      // not a request in progress. Let the user choose from the shared selector.
      dashboardStatus.value = 'select'
    }
  } catch (error) {
    // Initialization includes synchronous schema recovery as well as requests.
    // Keep an unexpected startup exception from leaving the initial loading panel forever.
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = formatDashboardLoadError(error)
  }
})

onBeforeUnmount(() => {
  designerImmersive.value = false
  dashboardAbortController?.abort()
  globalThis.clearTimeout(remoteFilterReloadTimer)
  removeDashboardListeners()
})
</script>

<style scoped lang="scss">
.dashboard-filter {
  width: 156px;
}

.dashboard-save-state {
  color: var(--idmp-text-helper, #667085);
  font-size: 13px;
  white-space: nowrap;
}
.dashboard-save-state.is-dirty { color: var(--idmp-support-warning, #b54708); }
.dashboard-save-state.is-error { color: var(--idmp-support-danger, #d92d20); }
.dashboard-save-state.is-saved { color: var(--idmp-support-success, #027a48); }

.dashboard-designer-canvas {
  min-height: 932px;
  margin-top: 16px;
}

.dashboard-page { min-height:100%; }
.dashboard-schema-viewer { width:100%; margin-top:16px; overflow-x:auto; overflow-y:hidden; }
.dashboard-canvas-frame { overflow:hidden; padding:6px 10px 10px; border:1px solid var(--idmp-border-subtle,#d9e0e6); border-radius:var(--idmp-radius-lg,4px); background:var(--idmp-layer-01,#fff); }
.dashboard-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; min-height:38px; padding:0 2px 8px; margin-bottom:7px; border-bottom:1px solid var(--idmp-border-subtle,#e7ecef); }
.dashboard-query-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; }
.dashboard-query-control,.dashboard-query-scope { display:flex; align-items:center; gap:6px; color:var(--idmp-text-secondary,#667085); font-size:12px; }
.dashboard-query-control > span,.dashboard-query-scope > span { color:var(--idmp-text-helper,#858f99); }
.dashboard-query-scope strong { color:var(--idmp-text-primary,#344054); font-weight:500; }
.dashboard-filter.dashboard-filter--compact { width:142px; }
.dashboard-period-selects { display:flex; align-items:center; gap:6px; }
.dashboard-filter.dashboard-filter--period { width:126px; }
.dashboard-toolbar__filters { min-width:0; }
.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact) { flex-wrap:wrap; gap:6px 12px; }
.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact small) { display:none; }
.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact .filter-control) { display:flex; align-items:center; gap:6px; }
.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact .filter-control > label) { margin:0; white-space:nowrap; }
.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact > button) { min-height:28px; padding:4px 8px; }
.dashboard-schema-canvas { min-height:620px; max-width:100%; background-color:var(--dashboard-background,#ffffff); background-image:linear-gradient(var(--dashboard-background-overlay,transparent),var(--dashboard-background-overlay,transparent)),linear-gradient(var(--dashboard-background-wash,rgba(255,255,255,0)),var(--dashboard-background-wash,rgba(255,255,255,0))),var(--dashboard-background-image,none); background-size:auto,auto,var(--dashboard-background-size,cover); background-position:center,center,var(--dashboard-background-position,center); background-repeat:no-repeat,no-repeat,no-repeat; background-attachment:scroll,scroll,scroll; }
.dashboard-designer-shell { min-width: 0; }
.dashboard-property-inspector__empty { color: var(--idmp-text-helper, #667085); font-size: 13px; }
.dashboard-settings-inspector { display:grid; gap:10px; margin-bottom:18px; }.dashboard-settings-inspector h3 { margin:0; font-size:14px; }.dashboard-settings-inspector label { display:grid; gap:4px; color:#475467; font-size:12px; }.dashboard-settings-inspector input,.dashboard-settings-inspector textarea,.dashboard-settings-inspector select { width:100%; box-sizing:border-box; border:1px solid #d0d5dd; border-radius:4px; padding:6px; background:#fff; }.dashboard-settings-inspector textarea { min-height:56px; resize:vertical; }
.dashboard-property-list { display: grid; grid-template-columns: 72px 1fr; gap: 10px; font-size: 13px; }
.dashboard-property-list dt { color: var(--idmp-text-helper, #667085); }
.dashboard-property-list dd { margin: 0; color: var(--idmp-text-primary, #101828); overflow-wrap: anywhere; }
.dashboard-style-form { display: grid; gap: 12px; padding-top: 8px; }
.dashboard-style-form label { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--idmp-text-secondary, #475467); font-size: 13px; }
.dashboard-style-form input[type='number'], .dashboard-style-form select { width: 110px; padding: 5px 6px; border: 1px solid #d0d5dd; border-radius: 4px; }
.dashboard-style-form input[type='color'] { width: 44px; height: 28px; padding: 0; border: 0; background: transparent; }
.dashboard-precise-layout { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 12px; margin-top:16px; padding-top:16px; border-top:1px solid var(--db-border); }
.dashboard-precise-layout h3,.dashboard-precise-layout small { grid-column:1 / -1; margin:0; }
.dashboard-precise-layout h3 { color:var(--db-text); font-size:13px; font-weight:600; }
.dashboard-precise-layout label { display:grid; align-content:start; gap:5px; min-width:0; color:var(--db-secondary); font-size:12px; }
.dashboard-precise-layout label:nth-of-type(5) { grid-column:1 / -1; }
.dashboard-precise-layout input { box-sizing:border-box; width:100%; min-width:0; height:32px; padding:4px 8px; border:1px solid var(--db-border); border-radius:var(--idmp-radius-md,3px); background:var(--db-elevated); color:var(--db-text); }
.dashboard-precise-layout small { color:var(--db-muted); font-size:11px; line-height:1.5; }
.studio-inspector-heading { align-items:flex-start !important; gap:10px; padding-bottom:12px; margin-bottom:4px; border-bottom:1px solid var(--db-border,#e3e9eb); }.studio-inspector-heading h2 { margin:0 !important; color:var(--db-text,#25343b); }.studio-inspector-heading p { margin:3px 0 0; color:var(--db-muted,#667780); font-size:11px; line-height:1.4; }.studio-inspector-heading__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:4px; }.studio-library-group + .studio-library-group { margin-top:16px; padding-top:12px; border-top:1px solid var(--db-border,#e3e9eb); }.studio-library-group h3 { margin:0 0 8px !important; }.studio-library-item.is-current::after { content:'✓'; margin-left:auto; color:var(--db-accent,#1261a6); font-weight:700; }.studio-library-item:focus-visible,.studio-template-item:focus-visible { outline:2px solid var(--db-accent,#1261a6); outline-offset:2px; }
.style-section { display:grid; gap:8px; }.style-section h3,.style-section p { margin:0; }.style-section p { color:#667780; font-size:11px; line-height:1.5; }.style-section--separated { margin-top:4px; padding:12px; border:1px solid var(--db-border,#e3e9eb); border-radius:7px; background:#f8fafb; }.gradient-color-controls { display:grid; gap:7px; padding:9px; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; background:#f8fbfc; }.background-mode { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }.background-mode button { border:1px solid #d0d5dd; border-radius:5px; padding:6px 3px; background:#fff; color:#475467; font-size:11px; cursor:pointer; }.background-mode button.is-active { border-color:#1261a6; background:#edf6ff; color:#1261a6; font-weight:600; }
.dashboard-page.is-presentation-mode { position: fixed; inset: 0; z-index: 3000; min-height: 100vh; overflow: auto; padding: 24px; color: var(--idmp-text-primary, #101828); }
.dashboard-page.is-presentation-mode :deep(.page-heading) { display: none; }
.dashboard-page.is-presentation-mode .dashboard-schema-viewer { margin: 0; }
.dashboard-page.is-presentation-mode .dashboard-schema-canvas { min-height: calc(100vh - 48px); }
.dashboard-demo-source { padding:8px; border:1px solid #b8d7f0; border-radius:6px; background:#eef6ff; color:#175ea8 !important; font-size:11px !important; line-height:1.5; }
.dashboard-acceptance-source { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin:8px 0; padding:8px; border:1px solid #9dcbef; border-radius:6px; background:#eef8ff; color:#175ea8; font-size:12px; line-height:1.5; }.dashboard-acceptance-source strong { color:#0b5f9e; }.dashboard-acceptance-source .el-button { margin-left:auto; }.dashboard-acceptance-note { margin:0 0 10px; padding:8px 10px; border-radius:6px; background:#fff7e8; color:#8a5a00; font-size:13px; }.dashboard-acceptance-summary { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin:0 0 14px; font-size:12px; color:#475467; }.dashboard-acceptance-summary strong { color:#1d2939; }
.dashboard-create-form { display:grid; gap:12px; }.dashboard-create-form label { display:grid; gap:5px; color:#475467; font-size:13px; }.dashboard-create-form input,.dashboard-create-form textarea,.dashboard-create-form select { width:100%; box-sizing:border-box; border:1px solid #d0d5dd; border-radius:5px; padding:7px; background:#fff; }.dashboard-create-form textarea { min-height:72px; resize:vertical; }.dashboard-open-list { display:grid; gap:7px; margin-top:14px; }.dashboard-open-list h3 { margin:10px 0 2px; font-size:13px; color:#667085; }.dashboard-open-list button { display:flex; justify-content:space-between; gap:12px; width:100%; padding:9px 10px; border:1px solid #e4e7ec; border-radius:6px; background:#fff; text-align:left; cursor:pointer; }.dashboard-open-list button:hover { border-color:#409eff; background:#f5faff; }.dashboard-open-list small { color:#667085; white-space:nowrap; }
.dashboard-version-list { display:grid; gap:10px; }.dashboard-version-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px 12px; padding:13px; border:1px solid #e4e7ec; border-radius:7px; background:#fff; }.dashboard-version-item header { display:flex; align-items:center; gap:8px; }.dashboard-version-item p,.dashboard-version-item span { margin:0; color:#667085; font-size:12px; }.dashboard-version-item .el-button { grid-column:2; grid-row:2 / span 2; align-self:center; }
.dashboard-interaction-summary { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0; padding:7px 10px; border:1px solid var(--idmp-interactive-subtle,#e7f1f8); border-radius:6px; background:var(--idmp-interactive-subtle,#e7f1f8); color:var(--idmp-interactive,#1261a6); font-size:12px; }
.dashboard-interaction-summary span { padding-right:8px; border-right:1px solid color-mix(in srgb, var(--idmp-interactive,#1261a6) 18%, transparent); }
.dashboard-preview-frame { width:1440px; max-width:100%; margin:auto; overflow:hidden; border:1px solid #b9d9ef; border-radius:8px; }
.studio-scene-switcher { width:170px; }
.dashboard-page:fullscreen { width: 100vw; height: 100vh; }

/* The mint theme is intentionally scoped to the dashboard viewer. It leaves the
   application shell and all saved data/query contracts untouched. */
.dashboard-v2.theme-mint-medical { --db-surface:#fff; --db-elevated:#fbfefd; --db-canvas:#eaf8f6; --db-text:#263b40; --db-secondary:#5e7378; --db-muted:#7a8e92; --db-border:#cfe5e3; --db-border-strong:#a9cfcb; --db-accent:#10aaa6; --db-accent-soft:#def4f2; --db-success:#168b70; --db-warning:#e47819; --db-danger:#ef5960; --db-radius-sm:8px; --db-radius-md:12px; --db-radius-lg:16px; --db-shadow:0 6px 20px rgba(28,125,119,.13); }
.dashboard-v2.theme-mint-medical .dashboard-canvas-frame { padding:12px; border:0; border-radius:14px; background:rgb(255 255 255 / 82%); box-shadow:0 8px 24px rgba(28,125,119,.13); backdrop-filter:blur(8px); }
.dashboard-v2.theme-mint-medical .dashboard-toolbar { min-height:44px; padding:0 4px 10px; margin-bottom:10px; border-bottom-color:#d7ebe9; }
.dashboard-v2.theme-mint-medical .dashboard-schema-canvas { border-radius:10px; overflow:hidden; }
.dashboard-v2.theme-mint-medical :deep(.dashboard-widget__chrome) { box-shadow:0 5px 17px rgba(28,125,119,.12); }
.dashboard-v2.theme-mint-medical :deep(.dashboard-renderer-card) { --db-text:#263b40; --db-muted:#72868a; --db-border:#d7e9e7; }
.dashboard-v2.theme-mint-medical :deep(.db-section-title h2) { font-size:15px; font-weight:650; }
.dashboard-v2.theme-mint-medical :deep(.db-chart-card) { padding:18px 20px 14px; }
.dashboard-v2.theme-mint-medical :deep(.db-warning-list li) { min-height:62px; padding:0 8px; margin-bottom:9px; border:0; border-left:3px solid #ef5960; border-radius:8px; background:#fff4f4; }
.dashboard-v2.theme-mint-medical :deep(.db-warning-list li:nth-child(2n)) { border-left-color:#ff8a20; background:#fff7ee; }
.dashboard-v2.theme-mint-medical :deep(.db-rank-bar i) { background:linear-gradient(180deg,#44c9c3,#10aaa6); }
.dashboard-v2.theme-mint-medical :deep(.dashboard-filter-bar button),.dashboard-v2.theme-mint-medical :deep(.el-select__wrapper) { border-radius:8px; }

@media (max-width: 1199px) { .dashboard-schema-canvas { min-height:540px; } }
@media (max-width: 767px) { .dashboard-page { min-width:0; overflow-x:hidden; } .dashboard-schema-viewer { margin-top:12px; } .dashboard-toolbar { align-items:flex-start; } .dashboard-toolbar__filters { width:100%; } .dashboard-toolbar :deep(.dashboard-filter-bar.is-compact .filter-control) { flex:1 1 140px; } .dashboard-toolbar :deep(.dashboard-filter-bar.is-compact .filter-control input),.dashboard-toolbar :deep(.dashboard-filter-bar.is-compact .filter-control select) { max-width:100%; } .dashboard-filter.dashboard-filter--compact { width:130px; } .dashboard-period-selects { flex-wrap:wrap; } .dashboard-filter.dashboard-filter--period { width:min(126px,calc(50vw - 50px)); } .dashboard-canvas-frame { padding:4px; } .dashboard-schema-canvas { min-height:0; } .dashboard-schema-viewer :deep(.dashboard-widget__chrome) { min-width:0; } }

.studio-template-library { margin-top:18px; padding-top:14px; border-top:1px solid #eaecf0; }.studio-template-library__heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }.studio-template-library__heading span { display:flex; gap:7px; }.studio-template-library h3 { margin:0; font-size:13px; }.studio-template-library p { margin:5px 0 10px; color:#667085; font-size:12px; line-height:1.45; }.studio-template-library button { border:0; background:transparent; color:#1570ef; cursor:pointer; font-size:12px; padding:2px; }.studio-template-item { display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; padding:8px 0; border-top:1px solid #f2f4f7; cursor:pointer; }.studio-template-item.is-selected { margin:0 -5px; padding:8px 5px; background:#f0f8ff; }.studio-template-item strong,.studio-template-item small { display:block; }.studio-template-item strong { font-size:12px; color:#344054; }.studio-template-item small { margin-top:3px; color:#667085; font-size:11px; line-height:1.35; }.studio-template-tags { display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; }.studio-template-tags em { padding:1px 4px; border-radius:3px; background:#eaf2f4; color:#52636c; font-size:9px; font-style:normal; }.studio-template-preview { display:grid; grid-template-columns:repeat(24,1fr); grid-template-rows:repeat(30,2px); gap:1px; min-height:48px; padding:2px; border:1px solid #eaecf0; border-radius:4px; background:#f8fafc; overflow:hidden; }.studio-template-item.is-selected .studio-template-preview { border-color:#75a8c2; }.studio-template-preview i { min-width:0; min-height:0; border-radius:1px; background:#4f8196; opacity:.76; }.studio-template-preview i:nth-child(2n) { background:#86aebd; }.studio-template-preview i:nth-child(3n) { background:#b7c8cf; }.studio-template-item__actions { grid-column:2; display:flex; gap:10px; }.studio-template-item__actions .is-danger { color:#b42318; }.studio-template-detail { display:grid; gap:6px; margin-top:8px; padding:9px; border:1px solid #cfe1e8; border-radius:6px; background:#f8fcfd; }.studio-template-detail strong { color:#174d6c; font-size:12px; }.studio-template-detail dl { display:grid; grid-template-columns:32px 1fr; gap:4px 7px; margin:0; font-size:11px; line-height:1.35; }.studio-template-detail dt { color:#667085; }.studio-template-detail dd { margin:0; color:#344054; }
</style>
