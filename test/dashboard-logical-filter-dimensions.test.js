import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardDimensionCatalog, dashboardFilterSourceWidgets, normalizeGlobalFilterDimensions } from '../src/idmp/features/dashboard/filterDimensions.js'
import { resolveGlobalFilterField } from '../src/idmp/features/dashboard/departmentFilters.js'
import { buildRemoteWidgetQuery, buildRemoteFilterOptionQuery, canQueryBoundDashboardWidget } from '../src/idmp/features/dashboard/remoteQuery.js'
import { dashboardFieldsToFrontend, schemaToDashboardPayload, dashboardDetailToSchema } from '../src/idmp/api/adapters/dashboard.js'
import { createGlobalFilterDefinition, applyGlobalFilterScope } from '../src/idmp/features/dashboard/globalFilterDesignerModel.js'
import { resolveCompatibleGlobalFilterWidgetIds } from '../src/idmp/features/dashboard/globalFilterCompatibility.js'
import { createPlatformDashboardRuntime } from '../src/idmp/features/dashboard/viewerRuntime.js'

const field = (code, id = 'organization:department', name = '组织 / 科室') => ({ code, name: '科室', role: 'DIMENSION', dataType: 'STRING', filterable: true, filterDimensions: [{id, name}] })
const dataset = fields => ({ id:'backend', fields:dashboardFieldsToFrontend(fields), rows:[] })
const widget = id => ({ id, type:'kpi', config:{dataBinding:{dataset:'backend',dimensions:[],measures:[{field:'value',aggregation:'direct'}],series:[],sort:[]}} })
const fields = [field('出院科室'),field('主治医生','organization:doctor','组织 / 医生')]
const definitions = [createGlobalFilterDefinition(dashboardDimensionCatalog([dataset(fields)])[0])]
const context = {definitions,values:{[definitions[0].id]:['12','17']},periodStart:'2026-03-01',periodEnd:'2026-04-01'}

test('已绑定指标版本的组件刷新不依赖全局指标目录加载',()=>{
  const bound={...widget('死亡率'),sourceCode:'死亡率',config:{analysisIndicatorVersionId:'123'}}
  assert.equal(canQueryBoundDashboardWidget(bound),true)
  assert.equal(canQueryBoundDashboardWidget({...bound,type:'warnings'}),false)
  assert.equal(canQueryBoundDashboardWidget({...bound,type:'text'}),false)
  assert.equal(canQueryBoundDashboardWidget({...bound,config:{}}),false)
  assert.equal(canQueryBoundDashboardWidget({...bound,config:{}},{origin:'dashboard-data-source'}),true)
})

test('不同物理字段的组织维度归并，自定义路径同名维度按版本分别列出',()=>{
  const catalog=dashboardDimensionCatalog([dataset(fields),dataset([field('OUT_DEPT_CODE'),field('疾病','path:101:DISEASE','疾病路径 / 病种')]),
    dataset([field('入院科室'),field('诊断','path:102:DISEASE','疾病路径 / 病种')])])
  assert.deepEqual(catalog.map(x=>x.id),['organization:department','organization:doctor','path:101:DISEASE','path:102:DISEASE'])
  assert.equal(catalog[0].label,'组织 / 科室')
  assert.equal(catalog[0].code,undefined)
})

test('维度并集包含多指标组件与指标组内各指标，并保留父组件筛选范围',()=>{
  const group={id:'质量指标组',type:'metric-group',config:{query:{ignoredGlobalFilterIds:['科室']},metricGroup:{items:[
    {id:'死亡率',sourceCode:'住院死亡率'},{id:'转科比例',sourceCode:'转科比例'}]}}}
  const multi={id:'对比',type:'chart',config:{indicatorBindings:[{sourceCode:'手术比例',indicatorVersionId:'101'},{sourceCode:'费用比例',indicatorVersionId:'102'}]}}
  const sources=dashboardFilterSourceWidgets([group,multi])
  assert.deepEqual(sources.map(x=>x.sourceCode),['住院死亡率','转科比例','手术比例','费用比例'])
  assert.deepEqual(sources.map(x=>x.filterOwnerId),['质量指标组','质量指标组','对比','对比'])
  assert.deepEqual(sources[0].config.query.ignoredGlobalFilterIds,['科室'])
  assert.equal(sources[3].config.analysisIndicatorVersionId,'102')
  assert.deepEqual(resolveCompatibleGlobalFilterWidgetIds(definitions[0],[group],()=>[dataset(fields)]),['质量指标组'])
})

