<template>
  <div ref="presentationRef" class="idmp-page dashboard-page dashboard-v2" :class="{ 'is-presentation-mode': presentationMode === 'presentation' }" :style="{ '--dashboard-background': dashboardBackground }">
    <PageHeader v-if="!isEditing"
      :title="dashboardSchema?.name || '医疗质量指标总览'"
    >
      <template #meta>
        <span class="data-source-badge" :class="{ 'is-live': dashboardStatus === 'ready' }">
          {{ dashboardSourceLabel }}
        </span>
        <span v-if="dashboardStatus === 'demo'" class="data-source-badge" role="status">演示数据</span>
        <span>数据期间：{{ period }}</span>
        <span>统计范围：{{ department }}</span>
      </template>
      <template #actions>
        <el-select v-model="period" class="dashboard-filter" aria-label="年度">
          <el-option v-for="option in periodOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-select v-model="department" class="dashboard-filter" aria-label="科室">
          <el-option v-for="option in departmentOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <template v-if="!isEditing">
          <el-button :type="presentationMode === 'standard' ? 'primary' : 'default'" @click="exitPresentation">标准模式</el-button>
          <el-button :type="presentationMode === 'presentation' ? 'primary' : 'default'" @click="enterPresentation">大屏展示</el-button>
        </template>
        <template v-if="isEditing">
          <el-button :icon="RefreshLeft" @click="resetDashboardLayout">恢复默认</el-button>
          <el-button data-testid="dashboard-undo" :disabled="!canUndo" @click="undoDashboardEdit">撤销</el-button>
          <el-button data-testid="dashboard-redo" :disabled="!canRedo" @click="redoDashboardEdit">重做</el-button>
          <el-button data-testid="dashboard-configure-widget" :disabled="!activeDesignerWidget" @click="openWidgetConfig(activeWidgetId)">配置组件</el-button>
          <el-button data-testid="dashboard-delete-widget" :icon="Delete" :disabled="!activeDesignerWidget" @click="deleteActiveWidget">删除组件</el-button>
          <span class="dashboard-save-state" :class="`is-${saveState}`">{{ saveStateLabel }}</span>
          <el-button v-if="isDev" text @click="showDashboardSchemaDiagnostic">查看当前 Schema</el-button>
          <el-button :icon="Close" @click="exitDashboardEdit">退出编辑</el-button>
          <el-button data-testid="dashboard-save" type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
        </template>
        <el-button v-if="!isEditing" data-testid="dashboard-edit" type="primary" :icon="Edit" @click="startDashboardEdit">编辑看板</el-button>
        <el-button v-if="dashboardStatus === 'unpublished'" @click="loadDashboard">重新加载</el-button>
      </template>
    </PageHeader>

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
      v-else-if="dashboardStatus === 'error'"
      type="error"
      title="质量看板加载失败"
      :description="dashboardLoadMessage || '未展示演示数据，请检查后端看板是否已发布后重试。'"
    >
      <template #actions><el-button type="primary" @click="loadDashboard">重新加载</el-button></template>
    </StatePanel>
    <StatePanel
      v-else-if="dashboardStatus === 'empty'"
      type="empty"
      title="当前条件暂无正式结果"
      description="后端已返回看板，但当前统计周期和范围没有可展示的正式数据。"
    >
      <template #actions><el-button @click="loadDashboard">重新加载</el-button></template>
    </StatePanel>

    <template v-else-if="dashboardStatus === 'ready' || dashboardStatus === 'demo'">
    <section v-if="!isEditing && useSchemaViewer" class="dashboard-schema-viewer">
      <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
      <section v-if="activeInteractionFilters.length" class="dashboard-interaction-summary" aria-label="联动筛选">
        <span v-for="interaction in activeInteractionFilters" :key="interaction.id">联动：{{ interaction.label }} = {{ interaction.value }}</span>
        <el-button size="small" text @click="clearAllInteractionFilters">清除联动</el-button>
      </section>
      <DashboardCanvas
        :key="`viewer-${dashboardSchema?.id}-${viewerBreakpoint}`"
        ref="viewerCanvasRef"
        class="dashboard-schema-canvas"
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
            :warnings="dashboardWarnings"
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

    <div v-else class="dashboard-studio">
      <header class="dashboard-command">
        <button class="studio-back" aria-label="返回看板" @click="exitDashboardEdit">←</button>
        <div class="studio-title"><span>医疗质量 · DASHBOARD STUDIO</span><h1>{{ editingDashboardSchema?.name || '医疗质量指标总览' }}</h1></div>
        <el-select v-model="activeSceneCode" size="small" class="studio-scene-switcher" aria-label="场景看板"><el-option v-for="scene in LOCAL_SCENE_DASHBOARDS" :key="scene.sceneCode" :label="`${scene.name}（本地）`" :value="scene.sceneCode" /></el-select>
        <span class="dashboard-save-state" :class="`is-${saveState}`" role="status">{{ saveStateLabel }}</span>
        <div class="studio-command-actions">
          <el-button v-if="canRestoreQualitySafetyDemo" data-testid="dashboard-restore-quality-safety-demo" @click="restoreQualitySafetyDemoLayout">恢复演示布局</el-button>
          <el-button data-testid="dashboard-preview" @click="studioPreview = true">预览</el-button>
          <el-button data-testid="dashboard-undo" :disabled="!canUndo" @click="undoDashboardEdit">撤销</el-button>
          <el-button data-testid="dashboard-redo" :disabled="!canRedo" @click="redoDashboardEdit">重做</el-button>
          <el-button data-testid="dashboard-save" type="primary" :icon="Check" @click="saveDashboardLayout">保存布局</el-button>
          <el-dropdown @command="handleStudioCommand">
            <el-button aria-label="更多看板操作">···</el-button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="reset">恢复默认布局</el-dropdown-item><el-dropdown-item command="exit">退出编辑</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </header>
      <div class="dashboard-designer-shell">
      <aside class="studio-library" aria-label="组件库">
        <h2>组件库</h2><p>选择指标，再添加分析组件</p>
        <input v-model="librarySearch" class="studio-search" placeholder="搜索组件…" aria-label="搜索组件" />
        <label class="studio-field-label">指标数据</label>
        <el-select v-model="selectedDataCode" aria-label="指标数据" :loading="dashboardLoading || indicatorCatalogLoading">
          <el-option v-for="source in availableIndicatorSources" :key="source.code" :label="source.name" :value="source.code" />
        </el-select>
        <p v-if="dashboardStatus === 'demo'" class="dashboard-demo-source" role="status">演示数据：用于本地场景预览，不是医院真实业务数据。</p>
        <h3>常用组件</h3>
        <button v-for="item in filteredLibrary" :key="item.type" :data-testid="`dashboard-library-${item.type}`" class="studio-library-item" :class="{ 'is-current': addWidgetType === item.type }" @click="addWidgetType = item.type">
          <span class="studio-library-icon" aria-hidden="true">{{ item.icon }}</span><span><strong>{{ item.name }}</strong><small>{{ item.hint }}</small></span>
        </button>
        <p v-if="!filteredLibrary.length">没有匹配的组件</p>
        <el-button data-testid="dashboard-add-widget" type="primary" plain :disabled="!selectedDataSource" :icon="Plus" @click="addDashboardWidget">添加组件</el-button>
        <section class="studio-template-library" aria-label="布局模板">
          <div class="studio-template-library__heading"><h3>模板</h3><button type="button" @click="saveCurrentLayoutAsTemplate">保存当前布局</button></div>
          <p>内置模板与仅保存在当前浏览器的本地模板。</p>
          <article v-for="template in layoutTemplates" :key="template.id" class="studio-template-item">
            <div class="studio-template-preview" aria-hidden="true"><i v-for="(widget, index) in template.widgets" :key="index" :style="templatePreviewStyle(widget)" /></div>
            <div><strong>{{ template.name }}</strong><small>{{ template.description }}</small></div>
            <div class="studio-template-item__actions"><button type="button" @click="applyLayoutTemplate(template)">使用</button><button v-if="!template.id.startsWith('builtin-')" type="button" class="is-danger" @click="removeLocalLayoutTemplate(template.id)">删除</button></div>
          </article>
        </section>
        <div class="studio-library-note">点击添加 · 拖动布局<br />选中组件后在右侧编辑属性</div>
      </aside>
      <main class="studio-workspace">
        <div class="studio-canvas-heading"><span>画布</span><span>24 列 · Clinical Light</span></div>
        <div class="studio-canvas-scroll">
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
        <div v-if="!designerWidgets.length" class="studio-empty">
          <span aria-hidden="true">▦</span><h2>创建你的第一个看板组件</h2><p>从左侧选择指标与组件，开始构建分析看板。</p>
          <el-button :disabled="!selectedDataSource" @click="addWidgetType = 'kpi'; addDashboardWidget()">添加 KPI</el-button>
        </div>
      <DashboardCanvas
        :key="`designer-${editingDashboardSchema?.id}`"
        ref="designerCanvasRef"
        class="dashboard-designer-canvas"
        :widgets="designerWidgets"
        :editable="true"
        :columns="24"
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
            :warnings="dashboardWarnings"
            :ranking="departmentRanking"
            :department="department"
            :updated-at="dashboardQueryLabel"
            editing
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
          />
        </template>
      </DashboardCanvas>
        </div>
      </main>
      <aside class="studio-inspector" aria-label="组件属性">
        <div class="studio-inspector-heading"><h2>组件属性</h2><button data-testid="dashboard-settings" @click="showDashboardSettings">看板设置</button><button data-testid="dashboard-configure-widget" :disabled="!activeDesignerWidget" @click="openWidgetConfig(activeWidgetId)">配置</button></div>
        <template v-if="!selectedWidgetIds.length">
          <section class="dashboard-settings-inspector"><h3>看板设置</h3><label>名称<input :value="editingDashboardSchema?.name" @change="updateDashboardMetadata('name', $event.target.value)" /></label><label>描述<textarea :value="editingDashboardSchema?.description" @change="updateDashboardMetadata('description', $event.target.value)" /></label><label>类型<select :value="editingDashboardSchema?.dashboardType" @change="updateDashboardMetadata('dashboardType', $event.target.value)"><option value="hospital-overview">全院概览</option><option value="topic">专题看板</option><option value="scene">场景看板</option><option value="department">科室看板</option><option value="custom">自定义看板</option></select><small>定义业务用途与入口类型，不直接改变组件数据。</small></label><label>分类<input :value="editingDashboardSchema?.category" @change="updateDashboardMetadata('category', $event.target.value)" /><small>用于看板分类和检索，不直接影响图表数据。</small></label><label>范围<select :value="editingDashboardSchema?.scope" @change="updateDashboardMetadata('scope', $event.target.value)"><option value="hospital">全院</option><option value="department">科室</option><option value="personal">个人</option></select><small>定义适用业务范围；实际权限由服务端控制。</small></label><label>背景<select :value="editingDashboardSchema?.appearance?.background?.value || '#ffffff'" @change="updateDashboardBackground($event.target.value)"><option value="#ffffff">临床白</option><option value="linear-gradient(135deg,#f7fbfa,#eef5fb)">临床浅渐变</option><option value="linear-gradient(135deg,#f9f6fc,#eef7f6)">柔和渐变</option></select><small>保存为受控颜色或 Clinical Light 渐变预设。</small></label><h3>响应式布局</h3><p>只影响查看模式的排列，不改变设计器桌面布局。</p><label>平板<select :value="editingDashboardSchema?.responsivePolicy?.tablet" @change="updateResponsivePolicy($event.target.value)"><option value="auto-two-column">自动两列</option><option value="single-column">单列</option></select></label><label>手机<input value="单列" disabled /></label></section>
          <section class="dashboard-settings-inspector dashboard-global-filter-settings" data-testid="dashboard-global-filter-settings"><h3>全局筛选（{{ globalFilterDefinitions.length }}）</h3><GlobalFilterDesigner :definitions="globalFilterDefinitions" :catalog="filterCatalog" :widgets="designerWidgets" :compatible-widget-ids-by-filter="compatibleWidgetIdsByGlobalFilter" @change="updateGlobalFilters" @delete="deleteGlobalFilter" @scope-change="updateGlobalFilterScope" /></section>
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
              <label v-if="activeWidgetVisualizationOptions.length" class="studio-field-label">展示形式</label>
              <el-select v-if="activeWidgetVisualizationOptions.length" v-model="activeWidgetVisualizationType" aria-label="选中组件展示形式"><el-option v-for="option in activeWidgetVisualizationOptions" :key="option.value" :label="option.label" :value="option.value" /></el-select>
              <dl class="dashboard-property-list"><dt>指标</dt><dd>{{ activeDesignerWidget.sourceName || activeDesignerWidget.sourceCode || '未绑定' }}</dd><dt>展示类型</dt><dd>{{ activeDesignerWidget.chartKind || activeDesignerWidget.type }}</dd></dl>
              <section class="dashboard-precise-layout"><h3>位置与尺寸</h3><label>X<input :value="activeDesignerWidget.layout.x" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ x: $event.target.value })" /></label><label>Y<input :value="activeDesignerWidget.layout.y" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ y: $event.target.value })" /></label><label>宽度<input :value="activeDesignerWidget.layout.w" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: $event.target.value })" /></label><label>高度<input :value="activeDesignerWidget.layout.h" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ h: $event.target.value })" /></label><label>宽度（%）<input :value="gridWidthToPercentage(activeDesignerWidget.layout.w)" type="number" :disabled="activeDesignerWidget.config?.locked" @change="commitPreciseLayout({ w: percentageToGridWidth($event.target.value) })" /></label><small>实际尺寸约 {{ precisePixelSize.width }} × {{ precisePixelSize.height }} px；仅作显示，不保存。</small></section>
              <BindingInspector :key="activeDesignerWidget.id" :widget="activeDesignerWidget" :datasets="getBindingDatasets(activeDesignerWidget)" @change="updateDesignerBinding" @query-change="updateDesignerQuery" />
            </el-tab-pane>
            <el-tab-pane label="样式" name="style">
              <div class="dashboard-style-form">
                <h3>卡片外观</h3><label>背景颜色 <input type="color" :value="designerStyle.background" @input="updateDesignerStyle({ background: $event.target.value })" /></label>
                <label>边框颜色 <input type="color" :value="designerStyle.borderColor" @input="updateDesignerStyle({ borderColor: $event.target.value })" /></label>
                <label>边框宽度 <input data-testid="dashboard-widget-border-width" type="number" min="0" max="8" :value="designerStyle.borderWidth" @input="updateDesignerStyle({ borderWidth: Number($event.target.value) })" /></label>
                <label>圆角 <input type="number" min="0" max="32" :value="designerStyle.borderRadius" @input="updateDesignerStyle({ borderRadius: Number($event.target.value) })" /></label>
                <h3>间距</h3><label>内边距 <input type="number" min="0" max="48" :value="designerStyle.padding" @input="updateDesignerStyle({ padding: Number($event.target.value) })" /></label>
                <h3>效果</h3><label>透明度 <input type="number" min="0" max="1" step="0.05" :value="designerStyle.opacity" @input="updateDesignerStyle({ opacity: Number($event.target.value) })" /></label><label>阴影 <select :value="designerStyle.shadow" @change="updateDesignerStyle({ shadow: $event.target.value })"><option value="none">无</option><option value="sm">小</option><option value="md">中</option><option value="lg">大</option><option value="glow">发光</option></select></label>
              </div>
            </el-tab-pane>
            <el-tab-pane label="交互" name="interaction">
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
        <div class="dashboard-preview-breakpoints" role="group" aria-label="预览断点">
          <el-button v-for="breakpoint in ['desktop', 'tablet', 'mobile']" :key="breakpoint" size="small" :type="previewBreakpoint === breakpoint ? 'primary' : 'default'" @click="previewBreakpoint = breakpoint">{{ { desktop: '桌面', tablet: '平板', mobile: '手机' }[breakpoint] }}</el-button>
        </div>
        <DashboardFilterBar :definitions="globalFilterDefinitions" :values="filterRuntimeValues" :catalog="filterCatalog" :options-by-id="filterOptionsById" @change="filterRuntimeValues = $event" />
        <section v-if="activeInteractionFilters.length" class="dashboard-interaction-summary" aria-label="联动筛选">
          <span v-for="interaction in activeInteractionFilters" :key="interaction.id">联动：{{ interaction.label }} = {{ interaction.value }}</span>
          <el-button size="small" text @click="clearAllInteractionFilters">清除联动</el-button>
        </section>
        <div class="dashboard-preview-frame" :class="`is-${previewBreakpoint}`">
        <DashboardCanvas v-if="studioPreview" :widgets="previewWidgets" :columns="previewColumns" :editable="false">
          <template #default="{ widget }"><WidgetRenderer :widget="widget" :primary-kpi="visibleKpis[0]" :supporting-kpis="visibleKpis.slice(1)" :warnings="dashboardWarnings" :ranking="departmentRanking" :department="department" :updated-at="dashboardQueryLabel" interactive :get-widget-kpi="getWidgetKpi" :get-title="getWidgetTitle" :get-description="getWidgetDescription" :get-icon="getWidgetIcon" :get-chart-option="getWidgetChartOption" :is-chart-empty="isChartEmpty" :get-chart-aria-label="getWidgetChartAriaLabel" :get-table-columns="getWidgetTableColumns" :get-table-rows="getWidgetTableRows" :get-pie-drill-targets="getWidgetPieDrillTargets" :get-pie-drill-source="getWidgetPieDrillSource" @chart-click="handleWidgetChartClick" /></template>
        </DashboardCanvas>
        </div>
      </el-dialog>
    </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
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
import BindingInteractionInspector from '@/idmp/features/dashboard/components/BindingInteractionInspector.vue'
import DashboardFilterBar from '@/idmp/features/dashboard/components/DashboardFilterBar.vue'
import GlobalFilterDesigner from '@/idmp/features/dashboard/components/GlobalFilterDesigner.vue'
import { initialFilterValues } from '@/idmp/features/dashboard/filterEngine.js'
import { dashboardFilterCatalog, deriveDependentFilterOptions, normalizeDependentFilterValues } from '@/idmp/features/dashboard/queryAdapter.js'
import { provide } from 'vue'
import { compareDashboardGridMembership } from '@/idmp/features/dashboard/gridMembership.js'
import { createWidgetBindingDatasets } from '@/idmp/features/dashboard/fieldCatalog.js'
import { buildIndicatorAnalysisRouteQuery } from '@/idmp/features/dashboard/analysisNavigation.js'
import { IDMP_CHART_COLORS } from '@/idmp/charts/theme'
import { fetchDashboardBootstrap } from '@/idmp/api/modules/analysisDashboard'
import { fetchMortalityReadonlyChain } from '@/idmp/api/modules/mortality'
import { fetchIndicatorAnalysis, fetchIndicators, fetchIndicatorVersionList } from '@/idmp/api/modules/indicators'
import { dashboardTrend, dashboardWarnings as mockDashboardWarnings } from '@/idmp/data/demo'
import { mockDashboardDepartmentRanking, mockIndicatorDataSources } from '@/idmp/features/dashboard/mockData'
import { applyMortalityReadonlyChain } from '@/idmp/features/dashboard/mortalityAdapter'
import {
  DASHBOARD_CODE,
  DASHBOARD_DESIGN_WIDTH,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  widgetTypeOptions
} from '@/idmp/features/dashboard/constants'
import { LOCAL_SCENE_DASHBOARDS, findLocalScene, shouldConfirmDashboardSceneSwitch } from '@/idmp/features/dashboard/sceneRegistry.js'
import { dashboardSceneCode, designerImmersive } from '@/idmp/layout/shellState.js'
import { createQualitySafetyDemoSchema } from '@/idmp/features/dashboard/acceptanceExample.js'
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
  updateDashboardWidget,
  clonePersistableValue
} from '@/idmp/features/dashboard/schema'
import { DASHBOARD_RECOVERY_STATUS, persistDashboardSchema, recoverDashboardSchema } from '@/idmp/features/dashboard/persistence'
import { DASHBOARD_UNSAVED_MESSAGE, handleDashboardBeforeUnload, shouldProtectDashboardNavigation } from '@/idmp/features/dashboard/navigationProtection'
import { getWidgetGridConstraints, legacyPixelLayoutToGrid } from '@/idmp/features/dashboard/gridLayout'
import { clearWidgetSelection, nextWidgetSelection, alignSelectedLayout, distributeSelectedLayout } from '@/idmp/features/dashboard/layoutOperations.js'
import { dashboardBreakpointForWidth, deriveResponsiveLayout, responsiveColumns } from '@/idmp/features/dashboard/responsiveLayout.js'
import { gridWidthToPercentage, percentageToGridWidth, validatePreciseLayout } from '@/idmp/features/dashboard/preciseLayout.js'
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
  createPublishedIndicatorSources,
  getVisualizationTitle,
  normalizeDashboardDrillTarget,
  resolveDashboardChartDrillTarget
} from '@/idmp/features/dashboard/visualization'

