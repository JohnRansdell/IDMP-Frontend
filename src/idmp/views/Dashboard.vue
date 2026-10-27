<template>
  <div ref="presentationRef" class="idmp-page dashboard-page dashboard-v2" :class="[`theme-${dashboardTheme}`, { 'is-presentation-mode': presentationMode === 'presentation' }]" :style="dashboardSurfaceStyle">
    <PageHeader v-if="!isEditing"
      :title="dashboardSchema?.name || '医疗质量指标总览'"
    >
      <template #title-suffix>
        <span class="data-source-badge" :class="{ 'is-live': dashboardStatus === 'ready' }">
          {{ dashboardSourceLabel }}
        </span>
        <el-tooltip v-if="canEditCurrentDashboard && hasUnpublishedDashboardDraft" content="当前展示已发布版本。此前保存的草稿仍在，进入编辑看板可继续修改或发布。" placement="bottom">
          <span class="dashboard-draft-badge" role="status" tabindex="0">有未发布草稿</span>
        </el-tooltip>
      </template>
      <template #actions>
        <el-button v-if="dashboardStatus === 'unpublished'" @click="loadDashboard()">重新加载</el-button>
      </template>
    </PageHeader>

    <StatePanel
      v-if="!isEditing && dashboardStatus === 'loading'"
      type="loading"
      title="正在加载质量看板"
      description="正在读取看板内容和当前筛选条件下的统计结果。"
    />
    <StatePanel
      v-else-if="!isEditing && dashboardStatus === 'select'"
      type="empty"
      title="请选择场景看板"
      description="请先从页面顶部的场景选择器中选择一个看板，选中后会自动加载对应内容。"
    />
    <StatePanel
      v-else-if="!isEditing && ['error', 'legacy-mock', 'no-dashboards'].includes(dashboardStatus)"
      :type="dashboardStatus === 'error' ? 'error' : 'empty'"
      :title="dashboardStatus === 'legacy-mock' ? (canEditCurrentDashboard ? '旧演示看板需要重新配置' : '当前看板暂不可用') : dashboardStatus === 'no-dashboards' ? '暂无服务端看板' : '质量看板加载失败'"
      :description="dashboardViewerMessage"
    >
      <template #actions>
        <el-button type="primary" @click="retryRemoteDashboardCatalog">重新加载</el-button>
        <el-button v-access="'dashboard.create'" v-if="!medicalMode" @click="router.push('/dashboard/manage')">前往看板管理</el-button>
      </template>
    </StatePanel>
    <StatePanel
      v-else-if="!isEditing && dashboardStatus === 'empty'"
      type="empty"
      title="当前条件暂无正式结果"
      description="已读取看板配置，当前统计周期和范围暂无正式结果。"
    >
      <template #actions><el-button @click="loadDashboard()">重新加载</el-button></template>
    </StatePanel>
    <StatePanel
      v-else-if="dashboardStatus === 'unpublished' && !isEditing"
      type="empty"
      :title="canEditCurrentDashboard ? '看板尚未发布' : '当前看板暂不可用'"
      :description="canEditCurrentDashboard ? '当前仅存在草稿配置，请进入编辑模式保存并发布后查看正式数据。' : '暂时无法展示此看板，请稍后重试或联系看板维护人员。'"
    />

    <template v-else-if="isEditing || dashboardStatus === 'ready'">
    <section v-if="!isEditing && useSchemaViewer" class="dashboard-schema-viewer">
      <button v-if="presentationMode === 'presentation'" type="button" class="dashboard-presentation-exit" title="退出大屏（Esc）" aria-label="退出大屏" @click="exitPresentation">
        <el-icon :size="18"><Close /></el-icon>
      </button>
      <section class="dashboard-canvas-frame">
        <div class="dashboard-toolbar" aria-label="看板查询条件">
          <div class="dashboard-query-controls">
            <DashboardPeriodPicker :selection="remotePeriodSelection" :loading="remoteQueryLoading" @apply="applyRemotePeriodSelection" />
            <span v-if="medicalMode" class="data-source-badge" data-testid="medical-data-scope">数据范围：{{ viewerRuntime.departmentName }}</span>
            <label v-if="departmentOptions.length > 1" class="dashboard-query-control"><span>范围</span>
              <el-select v-model="department" class="dashboard-filter dashboard-filter--compact" size="small" aria-label="统计范围">
              <el-option v-for="option in departmentOptions" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </label>
            <el-popover v-if="activeInteractionFilters.length" placement="bottom-start" trigger="click" :width="260">
              <template #reference>
                <button type="button" class="dashboard-interaction-trigger" :aria-label="`当前有 ${activeInteractionFilters.length} 项联动，点击查看`">
                  <el-icon><Connection /></el-icon><span>联动 {{ activeInteractionFilters.length }}</span>
                </button>
              </template>
              <div class="dashboard-interaction-details">
                <strong>当前联动条件</strong>
                <div v-for="item in activeInteractionFilters" :key="item.id" class="dashboard-interaction-details__item">{{ item.label }}：{{ item.value }}</div>
                <el-button text size="small" @click="clearAllInteractionFilters">清除联动</el-button>
              </div>
            </el-popover>
          </div>
          <DashboardFilterBar class="dashboard-toolbar__filters" compact :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" :errors-by-id="remoteFilterOptionErrors" :loading-by-id="remoteFilterOptionsLoading" @retry="loadRemoteFilterOptions" @change="filterRuntimeValues = $event" />
          <el-tooltip v-if="presentationMode !== 'presentation'" content="大屏展示" placement="bottom">
            <button type="button" class="dashboard-presentation-trigger" aria-label="大屏展示" @click="enterPresentation">
              <el-icon :size="17"><FullScreen /></el-icon>
            </button>
          </el-tooltip>
        </div>
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="[]" :drill-states="drillRuntimeState" :widgets="viewerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-drills="clearAllWidgetDrills" />
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
            :warning-state="getWarningWidgetState(widget)" @warning-retry="refreshWarningWidgets" @metric-item-retry="retryMetricGroupItem"
            :ranking="departmentRanking"
            :department="department"
            :updated-at="dashboardQueryLabel"
            :interactive="!['kpi', 'primary'].includes(widget.type) || canOpenWidgetAnalysis(widget)"
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
            @warning-event="goWarningEvent"
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
          <el-button v-access="'dashboard.create'" @click="router.push('/dashboard/manage')">返回看板管理</el-button>
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
      <div ref="studioShellRef" class="dashboard-designer-shell" :style="studioPaneStyle">
      <aside class="studio-library" aria-label="组件库">
        <h2>组件库</h2><p>选择指标后，点击组件卡片可在画布上放置；也可自动添加。</p>
        <input v-model="librarySearch" class="studio-search" placeholder="搜索组件…" aria-label="搜索组件" />
        <label class="studio-field-label">数据来源</label>
        <el-select v-model="selectedDataCode" aria-label="指标数据" :loading="dashboardLoading || indicatorCatalogLoading" @visible-change="visible => visible && loadPublishedIndicatorCatalog()" @change="handleSelectedDataSourceChange">
          <el-option-group v-if="catalogIndicatorSources.length" label="已发布指标">
            <el-option v-for="source in catalogIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
          </el-option-group>
          <el-option-group v-if="visibleDashboardIndicatorSources.length" label="正式看板汇总指标">
            <el-option v-for="source in visibleDashboardIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
          </el-option-group>
        </el-select>
        <p v-if="suggestDesignerWidgetPeriod(selectedDataCode)" class="dashboard-source-period-note" role="status">该指标在当前看板周期无数据。添加后仅新组件使用 {{ suggestDesignerWidgetPeriod(selectedDataCode).periodStart.slice(0, 7) }} 的独立周期。</p>
        <section v-for="group in groupedWidgetLibrary" :key="group.name" class="studio-library-group" :aria-label="group.name">
          <h3>{{ group.name }}</h3>
          <StudioHoverPreview v-for="item in group.items" :key="item.type" :widget-item="item" :disabled="drawPlacementMode || Boolean(pendingLibraryWidget)">
            <button :data-testid="`dashboard-library-${item.type}`" class="studio-library-item" :class="{ 'is-current': addWidgetType === item.type }" @click="selectLibraryWidget(item.type)">
              <span class="studio-library-icon" aria-hidden="true">{{ item.icon }}</span><span><strong>{{ item.name }}</strong><small>{{ item.hint }}</small><small class="studio-library-readiness" :class="`is-${libraryReadiness(item.type).status}`">{{ libraryReadiness(item.type).label }}</small></span>
            </button>
          </StudioHoverPreview>
        </section>
        <p v-if="!filteredLibrary.length">没有匹配的组件</p>
        <el-button data-testid="dashboard-add-widget" type="primary" plain :disabled="!selectedDataSource && !['text', 'metric-group', 'warnings', 'ranking'].includes(addWidgetType)" :icon="Plus" @click="addDashboardWidget">添加组件</el-button>
        <p v-if="drawPlacementMode && pendingLibraryWidget" class="studio-placement-hint" role="status">正在放置 {{ pendingLibraryWidget.title || libraryItems.find(item => item.type === addWidgetType)?.name }}：点击画布空白处放置，拖拽可指定大小；按 Esc 取消。</p>
        <section class="studio-template-library" aria-label="布局模板">
          <div class="studio-template-library__heading"><h3>设计模板</h3><span><button type="button" @click="saveCurrentLayoutAsTemplate">保存当前布局</button></span></div>
          <p>选择后查看用途与构图；系统模板与本地模板相互独立。</p>
          <StudioHoverPreview v-for="template in layoutTemplates" :key="template.id" :template="template">
            <article :data-template-id="template.id" class="studio-template-item" :class="{ 'is-selected': selectedTemplateId === template.id }" tabindex="0" @click="selectedTemplateId = template.id">
              <div class="studio-template-preview" :style="templatePreviewBoardStyle(template)" aria-hidden="true"><i v-for="(widget, index) in template.widgets" :key="index" :style="templatePreviewStyle(widget)" /></div>
              <div><strong>{{ template.name }}</strong><small>{{ template.description }}</small><span v-if="template.tags" class="studio-template-tags"><em v-for="tag in template.tags.slice(0, 3)" :key="tag">{{ tag }}</em><em v-if="template.density">{{ template.density }}</em></span></div>
              <div class="studio-template-item__actions"><button type="button" @click.stop="applyLayoutTemplate(template)">使用</button><button v-if="!template.id.startsWith('builtin-')" type="button" class="is-danger" @click.stop="removeLocalLayoutTemplate(template.id)">删除</button></div>
            </article>
          </StudioHoverPreview>
          <section v-if="selectedTemplateDetail" class="studio-template-detail" data-testid="dashboard-template-detail"><strong>{{ selectedTemplateDetail.name }}</strong><dl><dt>适用</dt><dd>{{ selectedTemplateDetail.detail?.useCase || selectedTemplateDetail.description }}</dd><dt>布局</dt><dd>{{ selectedTemplateDetail.detail?.layout || '可编辑布局模板' }}</dd><dt>视觉</dt><dd>{{ selectedTemplateDetail.detail?.visual || '沿用组件样式' }}</dd><dt>组件</dt><dd>{{ selectedTemplateDetail.detail?.components || `${selectedTemplateDetail.widgets.length} 个组件` }}</dd></dl></section>
        </section>
        <div class="studio-library-note">点击添加 · 拖动布局<br />空白处拖拽框选 · Ctrl/Shift 追加</div>
      </aside>
      <div class="studio-pane-resizer" role="separator" aria-label="调整组件库宽度" aria-orientation="vertical" tabindex="0" title="拖动调整组件库宽度，双击恢复默认" @pointerdown="startStudioPaneResize($event, 'library')" @pointermove="moveStudioPaneResize" @pointerup="stopStudioPaneResize" @pointercancel="stopStudioPaneResize" @dblclick="resetStudioPaneResize('library')" @keydown="onStudioPaneResizeKeydown($event, 'library')"></div>
      <main class="studio-workspace">
        <div class="studio-canvas-heading"><span>画布</span><span>{{ drawPlacementMode ? '点击空白处放置 · Esc 取消' : `${editingDashboardSchema?.layout?.columns || 24} 列 · Clinical Light` }}</span></div>
        <div class="studio-canvas-scroll">
        <div class="dashboard-designer-period" aria-label="画布统计周期">
          <DashboardPeriodPicker :selection="remotePeriodSelection" :loading="remoteQueryLoading" @apply="applyRemotePeriodSelection" />
          <span class="dashboard-designer-period__hint">组件默认继承此周期；独立周期可在组件“数据”中调整。</span>
        </div>
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" :errors-by-id="remoteFilterOptionErrors" :loading-by-id="remoteFilterOptionsLoading" @retry="loadRemoteFilterOptions" @change="filterRuntimeValues = $event" />
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="activeInteractionFilters" :drill-states="drillRuntimeState" :widgets="designerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-interactions="clearAllInteractionFilters" @clear-drills="clearAllWidgetDrills" />
        <div v-if="!designerWidgets.length && !pendingLibraryWidget" class="studio-empty">
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
        :float="editingDashboardSchema?.layout?.float === true"
        :selected-widget-id="activeWidgetId"
        :selected-widget-ids="selectedWidgetIds"
        :primary-selected-widget-id="primarySelectedWidgetId"
        :placement-mode="drawPlacementMode"
        :pending-widget="pendingLibraryWidget"
        aria-label="GridStack 指标看板设计器"
        @widget-select="selectDesignerWidgets($event)"
        @layout-change="syncDesignerLayout($event, true)"
        @widget-place="placeDesignerWidget"
        @placement-cancel="cancelDrawPlacement"
      >
        <template #default="{ widget }">
          <WidgetRenderer
            :widget="widget"
            :primary-kpi="visibleKpis[0]"
            :supporting-kpis="visibleKpis.slice(1)"
            :warnings="getWidgetWarnings(widget)"
            :warning-state="getWarningWidgetState(widget)" @warning-retry="refreshWarningWidgets" @metric-item-retry="retryMetricGroupItem"
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
            @binding-action="handleWidgetBindingAction(widget, $event)"
          />
        </template>
      </DashboardCanvas>
        </div>
      </main>
      <div class="studio-pane-resizer" role="separator" aria-label="调整属性面板宽度" aria-orientation="vertical" tabindex="0" title="拖动调整属性面板宽度，双击恢复默认" @pointerdown="startStudioPaneResize($event, 'inspector')" @pointermove="moveStudioPaneResize" @pointerup="stopStudioPaneResize" @pointercancel="stopStudioPaneResize" @dblclick="resetStudioPaneResize('inspector')" @keydown="onStudioPaneResizeKeydown($event, 'inspector')"></div>
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
              <section v-if="activeDesignerWidget.type === 'ranking'" class="dashboard-style-form">
                <label>排名方式<select :value="activeDesignerWidget.config?.ranking?.mode || 'categories'" @change="updateDesignerRankingMode($event.target.value)"><option value="categories">单指标按科室／分类排名</option><option value="indicators">多指标排名（逐项添加）</option></select></label>
                <label v-if="activeDesignerWidget.config?.ranking?.mode === 'indicators'">数值排序<select :value="activeDesignerWidget.config.ranking.direction || 'desc'" @change="updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, ranking: { ...widget.config.ranking, direction: $event.target.value } } }))"><option value="desc">从高到低</option><option value="asc">从低到高</option></select></label>
                <small v-if="activeDesignerWidget.config?.ranking?.mode === 'indicators'">相同单位和统计周期的指标一起排名；不同单位或周期分别展示。</small>
              </section>
              <MetricGroupInspector v-if="activeDesignerWidget.type === 'metric-group' || (activeDesignerWidget.type === 'ranking' && activeDesignerWidget.config?.ranking?.mode === 'indicators')" :widget="activeDesignerWidget" :sources="selectableIndicatorSources" :get-datasets="getBindingDatasets" :selected-item-id="selectedMetricItemId" :source-loading="indicatorCatalogLoading" :source-error="indicatorCatalogError" @refresh-sources="loadPublishedIndicatorCatalog" @change="updateMetricGroupConfig" @select-item="selectedMetricItemId = $event" />
              <WarningWidgetInspector v-else-if="activeDesignerWidget.type === 'warnings'" :model-value="activeDesignerWidget.config?.warning" @update:model-value="updateWarningWidgetConfig" />
              <div v-else-if="['kpi', 'primary', 'supporting', 'chart', 'ranking'].includes(activeDesignerWidget.type) && !(activeDesignerWidget.type === 'ranking' && activeDesignerWidget.config?.ranking?.mode === 'indicators')" class="dashboard-style-form">
                <label class="studio-field-label" for="dashboard-widget-source">指标数据</label>
                <el-select id="dashboard-widget-source" class="dashboard-widget-source-select" :title="getWidgetSource(activeDesignerWidget)?.name || ''" :model-value="activeDesignerWidget.sourceCode || ''" aria-label="组件指标数据" data-testid="dashboard-widget-source" filterable clearable :loading="indicatorCatalogLoading || designerSourceLoadingId === String(activeDesignerWidget.id)" placeholder="选择指标数据" @visible-change="visible => visible && loadPublishedIndicatorCatalog()" @change="changeDesignerWidgetSource">
                  <el-option v-for="source in selectableIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
                </el-select>
                <small v-if="!activeDesignerWidget.sourceCode">请选择指标，再配置下方字段。</small>
                <small v-else-if="Object.hasOwn(remoteSourcePeriodOptions, activeDesignerWidget.sourceCode) && !remoteSourcePeriodOptions[activeDesignerWidget.sourceCode].length">该指标暂未提供可用期间结果，请先计算并激活正式结果。</small>
                <small v-else-if="suggestDesignerWidgetPeriod(activeDesignerWidget.sourceCode)">该指标在当前看板周期无数据；组件将使用 {{ suggestDesignerWidgetPeriod(activeDesignerWidget.sourceCode).periodStart.slice(0, 7) }} 的独立周期。</small>
              </div>
              <dl v-else class="dashboard-property-list"><dt>指标</dt><dd>{{ activeDesignerWidget.sourceName || activeDesignerWidget.sourceCode || '未绑定' }}</dd><dt>展示类型</dt><dd>{{ activeDesignerWidget.chartKind || activeDesignerWidget.type }}</dd></dl>
              <MultiIndicatorInspector
                v-if="activeDesignerWidget.sourceCode && activeDesignerWidget.type === 'chart' && ['line', 'bar', 'table', 'radar'].includes(activeDesignerWidget.chartKind)"
                :widget="activeDesignerWidget"
                :sources="selectableIndicatorSources"
                @change="updateDesignerIndicatorBindings"
              />
              <BindingInspector v-if="activeDesignerWidget.sourceCode && !['text', 'metric-group', 'warnings'].includes(activeDesignerWidget.type) && !(activeDesignerWidget.type === 'ranking' && activeDesignerWidget.config?.ranking?.mode === 'indicators')" :key="`${activeDesignerWidget.id}-${activeDesignerWidget.sourceCode}-${activeDesignerWidget.config?.indicatorBindings?.length || 0}`" :widget="activeDesignerWidget" :datasets="getBindingDatasets(activeDesignerWidget)" @change="updateDesignerBinding" @query-change="updateDesignerQuery" />
              <MapConfigInspector v-if="activeDesignerWidget.type === 'chart' && activeDesignerWidget.chartKind === 'map'" :model-value="activeDesignerWidget.config?.chart" @change="updateDesignerChartConfig" />
              <ComponentScopeInspector
                v-if="!['text', 'metric-group'].includes(activeDesignerWidget.type) && (activeDesignerWidget.type === 'warnings' || activeDesignerWidget.sourceCode)"
                :model-value="activeDesignerWidget.config?.backendQuery"
                @change="updateDesignerBackendQuery"
              />
            </el-tab-pane>
            <el-tab-pane label="样式" name="style">
              <MetricGroupInspector v-if="activeDesignerWidget.type === 'metric-group'" section="style" :widget="activeDesignerWidget" :sources="selectableIndicatorSources" :get-datasets="getBindingDatasets" :selected-item-id="selectedMetricItemId" @change="updateMetricGroupConfig" />
              <section class="dashboard-precise-layout">
                <h3>位置与尺寸</h3>
                <label>X<input :value="activeDesignerWidget.layout.x" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ x: $event.target.value })" /></label>
                <label>Y<input :value="activeDesignerWidget.layout.y" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ y: $event.target.value })" /></label>
                <label>宽度<input :value="activeDesignerWidget.layout.w" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: $event.target.value })" /></label>
                <label>高度<input :value="activeDesignerWidget.layout.h" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ h: $event.target.value })" /></label>
                <label>宽度（%）<input :value="gridWidthToPercentage(activeDesignerWidget.layout.w, editingDashboardSchema.layout.columns)" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: percentageToGridWidth($event.target.value, editingDashboardSchema.layout.columns) })" /></label>
                <small>实际尺寸约 {{ precisePixelSize.width }} × {{ precisePixelSize.height }} px；仅作显示，不保存。</small>
              </section>
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
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" :errors-by-id="remoteFilterOptionErrors" :loading-by-id="remoteFilterOptionsLoading" @retry="loadRemoteFilterOptions" @change="filterRuntimeValues = $event" />
        <DashboardContextBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :interactions="activeInteractionFilters" :drill-states="drillRuntimeState" :widgets="designerWidgets" @clear-filters="filterRuntimeValues = initialFilterValues(globalFilterDefinitions)" @clear-interactions="clearAllInteractionFilters" @clear-drills="clearAllWidgetDrills" />
        <div class="dashboard-preview-frame">
        <DashboardCanvas v-if="studioPreview" :style="dashboardCanvasStyle" :widgets="previewWidgets" :columns="24" :float="editingDashboardSchema?.layout?.float === true" :editable="false">
          <template #default="{ widget }"><WidgetRenderer :widget="widget" :primary-kpi="visibleKpis[0]" :supporting-kpis="visibleKpis.slice(1)" :warnings="getWidgetWarnings(widget)" :warning-state="getWarningWidgetState(widget)" @warning-retry="refreshWarningWidgets" @metric-item-retry="retryMetricGroupItem" :ranking="departmentRanking" :department="department" :updated-at="dashboardQueryLabel" :interactive="widget.type !== 'warnings'" :get-widget-kpi="getWidgetKpi" :get-title="getWidgetTitle" :get-description="getWidgetDescription" :get-icon="getWidgetIcon" :get-chart-option="getWidgetChartOption" :is-chart-empty="isChartEmpty" :get-chart-aria-label="getWidgetChartAriaLabel" :get-table-columns="getWidgetTableColumns" :get-table-rows="getWidgetTableRows" :get-pie-drill-targets="getWidgetPieDrillTargets" :get-pie-drill-source="getWidgetPieDrillSource" @chart-click="handleWidgetChartClick" /></template>
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
    </div>
    </template>
    <el-dialog v-if="['error', 'legacy-mock', 'no-dashboards'].includes(dashboardStatus) && !isEditing" v-model="dashboardMenuDialog" title="新建服务端看板" width="520px" destroy-on-close>
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
import { useDashboardHistory } from '@/idmp/features/dashboard/useDashboardHistory.js'
import { createDashboardViewerRuntime, createPlatformDashboardRuntime, createMedicalViewerRuntime } from '@/idmp/features/dashboard/viewerRuntime.js'
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { ElMessage } from '@/idmp/utils/message'
import {
  Bell,
  Check,
  Close,
  Connection,
  Delete,
  Edit,
  FullScreen,
  Histogram,
  InfoFilled,
  PieChart,
  Plus,
  TrendCharts,
  TrophyBase,
  WarningFilled
} from '@element-plus/icons-vue'
import IdmpChart from '@/idmp/components/IdmpChart.vue'
import PageHeader from '@/idmp/components/PageHeader.vue'
import StatePanel from '@/idmp/components/StatePanel.vue'
import { formatApiError } from '@/idmp/utils/apiError.js'
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
import { createWidgetBindingDatasets, numericValue } from '@/idmp/features/dashboard/fieldCatalog.js'
import { bindingKind, emptyBinding } from '@/idmp/features/dashboard/bindingEngine.js'
import { resolveDrillHierarchy } from '@/idmp/features/dashboard/drillDown.js'
import { annotateDepartmentFilterFields, departmentSelectionCodes, isDepartmentFilterField, loadDepartmentCodeOptions, resolveGlobalFilterField } from '@/idmp/features/dashboard/departmentFilters.js'
import { fetchDepartmentDictionary, fetchDepartmentNames } from '@/idmp/api/modules/departments'
import { isMedicalDashboardSession } from '@/idmp/api/request'
import { fetchMedicalCatalog } from '@/idmp/api/modules/medical'
import { createMedicalDashboardRuntime } from '@/idmp/features/dashboard/medicalRuntime.js'
import { singleIndicatorTemplatePlan } from '@/idmp/features/dashboard/templateBinding.js'
import { createDefaultBinding } from '@/idmp/features/dashboard/smartDefaultBinding.js'
import { createMultiIndicatorDataset, multiIndicatorMeasureField, normalizeIndicatorBindings, singleIndicatorProjectionBinding } from '@/idmp/features/dashboard/multiIndicator.js'
import { buildRemoteFilterOptionQuery, buildRemoteWidgetQuery, isDashboardIndicatorQueryWidget, resolveDashboardQueryState } from '@/idmp/features/dashboard/remoteQuery.js'
import { buildIndicatorAnalysisPeriodContext, buildIndicatorAnalysisRouteQuery } from '@/idmp/features/dashboard/analysisNavigation.js'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import {
  copyDashboard, createDashboard, deleteDashboard, fetchDashboardCatalog,
  fetchDashboardDataSourceFields, fetchDashboardDataSources, fetchDashboardDefinition,
  fetchDashboardVersions, fetchDashboardDataSourcePeriods, fetchDashboardFilterOptions, previewDashboardWidget, publishDashboard, queryDashboard, restoreDashboardVersion, saveDashboard
} from '@/idmp/api/modules/analysisDashboard'
import {
  applyDefaultDashboardBindings, dashboardDataSourceToFrontend, dashboardDetailMeta,
  dashboardDetailToSchema, dashboardDetailToEditableSchema, dashboardFieldsToFrontend, dashboardSummaryToCatalogEntry,
  isMockDashboardDetail, schemaToDashboardPayload,
  currentPublishedDashboardDataSources, selectDashboardVersion, sortDashboardDataSourcesByIndicatorCreatedAt, widgetResultToDataset
} from '@/idmp/api/adapters/dashboard'
import { fetchWarnings } from '@/idmp/api/modules/warnings'
import { canRequest } from '@/idmp/auth/session'
import { fetchIndicatorAnalysis, fetchIndicatorVersion, fetchAllIndicators } from '@/idmp/api/modules/indicators'
import { deriveDrillPathResultIds } from '@/idmp/api/adapters/drill'
import { searchResultDrill } from '@/idmp/api/modules/drill'
import { initialBackendChartNavigation, loadBackendChartLevel, loadBackendChartRoot, resolveChartDrillPath } from '@/idmp/features/dashboard/backendChartDrill.js'
import { normalizeDepartmentDataset } from '@/idmp/features/dashboard/dimensionNames.js'
import { explainComparisonAvailability } from '@/idmp/features/dashboard/comparisonAvailability.js'
import DashboardPeriodPicker from '@/idmp/features/dashboard/components/DashboardPeriodPicker.vue'
import { dashboardPeriodLabel, defaultDashboardPeriod, enforceDashboardResultPeriod, resolveDashboardPeriod } from '@/idmp/features/dashboard/statisticalPeriod.js'
import { normalizePage } from '@/idmp/api/adapters/warning'
import {
  DASHBOARD_DESIGN_WIDTH,
  widgetTypeOptions
} from '@/idmp/features/dashboard/constants'
import { shouldConfirmDashboardSceneSwitch } from '@/idmp/features/dashboard/sceneSwitch.js'
import { canApplyDashboardLoad, canRefreshRemoteDashboard } from '@/idmp/features/dashboard/dashboardIdentity.js'
import { createDashboardEditingSnapshot } from '@/idmp/features/dashboard/editSession.js'
import { buildPublishedIndicatorAnalysisQuery, buildPublishedIndicatorTrendPreviewQuery, createPublishedDashboardPeriodOptions, dateRangeForMonths, schemaPublishedIndicatorSourceCodes, suggestIndependentWidgetPeriod } from '@/idmp/features/dashboard/publishedIndicatorRuntime.js'
import { dashboardWidgetResultShape, isPeriodField } from '@/idmp/features/dashboard/periodFields.js'
 import { dashboardActiveId, dashboardRequestedId, dashboardSceneCode, designerImmersive, notifyDashboardCatalogChanged } from '@/idmp/layout/shellState.js'
