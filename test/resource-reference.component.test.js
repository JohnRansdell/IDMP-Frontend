import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {JSDOM} from 'jsdom'
import {compileScript,parse} from '@vue/compiler-sfc'
import {referenceOptions} from '../src/idmp/utils/resourceReference.js'
import {toUserMessage} from '../src/idmp/utils/userMessage.js'
const dom=new JSDOM('<html><body></body></html>')
for(const key of ['window','document','HTMLElement','SVGElement','Element','Node'])globalThis[key]=dom.window[key]
const vue=await import('vue'),{mount,flushPromises}=await import('@vue/test-utils')
const source=await readFile(new URL('../src/idmp/components/ResourceReferenceSelect.vue',import.meta.url),'utf8')
const {descriptor}=parse(source.replace('</script>','defineExpose({load,options,error,unresolved})\n</script>'))
const compiled=compileScript(descriptor,{id:'resource-select',inlineTemplate:true}).content
const bindings=[...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([,names])=>names.split(',').map(name=>{const [original,local=original]=name.trim().split(/\s+as\s+/);return `const ${local}=vue.${original};`})).join('\n')
const code=compiled.replace(/^import .*$/gm,'').replace('export default','return')
const Pass=vue.defineComponent({setup:(_,{slots})=>()=>vue.h('div',slots.default?.())})
const Picker=vue.defineComponent({props:['options'],emits:['refresh'],setup:(props,{emit})=>()=>vue.h('button',{onClick:()=>emit('refresh')},props.options?.map(item=>item.indicatorName).join('、') || '选择指标')})
function create(props,overrides={}){
 const deps={IndicatorVersionPicker:Picker,referenceOptions,toUserMessage,fetchAllIndicatorVersions:async()=>[],fetchAllScenarios:async()=>[],fetchScenarioVersions:async()=>[],fetchWarningRules:async()=>[],fetchAllPages:async loader=>loader(),...overrides}
 const component=Function('vue','deps',`const {${Object.keys(deps).join(',')}}=deps;${bindings}\n${code}`)(vue,deps)
 return mount(component,{props,global:{components:{ElSelect:Pass,ElOption:Pass,ElButton:Pass}}})
}
test('reference catalog loads on demand once and keeps IDs out of option labels',async()=>{
 let calls=0
 const wrapper=create({kind:'INDICATOR_VERSION',modelValue:''},{fetchAllIndicatorVersions:async()=>{calls++;return [{id:'123456789012345678',indicatorName:'手术占比',versionNo:2}]}})
 await flushPromises();assert.equal(calls,0)
 await wrapper.get('button').trigger('click');await flushPromises();await wrapper.vm.load();assert.equal(calls,1)
 assert.equal(wrapper.get('button').text(),'手术占比')
 assert.deepEqual(wrapper.vm.options,[{value:'123456789012345678',label:'手术占比 · 版本 2'}]);wrapper.unmount()
})
test('failed reference lookup preserves selection and exposes a retriable business error',async()=>{
 let fail=true
 const wrapper=create({kind:'RULE',modelValue:'90'},{fetchWarningRules:async()=>{if(fail)throw new Error('Bad Gateway');return [{id:'90',name:'死亡率预警'}]}})
 await flushPromises();assert.match(wrapper.vm.error,/服务暂时不可用/);assert.deepEqual(wrapper.vm.unresolved,['90'])
 fail=false;await wrapper.vm.load();assert.equal(wrapper.vm.error,'');assert.deepEqual(wrapper.vm.unresolved,[]);assert.equal(wrapper.props('modelValue'),'90');wrapper.unmount()
})
test('scenario selector displays only published versions and supports multiple selections',async()=>{
 const wrapper=create({kind:'SCENARIO_VERSION',multiple:true,modelValue:['20']},{fetchAllScenarios:async()=>[{id:'10',name:'医疗质量'}],fetchScenarioVersions:async()=>[{id:'20',versionNo:2,status:'PUBLISHED'},{id:'21',versionNo:3,status:'DRAFT'}]})
 await flushPromises();assert.deepEqual(wrapper.vm.options,[{value:'20',label:'医疗质量 · 版本 2'}]);assert.deepEqual(wrapper.vm.unresolved,[]);wrapper.unmount()
})