import '@/idmp/features/dashboard/dashboard-v2.css'
const studioPreview = ref(false)
const previewBreakpoint = ref('desktop')
const librarySearch = ref('')
const localLayoutTemplates = ref([])
const layoutTemplates = computed(() => [...BUILT_IN_LAYOUT_TEMPLATES, ...localLayoutTemplates.value])
const libraryItems = [
  { type: 'kpi', name: 'KPI 指标卡', hint: '指标 · 单值与目标', icon: '◫' },
  { type: 'line', name: '趋势折线', hint: '趋势 · 时间序列', icon: '⌁' },
  { type: 'bar', name: '比较柱状', hint: '比较 · 分类对比', icon: '▥' },
  { type: 'pie', name: '构成环形', hint: '构成 · 占比分析', icon: '◉' },
  { type: 'table', name: '数据表格', hint: '明细 · 分组数值', icon: '▤' },
  { type: 'gauge', name: '仪表盘', hint: '单值 · 进度展示', icon: '◌' },
  { type: 'radar', name: '雷达图', hint: '多维 · 对比分析', icon: '◇' },
  { type: 'funnel', name: '漏斗图', hint: '阶段 · 转化分析', icon: '▽' },
  { type: 'scatter', name: '散点图', hint: '双度量 · 分布', icon: '⠿' },
  { type: 'heatmap', name: '热力图', hint: '维度 · 数值矩阵', icon: '▦' }
]
const filteredLibrary = computed(() => libraryItems.filter(item => (item.name + item.hint).includes(librarySearch.value.trim())))
function handleStudioCommand(command) {
  if (command === 'reset') resetDashboardLayout()
  if (command === 'exit') exitDashboardEdit()
}
const router = useRouter()
const isDev = import.meta.env.DEV
const activeSceneCode = dashboardSceneCode
const loadedSceneCode = ref('performance')
const activeScene = computed(() => findLocalScene(activeSceneCode.value) || LOCAL_SCENE_DASHBOARDS[0])
const activeDashboardStorageKey = computed(() => getDashboardSchemaStorageKey(activeScene.value.dashboardId))
const canRestoreQualitySafetyDemo = computed(() => canRestoreQualitySafetyDemoEntry({ isEditing: isEditing.value, isDemoRuntime: isDemoRuntime(), sceneCode: activeScene.value.sceneCode }))
const periodOptions = [
  { label: '全部期间', value: '' },
  { label: '2025 年 12 月', value: '2025-12' }
]
const departmentOptions = [{ label: '全院', value: '' }]
const period = ref('2025-12')
const department = ref('')
const designerCanvasRef = ref()
const viewerCanvasRef = ref()
const isEditing = ref(false)
const selectedWidgetIds = ref([])
const primarySelectedWidgetId = ref('')
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
const indicatorCatalogLoading = ref(false)
const indicatorHydrationRequests = new Map()
const dashboardStatus = ref('loading')
const dashboardLoadMessage = ref('')
const editingDashboardSchema = ref(null)
const dashboardHistory = ref([])
const dashboardHistoryIndex = ref(-1)
let restoringDashboardHistory = false
const designerWidgets = computed(() => editingDashboardSchema.value?.widgets || [])
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
const dashboardBackground = computed(() => (isEditing.value ? editingDashboardSchema.value : dashboardSchema.value)?.appearance?.background?.value || '#ffffff')
const viewerViewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const viewerBreakpoint = computed(() => dashboardBreakpointForWidth(viewerViewportWidth.value))
const viewerColumns = computed(() => responsiveColumns(viewerBreakpoint.value))
const viewerWidgets = computed(() => deriveResponsiveLayout(dashboardSchema.value?.widgets || [], viewerBreakpoint.value, dashboardSchema.value?.responsivePolicy))
const previewColumns = computed(() => responsiveColumns(previewBreakpoint.value))
const previewWidgets = computed(() => deriveResponsiveLayout(designerWidgets.value, previewBreakpoint.value, editingDashboardSchema.value?.responsivePolicy))
const dashboardRecovery = ref({ status: DASHBOARD_RECOVERY_STATUS.NO_SCHEMA, schema: null, raw: null, error: null })
const useSchemaViewer = computed(() => Boolean(dashboardSchema.value))
const dashboardDefinition = ref(null)
const dashboardQueryResult = ref(null)
// Only data dependencies invalidate this catalog; selection/hover does not aggregate rows.
const bindingDatasets = computed(() => new Map(availableIndicatorSources.value.map(source => [source.code, createWidgetBindingDatasets(source, { result: dashboardQueryResult.value, demo: dashboardStatus.value === 'demo', months: dashboardTrend.months })])))
function getBindingDatasets(widget) {
  const source = getWidgetSource(widget) || (!widget.sourceCode ? indicatorDataSources.value[0] : null)
  return bindingDatasets.value.get(source?.code) || []
}
provide('dashboardBindingDatasets', getBindingDatasets)
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
const filterCatalog = computed(() => dashboardFilterCatalog([...bindingDatasets.value.values()].flat()))
const filterDatasets = computed(() => [...bindingDatasets.value.values()].flat())
const dependentFilterOptions = computed(() => deriveDependentFilterOptions(filterDatasets.value, globalFilterDefinitions.value, filterRuntimeValues.value))
const filterOptionsById = computed(() => Object.fromEntries(dependentFilterOptions.value))
// Only definition/lifecycle changes reinitialize defaults. Runtime selections never
// write into canonical schema or trigger dirty/persistence.
watch(() => JSON.stringify(globalFilterDefinitions.value), () => { filterRuntimeValues.value = initialFilterValues(globalFilterDefinitions.value) }, { immediate: true })
watch([globalFilterDefinitions, filterRuntimeValues, dependentFilterOptions], () => {
  const normalized = normalizeDependentFilterValues(globalFilterDefinitions.value, filterRuntimeValues.value, dependentFilterOptions.value)
  if (JSON.stringify(normalized) !== JSON.stringify(filterRuntimeValues.value)) filterRuntimeValues.value = normalized
}, { deep: true })
watch(activeSceneCode, (nextSceneCode) => {
  if (nextSceneCode !== loadedSceneCode.value) void switchSceneDashboard()
})
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
function updateResponsivePolicy(tablet) { if (editingDashboardSchema.value) { editingDashboardSchema.value = { ...editingDashboardSchema.value, responsivePolicy: { tablet: tablet === 'single-column' ? 'single-column' : 'auto-two-column', mobile: 'single-column' } }; markDashboardDirty() } }
function updateDesignerQuery(query) {
  updateDesignerWidget(widget => ({ ...widget, config: { ...widget.config, query } }))
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
  const selectedPeriod = periodOptions.find((item) => item.value === period.value)?.label || '全部期间'
  return `查询条件：${selectedPeriod} · ${department.value ? department.value : '全院'}`
})
const dashboardWarnings = computed(() => dashboardStatus.value === 'ready' ? [] : mockDashboardWarnings)
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
const availableIndicatorSources = computed(() => {
  const sources = [...indicatorDataSources.value, ...catalogIndicatorSources.value]
  return [...new Map(sources.map(source => [source.code, source])).values()]
})