import { createMetricGroupConfig, duplicateMetricGroupItem, METRIC_GROUP_ADD_SELECTION, metricGroupItemWidget, metricGroupSourceCodes, removeMetricGroupItem, reorderMetricGroupItem } from '@/idmp/features/dashboard/metricGroup.js'
import { createWarningWidgetConfig, normalizeWarningWidgetConfig, warningEventToDashboardItem, warningWidgetQuery } from '@/idmp/features/dashboard/warningWidget.js'
import { widgetLibraryReadiness } from '@/idmp/features/dashboard/widgetGuidance.js'
import { applyGlobalFilterScope, removeGlobalFilter } from '@/idmp/features/dashboard/globalFilterDesignerModel.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '@/idmp/features/dashboard/globalFilterCompatibility.js'
import {
  getDashboardSchemaStorageKey,
  normalizeDashboardSchema,
  validateDashboardSchema,
  getDefaultGridLayout,
  normalizeWidgetMetadata,
  synchronizeDashboardGridLayout,
  changeDashboardGridColumns,
  updateDashboardWidget,
  clonePersistableValue
} from '@/idmp/features/dashboard/schema'
 import { readDashboardCatalog, saveDashboardToCatalog } from '@/idmp/features/dashboard/catalog.js'
 import { persistDashboardSchema, recoverDashboardSchema, DASHBOARD_RECOVERY_STATUS } from '@/idmp/features/dashboard/persistence.js'
