<template><div><ConditionGroupEditor :node="modelValue" :fields="fields" @update="$emit('update')" /></div></template>
<script setup>import ConditionGroupEditor from './ConditionGroupEditor.vue'; defineProps({modelValue:{type:Object,required:true},fields:{type:Array,default:()=>[]}}); defineEmits(['update'])</script>
<style scoped>.builder-tip{margin-bottom:10px;color:#8c8c8c;font-size:13px}</style>