const dashboardSourceLabel = computed(() => ({
  loading: '正在加载正式数据',
  ready: '正式接口数据',
  empty: '正式接口数据（暂无结果）',
  demo: '演示数据',
  error: '正式接口数据加载失败'
}[dashboardStatus.value] || '正在加载正式数据'))

const activeDesignerWidget = computed(() => editingDashboardSchema.value?.widgets.find((widget) => widget.id === activeWidgetId.value))
const precisePixelSize = computed(() => { const widget = activeDesignerWidget.value; const geometry = designerCanvasRef.value?.getGridGeometry?.() || { cellWidth: 0, cellHeight: 60, margin: 0 }; const width = widget?.layout.w || 0, height = widget?.layout.h || 0; return { width: Math.round(width * geometry.cellWidth + Math.max(0, width - 1) * geometry.margin), height: Math.round(height * geometry.cellHeight + Math.max(0, height - 1) * geometry.margin) } })
const designerStyle = computed(() => activeDesignerWidget.value?.config?.style || {})
const saveStateLabel = computed(() => {
  if (saveState.value === 'error') return '保存失败'
  if (dashboardDirty.value) return '● 有未保存更改'
  return lastSavedAt.value ? `✓ 已保存 ${lastSavedAt.value}` : '✓ 已保存'
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
    change: '当前筛选条件无数据',
    target: '请调整筛选条件或重新添加',
    status: 'info'
  }
}