import { DASHBOARD_UNSAVED_MESSAGE, handleDashboardBeforeUnload, shouldProtectDashboardNavigation } from '@/idmp/features/dashboard/navigationProtection'
import { getWidgetGridConstraints } from '@/idmp/features/dashboard/gridLayout'
import { clearWidgetSelection, nextWidgetSelection, nextMarqueeSelection, alignSelectedLayout, distributeSelectedLayout } from '@/idmp/features/dashboard/layoutOperations.js'
import { dashboardBreakpointForWidth, deriveResponsiveLayout, responsiveColumns } from '@/idmp/features/dashboard/responsiveLayout.js'
import { applyWidgetLayoutToCanvas, gridWidthToPercentage, percentageToGridWidth, validatePreciseLayout } from '@/idmp/features/dashboard/preciseLayout.js'
import { BUILT_IN_LAYOUT_TEMPLATES, applyLayoutTemplateToDashboard, createLayoutTemplateFromDashboard, deleteLocalLayoutTemplate, readLocalLayoutTemplates, saveLocalLayoutTemplate, validateLayoutTemplate } from '@/idmp/features/dashboard/layoutTemplates.js'
import {
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
const studioShellRef = ref(null)
const studioPanePercent = ref({ library: null, inspector: null })
const studioPaneStyle = computed(() => ({
  '--studio-library-width': studioPanePercent.value.library == null ? undefined : `${studioPanePercent.value.library}%`,
  '--studio-inspector-width': studioPanePercent.value.inspector == null ? undefined : `${studioPanePercent.value.inspector}%`
}))
let studioPaneDrag = null

function studioPaneWidth(side) {
  return studioShellRef.value?.querySelector(side === 'library' ? '.studio-library' : '.studio-inspector')?.getBoundingClientRect().width || 0
}

function setStudioPaneWidth(side, requestedWidth) {
  const shellWidth = studioShellRef.value?.clientWidth || 0
  if (!shellWidth) return
  const other = side === 'library' ? 'inspector' : 'library'
  const minWidth = side === 'library' ? 200 : 260
  const otherMinWidth = other === 'library' ? 200 : 260
  const availableCenter = Math.min(420, Math.max(240, shellWidth - minWidth - otherMinWidth - 12))
  const maxWidth = Math.min(side === 'library' ? 420 : 520, shellWidth * 0.34, shellWidth - studioPaneWidth(other) - availableCenter - 12)
  const width = Math.max(minWidth, Math.min(requestedWidth, Math.max(minWidth, maxWidth)))
  studioPanePercent.value = { ...studioPanePercent.value, [side]: Math.round(width / shellWidth * 10000) / 100 }
}

function startStudioPaneResize(event, side) {
  if (event.button !== 0) return
  event.preventDefault()
  studioPaneDrag = { side, pointerId: event.pointerId, startX: event.clientX, startWidth: studioPaneWidth(side) }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function moveStudioPaneResize(event) {
  if (!studioPaneDrag || event.pointerId !== studioPaneDrag.pointerId) return
  const direction = studioPaneDrag.side === 'library' ? 1 : -1
  setStudioPaneWidth(studioPaneDrag.side, studioPaneDrag.startWidth + direction * (event.clientX - studioPaneDrag.startX))
}

function stopStudioPaneResize(event) {
  if (studioPaneDrag?.pointerId === event.pointerId) studioPaneDrag = null
}

function resetStudioPaneResize(side) {
  studioPanePercent.value = { ...studioPanePercent.value, [side]: null }
}

function onStudioPaneResizeKeydown(event, side) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  event.preventDefault()
  const direction = side === 'library' ? 1 : -1
  setStudioPaneWidth(side, studioPaneWidth(side) + direction * (event.key === 'ArrowRight' ? 16 : -16))
}
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
  { group: '展示', type: 'ranking', name: '排名列表', hint: '逐项添加指标排名 · 科室/分类排名', icon: '≡' },
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
const medicalMode = computed(() => route.query.medical === '1' || isMedicalDashboardSession())
const viewerRuntime = createDashboardViewerRuntime({
  isMedical: () => medicalMode.value,
  medical: createMedicalViewerRuntime(createMedicalDashboardRuntime(), fetchMedicalCatalog),
  platform: createPlatformDashboardRuntime({ fetchCatalog: fetchDashboardCatalog,
    fetchDefinition: fetchDashboardDefinition, fetchVersions: fetchDashboardVersions, selectVersion: selectDashboardVersion,
    query: queryDashboard, fetchFields: fetchDashboardDataSourceFields, fetchPeriods: fetchDashboardDataSourcePeriods,
    fetchFilterOptions: fetchDashboardFilterOptions, searchDrill: searchResultDrill })
})
const activeSceneCode = dashboardSceneCode
const managedDashboardId = computed(() => typeof route.query.id === 'string' && route.query.id.trim() ? route.query.id.trim() : '')
const activeDashboardId = dashboardActiveId
const requestedDashboardId = dashboardRequestedId
if (managedDashboardId.value) { activeDashboardId.value = managedDashboardId.value; requestedDashboardId.value = managedDashboardId.value }
else if (medicalMode.value) { activeDashboardId.value = ''; requestedDashboardId.value = '' }
const loadedDashboardId = ref('')
const activeDashboardStorageKey = computed(() => getDashboardSchemaStorageKey(activeDashboardId.value))
const currentDashboardId = computed(() => activeDashboardId.value)
const canEditCurrentDashboard = computed(() => {
  const id = activeDashboardId.value
  if (!id || !viewerRuntime.capabilities.edit) return false
  return isLocalDashboard(id)
    ? canRequest('POST', '/analysis/dashboards')
    : canRequest('PUT', `/analysis/dashboards/${encodeURIComponent(String(id))}`)
})
const currentDashboardName = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.name || '未命名看板')
const currentDashboardProtected = computed(() => false)
 const dashboardSelectorOptions = computed(() => localDashboardCatalog.value)