for(const code of ['OUT_DEPT_CODE','入院科室','病区归属']) test(`逻辑科室编码准确传到指标绑定字段 ${code}`,()=>{
  const query=buildRemoteWidgetQuery(widget('死亡率'),{...context,fields:[field(code)]}).query
  assert.deepEqual(query.filters,{[code]:['12','17']})
  assert.deepEqual(query.widgetCodes,['死亡率'])
})

test('无组织路径的同名字段不接收科室条件，指定作用范围仍然生效',()=>{
  assert.equal(resolveGlobalFilterField(definitions[0],[{...field('科室'),filterDimensions:[]}]),undefined)
  const widgets=[widget('死亡率'),widget('转科比例'),widget('全院费用')]
  const compatible=resolveCompatibleGlobalFilterWidgetIds(definitions[0],widgets,w=>[dataset(w.id==='全院费用'?[]:fields)])
  assert.deepEqual(compatible,['死亡率','转科比例'])
  const scoped=applyGlobalFilterScope(widgets,definitions[0].id,['死亡率'],compatible)
  assert.deepEqual(buildRemoteWidgetQuery(scoped[1],{...context,fields}).query.filters,{})
  assert.deepEqual(buildRemoteWidgetQuery(scoped[0],{...context,fields}).query.filters,{'出院科室':['12','17']})
})

test('候选不包含普通字段、组合粒度单列、名称字段或未声明的医院根节点',()=>{
  const catalog=dashboardDimensionCatalog([dataset([field('科室编码'),{...field('科室名称'),filterDimensions:[]},
    {...field('年龄'),filterDimensions:[]},{...field('periodStart'),filterDimensions:[]}])])
  assert.deepEqual(catalog.map(x=>x.id),['organization:department'])
})

test('同一指标将一个逻辑维度绑定到多个不同字段时不猜测字段',()=>{
  assert.equal(resolveGlobalFilterField(definitions[0],[field('入院科室'),field('出院科室')]),undefined)
  assert.deepEqual(dashboardDimensionCatalog([dataset([field('入院科室'),field('出院科室')])]),[])
})

test('同名自定义维度不会跨路径传值，同一明确维度支持不同字段映射',()=>{
  const d={...definitions[0],field:'path:101:DISEASE'}
  const q=buildRemoteWidgetQuery(widget('手术比例'),{...context,definitions:[d],fields:[field('诊断','path:102:DISEASE')]}).query
  assert.deepEqual(q.filters,{})
  assert.equal(resolveGlobalFilterField(d,[field('疾病编码','path:101:DISEASE')]).code,'疾病编码')
})

test('已有筛选按真实路径元数据升级，保存后不再绑定具体字段且保留范围引用',()=>{
  const old={...definitions[0],id:'原科室筛选',field:'OUT_DEPT_CODE',label:'出院科室'}
  const datasets=[dataset([field('OUT_DEPT_CODE')])]
  const schema={id:'看板',name:'质量看板',layout:{columns:24},globalFilters:[old],widgets:[]}
  const payload=schemaToDashboardPayload(schema,{filterDatasets:datasets})
  assert.equal(payload.globalFilters[0].field,'organization:department')
  assert.equal(payload.globalFilters[0].id,'原科室筛选')
  assert.equal(payload.globalFilters[0].label,'科室')
  const restored=dashboardDetailToSchema({dashboard:{id:'1',name:'质量看板'},version:{...payload,widgets:[]}})
  assert.equal(restored.globalFilters[0].field,'organization:department')
  assert.equal(schema.globalFilters[0].field,'OUT_DEPT_CODE')
  assert.equal(normalizeGlobalFilterDimensions([old],[])[0].field,'OUT_DEPT_CODE')
})

test('级联候选按同一指标映射上游字段，缺失上游不能泄露不受限候选',()=>{
  const doctor={...definitions[0],id:'医生',field:'organization:doctor',dependsOn:[definitions[0].id]}
  const query=buildRemoteFilterOptionQuery(doctor,[...definitions,doctor],context.values,fields,{})
  assert.equal(query.fieldCode,'主治医生')
  assert.deepEqual(query.filters,{'出院科室':['12','17']})
  assert.throws(()=>buildRemoteFilterOptionQuery(doctor,[...definitions,doctor],context.values,[fields[1]],{}),/不支持上游/)
})

test('候选值请求使用组件固定指标版本，不回到该指标最新版本',async()=>{
  let received
  const runtime=createPlatformDashboardRuntime({fetchFilterOptions:async(source,query)=>{received={source,query};return []}})
  await runtime.filterOptions('住院死亡率',{config:{analysisIndicatorVersionId:'123456789012345678'}},{fieldCode:'出院科室',limit:500})
  assert.equal(received.query.indicatorVersionId,'123456789012345678')
})
