<template>
  <div class="idmp-page editor-page">
    <PageHeader eyebrow="指标管理 / 新建指标" title="编辑指标">
      <template #actions>
        <el-button @click="validateAndConfirm('保存草稿')">保存草稿</el-button>
        <el-button type="primary" @click="validateAndConfirm('提交审核')">提交审核</el-button>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="idmp-tabs editor-tabs">
      <el-tab-pane label="基本信息" name="basic">
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
                  <el-select v-model="form.categoryMain">
                    <el-option label="医疗质量" value="医疗质量" />
                    <el-option label="运营效率" value="运营效率" />
                  </el-select>
                  <el-icon><Right /></el-icon>
                  <el-select v-model="form.categorySub">
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
        </section>
      </el-tab-pane>

      <el-tab-pane label="计算公式" name="formula">
        <section class="surface-card formula-card">
          <h2>计算模式</h2>
          <div class="formula-modes">
            <el-button
              v-for="mode in formulaModes"
              :key="mode.name"
              :type="formulaMode === mode.name ? 'primary' : 'default'"
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
                    aria-label="移除分子因子"
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
                    aria-label="移除分母因子"
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
                <el-input v-model="factorSearch" :prefix-icon="Search" placeholder="搜索因子..." clearable />
                <el-select v-model="factorCategory">
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
              <el-button :icon="Plus" @click="demoResult('新建因子')">新建因子</el-button>
              <el-button :icon="Upload" @click="unavailable">导入因子</el-button>
            </div>
          </div>

          <div class="formula-preview">
            <div>
              <span>公式预览</span>
              <strong>指标值 = {{ formulaPreview }}</strong>
            </div>
            <div class="validation-state" :class="{ 'is-invalid': !formulaValid }">
              <el-icon><CircleCheckFilled v-if="formulaValid" /><CircleCloseFilled v-else /></el-icon>
              <span>{{ formulaValid ? '校验通过：所有因子已注册，数据类型匹配，量纲一致' : '校验未通过：请补充分子和分母因子' }}</span>
            </div>
            <div class="formula-settings">
              <label>分母为零策略</label>
              <el-select v-model="zeroStrategy">
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

      <el-tab-pane label="排除条件" name="exclusion">
        <section class="surface-card exclusion-card">
          <div class="section-title">
            <h2>默认排除条件（全局生效，可被场景级配置覆盖）</h2>
          </div>
          <div class="logic-row">
            <span>排除满足以下</span>
            <el-select v-model="exclusionLogic">
              <el-option label="任意" value="任意" />
              <el-option label="全部" value="全部" />
            </el-select>
            <span>条件的记录：</span>
          </div>
          <div class="condition-list">
            <div v-for="(condition, index) in conditions" :key="condition.id" class="condition-row">
              <span class="condition-index">条件{{ index + 1 }}</span>
              <el-select v-model="condition.field" @change="resetCondition(condition)">
                <el-option label="出院方式" value="出院方式" />
                <el-option label="住院天数" value="住院天数" />
                <el-option label="手术级别" value="手术级别" />
                <el-option label="年龄" value="年龄" />
              </el-select>
              <el-select v-model="condition.operator">
                <el-option v-for="item in operatorOptions(condition.field)" :key="item" :label="item" :value="item" />
              </el-select>
              <el-select v-if="condition.field === '出院方式'" v-model="condition.value" class="condition-value">
                <el-option label="放弃治疗自动出院" value="放弃治疗自动出院" />
                <el-option label="死亡" value="死亡" />
                <el-option label="转院" value="转院" />
              </el-select>
              <el-select v-else-if="condition.field === '手术级别'" v-model="condition.value" class="condition-value">
                <el-option label="一级" value="一级" />
                <el-option label="二级" value="二级" />
                <el-option label="三级" value="三级" />
                <el-option label="四级" value="四级" />
              </el-select>
              <el-input-number v-else v-model="condition.value" :min="0" :controls="false" class="condition-value" />
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

      <el-tab-pane label="场景关联" name="scene">
        <section class="surface-card table-card">
          <div class="section-title">
            <h2>关联应用场景</h2>
            <el-button type="primary" :icon="Plus" @click="demoResult('添加场景')">添加场景</el-button>
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
                  <button type="button" class="action-link" @click="confirmAction(`配置“${row.name}”覆盖`)">配置覆盖</button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>
      </el-tab-pane>

      <el-tab-pane label="政策依据" name="policy">
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
    </el-tabs>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
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
import {
  editorFactors,
  editorPolicyRows,
  editorSceneRows
} from '@/idmp/data/demo'

const route = useRoute()
const isNew = computed(() => route.params.id === 'new')
const activeTab = ref('basic')
const formRef = ref()
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

const validateAndConfirm = async action => {
  try {
    await formRef.value?.validate()
    if (!formulaValid.value) {
      activeTab.value = 'formula'
      ElMessage.warning('请先完成计算公式配置')
      return
    }
    await ElMessageBox.confirm(`确认${action}当前指标？`, action, {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: action === '提交审核' ? 'warning' : 'info'
    })
    ElMessage.success(`${action}成功（演示）`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      activeTab.value = 'basic'
      ElMessage.warning('请完善必填信息后再操作')
    }
  }
}