const periodOptions = ref([])
const departmentOptions = [{ label: '全院', value: '' }]
const period = ref('')
const remotePeriodRange = ref([])
const remotePeriodSelection = ref(defaultDashboardPeriod())
const remoteQueryLoading = ref(false)
function applyRemotePeriodSelection(selection) {
  const resolved = resolveDashboardPeriod(selection)
  if (!resolved) return
  remotePeriodSelection.value = selection
  const lastDay = new Date(new Date(`${resolved.periodEnd}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 7)
  remotePeriodRange.value = [resolved.periodStart.slice(0, 7), lastDay]
  if (!isFormalRemoteDashboard.value) period.value = lastDay
}
function remoteSelectedPeriod(widget) {
  const selected = resolveDashboardPeriod(remotePeriodSelection.value)
  // A trend is a monthly series inside the selection, not an interval total.
  return dashboardWidgetResultShape(widget || {}) === 'TREND' ? { ...selected, granularity: 'MONTHLY' } : selected
}
function periodSafeWidgetResult(widget, result, query) {
  return enforceDashboardResultPeriod(result, query, {
    timeSeries: dashboardWidgetResultShape(widget || {}) === 'TREND',
    selectionType: ['FIXED', 'INDEPENDENT'].includes(widget?.config?.backendQuery?.periodMode) ? query.granularity : remotePeriodSelection.value.type
  })
}
const department = ref('')
const designerCanvasRef = ref()
const viewerCanvasRef = ref()
const isEditing = ref(false)
const dashboardEditLoading = ref(false)
const dashboardDeleting = ref(false)
const selectedWidgetIds = ref([])
const primarySelectedWidgetId = ref('')
const drawPlacementMode = ref(false)
const pendingLibraryWidget = ref(null)
let libraryPlacementGeneration = 0
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
let selectedDataSourceManuallySelected = false
const addWidgetType = ref('kpi')
const indicatorDataSources = shallowRef([])
const catalogIndicatorSources = shallowRef([])
const remoteWidgetDatasets = shallowRef({})
const remoteMultiIndicatorDatasets = shallowRef({})
const remoteWidgetPreviewGenerations = new Map()
const designerSourceLoadingId = ref('')
const designerSourceSelectionGenerations = new Map()
const remoteFieldCatalog = ref({})
const remoteVersionFieldCatalog = ref({})
const remoteSourcePeriodOptions = ref({})
const designerPeriodOptions = computed(() => {
  const options = [...periodOptions.value, ...Object.values(remoteSourcePeriodOptions.value).flat()].filter(option => /^\d{4}-\d{2}$/.test(String(option?.value || '')))
  return [...new Map(options.map(option => [option.value, option])).values()].sort((a, b) => b.value.localeCompare(a.value))
})
const remoteFilterOptions = ref({})
const remoteFilterOptionErrors = ref({})
const remoteFilterOptionsLoading = ref({})
const remoteDashboardMeta = ref(null)
const remoteDashboardIsMock = ref(false)
const isFormalRemoteDashboard = computed(() => Boolean(remoteDashboardMeta.value?.dashboardId)
  && String(remoteDashboardMeta.value.dashboardId) === String(activeDashboardId.value)
  && !remoteDashboardIsMock.value)
const remoteCatalogIsEmpty = computed(() => localDashboardCatalog.value.length === 0)
// The eager filter watcher evaluates bindingDatasets during setup, so this source catalog must exist first.
const visibleDashboardIndicatorSources = computed(() => indicatorDataSources.value.filter(source => source.origin === 'backend'))
const availableIndicatorSources = computed(() => {
  const sources = [...visibleDashboardIndicatorSources.value, ...catalogIndicatorSources.value]
  return [...new Map(sources.map(source => [source.code, source])).values()]
})
 const selectableIndicatorSources = computed(() => catalogIndicatorSources.value)
const indicatorCatalogLoading = ref(false)
const indicatorCatalogError = ref('')
let indicatorCatalogRequest = null
const indicatorHydrationRequests = new Map()
const dashboardIndicatorVersionRequests = new Map()
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
const designerInspectorTab = ref('data')
const designerDrawerOpen = ref(false)
const dashboardDirty = ref(false)
const saveState = ref('saved')
const lastSavedAt = ref('')
const presentationMode = ref('standard')
const presentationRef = ref()
const dashboardSchema = ref(null)
const { reset: resetDashboardHistory, canUndo, canRedo,
  transaction: runDashboardHistoryTransaction, undo: undoDashboardEdit, redo: redoDashboardEdit
} = useDashboardHistory({ editing: isEditing, schema: editingDashboardSchema, dirty: dashboardDirty,
  saveState, reconcile: () => reconcileDesignerCanvasLayout() })
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
const viewerWidgets = computed(() => deriveResponsiveLayout((dashboardSchema.value?.widgets || []).filter(widget =>
  (widget.type !== 'warnings' || (viewerRuntime.capabilities.warnings && canRequest('GET', '/analysis/warnings')))
  && (!isFormalRemoteDashboard.value || (!['primary', 'supporting'].includes(widget.type) && !(widget.kpiIndex !== undefined && !widget.sourceCode)))
), viewerBreakpoint.value, dashboardSchema.value?.responsivePolicy))
// The studio preview intentionally renders the same desktop geometry as GridStack.
// Responsive derivation remains a Viewer concern and no longer creates a second
// preview layout that can diverge from the active Designer schema.
const previewWidgets = computed(() => designerWidgets.value)
const useSchemaViewer = computed(() => Boolean(dashboardSchema.value))
const dashboardDefinition = ref(null)
const dashboardQueryResult = shallowRef(null)
// Only data dependencies invalidate this catalog; selection/hover does not aggregate rows.
// Formal sources use component queries, never the full indicator-analysis row universe.
const bindingDatasets = computed(() => new Map(availableIndicatorSources.value
  .filter(source => source.origin !== 'dashboard-data-source')
  .map(source => [source.code, createWidgetBindingDatasets(source, { result: dashboardQueryResult.value })])))
function getBindingDatasets(widget) {
  const remote = remoteWidgetDatasets.value[String(widget?.id)]
  if (medicalMode.value) return remote ? [{ ...remote, id: widget?.config?.dataBinding?.dataset || remote.id }] : []
  const indicatorBindings = normalizeIndicatorBindings(widget?.config?.indicatorBindings, widget)
  if (indicatorBindings.length > 1) {
    if (remote?.status === 'ERROR' && !remoteMultiIndicatorDatasets.value[String(widget?.id)]) return [{ ...remote, id: 'multi-indicator' }]
    const combined = createMultiIndicatorDataset(widget, remoteMultiIndicatorDatasets.value[String(widget?.id)] || bindingDatasets.value)
    if (combined) return [combined]
  }
  const source = getWidgetSource(widget)
  const analysisDatasets = bindingDatasets.value.get(source?.code) || []
  if (['indicator-catalog', 'dashboard-data-source'].includes(source?.origin)) {
    const kind = bindingKind(widget)
    const fallbackId = ['kpi', 'gauge'].includes(kind) ? 'current' : kind === 'line' ? 'trend' : 'departments'
    const fallback = analysisDatasets.find(dataset => dataset.id === fallbackId)
    const remoteReady = remote && remote.status !== 'LOADING' && remote.status !== 'ERROR' && Array.isArray(remote.rows) && remote.rows.length > 0
    const shouldUseFallback = fallback && !(source.origin === 'dashboard-data-source' && remote) && (!remoteReady || (kind === 'line' && !isFormalRemoteDashboard.value && widget.config?.backendQuery?.periodMode !== 'INDEPENDENT'))
    const bindingDatasetId = widget?.config?.dataBinding?.dataset
    if (shouldUseFallback && bindingDatasetId && bindingDatasetId !== fallback.id) {
      const catalogFields = remoteFieldCatalog.value[source.code] || []
      const remapped = bindingDatasetId === 'backend' && catalogFields.length
        ? widgetResultToDataset({ status: 'READY', rows: fallback.rows }, catalogFields, bindingDatasetId)
        : { ...fallback, id: bindingDatasetId }
      const normalized = { ...remapped, dimensionDisplayFields: fallback.dimensionDisplayFields, departmentFields: fallback.departmentFields, nameDiagnostics: fallback.nameDiagnostics, fields: remapped.fields.map(field => field.id === 'value' ? { ...field, unit: source.unit || field.unit } : field) }
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
provide('dashboardSupportsBackendDrill', (widget) => {
  if (medicalMode.value) return Boolean(remoteWidgetDatasets.value[String(widget.id)]?.rows?.some(row => row.drillContext))
  const source = getWidgetSource(widget)
  return Boolean(source?.analysisIndicatorId && ['indicator-catalog', 'dashboard-data-source'].includes(source.origin))
})
provide('dashboardResolveWidgetDrill', async (widget, params) => {
  if (medicalMode.value) return viewerRuntime.drillTarget(widget, params, remoteWidgetDatasets.value[String(widget.id)])
  const source = getWidgetSource(widget)
  if (!source?.analysisIndicatorId || !['indicator-catalog', 'dashboard-data-source'].includes(source.origin)) return null
  const projected = getBindingDatasets(widget).find(dataset => dataset.rowMode === 'PROJECTED')
  if (projected) {
    const tuple = params?.data?.dimensionValues
    const row = projected.rows.find(row => tuple && Object.entries(tuple).every(([field, value]) => row[field] === value))
    if (!row?.drillContext) throw new Error('当前组件结果没有可用的精确下钻上下文')
    const version = await dashboardIndicatorVersion(source, widget)
    const configuredPaths = version?.drillConfig?.drillPaths || version?.drillPaths || []
    const path = resolveChartDrillPath(configuredPaths, widget.config?.dataBinding?.dimensions?.[0]?.field)
    return { resultId: row.drillContext.resultId, drillContext: row.drillContext, selectedRow: row, path, configuredPaths,
      indicatorVersionId: String(widget.config?.analysisIndicatorVersionId || source.analysisIndicatorVersionId || source.indicatorVersionId || ''),
      departmentNames: Object.fromEntries(await fetchDepartmentNames()) }
  }
  const scope = widget?.config?.backendQuery || {}
  const query = { ...buildPublishedIndicatorAnalysisQuery(source), ...remoteSelectedPeriod(widget) }
  if (!query.granularity) throw new Error('所选统计区间暂无完整结果')
  query.indicatorVersionId = widget.config?.analysisIndicatorVersionId || query.indicatorVersionId
  if (scope.periodMode === 'INDEPENDENT' && scope.periodStart && scope.periodEnd) {
    query.periodStart = scope.periodStart
    query.periodEnd = scope.periodEnd
    query.granularity = scope.granularity || 'MONTHLY'
  } else if (scope.periodMode === 'FIXED' && scope.periodStart && scope.periodEnd) {
    query.periodStart = query.periodStart > scope.periodStart ? query.periodStart : scope.periodStart
    query.periodEnd = query.periodEnd < scope.periodEnd ? query.periodEnd : scope.periodEnd
  }
  if (query.periodStart && query.periodEnd && query.periodStart > query.periodEnd) throw new Error('组件统计周期与看板周期没有交集')
  const [analysis, version] = await Promise.all([
    fetchIndicatorAnalysis(source.analysisIndicatorId, query),
    dashboardIndicatorVersion(source, widget)
  ])
  const configuredPaths = version?.drillConfig?.drillPaths || version?.drillPaths || []
  const path = resolveChartDrillPath(configuredPaths, widget.config?.dataBinding?.dimensions?.[0]?.field)
  if (configuredPaths.length && !path) throw new Error('该指标版本未配置科室下钻路径')
  const pathCode = path?.pathCode || 'ORGANIZATION'
  const departmentResultId = Array.isArray(analysis.departmentComparison)
    ? analysis.departmentComparison.find(row => row?.resultId)?.resultId
    : ''
  const resultId = deriveDrillPathResultIds(analysis, configuredPaths)[pathCode] || (pathCode === 'ORGANIZATION' ? departmentResultId : '')
  if (!resultId) throw new Error('当前指标或统计周期没有可用的组织下钻结果')
  return {
    resultId,
    indicatorVersionId: String(widget.config?.analysisIndicatorVersionId || source.analysisIndicatorVersionId || source.indicatorVersionId || ''),
    path, pathCode,
    pathResultIds: { [pathCode]: resultId },
    indicatorName: source.name,
    departmentNames: Object.fromEntries(await fetchDepartmentNames()),
    period: query.periodStart && query.periodEnd ? `${query.periodStart} ～ ${query.periodEnd}` : '',
    maxLevels: Object.fromEntries(configuredPaths.filter(path => path?.pathCode && path?.maxLevel).map(path => [path.pathCode, path.maxLevel])),
    configuredPaths
  }
})
provide('dashboardSearchDrill', (id, payload, options) => viewerRuntime.searchDrill(id, payload, options))
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
const filterOptionsById = computed(() => {
  const options = { ...Object.fromEntries(dependentFilterOptions.value), ...remoteFilterOptions.value }
  for (const definition of globalFilterDefinitions.value) {
    // Raw row-derived codes are not display labels; wait for the paired name/code candidates.
    if (isDepartmentFilterField(definition.field, filterCatalog.value) && !Object.hasOwn(remoteFilterOptions.value, definition.id)) options[definition.id] = []
  }
  return options
})
const currentDependentFilterOptions = computed(() => new Map([
  ...dependentFilterOptions.value,
  ...Object.entries(remoteFilterOptions.value).map(([id, options]) => [id, options.map(option => option && typeof option === 'object' ? option.value : option)])
]))
provide('dashboardFilterOptions', filterOptionsById)
// Only definition/lifecycle changes reinitialize defaults. Runtime selections never
// write into canonical schema or trigger dirty/persistence.
watch(() => JSON.stringify(globalFilterDefinitions.value), () => { filterRuntimeValues.value = initialFilterValues(globalFilterDefinitions.value) }, { immediate: true })
watch([globalFilterDefinitions, filterRuntimeValues, currentDependentFilterOptions], () => {
  const readyDefinitions = globalFilterDefinitions.value.filter(definition =>
    !definition.dependsOn?.length || !definition.optionSourceCode || Object.hasOwn(remoteFilterOptions.value, definition.id))
  const normalized = normalizeDependentFilterValues(readyDefinitions, filterRuntimeValues.value, currentDependentFilterOptions.value)
  if (JSON.stringify(normalized) !== JSON.stringify(filterRuntimeValues.value)) filterRuntimeValues.value = normalized
}, { deep: true })
const filterSourceCatalogKey = computed(() => JSON.stringify(availableIndicatorSources.value.map(source => [source.code, source.indicatorVersionId, source.analysisIndicatorVersionId])))
watch([globalFilterDefinitions, period, remotePeriodRange, remotePeriodSelection, filterRuntimeValues, remoteFieldCatalog, filterSourceCatalogKey], () => { void loadRemoteFilterOptions() }, { deep: true })
watch(requestedDashboardId, nextDashboardId => { if (nextDashboardId !== activeDashboardId.value) void requestDashboardSwitch(nextDashboardId) })
watch(() => route.query.id, async nextDashboardId => {
  const id = typeof nextDashboardId === 'string' ? nextDashboardId.trim() : ''
  if (!id || id === activeDashboardId.value) return
  if (!localDashboardCatalog.value.some(item => String(item.id) === id)) await refreshDashboardCatalog()
  await requestDashboardSwitch(id)
})
watch(() => route.query.edit, value => {
  if (value === '1' && route.name === 'Dashboard' && !isEditing.value) void startDashboardEdit()
})
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
    if (medicalMode.value) {
      localDashboardCatalog.value = (await viewerRuntime.catalog()).map(dashboardSummaryToCatalogEntry)
      return localDashboardCatalog.value
    }
    const local = readDashboardCatalog(localStorage).map(item => ({ ...item, origin: 'local' }))
    try {
      const remote = await viewerRuntime.catalog()
      const remoteEntries = (Array.isArray(remote) ? remote : []).map(dashboardSummaryToCatalogEntry)
      localDashboardCatalog.value = [...local, ...remoteEntries.filter(item => !local.some(localItem => String(localItem.id) === String(item.id)))]
      notifyDashboardCatalogChanged()
      return localDashboardCatalog.value
    } catch (error) {
      localDashboardCatalog.value = local
      notifyDashboardCatalogChanged()
      if (!local.length) throw error
      return local
    }
  }
  function isRemoteDashboard(id = activeDashboardId.value) {
    return localDashboardCatalog.value.some(item => item.origin === 'remote' && String(item.id) === String(id))
  }
  function isLocalDashboard(id = activeDashboardId.value) {
    return localDashboardCatalog.value.some(item => item.origin === 'local' && String(item.id) === String(id))
  }
function dashboardTypeLabel(type) { return ({ 'hospital-overview': '全院概览', topic: '专题', scene: '场景', department: '科室', custom: '自定义' })[type] || '自定义' }
function scopeLabel(scope) { return ({ hospital: '全院', department: '科室', personal: '个人' })[scope] || '全院' }
async function retryRemoteDashboardCatalog() {
  dashboardStatus.value = 'loading'
  try {
    if (isRemoteDashboard()) { await loadDashboard(activeDashboardId.value); return }
    const remoteCatalog = await refreshDashboardCatalog()
    const dashboardId = remoteCatalog.find(item => String(item.id) === String(activeDashboardId.value))?.id || remoteCatalog[0]?.id
    if (!dashboardId) { dashboardLoadMessage.value = '暂无可用的服务端看板，请创建看板后继续。'; dashboardStatus.value = 'no-dashboards'; return }
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
        const payload = schemaToDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion, dataSources: availableIndicatorSources.value })
        const saved = await saveDashboard(currentDashboardId.value, payload)
        remoteDashboardMeta.value = dashboardDetailMeta(saved)
        dashboardSchema.value = saved?.version?.layout ? dashboardDetailToSchema(saved) : schema
        if (editingDashboardSchema.value) editingDashboardSchema.value = clonePersistableValue(dashboardSchema.value)
      } else throw new Error('请先选择服务端看板')
      await refreshDashboardCatalog()
    ElMessage.success('看板已重命名')
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(`重命名失败：${error.message || '请先选择服务端看板'}`) }
}
  async function copyCurrentDashboard() {
    try {
      if (isRemoteDashboard()) {
        const copied = await copyDashboard(currentDashboardId.value, {})
        await refreshDashboardCatalog()
        await selectDashboard(dashboardDetailMeta(copied).dashboardId)
      } else throw new Error('请先选择服务端看板')
    ElMessage.success('已创建看板副本')
  } catch (error) { ElMessage.error(`复制失败：${error.message || '请先保存当前看板'}`) }
}
async function deleteCurrentDashboard() {
  if (currentDashboardProtected.value || dashboardDeleting.value || !isRemoteDashboard()) return
  const targetDashboardId = currentDashboardId.value
  const targetDashboardName = currentDashboardName.value
  dashboardDeleting.value = true
  try {
    await ElMessageBox.confirm(`删除后，“${targetDashboardName}”将不再出现在看板列表中，相关版本和组件会一并归档。`, '删除看板', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
    await deleteDashboard(targetDashboardId)
    localDashboardCatalog.value = localDashboardCatalog.value.filter(item => String(item.id) !== String(targetDashboardId))
    notifyDashboardCatalogChanged()
    if (activeDashboardId.value === targetDashboardId) {
      // Invalidate in-flight queries before exiting the editor; never refresh a deleted board.
      dashboardAbortController?.abort()
      dashboardLoadGeneration += 1
      globalThis.clearTimeout(remoteFilterReloadTimer)
      remoteDashboardMeta.value = null
      dashboardDefinition.value = null
      dashboardQueryResult.value = null
      remoteWidgetDatasets.value = {}
      remoteMultiIndicatorDatasets.value = {}
      finishDashboardEdit()
      activeDashboardId.value = ''
      requestedDashboardId.value = ''
      dashboardSchema.value = null
      dashboardStatus.value = 'no-dashboards'
      dashboardLoadMessage.value = ''
    }
    ElMessage.success('看板已删除')
    try { await refreshDashboardCatalog() }
    catch { ElMessage.warning('看板已删除，目录刷新失败，可重新加载目录。') }
    if (!activeDashboardId.value) {
      const nextDashboardId = localDashboardCatalog.value[0]?.id || ''
      await router.replace({ query: { ...route.query, id: nextDashboardId || undefined } })
      if (nextDashboardId) await selectDashboard(nextDashboardId)
    }
  } catch (error) { if (error !== 'cancel' && error !== 'close') ElMessage.error(`删除失败：${error.message || '未知错误'}`) }
  finally { dashboardDeleting.value = false }
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
async function changeDesignerWidgetSource(code) {
  const selected = activeDesignerWidget.value
  if (!selected || !['kpi', 'primary', 'supporting', 'chart', 'ranking'].includes(selected.type)) return
  if ((code || '') === (selected.sourceCode || '')) return
  const widgetId = String(selected.id)
  const generation = (designerSourceSelectionGenerations.get(widgetId) || 0) + 1
  designerSourceSelectionGenerations.set(widgetId, generation)
  // A previous preview must not write data from the old indicator after the switch.
  remoteWidgetPreviewGenerations.set(widgetId, (remoteWidgetPreviewGenerations.get(widgetId) || 0) + 1)
  const source = code ? getDashboardIndicatorSource(code) : null
  if (code && !source) { ElMessage.warning('所选指标数据已不可用'); return }
  designerSourceLoadingId.value = code ? widgetId : ''
  try {
    if (source?.origin === 'dashboard-data-source') await ensureRemoteDataSourceFields(source.code, { required: true })
    const resolvedSource = source?.origin === 'dashboard-data-source' ? source : source ? await hydrateIndicatorSource(source) : null
    if (designerSourceSelectionGenerations.get(widgetId) !== generation || !editingDashboardSchema.value) return
    const current = designerWidgets.value.find(widget => String(widget.id) === widgetId)
    if (!current) return
    const datasets = !resolvedSource ? [] : resolvedSource.origin === 'dashboard-data-source'
      ? [{ id: 'backend', label: `${resolvedSource.name} · 正式结果`, fields: dashboardFieldsToFrontend(remoteFieldCatalog.value[resolvedSource.code] || []), rows: [] }]
      : createWidgetBindingDatasets(resolvedSource, { result: dashboardQueryResult.value })
    const templatePlan = resolvedSource ? singleIndicatorTemplatePlan(current, datasets) : null
    if (templatePlan && !templatePlan.binding) throw new Error('该指标没有可用的数值字段，请先生成正式计算结果。')
    const dataBinding = resolvedSource
      ? templatePlan?.binding || createDefaultBinding(bindingKind(current), datasets) || emptyBinding(datasets[0]?.id || 'backend')
      : null
    const independentPeriod = resolvedSource?.origin === 'dashboard-data-source' ? suggestDesignerWidgetPeriod(resolvedSource.code) : null
    editingDashboardSchema.value = updateDashboardWidget(editingDashboardSchema.value, widgetId, widget => {
      const config = { ...widget.config }
      delete config.dataBinding
      delete config.indicatorBindings
      delete config.backendQuery
      delete config.analysisIndicatorVersionId
      delete config.dataSource
      if (templatePlan) delete config.tableColumns
      const nextWidget = { ...widget }
      if (templatePlan) {
        nextWidget.type = templatePlan.type
        nextWidget.visualType = templatePlan.visualType
        if (templatePlan.chartKind) nextWidget.chartKind = templatePlan.chartKind
        else delete nextWidget.chartKind
        const slotTitle = widget.config?.templateSlot?.title
        if (resolvedSource && (!widget.title || widget.title === slotTitle || widget.title === getVisualizationTitle(widget.sourceName, bindingKind(widget)))) nextWidget.title = getVisualizationTitle(resolvedSource.name, bindingKind(nextWidget))
      }
      delete nextWidget.kpiIndex
      delete nextWidget.sourceCode
      delete nextWidget.sourceName
      return {
        ...nextWidget,
        ...(resolvedSource ? { sourceCode: resolvedSource.code, sourceName: resolvedSource.name } : {}),
        config: {
          ...config,
          ...(resolvedSource?.indicatorVersionId ? { analysisIndicatorVersionId: resolvedSource.indicatorVersionId } : {}),
          ...(dataBinding ? { dataBinding } : {}),
          ...(templatePlan?.chartKind === 'table' && dataBinding ? { tableColumns: [dataBinding.dimensions[0]?.field, datasets.some(dataset => dataset.fields.some(field => field.id === 'displayValue')) ? 'displayValue' : dataBinding.measures[0]?.field].filter(Boolean) } : {}),
          ...(independentPeriod ? { backendQuery: independentPeriod } : {})
        }
      }
    })
    markDashboardDirty()
    const nextRemote = { ...remoteWidgetDatasets.value }
    delete nextRemote[widgetId]
    remoteWidgetDatasets.value = nextRemote
    const nextMulti = { ...remoteMultiIndicatorDatasets.value }
    delete nextMulti[widgetId]
    remoteMultiIndicatorDatasets.value = nextMulti
    if (resolvedSource?.origin === 'dashboard-data-source') {
      const updated = designerWidgets.value.find(widget => String(widget.id) === widgetId)
      if (updated) await previewRemoteWidget(updated, { templateAutoConfigure: Boolean(templatePlan) })
      if (templatePlan?.fallback) ElMessage.info('该指标没有时间字段，已改为指标卡展示。')
    }
  } catch (error) {
    if (designerSourceSelectionGenerations.get(widgetId) === generation) ElMessage.warning(error?.message || '指标数据字段暂不可用，请稍后重试')
  } finally {
    if (designerSourceSelectionGenerations.get(widgetId) === generation && designerSourceLoadingId.value === widgetId) designerSourceLoadingId.value = ''
  }
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
  return `查询条件：${dashboardPeriodLabel(remoteSelectedPeriod())} · ${medicalMode.value ? viewerRuntime.departmentName : department.value || '全院'}`
})

const warningWidgetRuntime = ref({})
let warningWidgetLoadGeneration = 0
let warningWidgetAbortController = null
const warningQueryWidgets = computed(() => (isEditing.value ? designerWidgets.value : viewerWidgets.value).filter(widget => widget.type === 'warnings'))
const dashboardWarnings = computed(() => [])
function getWidgetWarnings(widget) {
  if (widget?.type !== 'warnings') return dashboardWarnings.value
  const config = normalizeWarningWidgetConfig(widget.config?.warning)
  return warningWidgetRuntime.value[String(widget.id)]?.records || []
}
function getWarningWidgetState(widget) {
  if (widget?.type !== 'warnings') return { status: 'ready', total: 0, error: '' }
  if (dashboardStatus.value !== 'ready') return { status: 'idle', total: 0, error: '' }
  return warningWidgetRuntime.value[String(widget.id)] || { status: 'idle', total: 0, error: '' }
}
async function refreshWarningWidgets() {
  const widgets = warningQueryWidgets.value
  const generation = ++warningWidgetLoadGeneration
  warningWidgetAbortController?.abort()
  if (!viewerRuntime.capabilities.warnings || !canRequest('GET', '/analysis/warnings')) {
    warningWidgetRuntime.value = Object.fromEntries(widgets.map(widget => [String(widget.id), { status: 'error', records: [], total: 0, error: '预警组件尚不支持科室隔离，未加载全院预警' }]))
    return
  }
  if (dashboardStatus.value !== 'ready' || !widgets.length) {
    warningWidgetRuntime.value = {}
    return
  }
  const controller = new AbortController()
  warningWidgetAbortController = controller
  const loading = Object.fromEntries(widgets.map(widget => [String(widget.id), { status: 'loading', records: [], total: 0, error: '' }]))
  warningWidgetRuntime.value = loading
  await Promise.all(widgets.map(async (widget) => {
    try {
      const config = normalizeWarningWidgetConfig(widget.config?.warning)
      const page = normalizePage(await fetchWarnings(warningWidgetQuery(config), { signal: controller.signal, timeoutMs: 20000 }))
      if (generation !== warningWidgetLoadGeneration) return
      warningWidgetRuntime.value = { ...warningWidgetRuntime.value, [String(widget.id)]: { status: 'ready', records: page.records.map(item => warningEventToDashboardItem(item, config)), total: page.total, error: '' } }
    } catch (error) {
      if (generation !== warningWidgetLoadGeneration) return
      warningWidgetRuntime.value = { ...warningWidgetRuntime.value, [String(widget.id)]: { status: 'error', records: [], total: 0, error: error?.message || '无法读取预警事件' } }
    }
  }))
}
watch(() => JSON.stringify([dashboardStatus.value, isEditing.value, warningQueryWidgets.value.map(widget => ({ id: widget.id, warning: normalizeWarningWidgetConfig(widget.config?.warning) }))]), () => { void refreshWarningWidgets() }, { immediate: true })
const departmentRanking = computed(() => {
  const rows = normalizeRanking(dashboardQueryResult.value?.departmentRanking, 'live')
  if (rows.length) return rows
  return []
})

const selectedDataSource = computed(() =>
  availableIndicatorSources.value.find((source) => source.code === selectedDataCode.value)
)
function libraryReadiness(type) {
  const source = selectedDataSource.value
  const widget = { id: 'library-preview', type: type === 'kpi' ? 'kpi' : 'chart', chartKind: type, sourceCode: source?.code, config: {} }
  return widgetLibraryReadiness(type, source, source ? getBindingDatasets(widget) : [])
}

const dashboardSourceLabel = computed(() => ({
  select: '尚未选择看板',
  loading: '正在加载正式数据',
  ready: '正式接口数据',
  empty: '正式接口数据（暂无结果）',
  'legacy-mock': '需要重新配置',
  'no-dashboards': '暂无看板',
  error: '看板数据加载失败'
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
const dashboardViewerMessage = computed(() => {
  if (!canEditCurrentDashboard.value && dashboardStatus.value === 'legacy-mock') return '暂时无法展示此看板，请稍后重试或联系看板维护人员。'
  if (dashboardStatus.value === 'no-dashboards' && !canRequest('POST', '/analysis/dashboards')) return '暂无可用看板，请稍后重试或联系看板维护人员。'
  return dashboardLoadMessage.value || '请检查看板配置和接口状态后重试。'
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
    const config = { ...widget.config }
    delete config.templateSlot
    updateDesignerWidget({
      config,
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

const visibleKpis = computed(() => visibleDashboardIndicatorSources.value.map(createKpiData))

const trendTableRows = computed(() => {
  const rows = normalizeMonthlyTrend(dashboardQueryResult.value?.monthlyTrend)
  return rows
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
  if (typeof widget.kpiIndex === 'number') return visibleDashboardIndicatorSources.value[widget.kpiIndex]
  return getDashboardIndicatorSource(widget.sourceCode)
}

function canOpenWidgetAnalysis(widget) {
  if (!viewerRuntime.capabilities.analysisNavigation) return false
  const source = getWidgetSource(widget)
  return Boolean(source?.analysisIndicatorId && ['indicator-catalog', 'dashboard-data-source', 'backend'].includes(source.origin)
    && (source.origin !== 'backend' || dashboardStatus.value === 'ready'))
}

function goWidgetAnalysis(widget) {
  if (isEditing.value || remoteQueryLoading.value) return
  const source = { ...(getWidgetSource(widget) || {
    code: widget.sourceCode || '',
    indicatorCode: widget.sourceCode || '',
    indicatorName: widget.title || widget.sourceName || '',
    analysisIndicatorVersionId: widget.config?.analysisIndicatorVersionId || ''
  }), ...(widget.config?.analysisIndicatorVersionId ? { analysisIndicatorVersionId: widget.config.analysisIndicatorVersionId } : {}) }
  const result = dashboardQueryResult.value?.widgets?.[widget.id]
  const drillContext = result?.drillContext || result?.rows?.find(row => row?.drillContext)?.drillContext || null
  const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(remoteSelectedPeriod(widget), widget))
  if (!planned.query) return ElMessage.warning(planned.error || '当前组件筛选范围没有交集')
  if (widget.config?.dataBinding?.filters?.length) return ElMessage.warning('该组件包含独立比较筛选，暂不支持保持此口径跳转分析页')
  goIndicatorAnalysis(source, widget.config?.backendQuery, drillContext, planned.query)
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
  updateDesignerWidget(widget => ({ ...widget, ...(widget.type === 'ranking' && config.metricGroup?.title ? { title: config.metricGroup.title } : {}), config: { ...widget.config, ...config } }))
}
function updateDesignerRankingMode(mode) {
  selectedMetricItemId.value = ''
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, ranking: { ...widget.config?.ranking, mode }, ...(mode === 'indicators' ? { metricGroup: widget.config?.metricGroup || { ...createMetricGroupConfig(), title: widget.title || '指标排名' } } : {}) } }))
}
function retryMetricGroupItem(group, itemId) {
  const item = group.config?.metricGroup?.items?.find(item => item.id === itemId)
  if (item) void previewMetricGroupItem(group, item)
}
function selectMetricGroupItem(itemId) { selectedMetricItemId.value = itemId }
function updateWarningWidgetConfig(config) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, warning: createWarningWidgetConfig(config) } }))
}
function mutateMetricGroup(mutator) {
  if (!['metric-group', 'ranking'].includes(activeDesignerWidget.value?.type)) return null
  let result
  updateDesignerWidget(widget => {
    result = mutator(widget.config?.metricGroup || {})
    const config = result?.config || result || widget.config?.metricGroup
    return { ...widget, config: { ...widget.config, metricGroup: config } }
  })
  return result
}
function addMetricGroupItemFromCanvas() { selectedMetricItemId.value = METRIC_GROUP_ADD_SELECTION }
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
  return 'live'
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
async function prepareDesignerWidget(type = addWidgetType.value) {
  let source = selectedDataSource.value
  if (!source && !['text', 'metric-group', 'warnings', 'ranking'].includes(type)) {
    ElMessage.warning('请先选择指标数据')
    return null
  }
  try {
    if (source && !['text', 'metric-group', 'warnings', 'ranking'].includes(type)) {
      await ensureRemoteDataSourceFields(source.code, { required: source.origin === 'dashboard-data-source' })
      // Published widgets use the formal field catalog and preview endpoint.
      // Analysis snapshots can be empty or expose different field capabilities.
      if (source.origin !== 'dashboard-data-source') source = await hydrateIndicatorSource(source)
    }
  } catch (error) {
    ElMessage.warning(error?.message || '指标数据字段暂不可用，请稍后重试')
    return
  }
  let id
  do { id = `dashboard-widget-${Date.now()}-${++designerWidgetSequence}` } while (designerWidgets.value.some(widget => String(widget.id) === id))
  const metadata = type === 'metric-group'
    ? { id, type: 'metric-group', title: '指标组', visualType: 'metric-group', config: { metricGroup: createMetricGroupConfig() }, layout: getDefaultGridLayout('metric-group') }
    : type === 'text'
    ? { id, type: 'text', title: '说明', visualType: 'text', config: { text: { title: '看板说明', body: '请输入数据口径、业务提示或分区说明。', align: 'left', fontSize: 14, fontWeight: 400 } }, layout: getDefaultGridLayout('text') }
    : type === 'warnings'
    ? { id, type: 'warnings', title: '预警事件', visualType: 'warnings', config: { warning: createWarningWidgetConfig() }, layout: getDefaultGridLayout('warnings') }
    : type === 'ranking'
    ? { id, type: 'ranking', title: '指标排名', visualType: 'ranking', config: { ranking: { mode: 'indicators', direction: 'desc' }, metricGroup: { ...createMetricGroupConfig(), title: '指标排名' } }, layout: getDefaultGridLayout('ranking') }
    : type === 'kpi'
    ? { id, type: 'kpi', sourceCode: source.code, sourceName: source.name, visualType: 'kpi', config: {}, layout: getDefaultGridLayout('kpi') }
    : { id, type: 'chart', chartKind: type, title: getVisualizationTitle(source.name, type), sourceCode: source.code, sourceName: source.name, visualType: type, config: {}, layout: getDefaultGridLayout({ type: 'chart', chartKind: type }) }
  const normalizedMetadata = normalizeWidgetMetadata(metadata)
  const defaultDatasets = source?.origin === 'dashboard-data-source'
    ? [{ id: 'backend', label: `${source.name} · 正式结果`, fields: dashboardFieldsToFrontend(remoteFieldCatalog.value[source.code] || []), rows: [] }]
    : getBindingDatasets(normalizedMetadata)
  const dataBinding = !['text', 'metric-group', 'warnings', 'ranking'].includes(type)
    ? createDefaultBinding(bindingKind(normalizedMetadata), defaultDatasets) || emptyBinding(defaultDatasets[0]?.id || 'backend')
    : null
  const independentPeriod = source?.origin === 'dashboard-data-source' && !['text', 'metric-group', 'warnings', 'ranking'].includes(type) ? suggestDesignerWidgetPeriod(source.code) : null
  const widget = { ...normalizedMetadata, config: { ...normalizedMetadata.config, ...(dataBinding ? { dataBinding } : {}), ...(independentPeriod ? { backendQuery: independentPeriod } : {}) }, layout: metadata.layout }
  return widget
}

function cancelDrawPlacement() {
  libraryPlacementGeneration++
  pendingLibraryWidget.value = null
  drawPlacementMode.value = false
}

async function selectLibraryWidget(type) {
  cancelDrawPlacement()
  addWidgetType.value = type
  const generation = libraryPlacementGeneration
  const widget = await prepareDesignerWidget(type)
  if (!widget || generation !== libraryPlacementGeneration || !isEditing.value) return
  activeWidgetId.value = ''
  pendingLibraryWidget.value = widget
  await nextTick()
  if (generation === libraryPlacementGeneration && isEditing.value) drawPlacementMode.value = true
}

async function addDesignerWidget() {
  cancelDrawPlacement()
  const widget = await prepareDesignerWidget()
  if (!widget || !isEditing.value) return
  const id = widget.id
  editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: [...designerWidgets.value, widget] }
  markDashboardDirty()
  await nextTick()
  await designerCanvasRef.value?.registerWidget(id, { ...widget.layout, autoPosition: true })
  syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], false)
  activeWidgetId.value = id
  designerInspectorTab.value = 'data'
  markDashboardDirty()
  if (availableIndicatorSources.value.find(source => source.code === widget.sourceCode)?.origin === 'dashboard-data-source') void previewRemoteWidget(widget)
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

function templatePreviewBoardStyle(template) {
  const rows = Math.max(1, ...template.widgets.map(widget => Number(widget.layout?.y || 0) + Number(widget.layout?.h || 1)))
  return { background: template.appearance?.background?.value || '#f8fafc', gridTemplateRows: `repeat(${rows},minmax(0,1fr))`, height: '64px' }
}
function templatePreviewStyle(widget) {
  const layout = widget?.layout || {}
  const style = widget.config?.style || {}
  const accent = style.kpi?.valueColor || ({ medicalBlue: '#1261a6', blueTeal: '#187f91', green: '#357b62', warm: '#c56b3f', colorful: '#65548c' }[style.palettePreset]) || '#4f8196'
  return { gridColumn: `${Number(layout.x) + 1} / span ${Number(layout.w)}`, gridRow: `${Number(layout.y) + 1} / span ${Number(layout.h)}`, background: accent, opacity: widget.type === 'text' ? 0.3 : widget.chartKind === 'table' ? 0.55 : 0.85 }
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

async function placeDesignerWidget({ id, layout }) {
  const pending = pendingLibraryWidget.value
  if (!isEditing.value || !pending || String(pending.id) !== String(id)) return
  const result = validatePreciseLayout([...designerWidgets.value, pending], pending.id, layout, editingDashboardSchema.value.layout.columns)
  if (!result.ok) { ElMessage.warning(result.reason); return }
  cancelDrawPlacement()
  await runDashboardHistoryTransaction(async () => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, layout: { ...editingDashboardSchema.value.layout, float: true }, widgets: result.widgets }
    await applyDesignerWidgetsLayout(result.widgets)
  })
  activeWidgetId.value = pending.id
  designerInspectorTab.value = 'data'
  if (availableIndicatorSources.value.find(source => source.code === pending.sourceCode)?.origin === 'dashboard-data-source') void previewRemoteWidget(result.widgets.find(item => item.id === pending.id))
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

async function handleWidgetBindingAction(widget, action) {
  if (!isEditing.value) return
  if (action === 'time-axis') {
    openWidgetConfig(widget.id)
    const binding = widget.config?.dataBinding
    const fields = getBindingDatasets(widget).find(dataset => dataset.id === binding?.dataset)?.fields || []
    const time = fields.find(field => field.id.toLowerCase() === 'periodstart') || fields.find(field => isPeriodField(field.id))
    if (!binding || !time) { ElMessage.warning('当前结果没有可用的统计时间字段'); return }
    const nextBinding = {
      ...binding,
      dimensions: [{ field: time.id, label: time.label, granularity: 'raw' }, ...binding.dimensions.slice(1)],
      sort: [{ field: time.id, direction: 'asc' }]
    }
    const sourceName = getWidgetSource(widget)?.name || widget.sourceName
    const title = sourceName && widget.title === `${sourceName}科室对比` ? `${sourceName}周期对比` : widget.title
    updateDesignerWidget({ title, config: { ...widget.config, dataBinding: nextBinding } })
    // Filters and deliberate component period constraints are retained.
    // Changing the axis switches the preview's result shape to TREND.
    void previewRemoteWidget(designerWidgets.value.find(item => String(item.id) === String(widget.id)))
    ElMessage.info('已切换统计时间轴；如只显示一个点，请将组件周期设为多个已计算月份')
    return
  }
  if (action === 'kpi') {
    openWidgetConfig(widget.id)
    const fields = getBindingDatasets(widget).find(dataset => dataset.id === widget.config?.dataBinding?.dataset)?.fields || []
    const nextBinding = createDefaultBinding('kpi', [{ id: widget.config?.dataBinding?.dataset || 'backend', fields }])
    if (!nextBinding) { ElMessage.warning('当前指标没有可用于指标卡的数值字段'); return }
    updateDesignerWidget({ type: 'kpi', visualType: 'kpi', title: getWidgetSource(widget)?.name || widget.sourceName || widget.title, config: { ...widget.config, dataBinding: { ...nextBinding, ...(widget.config?.dataBinding?.filters ? { filters: widget.config.dataBinding.filters } : {}) } } })
    void previewRemoteWidget(designerWidgets.value.find(item => String(item.id) === String(widget.id)))
    return
  }
  if (action === 'configure') {
    openWidgetConfig(widget.id)
    return
  }
  if (action === 'scope') {
    openWidgetConfig(widget.id)
    await nextTick()
    document.querySelector('.studio-inspector .component-scope')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    return
  }
  if (action === 'filters') {
    document.querySelector('.dashboard-designer-period')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    ElMessage.info('请在画布顶部切换统计周期或调整筛选条件')
    return
  }
  if (action !== 'retry') return
  const source = getWidgetSource(widget)
  try {
    if (source?.origin === 'dashboard-data-source') await previewRemoteWidget(widget)
    else if (source?.origin === 'indicator-catalog') await hydrateIndicatorSource(source)
    else ElMessage.info('请调整筛选条件后重新查看')
  } catch (error) { ElMessage.error(error?.message || '数据预览失败，请稍后重试') }
}

function beginDashboardEdit(schema = dashboardSchema.value) {
  void loadPublishedIndicatorCatalog()
  try {
    editingDashboardSchema.value = createDashboardEditingSnapshot(schema, loadDesignerSchema)
  } catch {
    editingDashboardSchema.value = createEditingDashboardSchema()
  }
  activeWidgetId.value = ''
  designerDrawerOpen.value = false
  dashboardDirty.value = false
  saveState.value = 'saved'
  lastSavedAt.value = ''
  isEditing.value = true
  designerImmersive.value = true
  resetDashboardHistory(editingDashboardSchema.value)
}

async function startDashboardEdit() {
  if (!canEditCurrentDashboard.value) return
  if (dashboardEditLoading.value || dashboardDeleting.value || isEditing.value || (!isRemoteDashboard() && !isLocalDashboard())) return
  const targetDashboardId = activeDashboardId.value
  if (isLocalDashboard(targetDashboardId)) {
    beginDashboardEdit(dashboardSchema.value)
    return
  }
  dashboardEditLoading.value = true
  try {
    const detail = await fetchDashboardDefinition(targetDashboardId)
    if (route.name !== 'Dashboard' || targetDashboardId !== activeDashboardId.value || isEditing.value || !canEditCurrentDashboard.value) return
    const meta = dashboardDetailMeta(detail)
    let versions = []
    if (meta.workingVersionId && String(detail?.version?.id || '') !== meta.workingVersionId) {
      versions = await fetchDashboardVersions(meta.dashboardId || targetDashboardId)
      if (route.name !== 'Dashboard' || targetDashboardId !== activeDashboardId.value || isEditing.value || !canEditCurrentDashboard.value) return
    }
    const workingDetail = { ...detail, version: selectDashboardVersion(detail, versions, { editing: true }) }
    remoteDashboardMeta.value = dashboardDetailMeta(workingDetail)
    remoteDashboardIsMock.value = isMockDashboardDetail(workingDetail)
    dashboardDefinition.value = workingDetail
    const schema = dashboardDetailToSchema(workingDetail)
    if (remoteDashboardIsMock.value) {
      // Keep server identity and appearance; never carry fixture bindings into real queries.
      beginDashboardEdit(dashboardDetailToEditableSchema(workingDetail))
      ElMessage.info('旧演示组件已从本次编辑中清空，请添加真实指标组件，保存并发布后生效。')
    } else beginDashboardEdit(applyDefaultDashboardBindings(schema, remoteFieldCatalog.value))
  } catch (error) {
    ElMessage.error(`读取看板草稿失败：${error.message || '未知错误'}`)
  } finally {
    dashboardEditLoading.value = false
  }
}

function finishDashboardEdit() {
  const refreshPublishedViewer = isFormalRemoteDashboard.value && canRefreshCurrentRemoteDashboard.value
  if (refreshPublishedViewer) {
    reconcilingRemotePeriod = true
  }
  editingDashboardSchema.value = null
  resetDashboardHistory()
  activeWidgetId.value = ''
  designerDrawerOpen.value = false
  isEditing.value = false
  dashboardDirty.value = false
  saveState.value = 'saved'
  designerImmersive.value = false
  if (refreshPublishedViewer) void nextTick().then(() => {
    reconcilingRemotePeriod = false
    return refreshRemoteDashboardData()
  })
}
async function exitDashboardEdit() {
  if (!isEditing.value) return
  if (!dashboardDirty.value) { finishDashboardEdit(); await router.push('/dashboard/manage'); return }
  try {
    await ElMessageBox.confirm('退出前可保存当前修改；选择“不保存并退出”将丢弃本次未保存内容。关闭弹窗则继续编辑。', '有未保存的看板修改', {
      confirmButtonText: '保存并退出', cancelButtonText: '不保存并退出', distinguishCancelAndClose: true, closeOnClickModal: false
    })
    if (await saveDashboardSchema()) { finishDashboardEdit(); await router.push('/dashboard/manage') }
  } catch (action) {
    if (action === 'cancel') { finishDashboardEdit(); await router.push('/dashboard/manage') }
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
  if ((dashboardDirty.value || remoteDashboardIsMock.value) && !(await saveDashboardSchema())) return
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
  remoteDashboardIsMock.value = isMockDashboardDetail(detail)
  const schema = detail?.version?.layout ? dashboardDetailToEditableSchema(detail) : fallbackSchema
  if (!schema) return
  editingDashboardSchema.value = schema
  if (!remoteDashboardMeta.value.currentPublishedVersionId) dashboardSchema.value = schema
  resetDashboardHistory(schema)
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
  const payload = schemaToDashboardPayload(localSchema, { resourceVersion: copiedMeta.resourceVersion, dataSources: availableIndicatorSources.value })
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
      const payload = schemaToDashboardPayload(schema, { resourceVersion: remoteDashboardMeta.value?.resourceVersion, dataSources: availableIndicatorSources.value })
      const saved = await saveDashboard(activeDashboardId.value, payload)
      remoteDashboardMeta.value = dashboardDetailMeta(saved)
      remoteDashboardIsMock.value = false
      dashboardStatus.value = remoteDashboardMeta.value.currentPublishedVersionId ? 'ready' : 'unpublished'
      const normalizedRemote = saved?.version?.layout ? dashboardDetailToSchema(saved) : schema
      editingDashboardSchema.value = normalizedRemote
      if (!remoteDashboardMeta.value.currentPublishedVersionId) dashboardSchema.value = normalizedRemote
      resetDashboardHistory(normalizedRemote)
      dashboardDirty.value = false
      saveState.value = 'saved'
      lastSavedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
      await refreshDashboardCatalog()
      ElMessage.success(remoteDashboardMeta.value.currentPublishedVersionId
        ? '看板草稿已保存，发布后对查看者生效'
        : '看板配置已保存')
      return true
    }
    if (isLocalDashboard()) {
      const persisted = persistDashboardSchema(localStorage, activeDashboardStorageKey.value, schema)
      saveDashboardToCatalog(persisted, localStorage)
      dashboardSchema.value = clonePersistableValue(persisted)
      editingDashboardSchema.value = clonePersistableValue(persisted)
      resetDashboardHistory(persisted)
      dashboardDirty.value = false
      saveState.value = 'saved'
      lastSavedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
      await refreshDashboardCatalog()
      ElMessage.success('看板布局已保存到浏览器')
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

async function resetDashboardLayout() {
  if (!isEditing.value) return
  editingDashboardSchema.value = createEditingDashboardSchema()
  await reconcileDesignerCanvasLayout()
  activeWidgetId.value = ''
  markDashboardDirty()
}

function createBlankLocalSchema(dashboardId = activeDashboardId.value) {
  const metadata = localDashboardCatalog.value.find(item => String(item.id) === String(dashboardId))
  return normalizeDashboardSchema({ version: 1, id: dashboardId, name: metadata?.name || '未命名看板', dashboardType: metadata?.dashboardType || 'custom', layout: { engine: 'gridstack', columns: 24, float: false }, widgets: [], globalFilters: [] })
}
function resetDesignerVisualStyle() {
  if (activeWidgetId.value) updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, style: resetWidgetVisualStyle(widget.config?.style) } }))
}
function loadDesignerSchema(dashboardId = activeDashboardId.value) {
  return createBlankLocalSchema(dashboardId)
}
function createEditingDashboardSchema(widgets = [], dashboardId = activeDashboardId.value) {
  return normalizeDashboardSchema({ ...createBlankLocalSchema(dashboardId), widgets })
}
function loadDashboardSchema(dashboardId = activeDashboardId.value) {
  if (medicalMode.value) { dashboardSchema.value = null; return }
  dashboardSchema.value = createBlankLocalSchema(dashboardId)
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
  const controller = new AbortController()
  dashboardAbortController = controller
  indicatorDataSources.value = []
  dashboardQueryResult.value = null
  remoteWidgetDatasets.value = {}
  remoteMultiIndicatorDatasets.value = {}
  return isLocalDashboard(targetDashboardId)
    ? loadLocalDashboard(targetDashboardId, isCurrentLoad)
    : loadRemoteDashboard(targetDashboardId, isCurrentLoad, controller.signal)
}

async function loadLocalDashboard(targetDashboardId, isCurrentLoad = () => true) {
  dashboardStatus.value = 'loading'
  dashboardLoadMessage.value = ''
  const recovered = recoverDashboardSchema(localStorage, getDashboardSchemaStorageKey(targetDashboardId))
  if (!isCurrentLoad()) return
  if (recovered.status !== DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = '本地看板配置无法读取，请在看板管理中删除后重新创建。'
    return
  }
  remoteDashboardMeta.value = null
  remoteDashboardIsMock.value = false
  dashboardDefinition.value = null
  dashboardSchema.value = recovered.schema
  loadedDashboardId.value = targetDashboardId
  dashboardQueryResult.value = null
  remoteWidgetDatasets.value = {}
  remoteMultiIndicatorDatasets.value = {}
  periodOptions.value = []
  try {
    const loaded = await loadPublishedIndicatorCatalog()
    if (!isCurrentLoad()) return
    if (!loaded) throw new Error(indicatorCatalogError.value || '指标目录加载失败')
    const sourceCodes = [...new Set(recovered.schema.widgets.flatMap(widget => [widget.sourceCode, ...metricGroupSourceCodes(widget)]).filter(Boolean))]
    await Promise.all(sourceCodes.map(code => ensureRemoteDataSourceFields(code, { required: true })))
    if (!isCurrentLoad()) return
    periodOptions.value = [...new Map(sourceCodes.flatMap(code => remoteSourcePeriodOptions.value[code] || []).map(option => [option.value, option])).values()].sort((a, b) => b.value.localeCompare(a.value))
    applyRemotePeriodSelection(defaultDashboardPeriod(periodOptions.value))
    dashboardSchema.value = applyDefaultDashboardBindings(recovered.schema, remoteFieldCatalog.value)
    await Promise.all(dashboardSchema.value.widgets.filter(widget => widget.sourceCode).map(widget => previewRemoteWidget(widget)))
    if (isCurrentLoad()) dashboardStatus.value = 'ready'
  } catch (error) {
    if (!isCurrentLoad()) return
    dashboardStatus.value = 'error'
    dashboardLoadMessage.value = error?.message || '看板指标数据加载失败'
  }
}

function formatDashboardLoadError(error) {
  return formatApiError(error, '看板暂时无法加载，请重试；若持续失败，请联系管理员。')
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.records || payload?.rows || payload?.list || payload?.data?.records || payload?.data?.rows || payload?.data?.list || []
}

async function loadPublishedIndicatorCatalog() {
  if (medicalMode.value) return true
  if (indicatorCatalogRequest) return indicatorCatalogRequest
  indicatorCatalogLoading.value = true
  indicatorCatalogError.value = ''
  indicatorCatalogRequest = (async () => {
    try {
      const [sources, indicators] = await Promise.all([
        fetchDashboardDataSources({ cache: 'no-store' }),
        fetchAllIndicators({ size: 100 }, { cache: 'no-store' })
      ])
      const currentSources = currentPublishedDashboardDataSources(sources, indicators)
      const orderedSources = sortDashboardDataSourcesByIndicatorCreatedAt(currentSources, indicators)
      const nextSources = orderedSources.map(dashboardDataSourceToFrontend)
      // Retain fields only for the same published version. A refreshed catalog
      // must not describe a new version with the old version's cached fields.
      const previousSources = new Map(catalogIndicatorSources.value.map(source => [source.code, source]))
      for (const source of nextSources) {
        if (previousSources.get(source.code)?.indicatorVersionId === source.indicatorVersionId) continue
        delete remoteFieldCatalog.value[source.code]
        delete remoteSourcePeriodOptions.value[source.code]
      }
      catalogIndicatorSources.value = nextSources
      if (!nextSources.some(source => source.code === selectedDataCode.value)) selectedDataCode.value = nextSources[0]?.code || ''
      return true
    } catch (error) {
      indicatorCatalogError.value = error?.message || '指标目录刷新失败，请重试。'
      return false
    } finally {
      indicatorCatalogLoading.value = false
      indicatorCatalogRequest = null
    }
  })()
  return indicatorCatalogRequest
}

async function ensureRemoteDataSourceFields(code, { required = false } = {}) {
  if (medicalMode.value) return remoteFieldCatalog.value[code] || []
  const source = availableIndicatorSources.value.find(item => item.code === code)
  if (!source || source.origin !== 'dashboard-data-source') return []
  if (remoteFieldCatalog.value[code] && remoteSourcePeriodOptions.value[code]) return remoteFieldCatalog.value[code]
  try {
    const [fields, periods] = await Promise.all([
      fetchDashboardDataSourceFields(code), fetchDashboardDataSourcePeriods(code).catch(() => [])
    ])
    const version = await dashboardIndicatorVersion(source).catch(() => null)
    const annotated = annotateDepartmentFilterFields(fields, version?.drillConfig?.drillPaths || version?.drillPaths || [])
    remoteFieldCatalog.value = { ...remoteFieldCatalog.value, [code]: annotated }
    const options = (Array.isArray(periods) ? periods : []).map(item => {
      const date = String(item.periodStart || '').slice(0, 7)
      return date ? { value: date, label: `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月` } : null
    }).filter(Boolean)
    remoteSourcePeriodOptions.value = { ...remoteSourcePeriodOptions.value, [code]: [...new Map(options.map(item => [item.value, item])).values()].sort((a, b) => b.value.localeCompare(a.value)) }
    if (required && !fields.length) throw new Error('该指标未提供可用于图表的数据字段')
    return annotated
  } catch (error) {
    if (required) throw error
    // The inspector will show an empty binding state and the user can retry by reselecting the source.
    return []
  }
}

function suggestDesignerWidgetPeriod(code) {
  return suggestIndependentWidgetPeriod(remoteSourcePeriodOptions.value[code], remotePeriodRange.value)
}

async function handleSelectedDataSourceChange(code) {
  selectedDataSourceManuallySelected = true
  await ensureRemoteDataSourceFields(code)
}

let remoteFilterOptionGeneration = 0
async function loadRemoteFilterOptions() {
  const generation = ++remoteFilterOptionGeneration
  const definitions = globalFilterDefinitions.value || []
  remoteFilterOptionsLoading.value = Object.fromEntries(definitions.map(definition => [definition.id, true]))
  const widgets = (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.widgets || []
  const next = {}
  const errors = {}
  await Promise.all(definitions.map(async definition => {
    const sourceCode = definition.optionSourceCode || widgets.find(widget => widget.sourceCode && resolveGlobalFilterField(definition, remoteFieldCatalog.value[widget.sourceCode] || [])?.filterable)?.sourceCode
    if (!sourceCode || !availableIndicatorSources.value.some(source => source.code === sourceCode && source.origin === 'dashboard-data-source')) return
    try {
      const fields = await ensureRemoteDataSourceFields(sourceCode)
      if (!resolveGlobalFilterField(definition, fields)?.filterable) return
      const range = remoteSelectedPeriod()
      const query = buildRemoteFilterOptionQuery(definition, definitions, filterRuntimeValues.value, fields, {
        periodStart: range.periodStart || null,
        periodEnd: range.periodEnd ? new Date(new Date(`${range.periodEnd}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10) : null
      })
      if (medicalMode.value) {
        const widget = widgets.find(widget => widget.sourceCode === sourceCode)
        const rows = await viewerRuntime.filterOptions(sourceCode, widget, query)
        next[definition.id] = rows.map(item => ({ value: item.value, label: item.label || String(item.value) }))
      } else if (isDepartmentFilterField(definition.field, fields)) {
        next[definition.id] = await loadDepartmentCodeOptions({ fields, fetchDictionary: fetchDepartmentDictionary })
      } else {
        const rows = await viewerRuntime.filterOptions(sourceCode, null, query)
        next[definition.id] = (Array.isArray(rows) ? rows : []).map(item => ({ value: item.value, label: item.label || String(item.value) }))
      }
    } catch (error) {
      next[definition.id] = []
      errors[definition.id] = error?.message || '筛选候选值加载失败，请重试'
    }
  }))
  if (generation === remoteFilterOptionGeneration) {
    remoteFilterOptionsLoading.value = {}
    remoteFilterOptions.value = next
    remoteFilterOptionErrors.value = errors
    const normalized = { ...filterRuntimeValues.value }
    for (const definition of definitions) {
      if (isDepartmentFilterField(definition.field, filterCatalog.value) && next[definition.id]) {
        normalized[definition.id] = departmentSelectionCodes(normalized[definition.id], next[definition.id])
      }
    }
    if (JSON.stringify(normalized) !== JSON.stringify(filterRuntimeValues.value)) filterRuntimeValues.value = normalized
  }
}