function getDashboardIndicatorSource(code) {
  return availableIndicatorSources.value.find((source) => source.code === code)
}

function getWidgetSource(widget) {
  if (typeof widget.kpiIndex === 'number') return indicatorDataSources.value[widget.kpiIndex]
  return getDashboardIndicatorSource(widget.sourceCode)
}

function goWidgetAnalysis(widget) {
  if (isEditing.value) return
  goIndicatorAnalysis(getWidgetKpi(widget))
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
  const value = params?.name
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
  if (!source) return
  try {
    source = await hydrateIndicatorSource(source)
  } catch (error) {
    ElMessage.warning(error?.message || '指标正式结果暂不可用，已按指标绑定添加空组件')
  }
  const type = addWidgetType.value
  let id
  do { id = `dashboard-widget-${Date.now()}-${++designerWidgetSequence}` } while (designerWidgets.value.some(widget => String(widget.id) === id))
  const metadata = type === 'kpi'
    ? { id, type: 'kpi', sourceCode: source.code, sourceName: source.name, visualType: 'kpi', config: {}, layout: getDefaultGridLayout('kpi') }
    : { id, type: 'chart', chartKind: type, title: getVisualizationTitle(source.name, type), sourceCode: source.code, sourceName: source.name, visualType: type, config: {}, layout: getDefaultGridLayout({ type: 'chart', chartKind: type }) }
  const normalizedMetadata = normalizeWidgetMetadata(metadata)
  const widget = { ...normalizedMetadata, layout: metadata.layout }
  editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: [...designerWidgets.value, widget] }
  markDashboardDirty()
  await nextTick()
  await designerCanvasRef.value?.registerWidget(id, { ...widget.layout, autoPosition: true })
  syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], false)
  activeWidgetId.value = id
  markDashboardDirty()
}

