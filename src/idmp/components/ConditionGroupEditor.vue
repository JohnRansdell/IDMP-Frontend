<template>
  <div class="rule-group" :class="{ nested: depth > 0 }">
    <div class="rule-group__head"><span>业务筛选条件</span><small>支持试算周期与已发布值集的标准业务值</small></div>
    <div v-if="!node.children?.length" class="rule-empty"><strong>尚未添加筛选条件</strong><span>可选择日期字段绑定试算周期，或选择已绑定值集的维度字段按标准值筛选。</span><el-button type="primary" plain size="small" @click="addPredicate">添加筛选条件</el-button></div>
    <div v-for="(child,index) in node.children" :key="child.id" class="rule-row" draggable="true" @dragstart="dragStart(index)" @dragover.prevent @drop="drop(index)">
      <span class="drag-handle">⋮⋮</span>
      <template v-if="child.nodeType === 'PREDICATE'"><SemanticFieldSelector :model-value="child.fieldCode" :fields="fields" @update:model-value="fieldChanged(child, $event)" /><el-select :model-value="child.operator" :disabled="!child.fieldCode" placeholder="选择判断方式" @update:model-value="operatorChanged(child, $event)"><el-option v-for="option in operatorOptions(child)" :key="option.value" :label="option.label" :value="option.value" /></el-select><RuleValueEditor :field="fieldByCodeLocal(child.fieldCode)" :operator="child.operator" :parameter="child.parameter" :model-value="child.operator === 'IN_VALUE_SET' ? child.itemCodes : child.value" @update:model-value="valueChanged(child, $event)" /><el-button link type="danger" @click="removeChild(index)">删除</el-button></template>
      <template v-else-if="child.nodeType === 'NOT'"><span class="not-label">不满足</span><ConditionGroupEditor :node="child.child" :fields="fields" :depth="depth+1" @remove="removeChild(index)" @update="emitUpdate" /></template>
      <ConditionGroupEditor v-else :node="child" :fields="fields" :depth="depth+1" @remove="removeChild(index)" @update="emitUpdate" />
    </div>
    <div class="rule-actions"><el-button link type="primary" @click="addPredicate">+ 添加筛选条件</el-button></div>
  </div>
</template>
<script setup>
import SemanticFieldSelector from './SemanticFieldSelector.vue'
import RuleValueEditor from './RuleValueEditor.vue'
import { fieldByCode } from '@/idmp/utils/semanticField'
defineOptions({ name: 'ConditionGroupEditor' })
const props=defineProps({ node:{type:Object,required:true}, fields:{type:Array,default:()=>[]}, depth:{type:Number,default:0} }); const emit=defineEmits(['update','remove']); let movingIndex=-1
function fieldByCodeLocal(code){return fieldByCode(props.fields,code)}
  function operatorOptions(condition){const field=fieldByCodeLocal(condition.fieldCode);const kind=field?.kind;const options=[];if(kind==='DATETIME') options.push({value:'BETWEEN',label:'在试算周期内'});if(kind==='VALUE_SET' || (kind==='CODE' && field?.options?.length)) options.push({value:'IN_VALUE_SET',label:'属于标准值'});return options}
  function fieldChanged(condition,value){condition.fieldCode=value||'';condition.operator=operatorOptions(condition)[0]?.value||'';condition.parameter=condition.operator==='BETWEEN'?'period':undefined;condition.value='';condition.itemCodes=[];emitUpdate()}
  function operatorChanged(condition,value){condition.operator=value||'';condition.parameter=condition.operator==='BETWEEN'?'period':undefined;condition.value='';condition.itemCodes=[];emitUpdate()}
  function valueChanged(condition,value){if(condition.operator==='IN_VALUE_SET') condition.itemCodes=Array.isArray(value)?value:(value?[value]:[]);else condition.value=value;emitUpdate()}
  function emitUpdate(){emit('update')} function newPredicate(){return{id:`p-${Date.now()}-${Math.random()}`,nodeType:'PREDICATE',fieldCode:'',operator:'',value:'',itemCodes:[]}} function addPredicate(){props.node.children.push(newPredicate());emitUpdate()} function addGroup(){props.node.children.push({id:`g-${Date.now()}`,nodeType:'AND',children:[newPredicate()]});emitUpdate()} function addNot(){props.node.children.push({id:`n-${Date.now()}`,nodeType:'NOT',child:{id:`g-${Date.now()}`,nodeType:'AND',children:[newPredicate()]}});emitUpdate()} function removeChild(index){props.node.children.splice(index,1);emitUpdate()} function dragStart(index){movingIndex=index} function drop(index){if(movingIndex<0||movingIndex===index)return;const [item]=props.node.children.splice(movingIndex,1);props.node.children.splice(index,0,item);movingIndex=-1;emitUpdate()}
</script>
<style scoped>.rule-group{padding:14px;background:#fff;border:1px solid #e5e8ef;border-radius:8px}.rule-group.nested{margin-top:8px;background:#fafcff}.rule-group__head,.rule-row,.rule-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rule-group__head{justify-content:space-between;margin-bottom:10px;color:#262626;font-weight:600}.rule-row{padding:10px 8px;margin-top:8px;background:#f7f8fa;border-radius:6px}.rule-row :deep(.el-select),.rule-row :deep(.el-input){width:180px}.rule-row :deep(.el-date-editor){width:300px}.rule-empty{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;padding:16px;background:#f7fbff;border:1px dashed #91caff;border-radius:6px;color:#595959}.rule-empty strong{color:#1677c2}.rule-empty span{flex:1;min-width:240px;line-height:22px}.drag-handle{color:#8c8c8c;cursor:grab}.not-label{color:#d46b08;font-weight:600}.rule-actions{margin-top:10px}</style>