async function previewRemoteWidget(widget, { templateAutoConfigure = false } = {}) {
  if (!isDashboardIndicatorQueryWidget(widget) || !widget?.sourceCode) return
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
      ...((isEditing.value ? editingDashboardSchema.value : dashboardSchema.value) || {}),
      widgets: [widget]
    }, { dataSources: availableIndicatorSources.value }).widgets[0]
    const range = remoteSelectedPeriod(widget)
    if (normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1) {
      const datasets = await queryRemoteMultiIndicatorSources(widget, range)
      if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
      remoteMultiIndicatorDatasets.value = { ...remoteMultiIndicatorDatasets.value, [widgetId]: datasets }
      remoteWidgetDatasets.value = { ...remoteWidgetDatasets.value, [widgetId]: createMultiIndicatorDataset(widget, datasets) }
      return
    }
    const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(range, widget))
    if (planned.error) throw new Error(planned.error)
    if (planned.empty) throw new Error('组件范围与看板周期没有交集')
    const { widgetCodes, ...baseQuery } = planned.query
    const query = buildPublishedIndicatorTrendPreviewQuery(widget, baseQuery)
    const result = query.granularity
      ? await previewDashboardWidget({ widget: payload, ...query })
      : { status: 'NO_ACTIVE_RESULT', rows: [] }
    let dataset = await normalizeDashboardWidgetDataset(widget, widgetResultToDataset({ ...periodSafeWidgetResult(widget, result, query), appliedGlobalFilterFields: Object.keys(query.filters) }, fields, 'backend'), query)
    // Auto setup is limited to an explicit source choice in a built-in slot.
    // Viewer refresh and manually configured charts never change their type.
    if (templateAutoConfigure && widget.type === 'chart' && widget.config?.templateSlot?.binding === 'period' && dataset.status !== 'ERROR') {
      const binding = widget.config.dataBinding
      const hasPeriodValues = (dataset.rows || []).some(row => binding?.dimensions?.every(dimension => row[dimension.field] !== null && row[dimension.field] !== undefined && row[dimension.field] !== '') && binding?.measures?.some(measure => numericValue(row[measure.field]) !== null))
      if (!hasPeriodValues) {
        const overviewBinding = createDefaultBinding('kpi', [{ id: 'backend', fields: dataset.fields }])
        if (overviewBinding) {
          try {
            const overview = await previewDashboardWidget({ widget: { ...payload, type: 'KPI', fieldBindings: overviewBinding, query: { resultShape: 'OVERVIEW' }, chart: { chartKind: 'kpi' } }, ...query })
            if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
            const overviewDataset = widgetResultToDataset({ ...enforceDashboardResultPeriod(overview, query), appliedGlobalFilterFields: Object.keys(query.filters) }, fields, 'backend')
            if (overviewDataset.status !== 'ERROR' && overviewDataset.rows?.some(row => numericValue(row[overviewBinding.measures[0].field]) !== null)) {
              editingDashboardSchema.value = updateDashboardWidget(editingDashboardSchema.value, widgetId, current => {
                const next = { ...current, type: 'kpi', visualType: 'kpi', config: { ...current.config, dataBinding: overviewBinding } }
                delete next.chartKind
                if (current.title === getVisualizationTitle(current.sourceName, bindingKind(current))) next.title = current.sourceName
                delete next.config.tableColumns
                return next
              })
              markDashboardDirty()
              dataset = overviewDataset
              ElMessage.info('该指标暂无期间序列，已改为指标卡展示正式汇总值。')
            }
          } catch { /* Keep the original empty result when the overview probe fails. */ }
        }
      }
    }
    if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
    remoteWidgetDatasets.value = {
      ...remoteWidgetDatasets.value,
      [widgetId]: { ...dataset, componentQueryScope: { ...widget.config?.backendQuery, periodStart: query.periodStart, periodEnd: query.periodEnd } }
    }
  } catch (error) {
    if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
    remoteWidgetDatasets.value = {
      ...remoteWidgetDatasets.value,
      [widgetId]: widgetResultToDataset({ status: 'ERROR', message: error?.message || '数据预览请求失败', rows: [] }, fields, 'backend')
    }
  }
}

