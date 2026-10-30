import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
const root=new URL('../src/idmp/',import.meta.url)
async function files(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(item=>item.isDirectory()?files(new URL(item.name+'/',dir)):[new URL(item.name,dir)]))).flat()}

test('production pages do not expose integration badges and development progress hints',async()=>{
 const forbidden=/后端联调|后端模板生命周期接口|直接调用 M1A|>真实接口<|status-label="接口数据"|>接口模式：|接口匹配模式：|大导出任务接口尚未接入|页面不会填充演示数据|发布接口已就绪|需核验 Hash|Clinical Light|Grid Columns|当前页面先展示后端返回/
 for(const file of await files(root)){
  if(!/\.(vue|js)$/.test(file.pathname)||file.pathname.endsWith('/DashboardGridPoc.vue'))continue
  const source=(await readFile(file,'utf8')).replace(/\/\*[\s\S]*?\*\//g,'')
  assert.doesNotMatch(source,forbidden,file.pathname)
 }
})
test('necessary persistence privacy and syntax constraints remain visible with advanced diagnostics separated',async()=>{
 const source=await readFile(new URL('views/IndicatorEditor.vue',root),'utf8')
 assert.match(source,/草稿政策来源仅保存在当前浏览器，发布后才正式保存/)
 assert.match(source,/<details v-if="workflowDebug.step && \$can/)
 const sqlImport=await readFile(new URL('views/SqlIndicatorImport.vue',root),'utf8')
 assert.match(sqlImport,/<summary>因子与指标 SQL 定义规范<\/summary>/)
 for(const heading of ['查询语句','统计查询','导入结果与指标公式','时间、分组与下钻','可选业务参数'])assert.ok(sqlImport.includes(`<h3>${heading}</h3>`),heading)
 for(const constraint of ['COUNT(*)','COUNT(DISTINCT','CTE 只是组织查询的写法','是否创建指标，不由 SQL 是否使用 CTE 决定','解析后会显示在动态传入参数列表中','未填写时，整段可选条件不参与筛选'])assert.ok(sqlImport.includes(constraint),constraint)
 assert.doesNotMatch(sqlImport,/须在运行参数中声明其名称和类型/)
 assert.doesNotMatch(sqlImport,/不使用冒号参数|<h3>指标定义<\/h3>|<h3>因子定义<\/h3>/)
 assert.match(await readFile(new URL('features/analysis/DrillExplorer.vue',root),'utf8'),/授权范围.*脱敏和审计/)
 for(const file of ['features/dashboard/components/WarningWidgetInspector.vue','features/dashboard/components/ComponentScopeInspector.vue']){
  const content=await readFile(new URL(file,root),'utf8')
  assert.match(content,/ResourceReferenceSelect/)
  assert.doesNotMatch(content,/场景版本 ID<input|指标版本 ID（可选）|预警规则 ID（可选）/)
 }
})