function deleteActiveWidget() {
  if (isEditing.value) {
    deleteSelectedDesignerWidgets()
  }
}
function clearAllInteractionFilters() { interactionFilterState.value = {} }
function advanceWidgetDrill(widget, dataset, value) {
  const hierarchy = widget.config?.interaction?.drill?.hierarchy || []
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
function updateDashboardBackground(value) {
  if (!editingDashboardSchema.value) return
  const allowed = ['#ffffff', 'linear-gradient(135deg,#f7fbfa,#eef5fb)', 'linear-gradient(135deg,#f9f6fc,#eef7f6)']
  const background = allowed.includes(value) ? value : '#ffffff'
  editingDashboardSchema.value = { ...editingDashboardSchema.value, appearance: { ...editingDashboardSchema.value.appearance, background: { type: background.startsWith('linear-gradient') ? 'gradient' : 'color', value: background } } }
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
  const selection = nextWidgetSelection({ ids: selectedWidgetIds.value, primaryId: primarySelectedWidgetId.value }, typeof detail === 'string' ? detail : detail.id, { additive: typeof detail === 'object' && detail.additive })
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
    await nextTick()
    designerCanvasRef.value?.applyLayout(result.widgets.map(widget => ({ id: widget.id, ...widget.layout })))
    syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], true)
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
  const result = validatePreciseLayout(designerWidgets.value, widget.id, { ...widget.layout, ...patch })
  if (!result.ok) { ElMessage.warning(result.reason); return }
  await runDashboardHistoryTransaction(async () => {
    editingDashboardSchema.value = { ...editingDashboardSchema.value, widgets: result.widgets }
    await nextTick()
    designerCanvasRef.value?.applyLayout(result.widgets.map(item => ({ id: item.id, ...item.layout })))
    syncDesignerLayout(designerCanvasRef.value?.getLayout() || [], true)
  })
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