async function previewMetricGroupItem(group, item) {
  const source = getDashboardIndicatorSource(item.sourceCode)
  if (source?.origin !== 'dashboard-data-source') return
  const widgetId = `${group.id}::${item.id}`
  const generation = (remoteWidgetPreviewGenerations.get(widgetId) || 0) + 1
  remoteWidgetPreviewGenerations.set(widgetId, generation)
  remoteWidgetDatasets.value = {
    ...remoteWidgetDatasets.value,
    [widgetId]: widgetResultToDataset({ status: 'LOADING', rows: [] }, remoteFieldCatalog.value[item.sourceCode] || [], 'backend')
  }
  const fields = await ensureRemoteDataSourceFields(item.sourceCode)
  if (remoteWidgetPreviewGenerations.get(widgetId) !== generation) return
  const binding = item.dataBinding || createDefaultBinding('kpi', [{ id: 'backend', fields: dashboardFieldsToFrontend(fields) }])
  const independentPeriod = suggestDesignerWidgetPeriod(item.sourceCode)
  const widget = metricGroupItemWidget(group, item)
  widget.config = {
    ...widget.config,
    dataBinding: binding || emptyBinding('backend'),
    backendQuery: ['FIXED', 'INDEPENDENT'].includes(group.config?.backendQuery?.periodMode) ? group.config.backendQuery : independentPeriod || group.config?.backendQuery || {}
  }
  await previewRemoteWidget(widget)
}

