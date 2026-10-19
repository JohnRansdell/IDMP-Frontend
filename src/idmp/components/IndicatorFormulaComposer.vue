<template>
  <div class="formula-composer">
    <aside class="composer-palette" aria-label="公式素材">
      <h3>计算模式</h3>
      <div class="mode-palette">
        <el-tooltip v-for="mode in formulaBlockModes" :key="mode.code" :content="mode.reason || mode.expression" :visible="activeModeHint === mode.code" :enterable="false" :show-after="0" :hide-after="0" transition="formula-tooltip-instant" popper-class="formula-mode-tooltip" placement="top">
          <span class="mode-trigger" @mouseenter="showModeHint(mode.code)" @mouseleave="hideModeHint(mode.code)" @focusin="showModeHint(mode.code)" @focusout="hideModeHint(mode.code)" @pointerdown.capture="hideModeHint()" @keydown.esc.stop="hideModeHint(mode.code)">
            <button class="mode-piece" type="button" :disabled="disabled || mode.disabled" :draggable="false" :data-mode="mode.code" :aria-label="`添加${mode.name}`" @pointerdown="startPointerDrag($event, { kind: 'mode', code: mode.code })" @dragstart="startDrag($event, { kind: 'mode', code: mode.code })" @dragend="finishDrag" @click="clickItem({ kind: 'mode', code: mode.code })">
              <el-icon><Rank /></el-icon><span>{{ mode.name }}</span>
            </button>
          </span>
        </el-tooltip>
      </div>
      <button type="button" class="constant-piece" :disabled="disabled" :draggable="false" aria-label="添加数字常量" @pointerdown="startPointerDrag($event, { kind: 'constant' })" @dragstart="startDrag($event, { kind: 'constant' })" @dragend="finishDrag" @click="clickItem({ kind: 'constant' })"><el-icon><Plus /></el-icon>数字常量</button>
    </aside>

    <div class="composer-workspace">
      <div class="composer-toolbar">
        <nav class="composer-breadcrumb" aria-label="公式层级">
          <button v-for="(crumb, index) in breadcrumbs" :key="JSON.stringify(crumb.path)" type="button" :aria-current="index === breadcrumbs.length - 1 ? 'location' : undefined" @click="openBlock(crumb.path)">{{ crumb.label }}<span v-if="index < breadcrumbs.length - 1" aria-hidden="true">/</span></button>
        </nav>
        <div class="history-actions">
          <el-tooltip content="撤销"><el-button text :icon="RefreshLeft" :disabled="disabled || !undoStack.length" aria-label="撤销公式修改" @click="undo" /></el-tooltip>
          <el-tooltip content="重做"><el-button text :icon="RefreshRight" :disabled="disabled || !redoStack.length" aria-label="重做公式修改" @click="redo" /></el-tooltip>
        </div>
      </div>
      <div ref="canvasElement" class="composer-canvas" :class="{ 'is-dragging': dragging }" aria-label="当前计算模式" @dragover.prevent="dropTarget = selectedPath ? keyOf(selectedPath) : ''" @drop.prevent.stop="dropItem($event)">
        <div class="active-block-heading">
          <h3>{{ descriptor.name }}</h3>
          <el-tooltip content="清空当前计算模式"><el-button text :icon="Delete" :disabled="disabled || isEmptyFormulaSlot(current)" aria-label="清空当前计算模式" @click="clearCurrent" /></el-tooltip>
        </div>
        <div v-if="isEmptyFormulaSlot(current)" class="formula-dropzone root-dropzone" :class="{ 'is-selected': samePath(selectedPath, activePath), 'is-drop-target': dropTarget === keyOf(activePath) }" :data-drop-path="keyOf(activePath)" role="button" tabindex="0" aria-label="空公式槽位" @click="selectSlot(activePath)" @keydown.enter.prevent="selectSlot(activePath)" @keydown.space.prevent="selectSlot(activePath)" @dragover.prevent.stop="dropTarget = keyOf(activePath)" @dragleave="leaveDrop($event)" @drop.prevent.stop="dropItem($event, activePath)"><el-icon><Plus /></el-icon><span>计算模式 / 因子</span></div>

        <template v-else-if="descriptor.slots.length">
          <div v-if="descriptor.operation" class="block-settings"><label>运算符</label><el-select :model-value="current.operator" :disabled="disabled" aria-label="当前模式运算符" @update:model-value="changeOperator"><el-option v-for="[code, name] in arithmeticOperators" :key="code" :value="code" :label="`${name}（${symbols[code]}）`" /></el-select></div>
          <div v-if="['FUNCTION', 'COALESCE'].includes(current.nodeType)" class="block-settings">
            <label>函数</label><el-select :model-value="current.functionCode || 'COALESCE'" :disabled="disabled" aria-label="公式函数" @update:model-value="changeFunction"><el-option v-for="[code, name] in formulaFunctions" :key="code" :value="code" :label="name" /></el-select>
          </div>
          <div v-if="current.nodeType === 'FUNCTION' && current.functionCode === 'ROUND'" class="block-settings">
            <label>小数位数</label><el-input-number :model-value="current.scale" :disabled="disabled" :min="0" :max="10" :precision="0" aria-label="舍入小数位数" @update:model-value="patchCurrent({ scale: $event })" />
            <label>舍入方式</label><el-select :model-value="current.roundingMode || 'HALF_UP'" :disabled="disabled" aria-label="舍入方式" @update:model-value="patchCurrent({ roundingMode: $event })"><el-option v-for="[code, name] in roundingModes" :key="code" :value="code" :label="name" /></el-select>
          </div>
          <div v-if="current.functionCode === 'PERCENTILE'" class="block-settings"><label>分位点</label><el-input :model-value="current.percentile" :disabled="disabled" aria-label="分位点" @update:model-value="patchCurrent({ percentile: $event })" /></div>
          <div v-if="descriptor.comparison" class="block-settings"><label>比较方式</label><el-select :model-value="current.comparator" :disabled="disabled" aria-label="比较方式" @update:model-value="patchCurrent({ comparator: $event })"><el-option v-for="[code, name] in comparisonOperators" :key="code" :value="code" :label="name" /></el-select></div>
          <div class="composer-slots">
            <div v-for="slot in descriptor.slots" :key="keyOf(slot.path)" class="composer-slot">
              <div class="slot-heading"><label>{{ slot.label }}</label><el-tooltip :content="canRemoveSumSlot ? '移除参与项' : '清空槽位'"><el-button text :icon="Close" :disabled="disabled || (!canRemoveSumSlot && isEmptyFormulaSlot(slot.node))" :aria-label="`${canRemoveSumSlot ? '移除' : '清空'}${slot.label}`" @click="clearSlot(slot)" /></el-tooltip></div>
              <div class="formula-dropzone" :class="{ 'is-empty': isEmptyFormulaSlot(slot.node), 'is-selected': samePath(selectedPath, absolute(slot.path)), 'is-drop-target': dropTarget === keyOf(absolute(slot.path)), 'is-mode': isBlock(slot.node) }" :data-drop-path="keyOf(absolute(slot.path))" role="button" tabindex="0" :data-slot-label="slot.label" :aria-label="`${slot.label}槽位`" :aria-pressed="samePath(selectedPath, absolute(slot.path))" @click="activateSlot(slot)" @keydown.enter.prevent="activateSlot(slot)" @keydown.space.prevent="activateSlot(slot)" @dragover.prevent.stop="dropTarget = keyOf(absolute(slot.path))" @dragleave="leaveDrop($event)" @drop.prevent.stop="dropItem($event, absolute(slot.path))">
                <el-icon><component :is="isBlock(slot.node) ? Operation : (isEmptyFormulaSlot(slot.node) ? Plus : Tickets)" /></el-icon>
                <span v-if="isEmptyFormulaSlot(slot.node)" class="slot-empty-label">计算模式 / 因子</span>
                <span v-else class="slot-piece"><strong>{{ pieceLabel(slot.node) }}</strong><small v-if="isBlock(slot.node)">{{ arithmeticFormulaText(slot.node, factors) }}</small></span>
                <el-icon v-if="isBlock(slot.node)" class="open-block"><ArrowRight /></el-icon>
              </div>
              <el-switch v-if="slot.node?.nodeType === 'CONST' && slot.node.typeDescriptor?.valueType === 'BOOLEAN'" :model-value="slot.node.value" :disabled="disabled" :aria-label="`${slot.label}布尔常量`" @update:model-value="patchAt(absolute(slot.path), { value: $event })" />
              <el-input v-else-if="slot.node?.nodeType === 'CONST'" :model-value="String(slot.node.value ?? '')" :disabled="disabled" class="slot-number" :aria-label="`${slot.label}数字常量`" @update:model-value="patchAt(absolute(slot.path), { value: $event })" />
            </div>
          </div>
          <el-button v-if="descriptor.additive" text type="primary" :icon="Plus" :disabled="disabled" @click="appendSumSlot">添加参与项</el-button>
          <el-button v-if="descriptor.variableArguments" text type="primary" :icon="Plus" :disabled="disabled" @click="appendArgument">添加参数</el-button>
          <div v-if="descriptor.divisionPath" class="block-settings division-settings"><label>分母为 0</label><el-select :model-value="formulaAt(current, descriptor.divisionPath).zeroDenominatorPolicy || 'RETURN_NULL'" :disabled="disabled" aria-label="该节点分母为零策略" @update:model-value="patchAt(absolute(descriptor.divisionPath), { zeroDenominatorPolicy: $event })"><el-option label="返回空值" value="RETURN_NULL" /><el-option label="返回 0" value="RETURN_ZERO" /><el-option label="报错" value="ERROR" /></el-select></div>
          <div v-if="descriptor.multiplierPath" class="block-settings"><label>百分比乘数</label><el-input :model-value="String(formulaAt(current, descriptor.multiplierPath).value)" :disabled="disabled" aria-label="百分比乘数" @change="patchAt(absolute(descriptor.multiplierPath), { value: $event })" /></div>
        </template>
        <template v-else>
          <div class="scalar-piece">{{ pieceLabel(current) }}</div>
          <el-switch v-if="current.nodeType === 'CONST' && current.typeDescriptor?.valueType === 'BOOLEAN'" :model-value="current.value" :disabled="disabled" aria-label="布尔常量" @update:model-value="patchCurrent({ value: $event })" />
          <el-input v-else-if="current.nodeType === 'CONST'" :model-value="String(current.value ?? '')" :disabled="disabled" aria-label="数字常量" @update:model-value="patchCurrent({ value: $event })" />
          <el-button v-else text type="primary" :disabled="disabled" @click="selectSlot(activePath)">更换因子</el-button>
        </template>
        <div v-if="selectedConstant && selectedConstant.typeDescriptor?.valueType !== 'BOOLEAN'" class="block-settings constant-settings">
          <label>常量量纲</label><el-input :model-value="selectedConstant.typeDescriptor?.dimension || 'ONE'" :disabled="disabled" aria-label="常量量纲" @update:model-value="patchConstantType('dimension', $event)" />
          <label>常量单位</label><el-input :model-value="selectedConstant.typeDescriptor?.unit || 'ONE'" :disabled="disabled" aria-label="常量单位" @update:model-value="patchConstantType('unit', $event)" />
        </div>
        <div v-if="selectedLabel" class="selection-status">当前选中：{{ selectedLabel }}</div>
        <el-alert v-if="localError" :title="localError" type="warning" :closable="false" />
      </div>
    </div>

    <section class="composer-factor-section" aria-label="因子素材">
      <div class="factor-section-heading">
        <h3><el-icon><Box /></el-icon>可用因子 <small>{{ filteredFactors.length }}</small></h3>
        <el-input v-model="search" :prefix-icon="Search" placeholder="搜索因子名称或编码" clearable aria-label="搜索公式因子" />
      </div>
      <div class="composer-factors" aria-label="可拖入因子" v-loading="loading">
        <button v-for="factor in filteredFactors" :key="factor.versionId" type="button" class="factor-piece" :disabled="disabled" :draggable="false" :data-factor-version="String(factor.versionId)" :aria-label="`添加因子 ${factor.name}`" @pointerdown="startPointerDrag($event, { kind: 'factor', versionId: String(factor.versionId) })" @dragstart="startDrag($event, { kind: 'factor', versionId: String(factor.versionId) })" @dragend="finishDrag" @click="clickItem({ kind: 'factor', versionId: String(factor.versionId) })">
          <el-icon><Tickets /></el-icon>
          <span class="factor-details"><strong>{{ factor.name }}</strong><small>{{ factor.code || factor.versionId }} | {{ getAggregationLabel(factor.aggregation) }} | {{ factor.domain || '-' }}</small></span>
          <span class="factor-add">添加</span>
        </button>
        <el-empty v-if="!loading && !filteredFactors.length" :image-size="40" :description="search ? '没有匹配的因子' : '暂无可选因子'" />
      </div>
    </section>

    <Teleport to="body"><div v-if="pointerPosition && dragging" class="formula-drag-preview" :style="{ left: `${pointerPosition.x + 12}px`, top: `${pointerPosition.y + 12}px` }">{{ dragLabel }}</div></Teleport>
    <el-dialog v-model="replaceVisible" title="替换已配置的子公式" width="min(440px, 92vw)" :close-on-click-modal="false" :append-to-body="true">
      <p>当前槽位包含子公式，替换后可通过撤销恢复。</p>
      <template #footer><el-button @click="cancelReplacement">取消</el-button><el-button type="primary" :disabled="disabled" @click="confirmReplacement">替换</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Box, Close, Delete, Operation, Plus, Rank, RefreshLeft, RefreshRight, Search, Tickets } from '@element-plus/icons-vue'