function startDashboardEdit() {
  try {
    editingDashboardSchema.value = loadDesignerSchema()
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
    const key = activeDashboardStorageKey.value
    const normalizedPersisted = persistDashboardSchema(localStorage, key, schema)
    editingDashboardSchema.value = normalizedPersisted
    dashboardHistory.value = [clonePersistableValue(normalizedPersisted)]
    dashboardHistoryIndex.value = 0
    dashboardSchema.value = normalizedPersisted
    dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA, schema: normalizedPersisted, raw: JSON.stringify(normalizedPersisted), error: null }
    dashboardDirty.value = false
    saveState.value = 'saved'
    lastSavedAt.value = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
    ElMessage.success('看板布局已保存')
    return true
  } catch (error) {
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
  ElMessage.info(`Schema: ${schema?.id || activeScene.value.dashboardId}；组件 ${diagnostics.length} 个；Key: ${activeDashboardStorageKey.value}${lastSavedAt.value ? `；最近保存 ${lastSavedAt.value}` : ''}`)
}

async function resetDashboardLayout() {
  if (!isEditing.value) return
  editingDashboardSchema.value = createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
  await reconcileDesignerCanvasLayout()
  activeWidgetId.value = ''
  markDashboardDirty()
}

function loadDesignerSchema() {
  const recovery = recoverDashboardSchema(localStorage, activeDashboardStorageKey.value)
  dashboardRecovery.value = recovery
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    presentationMode.value = recovery.schema.presentation.defaultMode === 'presentation' ? 'presentation' : 'standard'
    return recovery.schema
  }
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.INVALID_SCHEMA) {
    return createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
  }

  const legacy = readLegacyDashboardLayout()
  const sourceLayout = legacy.length ? legacy : createDefaultLayout()
  const gridLayout = legacyPixelLayoutToGrid(sourceLayout, { designWidth: DASHBOARD_DESIGN_WIDTH, columns: 24, cellHeight: 60 })
  const migrated = migrateDashboardSchema({
    id: activeScene.value.dashboardId,
    name: `${activeScene.value.name}看板`,
    layout: { engine: 'gridstack', columns: 24, float: false },
    appearance: dashboardSchema.value?.appearance,
    presentation: dashboardSchema.value?.presentation,
    widgets: mergeWidgetMetadataAndLayout(sourceLayout, gridLayout)
  }, { fromVersion: 'legacy-pixel-layout', toVersion: 1 })
  if (legacy.length) dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.MIGRATED_LEGACY_SCHEMA, schema: migrated, raw: null, error: null }
  return migrated
}