async function hydrateIndicatorSource(source) {
  if (!['indicator-catalog', 'dashboard-data-source'].includes(source?.origin) || !source.analysisIndicatorId) return source
  const periodSelection = remotePeriodRange.value
  const query = { ...buildPublishedIndicatorAnalysisQuery(source), ...remoteSelectedPeriod() }
  if (!query.granularity) return { ...source, currentValue: null, yoy: null, mom: null, trendData: [], departmentData: [], pieData: [], analysisLoaded: false }
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
  ]).then(async ([payload, trendPayload]) => {
    const analysisPayload = trendPayload?.dataAvailable
      ? { ...payload, trend: Array.isArray(trendPayload.trend) ? trendPayload.trend : payload?.trend }
      : payload
    let version
    const versionDiagnostics = []
    try { version = await dashboardIndicatorVersion(source) }
    catch (error) { versionDiagnostics.push(`指标显示字段配置读取失败：${error?.message || '版本不可用'}`) }
    const paths = version?.drillConfig?.drillPaths || version?.drillPaths || []
    const departmentNames = await loadDashboardDepartmentNames(analysisPayload, paths)
    const hydrated = { ...applyIndicatorAnalysisToSource(source, analysisPayload, Object.fromEntries(departmentNames.names), paths), analysisLoaded: true }
    hydrated.analysisNameDiagnostics = [...new Set([...(hydrated.analysisNameDiagnostics || []), ...versionDiagnostics, ...departmentNames.diagnostics])]
    hydrated.analysisQueryKey = queryKey
    catalogIndicatorSources.value = catalogIndicatorSources.value.map(item => item.code === hydrated.code && item.indicatorVersionId === hydrated.indicatorVersionId ? hydrated : item)
    return hydrated
  }).finally(() => indicatorHydrationRequests.delete(requestKey))
  indicatorHydrationRequests.set(requestKey, request)
  return request
}

async function dashboardIndicatorVersion(source, widget) {
  const versionId = widget?.config?.analysisIndicatorVersionId || source?.analysisIndicatorVersionId || source?.indicatorVersionId
  if (!versionId) return null
  if (!dashboardIndicatorVersionRequests.has(String(versionId))) {
    const request = fetchIndicatorVersion(versionId).catch(error => { dashboardIndicatorVersionRequests.delete(String(versionId)); throw error })
    dashboardIndicatorVersionRequests.set(String(versionId), request)
  }
  return dashboardIndicatorVersionRequests.get(String(versionId))
}

async function loadDashboardDepartmentNames() {
  try {
    return { names: await fetchDepartmentNames(), diagnostics: [] }
  } catch (error) {
    return { names: new Map(), diagnostics: [`科室字典读取失败：${error?.message || '请稍后重试'}`] }
  }
}

async function normalizeDashboardWidgetDataset(widget, dataset, query) {
  if (medicalMode.value) return normalizeDepartmentDataset(dataset, { names: viewerRuntime.departmentNames })
  if (dataset.periodContext && !dataset.rows?.length) return dataset
  const source = getWidgetSource(widget)
  try {
    const version = source?.analysisIndicatorId ? await dashboardIndicatorVersion(source, widget) : null
    const paths = version?.drillConfig?.drillPaths || version?.drillPaths || []
    const resolved = await loadDashboardDepartmentNames()
    const normalized = normalizeDepartmentDataset(dataset, { paths, ...resolved })
    return dataset.rowMode === 'PROJECTED' || !source?.analysisIndicatorId ? normalized : explainDashboardComparison(widget, normalized, query)
  } catch (error) {
    return explainDashboardComparison(widget, normalizeDepartmentDataset(dataset, { diagnostics: [`科室名称读取失败：${error?.message || '指标配置不可用'}`] }), query)
  }
}

async function explainDashboardComparison(widget, dataset, query) {
  return explainComparisonAvailability(widget, dataset, async () => {
    const payload = schemaToDashboardPayload({ ...(editingDashboardSchema.value || dashboardSchema.value), widgets: [widget] }, { dataSources: availableIndicatorSources.value }).widgets[0]
    const fieldBindings = createDefaultBinding('kpi', [{ id: 'backend', fields: dataset.fields || [] }])
    if (!fieldBindings) return { rows: [], fields: [], status: 'EMPTY' }
    const { widgetCodes, ...scope } = query || {}
    const overview = await previewDashboardWidget({
      widget: { ...payload, type: 'KPI', fieldBindings, query: { ...payload.query, resultShape: 'OVERVIEW' }, chart: { chartKind: 'kpi' } }, ...scope
    })
    return { ...widgetResultToDataset(enforceDashboardResultPeriod(overview, scope), remoteFieldCatalog.value[widget.sourceCode], 'backend'), kpiMeasureField: fieldBindings.measures[0].field }
  })
}

async function refreshSchemaPublishedIndicatorSources() {
  const schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value
  const sourceCodes = [...new Set([
    ...(schema?.widgets || []).flatMap(widget => [widget?.sourceCode, ...metricGroupSourceCodes(widget)]).filter(Boolean),
    ...schemaPublishedIndicatorSourceCodes(schema)
  ])]
  const sources = sourceCodes
    .map(code => catalogIndicatorSources.value.find(source => source.code === code))
    .filter(source => source?.origin === 'indicator-catalog')
  await Promise.allSettled(sources.map(source => hydrateIndicatorSource(source)))
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
    const detail = await viewerRuntime.load(targetDashboardId, { signal, editing: isEditing.value })
    if (!isCurrentLoad()) return
    remoteDashboardMeta.value = dashboardDetailMeta(detail)
    const version = detail.version
    remoteDashboardIsMock.value = isMockDashboardDetail({ dashboard: detail.dashboard, version })
    if (!remoteDashboardIsMock.value) indicatorDataSources.value = []
    const rawSchema = dashboardDetailToSchema({ dashboard: detail.dashboard, version })
    // Definition availability is independent of whether its result query succeeds.
    dashboardSchema.value = rawSchema
    if (remoteDashboardIsMock.value) {
      indicatorDataSources.value = []
      dashboardSchema.value = rawSchema
      dashboardDefinition.value = detail
      dashboardStatus.value = 'legacy-mock'
      dashboardLoadMessage.value = '该看板使用旧演示配置，已停止展示固定数据。请进入编辑，重新绑定真实指标后保存并发布，或新建正式看板。'
      return
    }
    const requiresSourceCatalog = rawSchema.widgets.some(widget => normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1)
    if (viewerRuntime.capabilities.sourceCatalog && (requiresSourceCatalog || rawSchema.widgets.some(widget => widget.chartKind === 'pie'))) {
      const loaded = await loadPublishedIndicatorCatalog()
      if (!isCurrentLoad()) return
      if (!loaded && requiresSourceCatalog) throw new Error(indicatorCatalogError.value || '指标目录暂不可用')
    }
    const sourceCodes = [...new Set(rawSchema.widgets.flatMap(widget => [widget.sourceCode, ...normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).map(binding => binding.sourceCode), ...metricGroupSourceCodes(widget)]).filter(Boolean))]
    const metadataEntries = await Promise.all(sourceCodes.map(async code => {
      const sample = rawSchema.widgets.find(widget => widget.sourceCode === code)
      const { fields, periods } = await viewerRuntime.metadata(code, sample, { signal })
      if (viewerRuntime.restricted) return { code, fields, periods }
      const version = await dashboardIndicatorVersion(null, sample).catch(() => null)
      return { code, fields: annotateDepartmentFilterFields(fields, version?.drillConfig?.drillPaths || version?.drillPaths || []), periods }
    }))
    if (!isCurrentLoad()) return
    if (medicalMode.value) catalogIndicatorSources.value = sourceCodes.map(code => {
      const widget = rawSchema.widgets.find(widget => widget.sourceCode === code)
      return dashboardDataSourceToFrontend({ code, name: widget?.sourceName || widget?.title || code, indicatorVersionId: widget?.config?.analysisIndicatorVersionId })
    })
    remoteFieldCatalog.value = Object.fromEntries(metadataEntries.map(item => [item.code, item.fields]))
    const versionedWidgets = [...new Map(rawSchema.widgets.filter(widget => widget.sourceCode && widget.config?.analysisIndicatorVersionId)
      .map(widget => [`${widget.sourceCode}@${widget.config.analysisIndicatorVersionId}`, widget])).entries()]
    const versionedFields = medicalMode.value ? [] : await Promise.all(versionedWidgets.map(async ([key, widget]) => {
      const fields = await fetchDashboardDataSourceFields(widget.sourceCode, { signal, indicatorVersionId: widget.config.analysisIndicatorVersionId })
      const version = await dashboardIndicatorVersion(null, widget)
      return [key, annotateDepartmentFilterFields(fields, version?.drillConfig?.drillPaths || version?.drillPaths || [])]
    }))
    if (!isCurrentLoad()) return
    remoteVersionFieldCatalog.value = Object.fromEntries(versionedFields)
    remoteSourcePeriodOptions.value = Object.fromEntries(metadataEntries.map(item => [item.code, createPublishedDashboardPeriodOptions([item.periods])]))
    const availablePeriods = createPublishedDashboardPeriodOptions(metadataEntries.map(item => item.periods))
    periodOptions.value = availablePeriods
    if (!remotePeriodRange.value.length) {
      reconcilingRemotePeriod = true
      try {
        applyRemotePeriodSelection(defaultDashboardPeriod(availablePeriods))
        await nextTick()
      } finally { reconcilingRemotePeriod = false }
    }
    const result = remoteDashboardMeta.value.currentPublishedVersionId
      ? await queryRemoteDashboardByPeriod(rawSchema, signal, targetDashboardId)
      : null
    if (!isCurrentLoad()) return
    const schema = applyDefaultDashboardBindings(rawSchema, remoteFieldCatalog.value)
    dashboardSchema.value = schema
    if (isEditing.value) {
      editingDashboardSchema.value = clonePersistableValue(schema)
      resetDashboardHistory(schema)
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
    const widgetDatasets = await buildDashboardWidgetDatasets(schema, result)
    if (!isCurrentLoad()) return
    remoteWidgetDatasets.value = widgetDatasets
    const queryState = resolveDashboardQueryState(result, schema.widgets.filter(isDashboardIndicatorQueryWidget).length)
    dashboardStatus.value = queryState.status === 'empty' ? 'ready' : queryState.status
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

function remoteWidgetQueryContext(range, widgetOrCode, schema = isEditing.value ? editingDashboardSchema.value : dashboardSchema.value) {
  const sourceCode = typeof widgetOrCode === 'string' ? widgetOrCode : widgetOrCode.sourceCode
  const versionId = typeof widgetOrCode === 'string' ? null : widgetOrCode.config?.analysisIndicatorVersionId
  const fields = remoteVersionFieldCatalog.value[`${sourceCode}@${versionId}`] || remoteFieldCatalog.value[sourceCode] || []
  const definitions = schema?.globalFilters || globalFilterDefinitions.value
  return {
    ...range, definitions, values: schema === dashboardSchema.value || schema === editingDashboardSchema.value ? filterRuntimeValues.value : initialFilterValues(definitions),
    fields, department: department.value, interactions: interactionFilterState.value
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
    const sourceWidget = { ...widget, sourceCode: binding.sourceCode, config: { ...widget.config, dataBinding: singleIndicatorProjectionBinding(widget.config?.dataBinding, fields), indicatorBindings: [], analysisIndicatorVersionId: binding.indicatorVersionId || source.indicatorVersionId } }
    const planned = buildRemoteWidgetQuery(sourceWidget, remoteWidgetQueryContext(range, binding.sourceCode, schema))
    if (planned.error || planned.empty) {
      datasets.set(binding.sourceCode, [{ id: 'backend', fields: [], rows: [], status: planned.error ? 'ERROR' : 'EMPTY', message: planned.error || '组件范围与看板周期没有交集' }])
      return
    }
    const payload = schemaToDashboardPayload({ ...(editingDashboardSchema.value || dashboardSchema.value || {}), widgets: [sourceWidget] }, { dataSources: availableIndicatorSources.value }).widgets[0]
    const { widgetCodes, ...query } = planned.query
    const result = query.granularity ? await previewDashboardWidget({ widget: payload, ...query }, { signal }) : { status: 'NO_ACTIVE_RESULT', rows: [] }
    datasets.set(binding.sourceCode, [await normalizeDashboardWidgetDataset(sourceWidget, widgetResultToDataset(periodSafeWidgetResult(sourceWidget, result, query), fields, 'backend'), query)])
  }))
  return datasets
}