import { getAggregationLabel } from '@/idmp/utils/dslBuilder'
import { arithmeticOperators, arithmeticFormulaText, cloneFormula, createArithmeticNode, roundingModes, formulaFunctions, comparisonOperators } from '@/idmp/features/indicator/arithmeticFormula'
import { formulaBlockModes, emptyFormulaSlot, isEmptyFormulaSlot, createFormulaBlock, createFunctionBlock, formulaAt, replaceFormulaAt, describeFormulaBlock, insertFormulaBlock, removeSumSlot } from '@/idmp/features/indicator/formulaComposer'

const props = defineProps({ modelValue: Object, factors: { type: Array, default: () => [] }, disabled: Boolean, loading: Boolean })
const emit = defineEmits(['update:modelValue'])
const root = ref(cloneFormula(props.modelValue || emptyFormulaSlot()))
const activePath = ref([])
const selectedPath = ref(null)
const search = ref('')
const dragging = ref(null)
const activeModeHint = ref(null)
const dropTarget = ref(null)
const canvasElement = ref(null)
const pointerPosition = ref(null)
let pointerStart = null
let ignoreClickUntil = 0
const undoStack = ref([])
const redoStack = ref([])
const localError = ref('')
const replaceVisible = ref(false)
let pendingReplacement = null
const symbols = { ADD: '+', SUB: '−', MUL: '×', DIV: '÷' }
const keyOf = path => JSON.stringify(path)
const samePath = (first, second) => first !== null && keyOf(first) === keyOf(second)
const absolute = path => [...activePath.value, ...path]
const current = computed(() => formulaAt(root.value, activePath.value))
const constantPath = computed(() => current.value?.nodeType === 'CONST' ? activePath.value : selectedPath.value)
const selectedConstant = computed(() => {
  const node = constantPath.value && formulaAt(root.value, constantPath.value)
  return node?.nodeType === 'CONST' ? node : null
})
const descriptor = computed(() => describeFormulaBlock(current.value))
const canRemoveSumSlot = computed(() => descriptor.value.additive && descriptor.value.slots.length > 2 || descriptor.value.variableArguments && descriptor.value.slots.length > 1)
const isBlock = node => ['BINARY', 'FUNCTION', 'COMPARE', 'CONDITION', 'COALESCE', 'UNARY'].includes(node?.nodeType)
const dragLabel = computed(() => dragging.value?.kind === 'mode' ? formulaBlockModes.find(mode => mode.code === dragging.value.code)?.name : (dragging.value?.kind === 'constant' ? '数字常量' : props.factors.find(factor => String(factor.versionId) === dragging.value?.versionId)?.name))
const filteredFactors = computed(() => props.factors.filter(factor => `${factor.name} ${factor.code || ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
const selectedLabel = computed(() => selectedPath.value === null ? '' : (samePath(selectedPath.value, activePath.value) ? descriptor.value.name : descriptor.value.slots.find(slot => samePath(absolute(slot.path), selectedPath.value))?.label || ''))
const breadcrumbs = computed(() => {
  const result = [{ path: [], label: '完整公式' }]
  let path = []
  while (path.length < activePath.value.length) {
    const block = describeFormulaBlock(formulaAt(root.value, path))
    const next = block.slots.find(slot => [...path, ...slot.path].every((key, index) => activePath.value[index] === key))
    if (!next) break
    path = [...path, ...next.path]
    result.push({ path, label: `${next.label} · ${describeFormulaBlock(formulaAt(root.value, path)).name}` })
  }
  return result
})

watch(() => props.modelValue, value => {
  if (JSON.stringify(value || emptyFormulaSlot()) === JSON.stringify(root.value)) return
  root.value = cloneFormula(value || emptyFormulaSlot())
  activePath.value = []
  selectedPath.value = null
  undoStack.value = []
  redoStack.value = []
  cancelReplacement()
})
watch(() => props.disabled, value => { if (value) { finishDrag(); cancelReplacement() } })
onBeforeUnmount(finishDrag)

function snapshot() { return { root: cloneFormula(root.value), activePath: [...activePath.value], selectedPath: selectedPath.value && [...selectedPath.value] } }
function commit(next) {
  if (props.disabled) return
  undoStack.value = [...undoStack.value.slice(-49), snapshot()]
  redoStack.value = []
  root.value = next
  localError.value = ''
  emit('update:modelValue', next)
}
function restore(state) {
  root.value = cloneFormula(state.root)
  activePath.value = [...state.activePath]
  selectedPath.value = state.selectedPath && [...state.selectedPath]
  cancelReplacement()
  emit('update:modelValue', root.value)
}
function undo() { if (!props.disabled && undoStack.value.length) { redoStack.value.push(snapshot()); restore(undoStack.value.pop()) } }
function redo() { if (!props.disabled && redoStack.value.length) { undoStack.value.push(snapshot()); restore(redoStack.value.pop()) } }
function selectSlot(path) { selectedPath.value = [...path]; localError.value = '' }
function openBlock(path) {
  activePath.value = [...path]
  const node = formulaAt(root.value, path)
  const firstEmpty = describeFormulaBlock(node).slots.find(slot => isEmptyFormulaSlot(slot.node))
  selectedPath.value = firstEmpty ? [...path, ...firstEmpty.path] : (isEmptyFormulaSlot(node) ? [...path] : null)
  localError.value = ''
}
function activateSlot(slot) {
  if (isBlock(slot.node)) openBlock(absolute(slot.path))
  else selectSlot(absolute(slot.path))
}
function pieceLabel(node) {
  if (node?.nodeType === 'CONST') return `常量 ${node.value}`
  if (node?.nodeType === 'FACTOR_REF') return props.factors.find(factor => String(factor.versionId) === String(node.factorVersionId))?.name || `因子 ${node.factorVersionId}`
  return describeFormulaBlock(node).name
}
function patchAt(path, changes) { if (!props.disabled) commit(replaceFormulaAt(root.value, path, { ...formulaAt(root.value, path), ...changes })) }
function patchCurrent(changes) { patchAt(activePath.value, changes) }
function patchConstantType(key, value) { patchAt(constantPath.value, { typeDescriptor: { ...selectedConstant.value.typeDescriptor, [key]: value } }) }
function changeOperator(operator) {
  const next = { ...current.value, operator }
  if (operator === 'DIV') next.zeroDenominatorPolicy ||= 'RETURN_NULL'
  else delete next.zeroDenominatorPolicy
  if (!props.disabled) { commit(replaceFormulaAt(root.value, activePath.value, next)); openBlock(activePath.value) }
}
function changeFunction(code) {
  if (props.disabled || code === (current.value.functionCode || 'COALESCE')) return
  const next = createFunctionBlock(code)
  const old = current.value.arguments || []
  if (describeFormulaBlock(next).variableArguments && old.length > next.arguments.length) next.arguments = old.map(() => emptyFormulaSlot())
  next.arguments = next.arguments.map((slot, index) => old[index] || slot)
  if (old.slice(next.arguments.length).some(node => !isEmptyFormulaSlot(node))) {
    pendingReplacement = { path: [...activePath.value], next }
    replaceVisible.value = true
    return
  }
  patchCurrent(next)
  openBlock(activePath.value)
}
function appendArgument() { patchCurrent({ arguments: [...current.value.arguments, emptyFormulaSlot()] }); openBlock(activePath.value) }
function resolveItem(item) {
  if (item?.kind === 'mode') return createFormulaBlock(item.code)
  if (item?.kind === 'constant') return createArithmeticNode('CONST')
  if (item?.kind === 'factor' && props.factors.some(f => String(f.versionId) === String(item.versionId))) return { nodeType: 'FACTOR_REF', factorVersionId: String(item.versionId) }
  throw new Error('拖入的公式素材无效，请重新选择')
}
function insertItem(item, target) {
  if (props.disabled) return
  const path = target ?? selectedPath.value ?? (isEmptyFormulaSlot(current.value) ? activePath.value : null)
  if (path === null) { localError.value = '请先选中一个槽位'; return }
  try {
    const next = resolveItem(item)
    if (path.length > 32) throw new Error('公式嵌套层级过深')
    if (isBlock(formulaAt(root.value, path)) && !isBlock(next)) {
      pendingReplacement = { path: [...path], next }
      replaceVisible.value = true
      return
    }
    commit(isBlock(next) ? insertFormulaBlock(root.value, path, next) : replaceFormulaAt(root.value, path, next))
    if (isBlock(next)) openBlock(path)
    else { selectedPath.value = null; openBlock(activePath.value) }
  } catch (error) { localError.value = error.message }
}
function showModeHint(code) { if (!props.disabled && !pointerStart && !dragging.value) activeModeHint.value = code }
function hideModeHint(code) { if (!code || activeModeHint.value === code) activeModeHint.value = null }
function clickItem(item) { hideModeHint(); if (Date.now() >= ignoreClickUntil) insertItem(item) }
function cancelReplacement() { pendingReplacement = null; replaceVisible.value = false }
function confirmReplacement() {
  if (props.disabled || !pendingReplacement) return
  const { path, next } = pendingReplacement
  commit(replaceFormulaAt(root.value, path, next))
  cancelReplacement()
  openBlock(activePath.value)
}
function clearCurrent() { if (!props.disabled) { commit(replaceFormulaAt(root.value, activePath.value, emptyFormulaSlot())); openBlock(activePath.value) } }
function clearSlot(slot) {
  if (props.disabled) return
  if (descriptor.value.variableArguments && current.value.arguments.length > 1) {
    patchCurrent({ arguments: current.value.arguments.filter((_, index) => index !== slot.path[1]) })
  } else commit(descriptor.value.additive ? removeSumSlot(root.value, activePath.value, slot.path) : replaceFormulaAt(root.value, absolute(slot.path), emptyFormulaSlot()))
  openBlock(activePath.value)
}
function appendSumSlot() {
  if (props.disabled) return
  commit(replaceFormulaAt(root.value, activePath.value, { nodeType: 'BINARY', operator: 'ADD', left: current.value, right: emptyFormulaSlot() }))
  selectedPath.value = absolute(['right'])
}
function startDrag(event, item) {
  hideModeHint()
  if (props.disabled) { event.preventDefault(); return }
  dragging.value = item
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-idmp-formula-item', JSON.stringify(item))
}
function startPointerDrag(event, item) {
  if (props.disabled || event.button !== 0) return
  finishDrag()
  pointerStart = { item, x: event.clientX, y: event.clientY, id: event.pointerId }
  document.addEventListener('pointermove', movePointerDrag, { passive: false })
  document.addEventListener('pointerup', endPointerDrag)
  document.addEventListener('pointercancel', finishDrag)
  document.addEventListener('keydown', cancelDragOnEscape)
  window.addEventListener('blur', finishDrag)
}
function pointerTarget(x, y) {
  const element = document.elementFromPoint(x, y)
  if (!element || !canvasElement.value?.contains(element)) return undefined
  const zone = element.closest('[data-drop-path]')
  return zone ? JSON.parse(zone.getAttribute('data-drop-path')) : selectedPath.value ?? (isEmptyFormulaSlot(current.value) ? activePath.value : undefined)
}
function movePointerDrag(event) {
  if (!pointerStart || event.pointerId !== pointerStart.id) return
  if (!dragging.value && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 6) return
  event.preventDefault()
  dragging.value = pointerStart.item
  pointerPosition.value = { x: event.clientX, y: event.clientY }
  const target = pointerTarget(event.clientX, event.clientY)
  dropTarget.value = target ? keyOf(target) : null
}
function endPointerDrag(event) {
  if (!pointerStart || event.pointerId !== pointerStart.id) return
  if (dragging.value) {
    const target = pointerTarget(event.clientX, event.clientY)
    if (target) insertItem(pointerStart.item, target)
    ignoreClickUntil = Date.now() + 250
  }
  finishDrag()
}
function dropItem(event, path) {
  if (props.disabled) return
  try {
    const item = dragging.value || JSON.parse(event.dataTransfer.getData('application/x-idmp-formula-item'))
    insertItem(item, path)
  } catch { localError.value = '请从公式素材区拖入计算模式或因子' }
  finishDrag()
}
function cancelDragOnEscape(event) { if (event.key === 'Escape') finishDrag() }
function finishDrag() {
  hideModeHint()
  dragging.value = null
  dropTarget.value = null
  pointerPosition.value = null
  pointerStart = null
  document.removeEventListener('pointermove', movePointerDrag)
  document.removeEventListener('pointerup', endPointerDrag)
  document.removeEventListener('pointercancel', finishDrag)
  document.removeEventListener('keydown', cancelDragOnEscape)
  window.removeEventListener('blur', finishDrag)
}
function leaveDrop(event) { if (!event.currentTarget.contains(event.relatedTarget)) dropTarget.value = null }
</script>

<style scoped>
.formula-composer { display: grid; grid-template-columns: minmax(140px, 200px) minmax(0, 1fr); gap: 16px; min-width: 0; }
.composer-palette { min-width: 0; padding-right: 16px; border-right: 1px solid var(--idmp-border-soft); }
h3 { margin: 0 0 12px; color: var(--idmp-text-primary); font-size: 13px; font-weight: 600; }
h3 small { margin-left: 6px; font-weight: 400; color: var(--idmp-text-helper); }
.mode-palette { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; margin-bottom: 20px; }
.mode-trigger { display: block; min-width: 0; }
.mode-piece, .factor-piece, .constant-piece { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--idmp-border-soft); border-radius: 4px; background: var(--idmp-layer-01); color: var(--idmp-text-secondary); font: inherit; font-size: 12px; text-align: left; cursor: grab; }
.mode-piece:hover:not(:disabled), .factor-piece:hover:not(:disabled), .constant-piece:hover:not(:disabled) { border-color: var(--idmp-interactive); background: var(--idmp-interactive-subtle); }
.mode-piece, .factor-piece, .constant-piece { user-select: none; touch-action: none; }
.formula-drag-preview { position: fixed; z-index: 4000; max-width: 220px; padding: 8px 12px; border: 1px solid var(--idmp-interactive); border-radius: 4px; background: var(--idmp-layer-01); color: var(--idmp-text-primary); box-shadow: 0 3px 12px #0002; font-size: 12px; overflow-wrap: anywhere; pointer-events: none; }
button:focus-visible, .formula-dropzone:focus-visible { outline: 2px solid var(--idmp-interactive); outline-offset: 2px; }
button:disabled { cursor: not-allowed; opacity: .5; }
.mode-piece .el-icon { color: var(--idmp-text-helper); flex: 0 0 14px; }
.composer-factor-section { grid-column: 1 / -1; min-width: 0; padding-top: 16px; border-top: 1px solid var(--idmp-border-soft); }
.factor-section-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.factor-section-heading h3 { display: flex; align-items: center; gap: 6px; margin: 0; }
.factor-section-heading .el-input { width: 280px; max-width: 100%; }
.composer-factors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 8px; max-height: 220px; overflow-y: auto; padding: 2px; }
.composer-factors > .el-empty { grid-column: 1 / -1; }
.factor-piece { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-self: start; height: 100%; min-height: 56px; gap: 8px; padding: 8px 10px; border: 1px solid var(--idmp-border-soft); border-radius: 6px; background: var(--idmp-field); }
.factor-piece:active { cursor: grabbing; }
.factor-details { min-width: 0; }
.factor-piece strong, .factor-piece small { display: block; overflow-wrap: anywhere; }
.factor-piece strong { font-size: 12px; line-height: 1.5; font-weight: 600; color: var(--idmp-text-secondary); }
.factor-piece small { margin-top: 3px; font-size: 10px; line-height: 1.5; color: var(--idmp-text-disabled); }
.factor-piece > .el-icon { color: var(--idmp-interactive); font-size: 17px; }
.factor-add { color: var(--idmp-interactive); font-size: 12px; white-space: nowrap; }
.constant-piece { justify-content: center; }
.composer-workspace { min-width: 0; }
.composer-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
.composer-breadcrumb { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
.composer-breadcrumb button { padding: 4px 0; border: 0; background: transparent; color: var(--idmp-interactive); font: inherit; font-size: 12px; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.composer-breadcrumb button[aria-current] { color: var(--idmp-text-secondary); }
.composer-breadcrumb button span { margin-left: 6px; color: var(--idmp-text-helper); }
.history-actions { display: flex; flex: 0 0 auto; }
.history-actions .el-button { width: 28px; height: 28px; padding: 4px; margin: 0; }
.composer-canvas { min-height: 290px; }
.active-block-heading { display: flex; justify-content: space-between; align-items: center; min-height: 32px; margin-bottom: 8px; gap: 8px; }
.active-block-heading h3 { margin: 0; font-size: 14px; }
.composer-slots { display: grid; gap: 14px; }
.composer-slot { min-width: 0; }
.slot-heading { display: flex; align-items: center; justify-content: space-between; height: 28px; font-size: 12px; color: var(--idmp-text-helper); }
.slot-heading .el-button { height: 24px; width: 24px; padding: 3px; }
.formula-dropzone { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 74px; box-sizing: border-box; padding: 12px; border: 1px solid var(--idmp-support-success); border-radius: 6px; background: var(--idmp-support-success-bg); cursor: pointer; }
.formula-dropzone.is-empty, .root-dropzone { border: 1px dashed var(--idmp-interactive); background: var(--idmp-interactive-subtle); color: var(--idmp-text-helper); }
.formula-dropzone.is-selected, .formula-dropzone.is-drop-target { outline: 2px solid var(--idmp-interactive); outline-offset: 2px; }
.formula-dropzone.is-mode { background: var(--idmp-support-info-bg); border-color: var(--idmp-support-info); }
.root-dropzone { justify-content: center; min-height: 200px; flex-wrap: wrap; }
.formula-dropzone > .el-icon { flex: 0 0 16px; color: var(--idmp-interactive); }
.slot-piece { flex: 1; min-width: 0; }
.slot-piece strong { display: block; font-size: 13px; font-weight: 500; color: var(--idmp-text-primary); overflow-wrap: anywhere; }
.slot-piece small { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 6px; font-size: 11px; line-height: 1.6; color: var(--idmp-text-helper); overflow-wrap: anywhere; }
.slot-empty-label, .scalar-piece { font-size: 12px; overflow-wrap: anywhere; }
.slot-number { width: 180px; max-width: 100%; margin-top: 8px; }
.block-settings { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; font-size: 12px; color: var(--idmp-text-helper); }
.block-settings .el-select, .block-settings .el-input-number, .block-settings .el-input { width: 140px; max-width: 100%; }
.division-settings { margin-top: 18px; }
.selection-status { padding: 12px 0; font-size: 12px; color: var(--idmp-interactive); }
.scalar-piece { padding: 12px 0; }
@media (max-width: 560px) {
  .formula-composer { grid-template-columns: minmax(0, 1fr); }
  .composer-palette { border-right: 0; border-bottom: 1px solid var(--idmp-border-soft); padding: 0 0 16px; }
  .mode-palette { display: flex; overflow-x: auto; padding: 2px; }
  .mode-trigger { flex: 0 0 132px; }
  .composer-factors { grid-template-columns: minmax(0, 1fr); max-height: 180px; }
  .composer-canvas { min-height: 240px; }
}
</style>