const unavailable = () => ElMessage.info('演示版暂不可用')
const demoResult = action => ElMessage.success(`${action}为演示操作`)
const confirmAction = text => {
  ElMessageBox.confirm(`${text}？`, '操作确认', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'info'
  }).then(() => ElMessage.success('配置已确认（演示）')).catch(() => {})
}
</script>

<style scoped lang="scss">
.editor-tabs {
  :deep(.el-tabs__content) {
    overflow: visible;
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
    color: #a8abb2;
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
    color: #262626;
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
  border: 1px solid #bae7ff;
  border-radius: 6px;
  background: #e6f7ff;
  color: #1677b8;
  gap: 8px;
}

.formula-section-title {
  padding-top: 2px;
}

.formula-builder {
  padding: 20px;
  border: 1px solid #e8ebf0;
  border-radius: 8px;
  background: #fafbfc;
}

.factor-slot {
  min-height: 92px;
  padding: 14px 16px;
  border: 2px solid #b7eb8f;
  border-radius: 8px;
  background: #f6ffed;
  transition: border-color 0.18s ease;

  &.is-empty {
    border-style: dashed;
    border-color: #91d5ff;
    background: #f7fcff;
  }
}

.slot-label {
  margin-bottom: 8px;
  color: #8c8c8c;
  font-size: 12px;

  span {
    margin-left: 12px;
    color: #bfbfbf;
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
  border: 1px solid #91d5ff;
  border-radius: 4px;
  background: #e6f7ff;
  gap: 8px;

  span {
    color: #1677b8;
  }

  small {
    color: #8c8c8c;
  }

  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: #fa8c16;
    cursor: pointer;
    font-size: 12px;
  }
}

.slot-placeholder {
  color: #bfbfbf;
}

.formula-operator {
  padding: 8px 0;
  color: #8c8c8c;
  text-align: center;
  font-size: 20px;

  &.multiplier {
    padding-bottom: 0;
    text-align: left;
  }

  strong {
    color: #262626;
    font-size: 16px;
  }
}

.factor-library {
  margin-top: 16px;
  border: 1px solid #e8ebf0;
  border-radius: 8px;
  background: #fff;
}

.factor-library__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
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
  border: 1px solid #e8ebf0;
  border-radius: 6px;
  background: #fafbfc;
  cursor: grab;
  gap: 10px;

  &:active { cursor: grabbing; }
  &:hover { border-color: #91d5ff; }
  &.is-dragging {
    border-color: #1890ff;
    background: #e6f7ff;
  }

  > .el-icon {
    color: #1890ff;
    font-size: 19px;
  }

  strong,
  small {
    display: block;
  }

  strong {
    margin-bottom: 4px;
    color: #434343;
    font-size: 13px;
  }

  small {
    color: #9a9ca0;
    font-size: 11px;
  }
}

.factor-library__footer {
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
}

.formula-preview {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #d9f7be;
  border-radius: 8px;
  background: #fcfff8;

  > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 14px;

    span { color: #8c8c8c; }
    strong { color: #262626; }
  }
}

.validation-state {
  display: flex;
  align-items: center;
  margin: 12px 0;
  color: #52c41a;
  gap: 7px;

  &.is-invalid { color: #f5222d; }
}

.formula-settings {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding-top: 12px;
  border-top: 1px solid #edf1e8;
  color: #595959;
  gap: 10px;

  label {
    color: #8c8c8c;
  }

  .el-select {
    width: 140px;
    margin-right: 16px;
  }

  i {
    width: 1px;
    height: 14px;
    background: #d9d9d9;
  }
}

.exclusion-card {
  padding: 22px;
}

.logic-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  color: #595959;
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
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafafa;
  gap: 10px;
}

.condition-index {
  color: #595959;
  font-weight: 600;
}

.condition-value {
  width: 100%;
}

.condition-unit {
  color: #8c8c8c;
}

.readable-rule {
  margin-top: 18px;
  padding: 14px 16px;
  border-left: 3px solid #1890ff;
  border-radius: 3px;
  background: #f7fbff;

  span {
    display: block;
    margin-bottom: 7px;
    color: #8c8c8c;
  }

  strong {
    color: #434343;
    font-weight: 500;
  }
}

.exclusion-tip {
  display: flex;
  align-items: center;
  margin-top: 14px;
  color: #8c8c8c;
  gap: 7px;

  .el-icon {
    color: #1890ff;
  }
}

.highlight-warning {
  color: #fa8c16;
}

@media (max-width: 1400px) {
  .form-card {
    padding-right: 20px;
    padding-left: 20px;
  }

  .condition-row {
    grid-template-columns: 62px 150px 120px minmax(170px, 1fr) 26px 90px;
  }
}
</style>