async function queryRemoteDashboardByPeriod(schema, signal, dashboardId) {
  const widgets = uniqueDashboardQueryWidgets(schema)
  const parts = await mapWithConcurrency(widgets, 3, async widget => {
    const trend = dashboardWidgetResultShape(widget) === 'TREND'
    const range = remoteSelectedPeriod(widget)
    if (viewerRuntime.capabilities.multiIndicator && normalizeIndicatorBindings(widget.config?.indicatorBindings, widget).length > 1) {
      try {
        const datasets = await queryRemoteMultiIndicatorSources(widget, range, signal, schema)
        const combined = createMultiIndicatorDataset(widget, datasets)
        return { widgets: { [widget.id]: { status: combined.status, message: combined.message, rows: combined.rows } }, multiDatasets: { [String(widget.id)]: datasets } }
      } catch (error) {
        if (signal?.aborted) throw error
        return { widgets: { [widget.id]: { status: 'ERROR', message: error?.message || '多指标查询失败', rows: [] } } }
      }
    }
    const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(range, widget, schema))
    if (planned.error || planned.empty) return { widgets: { [widget.id]: { status: planned.error ? 'ERROR' : 'EMPTY', message: planned.error || '组件范围与看板周期没有交集', rows: [] } } }
    const query = planned.query
    const appliedGlobalFilterFields = Object.keys(query.filters || {})
    if (!query.granularity) return { widgets: { [widget.id]: enforceDashboardResultPeriod({ rows: [] }, query, { selectionType: range.selectionType }) } }
    if (trend && query.granularity === 'MONTHLY') {
      const months = monthsBetween(query.periodStart.slice(0, 7), new Date(new Date(`${query.periodEnd}T00:00:00Z`).getTime() - 1).toISOString().slice(0, 7))
      const result = await queryDashboardTrendMonths(dashboardId, query, [widget], months, signal)
      return { ...result, widgets: Object.fromEntries(Object.entries(result.widgets || {}).map(([id, item]) => [id, { ...item, appliedGlobalFilterFields }])) }
    }
    const result = await queryRemoteDashboardCached(dashboardId, query, signal)
    return { ...result, widgets: Object.fromEntries(Object.entries(result.widgets || {}).map(([id, item]) => [id, { ...item, appliedGlobalFilterFields }])) }
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
  return `${dashboardId}:${remoteDashboardMeta.value.currentPublishedVersionId || ''}:${remotePeriodSelection.value.type}:${JSON.stringify(query)}`
}
async function queryRemoteDashboardCached(dashboardId, query, signal) {
  const key = remoteDashboardQueryCacheKey(dashboardId, query)
  const cached = remoteDashboardQueryCache.get(key)
  if (viewerRuntime.capabilities.queryCache && cached && cached.expiresAt > Date.now()) return cached.result
  remoteDashboardQueryCache.delete(key)
  const selectionType = remotePeriodSelection.value.type
  const response = await viewerRuntime.query(dashboardId, query, { signal })
  const schema = dashboardSchema.value
  const result = { ...response, widgets: Object.fromEntries(Object.entries(response.widgets || {}).map(([id, item]) => {
    const widget = schema?.widgets?.find(widget => String(widget.id) === id)
    return [id, enforceDashboardResultPeriod(item, query, { timeSeries: dashboardWidgetResultShape(widget || {}) === 'TREND', selectionType: ['FIXED', 'INDEPENDENT'].includes(widget?.config?.backendQuery?.periodMode) ? query.granularity : selectionType })]
  })) }
  const widgets = Object.values(result?.widgets || {})
  if (viewerRuntime.capabilities.queryCache && !signal?.aborted && widgets.length && widgets.every(widget => widget?.status === 'READY')) {
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
    if (result.rows.length) { result.status = 'READY'; result.message = '' }
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
  const merged = mergeMonthlyDashboardResults(parts)
  for (const result of Object.values(merged.widgets)) result.periodContext = { ...result.periodContext, label: dashboardPeriodLabel(baseQuery) }
  return merged
}

async function buildDashboardWidgetDatasets(schema, result) {
  const entries = await mapWithConcurrency(schema.widgets.filter(isDashboardIndicatorQueryWidget), 3, async widget => {
    const dataset = widgetResultToDataset(dashboardWidgetResult(result, schema.widgets, widget), remoteFieldCatalog.value[widget.sourceCode], 'backend')
    const query = remoteSelectedPeriod(widget)
    const planned = buildRemoteWidgetQuery(widget, remoteWidgetQueryContext(query, widget, schema))
    return [String(widget.id), await normalizeDashboardWidgetDataset(widget, dataset, planned.query || query)]
  })
  return Object.fromEntries(entries)
}

async function refreshRemoteDashboardData() {
  // A scene switch has not committed its published schema yet. Do not abort
  // that load and query the temporary empty schema created for the new scene.
  if (dashboardStatus.value === 'loading') return
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
    const widgetDatasets = await buildDashboardWidgetDatasets(schema, result)
    if (controller.signal.aborted || !isCurrentLoad()) return
    remoteWidgetDatasets.value = widgetDatasets
    const queryState = resolveDashboardQueryState(result, schema.widgets.filter(isDashboardIndicatorQueryWidget).length)
    dashboardStatus.value = queryState.status === 'empty' ? 'ready' : queryState.status
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
    resultShape: dashboardWidgetResultShape(widget),
    indicatorVersionId: widget.config?.analysisIndicatorVersionId || '',
    dataBinding: widget.config?.dataBinding || {},
    backendQuery: widget.config?.backendQuery || {},
    query: widget.config?.query || {},
    indicatorBindings: widget.config?.indicatorBindings || []
  })
}

function uniqueDashboardQueryWidgets(schema = {}) {
  const signatures = new Set()
  return (schema?.widgets || []).filter(isDashboardIndicatorQueryWidget).filter(widget => {
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
  remotePeriodRange.value = []
  remotePeriodSelection.value = defaultDashboardPeriod()
  filterRuntimeValues.value = {}
  interactionFilterState.value = {}
  drillRuntimeState.value = {}
  selectedWidgetIds.value = []
  primarySelectedWidgetId.value = ''
  resetDashboardHistory()
  dashboardDirty.value = false
  // Schema recovery is synchronous; commit identity and schema in the same
  // Vue update batch so selector, title, canvas and editing snapshot agree.
  loadDashboardSchema(nextDashboardId)
  activeDashboardId.value = nextDashboardId
  requestedDashboardId.value = nextDashboardId
  activeSceneCode.value = ''
  if (isEditing.value && dashboardSchema.value) {
    editingDashboardSchema.value = clonePersistableValue(dashboardSchema.value)
    resetDashboardHistory(editingDashboardSchema.value)
    await reconcileDesignerCanvasLayout()
  }
  await loadDashboard(nextDashboardId)
}
function normalizeMonthlyTrend(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item) => ({
      period: item?.period || item?.month || '',
      value: numericValue(item?.value)
    }))
    .filter((item) => item.period !== '' && item.value !== null)
}

function normalizeRanking(rows, source = 'live') {
  if (!Array.isArray(rows)) return []
  return rows
    .map((item, index) => {
      const rawValue = numericValue(item?.value)
      return {
        rank: index + 1,
        departmentCode: String(item?.deptCode || item?.departmentCode || ''),
        department: item?.deptName || item?.deptCode || '未命名科室',
        rawValue,
        value: Number.isFinite(rawValue) ? formatNumber(rawValue) : '-',
        drillTarget: normalizeDashboardDrillTarget(item?.drillTarget, source)
      }
    })
    .filter((item) => item.rawValue !== null)
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value))
}

const goAlerts = () => {
  if (isEditing.value || medicalMode.value) return
  router.push('/alerts')
}
const goWarningEvent = (eventId) => {
  if (medicalMode.value) return
  if (isEditing.value || dashboardStatus.value !== 'ready' || !/^[1-9]\d*$/.test(String(eventId || ''))) return
  router.push({ name: 'AlertCenter', query: { eventId: String(eventId) } })
}
const goIndicatorAnalysis = (indicator, backendQuery = {}, drillContext = null, queryContext = null) => {
  if (isEditing.value || medicalMode.value) return
  const source = typeof indicator === 'object' && indicator ? indicator : getDashboardIndicatorSource(indicator)
  if (!source?.analysisIndicatorId || !['indicator-catalog', 'dashboard-data-source', 'backend'].includes(source.origin) || (source.origin === 'backend' && dashboardStatus.value !== 'ready')) return
  const context = queryContext || (['FIXED', 'INDEPENDENT'].includes(backendQuery?.periodMode)
    ? buildIndicatorAnalysisPeriodContext(remotePeriodRange.value, backendQuery)
    : remoteSelectedPeriod())
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

function refreshDesignerPeriodData() {
  for (const widget of designerWidgets.value.filter(widget => getWidgetSource(widget)?.origin === 'dashboard-data-source')) void previewRemoteWidget(widget)
  void refreshSchemaPublishedIndicatorSources()
}

watch(period, () => {
  if (reconcilingRemotePeriod) return
  if (isEditing.value) return
  loadDashboard()
  void refreshSchemaPublishedIndicatorSources()
})
watch([remotePeriodRange, remotePeriodSelection, department], () => {
  if (reconcilingRemotePeriod) return
  if (isEditing.value) { refreshDesignerPeriodData(); return }
  if (isFormalRemoteDashboard.value) void refreshRemoteDashboardData()
  else if (period.value !== remotePeriodRange.value[1]) period.value = remotePeriodRange.value[1]
})
watch(activeWidgetId, () => { selectedMetricItemId.value = '' })
const metricGroupPreviewKey = computed(() => JSON.stringify({
  editing: isEditing.value,
  period: remotePeriodRange.value,
  statisticalPeriod: remotePeriodSelection.value,
  department: department.value,
  filters: filterRuntimeValues.value,
  sources: availableIndicatorSources.value.filter(source => source.origin === 'dashboard-data-source').map(source => [source.code, source.indicatorVersionId]),
  groups: ((isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.widgets || [])
    .filter(widget => widget.type === 'metric-group' || (widget.type === 'ranking' && widget.config?.ranking?.mode === 'indicators'))
    .map(widget => ({ id: widget.id, backendQuery: widget.config?.backendQuery, query: widget.config?.query, items: (widget.config?.metricGroup?.items || []).map(item => ({ id: item.id, sourceCode: item.sourceCode, dataBinding: item.dataBinding })) }))
}))
watch(metricGroupPreviewKey, () => {
  for (const group of (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.widgets || []) {
    if (group.type !== 'metric-group' && !(group.type === 'ranking' && group.config?.ranking?.mode === 'indicators')) continue
    for (const item of group.config?.metricGroup?.items || []) void previewMetricGroupItem(group, item)
  }
}, { immediate: true })
watch(selectedDataCode, cancelDrawPlacement)
watch(isEditing, value => { if (!value) cancelDrawPlacement() })
let remoteFilterReloadTimer
watch([filterRuntimeValues, interactionFilterState], () => {
  drillRuntimeState.value = {}
  if (isEditing.value && !remoteDashboardIsMock.value) {
    globalThis.clearTimeout(remoteFilterReloadTimer)
    remoteFilterReloadTimer = globalThis.setTimeout(() => {
      for (const widget of designerWidgets.value.filter(widget => getWidgetSource(widget)?.origin === 'dashboard-data-source')) void previewRemoteWidget(widget)
    }, 180)
    return
  }
  if (!isEditing.value && isRemoteDashboard() && canRefreshCurrentRemoteDashboard.value) {
    globalThis.clearTimeout(remoteFilterReloadTimer)
    remoteFilterReloadTimer = globalThis.setTimeout(() => {
      if (canRefreshCurrentRemoteDashboard.value) void refreshRemoteDashboardData()
    }, 180)
  }
}, { deep: true })

function onDesignerGlobalKeydown(event) {
  if (presentationMode.value === 'presentation' && event.key === 'Escape') {
    void exitPresentation()
    return
  }
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
  if (presentationMode.value === 'presentation') void exitPresentation()
  globalThis.clearTimeout(remoteFilterReloadTimer)
  removeDashboardListeners()
})
onActivated(() => {
  if (!dashboardDeactivatedAt) return
  void loadPublishedIndicatorCatalog()
  addDashboardListeners()
  designerImmersive.value = isEditing.value
  if (Date.now() - dashboardDeactivatedAt > 30_000 && isFormalRemoteDashboard.value) {
    remoteDashboardQueryCache.clear()
    globalThis.setTimeout(() => { void refreshRemoteDashboardData() }, 0)
  }
  dashboardDeactivatedAt = 0
  if (route.query.edit === '1' && !isEditing.value) globalThis.setTimeout(async () => {
    await refreshDashboardCatalog()
    const id = typeof route.query.id === 'string' ? route.query.id.trim() : ''
    if (id && id !== activeDashboardId.value) await requestDashboardSwitch(id)
    await startDashboardEdit()
  }, 0)
})

onMounted(async () => {
  addDashboardListeners()
  if (!isEditing.value) designerImmersive.value = false
  try {
    refreshLocalLayoutTemplates()
    await refreshDashboardCatalog()
    if (!managedDashboardId.value && !dashboardSelectorOptions.value.some(item => String(item.id) === String(activeDashboardId.value))) {
      const nextId = localDashboardCatalog.value[0]?.id || ''
      activeDashboardId.value = nextId
      requestedDashboardId.value = nextId
      activeSceneCode.value = ''
    }
    if (managedDashboardId.value || activeDashboardId.value) {
      loadDashboardSchema()
      await loadDashboard()
      if (isRemoteDashboard()) void loadPublishedIndicatorCatalog()
      if (route.query.edit === '1') await startDashboardEdit()
    } else {
      dashboardStatus.value = 'no-dashboards'
      dashboardLoadMessage.value = '暂无可用看板，请前往看板管理创建。'
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
  warningWidgetLoadGeneration += 1
  warningWidgetAbortController?.abort()
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
.dashboard-designer-period { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; margin-bottom:12px; padding:9px 12px; border:1px solid var(--db-border,#e3e9eb); border-radius:6px; background:var(--db-elevated,#fff); }
.dashboard-designer-period__hint { color:var(--db-muted,#667780); font-size:12px; }

.dashboard-page { min-height:100%; }
.dashboard-draft-badge { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border:1px solid #f2d7a8; border-radius:999px; background:#fff8eb; color:#86550b; font-size:12px; line-height:1.5; cursor:help; }
.dashboard-draft-badge::before { content:''; width:6px; height:6px; border-radius:50%; background:#d69531; }
.dashboard-draft-badge:focus-visible { outline:2px solid var(--idmp-interactive,#1261a6); outline-offset:2px; }
.dashboard-schema-viewer { width:100%; margin-top:16px; overflow-x:auto; overflow-y:hidden; }
.dashboard-canvas-frame { overflow:hidden; padding:6px 10px 10px; border:1px solid var(--idmp-border-subtle,#d9e0e6); border-radius:var(--idmp-radius-lg,4px); background:var(--idmp-layer-01,#fff); }
.dashboard-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; min-height:38px; padding:0 2px 8px; margin-bottom:7px; border-bottom:1px solid var(--idmp-border-subtle,#e7ecef); }
.dashboard-presentation-trigger { display:inline-grid; flex:none; place-items:center; width:30px; height:30px; margin-left:auto; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--db-secondary,#52636c); cursor:pointer; }
.dashboard-presentation-trigger:hover { border-color:var(--db-border,#d9e0e6); background:var(--db-accent-soft,#edf6ff); color:var(--db-accent,#1261a6); }
.dashboard-presentation-trigger:focus-visible,.dashboard-presentation-exit:focus-visible { outline:2px solid var(--db-accent,#1261a6); outline-offset:2px; }
.dashboard-presentation-exit { position:fixed; top:16px; right:16px; z-index:10; display:grid; place-items:center; width:36px; height:36px; border:1px solid var(--db-border,#d9e0e6); border-radius:8px; background:var(--db-elevated,#fff); color:var(--db-text,#25343b); box-shadow:0 3px 12px rgba(16,24,40,.14); cursor:pointer; }
.dashboard-presentation-exit:hover { background:var(--db-accent-soft,#edf6ff); color:var(--db-accent,#1261a6); }
.dashboard-query-controls { display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; }
.dashboard-query-control { display:flex; align-items:center; gap:6px; color:var(--idmp-text-secondary,#667085); font-size:12px; }
.dashboard-query-control > span { color:var(--idmp-text-helper,#858f99); }
.dashboard-interaction-trigger { display:inline-flex; align-items:center; gap:4px; min-height:24px; padding:2px 7px; border:1px solid #c9dcef; border-radius:4px; background:#f5faff; color:var(--db-accent,#1261a6); font-size:12px; cursor:pointer; }
.dashboard-interaction-trigger:hover { background:#eaf4ff; }
.dashboard-interaction-details { display:grid; gap:8px; color:var(--idmp-text-secondary,#667085); font-size:12px; }
.dashboard-interaction-details strong { color:var(--idmp-text-primary,#344054); }
.dashboard-interaction-details__item { overflow-wrap:anywhere; }
.dashboard-interaction-details .el-button { justify-self:start; margin-left:-12px; }
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
.dashboard-widget-source-select { width:100%; min-width:0; }
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
.dashboard-source-period-note { margin:8px 0; padding:8px; border:1px solid #f4d69c; border-radius:6px; background:#fff8e9; color:#875a13; font-size:11px; line-height:1.5; }
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
.studio-library-readiness { display:block; margin-top:3px; font-size:11px; color:#1570ef; }
.studio-library-readiness.is-setup,.studio-library-readiness.is-missing-source { color:#b54708; }
.studio-library-readiness.is-loading { color:#667085; }
.studio-placement-hint { margin:9px 0 0; padding:8px 10px; border:1px solid #a6cff0; border-radius:5px; background:#eff8ff; color:#175cd3; font-size:12px; line-height:1.5; }
</style>
