import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window','document','Element','HTMLElement','SVGElement','Node','Document','Text','Comment']) globalThis[key]=dom.window[key]
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator})
const vue=await import('vue')
const {mount}=await import('@vue/test-utils')
const model=await import('../src/idmp/features/dashboard/globalFilterDesignerModel.js')
const {filterValueLabel}=await import('../src/idmp/features/dashboard/filterOptions.js')
const {validateFilterDefinitions}=await import('../src/idmp/features/dashboard/filterEngine.js')
const {descriptor}=parse(await readFile(new URL('../src/idmp/features/dashboard/components/GlobalFilterDesigner.vue',import.meta.url),'utf8'))
const compiled=compileScript(descriptor,{id:'logical-filters',inlineTemplate:true}).content
const bindings=[...compiled.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"];?/g)].flatMap(([,names])=>names.split(',').map(name=>{
  const [original,local=original]=name.trim().split(/\s+as\s+/);return `const ${local}=vue.${original};`
})).join('\n')
const deps={...model,filterValueLabel,validateFilterDefinitions,FilterValue:{template:'<div />'}}
const Designer=Function('vue','deps',`const {${Object.keys(deps).join(',')}}=deps;${bindings}\n${compiled.replace(/^import .*$/gm,'').replace('export default','return')}`)(vue,deps)
const catalog=[{id:'organization:department',label:'组织 / 科室',dataType:'string',semanticType:'dimension',filterTypes:['multi-select'],preferredFilterType:'multi-select'},
  {id:'path:100:DIAGNOSIS',label:'诊疗路径 / 病种',dataType:'string',semanticType:'dimension',filterTypes:['multi-select'],preferredFilterType:'multi-select'}]

test('配置页只显示逻辑维度名称，添加科室不要求物理字段',async()=>{
  const wrapper=mount(Designer,{props:{catalog}})
  assert.deepEqual(wrapper.findAll('[data-testid="global-filter-field"] option').map(x=>x.text()),['选择下钻维度','组织 / 科室','诊疗路径 / 病种'])
  assert.ok(!wrapper.text().includes('organization:'))
  await wrapper.get('[data-testid="global-filter-field"]').setValue('organization:department')
  await wrapper.get('[data-testid="global-filter-add"]').trigger('click')
  const definition=wrapper.emitted('change')[0][0][0]
  assert.equal(definition.field,'organization:department')
  assert.equal(definition.label,'科室')
  wrapper.unmount()
})

test('已保存的逻辑维度保持选中，作用范围包含未在图表横轴使用科室的指标卡',()=>{
  const definition=model.createGlobalFilterDefinition(catalog[0])
  const wrapper=mount(Designer,{props:{catalog,definitions:[definition],widgets:[{id:'死亡率',title:'住院死亡率'}],compatibleWidgetIdsByFilter:{[definition.id]:['死亡率']}}})
  assert.equal(wrapper.get(`[data-testid="global-filter-field-${definition.id}"]`).element.value,'organization:department')
  assert.ok(wrapper.text().includes('所有兼容组件（1）'))
  assert.ok(!wrapper.text().includes('字段：'))
  wrapper.unmount()
})

test('删除唯一声明维度的组件后提示重新选择，不显示具体字段编码',()=>{
  const definition=model.createGlobalFilterDefinition(catalog[0])
  const wrapper=mount(Designer,{props:{catalog:[],definitions:[definition]}})
  assert.ok(wrapper.text().includes('维度不可用，请重新选择'))
  assert.ok(wrapper.text().includes('当前没有组件配置此下钻维度'))
  assert.ok(!wrapper.text().includes('organization:department'))
  wrapper.unmount()
})