function createEditingDashboardSchema(widgets) {
  return normalizeDashboardSchema({
    version: 1,
    id: activeScene.value.dashboardId,
    name: `${activeScene.value.name}看板`,
    dashboardType: activeScene.value.dashboardType,
    category: '本地场景看板',
    sceneCode: activeScene.value.sceneCode,
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

function loadDashboardSchema() {
  const recovery = recoverDashboardSchema(localStorage, activeDashboardStorageKey.value)
  dashboardRecovery.value = recovery
  if (recovery.status === DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA) {
    dashboardSchema.value = recovery.schema
    presentationMode.value = recovery.schema.presentation.defaultMode === 'presentation' ? 'presentation' : 'standard'
  } else {
    // Demo seeds are local and idempotent: production never receives demo rows.
    if (isDemoRuntime()) {
      const seed = activeScene.value.sceneCode === 'quality-safety'
        ? createQualitySafetyDemoSchema({ id: activeScene.value.dashboardId, sceneCode: activeScene.value.sceneCode })
        : createEditingDashboardSchema(createDesignerWidgets(createDefaultLayout()))
      dashboardSchema.value = persistDashboardSchema(localStorage, activeDashboardStorageKey.value, seed)
      dashboardRecovery.value = { status: DASHBOARD_RECOVERY_STATUS.VALID_CURRENT_SCHEMA, schema: dashboardSchema.value, raw: null, error: null }
    } else dashboardSchema.value = loadDesignerSchema()
  }
  loadedSceneCode.value = activeSceneCode.value
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

async function loadDashboard() {
  dashboardAbortController?.abort()
  const controller = new AbortController()
  dashboardAbortController = controller
  dashboardStatus.value = 'loading'
  dashboardLoadMessage.value = ''

  try {
    const { definition, queryResult } = await fetchDashboardBootstrap(
      DASHBOARD_CODE,
      buildDashboardQuery(),
      { signal: controller.signal }
    )
    if (controller.signal.aborted) return

    dashboardDefinition.value = definition
    dashboardQueryResult.value = queryResult
    indicatorDataSources.value = createDashboardSources(queryResult)
    selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
    dashboardStatus.value = indicatorDataSources.value.length ? 'ready' : 'empty'
  } catch (error) {
    if (controller.signal.aborted) return
    dashboardDefinition.value = null
    dashboardQueryResult.value = null
    if (isDemoRuntime()) applyDemoDashboard()
    else {
      indicatorDataSources.value = []
      dashboardStatus.value = 'error'
      dashboardLoadMessage.value = formatDashboardLoadError(error)
    }
  }
}

function formatDashboardLoadError(error) {
  const path = String(error?.path || `/analysis/dashboards/${DASHBOARD_CODE}`)
  const status = Number(error?.status)
  const statusLabel = Number.isFinite(status) && status > 0 ? `（HTTP ${status}）` : ''
  const message = String(error?.message || '').trim()
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
      code: indicatorCode || indicatorId || `dashboard-summary-${key}`,
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
    const [indicators, publishedVersions] = await Promise.all([
      fetchIndicators({ page: 1, size: 200 }),
      fetchIndicatorVersionList({ publicationStatus: 'PUBLISHED', page: 1, size: 200 })
    ])
    catalogIndicatorSources.value = createPublishedIndicatorSources(normalizeList(indicators), normalizeList(publishedVersions))
    if (!selectedDataSource.value) selectedDataCode.value = availableIndicatorSources.value[0]?.code || ''
  } catch {
    // Catalog availability must not replace the current dashboard data path.
  } finally {
    indicatorCatalogLoading.value = false
  }
}

async function hydrateIndicatorSource(source) {
  if (source?.origin !== 'indicator-catalog' || source.analysisLoaded) return source
  if (indicatorHydrationRequests.has(source.code)) return indicatorHydrationRequests.get(source.code)
  const request = fetchIndicatorAnalysis(source.analysisIndicatorId, {
    indicatorVersionId: source.analysisIndicatorVersionId,
    granularity: 'MONTHLY'
  }).then((payload) => {
    const hydrated = { ...applyIndicatorAnalysisToSource(source, payload), analysisLoaded: true }
    catalogIndicatorSources.value = catalogIndicatorSources.value.map(item => item.code === hydrated.code ? hydrated : item)
    return hydrated
  }).finally(() => indicatorHydrationRequests.delete(source.code))
  indicatorHydrationRequests.set(source.code, request)
  return request
}

function applyDemoDashboard() {
  indicatorDataSources.value = cloneDashboardSources(mockIndicatorDataSources)
  selectedDataCode.value = indicatorDataSources.value[0]?.code || ''
  dashboardStatus.value = 'demo'
  // Only explicit non-production/demo runtimes may enter this branch.
  dashboardLoadMessage.value = ''
  void loadMortalityReadonlyChain()
}
async function switchSceneDashboard() {
  // Scene registries are local-only. Switching reloads a distinct persisted schema
  // and clears all viewer-only state, never treating the scene value as a row filter.
  if (shouldConfirmDashboardSceneSwitch({ isEditing: isEditing.value, dirty: dashboardDirty.value })) {
    try {
      await ElMessageBox.confirm('切换场景前，请选择如何处理这些修改。关闭弹窗将继续编辑。', '当前看板有未保存的修改', { confirmButtonText: '保存并切换', cancelButtonText: '不保存并切换', distinguishCancelAndClose: true, closeOnClickModal: false })
      if (!(await saveDashboardSchema())) { activeSceneCode.value = loadedSceneCode.value; return }
    } catch (action) {
      if (action !== 'cancel') { activeSceneCode.value = loadedSceneCode.value; return }
    }
  }
  filterRuntimeValues.value = {}
  interactionFilterState.value = {}
  drillRuntimeState.value = {}
  selectedWidgetIds.value = []
  primarySelectedWidgetId.value = ''
  dashboardHistory.value = []
  dashboardHistoryIndex.value = -1
  dashboardDirty.value = false
  loadDashboardSchema()
  if (isEditing.value && dashboardSchema.value) {
    editingDashboardSchema.value = clonePersistableValue(dashboardSchema.value)
    dashboardHistory.value = [clonePersistableValue(editingDashboardSchema.value)]
    dashboardHistoryIndex.value = 0
    await reconcileDesignerCanvasLayout()
  }
}
function isDemoRuntime() {
  return import.meta.env.DEV || import.meta.env.MODE === 'test' || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dashboardDemo') === '1')
}
async function restoreQualitySafetyDemoLayout() {
  if (!canRestoreQualitySafetyDemo.value || !editingDashboardSchema.value) return
  try {
    await ElMessageBox.confirm('恢复演示布局将替换当前质量安全看板的组件、布局和筛选配置。是否继续？', '恢复演示布局', {
      confirmButtonText: '恢复演示布局', cancelButtonText: '取消', type: 'warning', closeOnClickModal: false
    })
  } catch { return }
  await runDashboardHistoryTransaction(async () => {
    const restored = createQualitySafetyDemoRestoreResult(createQualitySafetyDemoSchema({ id: activeScene.value.dashboardId, sceneCode: activeScene.value.sceneCode }))
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
const goIndicatorAnalysis = (indicator) => {
  if (isEditing.value) return
  const source = typeof indicator === 'object' && indicator ? indicator : getDashboardIndicatorSource(indicator)
  const query = buildIndicatorAnalysisRouteQuery(source || { code: indicator })
  if (!query || source?.analysisEnabled === false) return
  router.push({
    path: '/analysis',
    query
  })
}

watch([period, department], () => {
  loadDashboard()
})

function onDesignerGlobalKeydown(event) {
  if (!isEditing.value || !selectedWidgetIds.value.length || event.defaultPrevented) return
  const target = event.target
  if (target instanceof Element && (target.matches('input, textarea, select') || target.isContentEditable || target.closest('[contenteditable="true"]'))) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelectedDesignerWidgets()
  }
}

onMounted(() => {
  refreshLocalLayoutTemplates()
  loadDashboardSchema()
  loadDashboard()
  void loadPublishedIndicatorCatalog()
  document.addEventListener('fullscreenchange', syncFullscreenState)
  window.addEventListener('beforeunload', onDashboardBeforeUnload)
  window.addEventListener('keydown', onDesignerGlobalKeydown)
  window.addEventListener('resize', syncViewerViewport, { passive: true })
})

onBeforeUnmount(() => {
  designerImmersive.value = false
  dashboardAbortController?.abort()
  document.removeEventListener('fullscreenchange', syncFullscreenState)
  window.removeEventListener('beforeunload', onDashboardBeforeUnload)
  window.removeEventListener('keydown', onDesignerGlobalKeydown)
  window.removeEventListener('resize', syncViewerViewport)
})
</script>

<style scoped lang="scss">
.dashboard-filter {
  width: 122px;
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

.dashboard-schema-viewer { max-width:100%; margin-top:16px; overflow-x:hidden; }
.dashboard-schema-canvas { min-height:680px; max-width:100%; }
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
.dashboard-page.is-presentation-mode { position: fixed; inset: 0; z-index: 3000; min-height: 100vh; overflow: auto; padding: 24px; background: var(--dashboard-background, #ffffff); color: var(--idmp-text-primary, #101828); }
.dashboard-page.is-presentation-mode :deep(.page-heading) { display: none; }
.dashboard-page.is-presentation-mode .dashboard-schema-viewer { margin: 0; }
.dashboard-page.is-presentation-mode .dashboard-schema-canvas { min-height: calc(100vh - 48px); }
.dashboard-demo-source { padding:8px; border:1px solid #b8e6d6; border-radius:6px; background:#effbf6; color:#087443 !important; font-size:11px !important; }
.dashboard-interaction-summary { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:8px 0; padding:7px 10px; border:1px solid var(--idmp-interactive-subtle,#e7f1f8); border-radius:6px; background:var(--idmp-interactive-subtle,#e7f1f8); color:var(--idmp-interactive,#1261a6); font-size:12px; }
.dashboard-interaction-summary span { padding-right:8px; border-right:1px solid color-mix(in srgb, var(--idmp-interactive,#1261a6) 18%, transparent); }
.dashboard-preview-breakpoints { display:flex; gap:8px; margin-bottom:12px; }
.dashboard-preview-frame { margin:auto; transition:width .2s ease; overflow:hidden; border:1px solid #d0d5dd; border-radius:8px; background:var(--dashboard-background, #fff); }
.dashboard-preview-frame.is-desktop { width:1440px; max-width:100%; }.dashboard-preview-frame.is-tablet { width:834px; max-width:100%; }.dashboard-preview-frame.is-mobile { width:375px; max-width:100%; }
.studio-scene-switcher { width:170px; }
.dashboard-page:fullscreen { width: 100vw; height: 100vh; }

@media (max-width: 1199px) { .dashboard-schema-canvas { min-height:560px; } }
@media (max-width: 767px) { .dashboard-page { min-width:0; overflow-x:hidden; } .dashboard-schema-viewer { margin-top:8px; } .dashboard-schema-canvas { min-height:0; } .dashboard-schema-viewer :deep(.dashboard-widget__chrome) { min-width:0; } }

.studio-template-library { margin-top: 18px; padding-top: 14px; border-top: 1px solid #eaecf0; }
.studio-template-library__heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.studio-template-library h3 { margin:0; font-size:13px; }.studio-template-library p { margin:5px 0 10px; color:#667085; font-size:12px; line-height:1.45; }
.studio-template-library button { border:0; background:transparent; color:#1570ef; cursor:pointer; font-size:12px; padding:2px; }
.studio-template-item { display:grid; grid-template-columns:72px minmax(0,1fr); gap:8px; padding:8px 0; border-top:1px solid #f2f4f7; }
.studio-template-item strong,.studio-template-item small { display:block; }.studio-template-item strong { font-size:12px; color:#344054; }.studio-template-item small { margin-top:3px; color:#667085; font-size:11px; line-height:1.35; }
.studio-template-preview { display:grid; grid-template-columns:repeat(24,1fr); grid-template-rows:repeat(12,4px); gap:1px; min-height:48px; padding:2px; border:1px solid #eaecf0; border-radius:4px; background:#f8fafc; overflow:hidden; }
.studio-template-preview i { min-width:0; min-height:0; border-radius:1px; background:#98a2b3; opacity:.72; }.studio-template-item__actions { grid-column:2; display:flex; gap:10px; }.studio-template-item__actions .is-danger { color:#b42318; }
</style>
